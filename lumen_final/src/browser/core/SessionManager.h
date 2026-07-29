// ═══════════════════════════════════════════════════════════════════════════
//  SessionManager.h  ·  Save/restore full browser sessions
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QString>
#include <QDateTime>
#include <vector>

struct SavedTab {
    QString  url, title;
    QByteArray favicon;
    int      scrollY = 0;
    bool     pinned  = false;
    int      groupId = -1;
    int      workspaceId = -1;
};

struct SavedSession {
    QString   name;
    QDateTime savedAt;
    std::vector<SavedTab> tabs;
    int       activeIndex = 0;
};

class SessionManager : public QObject {
    Q_OBJECT
public:
    static SessionManager& instance();
    void        autoSave();
    void        saveCurrent(const QString& name = {});
    SavedSession loadLast()  const;
    QList<SavedSession> allSessions() const;
    void        restore(const SavedSession& session);
    void        deleteSession(const QString& name);
    QString     sessionDir() const;
signals:
    void sessionSaved(const QString& name);
    void sessionRestored(const QString& name);
private:
    SessionManager() = default;
};
