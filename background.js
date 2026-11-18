import { createEngine, createRouter } from "./engine.js";
import { ALARM_NAME, DEFAULT_SETTINGS, DEFAULT_STATS, scheduleSignature, clamp } from "./core.js";

const engine = createEngine(chrome);
const route = createRouter(engine);
let lastSignature = "";
let badgeTimer = null;

async function schedule(minutes) {
  await chrome.alarms.clear(ALARM_NAME);
  const period = clamp(minutes, 0, 1440);
  if (period > 0) {
    const safePeriod = Math.max(1, period);
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: safePeriod, periodInMinutes: safePeriod });
  }
}

async function syncAlarm() {
  const settings = await engine.getSettings();
  const signature = scheduleSignature(settings);
  if (signature === lastSignature) return;
  lastSignature = signature;
  await schedule(settings.autoSleepMinutes);
}

async function updateBadge() {
  try {
    const settings = await engine.getSettings();
    if (!settings.badge) { await chrome.action.setBadgeText({ text: "" }); return; }
    const tabs = await chrome.tabs.query({});
    const sleeping = tabs.filter((tab) => tab.discarded).length;
    await chrome.action.setBadgeBackgroundColor({ color: "#12b886" });
    await chrome.action.setBadgeTextColor({ color: "#04140f" }).catch(() => {});
    await chrome.action.setBadgeText({ text: sleeping ? String(sleeping) : "" });
    await chrome.action.setTitle({ title: sleeping ? `Memory Nap — спят ${sleeping} вкладок` : "Memory Nap Tabs" });
  } catch { /* окно могло закрыться */ }
}

function queueBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(updateBadge, 350);
}

async function buildMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: "nap.sleep", title: "Усыпить эту вкладку", contexts: ["page"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
  chrome.contextMenus.create({ id: "nap.others", title: "Усыпить все неактивные вкладки", contexts: ["page", "action"] });
  chrome.contextMenus.create({ id: "nap.wake", title: "Разбудить все вкладки", contexts: ["action"] });
  chrome.contextMenus.create({ id: "nap.sep", type: "separator", contexts: ["page"] });
  chrome.contextMenus.create({ id: "nap.white", title: "Добавить домен в белый список", contexts: ["page", "link"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(null)) });
  await chrome.storage.local.set({ ...DEFAULT_STATS, ...(await chrome.storage.local.get(null)) });
  await engine.migrateLegacy();
  await buildMenus();
  lastSignature = "";
  await syncAlarm();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await buildMenus();
  lastSignature = "";
  await syncAlarm();
  await updateBadge();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await engine.runAutoCycle();
  await updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  syncAlarm();
  if (changes.badge || changes.theme) queueBadge();
});

chrome.tabs.onActivated.addListener(({ tabId }) => { engine.touchTab(tabId); queueBadge(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) engine.touchTab(tabId);
  if (changeInfo.discarded !== undefined || changeInfo.audible !== undefined) queueBadge();
});
chrome.tabs.onCreated.addListener(queueBadge);
chrome.tabs.onRemoved.addListener((tabId) => { engine.forgetTab(tabId); queueBadge(); });
chrome.windows.onFocusChanged.addListener(queueBadge);

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "discard-current-tab") await engine.discardCurrent();
  if (command === "discard-inactive-tabs") await engine.discardInactive();
  if (command === "wake-all-tabs") await engine.wakeAll();
  await updateBadge();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "nap.sleep" && tab?.id) await engine.discardTabs([tab.id]);
  if (info.menuItemId === "nap.others") await engine.discardInactive();
  if (info.menuItemId === "nap.wake") await engine.wakeAll();
  if (info.menuItemId === "nap.white") {
    const source = info.linkUrl || info.pageUrl || tab?.url || "";
    try { await engine.addWhitelist(source); } catch (error) { console.warn("[memory-nap]", error.message); }
  }
  await updateBadge();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) { sendResponse({ error: "Отклонено: внешний отправитель" }); return false; }
  route(message?.action, message?.payload || {})
    .then((data) => sendResponse({ data }))
    .catch((error) => sendResponse({ error: error?.message || "Неизвестная ошибка" }))
    .finally(queueBadge);
  return true;
});