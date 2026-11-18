import {
  DEFAULT_SETTINGS, DEFAULT_STATS, PROFILES, VERSION,
  clamp, uid, mapLimit, withTimeout, normalizeDomain, domainOf, urlPolicy, isRestorable,
  describeTab, mergeSettings, mergeStats, pruneHistory, dayKey, estimateTabMb, tabsWord
} from "./core.js";

function probePage(cfg) {
  const reasons = [];
  const push = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };

  if (cfg.forms || cfg.uploads) {
    const fields = document.querySelectorAll("textarea, input, select, [contenteditable]");
    for (const el of fields) {
      if (el.disabled || el.readOnly) continue;
      if (el.isContentEditable) {
        if (cfg.forms && (el.innerText || "").trim().length > 0 && el.getAttribute("aria-readonly") !== "true") push("form");
        continue;
      }
      const tag = el.tagName;
      if (tag === "INPUT") {
        const type = (el.type || "text").toLowerCase();
        if (["hidden", "button", "submit", "reset", "image", "range", "color"].includes(type)) continue;
        if (type === "file") { if (cfg.uploads && el.files && el.files.length > 0) push("upload"); continue; }
        if (type === "checkbox" || type === "radio") { if (cfg.forms && el.checked !== el.defaultChecked) push("form"); continue; }
        if (cfg.forms && (el.value || "").trim() && el.value !== el.defaultValue) push("form");
        continue;
      }
      if (tag === "TEXTAREA") { if (cfg.forms && (el.value || "").trim() && el.value !== el.defaultValue) push("form"); continue; }
      if (tag === "SELECT" && cfg.forms) {
        const options = Array.from(el.options || []);
        if (options.some((option) => option.selected !== option.defaultSelected)) push("form");
      }
    }
  }

  if (cfg.media) {
    for (const el of document.querySelectorAll("video, audio")) {
      if (el.srcObject || (!el.paused && !el.ended && el.currentTime > 0)) { push("media"); break; }
    }
    if (document.pictureInPictureElement) push("media");
  }

  if (cfg.reading) {
    const text = document.body ? document.body.innerText || "" : "";
    if (text.length > cfg.readingChars && document.querySelectorAll("article p, main p, p").length >= 6) push("reading");
  }

  return { reasons };
}

