(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let settings = {};
  let tabs = [];
  let activeTabId = null;
  let tabCounter = 0;
  let guestPreloadPath = '';
  let saveTimer = null;
  let firstRunDone = false;
  let adultModeActive = false;
  let recentlyClosed = [];
  let bookmarkState = {};
  let hibernationTimers = {};
  let settingsTabId = null;
  let tabStacksCollapsed = {};
  const aiHistory = [];
  let findOpen = false;
  let zoomLevel = 0;
  let activeDownloads = [];

  const SEARCH_URLS = {
    duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    lumen: null,
  };

  const VPN_REGIONS = {
    auto: { label: 'Automatic', host: '', port: '', mode: 'none' },
    america: { label: 'America', host: 'proxy-us.lumen.local', port: '1080', mode: 'socks5' },
    europe: { label: 'Europe', host: 'proxy-eu.lumen.local', port: '1080', mode: 'socks5' },
    korea: { label: 'Korea', host: 'proxy-kr.lumen.local', port: '1080', mode: 'socks5' },
    china: { label: 'China', host: 'proxy-cn.lumen.local', port: '1080', mode: 'socks5' },
    russia: { label: 'Russia', host: 'proxy-ru.lumen.local', port: '1080', mode: 'socks5' },
    south_america: { label: 'South America', host: 'proxy-sa.lumen.local', port: '1080', mode: 'socks5' },
  };

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    if (typeof Motion !== 'undefined') {
      Motion.animate(el, { opacity: [0, 1], y: [10, 0] }, { duration: 0.2, easing: 'ease-out' });
    }
    setTimeout(() => {
      if (typeof Motion !== 'undefined') {
        Motion.animate(el, { opacity: 0 }, { duration: 0.2, onComplete: () => el.classList.add('hidden') });
      } else {
        el.classList.add('hidden');
      }
    }, 2800);
  }

  function applyTheme(s) {
    document.documentElement.style.setProperty('--accent', s.accent || '#7C3AED');
    document.documentElement.style.setProperty('--accent2', s.accentSecondary || '#06B6D4');
    adultModeActive = !!s.adultMode;
  }

  function newTabId() { tabCounter += 1; return `tab-${tabCounter}`; }

  let splitMode = false;
  let splitTabIds = [];

  function newTabUrl() {
    const wp = settings.wallpaper ? encodeURIComponent(settings.wallpaper) : '';
    const q = new URLSearchParams({ accent: settings.accent || '#7C3AED', accent2: settings.accentSecondary || '#06B6D4', wpMode: settings.wallpaperMode || 'cover' });
    if (wp) q.set('wallpaper', wp);
    return `file://${location.pathname.replace(/index\.html$/, '')}newtab.html?${q}`;
  }

  function settingsUrl() {
    return `file://${location.pathname.replace(/index\.html$/, '')}index.html?settings`;
  }

  function isUrl(str) {
    if (/^https?:\/\//i.test(str)) return true;
    if (/^[\w-]+(\.[\w-]+)+/.test(str) && !str.includes(' ')) return true;
    if (str.startsWith('lumen://')) return true;
    if (str.startsWith('file://')) return true;
    return false;
  }

  function normalizeInput(input) {
    const raw = input.trim();
    if (!raw) return settings.homePage || newTabUrl();
    if (raw === 'lumen://newtab' || raw === 'lumen://home') return newTabUrl();
    if (raw === 'lumen://docs') return null;
    if (raw.startsWith('lumen://')) return newTabUrl();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.includes(' ') || (!raw.includes('.') && !raw.includes(':'))) return null;
    return raw.startsWith('//') ? `https:${raw}` : `https://${raw}`;
  }

  async function resolveNavigation(input) {
    const raw = input.trim();
    if (raw === 'lumen://docs') { const p = await window.lumen.resolvePath('lumen_browser.html'); return `file://${p}`; }
    const url = normalizeInput(input);
    if (url) return url;
    const engine = settings.defaultSearch || 'duckduckgo';
    if (engine === 'lumen' && settings.lumenSearchEnabled) {
      const results = await window.lumen.lumenSearch(input);
      if (results?.length) return `data:text/html;charset=utf-8,${encodeURIComponent(buildLumenResultsPage(input, results))}`;
      toast('Lumen Search: no local results yet — indexing in background…');
    }
    const fn = SEARCH_URLS[engine] || SEARCH_URLS.duckduckgo;
    return fn(input);
  }

  function buildLumenResultsPage(query, results) {
    const items = results.map((r) => `<li><a href="${escapeHtml(r.url)}">${escapeHtml(r.title || r.url)}</a><p>${escapeHtml((r.snippet || '').replace(/<[^>]+>/g, ''))}</p></li>`).join('');
    return `<html><head><meta charset="utf-8"><title>Lumen Search</title><style>body{font-family:Inter,system-ui;background:#07070e;color:#cacade;padding:32px;max-width:720px;margin:0 auto}h1{font-size:20px;color:#f2f2ff}ul{list-style:none;padding:0}li{margin:20px 0;padding-bottom:16px;border-bottom:1px solid #1e1e30}a{color:#b78dff;font-size:16px;text-decoration:none}p{font-size:13px;color:#8888a8;margin-top:6px}</style></head><body><h1>Lumen Search · ${escapeHtml(query)}</h1><ul>${items}</ul></body></html>`;
  }

  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function getActiveTab() { return tabs.find((t) => t.id === activeTabId); }
  function getActiveWebview() { const tab = getActiveTab(); return tab ? document.getElementById(`wv-${tab.id}`) : null; }

  async function updateBookmarkState() {
    const active = getActiveTab();
    if (!active || !active.url || active.url.startsWith('lumen://') || active.url.startsWith('file://') || active.url.startsWith('about:')) { $('#btn-bookmark').classList.remove('on'); return; }
    const isBm = await window.lumen.checkBookmark(active.url);
    $('#btn-bookmark').classList.toggle('on', isBm);
  }

  async function toggleBookmark() {
    const active = getActiveTab();
    if (!active || !active.url || active.url.startsWith('lumen://')) return;
    const isBm = await window.lumen.checkBookmark(active.url);
    if (isBm) { await window.lumen.removeBookmark(active.url); toast('Bookmark removed'); }
    else { await window.lumen.addBookmark({ url: active.url, title: active.title }); toast('Bookmark added'); }
    updateBookmarkState();
  }

  function toggleFindBar() {
    const bar = $('#find-bar');
    findOpen = !findOpen;
    bar.classList.toggle('hidden', !findOpen);
    if (findOpen) {
      $('#find-input').value = '';
      $('#find-input').focus();
      $('#find-results').textContent = '';
    } else {
      getActiveWebview()?.stopFindInPage('clearSelection');
    }
  }

  function doFind() {
    const wv = getActiveWebview();
    if (!wv) return;
    const query = $('#find-input').value;
    if (!query) { wv.stopFindInPage('clearSelection'); $('#find-results').textContent = ''; return; }
    wv.findInPage(query, { forward: true, findNext: true });
  }

  let findReqId = null;
  function bindFind(wv) {
    wv.addEventListener('found-in-page', (e) => {
      if (e.result.activeMatchOrdinal !== undefined) {
        findReqId = e.result.requestId;
        $('#find-results').textContent = `${e.result.activeMatchOrdinal || 0}/${e.result.matches || 0}`;
      }
    });
  }

  function doFindNext(forward) {
    const wv = getActiveWebview();
    if (!wv) return;
    const query = $('#find-input').value;
    if (!query) return;
    wv.findInPage(query, { forward, findNext: true });
  }

  function setZoom(delta) {
    const wv = getActiveWebview();
    if (!wv) return;
    zoomLevel = Math.max(-5, Math.min(5, zoomLevel + delta));
    wv.setZoomLevel(zoomLevel);
    const pct = Math.round(100 * Math.pow(1.2, zoomLevel));
    $('#zoom-indicator').textContent = `${pct}%`;
    $('#zoom-indicator').classList.remove('hidden');
    clearTimeout(window._zoomTimer);
    window._zoomTimer = setTimeout(() => $('#zoom-indicator').classList.add('hidden'), 2000);
  }

  function resetZoom() {
    const wv = getActiveWebview();
    if (!wv) return;
    zoomLevel = 0;
    wv.setZoomLevel(0);
    $('#zoom-indicator').classList.add('hidden');
  }

  function toggleDevTools() {
    const wv = getActiveWebview();
    if (!wv) return;
    if (wv.isDevToolsOpened()) wv.closeDevTools();
    else wv.openDevTools();
  }

  function toggleSplitView() {
    splitMode = !splitMode;
    $('#btn-split').classList.toggle('on', splitMode);
    if (splitMode) {
      if (tabs.length < 2) { toast('Open at least 2 tabs for split view'); splitMode = false; $('#btn-split').classList.remove('on'); return; }
      const active = getActiveTab();
      const others = tabs.filter((t) => t.id !== activeTabId);
      splitTabIds = [activeTabId, others[0].id];
      applySplitLayout();
      toast('Split view: showing 2 tabs');
    } else {
      splitTabIds = [];
      applySplitLayout();
    }
  }

  function applySplitLayout() {
    if (splitMode && splitTabIds.length === 2) {
      document.body.classList.add('split-mode');
      const p1 = document.getElementById(`pane-${splitTabIds[0]}`);
      const p2 = document.getElementById(`pane-${splitTabIds[1]}`);
      $$('.webview-pane').forEach((p) => { p.classList.remove('active'); p.classList.remove('split-left'); p.classList.remove('split-right'); });
      if (p1) { p1.classList.add('split-left'); p1.classList.add('active'); }
      if (p2) { p2.classList.add('split-right'); p2.classList.add('active'); }
    } else {
      document.body.classList.remove('split-mode');
      $$('.webview-pane').forEach((p) => { p.classList.remove('split-left'); p.classList.remove('split-right'); });
      const active = getActiveTab();
      if (active) {
        const pane = document.getElementById(`pane-${active.id}`);
        if (pane) pane.classList.add('active');
      }
    }
  }

  function openSettingsTab(panel) {
    if (settingsTabId) {
      const existing = tabs.find((t) => t.id === settingsTabId);
      if (existing) {
        switchTab(settingsTabId);
        if (panel) showSettingsPanel(panel);
        return;
      }
      settingsTabId = null;
    }
    const url = panel ? `lumen://settings:${panel}` : 'lumen://settings';
    const tab = createTab(url);
    settingsTabId = tab.id;
  }

  function closeSettingsTab() {
    if (settingsTabId) {
      closeTab(settingsTabId);
      settingsTabId = null;
    }
    $('#settings-panel').classList.add('hidden');
    $('#webview-stack').classList.remove('hidden');
  }

  function showSettingsPanel(panel) {
    loadSettings();
    $$('.snav').forEach((b) => b.classList.remove('on'));
    $$('.spanel').forEach((p) => p.classList.remove('on'));
    if (panel) {
      const navBtn = [...$$('.snav')].find((b) => b.dataset.panel === panel);
      if (navBtn) { navBtn.classList.add('on'); document.getElementById(`panel-${panel}`)?.classList.add('on'); }
      if (panel === 'history') refreshHistoryList();
      if (panel === 'downloads') refreshDownloadsList();
      if (panel === 'vpn') setupProxyUI();
    }
  }

  function pinCurrentToSidebar() {
    const tab = getActiveTab();
    if (!tab || !tab.url || tab.url.startsWith('lumen://') || tab.url.startsWith('about:')) { toast('Cannot pin this page'); return; }
    let pinned = JSON.parse(localStorage.getItem('lumen_pinned_sites') || '[]');
    if (pinned.find((p) => p.url === tab.url)) { toast('Already pinned'); return; }
    pinned.unshift({ url: tab.url, title: tab.title || tab.url, time: Date.now() });
    if (pinned.length > 20) pinned.length = 20;
    localStorage.setItem('lumen_pinned_sites', JSON.stringify(pinned));
    renderPinnedSites();
    toast('Pinned to sidebar');
  }

  function unpinFromSidebar(url) {
    let pinned = JSON.parse(localStorage.getItem('lumen_pinned_sites') || '[]');
    pinned = pinned.filter((p) => p.url !== url);
    localStorage.setItem('lumen_pinned_sites', JSON.stringify(pinned));
    renderPinnedSites();
  }

  function renderPinnedSites() {
    const container = $('#pinned-sites-list');
    if (!container) return;
    const pinned = JSON.parse(localStorage.getItem('lumen_pinned_sites') || '[]');
    if (pinned.length === 0) { container.innerHTML = '<p class="muted" style="padding:12px;text-align:center">No pinned sites.<br>Right-click a page → Pin to sidebar</p>'; return; }
    container.innerHTML = pinned.map((p, i) => `<div class="pinned-site" data-idx="${i}">
      <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(p.url).hostname)}&sz=32" alt="" class="pinned-fav" onerror="this.style.display='none'">
      <span class="pinned-title">${escapeHtml(p.title)}</span>
      <button class="pinned-rm" data-url="${escapeHtml(p.url)}"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`).join('');
    container.querySelectorAll('.pinned-site').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.pinned-rm')) return;
        const idx = parseInt(el.dataset.idx, 10);
        const site = pinned[idx];
        if (site) openInSidebar(site.url, site.title);
      });
    });
    container.querySelectorAll('.pinned-rm').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); unpinFromSidebar(btn.dataset.url); });
    });
  }

  function openInSidebar(url, title) {
    const wv = $('#sidebar-webview');
    const wrap = $('#sidebar-webview-wrap');
    wrap.classList.remove('hidden');
    $('#sidebar-wv-title').textContent = title || url;
    wv.src = url;
  }

  function closeSidebarWebview() {
    const wv = $('#sidebar-webview');
    const wrap = $('#sidebar-webview-wrap');
    wv.src = 'about:blank';
    wrap.classList.add('hidden');
  }

  function getGroupColor(group) {
    const groupColors = ['#7C3AED','#06B6D4','#10B981','#F59E0B','#EF4444','#EC4899','#8B5CF6','#F97316'];
    const groups = [...new Set(tabs.filter(t=>t.group).map(t=>t.group))];
    const idx = groups.indexOf(group);
    return groupColors[idx % groupColors.length];
  }

  function renderTabs() {
    const strip = $('#tabstrip');
    strip.innerHTML = '';
    const pinned = tabs.filter((t) => t.pinned);
    const unpinned = tabs.filter((t) => !t.pinned);

    // Render pinned tabs first
    for (const tab of pinned) {
      const isActive = tab.id === activeTabId;
      const el = document.createElement('div');
      el.className = `tab${isActive ? ' active' : ''} pinned`;
      el.dataset.id = tab.id;
      const iconHtml = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>';
      const titleHtml = `<span class="tab-title">${escapeHtml(tab.title || 'Tab')}</span>`;
      el.innerHTML = iconHtml + titleHtml;
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabContextMenu(tab, e.clientX, e.clientY); });
      el.addEventListener('click', (e) => { switchTab(tab.id); });
      strip.appendChild(el);
    }

    // Group unpinned tabs by their group
    const groups = {};
    const ungrouped = [];
    for (const tab of unpinned) {
      if (tab.group) {
        if (!groups[tab.group]) groups[tab.group] = [];
        groups[tab.group].push(tab);
      } else {
        ungrouped.push(tab);
      }
    }

    // Render each group as a stack
    const groupNames = Object.keys(groups);
    for (const gName of groupNames) {
      const gTabs = groups[gName];
      const isCollapsed = tabStacksCollapsed[gName];
      const color = getGroupColor(gName);

      const stack = document.createElement('div');
      stack.className = 'tab-stack';
      stack.dataset.group = gName;

      // Stack header
      const header = document.createElement('div');
      header.className = 'tab-stack-header';
      header.style.borderLeft = `2px solid ${color}`;
      const hasActive = gTabs.some((t) => t.id === activeTabId);
      if (hasActive) header.classList.add('has-active');
      header.innerHTML = `
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="stack-chevron" style="transform:rotate(${isCollapsed ? '0' : '90'}deg)"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="stack-name">${escapeHtml(gName)}</span>
        <span class="stack-count">${gTabs.length}</span>
      `;
      header.addEventListener('click', () => {
        tabStacksCollapsed[gName] = !isCollapsed;
        if (typeof Motion !== 'undefined' && !isCollapsed) {
          // Animate collapse
          const body = stack.querySelectorAll('.tab-in-stack');
          Motion.animate(body, { opacity: [1, 0], height: ['auto', 0] }, { duration: 0.12, onComplete: () => renderTabs() });
        } else {
          renderTabs();
        }
      });
      stack.appendChild(header);

      // Stack body (tabs)
      if (!isCollapsed) {
        for (const tab of gTabs) {
          const isActive = tab.id === activeTabId;
          const isHibernated = tab.hibernated;
          const el = document.createElement('div');
          el.className = `tab${isActive ? ' active' : ''}${isHibernated ? ' hibernated' : ''} tab-in-stack`;
          el.dataset.id = tab.id;
          let iconHtml = '';
          if (isHibernated) {
            iconHtml = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
          }
          const hibernateBtn = `<button class="tab-hibernate" type="button" title="Hibernate tab"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>`;
          const titleHtml = `<span class="tab-title">${escapeHtml(tab.title || 'Tab')}</span>`;
          const closeHtml = `<button class="tab-close" type="button"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
          el.innerHTML = iconHtml + titleHtml + hibernateBtn + closeHtml;
          el.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabContextMenu(tab, e.clientX, e.clientY); });
          el.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) closeTab(tab.id);
            else if (e.target.closest('.tab-hibernate')) { e.stopPropagation(); toggleHibernateTab(tab.id); }
            else switchTab(tab.id);
          });
          stack.appendChild(el);
        }
      }

      strip.appendChild(stack);
    }

    // Render ungrouped tabs
    for (const tab of ungrouped) {
      const isSettings = (tab.url && tab.url.startsWith('lumen://settings')) || tab.urlDisplay === 'lumen://settings';
      const isActive = tab.id === activeTabId;
      const isHibernated = tab.hibernated;
      const el = document.createElement('div');
      el.className = `tab${isActive ? ' active' : ''}${isHibernated ? ' hibernated' : ''}${isSettings ? ' settings-tab' : ''}`;
      el.dataset.id = tab.id;
      let iconHtml = '';
      if (isSettings) {
        iconHtml = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
      } else if (isHibernated) {
        iconHtml = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      }
      const hibernateBtn = isHibernated || isSettings ? '' : `<button class="tab-hibernate" type="button" title="Hibernate tab"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>`;
      const titleHtml = `<span class="tab-title">${escapeHtml(tab.title || 'Tab')}</span>`;
      const closeHtml = `<button class="tab-close" type="button"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      el.innerHTML = iconHtml + titleHtml + hibernateBtn + closeHtml;
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabContextMenu(tab, e.clientX, e.clientY); });
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) closeTab(tab.id);
        else if (e.target.closest('.tab-hibernate')) { e.stopPropagation(); toggleHibernateTab(tab.id); }
        else switchTab(tab.id);
      });
      strip.appendChild(el);
    }

    const add = document.createElement('button');
    add.className = 'tab-new';
    add.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    add.title = 'New tab';
    add.addEventListener('click', () => createTab(settings.homePage || 'lumen://newtab'));
    strip.appendChild(add);
  }

  function showTabContextMenu(tab, x, y) {
    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    const items = [
      { label: tab.pinned ? 'Unpin tab' : 'Pin tab', action: () => togglePinTab(tab.id) },
      { label: tab.hibernated ? 'Restore tab' : 'Hibernate tab', action: () => toggleHibernateTab(tab.id) },
      { type: 'sep' },
      { label: tab.group ? 'Remove from group' : 'Add to group', action: () => { if (tab.group) removeTabFromGroup(tab.id); else promptTabGroup(tab.id); } },
      { type: 'sep' },
      { label: 'Duplicate tab', action: () => createTab(tab.url || 'lumen://newtab') },
      { label: 'Close tab', action: () => closeTab(tab.id) },
      { label: 'Close other tabs', action: () => { tabs.filter(t=>t.id!==tab.id).forEach(t=>closeTab(t.id)); } },
    ];
    items.forEach((item) => {
      if (item.type === 'sep') { const d = document.createElement('div'); d.className = 'ctx-sep'; menu.appendChild(d); return; }
      const el = document.createElement('button');
      el.className = 'ctx-item';
      el.textContent = item.label;
      el.addEventListener('click', () => { item.action(); menu.remove(); });
      menu.appendChild(el);
    });
    document.body.appendChild(menu);
    const close = (e) => { if (!menu.contains(e.target)) menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  function togglePinTab(id) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.pinned = !tab.pinned;
    if (tab.pinned) { tab.hibernated = false; delete hibernationTimers[id]; delete tab.__hibernatedUrl; }
    renderTabs(); scheduleTabSave();
  }

  function toggleHibernateTab(id) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.hibernated) {
      const url = tab.__hibernatedUrl || tab.url || 'lumen://newtab';
      tab.hibernated = false;
      delete tab.__hibernatedUrl;
      const wv = document.getElementById(`wv-${tab.id}`);
      if (wv) {
        wv.style.display = '';
        wv.src = url;
        tab.url = url;
        tab.urlDisplay = url;
      }
      if (tab.id === activeTabId) {
        $('#omnibox').value = tab.urlDisplay || url;
      }
      renderTabs();
      scheduleTabSave();
      toast(`Tab restored: ${tab.title}`);
    } else {
      if (tab.pinned) { toast('Cannot hibernate a pinned tab'); return; }
      const wv = document.getElementById(`wv-${tab.id}`);
      const currentUrl = wv ? wv.getURL() : (tab.url || 'lumen://newtab');
      tab.__hibernatedUrl = currentUrl;
      tab.hibernated = true;
      tab.urlDisplay = currentUrl;
      if (wv) {
        wv.src = 'about:blank';
        wv.style.display = 'none';
      }
      renderTabs();
      scheduleTabSave();
      toast(`Tab hibernated: ${tab.title}`);
    }
  }

  function hibernateBackgroundTabs() {
    tabs.filter((t) => t.id !== activeTabId && !t.pinned && !t.hibernated).forEach((t) => toggleHibernateTab(t.id));
    toast('Background tabs hibernated');
  }

  function promptTabGroup(id) {
    const group = prompt('Enter group name:');
    if (group && group.trim()) {
      const tab = tabs.find((t) => t.id === id);
      if (tab) tab.group = group.trim();
      renderTabs(); scheduleTabSave();
    }
  }

  function removeTabFromGroup(id) {
    const tab = tabs.find((t) => t.id === id);
    if (tab) { tab.group = null; renderTabs(); scheduleTabSave(); }
  }

  function switchTab(id) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.hibernated) toggleHibernateTab(id);
    activeTabId = id;

    // Show/hide settings panel when switching to/from settings tab
    const isSettingsTab = tab.url && tab.url.startsWith('lumen://settings');
    if (isSettingsTab) {
      $('#settings-panel').classList.remove('hidden');
      $('#webview-stack').classList.add('hidden');
      document.body.classList.add('settings-mode');
      if (typeof Motion !== 'undefined') {
        Motion.animate($('#settings-panel'), { opacity: [0, 1], scale: [0.98, 1] }, { duration: 0.15, easing: 'ease-out' });
      }
      loadSettings();
      if (tab.url.startsWith('lumen://settings:')) {
        const panel = tab.url.split(':')[1];
        showSettingsPanel(panel);
      }
    } else {
      $('#settings-panel').classList.add('hidden');
      $('#webview-stack').classList.remove('hidden');
      document.body.classList.remove('settings-mode');
    }

    $$('.webview-pane').forEach((p) => p.classList.remove('active'));
    $$('.tab').forEach((t) => t.classList.remove('active'));
    const pane = document.getElementById(`pane-${id}`);
    if (pane) pane.classList.add('active');
    const tabEl = $(`.tab[data-id="${id}"]`);
    if (tabEl) tabEl.classList.add('active');
    if (tab) { $('#omnibox').value = tab.urlDisplay || tab.url; updateNavButtons(); }
    renderTabs(); updateBookmarkState();
    if (findOpen && $('#find-input').value) {
      setTimeout(() => doFind(), 200);
    }
  }

  function closeTab(id) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const closed = { ...tabs[idx] };
    delete closed.__hibernatedUrl;
    recentlyClosed.unshift(closed);
    if (recentlyClosed.length > 10) recentlyClosed.length = 10;
    delete hibernationTimers[id];
    const pane = document.getElementById(`pane-${id}`);
    const wv = document.getElementById(`wv-${id}`);
    pane?.remove(); wv?.remove();
    tabs.splice(idx, 1);
    if (id === settingsTabId) {
      settingsTabId = null;
      $('#settings-panel').classList.add('hidden');
      $('#webview-stack').classList.remove('hidden');
      document.body.classList.remove('settings-mode');
    }
    if (tabs.length === 0) { createTab('lumen://newtab'); return; }
    if (activeTabId === id) switchTab(tabs[Math.max(0, idx - 1)].id);
    else renderTabs();
    scheduleTabSave();
  }

  function reopenClosedTab() {
    if (recentlyClosed.length === 0) { toast('No recently closed tabs'); return; }
    const tab = recentlyClosed.shift();
    createTab(tab.__hibernatedUrl || tab.url || 'lumen://newtab');
    toast('Tab reopened');
  }

  function createTab(urlInput) {
    const id = newTabId();
    const isSettings = typeof urlInput === 'string' && urlInput.startsWith('lumen://settings');
    const tab = { id, title: isSettings ? 'Settings' : 'New Tab', url: '', urlDisplay: isSettings ? urlInput : 'lumen://newtab', pinned: false, hibernated: false, group: null };
    tabs.push(tab);
    activeTabId = id;
    const pane = document.createElement('div');
    pane.className = 'webview-pane active';
    pane.id = `pane-${id}`;
    const wv = document.createElement('webview');
    wv.id = `wv-${id}`;
    wv.setAttribute('partition', 'persist:lumen');
    wv.setAttribute('allowpopups', 'true');
    if (guestPreloadPath) wv.setAttribute('preload', guestPreloadPath);
    if (adultModeActive) wv.addEventListener('will-navigate', (e) => checkBlockNavigation(e, tab));
    wv.addEventListener('ipc-message', (e) => { if (e.channel === 'lumen-navigate') navigateTab(tab, e.args[0]); });
    wv.src = 'about:blank';
    pane.appendChild(wv);
    $('#webview-stack').appendChild(pane);
    $$('.webview-pane').forEach((p) => { if (p.id !== `pane-${id}`) p.classList.remove('active'); });
    bindWebview(wv, tab);
    renderTabs();
    navigateTab(tab, urlInput);
    return tab;
  }

  async function checkBlockNavigation(e, tab) {
    const blocked = await window.lumen.checkAdult(e.url);
    if (blocked) { e.preventDefault(); showBlockedPage(tab, e.url); }
  }

  function showBlockedPage(tab, url) {
    const pane = document.getElementById(`pane-${tab.id}`);
    if (!pane) return;
    if (pane.querySelector('.blocked-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'blocked-overlay';
    overlay.innerHTML = `<div class="icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div><h2>Content Blocked</h2><p>This site has been blocked by <strong>18+ Mode</strong>.<br>${escapeHtml(url)}</p><p style="margin-top:12px;font-size:12px;color:var(--t3)">You can disable this in Settings -> Privacy</p>`;
    pane.appendChild(overlay);
  }

  function bindWebview(wv, tab) {
    wv.addEventListener('did-start-loading', () => { tab.title = 'Loading…'; if (tab.id === activeTabId) renderTabs(); });
    wv.addEventListener('did-stop-loading', () => { if (tab.id === activeTabId) updateNavButtons(); });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode !== -3 && e.validatedURL && e.validatedURL !== 'about:blank') {
        toast(`Navigation failed: ${e.errorDescription || 'Unknown error'} (${e.validatedURL})`);
      }
    });
    wv.addEventListener('page-title-updated', (e) => { if (e.title) tab.title = e.title.slice(0, 48); if (tab.id === activeTabId) renderTabs(); });
    wv.addEventListener('did-navigate', (e) => {
      tab.url = e.url;
      tab.urlDisplay = e.url.startsWith('data:') ? 'lumen://search' : e.url.includes('newtab.html') ? 'lumen://newtab' : e.url;
      if (tab.id === activeTabId) { $('#omnibox').value = tab.urlDisplay; updateNavButtons(); updateBookmarkState(); }
      const blocked = document.getElementById(`pane-${tab.id}`)?.querySelector('.blocked-overlay');
      if (blocked) blocked.remove();
      const idx = tabs.findIndex((t) => t.id === tab.id);
      if (idx >= 0) tabs[idx] = tab;
      scheduleTabSave();
      if (e.url && e.url.startsWith('http')) {
        window.lumen.addHistory({ url: e.url, title: tab.title });
        window.lumen.addBrowserHistory({ url: e.url, title: tab.title });
      }
    });
    wv.addEventListener('did-navigate-in-page', (e) => { tab.url = e.url; if (tab.id === activeTabId) $('#omnibox').value = e.url.includes('newtab.html') ? 'lumen://newtab' : e.url; });
    wv.addEventListener('new-window', (e) => { e.preventDefault(); createTab(e.url); });
    bindFind(wv);
  }

  async function navigateTab(tab, input) {
    if (typeof input === 'string' && input.startsWith('lumen://settings')) {
      const panel = input.includes(':') ? input.split(':')[1] : null;
      tab.title = 'Settings';
      tab.url = input;
      tab.urlDisplay = input;
      $('#omnibox').value = input;
      settingsTabId = tab.id;
      $('#settings-panel').classList.remove('hidden');
      $('#webview-stack').classList.add('hidden');
      document.body.classList.add('settings-mode');
      loadSettings();
      if (panel) showSettingsPanel(panel);
      else {
        $$('.snav').forEach((b) => b.classList.remove('on'));
        $$('.spanel').forEach((p) => p.classList.remove('on'));
        const firstNav = $$('.snav')[0];
        if (firstNav) { firstNav.classList.add('on'); document.getElementById(`panel-${firstNav.dataset.panel}`)?.classList.add('on'); }
      }
      renderTabs();
      return;
    }
    const wv = document.getElementById(`wv-${tab.id}`);
    if (!wv) return;
    let target = await resolveNavigation(input);
    if (adultModeActive && target) {
      const blocked = await window.lumen.checkAdult(target);
      if (blocked) {
        wv.src = 'about:blank';
        const pane = document.getElementById(`pane-${tab.id}`);
        if (pane && !pane.querySelector('.blocked-overlay')) {
          const overlay = document.createElement('div');
          overlay.className = 'blocked-overlay';
          overlay.innerHTML = `<div class="icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div><h2>Content Blocked</h2><p>This site has been blocked by <strong>18+ Mode</strong>.<br>${escapeHtml(target)}</p><p style="margin-top:12px;font-size:12px;color:var(--t3)">You can disable this in Settings -> Privacy</p>`;
          pane.appendChild(overlay);
        }
        return;
      }
    }
    tab.url = target;
    tab.urlDisplay = input === 'lumen://newtab' || (target && target.includes('newtab.html')) ? 'lumen://newtab' : typeof input === 'string' && target && !target.startsWith('data:') ? input : target ? target.slice(0, 80) : input;
    wv.src = target;
    if (tab.id === activeTabId) $('#omnibox').value = tab.urlDisplay;
  }

  function updateNavButtons() {
    const wv = getActiveWebview();
    if (!wv) return;
    try { $('#btn-back').disabled = !wv.canGoBack(); $('#btn-fwd').disabled = !wv.canGoForward(); }
    catch { $('#btn-back').disabled = true; $('#btn-fwd').disabled = true; }
  }

  function scheduleTabSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const data = tabs.map((t) => ({ url: t.url, title: t.title, urlDisplay: t.urlDisplay, pinned: !!t.pinned, hibernated: !!t.hibernated, group: t.group || null }));
      try { await window.lumen.saveTabs(data); } catch {}
    }, 2000);
  }

  async function loadSavedTabs() {
    try {
      const saved = await window.lumen.loadTabs();
      if (saved && saved.length > 0) {
        // Filter out settings tabs (they should not persist)
        const filtered = saved.filter((t) => !t.url || !t.url.startsWith('lumen://settings'));
        if (filtered.length === 0) return false;
        for (const t of filtered) {
          const id = newTabId();
          const tab = { id, title: t.title || 'New Tab', url: t.url || '', urlDisplay: t.urlDisplay || 'lumen://newtab', pinned: !!t.pinned, hibernated: !!t.hibernated, group: t.group || null };
          if (tab.hibernated) tab.__hibernatedUrl = t.url;
          tabs.push(tab);
          activeTabId = id;
          const pane = document.createElement('div');
          pane.className = `webview-pane${tab.hibernated ? '' : ' active'}`;
          pane.id = `pane-${id}`;
          const wv = document.createElement('webview');
          wv.id = `wv-${id}`;
          wv.setAttribute('partition', 'persist:lumen');
          wv.setAttribute('allowpopups', 'true');
          if (guestPreloadPath) wv.setAttribute('preload', guestPreloadPath);
          if (adultModeActive) wv.addEventListener('will-navigate', (e) => checkBlockNavigation(e, tab));
          wv.addEventListener('ipc-message', (e) => { if (e.channel === 'lumen-navigate') navigateTab(tab, e.args[0]); });
          wv.src = tab.hibernated ? 'about:blank' : (tab.url || 'about:blank');
          if (tab.hibernated) wv.style.display = 'none';
          pane.appendChild(wv);
          $('#webview-stack').appendChild(pane);
          bindWebview(wv, tab);
        }
        renderTabs();
        if (filtered.length > 0) switchTab(tabs[0].id);
        return true;
      }
    } catch {}
    return false;
  }

  function setupOmnibox() {
    const input = $('#omnibox');
    const dd = $('#omnibox-dropdown');
    let selectedIdx = -1;
    let currentResults = [];
    function closeDropdown() { dd.classList.add('hidden'); selectedIdx = -1; currentResults = []; }
    async function buildResults(query) {
      const results = [];
      const bookmarks = await window.lumen.getBookmarks();
      if (!query.trim()) {
        const history = await window.lumen.getHistory();
        results.push(...history.slice(0, 5).map((h) => ({ type: 'history', title: h.title || 'Unknown', url: h.url, time: h.time })));
        results.push(...bookmarks.slice(0, 3).map((bm) => ({ type: 'bookmark', title: bm.title || bm.url, url: bm.url })));
      } else {
        results.push({ type: 'search', title: `Search for "${query}"`, url: null, query });
        const history = await window.lumen.getHistory();
        const filtered = history.filter((h) => (h.title || '').toLowerCase().includes(query.toLowerCase()) || h.url.toLowerCase().includes(query.toLowerCase())).slice(0, 3);
        filtered.forEach((h) => results.push({ type: 'history', title: h.title || 'Unknown', url: h.url, time: h.time }));
        const bmFiltered = bookmarks.filter((bm) => (bm.title || '').toLowerCase().includes(query.toLowerCase()) || bm.url.toLowerCase().includes(query.toLowerCase())).slice(0, 2);
        bmFiltered.forEach((bm) => results.push({ type: 'bookmark', title: bm.title || bm.url, url: bm.url }));
      }
      return results;
    }
    function renderDropdown(results) {
      dd.innerHTML = '';
      if (results.length === 0) { dd.innerHTML = '<div class="omni-item" style="color:var(--t3);cursor:default;justify-content:center">No results</div>'; return; }
      results.forEach((r, i) => {
        const item = document.createElement('div');
        item.className = `omni-item${i === selectedIdx ? ' hl' : ''}`;
        item.dataset.idx = i;
        if (r.type === 'search') {
          item.innerHTML = `<span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><div class="text"><div class="title">${escapeHtml(r.title)}</div></div><span class="tag search">SEARCH</span>`;
        } else if (r.type === 'bookmark') {
          item.innerHTML = `<span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span><div class="text"><div class="title">${escapeHtml(r.title)}</div><div class="url">${escapeHtml(r.url)}</div></div><span class="tag bookmark">BOOKMARK</span>`;
        } else {
          const timeStr = r.time ? new Date(r.time).toLocaleString() : '';
          item.innerHTML = `<span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span><div class="text"><div class="title">${escapeHtml(r.title || r.url)}</div><div class="url">${escapeHtml(r.url)}${timeStr ? ' · ' + timeStr : ''}</div></div><span class="tag history">HISTORY</span>`;
        }
        item.addEventListener('click', () => { closeDropdown(); const tab = getActiveTab(); if (tab) navigateTab(tab, r.url || r.query); });
        dd.appendChild(item);
      });
    }
    input.addEventListener('focus', async () => { currentResults = await buildResults(input.value); renderDropdown(currentResults); dd.classList.remove('hidden'); });
    input.addEventListener('input', async () => { selectedIdx = -1; currentResults = await buildResults(input.value); renderDropdown(currentResults); dd.classList.remove('hidden'); });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, currentResults.length - 1); renderDropdown(currentResults); const hl = dd.querySelector('.omni-item.hl'); hl?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, -1); renderDropdown(currentResults); }
      else if (e.key === 'Enter') {
        if (selectedIdx >= 0 && currentResults[selectedIdx]) { e.preventDefault(); const r = currentResults[selectedIdx]; closeDropdown(); const tab = getActiveTab(); if (tab) navigateTab(tab, r.url || r.query); }
        else closeDropdown();
      }
      else if (e.key === 'Escape') closeDropdown();
    });
    input.addEventListener('blur', () => { setTimeout(closeDropdown, 200); });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod && e.key === 'F12') { e.preventDefault(); toggleDevTools(); return; }
      if (!mod && e.key === 'Escape' && findOpen) { toggleFindBar(); return; }
      if (!mod) return;
      if (e.shiftKey) {
        if (e.key === 'T') { e.preventDefault(); reopenClosedTab(); return; }
        if (e.key === 'B') { e.preventDefault(); openBookmarkManager(); return; }
        if (e.key === 'I') { e.preventDefault(); toggleDevTools(); return; }
        if (e.key === 'J') { e.preventDefault(); toast('Console: open DevTools (F12 / Ctrl+Shift+I)'); return; }
        if (e.key === 'S') { e.preventDefault(); toggleSplitView(); return; }
        if (e.key === 'Tab') { e.preventDefault(); const idx = tabs.findIndex((t) => t.id === activeTabId); if (idx > 0) switchTab(tabs[idx - 1].id); return; }
      }
      if (e.key === 'Tab') { e.preventDefault(); const idx = tabs.findIndex((t) => t.id === activeTabId); if (idx < tabs.length - 1) switchTab(tabs[idx + 1].id); else if (tabs.length > 0) switchTab(tabs[0].id); return; }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); createTab(settings.homePage || 'lumen://newtab'); }
      else if (e.key === 'w' || e.key === 'W') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); $('#omnibox').focus(); $('#omnibox').select(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFindBar(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); getActiveWebview()?.reload(); }
      else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); toggleBookmark(); }
      else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); openHistoryPanel(); }
      else if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(1); }
      else if (e.key === '-') { e.preventDefault(); setZoom(-1); }
      else if (e.key === '0') { e.preventDefault(); resetZoom(); }
      else if (e.key === ',') { e.preventDefault(); openSettingsTab(); }
      else if (e.key >= '1' && e.key <= '8') { e.preventDefault(); const idx = parseInt(e.key) - 1; if (tabs[idx]) switchTab(tabs[idx].id); }
      else if (e.key === '9') { e.preventDefault(); if (tabs.length > 0) switchTab(tabs[tabs.length - 1].id); }
    });
  }

  function openBookmarkManager() {
    openSettingsTab('bookmarks');
  }

  function openHistoryPanel() {
    openSettingsTab('history');
  }

  function openDownloadsPanel() {
    openSettingsTab('downloads');
  }

  function setupToolbar() {
    $('#btn-back').addEventListener('click', () => getActiveWebview()?.goBack());
    $('#btn-fwd').addEventListener('click', () => getActiveWebview()?.goForward());
    $('#btn-reload').addEventListener('click', () => getActiveWebview()?.reload());
    $('#btn-home').addEventListener('click', () => { const tab = getActiveTab(); if (tab) navigateTab(tab, settings.homePage || 'lumen://newtab'); });
    $('#btn-bookmark').addEventListener('click', toggleBookmark);
    $('#btn-downloads').addEventListener('click', openDownloadsPanel);
    $('#omnibox').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const tab = getActiveTab(); if (tab) navigateTab(tab, e.target.value); $('#omnibox-dropdown').classList.add('hidden'); }
    });
  }

  function setupTitlebar() {
    if (window.lumen.platform === 'darwin') document.body.classList.add('platform-darwin');
    $('#btn-close').addEventListener('click', async () => { scheduleTabSave(); await new Promise((r) => setTimeout(r, 100)); window.lumen.windowClose(); });
    $('#btn-min').addEventListener('click', () => window.lumen.windowMinimize());
    $('#btn-max').addEventListener('click', () => window.lumen.windowMaximize());
  }

  function setupSidebar() {
    $('#btn-sidebar').addEventListener('click', () => {
      const side = $('#ai-sidebar'); const open = side.classList.toggle('hidden');
      $('#btn-sidebar').classList.toggle('active', !open); settings.sidebarOpen = !open;
    });
    $('#ai-close').addEventListener('click', () => { $('#ai-sidebar').classList.add('hidden'); $('#btn-sidebar').classList.remove('active'); });
    $('#ai-send').addEventListener('click', sendAi);
    $('#ai-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAi(); } });
  }

  function setupLeftSidebar() {
    renderPinnedSites();
    $('#btn-left-sidebar').addEventListener('click', () => {
      $('#left-sidebar').classList.toggle('hidden');
    });
    $('#ls-close').addEventListener('click', () => $('#left-sidebar').classList.add('hidden'));
    $('#sidebar-wv-close').addEventListener('click', closeSidebarWebview);
    $('#sidebar-wv-back').addEventListener('click', () => { $('#sidebar-webview').goBack(); });
    $('body').addEventListener('click', (e) => {
      if (!e.target.closest('#btn-left-sidebar') && !e.target.closest('#left-sidebar') && !$('#left-sidebar')?.classList.contains('hidden')) {
        const target = e.target;
        if (target.closest('.pin-to-sidebar')) return;
      }
    });
    // Right-click context menu for pinning
    document.addEventListener('contextmenu', (e) => {
      const wvPane = e.target.closest('.webview-pane');
      if (!wvPane) return;
      const existing = document.querySelector('.pin-to-sidebar');
      if (existing) existing.remove();
      const menu = document.createElement('div');
      menu.className = 'pin-to-sidebar';
      menu.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg> Pin to sidebar';
      menu.style.cssText = 'position:fixed;z-index:99999;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,0.4);';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.addEventListener('click', (ev) => { ev.stopPropagation(); pinCurrentToSidebar(); menu.remove(); });
      document.body.appendChild(menu);
      const rm = () => { if (menu.parentNode) menu.remove(); document.removeEventListener('click', rm); };
      setTimeout(() => { document.addEventListener('click', rm); }, 10);
    });
  }

  function appendAiMsg(role, content) { const div = document.createElement('div'); div.className = `ai-msg ${role}`; div.textContent = content; $('#ai-messages').appendChild(div); div.scrollIntoView({ behavior: 'smooth' }); }

  async function sendAi() {
    const input = $('#ai-input'); const text = input.value.trim();
    if (!text) return;
    input.value = ''; appendAiMsg('user', text); aiHistory.push({ role: 'user', content: text });
    appendAiMsg('assistant', '...');
    const pending = $('#ai-messages').lastElementChild;
    const reply = await window.lumen.aiChat({ messages: aiHistory, apiKey: settings.aiApiKey, provider: settings.aiProvider || 'anthropic' });
    pending.textContent = reply.content; aiHistory.push(reply);
  }

  function setupWelcome() {
    if (!settings.firstRun) return;
    const overlay = document.createElement('div'); overlay.className = 'welcome-overlay'; overlay.id = 'welcome-overlay';
    let step = 0; const steps = ['theme', 'perf', 'finish'];
    const headHtml = `<div class="welcome-head"><h1>Welcome to <span>Lumen</span></h1><p>Let's get your browser set up just right.</p></div>`;
    const footHtml = `<div class="welcome-foot"><span class="step-indicator" id="wiz-step">Step 1 of 3</span><div class="welcome-btns"><button class="welcome-btn back" id="wiz-back" style="display:none">Back</button><button class="welcome-btn next" id="wiz-next">Next</button></div></div>`;
    const perfSettings = { maxRam: 0, limitGpu: false, limitNetwork: false, limitCpu: false, adultMode: false };
    function renderStep(s) {
      const body = overlay.querySelector('.welcome-body'); const backBtn = overlay.querySelector('#wiz-back'); const nextBtn = overlay.querySelector('#wiz-next'); const indicator = overlay.querySelector('#wiz-step');
      indicator.textContent = `Step ${s + 1} of ${steps.length}`; backBtn.style.display = s === 0 ? 'none' : '';
      if (s === 0) {
        body.innerHTML = `<div class="welcome-step on"><h3>Choose your theme</h3><p>Pick a visual style for your browser. You can change this anytime in Settings.</p><div class="welcome-options"><div class="welcome-opt sel" data-theme="dark"><div class="opt-ic"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></div><div class="opt-t">Dark Mode</div><div class="opt-d">Easy on the eyes, great for low-light environments.</div></div><div class="welcome-opt" data-theme="light"><div class="opt-ic"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="5.64"/></svg></div><div class="opt-t">Light Mode</div><div class="opt-d">Clean and bright, perfect for daytime browsing.</div></div></div></div>`;
        body.querySelectorAll('.welcome-opt').forEach((el) => { el.addEventListener('click', () => { body.querySelectorAll('.welcome-opt').forEach((o) => o.classList.remove('sel')); el.classList.add('sel'); }); });
      } else if (s === 1) {
        body.innerHTML = `<div class="welcome-step on"><h3>Performance & Safety</h3><p>Set limits to control resource usage. You can tune these later.</p><div class="welcome-sliders"><div class="welcome-slider"><label>Max RAM <span class="val" id="ram-val">Unlimited</span></label><input type="range" id="wiz-ram" min="0" max="16384" step="256" value="0"></div><div class="toggle-card"><div><strong>Limit GPU acceleration</strong><p>Save power on integrated GPUs.</p></div><label class="switch"><input type="checkbox" id="wiz-gpu"><span class="slider"></span></label></div><div class="toggle-card"><div><strong>Limit network bandwidth</strong><p>Reduce background data usage.</p></div><label class="switch"><input type="checkbox" id="wiz-network"><span class="slider"></span></label></div><div class="toggle-card"><div><strong>18+ Mode</strong><p>Block adult websites and NSFW content.</p></div><label class="switch"><input type="checkbox" id="wiz-adult"><span class="slider"></span></label></div></div></div>`;
        const ramSlider = body.querySelector('#wiz-ram'); const ramVal = body.querySelector('#ram-val');
        ramSlider.addEventListener('input', () => { const v = parseInt(ramSlider.value, 10); ramVal.textContent = v === 0 ? 'Unlimited' : `${v} MB`; perfSettings.maxRam = v; });
        body.querySelector('#wiz-gpu').addEventListener('change', (e) => { perfSettings.limitGpu = e.target.checked; });
        body.querySelector('#wiz-network').addEventListener('change', (e) => { perfSettings.limitNetwork = e.target.checked; });
        body.querySelector('#wiz-adult').addEventListener('change', (e) => { perfSettings.adultMode = e.target.checked; });
      } else if (s === 2) {
        body.innerHTML = `<div class="welcome-step on" style="text-align:center;padding:20px 0"><div style="margin-bottom:14px"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"><path d="M12 3l1.36 4.18L18 5l-2.36 4.82L18 14l-4.64-2.18L12 16l-1.36-4.18L6 14l2.36-4.82L6 5l4.64 1.82z"/><path d="M5 20l3-3"/><path d="M16 17l3 3"/><path d="M10 19l2 2"/></svg></div><h3>You're all set!</h3><p>Your Lumen browser is ready to go. Click <strong>Finish</strong> to start browsing.</p><p style="margin-top:8px;font-size:12px;color:var(--t3)">You can always change these settings later from the Settings menu.</p></div>`;
        nextBtn.textContent = 'Finish';
      }
    }
    overlay.innerHTML = headHtml + '<div class="welcome-body"></div>' + footHtml;
    document.body.appendChild(overlay); renderStep(0);
    overlay.querySelector('#wiz-next').addEventListener('click', async () => {
      if (step === 0) { const sel = overlay.querySelector('.welcome-opt.sel'); if (sel) { const theme = sel.dataset.theme || 'dark'; settings.accent = '#7C3AED'; settings.accentSecondary = '#06B6D4'; settings.theme = theme; applyTheme(settings); } }
      else if (step === 1) { settings.maxRam = perfSettings.maxRam; settings.limitGpu = perfSettings.limitGpu; settings.limitNetwork = perfSettings.limitNetwork; settings.limitCpu = perfSettings.limitCpu; settings.adultMode = perfSettings.adultMode; adultModeActive = perfSettings.adultMode; applyTheme(settings); }
      else if (step === 2) { settings.firstRun = false; const partial = { ...settings }; partial.savedTabs = []; await window.lumen.setSettings(partial); settings = await window.lumen.getSettings(); overlay.remove(); firstRunDone = true; return; }
      step++; renderStep(step);
    });
    overlay.querySelector('#wiz-back').addEventListener('click', () => { step--; renderStep(step); });
  }

  async function refreshHistoryList() {
    const container = $('#history-list');
    if (!container) return;
    try {
      const history = await window.lumen.getBrowserHistory();
      if (history.length === 0) { container.innerHTML = '<p class="muted">No browsing history yet.</p>'; return; }
      container.innerHTML = history.map((h) => {
        const timeStr = h.time ? new Date(h.time).toLocaleString() : '';
        return `<div class="pw-item" style="cursor:pointer"><div class="info"><div class="site">${escapeHtml(h.title || h.url)}</div><div class="creds">${escapeHtml(h.url)} · ${timeStr}</div></div></div>`;
      }).join('');
      container.querySelectorAll('.pw-item').forEach((el, i) => {
        el.addEventListener('click', () => {
          const entry = history[i];
          if (entry && entry.url) {
            const tab = getActiveTab();
            if (tab) navigateTab(tab, entry.url);
            $('#settings-dialog').close();
          }
        });
      });
    } catch {}
  }

  async function refreshDownloadsList() {
    const container = $('#downloads-list');
    if (!container) return;
    try {
      const dl = await window.lumen.getDownloads();
      activeDownloads = dl || [];
      if (activeDownloads.length === 0) { container.innerHTML = '<p class="muted">No downloads yet.</p>'; return; }
      container.innerHTML = activeDownloads.map((d) => {
        const pct = d.total > 0 ? Math.round((d.received / d.total) * 100) : 0;
        const stateIcon = d.state === 'done' ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' :
          d.state === 'failed' ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' :
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        return `<div class="pw-item"><div class="info"><div class="site">${escapeHtml(d.name)}</div><div class="creds">${d.state === 'progressing' ? `${pct}% · ${(d.received / 1024 / 1024).toFixed(1)} MB / ${(d.total / 1024 / 1024).toFixed(1)} MB` : d.state === 'done' ? 'Complete' : d.state === 'failed' ? 'Failed' : d.state}</div></div>${stateIcon}</div>`;
      }).join('');
    } catch {}
  }

  async function refreshPasswordList() {
    const container = $('#password-list'); const empty = $('#password-empty');
    if (!container) return;
    const passwords = await window.lumen.getPasswords();
    if (passwords.length === 0) { container.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    container.innerHTML = passwords.map((p, i) => `<div class="pw-item"><div class="info"><div class="site">${escapeHtml(p.url)}</div><div class="creds">${escapeHtml(p.username)} · ${'•'.repeat(p.password?.length || 8)}</div></div><button class="del-btn" data-idx="${i}" title="Delete"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`).join('');
    container.querySelectorAll('.del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => { const idx = parseInt(btn.dataset.idx, 10); const p = passwords[idx]; if (p) { await window.lumen.deletePassword(p.url, p.username); await refreshPasswordList(); } });
    });
  }

  async function refreshBookmarkList() {
    const container = $('#bookmark-list'); const empty = $('#bookmark-empty');
    if (!container) return;
    const bookmarks = await window.lumen.getBookmarks();
    if (bookmarks.length === 0) { container.innerHTML = ''; if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    container.innerHTML = bookmarks.map((bm, i) => `<div class="pw-item" style="cursor:pointer"><div class="info"><div class="site">${escapeHtml(bm.url)}</div><div class="creds">${escapeHtml(bm.title || '')}</div></div><button class="del-btn" data-idx="${i}" title="Remove"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`).join('');
    container.querySelectorAll('.pw-item').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.del-btn')) return;
        const bm = bookmarks[i];
        if (bm && bm.url) {
          const tab = getActiveTab();
          if (tab) navigateTab(tab, bm.url);
          $('#settings-dialog').close();
        }
      });
    });
    container.querySelectorAll('.del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => { const idx = parseInt(btn.dataset.idx, 10); const bm = bookmarks[idx]; if (bm) { await window.lumen.removeBookmark(bm.url); await refreshBookmarkList(); updateBookmarkState(); } });
    });
  }

  async function refreshExtensionList() {
    const container = $('#extension-list'); const empty = $('#extension-empty');
    if (!container) return;
    const exts = await window.lumen.getExtensions();
    if (exts.length === 0) { container.innerHTML = ''; if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    container.innerHTML = exts.map((ext, i) => `<div class="pw-item"><div class="info"><div class="site">${escapeHtml(ext.name)}</div><div class="creds">v${escapeHtml(ext.version)} · ${escapeHtml(ext.id)}</div></div><button class="del-btn" data-idx="${i}" title="Remove"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`).join('');
    container.querySelectorAll('.del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => { const idx = parseInt(btn.dataset.idx, 10); const ext = exts[idx]; if (ext) { await window.lumen.removeExtension(ext.id); await refreshExtensionList(); } });
    });
  }

  async function setupProxyUI() {
    const proxyConfig = await window.lumen.getProxy();
    $('#set-proxy-enabled').checked = !!proxyConfig.enabled;
    $('#set-proxy-region').value = settings.proxyRegion || 'auto';
    $('#set-proxy-host').value = proxyConfig.host || '';
    $('#set-proxy-port').value = proxyConfig.port || '';
    $('#set-proxy-user').value = proxyConfig.username || '';
    $('#set-proxy-pass').value = proxyConfig.password || '';
    updateProxyFields();
  }

  function updateProxyFields() {
    const region = $('#set-proxy-region').value;
    const isManual = region === 'manual';
    $('#proxy-manual-fields').classList.toggle('hidden', !isManual);
    if (region !== 'manual' && region !== 'auto' && region !== 'none') {
      const reg = VPN_REGIONS[region];
      if (reg) {
        $('#set-proxy-host').value = reg.host;
        $('#set-proxy-port').value = reg.port;
      }
    }
  }

  async function applyProxySettings() {
    const enabled = $('#set-proxy-enabled').checked;
    const region = $('#set-proxy-region').value;
    let host = '', port = '', mode = 'socks5', username = '', password = '';
    if (enabled && region !== 'none') {
      if (region === 'manual') {
        host = $('#set-proxy-host').value;
        port = $('#set-proxy-port').value;
        username = $('#set-proxy-user').value;
        password = $('#set-proxy-pass').value;
      } else if (region !== 'auto') {
        const reg = VPN_REGIONS[region];
        if (reg) {
          host = reg.host;
          port = reg.port;
          mode = reg.mode;
        }
      }
      if (!host || !port) {
        toast('Enter proxy host and port or select a region');
        return false;
      }
    }
    const result = await window.lumen.setProxy({ enabled, mode, host, port, username, password });
    if (result.success) {
      settings.proxyRegion = region;
      settings.proxyEnabled = enabled;
      settings.proxyHost = host;
      settings.proxyPort = port;
      settings.proxyUsername = username;
      settings.proxyPassword = password;
      toast(enabled ? `Proxy enabled (${region})` : 'Proxy disabled');
    }
    return result.success;
  }

  async function handleClearBrowsingData() {
    const opts = {
      cache: $('#clear-cache').checked,
      cookies: $('#clear-cookies').checked,
      history: $('#clear-history-chk').checked,
      downloads: $('#clear-downloads-chk').checked,
    };
    if (!opts.cache && !opts.cookies && !opts.history && !opts.downloads) {
      toast('Select at least one item to clear');
      return;
    }
    const result = await window.lumen.clearBrowsingData(opts);
    if (result.success) {
      toast('Browsing data cleared');
      refreshDownloadsList();
      refreshHistoryList();
    } else {
      toast('Error clearing data: ' + (result.error || 'unknown'));
    }
  }

  function setupSettings() {
    $('#btn-settings').addEventListener('click', () => { openSettingsTab(); });
    // Animate settings gear icon on hover with anime.js
    const settingsBtn = $('#btn-settings');
    settingsBtn.addEventListener('mouseenter', () => {
      if (typeof anime !== 'undefined') {
        anime({ targets: settingsBtn.querySelector('svg'), rotate: 90, duration: 400, easing: 'easeOutElastic(1, .5)' });
      }
    });
    settingsBtn.addEventListener('mouseleave', () => {
      if (typeof anime !== 'undefined') {
        anime({ targets: settingsBtn.querySelector('svg'), rotate: 0, duration: 300, easing: 'easeOutCubic' });
      }
    });
    $('#settings-close').addEventListener('click', () => closeSettingsTab());
    $$('.snav').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.snav').forEach((b) => b.classList.remove('on'));
        $$('.spanel').forEach((p) => p.classList.remove('on'));
        btn.classList.add('on');
        const panel = $(`#panel-${btn.dataset.panel}`);
        if (panel) panel.classList.add('on');
        if (btn.dataset.panel === 'history') refreshHistoryList();
        if (btn.dataset.panel === 'downloads') refreshDownloadsList();
        if (btn.dataset.panel === 'vpn') setupProxyUI();
      });
    });
    $('#btn-pick-wallpaper').addEventListener('click', async () => { const path = await window.lumen.pickWallpaper(); if (path) $('#set-wallpaper').value = path; });
    $('#set-ai-provider').addEventListener('change', (e) => updateAiProviderUI(e.target.value));
    $('#btn-pick-model').addEventListener('click', async () => { const p = await window.lumen.pickLocalModel(); if (p) $('#set-local-model').value = p; });
    $('#btn-load-model').addEventListener('click', async () => {
      const modelPath = $('#set-local-model').value;
      if (!modelPath) { toast('Choose a .gguf or .bin file first'); return; }
      $('#local-model-status').textContent = 'Model: loading...';
      try { await window.lumen.loadLocalModel({ modelPath, contextSize: parseInt($('#set-local-ctx').value, 10) || 4096 }); toast('Local model loaded'); await refreshLocalAiStatus(); }
      catch (err) { toast(err.message || 'Load failed'); await refreshLocalAiStatus(); }
    });
    $('#btn-unload-model').addEventListener('click', async () => { await window.lumen.unloadLocalModel(); toast('Model unloaded'); await refreshLocalAiStatus(); });
    $('#btn-clear-history').addEventListener('click', async () => { await window.lumen.clearHistory(); toast('Search history cleared'); });
    $('#btn-load-extension').addEventListener('click', async () => {
      const dir = await window.lumen.pickExtensionDir();
      if (!dir) return;
      const result = await window.lumen.loadExtension(dir);
      if (result.success) { toast(`Extension loaded: ${result.name}`); await refreshExtensionList(); }
      else toast(`Failed: ${result.error}`);
    });
    $('#btn-hibernate-all').addEventListener('click', hibernateBackgroundTabs);
    $('#btn-import-bookmarks').addEventListener('click', async () => {
      const result = await window.lumen.importBookmarks();
      if (result.success) { toast(`Imported ${result.count} bookmarks`); await refreshBookmarkList(); }
      else toast(result.error || 'Import failed');
    });
    $('#btn-export-bookmarks').addEventListener('click', async () => {
      const result = await window.lumen.exportBookmarks();
      if (result.success) toast('Bookmarks exported');
      else toast(result.error || 'Export failed');
    });
    $('#btn-add-bookmark').addEventListener('click', async () => {
      const name = $('#bm-add-name').value.trim();
      const url = $('#bm-add-url').value.trim();
      if (!name || !url) { toast('Enter both name and URL'); return; }
      const existing = await window.lumen.getBookmarks();
      if (existing.some((b) => b.url === url)) { toast('Bookmark already exists'); return; }
      await window.lumen.addBookmark({ name, url });
      $('#bm-add-name').value = ''; $('#bm-add-url').value = '';
      await refreshBookmarkList(); toast('Bookmark added');
    });
    $('#set-proxy-region').addEventListener('change', updateProxyFields);
    $('#btn-apply-proxy').addEventListener('click', applyProxySettings);
    $('#btn-clear-browsing-data').addEventListener('click', handleClearBrowsingData);
    $('#btn-clear-browser-history').addEventListener('click', async () => { await window.lumen.clearBrowserHistory(); toast('Browsing history cleared'); refreshHistoryList(); });
    $('#btn-clear-downloads').addEventListener('click', async () => { await window.lumen.clearDownloads(); activeDownloads = []; refreshDownloadsList(); toast('Downloads list cleared'); });

    $('#find-prev').addEventListener('click', () => doFindNext(false));
    $('#find-next').addEventListener('click', () => doFindNext(true));
    $('#find-input').addEventListener('input', doFind);
    $('#find-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doFindNext(!e.shiftKey); }
      else if (e.key === 'Escape') toggleFindBar();
    });
    $('#find-close').addEventListener('click', toggleFindBar);

    $('#settings-save').addEventListener('click', async () => {
      const partial = {
        accent: $('#set-accent').value, accentSecondary: $('#set-accent2').value,
        wallpaper: $('#set-wallpaper').value, wallpaperMode: $('#set-wallpaper-mode').value,
        defaultSearch: $('#set-default-search').value, lumenSearchEnabled: $('#set-lumen-search').checked,
        aiApiKey: $('#set-ai-key').value, aiProvider: $('#set-ai-provider').value,
        localModelPath: $('#set-local-model').value, localContextSize: parseInt($('#set-local-ctx').value, 10) || 4096,
        homePage: $('#set-home').value, theme: $('#set-theme').value,
        maxRam: parseInt($('#set-max-ram').value, 10) || 0,
        limitGpu: $('#set-limit-gpu').checked, limitNetwork: $('#set-limit-network').checked, limitCpu: $('#set-limit-cpu').checked,
        adultMode: $('#set-adult-mode').checked,
        adBlockEnabled: $('#set-adblock').checked,
        searchSuggestions: $('#set-search-suggest').checked,
        defaultLanguage: $('#set-language').value, toolbarStyle: $('#set-toolbar-style').value,
        bookmarkBar: $('#set-bm-bar').checked, compactMode: $('#set-compact').checked,
        tabsNext: $('#set-tabs-next').checked, tabsWarn: $('#set-tabs-warn').checked,
        tabPosition: $('#set-tab-position').value,
        startupBehavior: $('#set-startup').value, downloadPath: $('#set-download-path').value,
        hardwareAccel: $('#set-hardware-accel').checked, smoothScroll: $('#set-smooth-scroll').checked,
        overlayScrollbars: $('#set-overlay-scroll').checked, uiFontSize: $('#set-font-size').value,
        doNotTrack: $('#set-dnt').checked, cookieBehavior: $('#set-cookies').value,
        javaScriptEnabled: $('#set-javascript').checked,
        screenReader: $('#set-a11y-screen').checked,
        forceZoom: $('#set-a11y-force-zoom').checked, defaultZoom: parseInt($('#set-a11y-zoom').value, 10),
        reducedMotion: $('#set-a11y-motion').checked, highContrast: $('#set-a11y-contrast').checked,
        focusRing: $('#set-a11y-focus').checked, minFontSize: parseInt($('#set-a11y-min-font').value, 10),
      };
      settings = await window.lumen.setSettings(partial);
      adultModeActive = !!settings.adultMode;
      if (partial.lumenSearchEnabled !== undefined) await window.lumen.toggleLumenSearch(partial.lumenSearchEnabled);
      applyTheme(settings); closeSettingsTab(); toast('Settings saved');
      refreshLumenStats(); refreshPasswordList();
    });
    $('#btn-open-docs').addEventListener('click', async () => { const p = await window.lumen.resolvePath('lumen_browser.html'); const tab = getActiveTab(); if (tab) navigateTab(tab, `file://${p}`); closeSettingsTab(); });

    // Import browser
    $('#btn-start-import').addEventListener('click', startImport);
    setupImportUI();

    // Update listener
    window.lumen.onUpdateStatus((status) => handleUpdateStatus(status));
  }

  function setupImportUI() {
    renderBrowserList();
    $('#import-bookmarks-chk').addEventListener('change', updateImportButton);
    $('#import-history-chk').addEventListener('change', updateImportButton);
  }

  async function renderBrowserList() {
    const container = $('#import-browser-select');
    try {
      const browsers = await window.lumen.detectBrowsers();
      if (!browsers || browsers.length === 0) {
        container.innerHTML = '<p class="muted" style="padding:12px 0">No supported browsers detected.</p>';
        return;
      }
      container.innerHTML = browsers.map((b, i) => `<label class="import-browser-opt${i === 0 ? ' sel' : ''}">
        <input type="radio" name="import-browser" value="${b.id}" data-path="${b.profilePath}"${i === 0 ? ' checked' : ''}>
        <span class="import-browser-name">${escapeHtml(b.name)}</span>
      </label>`).join('');
      container.querySelectorAll('input[name="import-browser"]').forEach((el) => {
        el.addEventListener('change', () => {
          container.querySelectorAll('.import-browser-opt').forEach((o) => o.classList.remove('sel'));
          el.closest('.import-browser-opt')?.classList.add('sel');
          updateImportButton();
        });
      });
      updateImportButton();
    } catch { container.innerHTML = '<p class="muted" style="padding:12px 0">Could not scan for browsers.</p>'; }
  }

  function updateImportButton() {
    const sel = document.querySelector('input[name="import-browser"]:checked');
    const chk = $('#import-bookmarks-chk').checked || $('#import-history-chk').checked;
    $('#btn-start-import').disabled = !(sel && chk);
  }

  async function startImport() {
    const sel = document.querySelector('input[name="import-browser"]:checked');
    if (!sel) { toast('Select a browser first'); return; }
    const browserId = sel.value;
    const profilePath = sel.dataset.path;
    const opts = { bookmarks: $('#import-bookmarks-chk').checked, history: $('#import-history-chk').checked };
    const btn = $('#btn-start-import');
    btn.disabled = true;
    btn.textContent = 'Importing...';
    $('#import-progress').classList.remove('hidden');
    $('#import-progress').textContent = 'Reading browser data...';
    $('#import-result').classList.add('hidden');
    try {
      const result = await window.lumen.importBrowserData(browserId, profilePath, opts);
      $('#import-progress').classList.add('hidden');
      $('#import-result').classList.remove('hidden');
      if (result.success) {
        const parts = [];
        if (result.bookmarks > 0) parts.push(`${result.bookmarks} bookmarks`);
        if (result.history > 0) parts.push(`${result.history} history entries`);
        $('#import-result').innerHTML = `<span style="color:#6EE7B7">✓ Imported ${parts.join(', ') || 'nothing new'}.</span>`;
        toast(`Imported ${parts.join(', ') || 'nothing new'} from ${sel.closest('.import-browser-opt')?.querySelector('.import-browser-name')?.textContent || 'browser'}`);
        refreshBookmarkList();
      } else {
        $('#import-result').innerHTML = `<span style="color:#EF4444">✗ ${escapeHtml(result.error || 'Import failed')}</span>`;
      }
    } catch (err) {
      $('#import-progress').classList.add('hidden');
      $('#import-result').classList.remove('hidden');
      $('#import-result').innerHTML = `<span style="color:#EF4444">✗ ${escapeHtml(err.message || 'Import failed')}</span>`;
    }
    btn.disabled = false;
    btn.textContent = 'Import';
  }

  let updateState = null;

  function handleUpdateStatus(status) {
    updateState = status;
    const badge = $('#update-badge');
    if (!badge) return;
    badge.classList.remove('hidden');
    if (status.status === 'available') {
      badge.innerHTML = `<span style="color:#FBBF24">● Update ${status.version} available</span>`;
      badge.addEventListener('click', () => window.lumen.checkForUpdates());
    } else if (status.status === 'downloading') {
      badge.innerHTML = `<span>⬇ Downloading ${Math.round(status.percent)}%</span>`;
    } else if (status.status === 'downloaded') {
      badge.innerHTML = `<span style="color:#6EE7B7">● Restart to update</span>`;
      badge.style.cursor = 'pointer';
      badge.addEventListener('click', () => window.lumen.restartAndUpdate());
    } else if (status.status === 'uptodate') {
      badge.innerHTML = `<span style="color:#6EE7B7">✓ Up to date</span>`;
      setTimeout(() => badge.classList.add('hidden'), 5000);
    } else if (status.status === 'error') {
      badge.innerHTML = `<span style="color:#EF4444">● Update error</span>`;
      setTimeout(() => badge.classList.add('hidden'), 8000);
    }
  }

  async function loadSettings() {
    settings = await window.lumen.getSettings();
    adultModeActive = !!settings.adultMode; applyTheme(settings);
    $('#set-accent').value = settings.accent || '#7C3AED'; $('#set-accent2').value = settings.accentSecondary || '#06B6D4';
    $('#set-wallpaper').value = settings.wallpaper || ''; $('#set-wallpaper-mode').value = settings.wallpaperMode || 'cover';
    $('#set-default-search').value = settings.defaultSearch || 'duckduckgo'; $('#set-lumen-search').checked = !!settings.lumenSearchEnabled;
    $('#set-ai-key').value = settings.aiApiKey || ''; $('#set-ai-provider').value = settings.aiProvider || 'anthropic';
    $('#set-local-model').value = settings.localModelPath || ''; $('#set-local-ctx').value = settings.localContextSize || 4096;
    $('#set-home').value = settings.homePage || 'lumen://newtab'; $('#set-theme').value = settings.theme || 'dark';
    $('#set-max-ram').value = settings.maxRam || 0; $('#set-limit-gpu').checked = !!settings.limitGpu;
    $('#set-limit-network').checked = !!settings.limitNetwork; $('#set-limit-cpu').checked = !!settings.limitCpu;
    $('#set-adult-mode').checked = !!settings.adultMode;
    $('#set-adblock').checked = settings.adBlockEnabled !== false;
    // New settings
    $('#set-search-suggest').checked = settings.searchSuggestions !== false;
    $('#set-language').value = settings.defaultLanguage || 'en-US';
    $('#set-toolbar-style').value = settings.toolbarStyle || 'default';
    $('#set-bm-bar').checked = !!settings.bookmarkBar;
    $('#set-compact').checked = !!settings.compactMode;
    $('#set-tabs-next').checked = !!settings.tabsNext;
    $('#set-tabs-warn').checked = settings.tabsWarn !== false;
    $('#set-tab-position').value = settings.tabPosition || 'end';
    $('#set-startup').value = settings.startupBehavior || 'continue';
    $('#set-download-path').value = settings.downloadPath || '';
    $('#set-hardware-accel').checked = settings.hardwareAccel !== false;
    $('#set-smooth-scroll').checked = settings.smoothScroll !== false;
    $('#set-overlay-scroll').checked = !!settings.overlayScrollbars;
    $('#set-font-size').value = settings.uiFontSize || 'medium';
    $('#set-dnt').checked = !!settings.doNotTrack;
    $('#set-cookies').value = settings.cookieBehavior || 'all';
    $('#set-javascript').checked = settings.javaScriptEnabled !== false;
    $('#set-a11y-screen').checked = !!settings.screenReader;
    $('#set-a11y-force-zoom').checked = !!settings.forceZoom;
    $('#set-a11y-zoom').value = settings.defaultZoom || 100;
    $('#set-a11y-motion').checked = !!settings.reducedMotion;
    $('#set-a11y-contrast').checked = !!settings.highContrast;
    $('#set-a11y-focus').checked = settings.focusRing !== false;
    $('#set-a11y-min-font').value = settings.minFontSize || 0;
    updateAiProviderUI(settings.aiProvider || 'anthropic');
    refreshLocalAiStatus(); refreshLumenStats(); refreshPasswordList(); refreshBookmarkList(); refreshExtensionList();
  }

  function updateAiProviderUI(provider) { const local = provider === 'local'; $('#ai-cloud-fields').classList.toggle('hidden', local); $('#ai-local-fields').classList.toggle('hidden', !local); }

  async function refreshLocalAiStatus() {
    if (!window.lumen.localAiStatus) return;
    const s = await window.lumen.localAiStatus();
    let text = 'Model: not loaded';
    if (s.loading) text = 'Model: loading...'; else if (s.loaded) text = `Model: loaded (${s.engine}) — ${s.path?.split('/').pop() || ''}`; else if (s.error) text = `Model: error — ${s.error}`;
    $('#local-model-status').textContent = text;
  }

  async function refreshLumenStats() { const s = await window.lumen.lumenSearchStats(); $('#lumen-stats').textContent = `Index: ${s.pages} pages · ${s.queued} queued`; }

  window.addEventListener('message', (e) => { if (e.data?.type === 'lumen-navigate') { const tab = getActiveTab(); if (tab) navigateTab(tab, e.data.query); } });

  async function init() {
    if (!window.lumen) { document.body.innerHTML = '<p style="padding:24px;color:#fff">Run with: npm start (Electron required)</p>'; return; }
    await loadSettings();
    setupTitlebar(); setupToolbar(); setupOmnibox(); setupSidebar(); setupLeftSidebar(); setupSettings(); setupKeyboardShortcuts();
    $('#btn-split').addEventListener('click', toggleSplitView);
    guestPreloadPath = await window.lumen.getGuestPreloadPath();
    window.lumen.onLocalAiStatus?.(() => refreshLocalAiStatus());
    window.lumen.onOpenUrlNewTab((url) => createTab(url));
    window.lumen.onDownloadProgress((d) => {
      const idx = activeDownloads.findIndex((dl) => dl.id === d.id);
      if (idx >= 0) activeDownloads[idx] = d;
      else activeDownloads.unshift(d);
      if (activeDownloads.length > 50) activeDownloads.length = 50;
      if (d.state === 'done') toast(`Downloaded ${d.name}`);
      else if (d.state === 'failed') toast(`Download failed: ${d.name}`);
    });
    window.lumen.onNavigationBlocked?.((url) => { toast(`Blocked: ${url} (18+ Mode)`); });
    setupWelcome();
    if (!settings.firstRun) { const restored = await loadSavedTabs(); if (!restored) createTab('lumen://newtab'); }
    setInterval(refreshLumenStats, 15000); setInterval(refreshPasswordList, 30000); setInterval(refreshBookmarkList, 10000); setInterval(refreshHistoryList, 15000);
  }

  init();
})();
