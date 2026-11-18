export const VERSION = "3.0.0";
export const ALARM_NAME = "memory-nap:cycle";
export const RING_LENGTH = 314.16;
export const CHART_HUES = ["#4d7cff", "#a06bff", "#2ff2b3", "#c6f24e", "#ffb020", "#ff4d6d", "#38bdf8"];

export const PROFILES = {
  aggressive: { id: "aggressive", label: "Агрессивный", minutes: 3, hue: "coral", hint: "Максимум свободной памяти: сон через 3 минуты простоя." },
  balanced: { id: "balanced", label: "Баланс", minutes: 20, hue: "mint", hint: "Сон через 20 минут. Комфортно для повседневной работы." },
  reading: { id: "reading", label: "Чтение", minutes: 45, hue: "violet", hint: "Длинные статьи и лонгриды никогда не засыпают." }
};

export const DEFAULT_SETTINGS = {
  schema: 3,
  migrated: true,
  theme: "dark",
  density: "cozy",
  motion: true,
  badge: true,
  activeProfile: "balanced",
  autoSleepMinutes: 20,
  profiles: {
    aggressive: { minutes: 3 },
    balanced: { minutes: 20 },
    reading: { minutes: 45 }
  },
  protect: {
    pinned: true,
    audible: true,
    activeWindow: false,
    forms: true,
    media: true,
    uploads: true,
    reading: true
  },
  readingChars: 7000,
  maxPerCycle: 12,
  ramGuard: { enabled: false, freePercent: 25 },
  whitelist: ["mail.google.com", "docs.google.com", "meet.google.com", "web.telegram.org"]
};

export const DEFAULT_STATS = {
  freedMb: 0,
  sleepCount: 0,
  wakeCount: 0,
  history: {},
  sessions: [],
  startedAt: null
};

export const REASON_LABELS = {
  system: "системная страница",
  pinned: "закреплена",
  audio: "играет звук",
  white: "белый список",
  active: "активная",
  window: "активное окно",
  form: "несохранённая форма",
  upload: "загрузка файла",
  media: "работает плеер",
  reading: "лонгрид",
  unknown: "страница не отвечает"
};

const PROTECTED_REASONS = new Set(["system", "pinned", "audio", "white", "window", "form", "upload", "media", "reading", "unknown"]);
const HEAVY_HOSTS = [/(^|\.)youtube\.com$/, /(^|\.)twitch\.tv$/, /(^|\.)figma\.com$/, /(^|\.)docs\.google\.com$/, /(^|\.)meet\.google\.com$/, /(^|\.)notion\.so$/, /(^|\.)miro\.com$/, /(^|\.)canva\.com$/, /(^|\.)discord\.com$/, /(^|\.)chatgpt\.com$/];
const SYSTEM_PREFIXES = ["chrome://", "chrome-untrusted://", "chrome-extension://", "devtools://", "edge://", "brave://", "opera://", "about:", "view-source:", "data:", "javascript:", "blob:", "chrome-search://"];

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const size = Math.max(1, Math.min(limit, queue.length || 1));
  const runners = Array.from({ length: size }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { await worker(item); } catch (error) { console.warn("[memory-nap]", error); }
    }
  });
  await Promise.all(runners);
}

export function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })
  ]);
}

