// ═══════════════════════════════════════════════════════════════════════════
//  Translator.h  ·  Built-in page translation engine
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QString>
#include <QNetworkAccessManager>
#include <functional>

enum class TranslateProvider { LibreTranslate, DeepL, Google, Bing };

class Translator : public QObject {
    Q_OBJECT
public:
    static Translator& instance();

    void detectAndTranslatePage(class BrowserTab* tab, const QString& targetLang = "en");
    void translateText(const QString& text, const QString& from, const QString& to,
                       std::function<void(const QString&)> cb);
    void revertPage(class BrowserTab* tab);

    QString   detectedLanguage() const { return m_detected; }
    QStringList supportedLanguages() const;

    void setProvider(TranslateProvider p) { m_provider = p; }
    void setApiKey(const QString& k)      { m_apiKey = k; }

signals:
    void translationDone(int tabId, const QString& lang);
    void translationFailed(int tabId, const QString& err);

private:
    Translator() = default;
    QString buildUrl(const QString& text, const QString& from, const QString& to);
    QString           m_detected;
    TranslateProvider m_provider = TranslateProvider::LibreTranslate;
    QString           m_apiKey;
    QNetworkAccessManager m_nam;
};
