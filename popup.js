import { call, subscribe, openOptions, MODE } from "./platform.js";
import { h, s, icon, clear, favicon, avatar, setRing, renderBars, toast, confirmDialog, stepper, slider, applyTheme, badge, emptyState } from "./ui.js";
import { PROFILES, formatMb, formatBytes, formatIdle, lastDays, tabsWord, clamp } from "./core.js";

const el = {
  modeChip: document.getElementById("modeChip"),
  ramPill: document.getElementById("ramPill"),
  ramPillText: document.getElementById("ramPillText"),
  themeToggle: document.getElementById("themeToggle"),
  openOptions: document.getElementById("openOptions"),
  scrollArea: document.getElementById("scrollArea"),
  freedNow: document.getElementById("freedNow"),
  heroSub: document.getElementById("heroSub"),
  heroMeter: document.getElementById("heroMeter"),
  ramText: document.getElementById("ramText"),
  ramFill: document.getElementById("ramFill"),
  ringProgress: document.getElementById("ringProgress"),
  ringPercent: document.getElementById("ringPercent"),
  profileStrip: document.getElementById("profileStrip"),
  timerNote: document.getElementById("timerNote"),
  timerStepper: document.getElementById("timerStepper"),
  timerSlider: document.getElementById("timerSlider"),
  totalTabs: document.getElementById("totalTabs"),
  readyTabs: document.getElementById("readyTabs"),
  protectedTabs: document.getElementById("protectedTabs"),
  weekTotal: document.getElementById("weekTotal"),
  historyChart: document.getElementById("historyChart"),
  domainsHint: document.getElementById("domainsHint"),
  domainList: document.getElementById("domainList"),
  tabsHint: document.getElementById("tabsHint"),
  tabSearch: document.getElementById("tabSearch"),
  sortSelect: document.getElementById("sortSelect"),
  filterChips: document.getElementById("filterChips"),
  bulkBar: document.getElementById("bulkBar"),
  tabsList: document.getElementById("tabsList"),
  moreBtn: document.getElementById("moreBtn"),
  sleepCurrent: document.getElementById("sleepCurrent"),
  sleepInactive: document.getElementById("sleepInactive"),
  wakeAll: document.getElementById("wakeAll"),
  saveSession: document.getElementById("saveSession"),
  statusText: document.getElementById("statusText")
};

const state = { snap: null, filter: "all", query: "", sort: "idle", selected: new Set(), limit: 30, busy: false };
let statusTimer = null;

function setStatus(text) {
  el.statusText.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.statusText.textContent = "Готово"; }, 3600);
}

function setBusy(busy) {
  state.busy = busy;
  [el.sleepCurrent, el.sleepInactive, el.wakeAll, el.saveSession].forEach((button) => { button.disabled = busy; });
}

async function refresh() {
  const scrollTop = el.scrollArea.scrollTop;
  try {
    state.snap = await call("snapshot");
  } catch (error) {
    setStatus(error.message);
    return;
  }
  const ids = new Set(state.snap.tabs.map((tab) => tab.id));
  state.selected = new Set([...state.selected].filter((id) => ids.has(id)));
  applyTheme(state.snap.settings);
  renderAll();
  el.scrollArea.scrollTop = scrollTop;
}

async function run(action, payload, message) {
  setBusy(true);
  setStatus("Выполняется…");
  try {
    const result = await call(action, payload);
    await refresh();
    const count = result?.count ?? 0;
    if (message) {
      const text = typeof message === "function" ? message(count, result) : `${message}: ${count}`;
      if (result?.undoId && count > 0) {
        toast(text, { actionLabel: "Отменить", onAction: async () => { const undone = await call("undo", { undoId: result.undoId }); await refresh(); toast(`Возвращено: ${undone.count}`); } });
      } else {
        toast(text, { tone: count ? "ok" : "warn" });
      }
      setStatus(text);
    }
    return result;
  } catch (error) {
    toast(error.message, { tone: "danger" });
    setStatus(error.message);
    return null;
  } finally {
    setBusy(false);
  }
}

