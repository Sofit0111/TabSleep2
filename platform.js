import { createEngine, createRouter } from "./engine.js";
import { createDemoBrowser } from "./demo.js";

const chromeApi = globalThis.chrome;
const isExtension = Boolean(chromeApi?.runtime?.id && chromeApi?.tabs?.query && chromeApi?.storage?.sync);

export const MODE = isExtension ? "extension" : "demo";

let demo = null;
let demoRoute = null;
if (!isExtension) {
  demo = createDemoBrowser();
  demoRoute = createRouter(createEngine(demo.browser));
}

export async function call(action, payload = {}) {
  if (isExtension) {
    const response = await chromeApi.runtime.sendMessage({ action, payload });
    if (!response) throw new Error("Фоновый процесс не ответил. Откройте chrome://extensions и перезагрузите расширение.");
    if (response.error) throw new Error(response.error);
    return response.data;
  }
  return demoRoute(action, payload);
}

export function subscribe(callback) {
  if (isExtension) {
    let timer = null;
    const listener = () => { clearTimeout(timer); timer = setTimeout(callback, 180); };
    chromeApi.storage.onChanged.addListener(listener);
    chromeApi.tabs.onCreated.addListener(listener);
    chromeApi.tabs.onRemoved.addListener(listener);
    chromeApi.tabs.onActivated.addListener(listener);
    chromeApi.tabs.onUpdated.addListener(listener);
    return () => {
      chromeApi.storage.onChanged.removeListener(listener);
      chromeApi.tabs.onCreated.removeListener(listener);
      chromeApi.tabs.onRemoved.removeListener(listener);
      chromeApi.tabs.onActivated.removeListener(listener);
      chromeApi.tabs.onUpdated.removeListener(listener);
    };
  }
  let timer = null;
  return demo.subscribe(() => { clearTimeout(timer); timer = setTimeout(callback, 180); });
}

export function openOptions() {
  if (isExtension) chromeApi.runtime.openOptionsPage();
  else window.open("options.html", "_blank");
}

export function download(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}