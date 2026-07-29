// ═══════════════════════════════════════════════════════════════════════════
//  Lumen Browser  ·  main.cpp  ·  Entry point
//  v1.0  ·  Chromium 120  ·  Qt 6.6  ·  C++20  ·  MIT License
// ═══════════════════════════════════════════════════════════════════════════
#include <QApplication>
#include <QSplashScreen>
#include <QPixmap>
#include <QFontDatabase>
#include <QSurfaceFormat>
#include <QDir>
#include "browser/core/LumenApp.h"
#include "browser/core/LumenConfig.h"
#include "performance/monitor/ResourceMonitor.h"
#include "security/sandbox/SandboxManager.h"
#include "ui/BrowserWindow.h"
#include "ui/onboarding/OnboardingWizard.h"
#include "include/cef_app.h"
#include <spdlog/spdlog.h>
#include <spdlog/sinks/rotating_file_sink.h>

static int RunCefSubprocess(int argc, char* argv[]) {
#if defined(OS_WIN)
    CefMainArgs args(GetModuleHandle(nullptr));
#else
    CefMainArgs args(argc, argv);
#endif
    auto app = CefRefPtr<LumenApp>(new LumenApp());
    return CefExecuteProcess(args, app, nullptr);
}

static void InitLogging() {
    QString dir = QDir::homePath() + "/.lumen/logs";
    QDir().mkpath(dir);
    auto sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
        (dir+"/lumen.log").toStdString(), 5*1024*1024, 3);
    spdlog::set_default_logger(std::make_shared<spdlog::logger>("lumen", sink));
    spdlog::set_level(spdlog::level::info);
    spdlog::info("Lumen v{} starting", LUMEN_VERSION);
}

static void ConfigureGL() {
    QSurfaceFormat fmt;
    fmt.setVersion(4, 6);
    fmt.setProfile(QSurfaceFormat::CoreProfile);
    fmt.setSwapBehavior(QSurfaceFormat::DoubleBuffer);
    fmt.setSamples(4);
    QSurfaceFormat::setDefaultFormat(fmt);
}

int main(int argc, char* argv[]) {
    int exit = RunCefSubprocess(argc, argv);
    if (exit >= 0) return exit;

    QApplication::setHighDpiScaleFactorRoundingPolicy(
        Qt::HighDpiScaleFactorRoundingPolicy::PassThrough);
    QApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
    QApplication::setAttribute(Qt::AA_UseHighDpiPixmaps);
    QApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    ConfigureGL();

    QApplication app(argc, argv);
    app.setApplicationName("Lumen");
    app.setApplicationVersion(LUMEN_VERSION);
    app.setOrganizationName("Lumen Browser");
    app.setWindowIcon(QIcon(":/assets/icons/lumen.png"));

    InitLogging();

    auto& cfg = LumenConfig::instance();
    cfg.load();

    SandboxManager sandbox;
    sandbox.initialise();

    // Splash
    QPixmap splash_px(":/assets/icons/lumen_256.png");
    QSplashScreen splash(splash_px.scaled(160,160,Qt::KeepAspectRatio,Qt::SmoothTransformation),
                         Qt::WindowStaysOnTopHint|Qt::FramelessWindowHint);
    splash.show();
    app.processEvents();

    ResourceMonitor::instance().start();

    // First launch → onboarding wizard
    if (cfg.isFirstLaunch()) {
        OnboardingWizard wiz;
        splash.finish(&wiz);
        wiz.exec();
        cfg.setFirstLaunch(false);
        cfg.save();
    }

    BrowserWindow win;
    splash.finish(&win);
    win.show();

    if (cfg.startupMode() == StartupMode::LastSession)
        win.restoreLastSession();
    else
        win.openNewTab(cfg.homePage());

    return app.exec();
}
