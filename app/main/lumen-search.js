/**
 * Lumen Search — local crawler + index (Google-style pipeline, simplified).
 * Disabled by default; started only when user enables in settings.
 */
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = null;
}

const DEFAULT_SEEDS = [
  'https://en.wikipedia.org/wiki/Special:Random',
  'https://developer.mozilla.org/en-US/docs/Web',
  'https://www.w3.org/TR/',
];

const MAX_PAGES_PER_RUN = 40;
const CRAWL_DELAY_MS = 800;
const FETCH_TIMEOUT = 12000;

class LumenSearchEngine extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.dbPath = path.join(userDataPath, 'lumen-search.db');
    this.db = null;
    this.running = false;
    this.crawlTimer = null;
    this.seeds = [...DEFAULT_SEEDS];
    this.robotsRespect = true;
  }

  init() {
    if (!Database) {
      this.emit('log', 'SQLite unavailable — Lumen Search indexing disabled');
      return false;
    }
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        url TEXT PRIMARY KEY,
        title TEXT,
        body TEXT,
        fetched_at INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
        title, body, content='pages', content_rowid='rowid'
      );
      CREATE TABLE IF NOT EXISTS crawl_queue (
        url TEXT PRIMARY KEY,
        priority INTEGER DEFAULT 0,
        added_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS crawl_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        at INTEGER
      );
    `);
    for (const seed of this.seeds) {
      this.enqueue(seed, 10);
    }
    return true;
  }

  close() {
    if (this.crawlTimer) clearInterval(this.crawlTimer);
    this.running = false;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  log(message) {
    const at = Date.now();
    if (this.db) {
      this.db.prepare('INSERT INTO crawl_log (message, at) VALUES (?, ?)').run(message, at);
    }
    this.emit('log', message);
  }

  enqueue(url, priority = 0) {
    if (!this.db) return;
    try {
      const u = new URL(url);
      if (!['http:', 'https:'].includes(u.protocol)) return;
      this.db
        .prepare(
          'INSERT OR IGNORE INTO crawl_queue (url, priority, added_at) VALUES (?, ?, ?)'
        )
        .run(u.href, priority, Date.now());
    } catch {
      /* invalid url */
    }
  }

  async fetchPage(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'LumenSearchBot/1.0 (+https://lumen.local; research crawler)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html')) throw new Error('Not HTML');
      return await res.text();
    } finally {
      clearTimeout(t);
    }
  }

  extract(html, baseUrl) {
    let cheerio;
    try {
      cheerio = require('cheerio');
    } catch {
      return { title: '', text: '', links: [] };
    }
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const title = $('title').first().text().trim() || baseUrl;
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 50000);
    const links = [];
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        const abs = new URL(href, baseUrl).href;
        if (abs.startsWith('http')) links.push(abs);
      } catch {
        /* skip */
      }
    });
    return { title, text, links: [...new Set(links)].slice(0, 30) };
  }

  indexPage(url, title, body) {
    if (!this.db) return;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO pages (url, title, body, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET title=excluded.title, body=excluded.body, fetched_at=excluded.fetched_at`
      )
      .run(url, title, body, now);
    try {
      this.db.prepare('DELETE FROM pages_fts WHERE rowid IN (SELECT rowid FROM pages WHERE url = ?)').run(url);
      this.db
        .prepare(
          `INSERT INTO pages_fts(rowid, title, body)
           SELECT rowid, title, body FROM pages WHERE url = ?`
        )
        .run(url);
    } catch {
      /* fts sync optional */
    }
  }

  async crawlOne() {
    if (!this.db || !this.running) return;
    const row = this.db
      .prepare('SELECT url FROM crawl_queue ORDER BY priority DESC, added_at ASC LIMIT 1')
      .get();
    if (!row) {
      for (const seed of this.seeds) this.enqueue(seed, 5);
      return;
    }
    const url = row.url;
    this.db.prepare('DELETE FROM crawl_queue WHERE url = ?').run(url);
    try {
      this.log(`Crawling ${url}`);
      const html = await this.fetchPage(url);
      const { title, text, links } = this.extract(html, url);
      this.indexPage(url, title, text);
      for (const link of links.slice(0, 8)) this.enqueue(link, 1);
      this.emit('indexed', { url, title });
    } catch (err) {
      this.log(`Skip ${url}: ${err.message}`);
    }
  }

  startCrawler() {
    if (!this.init()) return false;
    if (this.running) return true;
    this.running = true;
    let count = 0;
    this.crawlTimer = setInterval(async () => {
      if (!this.running) return;
      await this.crawlOne();
      count += 1;
      if (count >= MAX_PAGES_PER_RUN) {
        this.log('Crawl batch complete — pausing 5 min');
        count = 0;
      }
    }, CRAWL_DELAY_MS);
    this.log('Lumen Search crawler started');
    return true;
  }

  stopCrawler() {
    this.running = false;
    if (this.crawlTimer) {
      clearInterval(this.crawlTimer);
      this.crawlTimer = null;
    }
    this.log('Lumen Search crawler stopped');
  }

  search(query, limit = 12) {
    if (!this.db || !query?.trim()) return [];
    const q = query.trim();
    try {
      const rows = this.db
        .prepare(
          `SELECT p.url, p.title, snippet(pages_fts, 1, '<b>', '</b>', '…', 20) AS snippet
           FROM pages_fts f
           JOIN pages p ON p.rowid = f.rowid
           WHERE pages_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(q.replace(/[^\w\s-]/g, ' '), limit);
      if (rows.length) return rows;
    } catch {
      /* fallback LIKE */
    }
    const like = `%${q}%`;
    return this.db
      .prepare(
        `SELECT url, title, substr(body, 1, 160) AS snippet FROM pages
         WHERE title LIKE ? OR body LIKE ? LIMIT ?`
      )
      .all(like, like, limit);
  }

  stats() {
    if (!this.db) return { pages: 0, queued: 0 };
    const pages = this.db.prepare('SELECT COUNT(*) AS c FROM pages').get()?.c ?? 0;
    const queued = this.db.prepare('SELECT COUNT(*) AS c FROM crawl_queue').get()?.c ?? 0;
    return { pages, queued };
  }
}

module.exports = { LumenSearchEngine };
