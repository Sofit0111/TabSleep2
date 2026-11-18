import { call, subscribe, MODE, download } from "./platform.js";
import { h, icon, clear, renderBars, toast, confirmDialog, switchRow, stepper, slider, applyTheme, badge, emptyState } from "./ui.js";
import { PROFILES, formatMb, formatBytes, formatDateTime, lastDays, tabsWord, clamp } from "./core.js";

const el = Object.fromEntries([
  "modeChip", "themeToggle", "exportTop", "heroChips", "metricNow", "metricSleep", "metricTotal", "metricCycles", "metricRam", "ramFill",
  "profileCards", "profileSummary", "runCycle", "copyShortcuts", "behaviorHint", "minutesRange", "minutesStepper", "profileMinutes",
  "maxPerCycle", "ramGuardToggle", "ramGuardField", "ramGuardRange", "ramGuardValue", "protectToggles", "readingField", "readingRange",
  "readingValue", "whitelistHint", "whitelistInput", "whitelistAdd", "whitelistChips", "saveSession", "sessionList", "statsRange",
  "statsChart", "statGrid", "themeSelect", "densitySelect", "uiToggles", "exportBtn", "importBtn", "resetStats", "resetSettings",
  "importFile", "dataHint", "navLinks"
].map((id) => [id, document.getElementById(id)]));

const state = { snap: null, range: 7, rendering: false };

async function refresh() {
  try { state.snap = await call("snapshot"); }
  catch (error) { toast(error.message, { tone: "danger" }); return; }
  applyTheme(state.snap.settings);
  render();
}

async function patch(changes, message) {
  try {
    await call("settings.patch", { patch: changes });
    state.snap = await call("snapshot");
    applyTheme(state.snap.settings);
    render();
    if (message) toast(message);
  } catch (error) { toast(error.message, { tone: "danger" }); }
}

function render() {
  const snap = state.snap;
  if (!snap) return;
  state.rendering = true;
  renderHero(snap);
  renderProfiles(snap);
  renderBehavior(snap);
  renderProtect(snap);
  renderWhitelist(snap);
  renderSessions(snap);
  renderStats(snap);
  renderInterface(snap);
  clear(el.themeToggle);
  el.themeToggle.append(icon(document.body.classList.contains("dark") ? "sun" : "moon", 16));
  state.rendering = false;
}

function renderHero(snap) {
  el.modeChip.textContent = MODE === "demo" ? "Демо-режим" : `Версия ${snap.version}`;
  el.metricNow.textContent = `≈ ${formatMb(snap.live.freedNowMb)}`;
  el.metricSleep.textContent = `${snap.live.sleeping} ${tabsWord(snap.live.sleeping)} спят из ${snap.live.total}`;
  el.metricTotal.textContent = `≈ ${formatMb(snap.stats.freedMb)}`;
  el.metricCycles.textContent = `${snap.stats.sleepCount} усыплений · ${snap.stats.wakeCount} пробуждений`;
  if (snap.memory) {
    const used = ((snap.memory.capacity - snap.memory.available) / snap.memory.capacity) * 100;
    el.metricRam.textContent = `${formatBytes(snap.memory.available)} свободно`;
    el.ramFill.style.width = `${clamp(used, 0, 100)}%`;
  } else {
    el.metricRam.textContent = "недоступно";
    el.ramFill.style.width = "0%";
  }
  clear(el.heroChips);
  el.heroChips.append(
    badge(`Профиль: ${PROFILES[snap.settings.activeProfile].label}`, "mint"),
    badge(snap.settings.autoSleepMinutes ? `Таймер ${snap.settings.autoSleepMinutes} мин` : "Автоусыпление выключено", snap.settings.autoSleepMinutes ? "blue" : "amber"),
    badge(`${snap.live.protected} под защитой`, "amber"),
    badge(`${snap.settings.whitelist.length} доменов в списке`, "violet")
  );
}

function renderProfiles(snap) {
  clear(el.profileCards);
  for (const profile of Object.values(PROFILES)) {
    const active = snap.settings.activeProfile === profile.id;
    el.profileCards.append(h("button", {
      class: `profile-card ${profile.id} ${active ? "active" : ""}`,
      type: "button",
      onclick: () => patch({ activeProfile: profile.id, autoSleepMinutes: snap.settings.profiles[profile.id].minutes }, `Профиль «${profile.label}» включён`)
    },
      h("span", {}, h("strong", { text: profile.label }), h("small", { text: `${snap.settings.profiles[profile.id].minutes} мин простоя` })),
      active ? icon("check", 16) : icon("chevron", 14)
    ));
  }
  el.profileSummary.textContent = PROFILES[snap.settings.activeProfile].hint;
}

