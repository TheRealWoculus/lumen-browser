// ═══════════════════════════════════════════════════════════════════════════
//  ScreenshotTool.h  ·  Capture visible, full-page, or region screenshots
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QRect>
#include <QPixmap>

enum class CaptureMode { Visible, FullPage, Region, Element };

class ScreenshotTool : public QObject {
    Q_OBJECT
public:
    static ScreenshotTool& instance();
    void capture(class BrowserTab* tab, CaptureMode mode = CaptureMode::Visible);
    void startRegionSelect(class BrowserTab* tab);
    void saveTo(const QPixmap& px, const QString& path, const QString& format = "PNG");
    void copyToClipboard(const QPixmap& px);
signals:
    void captured(const QPixmap& px);
    void saved(const QString& path);
private:
    ScreenshotTool() = default;
    QRect m_region;
};
