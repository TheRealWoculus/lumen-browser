// ═══════════════════════════════════════════════════════════════════════════
//  AdBlocker.h  ·  Network-level ad/tracker blocking
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QSet>
#include <QString>
#include <vector>

enum class RuleType { Domain, Wildcard, Regex, ElementHide, CosmeticFilter };
enum class BlockCategory { Ad, Tracker, Mining, Social, Phishing, Malware, Custom };

struct BlockRule {
    RuleType      type;
    QString       pattern;
    QStringList   domains, excludes;
    bool          exception   = false;
    BlockCategory category    = BlockCategory::Ad;
};

struct BlockStats {
    uint64_t totalBlocked  = 0;
    uint64_t totalRequests = 0;
    uint64_t adsBlocked    = 0;
    uint64_t trackersBlocked = 0;
    uint64_t miningBlocked = 0;
    uint64_t bytesBlocked  = 0;
};

class AdBlocker : public QObject {
    Q_OBJECT
public:
    static AdBlocker& instance();
    void loadBuiltinLists();
    void loadCustomList(const QString& url);
    void reload();
    bool shouldBlock(const QString& url, const QString& origin, const QString& type);
    QStringList cosmeticFilters(const QString& host) const;
    void allowDomain(const QString& d);
    void blockDomain(const QString& d);
    BlockStats stats() const { return m_stats; }
    int  ruleCount()   const { return (int)m_rules.size(); }
    void resetStats()        { m_stats = {}; }
signals:
    void rulesLoaded(int count);
    void blocked(const QString& url);
private:
    AdBlocker() = default;
    bool matchRule(const BlockRule& r, const QString& url, const QString& origin);
    std::vector<BlockRule> m_rules;
    QSet<QString>  m_allowed, m_alwaysBlock;
    BlockStats     m_stats;
};
