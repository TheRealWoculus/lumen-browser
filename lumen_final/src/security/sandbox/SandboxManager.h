// ═══════════════════════════════════════════════════════════════════════════
//  SandboxManager.h  ·  OS-level process isolation
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>

class SandboxManager : public QObject {
    Q_OBJECT
public:
    explicit SandboxManager(QObject* p = nullptr);
    void initialise();
    bool isSandboxed()   const { return m_sandboxed; }
    bool isLowIntegrity()const { return m_lowInteg; }
signals:
    void statusChanged(bool active);
private:
    void applyWindows(); void applyLinux();
    bool m_sandboxed = false, m_lowInteg = false;
};
