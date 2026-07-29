// ═══════════════════════════════════════════════════════════════════════════
//  ReaderMode.h  ·  Clean reading experience powered by Readability.js
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QString>

enum class ReaderTheme  { Auto, Light, Sepia, Dark, HighContrast, Custom };
enum class ReaderFont   { System, Serif, SansSerif, Mono, OpenDyslexic };
enum class ReaderAlign  { Left, Justify };

struct ReaderConfig {
    ReaderTheme  theme       = ReaderTheme::Auto;
    ReaderFont   font        = ReaderFont::Serif;
    int          fontSize    = 20;
    int          lineHeight  = 175;  // percent
    int          colWidth    = 720;
    bool         tts         = false;
    float        ttsRate     = 1.0f;
    ReaderAlign  align       = ReaderAlign::Left;
    bool         showImages  = true;
    bool         showLinks   = true;
    QString      customBg    = "";
};

class BrowserTab;

class ReaderMode : public QObject {
    Q_OBJECT
public:
    static ReaderMode& instance();
    bool   eligible(const QString& url) const;
    void   activate(BrowserTab* tab);
    void   deactivate(BrowserTab* tab);
    void   speak(BrowserTab* tab, bool start);
    ReaderConfig& config() { return m_cfg; }
signals:
    void activated(int tabId); void deactivated(int tabId);
private:
    ReaderMode() = default;
    QString buildHtml(const QString& title, const QString& content, const QString& byline);
    ReaderConfig m_cfg;
};
