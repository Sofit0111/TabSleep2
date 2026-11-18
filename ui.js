import { CHART_HUES, RING_LENGTH, formatMb, hueFromString } from "./core.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = String(value);
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

export function s(tag, props = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "text") el.textContent = String(value);
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children.flat(4)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) { while (node?.firstChild) node.removeChild(node.firstChild); }

const ICONS = {
  moon: ["M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3Z"],
  sun: ["M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.5 1.5M16.2 16.2l1.5 1.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5", "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  bolt: ["M13 3 5 14h6l-1 7 8-11h-6l1-7Z"],
  close: ["M6 6l12 12M18 6 6 18"],
  plus: ["M12 5v14M5 12h14"],
  minus: ["M5 12h14"],
  search: ["M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z", "M20 20l-3.7-3.7"],
  sliders: ["M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1", "M15 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", "M9 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", "M17 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"],
  trash: ["M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"],
  archive: ["M3 4h18v4H3zM5 8v12h14V8M10 12h4"],
  shield: ["M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z", "M9 12l2 2 4-4"],
  check: ["M5 13l4 4L19 7"],
  chevron: ["M6 9l6 6 6-6"],
  download: ["M12 4v10M8 11l4 4 4-4M4 19h16"],
  upload: ["M12 20V10M8 13l4-4 4 4M4 5h16"],
  undo: ["M4 9h10a5 5 0 0 1 0 10H9M4 9l4-4M4 9l4 4"],
  alert: ["M12 4l9 16H3L12 4Z", "M12 10v4M12 17h.01"],
  info: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 11v5M12 8h.01"],
  lock: ["M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z"],
  wave: ["M3 12h3l2-6 3 13 3-9 2 4h5"],
  chip: ["M6 6h12v12H6zM9.5 9.5h5v5h-5", "M3 10h3M3 14h3M18 10h3M18 14h3M10 3v3M14 3v3M10 18v3M14 18v3"],
  copy: ["M9 9h11v11H9zM4 15V4h11"],
  external: ["M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"],
  filter: ["M4 6h16M7 12h10M10 18h4"],
  clock: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 7v5l3 2"],
  spark: ["M12 3l2.1 6L20 11l-5.9 2L12 19l-2.1-6L4 11l5.9-2L12 3Z"],
  keyboard: ["M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10"],
  refresh: ["M20.5 12a8.5 8.5 0 1 1-2.9-6.4M20.5 4v5h-5"],
  pin: ["M9 3h6M12 3v7M8 10h8l2 5H6l2-5M12 15v6"],
  globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"],
  play: ["M8 5l11 7-11 7z"],
  eye: ["M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12Z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"]
};

export function icon(name, size = 16) {
  const paths = ICONS[name] || ICONS.info;
  return s("svg", { class: "icon", width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" },
    ...paths.map((d) => s("path", { d, stroke: "currentColor", "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round" }))
  );
}

export function avatar(domain, size = 22) {
  const letter = (domain || "?").replace(/^www\./, "").charAt(0).toUpperCase() || "?";
  const hue = hueFromString(domain || "system");
  return h("span", {
    class: "avatar",
    style: { width: `${size}px`, height: `${size}px`, background: `linear-gradient(140deg, hsl(${hue} 78% 52%), hsl(${(hue + 48) % 360} 82% 42%))`, fontSize: `${Math.round(size * 0.5)}px` },
    text: letter
  });
}

export function favicon(tab, size = 22) {
  if (!tab.favIconUrl) return avatar(tab.domain || "system", size);
  const img = h("img", { class: "avatar-img", src: tab.favIconUrl, alt: "", width: size, height: size, loading: "lazy", style: { width: `${size}px`, height: `${size}px` } });
  img.addEventListener("error", () => img.replaceWith(avatar(tab.domain || "system", size)), { once: true });
  return img;
}

export function setRing(circle, percent) {
  const value = Math.max(0, Math.min(100, percent));
  circle.style.strokeDashoffset = String(RING_LENGTH - (RING_LENGTH * value) / 100);
}

export function renderBars(svg, entries, { width = 320, height = 112 } = {}) {
  clear(svg);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const pad = { top: 16, bottom: 24, left: 8, right: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...entries.map((entry) => entry.value), 1);
  const slot = innerW / Math.max(entries.length, 1);
  const barW = Math.max(3, Math.min(26, slot * 0.58));
  const dense = entries.length > 10;

  for (const ratio of [0, 0.5, 1]) {
    const y = pad.top + innerH * ratio;
    svg.append(s("line", { class: "chart-grid", x1: pad.left, y1: y, x2: width - pad.right, y2: y }));
  }

  entries.forEach((entry, index) => {
    const x = pad.left + slot * index + (slot - barW) / 2;
    const barH = Math.max(3, (entry.value / max) * innerH);
    const y = pad.top + innerH - barH;
    const hue = CHART_HUES[index % CHART_HUES.length];
    const group = s("g", { class: "chart-bar" });
    group.append(s("rect", { x, y, width: barW, height: barH, rx: Math.min(5, barW / 2), fill: hue, opacity: entry.value ? 0.92 : 0.28 }));
    group.append(s("rect", { x, y, width: barW, height: Math.min(4, barH), rx: 2, fill: "#ffffff", opacity: 0.35 }));
    group.append(s("title", { text: `${entry.label}: ${formatMb(entry.value)}` }));
    if (!dense || entry.value === max) {
      if (entry.value > 0) group.append(s("text", { class: "chart-value", x: x + barW / 2, y: y - 5, "text-anchor": "middle", text: formatMb(entry.value).replace(" ", "") }));
    }
    if (!dense || index % 5 === 0 || index === entries.length - 1) {
      group.append(s("text", { class: "chart-label", x: x + barW / 2, y: height - 8, "text-anchor": "middle", text: entry.label }));
    }
    svg.append(group);
  });
}

let toastLayer = null;
export function toast(message, { tone = "ok", actionLabel, onAction, timeout = 5200 } = {}) {
  if (!toastLayer) {
    toastLayer = document.getElementById("toastLayer");
    if (!toastLayer) { toastLayer = h("div", { class: "toast-layer", id: "toastLayer" }); document.body.append(toastLayer); }
  }
  const iconName = tone === "danger" ? "alert" : tone === "warn" ? "info" : "check";
  const node = h("div", { class: `toast toast-${tone}`, role: "status" },
    h("span", { class: "toast-icon" }, icon(iconName, 15)),
    h("span", { class: "toast-text", text: message }),
    actionLabel ? h("button", {
      class: "toast-action", type: "button",
      onclick: async () => { node.remove(); try { await onAction?.(); } catch (error) { toast(error.message, { tone: "danger" }); } }
    }, actionLabel) : null,
    h("button", { class: "toast-close", type: "button", "aria-label": "Закрыть уведомление", onclick: () => node.remove() }, icon("close", 13))
  );
  toastLayer.append(node);
  requestAnimationFrame(() => node.classList.add("in"));
  const timer = setTimeout(() => { node.classList.remove("in"); setTimeout(() => node.remove(), 260); }, timeout);
  node.addEventListener("mouseenter", () => clearTimeout(timer), { once: true });
  return node;
}

export function confirmDialog({ title, body, confirmLabel = "Подтвердить", cancelLabel = "Отмена", tone = "ok", extra } = {}) {
  return new Promise((resolve) => {
    let extraValue = null;
    const dialog = h("dialog", { class: "modal" });
    const extraNode = extra ? extra((value) => { extraValue = value; }) : null;
    const close = (result) => { dialog.close(); dialog.remove(); resolve(result); };
    dialog.append(
      h("div", { class: `modal-head modal-${tone}` }, h("span", { class: "modal-icon" }, icon(tone === "danger" ? "alert" : "info", 18)), h("h3", { text: title })),
      h("p", { class: "modal-body", text: body }),
      extraNode,
      h("div", { class: "modal-actions" },
        h("button", { class: "btn ghost", type: "button", onclick: () => close(false) }, cancelLabel),
        h("button", { class: `btn ${tone === "danger" ? "danger" : "primary"}`, type: "button", onclick: () => close(extra ? { confirmed: true, value: extraValue } : true) }, confirmLabel)
      )
    );
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(false); });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector(".btn.primary, .btn.danger")?.focus();
  });
}