function renderAll() {
  const snap = state.snap;
  if (!snap) return;
  renderHeader(snap);
  renderHero(snap);
  renderProfiles(snap);
  renderTimer(snap);
  renderStats(snap);
  renderChart(snap);
  renderDomains(snap);
  renderFilters(snap);
  renderBulk();
  renderTabs(snap);
  el.sleepInactive.disabled = state.busy || snap.live.ready === 0;
  el.wakeAll.disabled = state.busy || snap.live.sleeping === 0;
  el.saveSession.disabled = state.busy || snap.tabs.every((tab) => !/^https?:|^file:/i.test(tab.url));
}

function renderHeader(snap) {
  el.modeChip.textContent = MODE === "demo" ? "Демо-режим" : `v${snap.version}`;
  el.modeChip.title = MODE === "demo" ? "Вне Chrome интерфейс работает на демонстрационных данных" : "Memory Nap Tabs";
  clear(el.themeToggle);
  el.themeToggle.append(icon(document.body.classList.contains("dark") ? "sun" : "moon", 16));
  if (snap.memory) {
    const free = snap.memory.available / 1073741824;
    el.ramPillText.textContent = `${free.toFixed(1).replace(".", ",")} ГБ своб.`;
    el.ramPill.hidden = false;
  } else {
    el.ramPill.hidden = true;
  }
}

function renderHero(snap) {
  const { live, memory } = snap;
  el.freedNow.textContent = `≈ ${formatMb(live.freedNowMb)}`;
  el.heroSub.textContent = `${live.sleeping} ${tabsWord(live.sleeping)} спят · ${live.total} открыто`;
  const percent = live.total ? Math.round((live.sleeping / live.total) * 100) : 0;
  el.ringPercent.textContent = `${percent}%`;
  setRing(el.ringProgress, percent);
  if (memory) {
    const usedPercent = clamp(((memory.capacity - memory.available) / memory.capacity) * 100, 0, 100);
    el.ramFill.style.width = `${usedPercent}%`;
    el.ramText.textContent = `свободно ${formatBytes(memory.available)} из ${formatBytes(memory.capacity)}`;
    el.heroMeter.hidden = false;
  } else {
    el.heroMeter.hidden = true;
  }
}

function renderProfiles(snap) {
  clear(el.profileStrip);
  for (const profile of Object.values(PROFILES)) {
    const minutes = snap.settings.profiles[profile.id].minutes;
    const active = snap.settings.activeProfile === profile.id;
    el.profileStrip.append(h("button", {
      class: `profile-btn ${profile.id} ${active ? "active" : ""}`,
      type: "button",
      title: profile.hint,
      "aria-pressed": String(active),
      onclick: () => run("settings.patch", { patch: { activeProfile: profile.id, autoSleepMinutes: minutes } }, () => `Профиль «${profile.label}» · ${minutes} мин`)
    }, h("strong", { text: profile.label }), h("span", { text: `${minutes} мин` })));
  }
}

function renderTimer(snap) {
  const minutes = snap.settings.autoSleepMinutes;
  const commit = (value) => run("settings.patch", { patch: { autoSleepMinutes: clamp(value, 0, 1440) } }, (count, result) => result ? (value ? `Таймер: ${value} мин` : "Автоусыпление выключено") : "");
  el.timerNote.textContent = minutes ? `Через ${minutes} мин простоя` : "Выключено — только вручную";
  el.timerNote.classList.toggle("off", !minutes);
  clear(el.timerStepper);
  el.timerStepper.append(stepper({ value: minutes, min: 0, max: 1440, step: 5, suffix: "мин", onChange: commit }));
  clear(el.timerSlider);
  el.timerSlider.append(slider({ value: Math.min(minutes, 120), min: 0, max: 120, step: 1, label: "Минуты простоя", onInput: (value) => { el.timerNote.textContent = value ? `Через ${value} мин простоя` : "Выключено — только вручную"; el.timerNote.classList.toggle("off", !value); }, }));
  const range = el.timerSlider.firstChild;
  range.addEventListener("change", () => commit(Number(range.value)));
}

