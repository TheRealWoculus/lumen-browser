// ═══════════════════════════════════════════════════════════════════════════
//  BrowserWindow.h  ·  Main application window
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QMainWindow>
#include <memory>

class TabManager;
class TabBar;
class AddressBar;
class ToolBar;
class PerformanceDashboard;
class SideBar;
class FindBar;
class BookmarkBar;
class SplitView;
class DownloadBar;
class NotificationManager;
class CommandPalette;

class BrowserWindow : public QMainWindow {
    Q_OBJECT
public:
    explicit BrowserWindow(QWidget* parent = nullptr);
    ~BrowserWindow();

    void openNewTab(const QString& url = {});
    void restoreLastSession();
    void applyTheme();
    void enterFocusMode(bool on);
    void enterGameMode(bool on);
    void enterBatterySaverMode(bool on);
    void showCommandPalette();
    void showPerformanceDashboard(bool show);
    void toggleSidebar();

protected:
    void closeEvent(QCloseEvent*) override;
    void keyPressEvent(QKeyEvent*) override;
    void mousePressEvent(QMouseEvent*) override;
    void mouseMoveEvent(QMouseEvent*) override;
    void mouseReleaseEvent(QMouseEvent*) override;

private slots:
    void onTabActivated(int id);
    void onTabClosed(int id);
    void onAddressSubmitted(const QString& input);
    void onNavigateBack(); void onNavigateForward();
    void onReload(); void onStop();
    void onZoomIn(); void onZoomOut(); void onResetZoom();
    void onOpenSettings(); void onDevTools();
    void onReaderMode(); void onTranslate();
    void onScreenshot(); void onPiP();
    void onFind(); void onPrint();
    void onSplitView();
    void onResourcePressure(int level);

private:
    void buildLayout();
    void buildMenuBar();
    void buildShortcuts();
    void updateAddressBar(const QString& url);
    void updateNavButtons();
    void updateTitle(const QString& t);
    QString resolveInput(const QString& input);
    void    navigateTo(const QString& url);

    std::unique_ptr<TabManager>        m_tabs;
    TabBar*           m_tabBar        = nullptr;
    AddressBar*       m_address       = nullptr;
    ToolBar*          m_toolbar       = nullptr;
    BookmarkBar*      m_bookmarkBar   = nullptr;
    SideBar*          m_sidebar       = nullptr;
    FindBar*          m_findBar       = nullptr;
    PerformanceDashboard* m_perfDash  = nullptr;
    DownloadBar*      m_dlBar         = nullptr;
    CommandPalette*   m_palette       = nullptr;
    QWidget*          m_content       = nullptr;
    bool              m_focusMode     = false;
    bool              m_gameMode      = false;
    bool              m_batteryMode   = false;
};