export function switchRow({ label, hint, checked, onChange }) {
  const input = h("input", { type: "checkbox", class: "switch-input", checked: Boolean(checked) });
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "switch-row" },
    h("span", { class: "switch-copy" },
      h("span", { class: "switch-label", text: label }),
      hint ? h("span", { class: "switch-hint", text: hint }) : null
    ),
    h("span", { class: "switch" }, input, h("span", { class: "switch-track" }, h("span", { class: "switch-knob" })))
  );
}

export function stepper({ value, min, max, step = 1, suffix, onChange }) {
  const input = h("input", { type: "number", class: "stepper-input", value: String(value), min, max, step, "aria-label": suffix || "Значение" });
  const commit = (next) => {
    const clamped = Math.min(max, Math.max(min, Number(next) || min));
    input.value = String(clamped);
    onChange(clamped);
  };
  input.addEventListener("change", () => commit(input.value));
  return h("div", { class: "stepper" },
    h("button", { class: "stepper-btn", type: "button", "aria-label": "Уменьшить", onclick: () => commit(Number(input.value) - step) }, icon("minus", 14)),
    input,
    suffix ? h("span", { class: "stepper-suffix", text: suffix }) : null,
    h("button", { class: "stepper-btn", type: "button", "aria-label": "Увеличить", onclick: () => commit(Number(input.value) + step) }, icon("plus", 14))
  );
}

export function slider({ value, min, max, step = 1, onInput, label }) {
  const input = h("input", { type: "range", class: "range", value: String(value), min, max, step, "aria-label": label || "Ползунок" });
  const paint = () => input.style.setProperty("--fill", `${((input.value - min) / (max - min)) * 100}%`);
  paint();
  input.addEventListener("input", () => { paint(); onInput(Number(input.value)); });
  return input;
}

export function applyTheme(settings) {
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);
  document.body.classList.toggle("dark", dark);
  document.body.classList.toggle("light", !dark);
  document.body.classList.toggle("compact", settings.density === "compact");
  document.body.classList.toggle("no-motion", settings.motion === false);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function badge(text, tone = "neutral") {
  return h("span", { class: `badge badge-${tone}`, text });
}

export function emptyState(text, hint) {
  return h("div", { class: "empty" }, icon("spark", 20), h("p", { text }), hint ? h("small", { text: hint }) : null);
}