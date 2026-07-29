// ═══════════════════════════════════════════════════════════════════════════
//  GestureEngine.h  ·  Mouse, touch, and keyboard gesture navigation
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QPoint>
#include <QMap>
#include <functional>

enum class GestureAction {
    Back, Forward, Reload, Close, NewTab, NextTab, PrevTab,
    ScrollTop, ScrollBottom, ZoomIn, ZoomOut, ResetZoom,
    OpenInBackground, CloseOthers, Duplicate,
    Custom
};

struct GestureBinding {
    QString    pattern;   // e.g. "Right", "Up-Down", "RL"
    GestureAction action;
    QString    customScript;
};

class GestureEngine : public QObject {
    Q_OBJECT
public:
    static GestureEngine& instance();
    void enable(bool on)   { m_enabled = on; }
    bool enabled()   const { return m_enabled; }

    void setBindings(const QList<GestureBinding>& b) { m_bindings = b; }
    void loadDefaults();

    // Called by event filter
    void onMousePress(Qt::MouseButton btn, const QPoint& pos);
    void onMouseMove(const QPoint& pos);
    void onMouseRelease(Qt::MouseButton btn, const QPoint& pos);

    // Recognise and fire
    void recognise(const QString& pattern);

signals:
    void actionTriggered(GestureAction action);
    void customScriptTriggered(const QString& script);
    void gestureDrawn(const QList<QPoint>& path);

private:
    GestureEngine() = default;
    QString buildPattern(const QList<QPoint>& pts);
    bool         m_enabled    = true;
    bool         m_recording  = false;
    QList<QPoint> m_path;
    QList<GestureBinding> m_bindings;
};