function renderBehavior(snap) {
  const settings = snap.settings;
  el.behaviorHint.textContent = settings.autoSleepMinutes ? `Следующая проверка через ${settings.autoSleepMinutes} мин` : "Будильник остановлен";

  clear(el.minutesStepper);
  el.minutesStepper.append(stepper({ value: settings.autoSleepMinutes, min: 0, max: 1440, step: 5, suffix: "мин", onChange: (value) => patch({ autoSleepMinutes: value }, value ? `Таймер: ${value} мин` : "Автоусыпление выключено") }));
  clear(el.minutesRange);
  const range = slider({ value: Math.min(settings.autoSleepMinutes, 120), min: 0, max: 120, step: 1, label: "Таймер простоя", onInput: (value) => { el.behaviorHint.textContent = value ? `Сон через ${value} мин простоя` : "Автоусыпление выключено"; } });
  range.addEventListener("change", () => patch({ autoSleepMinutes: Number(range.value) }));
  el.minutesRange.append(range);

  clear(el.profileMinutes);
  for (const profile of Object.values(PROFILES)) {
    el.profileMinutes.append(h("div", { class: "profile-minute" },
      h("span", { text: profile.label }),
      stepper({
        value: settings.profiles[profile.id].minutes, min: 1, max: 1440, step: 1, suffix: "мин",
        onChange: (value) => {
          const profiles = { ...settings.profiles, [profile.id]: { minutes: value } };
          const extra = settings.activeProfile === profile.id ? { autoSleepMinutes: value } : {};
          patch({ profiles, ...extra }, `${profile.label}: ${value} мин`);
        }
      })
    ));
  }

  clear(el.maxPerCycle);
  el.maxPerCycle.append(stepper({ value: settings.maxPerCycle, min: 1, max: 60, step: 1, suffix: "шт", onChange: (value) => patch({ maxPerCycle: value }) }));

  clear(el.ramGuardToggle);
  el.ramGuardToggle.append(switchRow({
    label: "Усыплять только при нехватке памяти",
    hint: "Пока свободной RAM достаточно, вкладки остаются активными",
    checked: settings.ramGuard.enabled,
    onChange: (checked) => patch({ ramGuard: { ...settings.ramGuard, enabled: checked } }, checked ? "Режим экономии по RAM включён" : "Режим экономии по RAM выключен")
  }));
  el.ramGuardField.hidden = !settings.ramGuard.enabled;
  clear(el.ramGuardRange);
  const guardRange = slider({ value: settings.ramGuard.freePercent, min: 5, max: 80, step: 1, label: "Порог свободной памяти", onInput: (value) => { el.ramGuardValue.textContent = `${value}%`; } });
  guardRange.addEventListener("change", () => patch({ ramGuard: { ...settings.ramGuard, freePercent: Number(guardRange.value) } }));
  el.ramGuardRange.append(guardRange);
  el.ramGuardValue.textContent = `${settings.ramGuard.freePercent}%`;
}

const PROTECT_ROWS = [
  ["pinned", "Закреплённые вкладки", "Pinned-вкладки почти всегда нужны под рукой"],
  ["audible", "Вкладки со звуком", "Chrome сообщает о звуке на уровне вкладки"],
  ["activeWindow", "Все вкладки активного окна", "Спит только то, что в фоновых окнах"],
  ["forms", "Несохранённые формы и текст", "Сравнивается value с defaultValue, учитывается contenteditable"],
  ["media", "Работающие плееры", "Проверяется !paused и currentTime, а не просто наличие тега"],
  ["uploads", "Выбранные для загрузки файлы", "input[type=file] с файлами не даст вкладке уснуть"],
  ["reading", "Лонгриды в профиле «Чтение»", "Длинные статьи остаются загруженными"]
];

function renderProtect(snap) {
  clear(el.protectToggles);
  for (const [key, label, hint] of PROTECT_ROWS) {
    el.protectToggles.append(switchRow({
      label, hint, checked: snap.settings.protect[key],
      onChange: (checked) => patch({ protect: { ...snap.settings.protect, [key]: checked } }, `${label}: ${checked ? "защищено" : "разрешено"}`)
    }));
  }
  el.readingField.hidden = !snap.settings.protect.reading;
  clear(el.readingRange);
  const reading = slider({ value: snap.settings.readingChars, min: 2000, max: 20000, step: 500, label: "Порог лонгрида", onInput: (value) => { el.readingValue.textContent = String(value); } });
  reading.addEventListener("change", () => patch({ readingChars: Number(reading.value) }));
  el.readingRange.append(reading);
  el.readingValue.textContent = String(snap.settings.readingChars);
}

