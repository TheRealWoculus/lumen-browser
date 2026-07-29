// ═══════════════════════════════════════════════════════════════════════════
//  SyncEngine.h  ·  Optional E2EE cross-device sync
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QTimer>
#include <QDateTime>

enum class SyncStatus { Idle, Syncing, Error, Paused, Disabled };

class SyncEngine : public QObject {
    Q_OBJECT
public:
    static SyncEngine& instance();
    void  start(); void stop(); void syncNow();
    void  setCredentials(const QString& email, const QByteArray& passphrase);
    void  logout();
    SyncStatus status()   const { return m_status; }
    QDateTime  lastSync() const { return m_lastSync; }
    int        pendingCount() const { return m_pending; }
signals:
    void statusChanged(SyncStatus);
    void syncComplete(int items);
    void syncError(const QString& msg);
    void conflictDetected(const QString& key);
private slots:
    void doSync();
private:
    SyncEngine() = default;
    QByteArray deriveKey(const QByteArray& pass, const QByteArray& salt);
    QByteArray encrypt(const QByteArray& data);
    QByteArray decrypt(const QByteArray& data);
    SyncStatus m_status  = SyncStatus::Disabled;
    QTimer*    m_timer   = nullptr;
    QDateTime  m_lastSync;
    int        m_pending = 0;
    QByteArray m_key;
    QString    m_serverUrl;
};