export function createEngine(browser) {
  const guardCache = new Map();
  const memorySession = new Map();
  const GUARD_TTL = 90000;

  const sessionArea = browser.storage.session || {
    async get(key) { return { [key]: memorySession.get(key) }; },
    async set(obj) { Object.entries(obj).forEach(([k, v]) => memorySession.set(k, v)); }
  };

  async function sessionGet(key, fallback) {
    try { const stored = await sessionArea.get(key); return stored?.[key] ?? fallback; }
    catch { return memorySession.get(key) ?? fallback; }
  }
  async function sessionSet(key, value) {
    memorySession.set(key, value);
    try { await sessionArea.set({ [key]: value }); } catch { /* session storage недоступен */ }
  }

  async function getSettings() {
    return mergeSettings(await browser.storage.sync.get(null));
  }
  async function patchSettings(patch = {}) {
    const next = mergeSettings({ ...(await getSettings()), ...patch });
    await browser.storage.sync.set(next);
    return next;
  }
  async function getStats() {
    return mergeStats(await browser.storage.local.get(null));
  }
  async function setStats(patch) {
    const next = mergeStats({ ...(await getStats()), ...patch });
    next.history = pruneHistory(next.history);
    await browser.storage.local.set(next);
    return next;
  }
  async function getMemory() {
    try {
      const info = await browser.system?.memory?.getInfo?.();
      if (!info || !info.capacity) return null;
      return { capacity: info.capacity, available: info.availableCapacity };
    } catch { return null; }
  }
  async function getIdleMap() { return sessionGet("idle", {}); }
  async function touchTab(tabId) {
    const map = await getIdleMap();
    map[tabId] = Date.now();
    await sessionSet("idle", map);
  }
  async function forgetTab(tabId) {
    const map = await getIdleMap();
    delete map[tabId];
    await sessionSet("idle", map);
    guardCache.delete(tabId);
  }
  async function focusedWindowId() {
    try { return (await browser.windows?.getLastFocused?.({ populate: false }))?.id ?? null; }
    catch { return null; }
  }

  async function snapshot() {
    const [settings, stats, tabs, memory, idle, focus] = await Promise.all([
      getSettings(), getStats(), browser.tabs.query({}), getMemory(), getIdleMap(), focusedWindowId()
    ]);
    const now = Date.now();
    const rows = tabs.map((tab) => {
      const cached = guardCache.get(tab.id);
      const guard = cached && now - cached.at < GUARD_TTL ? cached.reasons : null;
      return describeTab(tab, settings, now, idle, focus, guard);
    });
    const sleeping = rows.filter((row) => row.state === "sleeping");
    return {
      version: VERSION,
      now,
      settings,
      memory,
      tabs: rows,
      stats: {
        freedMb: stats.freedMb,
        sleepCount: stats.sleepCount,
        wakeCount: stats.wakeCount,
        history: stats.history,
        sessions: stats.sessions,
        startedAt: stats.startedAt
      },
      live: {
        total: rows.length,
        sleeping: sleeping.length,
        ready: rows.filter((row) => row.state === "ready").length,
        protected: rows.filter((row) => row.state === "protected" || row.state === "active").length,
        freedNowMb: sleeping.reduce((sum, row) => sum + row.estimatedMb, 0)
      }
    };
  }

  async function inspect(tab, settings) {
    if (!urlPolicy(tab.url).allowed) return ["system"];
    const cached = guardCache.get(tab.id);
    if (cached && Date.now() - cached.at < GUARD_TTL) return cached.reasons;
    const cfg = {
      forms: settings.protect.forms,
      uploads: settings.protect.uploads,
      media: settings.protect.media,
      reading: settings.protect.reading && settings.activeProfile === "reading",
      readingChars: settings.readingChars
    };
    const frames = await withTimeout(
      browser.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: probePage, args: [cfg] }).catch(() => null),
      4000,
      null
    );
    if (!Array.isArray(frames) || frames.length === 0) {
      guardCache.set(tab.id, { at: Date.now(), reasons: ["unknown"] });
      return ["unknown"];
    }
    const reasons = [...new Set(frames.flatMap((frame) => frame?.result?.reasons || []))];
    guardCache.set(tab.id, { at: Date.now(), reasons });
    return reasons;
  }

  async function focusNeighbor(tab) {
    const siblings = await browser.tabs.query({ windowId: tab.windowId });
    const ordered = siblings.filter((item) => item.id !== tab.id && !item.discarded);
    const next = ordered.find((item) => item.index > tab.index) || ordered[ordered.length - 1];
    if (next) { await browser.tabs.update(next.id, { active: true }); return; }
    await browser.tabs.create({ windowId: tab.windowId, active: true });
  }

  async function putUndo(entry) {
    const list = await sessionGet("undo", []);
    const next = [{ ...entry, id: uid("undo"), at: Date.now() }, ...list].slice(0, 8);
    await sessionSet("undo", next);
    return next[0].id;
  }

  async function discardTabs(tabIds, { auto = false } = {}) {
    const settings = await getSettings();
    const idle = await getIdleMap();
    const focus = await focusedWindowId();
    const now = Date.now();
    const done = [];

    await mapLimit([...new Set(tabIds)], 3, async (tabId) => {
      let tab = await browser.tabs.get(tabId).catch(() => null);
      if (!tab || tab.discarded) return;
      const info = describeTab(tab, settings, now, idle, focus, null);
      if (info.state === "protected") return;
      if (info.state === "active" && auto) return;

      const reasons = await inspect(tab, settings);
      if (reasons.length) return;

      tab = await browser.tabs.get(tabId).catch(() => null);
      if (!tab || tab.discarded) return;
      if (tab.audible && settings.protect.audible) return;
      if (tab.active) {
        if (auto) return;
        await focusNeighbor(tab);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      await browser.tabs.discard(tabId).catch(() => null);
      const after = await browser.tabs.get(tabId).catch(() => null);
      if (after?.discarded) done.push({ id: tabId, mb: estimateTabMb(after) });
    });

    if (done.length) {
      const gained = done.reduce((sum, item) => sum + item.mb, 0);
      const stats = await getStats();
      const key = dayKey();
      await setStats({
        freedMb: stats.freedMb + gained,
        sleepCount: stats.sleepCount + done.length,
        history: { ...stats.history, [key]: (Number(stats.history[key]) || 0) + gained }
      });
    }
    const undoId = done.length ? await putUndo({ type: "discard", tabIds: done.map((item) => item.id), label: `Усыплено ${done.length}` }) : null;
    return { count: done.length, mb: done.reduce((sum, item) => sum + item.mb, 0), undoId };
  }

  async function discardCurrent() {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return { count: 0, mb: 0, undoId: null };
    return discardTabs([tab.id]);
  }

  async function discardInactive() {
    const settings = await getSettings();
    const snap = await snapshot();
    const ready = snap.tabs.filter((row) => row.state === "ready").sort((a, b) => b.idleMs - a.idleMs);
    if (!ready.length) return { count: 0, mb: 0, undoId: null };
    return discardTabs(ready.slice(0, settings.maxPerCycle * 3).map((row) => row.id));
  }

  async function runAutoCycle() {
    const settings = await getSettings();
    const minutes = Number(settings.autoSleepMinutes);
    if (!minutes || minutes <= 0) return { count: 0, skipped: "off" };

    if (settings.ramGuard.enabled) {
      const memory = await getMemory();
      if (memory) {
        const freePercent = (memory.available / memory.capacity) * 100;
        if (freePercent > settings.ramGuard.freePercent) return { count: 0, skipped: "ram" };
      }
    }

    const snap = await snapshot();
    const sleepMs = minutes * 60000;
    const candidates = snap.tabs
      .filter((row) => row.state === "ready" && row.idleMs >= sleepMs)
      .sort((a, b) => b.idleMs - a.idleMs)
      .slice(0, settings.maxPerCycle);
    if (!candidates.length) return { count: 0, skipped: "idle" };
    return discardTabs(candidates.map((row) => row.id), { auto: true });
  }

  async function wakeTabs(tabIds) {
    let count = 0;
    await mapLimit([...new Set(tabIds)], 4, async (tabId) => {
      const tab = await browser.tabs.get(tabId).catch(() => null);
      if (!tab || !tab.discarded || !isRestorable(tab.url)) return;
      await browser.tabs.reload(tabId).catch(() => null);
      count += 1;
    });
    if (count) {
      const stats = await getStats();
      await setStats({ wakeCount: stats.wakeCount + count });
    }
    return { count };
  }

  async function wakeAll() {
    const tabs = await browser.tabs.query({});
    return wakeTabs(tabs.filter((tab) => tab.discarded).map((tab) => tab.id));
  }

  async function closeTabs(tabIds) {
    const all = await browser.tabs.query({});
    const ids = [...new Set(tabIds)].filter((id) => all.some((tab) => tab.id === id));
    if (!ids.length) return { count: 0, undoId: null };

    const captured = all.filter((tab) => ids.includes(tab.id))
      .map((tab) => ({ url: tab.url, title: tab.title, pinned: tab.pinned, active: tab.active, index: tab.index, windowId: tab.windowId }));

    if (ids.length >= all.length) await browser.tabs.create({ active: true }).catch(() => null);
    await browser.tabs.remove(ids).catch(() => null);
    for (const id of ids) await forgetTab(id);
    const undoId = await putUndo({ type: "close", tabs: captured, label: `Закрыто ${ids.length}` });
    return { count: ids.length, undoId };
  }

  async function undo(undoId) {
    const list = await sessionGet("undo", []);
    const entry = list.find((item) => item.id === undoId) || list[0];
    if (!entry) return { count: 0 };
    await sessionSet("undo", list.filter((item) => item.id !== entry.id));

    if (entry.type === "discard") return wakeTabs(entry.tabIds);

    let count = 0;
    const sorted = [...entry.tabs].sort((a, b) => a.index - b.index);
    const windows = new Map();
    for (const tab of sorted) {
      if (!isRestorable(tab.url)) continue;
      let windowId = windows.get(tab.windowId);
      const created = await browser.tabs.create({
        windowId: windowId ?? undefined,
        url: tab.url,
        pinned: Boolean(tab.pinned),
        active: false
      }).catch(() => null);
      if (!created) continue;
      windowId = created.windowId;
      windows.set(tab.windowId, windowId);
      if (tab.active) await browser.tabs.update(created.id, { active: true }).catch(() => null);
      count += 1;
    }
    return { count };
  }

  async function saveSession({ close = true } = {}) {
    const tabs = await browser.tabs.query({});
    const usable = tabs.filter((tab) => isRestorable(tab.url));
    if (!usable.length) return { count: 0, sessionId: null, undoId: null };

    const byWindow = new Map();
    for (const tab of usable) {
      if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
      byWindow.get(tab.windowId).push({ url: tab.url, title: tab.title || tab.url, pinned: Boolean(tab.pinned), active: Boolean(tab.active), index: tab.index });
    }
    const windows = [...byWindow.values()].map((group) => ({ tabs: group.sort((a, b) => a.index - b.index) }));
    const domains = [...new Set(usable.map((tab) => domainOf(tab.url)).filter(Boolean))].slice(0, 6);
    const session = {
      id: uid("session"),
      createdAt: new Date().toISOString(),
      title: domains.slice(0, 3).join(" · ") || "Сессия",
      domains,
      count: usable.length,
      windows
    };
    const stats = await getStats();
    await setStats({ sessions: [session, ...stats.sessions].slice(0, 20) });
    const closed = close ? await closeTabs(usable.map((tab) => tab.id)) : { count: 0, undoId: null };
    return { count: usable.length, closed: closed.count, sessionId: session.id, undoId: closed.undoId, session };
  }

  async function restoreSession(sessionId) {
    const stats = await getStats();
    const session = stats.sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("Сессия не найдена");
    let opened = 0;
    for (const group of session.windows) {
      const restorable = group.tabs.filter((tab) => isRestorable(tab.url));
      if (!restorable.length) continue;
      const win = await browser.windows.create({ url: restorable[0].url, focused: opened === 0 }).catch(() => null);
      if (!win) continue;
      opened += 1;
      if (restorable[0].pinned) {
        const [first] = await browser.tabs.query({ windowId: win.id });
        if (first) await browser.tabs.update(first.id, { pinned: true }).catch(() => null);
      }
      for (const tab of restorable.slice(1)) {
        const created = await browser.tabs.create({ windowId: win.id, url: tab.url, pinned: Boolean(tab.pinned), active: false }).catch(() => null);
        if (created) opened += 1;
      }
    }
    return { count: opened };
  }

  async function deleteSession(sessionId) {
    const stats = await getStats();
    await setStats({ sessions: stats.sessions.filter((item) => item.id !== sessionId) });
    return { count: 1 };
  }

  async function addWhitelist(domain) {
    const normalized = normalizeDomain(domain);
    if (!normalized) throw new Error("Не похоже на домен: пример — habr.com");
    const settings = await getSettings();
    if (settings.whitelist.includes(normalized)) return { domain: normalized, added: false };
    await patchSettings({ whitelist: [...settings.whitelist, normalized].slice(0, 200) });
    return { domain: normalized, added: true };
  }

  async function removeWhitelist(domain) {
    const settings = await getSettings();
    await patchSettings({ whitelist: settings.whitelist.filter((item) => item !== normalizeDomain(domain)) });
    return { domain };
  }

  async function activateTab(tabId) {
    const tab = await browser.tabs.get(tabId);
    await browser.tabs.update(tabId, { active: true });
    await browser.windows?.update?.(tab.windowId, { focused: true }).catch(() => null);
    await touchTab(tabId);
    return { count: 1 };
  }

  async function resetStats() {
    const stats = await getStats();
    await setStats({ freedMb: 0, sleepCount: 0, wakeCount: 0, history: {}, sessions: stats.sessions, startedAt: new Date().toISOString() });
    return { count: 1 };
  }

  async function resetSettings() {
    await browser.storage.sync.clear();
    await browser.storage.sync.set(structuredClone(DEFAULT_SETTINGS));
    return { count: 1 };
  }

  async function exportState() {
    const [settings, stats] = await Promise.all([getSettings(), getStats()]);
    return { app: "memory-nap-tabs", version: VERSION, exportedAt: new Date().toISOString(), settings, stats };
  }

  async function importState(data) {
    if (!data || data.app !== "memory-nap-tabs" || !data.settings) throw new Error("Файл не похож на резервную копию Memory Nap");
    await browser.storage.sync.set(mergeSettings(data.settings));
    if (data.stats) {
      const stats = mergeStats(data.stats);
      await setStats({ freedMb: stats.freedMb, sleepCount: stats.sleepCount, wakeCount: stats.wakeCount, history: stats.history, sessions: stats.sessions });
    }
    return { count: 1 };
  }

  async function migrateLegacy() {
    const settings = await getSettings();
    if (settings.migrated) return false;
    const legacy = await browser.storage.local.get(["autoSleepMinutes", "whitelist", "theme", "savedMemoryMb", "memoryHistory", "savedSessions"]);
    const patch = { migrated: true };
    if (legacy.autoSleepMinutes != null) patch.autoSleepMinutes = clamp(legacy.autoSleepMinutes, 0, 1440);
    if (Array.isArray(legacy.whitelist) && legacy.whitelist.length) patch.whitelist = legacy.whitelist.map(normalizeDomain).filter(Boolean);
    if (legacy.theme === "dark" || legacy.theme === "light") patch.theme = legacy.theme;
    await patchSettings(patch);

    const stats = await getStats();
    const sessions = Array.isArray(legacy.savedSessions)
      ? legacy.savedSessions.map((item) => ({
          id: item.id || uid("session"),
          createdAt: item.createdAt || new Date().toISOString(),
          title: "Сессия из версии 2.x",
          count: item.tabs?.length || 0,
          domains: [...new Set((item.tabs || []).map((tab) => domainOf(tab.url)).filter(Boolean))].slice(0, 6),
          windows: [{ tabs: item.tabs || [] }]
        }))
      : [];
    await setStats({
      freedMb: stats.freedMb || Number(legacy.savedMemoryMb) || 0,
      history: { ...(legacy.memoryHistory || {}), ...stats.history },
      sessions: [...stats.sessions, ...sessions].slice(0, 20)
    });
    await browser.storage.local.remove(["autoSleepMinutes", "whitelist", "theme", "savedMemoryMb", "memoryHistory", "savedSessions"]);
    return true;
  }

  return {
    getSettings, patchSettings, getStats, getMemory, snapshot, migrateLegacy,
    discardTabs, discardCurrent, discardInactive, runAutoCycle,
    wakeTabs, wakeAll, closeTabs, undo, activateTab,
    saveSession, restoreSession, deleteSession,
    addWhitelist, removeWhitelist, resetStats, resetSettings,
    exportState, importState, touchTab, forgetTab
  };
}