function renderWhitelist(snap) {
  const list = snap.settings.whitelist;
  el.whitelistHint.textContent = `${list.length} ${list.length === 1 ? "домен" : list.length >= 2 && list.length <= 4 ? "домена" : "доменов"}`;
  clear(el.whitelistChips);
  if (!list.length) { el.whitelistChips.append(emptyState("Список пуст", "Добавьте домены, которые никогда не должны засыпать")); return; }
  for (const domain of list) {
    el.whitelistChips.append(h("span", { class: "white-chip" },
      icon("shield", 13), domain,
      h("button", { type: "button", "aria-label": `Убрать ${domain}`, onclick: async () => { await call("whitelist.remove", { domain }); toast(`${domain} убран из списка`); refresh(); } }, icon("close", 12))
    ));
  }
}

async function addWhitelistFromInput() {
  const raw = el.whitelistInput.value;
  const parts = raw.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  if (!parts.length) return;
  let added = 0;
  for (const part of parts) {
    try { const result = await call("whitelist.add", { domain: part }); if (result.added) added += 1; }
    catch (error) { toast(error.message, { tone: "danger" }); }
  }
  el.whitelistInput.value = "";
  if (added) toast(`Добавлено доменов: ${added}`);
  refresh();
}

function renderSessions(snap) {
  const sessions = snap.stats.sessions;
  clear(el.sessionList);
  if (!sessions.length) { el.sessionList.append(emptyState("Сохранённых сессий пока нет", "Нажмите «Сохранить текущую», чтобы освободить память целиком")); return; }
  for (const session of sessions) {
    el.sessionList.append(h("article", { class: "session-row" },
      h("div", {},
        h("div", { class: "session-title", text: formatDateTime(session.createdAt) }),
        h("div", { class: "session-meta", text: `${session.count} ${tabsWord(session.count)} · ${session.windows.length} ${session.windows.length === 1 ? "окно" : "окна"}` }),
        h("div", { class: "session-domains" }, ...(session.domains || []).slice(0, 5).map((domain) => badge(domain, "neutral")))
      ),
      h("div", { class: "session-actions" },
        h("button", { class: "btn small primary", type: "button", onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try { const result = await call("sessions.restore", { sessionId: session.id }); toast(`Восстановлено вкладок: ${result.count}`); refresh(); }
          catch (error) { toast(error.message, { tone: "danger" }); }
          finally { button.disabled = false; }
        } }, icon("refresh", 13), "Восстановить"),
        h("button", { class: "btn small ghost", type: "button", "aria-label": "Удалить сессию", onclick: async () => {
          const ok = await confirmDialog({ title: "Удалить сессию?", body: `${session.count} ${tabsWord(session.count)} будут удалены из списка безвозвратно.`, confirmLabel: "Удалить", tone: "danger" });
          if (!ok) return;
          await call("sessions.delete", { sessionId: session.id });
          toast("Сессия удалена", { tone: "warn" });
          refresh();
        } }, icon("trash", 13))
      )
    ));
  }
}

function renderStats(snap) {
  clear(el.statsRange);
  for (const days of [7, 30]) {
    el.statsRange.append(h("button", { class: `chip ${state.range === days ? "active" : ""}`, type: "button", onclick: () => { state.range = days; renderStats(snap); } }, `${days} дней`));
  }
  const entries = lastDays(state.range).map((day) => ({ label: day.label, value: Number(snap.stats.history[day.key] || 0) }));
  renderBars(el.statsChart, entries, { width: 640, height: 200 });
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const best = entries.reduce((max, entry) => Math.max(max, entry.value), 0);
  clear(el.statGrid);
  const tiles = [
    [`За ${state.range} дней`, `≈ ${formatMb(total)}`],
    ["Лучший день", `≈ ${formatMb(best)}`],
    ["Усыплений всего", String(snap.stats.sleepCount)],
    ["Сессий сохранено", String(snap.stats.sessions.length)]
  ];
  for (const [label, value] of tiles) el.statGrid.append(h("div", { class: "stat-tile" }, h("span", { text: label }), h("strong", { text: value })));
  el.dataHint.textContent = `Статистика ведётся с ${formatDateTime(snap.stats.startedAt)}. Оценка памяти модельная, системная RAM — реальные данные браузера.`;
}

