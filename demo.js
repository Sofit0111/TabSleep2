import { DEFAULT_SETTINGS, DEFAULT_STATS, dayKey, lastDays, mergeSettings, mergeStats } from "./core.js";

const now = Date.now();
const min = 60000;

const SEED_TABS = [
  { id: 1, windowId: 1, index: 0, active: true, title: "Pull request #482 · memory-nap/tabs", url: "https://github.com/memory-nap/tabs/pull/482", idle: 0 },
  { id: 2, windowId: 1, index: 1, title: "Lo-fi beats для концентрации — 3 часа", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", audible: true, guard: ["media"], idle: 12 },
  { id: 3, windowId: 1, index: 2, title: "Черновик: отчёт по памяти за ноябрь", url: "https://docs.google.com/document/d/1nap-report/edit", guard: ["form"], idle: 34 },
  { id: 4, windowId: 1, index: 3, title: "Memory Nap · UI Kit", url: "https://www.figma.com/file/nap-uikit/Memory-Nap", idle: 51 },
  { id: 5, windowId: 1, index: 4, title: "Входящие (12) — Sofit", url: "https://mail.google.com/mail/u/0/#inbox", guard: ["form"], idle: 8 },
  { id: 6, windowId: 1, index: 5, title: "NAP-118 · Утечка таймера в service worker", url: "https://linear.app/memory-nap/issue/NAP-118", idle: 73 },
  { id: 7, windowId: 1, index: 6, title: "chrome.tabs.discard returns undefined — Stack Overflow", url: "https://stackoverflow.com/questions/78451220/chrome-tabs-discard", idle: 96, discarded: true },
  { id: 8, windowId: 1, index: 7, title: "Manifest V3 migration guide — MDN", url: "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Manifest_V3", idle: 140, discarded: true },
  { id: 9, windowId: 1, index: 8, title: "Оптимизация service worker — ChatGPT", url: "https://chatgpt.com/c/nap-service-worker", idle: 27 },
  { id: 10, windowId: 1, index: 9, title: "Дейли 10:00 — Google Meet", url: "https://meet.google.com/nap-daily", guard: ["media"], idle: 5 },
  { id: 11, windowId: 1, index: 10, title: "Telegram Web", url: "https://web.telegram.org/a/#-100234", idle: 18 },
  { id: 12, windowId: 1, index: 11, title: "r/chrome_extensions — новые обсуждения", url: "https://www.reddit.com/r/chrome_extensions/new/", idle: 190, discarded: true },
  { id: 13, windowId: 2, index: 0, active: true, title: "Как Chrome управляет памятью вкладок / Хабр", url: "https://habr.com/ru/articles/812345/", idle: 2 },
  { id: 14, windowId: 2, index: 1, title: "Tab (GUI) — Википедия", url: "https://ru.wikipedia.org/wiki/Tab_(GUI)", idle: 210, discarded: true },
  { id: 15, windowId: 2, index: 2, title: "chrome-types — npm", url: "https://www.npmjs.com/package/chrome-types", idle: 260, discarded: true },
  { id: 16, windowId: 2, index: 3, title: "Roadmap расширения · Notion", url: "https://www.notion.so/memory-nap/Roadmap", guard: ["form"], idle: 44 },
  { id: 17, windowId: 2, index: 4, title: "Стрим: разработка расширений", url: "https://www.twitch.tv/devstream", audible: true, guard: ["media"], idle: 22 },
  { id: 18, windowId: 2, index: 5, title: "Memory Nap · дизайн-ревью", url: "https://miro.com/app/board/nap-review", idle: 61 }
];

function seedSessions() {
  return [
    {
      id: "session-demo-1",
      createdAt: new Date(now - 26 * 60 * min).toISOString(),
      title: "github.com · habr.com · figma.com",
      domains: ["github.com", "habr.com", "figma.com", "developer.mozilla.org"],
      count: 5,
      windows: [{ tabs: [
        { url: "https://github.com/memory-nap/tabs", title: "memory-nap/tabs", pinned: true, index: 0 },
        { url: "https://habr.com/ru/articles/812345/", title: "Как Chrome управляет памятью", index: 1 },
        { url: "https://www.figma.com/file/nap-uikit", title: "UI Kit", index: 2 },
        { url: "https://developer.mozilla.org/ru/docs/Web/API", title: "Web API", index: 3 },
        { url: "https://www.npmjs.com/package/chrome-types", title: "chrome-types", index: 4 }
      ] }]
    },
    {
      id: "session-demo-2",
      createdAt: new Date(now - 3 * 24 * 60 * min).toISOString(),
      title: "Исследование конкурентов",
      domains: ["chromewebstore.google.com", "reddit.com", "youtube.com"],
      count: 3,
      windows: [{ tabs: [
        { url: "https://www.reddit.com/r/chrome_extensions/", title: "r/chrome_extensions", index: 0 },
        { url: "https://www.youtube.com/watch?v=nap-talk", title: "Доклад про MV3", index: 1 },
        { url: "https://news.ycombinator.com/item?id=39221", title: "HN: tab discarding", index: 2 }
      ] }]
    }
  ];
}

function seedStats() {
  const values = [420, 980, 1240, 760, 1520, 1180, 640];
  const history = {};
  lastDays(7).forEach((day, index) => { history[day.key] = values[index]; });
  history[dayKey(new Date(now - 8 * 24 * 60 * min))] = 890;
  history[dayKey(new Date(now - 9 * 24 * 60 * min))] = 1310;
  return { ...structuredClone(DEFAULT_STATS), freedMb: 18420, sleepCount: 264, wakeCount: 151, history, sessions: seedSessions(), startedAt: new Date(now - 21 * 24 * 60 * min).toISOString() };
}

export function createDemoBrowser() {
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

  const persist = (key, fallback) => {
    let cache = fallback;
    try {
      const raw = localStorage.getItem(`memory-nap-demo:${key}`);
      if (raw) cache = JSON.parse(raw);
    } catch { /* file:// без localStorage */ }
    const write = () => { try { localStorage.setItem(`memory-nap-demo:${key}`, JSON.stringify(cache)); } catch { /* ignore */ } };
    return {
      async get(keys) {
        if (keys == null) return structuredClone(cache);
        if (typeof keys === "string") return { [keys]: structuredClone(cache[keys]) };
        if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, structuredClone(cache[k])]));
        const out = {};
        for (const [k, v] of Object.entries(keys)) out[k] = cache[k] !== undefined ? structuredClone(cache[k]) : structuredClone(v);
        return out;
      },
      async set(obj) { cache = { ...cache, ...structuredClone(obj) }; write(); emit(); },
      async remove(keys) { for (const k of [].concat(keys)) delete cache[k]; write(); emit(); },
      async clear() { cache = {}; write(); emit(); }
    };
  };

  let tabs = SEED_TABS.map((tab) => ({
    id: tab.id, windowId: tab.windowId, index: tab.index, active: Boolean(tab.active),
    pinned: Boolean(tab.pinned), audible: Boolean(tab.audible), discarded: Boolean(tab.discarded),
    title: tab.title, url: tab.url, favIconUrl: "", lastAccessed: now - (tab.idle || 0) * min,
    guard: tab.guard || []
  }));
  let nextTabId = 100;
  let nextWindowId = 3;
  let focusedWindow = 1;
  let available = 5.4 * 1073741824;
  const capacity = 16 * 1073741824;

  const copy = (tab) => ({ ...tab, guard: undefined });
  const find = (id) => tabs.find((tab) => tab.id === Number(id));
  const require_ = (id) => { const tab = find(id); if (!tab) throw new Error(`Нет вкладки ${id}`); return tab; };

  const browser = {
    storage: {
      sync: persist("sync", mergeSettings(DEFAULT_SETTINGS)),
      local: persist("local", mergeStats(seedStats())),
      session: { async get() { return {}; }, async set() {}, async remove() {} }
    },
    tabs: {
      async query(queryInfo = {}) {
        return tabs.filter((tab) => {
          if (queryInfo.windowId != null && tab.windowId !== queryInfo.windowId) return false;
          if (queryInfo.active != null && tab.active !== queryInfo.active) return false;
          if (queryInfo.lastFocusedWindow && tab.windowId !== focusedWindow) return false;
          return true;
        }).map(copy);
      },
      async get(id) { return copy(require_(id)); },
      async discard(id) {
        const tab = require_(id);
        if (tab.active) throw new Error("Нельзя усыпить активную вкладку");
        tab.discarded = true;
        emit();
        return copy(tab);
      },
      async reload(id) { const tab = require_(id); tab.discarded = false; emit(); },
      async remove(ids) {
        const list = [].concat(ids).map(Number);
        tabs = tabs.filter((tab) => !list.includes(tab.id));
        emit();
      },
      async create({ windowId, url, pinned, active, index } = {}) {
        const targetWindow = windowId ?? focusedWindow;
        const tab = {
          id: nextTabId++, windowId: targetWindow,
          index: index ?? tabs.filter((item) => item.windowId === targetWindow).length,
          active: Boolean(active), pinned: Boolean(pinned), audible: false, discarded: false,
          title: url ? new URL(url).hostname.replace(/^www\./, "") : "Новая вкладка",
          url: url || "about:blank", favIconUrl: "", lastAccessed: Date.now(), guard: []
        };
        if (tab.active) tabs.forEach((item) => { if (item.windowId === targetWindow) item.active = false; });
        tabs.push(tab);
        emit();
        return copy(tab);
      },
      async update(id, props = {}) {
        const tab = require_(id);
        if (props.active) { tabs.forEach((item) => { if (item.windowId === tab.windowId) item.active = false; }); focusedWindow = tab.windowId; tab.lastAccessed = Date.now(); }
        Object.assign(tab, props);
        emit();
        return copy(tab);
      }
    },
    windows: {
      async getLastFocused() { return { id: focusedWindow }; },
      async update(id, props = {}) { if (props.focused) focusedWindow = id; return { id }; },
      async create({ url, focused } = {}) {
        const id = nextWindowId++;
        if (focused) focusedWindow = id;
        const tab = await browser.tabs.create({ windowId: id, url, active: true });
        return { id, tabs: [tab] };
      }
    },
    scripting: {
      async executeScript({ target }) {
        const tab = find(target.tabId);
        if (!tab) throw new Error("Вкладка недоступна");
        if (!/^https?:/.test(tab.url)) throw new Error("Системная страница");
        return [{ frameId: 0, result: { reasons: tab.guard || [] } }];
      }
    },
    system: {
      memory: {
        async getInfo() {
          available = Math.max(1.2 * 1073741824, Math.min(capacity * 0.72, available + (Math.random() - 0.5) * 420 * 1048576));
          return { capacity, availableCapacity: Math.round(available) };
        }
      }
    }
  };

  setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const active = tabs.find((tab) => tab.active && tab.windowId === focusedWindow);
    if (active) active.lastAccessed = Date.now();
    emit();
  }, 6000);

  return { browser, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}