function renderStats(snap) {
  el.totalTabs.textContent = String(snap.live.total);
  el.readyTabs.textContent = String(snap.live.ready);
  el.protectedTabs.textContent = String(snap.live.protected);
}

function renderChart(snap) {
  const days = lastDays(7);
  const entries = days.map((day) => ({ label: day.label, value: Number(snap.stats.history[day.key] || 0) }));
  el.weekTotal.textContent = `≈ ${formatMb(entries.reduce((sum, entry) => sum + entry.value, 0))} за неделю`;
  renderBars(el.historyChart, entries);
}

function renderDomains(snap) {
  const groups = new Map();
  for (const tab of snap.tabs) {
    const key = tab.domain || "служебные страницы";
    const group = groups.get(key) || { count: 0, mb: 0, sleeping: 0, white: false };
    group.count += 1;
    group.mb += tab.estimatedMb;
    if (tab.state === "sleeping") group.sleeping += 1;
    if (tab.reason === "white") group.white = true;
    groups.set(key, group);
  }
  const top = [...groups.entries()].sort((a, b) => b[1].mb - a[1].mb).slice(0, 4);
  el.domainsHint.textContent = `${groups.size} ${tabsWord(groups.size) === "вкладка" ? "домен" : "доменов"}`;
  clear(el.domainList);
  if (!top.length) { el.domainList.append(emptyState("Открытых доменов нет")); return; }
  top.forEach(([domain, group], index) => {
    const isSystem = domain === "служебные страницы";
    el.domainList.append(h("div", { class: `domain-row ${index === 0 ? "hot" : ""}` },
      avatar(isSystem ? "system" : domain, 22),
      h("div", { style: { minWidth: "0" } },
        h("div", { class: "domain-name", text: domain }),
        h("div", { class: "domain-meta", text: `≈ ${formatMb(group.mb)} · спят ${group.sleeping}` })
      ),
      h("div", { class: "domain-count", text: String(group.count) }),
      !isSystem && !group.white
        ? h("button", { class: "mini-btn", type: "button", title: "Добавить в белый список", "aria-label": `Добавить ${domain} в белый список`, onclick: () => run("whitelist.add", { domain }, () => `${domain} защищён`) }, icon("shield", 13))
        : h("span", { class: "badge badge-mint", text: group.white ? "защищён" : "системный" })
    ));
  });
}

function renderFilters(snap) {
  const counts = {
    all: snap.tabs.length,
    ready: snap.live.ready,
    sleeping: snap.live.sleeping,
    protected: snap.live.protected
  };
  const labels = { all: "Все", ready: "Готовы", sleeping: "Спят", protected: "Защищены" };
  clear(el.filterChips);
  for (const key of Object.keys(labels)) {
    el.filterChips.append(h("button", {
      class: `chip ${state.filter === key ? "active" : ""}`,
      type: "button",
      onclick: () => { state.filter = key; state.limit = 30; renderFilters(snap); renderTabs(snap); }
    }, labels[key], h("span", { class: "count", text: String(counts[key]) })));
  }
}

function visibleTabs(snap) {
  const query = state.query.trim().toLowerCase();
  let rows = snap.tabs.filter((tab) => {
    if (state.filter === "protected" && !(tab.state === "protected" || tab.state === "active")) return false;
    if (state.filter !== "all" && state.filter !== "protected" && tab.state !== state.filter) return false;
    if (!query) return true;
    return `${tab.title} ${tab.domain} ${tab.url}`.toLowerCase().includes(query);
  });
  const sorters = {
    idle: (a, b) => b.idleMs - a.idleMs,
    memory: (a, b) => b.estimatedMb - a.estimatedMb,
    title: (a, b) => a.title.localeCompare(b.title, "ru"),
    domain: (a, b) => a.domain.localeCompare(b.domain, "ru") || b.idleMs - a.idleMs
  };
  rows = rows.sort(sorters[state.sort] || sorters.idle);
  return rows;
}