function renderInterface(snap) {
  el.themeSelect.value = snap.settings.theme;
  el.densitySelect.value = snap.settings.density;
  clear(el.uiToggles);
  el.uiToggles.append(
    switchRow({ label: "Анимации интерфейса", hint: "Отключите, если предпочитаете статичный UI", checked: snap.settings.motion, onChange: (checked) => patch({ motion: checked }) }),
    switchRow({ label: "Счётчик спящих вкладок на иконке", hint: "Бейдж chrome.action обновляется при каждом изменении", checked: snap.settings.badge, onChange: (checked) => patch({ badge: checked }, checked ? "Бейдж включён" : "Бейдж выключен") })
  );
}

function bind() {
  el.themeToggle.addEventListener("click", () => patch({ theme: document.body.classList.contains("dark") ? "light" : "dark" }));
  el.themeSelect.addEventListener("change", () => patch({ theme: el.themeSelect.value }, "Тема сохранена"));
  el.densitySelect.addEventListener("change", () => patch({ density: el.densitySelect.value }, "Плотность сохранена"));
  el.whitelistAdd.prepend(icon("plus", 14));
  el.whitelistAdd.addEventListener("click", addWhitelistFromInput);
  el.whitelistInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addWhitelistFromInput(); } });

  el.runCycle.prepend(icon("refresh", 14));
  el.runCycle.addEventListener("click", async () => {
    const result = await call("cycle.run");
    toast(result.count ? `Усыплено вкладок: ${result.count}` : result.skipped === "ram" ? "Памяти пока хватает — усыпление не требуется" : result.skipped === "off" ? "Автоусыпление выключено" : "Нет вкладок, готовых ко сну", { tone: result.count ? "ok" : "warn" });
    refresh();
  });

  el.copyShortcuts.prepend(icon("copy", 14));
  el.copyShortcuts.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText("chrome://extensions/shortcuts"); toast("Адрес скопирован — вставьте его в адресную строку"); }
    catch { toast("Скопируйте вручную: chrome://extensions/shortcuts", { tone: "warn" }); }
  });

  el.saveSession.prepend(icon("archive", 14));
  el.saveSession.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Сохранить и закрыть вкладки?", body: "Все доступные вкладки будут сохранены в сессию и закрыты. Действие можно отменить сразу после выполнения.", confirmLabel: "Сохранить и закрыть" });
    if (!ok) return;
    const result = await call("sessions.save", { close: true });
    toast(`Сессия сохранена: ${result.count}`, { actionLabel: "Отменить", onAction: async () => { const undone = await call("undo", { undoId: result.undoId }); toast(`Возвращено вкладок: ${undone.count}`); refresh(); } });
    refresh();
  });

  const doExport = async () => {
    const data = await call("state.export");
    download(`memory-nap-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    toast("Резервная копия скачана");
  };
  el.exportTop.prepend(icon("download", 14));
  el.exportTop.addEventListener("click", doExport);
  el.exportBtn.prepend(icon("download", 14));
  el.exportBtn.addEventListener("click", doExport);

  el.importBtn.prepend(icon("upload", 14));
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async () => {
    const file = el.importFile.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await call("state.import", { data });
      toast("Настройки восстановлены из копии");
      refresh();
    } catch (error) { toast(error.message || "Не удалось прочитать файл", { tone: "danger" }); }
    finally { el.importFile.value = ""; }
  });

  el.resetStats.prepend(icon("refresh", 14));
  el.resetStats.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Очистить статистику?", body: "Счётчики и график обнулятся. Сохранённые сессии останутся на месте.", confirmLabel: "Очистить", tone: "danger" });
    if (!ok) return;
    await call("stats.reset");
    toast("Статистика очищена", { tone: "warn" });
    refresh();
  });

  el.resetSettings.prepend(icon("alert", 14));
  el.resetSettings.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Сбросить все настройки?", body: "Профили, защита, белый список и оформление вернутся к значениям по умолчанию.", confirmLabel: "Сбросить", tone: "danger" });
    if (!ok) return;
    await call("settings.reset");
    toast("Настройки сброшены", { tone: "warn" });
    refresh();
  });

  const links = [...el.navLinks.querySelectorAll("a")];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
    }
  }, { rootMargin: "-90px 0px -65% 0px", threshold: 0 });
  document.querySelectorAll(".block").forEach((section) => observer.observe(section));
  links[0]?.classList.add("active");
}

async function init() {
  bind();
  await refresh();
  subscribe(() => { if (!state.rendering) refresh(); });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state.snap?.settings.theme === "system") refresh(); });
}

init();