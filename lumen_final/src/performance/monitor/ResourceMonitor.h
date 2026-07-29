// ═══════════════════════════════════════════════════════════════════════════
//  ResourceMonitor.h  ·  Real-time CPU/RAM/GPU/Network/Battery tracking
// ═══════════════════════════════════════════════════════════════════════════
#pragma once
#include <QObject>
#include <QTimer>
#include <deque>
#include <vector>
#include <atomic>

struct SystemSnapshot {
    double   cpuPct       = 0;
    size_t   ramUsedMB    = 0;
    size_t   ramTotalMB   = 0;
    double   gpuPct       = 0;
    size_t   gpuVramMB    = 0;
    double   netRxMbps    = 0;
    double   netTxMbps    = 0;
    int      batteryPct   = -1;  // -1 = no battery
    bool     charging     = false;
    int64_t  tsMs         = 0;
};

struct TabResourceSnapshot {
    int    id; QString title;
    double cpuPct; size_t ramKB;
    bool   active, suspended, audible;
};

class ResourceMonitor : public QObject {
    Q_OBJECT
public:
    static ResourceMonitor& instance();
    void start(); void stop();

    SystemSnapshot                    current()       const;
    std::vector<SystemSnapshot>       history(int n=120) const;
    std::vector<TabResourceSnapshot>  tabSnapshots()  const;
    int                               pressure()      const { return m_pressure.load(); }

    void setGlobalRamLimit(int mb)  { m_ramLimit = mb; }
    void setGlobalCpuCap(int pct)   { m_cpuCap = pct; }
    void setPerTabRamLimit(int mb)  { m_tabRamLimit = mb; }

signals:
    void updated(const SystemSnapshot&);
    void tabsUpdated(const std::vector<TabResourceSnapshot>&);
    void pressureChanged(int level);   // 0=ok 1=warn 2=high 3=critical
    void ramLimitExceeded(size_t usedMB, size_t limitMB);
    void batteryLow(int pct);

private slots:
    void tick();

private:
    ResourceMonitor() = default;
    SystemSnapshot collect();
    int computePressure(const SystemSnapshot&);
    double readCpu(); size_t readRamMB(); double readGpu();
    double readNetRx(); double readNetTx();
    int readBattery(bool& charging);

    QTimer*  m_timer = nullptr;
    std::deque<SystemSnapshot> m_history;
    std::atomic<int> m_pressure{0};
    int m_ramLimit=0, m_cpuCap=0, m_tabRamLimit=0;
    uint64_t m_lastCpuIdle=0, m_lastCpuTotal=0;
    uint64_t m_lastRx=0, m_lastTx=0;
};