export function normalizeDomain(raw = "") {
  let value = String(raw).trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\/\//, "");
  value = value.split(/[/?#]/)[0].split("@").pop().split(":")[0];
  value = value.replace(/\.$/, "").replace(/^www\./, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) return "";
  return value;
}

export function domainOf(url = "") {
  try { return normalizeDomain(new URL(url).hostname); } catch { return ""; }
}

export function isWhitelisted(url, whitelist = []) {
  const host = domainOf(url);
  if (!host) return false;
  return whitelist.some((entry) => {
    const domain = normalizeDomain(entry);
    return domain && (host === domain || host.endsWith(`.${domain}`));
  });
}

export function urlPolicy(url = "") {
  if (!url) return { allowed: false, reason: "system" };
  const lower = url.toLowerCase();
  if (SYSTEM_PREFIXES.some((prefix) => lower.startsWith(prefix))) return { allowed: false, reason: "system" };
  if (/^https?:\/\//.test(lower)) return { allowed: true, reason: null };
  if (lower.startsWith("file://")) return { allowed: true, reason: null };
  return { allowed: false, reason: "system" };
}

export function isRestorable(url = "") {
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

export function estimateTabMb(tab = {}) {
  const host = domainOf(tab.url || "");
  let mb = 65;
  if (HEAVY_HOSTS.some((rx) => rx.test(host))) mb += 165;
  if (tab.audible) mb += 90;
  return mb;
}

export function describeTab(tab, settings, now, idleMap = {}, focusedWindowId = null, guard = null) {
  const policy = urlPolicy(tab.url);
  const lastAccessed = Number(tab.lastAccessed || idleMap[tab.id] || now);
  const idleMs = Math.max(0, now - lastAccessed);
  const estimatedMb = estimateTabMb(tab);
  const domain = domainOf(tab.url);
  let reason = null;

  if (tab.discarded) reason = null;
  else if (!policy.allowed) reason = "system";
  else if (tab.pinned && settings.protect.pinned) reason = "pinned";
  else if (tab.audible && settings.protect.audible) reason = "audio";
  else if (isWhitelisted(tab.url, settings.whitelist)) reason = "white";
  else if (settings.protect.activeWindow && focusedWindowId != null && tab.windowId === focusedWindowId) reason = "window";
  else if (guard && guard.length) reason = guard[0];
  else if (tab.active) reason = "active";

  let state = "ready";
  if (tab.discarded) state = "sleeping";
  else if (reason === "active") state = "active";
  else if (reason && PROTECTED_REASONS.has(reason)) state = "protected";

  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    discarded: Boolean(tab.discarded),
    title: tab.title || tab.url || "Без названия",
    url: tab.url || "",
    domain,
    favIconUrl: tab.favIconUrl || "",
    idleMs,
    estimatedMb,
    state,
    reason,
    reasonLabel: reason ? REASON_LABELS[reason] || reason : null
  };
}

export function mergeSettings(stored = {}) {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!stored || typeof stored !== "object") return base;
  const merged = { ...base, ...stored };
  merged.profiles = { ...base.profiles, ...(stored.profiles || {}) };
  merged.protect = { ...base.protect, ...(stored.protect || {}) };
  merged.ramGuard = { ...base.ramGuard, ...(stored.ramGuard || {}) };
  merged.whitelist = Array.isArray(stored.whitelist) ? stored.whitelist.map(normalizeDomain).filter(Boolean).slice(0, 200) : base.whitelist;
  merged.autoSleepMinutes = clamp(merged.autoSleepMinutes, 0, 1440);
  merged.maxPerCycle = clamp(merged.maxPerCycle, 1, 60);
  merged.readingChars = clamp(merged.readingChars, 1500, 30000);
  merged.ramGuard.freePercent = clamp(merged.ramGuard.freePercent, 5, 80);
  if (!PROFILES[merged.activeProfile]) merged.activeProfile = "balanced";
  if (!["dark", "light", "system"].includes(merged.theme)) merged.theme = "dark";
  if (!["cozy", "compact"].includes(merged.density)) merged.density = "cozy";
  for (const key of Object.keys(PROFILES)) {
    merged.profiles[key] = { minutes: clamp(merged.profiles[key]?.minutes ?? PROFILES[key].minutes, 1, 1440) };
  }
  return merged;
}

export function mergeStats(stored = {}) {
  const base = structuredClone(DEFAULT_STATS);
  const merged = { ...base, ...(stored || {}) };
  merged.history = (stored && typeof stored.history === "object" && stored.history) || {};
  merged.sessions = Array.isArray(stored?.sessions) ? stored.sessions : [];
  merged.startedAt = merged.startedAt || new Date().toISOString();
  return merged;
}

export function scheduleSignature(settings) {
  return JSON.stringify([settings.autoSleepMinutes, settings.activeProfile, settings.profiles, settings.protect, settings.ramGuard, settings.maxPerCycle]);
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function lastDays(count) {
  const formatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
  const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (count - 1 - index));
    return {
      key: dayKey(date),
      label: count <= 10 ? formatter.format(date).replace(".", "") : shortDate.format(date).replace(".", ""),
      date
    };
  });
}

export function pruneHistory(history, keep = 120) {
  const keys = Object.keys(history).sort();
  const excess = keys.length - keep;
  if (excess <= 0) return history;
  const next = { ...history };
  for (const key of keys.slice(0, excess)) delete next[key];
  return next;
}

export function pluralRu(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function tabsWord(count) {
  return pluralRu(count, "вкладка", "вкладки", "вкладок");
}

export function formatMb(value) {
  const mb = Math.max(0, Math.round(Number(value) || 0));
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace(".", ",")} ГБ`;
  return `${mb} МБ`;
}

export function formatBytes(bytes) {
  return `${(Number(bytes || 0) / 1073741824).toFixed(1).replace(".", ",")} ГБ`;
}

export function formatIdle(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${minutes % 60} мин`;
  return `${Math.floor(hours / 24)} дн`;
}

export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Сессия";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function hueFromString(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 360;
  return hash;
}