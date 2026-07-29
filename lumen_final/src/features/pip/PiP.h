// ═══════════════════════════════════════════════════════════════════════════
//  PiP.h  ·  Picture-in-Picture video float window
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QWidget>
#include <QWebEngineView>
#include <QLabel>
#include <memory>

class PiPWindow : public QWidget {
    Q_OBJECT
public:
    explicit PiPWindow(QWidget* parent = nullptr);
    void attachVideo(QWebEngineView* src, const QString& videoSelector);
    void setRatio(double r) { m_ratio = r; }
protected:
    void mousePressEvent(QMouseEvent*) override;
    void mouseMoveEvent(QMouseEvent*)  override;
    void mouseReleaseEvent(QMouseEvent*) override;
    void wheelEvent(QWheelEvent*)      override;
    void mouseDoubleClickEvent(QMouseEvent*) override;
    void paintEvent(QPaintEvent*)      override;
    void resizeEvent(QResizeEvent*)    override;
    void enterEvent(QEnterEvent*)      override;
    void leaveEvent(QEvent*)           override;
private:
    std::unique_ptr<QWebEngineView> m_view;
    QPoint  m_drag; bool m_dragging = false;
    double  m_ratio = 16.0/9.0;
    bool    m_hovered = false;
    QLabel* m_overlay;
};

class PiPManager : public QObject {
    Q_OBJECT
public:
    static PiPManager& instance();
    void enter(QWebEngineView* src, const QString& sel = "video");
    void exit();
    bool active() const { return m_win != nullptr; }
signals:
    void entered(); void exited();
private:
    PiPManager() = default;
    std::unique_ptr<PiPWindow> m_win;
};
