// ═══════════════════════════════════════════════════════════════════════════
//  ImportEngine.h  ·  Import data from Chrome, Edge, Firefox, Brave, Opera
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QString>
#include <QDateTime>
#include <vector>

enum class BrowserSource { Chrome, ChromiumEdge, Firefox, Brave, Opera, Vivaldi, Custom };

struct ImportedBookmark {
    QString title, url, folder;
    QDateTime added;
    QString favicon;
};

struct ImportedHistoryEntry {
    QString url, title;
    QDateTime visitTime;
    int visitCount;
};

struct ImportedPassword {
    QString origin, username, password;
    QDateTime saved;
};

struct ImportedExtension {
    QString id, name, version;
    bool enabled;
};

struct ImportResult {
    int bookmarks, history, passwords, extensions, settings;
    QStringList errors;
    QString sourceBrowser;
};

class ImportEngine : public QObject {
    Q_OBJECT
public:
    explicit ImportEngine(QObject* p = nullptr);

    QList<BrowserSource>    detectInstalled() const;
    QString                 profilePath(BrowserSource src) const;

    ImportResult importFrom(BrowserSource src,
        bool bm=true, bool hist=true, bool pass=true,
        bool ext=false, bool settings=false);

    QList<ImportedBookmark>     importedBookmarks()  const { return m_bm; }
    QList<ImportedHistoryEntry> importedHistory()    const { return m_hist; }
    QList<ImportedPassword>     importedPasswords()  const { return m_pass; }
    QList<ImportedExtension>    importedExtensions() const { return m_ext; }

signals:
    void progress(int pct);
    void importComplete(const ImportResult& r);
    void importError(const QString& msg);

private:
    ImportResult importChrome(const QString& path, bool bm, bool hist, bool pass, bool ext);
    ImportResult importFirefox(const QString& path, bool bm, bool hist, bool pass, bool ext);
    void         parseBookmarkJson(const nlohmann::json& node, const QString& folder,
                                   QList<ImportedBookmark>& out);
    QByteArray   decryptChromePassword(const QByteArray& encrypted);
    QList<ImportedBookmark>     m_bm;
    QList<ImportedHistoryEntry> m_hist;
    QList<ImportedPassword>     m_pass;
    QList<ImportedExtension>    m_ext;
};
