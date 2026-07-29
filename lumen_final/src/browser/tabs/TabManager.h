// ═══════════════════════════════════════════════════════════════════════════
//  TabManager.h  ·  Full tab lifecycle + resource-aware scheduling
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QTimer>
#include <vector>
#include <memory>
#include <unordered_map>

class BrowserTab;

enum class TabState { Active, Background, Suspended, Hibernated, Loading, Crashed, Closing };
enum class TabType  { Normal, Private, PWA, Reader, Settings, DevTools, Cast };

struct TabGroup {
    int     id;
    QString name;
    QString color;  // hex
    bool    collapsed = false;
    std::vector<int> tabIds;
};

struct TabWorkspace {
    int     id;
    QString name;
    QString icon;
    std::vector<int> tabIds;
    bool    active = false;
};

class TabManager : public QObject {
    Q_OBJECT
public:
    explicit TabManager(QObject* parent = nullptr);
    ~TabManager();

    // Lifecycle
    BrowserTab* createTab(const QString& url = {}, bool background = false, TabType type = TabType::Normal);
    void        closeTab(int id);
    void        closeOthers(int id);
    void        closeToRight(int id);
    void        activateTab(int id);
    void        duplicateTab(int id);
    void        pinTab(int id, bool pinned);
    void        muteTab(int id, bool muted);
    void        moveTab(int fromIdx, int toIdx);
    void        moveTabToWindow(int id);

    // Suspension
    void        suspendTab(int id);
    void        hibernateTab(int id);  // deeper freeze, lose state
    void        resumeTab(int id);
    void        suspendAllBackground();
    void        wakeAllSuspended();

    // Tab Groups
    int         createGroup(const QString& name, const QString& color);
    void        addToGroup(int tabId, int groupId);
    void        removeFromGroup(int tabId);
    void        collapseGroup(int groupId, bool collapse);
    void        deleteGroup(int groupId);
    const std::vector<TabGroup>& groups() const { return m_groups; }

    // Workspaces
    int         createWorkspace(const QString& name);
    void        switchWorkspace(int id);
    void        addTabToWorkspace(int tabId, int wsId);
    const std::vector<TabWorkspace>& workspaces() const { return m_workspaces; }

    // Queries
    BrowserTab* activeTab()    const;
    BrowserTab* tabById(int id)const;
    int         tabCount()     const { return (int)m_tabs.size(); }
    int         activeIndex()  const { return m_activeIdx; }
    const std::vector<std::unique_ptr<BrowserTab>>& tabs() const { return m_tabs; }
    size_t      totalRamKB()   const;

    // Session
    void        saveSession(const QString& path) const;
    void        restoreSession(const QString& path);
    void        saveTabSnapshot(int id);

signals:
    void tabCreated(int id);
    void tabClosed(int id);
    void tabActivated(int id);
    void tabStateChanged(int id, TabState s);
    void tabTitleChanged(int id, const QString& title);
    void tabFaviconChanged(int id, const QIcon& icon);
    void tabLoadProgress(int id, int pct);
    void tabAudibleChanged(int id, bool audible);
    void tabMutedChanged(int id, bool muted);
    void tabCrashed(int id);
    void tabGroupChanged();
    void workspaceChanged(int id);
    void orderChanged();

private slots:
    void onSuspendTick();
    void onResourcePressure(int level);

private:
    void applyThrottling();
    int  newId();
    std::vector<std::unique_ptr<BrowserTab>> m_tabs;
    std::unordered_map<int, BrowserTab*>     m_map;
    std::vector<TabGroup>                    m_groups;
    std::vector<TabWorkspace>                m_workspaces;
    int  m_activeIdx = -1;
    int  m_nextId    = 1;
    QTimer* m_suspendTimer;
};