function renderTabs(snap) {
  const rows = visibleTabs(snap);
  el.tabsHint.textContent = `${rows.length} из ${snap.tabs.length}`;
  clear(el.tabsList);
  if (!rows.length) {
    el.tabsList.append(emptyState("Ничего не найдено", "Измените запрос или снимите фильтр"));
    el.moreBtn.hidden = true;
    return;
  }
  const slice = rows.slice(0, state.limit);
  const fragment = document.createDocumentFragment();
  for (const tab of slice) fragment.append(tabRow(tab));
  el.tabsList.append(fragment);
  el.moreBtn.hidden = rows.length <= state.limit;
  el.moreBtn.textContent = `Показать ещё ${Math.min(30, rows.length - state.limit)}`;
}

function tabRow(tab) {
  const selected = state.selected.has(tab.id);
  const check = h("input", { type: "checkbox", checked: selected, "aria-label": `Выбрать ${tab.title}` });
  check.addEventListener("change", () => {
    if (check.checked) state.selected.add(tab.id); else state.selected.delete(tab.id);
    row.classList.toggle("selected", check.checked);
    renderBulk();
  });

  const meta = h("div", { class: "tab-meta" },
    h("span", { class: `dot ${tab.state}` }),
    h("span", { text: tab.domain || "системная" }),
    h("span", { text: `· ≈ ${formatMb(tab.estimatedMb)}` }),
    tab.state === "sleeping" ? h("span", { text: "· спит" }) : h("span", { text: `· ${formatIdle(tab.idleMs)}` }),
    tab.reasonLabel && tab.state !== "sleeping" ? h("span", { class: "reason", text: `· ${tab.reasonLabel}` }) : null
  );

  const canSleep = tab.state === "ready" || tab.state === "active";
  const row = h("article", { class: `tab-row ${tab.state === "sleeping" ? "sleeping" : ""} ${selected ? "selected" : ""}`, dataset: { tabId: String(tab.id) } },
    check,
    favicon(tab, 22),
    h("div", { class: "tab-info", title: tab.url, onclick: () => run("tabs.activate", { tabId: tab.id }) },
      h("div", { class: "tab-title", text: tab.title }),
      meta
    ),
    h("div", { class: "tab-actions" },
      h("button", { class: "mini-btn", type: "button", title: "Усыпить", "aria-label": "Усыпить вкладку", disabled: !canSleep, onclick: () => run("tabs.discard", { tabIds: [tab.id] }, (count) => count ? "Вкладка усыплена" : "Вкладка защищена от усыпления") }, icon("moon", 13)),
      h("button", { class: "mini-btn", type: "button", title: "Разбудить", "aria-label": "Разбудить вкладку", disabled: !tab.discarded, onclick: () => run("tabs.wake", { tabIds: [tab.id] }, () => "Вкладка просыпается") }, icon("sun", 13)),
      h("button", { class: "mini-btn danger", type: "button", title: "Закрыть", "aria-label": "Закрыть вкладку", onclick: () => run("tabs.close", { tabIds: [tab.id] }, () => "Вкладка закрыта") }, icon("close", 13))
    )
  );
  return row;
}

