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
  const aiHistory = [];

  const SEARCH_URLS = {
    duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
    lumen: null,
  };

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
  }

  function applyTheme(s) {
    document.documentElement.style.setProperty('--accent', s.accent || '#7C3AED');
    document.documentElement.style.setProperty('--accent2', s.accentSecondary || '#06B6D4');
    adultModeActive = !!s.adultMode;
  }

  function newTabId() { tabCounter += 1; return `tab-${tabCounter}`; }

  function newTabUrl() {
    const wp = settings.wallpaper ? encodeURIComponent(settings.wallpaper) : '';
    const q = new URLSearchParams({ accent: settings.accent || '#7C3AED', accent2: settings.accentSecondary || '#06B6D4', wpMode: settings.wallpaperMode || 'cover' });
    if (wp) q.set('wallpaper', wp);
    return `file://${location.pathname.replace(/index\.html$/, '')}newtab.html?${q}`;
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

  function renderTabs() {
    const strip = $('#tabstrip');
    strip.innerHTML = '';
    const pinned = tabs.filter((t) => t.pinned);
    const unpinned = tabs.filter((t) => !t.pinned);
    const ordered = [...pinned, ...unpinned];
    for (const tab of ordered) {
      const el = document.createElement('div');
      const isActive = tab.id === activeTabId;
      const isPinned = tab.pinned;
      const isHibernated = tab.hibernated;
      const group = tab.group;
      el.className = `tab${isActive ? ' active' : ''}${isPinned ? ' pinned' : ''}${isHibernated ? ' hibernated' : ''}`;
      el.dataset.id = tab.id;
      if (group) el.dataset.group = group;
      let groupColor = '';
      if (group) {
        const groupColors = ['#7C3AED','#06B6D4','#10B981','#F59E0B','#EF4444','#EC4899'];
        const groupIdx = [...new Set(tabs.filter(t=>t.group).map(t=>t.group))].indexOf(group);
        groupColor = groupColors[groupIdx % groupColors.length];
        el.style.setProperty('--group-color', groupColor);
      }
      if (isPinned && isActive) {
        el.innerHTML = `<span class="tab-title">${escapeHtml(tab.title || 'Tab')}</span>
          <button class="tab-close" type="button"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      } else if (isPinned) {
        el.innerHTML = `<span class="tab-title">${escapeHtml(tab.title || 'Tab')}</span>`;
      } else if (isHibernated) {
        el.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span class="tab-title">${escapeHtml(tab.title || 'Tab')}</span>
          <button class="tab-close" type="button"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      } else {
        el.innerHTML = `<span class="tab-title">${escapeHtml(tab.title)}</span>
          <button class="tab-close" type="button"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      }
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); showTabContextMenu(tab, e.clientX, e.clientY); });
      el.addEventListener('click', (e) => { if (e.target.closest('.tab-close')) closeTab(tab.id); else switchTab(tab.id); });
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
      tab.hibernated = false;
      const url = tab.__hibernatedUrl || tab.url || 'lumen://newtab';
      delete tab.__hibernatedUrl;
      const wv = document.getElementById(`wv-${tab.id}`);
      if (wv) { wv.src = url; wv.style.display = ''; }
      renderTabs();
    } else {
      if (tab.pinned) return;
      tab.hibernated = true;
      tab.__hibernatedUrl = tab.url || 'lumen://newtab';
      tab.urlDisplay = tab.__hibernatedUrl;
      const wv = document.getElementById(`wv-${tab.id}`);
      if (wv) { wv.src = 'about:blank'; wv.style.display = 'none'; }
      renderTabs();
    }
    scheduleTabSave();
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
    $$('.webview-pane').forEach((p) => p.classList.remove('active'));
    $$('.tab').forEach((t) => t.classList.remove('active'));
    const pane = document.getElementById(`pane-${id}`);
    if (pane) pane.classList.add('active');
    const tabEl = $(`.tab[data-id="${id}"]`);
    if (tabEl) tabEl.classList.add('active');
    if (tab) { $('#omnibox').value = tab.urlDisplay || tab.url; updateNavButtons(); }
    renderTabs(); updateBookmarkState();
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
    const tab = { id, title: 'New Tab', url: '', urlDisplay: 'lumen://newtab', pinned: false, hibernated: false, group: null };
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
    wv.addEventListener('page-title-updated', (e) => { if (e.title) tab.title = e.title.slice(0, 48); if (tab.id === activeTabId) renderTabs(); });
    wv.addEventListener('did-navigate', (e) => {
      tab.url = e.url;
      tab.urlDisplay = e.url.startsWith('data:') ? 'lumen://search' : e.url;
      if (tab.id === activeTabId) { $('#omnibox').value = tab.urlDisplay; updateNavButtons(); updateBookmarkState(); }
      const blocked = document.getElementById(`pane-${tab.id}`)?.querySelector('.blocked-overlay');
      if (blocked) blocked.remove();
      const idx = tabs.findIndex((t) => t.id === tab.id);
      if (idx >= 0) tabs[idx] = tab;
      scheduleTabSave();
      if (e.url && e.url.startsWith('http')) window.lumen.addHistory({ url: e.url, title: tab.title });
    });
    wv.addEventListener('did-navigate-in-page', (e) => { tab.url = e.url; if (tab.id === activeTabId) $('#omnibox').value = e.url; });
    wv.addEventListener('new-window', (e) => { e.preventDefault(); createTab(e.url); });
  }

  async function navigateTab(tab, input) {
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
        for (const t of saved) {
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
        if (saved.length > 0) switchTab(tabs[0].id);
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
      if (!mod) return;
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); createTab(settings.homePage || 'lumen://newtab'); }
      else if (e.key === 'w' || e.key === 'W') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); $('#omnibox').focus(); $('#omnibox').select(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toast('Find in page: Ctrl+F'); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); getActiveWebview()?.reload(); }
      else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); toggleBookmark(); }
      else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); const idx = tabs.findIndex((t) => t.id === activeTabId); if (idx > 0) switchTab(tabs[idx - 1].id); }
      else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const idx = tabs.findIndex((t) => t.id === activeTabId); if (idx < tabs.length - 1) switchTab(tabs[idx + 1].id); else if (tabs.length > 0) switchTab(tabs[0].id); }
      else if (e.key >= '1' && e.key <= '8') { e.preventDefault(); const idx = parseInt(e.key) - 1; if (tabs[idx]) switchTab(tabs[idx].id); }
      else if (e.key === '9') { e.preventDefault(); if (tabs.length > 0) switchTab(tabs[tabs.length - 1].id); }
      else if ((e.key === 'h' || e.key === 'H') && !e.shiftKey) { e.preventDefault(); toast('History: open Settings > Privacy'); }
      else if (e.key === 'H' || (e.key === 'h' && e.shiftKey)) { e.preventDefault(); toast('History: open Settings > Privacy'); }
      else if (e.key === 'T' && e.shiftKey) { e.preventDefault(); reopenClosedTab(); }
      else if (e.key === 'B' && e.shiftKey) { e.preventDefault(); openBookmarkManager(); }
    });
  }

  function openBookmarkManager() {
    loadSettings();
    const dialog = $('#settings-dialog');
    if (dialog.open) { dialog.close(); }
    dialog.showModal();
    $$('.snav').forEach((b) => b.classList.remove('on'));
    $$('.spanel').forEach((p) => p.classList.remove('on'));
    const bmNav = [...$$('.snav')].find((b) => b.dataset.panel === 'bookmarks');
    if (bmNav) { bmNav.classList.add('on'); document.getElementById('panel-bookmarks')?.classList.add('on'); }
  }

  function setupToolbar() {
    $('#btn-back').addEventListener('click', () => getActiveWebview()?.goBack());
    $('#btn-fwd').addEventListener('click', () => getActiveWebview()?.goForward());
    $('#btn-reload').addEventListener('click', () => getActiveWebview()?.reload());
    $('#btn-home').addEventListener('click', () => { const tab = getActiveTab(); if (tab) navigateTab(tab, settings.homePage || 'lumen://newtab'); });
    $('#btn-bookmark').addEventListener('click', toggleBookmark);
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
    container.innerHTML = bookmarks.map((bm, i) => `<div class="pw-item"><div class="info"><div class="site">${escapeHtml(bm.url)}</div><div class="creds">${escapeHtml(bm.title || '')}</div></div><button class="del-btn" data-idx="${i}" title="Remove"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`).join('');
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

  function setupSettings() {
    const dialog = $('#settings-dialog');
    $('#btn-settings').addEventListener('click', () => { loadSettings(); dialog.showModal(); });
    $('#settings-close').addEventListener('click', () => dialog.close());
    $$('.snav').forEach((btn) => {
      btn.addEventListener('click', () => { $$('.snav').forEach((b) => b.classList.remove('on')); $$('.spanel').forEach((p) => p.classList.remove('on')); btn.classList.add('on'); $(`#panel-${btn.dataset.panel}`).classList.add('on'); });
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
      };
      settings = await window.lumen.setSettings(partial);
      adultModeActive = !!settings.adultMode;
      if (partial.lumenSearchEnabled !== undefined) await window.lumen.toggleLumenSearch(partial.lumenSearchEnabled);
      applyTheme(settings); dialog.close(); toast('Settings saved');
      refreshLumenStats(); refreshPasswordList();
    });
    $('#btn-open-docs').addEventListener('click', async () => { const p = await window.lumen.resolvePath('lumen_browser.html'); const tab = getActiveTab(); if (tab) navigateTab(tab, `file://${p}`); dialog.close(); });
  }

  window.addEventListener('message', (e) => { if (e.data?.type === 'lumen-navigate') { const tab = getActiveTab(); if (tab) navigateTab(tab, e.data.query); } });

  async function init() {
    if (!window.lumen) { document.body.innerHTML = '<p style="padding:24px;color:#fff">Run with: npm start (Electron required)</p>'; return; }
    await loadSettings();
    setupTitlebar(); setupToolbar(); setupOmnibox(); setupSidebar(); setupSettings(); setupKeyboardShortcuts();
    guestPreloadPath = await window.lumen.getGuestPreloadPath();
    window.lumen.onLocalAiStatus?.(() => refreshLocalAiStatus());
    window.lumen.onOpenUrlNewTab((url) => createTab(url));
    window.lumen.onDownloadProgress((d) => { if (d.state === 'done') toast(`Downloaded ${d.name}`); });
    window.lumen.onNavigationBlocked?.((url) => { toast(`Blocked: ${url} (18+ Mode)`); });
    setupWelcome();
    if (!settings.firstRun) { const restored = await loadSavedTabs(); if (!restored) createTab('lumen://newtab'); }
    setInterval(refreshLumenStats, 15000); setInterval(refreshPasswordList, 30000); setInterval(refreshBookmarkList, 10000);
  }

  init();
})();