export function createRouter(engine) {
  return async function route(action, payload = {}) {
    switch (action) {
      case "snapshot": return engine.snapshot();
      case "settings.patch": return engine.patchSettings(payload.patch);
      case "settings.reset": return engine.resetSettings();
      case "stats.reset": return engine.resetStats();
      case "cycle.run": return engine.runAutoCycle();
      case "tabs.discard": return engine.discardTabs(payload.tabIds || []);
      case "tabs.discardCurrent": return engine.discardCurrent();
      case "tabs.discardInactive": return engine.discardInactive();
      case "tabs.wake": return engine.wakeTabs(payload.tabIds || []);
      case "tabs.wakeAll": return engine.wakeAll();
      case "tabs.close": return engine.closeTabs(payload.tabIds || []);
      case "tabs.activate": return engine.activateTab(payload.tabId);
      case "undo": return engine.undo(payload.undoId);
      case "sessions.save": return engine.saveSession({ close: payload.close !== false });
      case "sessions.restore": return engine.restoreSession(payload.sessionId);
      case "sessions.delete": return engine.deleteSession(payload.sessionId);
      case "whitelist.add": return engine.addWhitelist(payload.domain);
      case "whitelist.remove": return engine.removeWhitelist(payload.domain);
      case "state.export": return engine.exportState();
      case "state.import": return engine.importState(payload.data);
      default: throw new Error(`Неизвестная команда: ${action}`);
    }
  };
}

export { PROFILES, DEFAULT_SETTINGS, DEFAULT_STATS, tabsWord };