function renderBulk() {
  const count = state.selected.size;
  el.bulkBar.hidden = count === 0;
  if (!count) return;
  const ids = [...state.selected];
  clear(el.bulkBar);
  el.bulkBar.append(
    h("span", { class: "bulk-count", text: `Выбрано: ${count}` }),
    h("button", { class: "btn small", type: "button", onclick: () => bulk("tabs.discard", ids, "Усыплено") }, icon("moon", 13), "Сон"),
    h("button", { class: "btn small", type: "button", onclick: () => bulk("tabs.wake", ids, "Разбужено") }, icon("sun", 13), "Подъём"),
    h("button", { class: "btn small danger", type: "button", onclick: () => bulk("tabs.close", ids, "Закрыто") }, icon("trash", 13)),
    h("button", { class: "btn small ghost", type: "button", onclick: () => { state.selected.clear(); renderTabs(state.snap); renderBulk(); } }, "Снять")
  );
}

async function bulk(action, ids, label) {
  const result = await run(action, { tabIds: ids }, (count) => `${label}: ${count}`);
  if (result) { state.selected.clear(); renderTabs(state.snap); renderBulk(); }
}

async function saveSessionFlow() {
  const snap = state.snap;
  const count = snap.tabs.filter((tab) => /^https?:|^file:/i.test(tab.url)).length;
  if (!count) { toast("Нет вкладок, которые можно сохранить", { tone: "warn" }); return; }
  const answer = await confirmDialog({
    title: "Сохранить сессию",
    body: `В сессию попадут ${count} ${tabsWord(count)} со структурой окон и закреплёнными вкладками. Системные страницы Chrome сохранены не будут.`,
    confirmLabel: "Сохранить и закрыть",
    extra: (setValue) => {
      setValue(true);
      const input = h("input", { type: "checkbox", checked: true });
      input.addEventListener("change", () => setValue(input.checked));
      return h("label", { class: "switch-row modal-extra" }, h("span", { class: "switch-copy" }, h("span", { class: "switch-label", text: "Закрыть вкладки после сохранения" }), h("span", { class: "switch-hint", text: "Освободит память немедленно, сессию можно восстановить" })), input);
    }
  });
  if (!answer) return;
  const close = answer.value !== false;
  await run("sessions.save", { close }, (n) => close ? `Сессия сохранена, закрыто ${n}` : `Сессия сохранена: ${n}`);
}

function bind() {
  el.themeToggle.addEventListener("click", async () => {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    await run("settings.patch", { patch: { theme: next } });
  });
  el.openOptions.append(icon("sliders", 16));
  el.openOptions.addEventListener("click", openOptions);
  document.querySelector(".search-icon").append(icon("search", 14));
  el.sleepCurrent.prepend(icon("bolt", 14));
  el.sleepInactive.prepend(icon("moon", 14));
  el.wakeAll.prepend(icon("sun", 14));
  el.saveSession.prepend(icon("archive", 14));

  el.sleepCurrent.addEventListener("click", () => run("tabs.discardCurrent", {}, (count) => count ? "Текущая вкладка усыплена" : "Текущая вкладка защищена"));
  el.sleepInactive.addEventListener("click", () => run("tabs.discardInactive", {}, (count) => count ? `Усыплено вкладок: ${count}` : "Нет вкладок, готовых ко сну"));
  el.wakeAll.addEventListener("click", () => run("tabs.wakeAll", {}, (count) => `Разбужено: ${count}`));
  el.saveSession.addEventListener("click", saveSessionFlow);

  el.tabSearch.addEventListener("input", () => { state.query = el.tabSearch.value; state.limit = 30; renderTabs(state.snap); });
  el.sortSelect.addEventListener("change", () => { state.sort = el.sortSelect.value; renderTabs(state.snap); });
  el.moreBtn.addEventListener("click", () => { state.limit += 30; renderTabs(state.snap); });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== el.tabSearch) { event.preventDefault(); el.tabSearch.focus(); }
    if (event.key === "Escape" && document.activeElement === el.tabSearch) { el.tabSearch.value = ""; state.query = ""; renderTabs(state.snap); el.tabSearch.blur(); }
  });
}

async function init() {
  bind();
  await refresh();
  subscribe(refresh);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state.snap?.settings.theme === "system") refresh(); });
}

init();