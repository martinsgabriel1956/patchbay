// Ponte com o Tauri. Fora dele (dev:web, no browser) tudo vira no-op.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const inTauri = isTauri();

export type ApiInfo = { port: number; token: string };
export const apiInfo = () => invoke<ApiInfo>("api_info");

export function setCloseToTray(value: boolean) {
  if (inTauri) invoke("set_close_to_tray", { value });
}

export function setTrayStatus(activeConnections: number) {
  if (inTauri) invoke("set_tray_status", { activeConnections });
}

/** null = seguir o tema do sistema. */
export function setWindowTheme(theme: "dark" | "light" | null) {
  if (inTauri) getCurrentWindow().setTheme(theme);
}

/** Abre no browser do sistema (login OAuth). Fora do Tauri, numa aba nova. */
export async function openBrowser(url: string) {
  if (inTauri) await invoke("open_browser", { url });
  else window.open(url, "_blank", "noopener");
}

/** Atalho global de mostrar/esconder a janela; null desliga. Rejeita com a mensagem do SO
 *  (atalho inválido ou já tomado por outro app). */
export const setGlobalShortcut = (shortcut: string | null) =>
  inTauri ? invoke<void>("set_global_shortcut", { shortcut }) : Promise.resolve();

/** Notificação nativa; o Rust só mostra com a janela escondida ou minimizada. */
export function notify(title: string, body: string) {
  if (inTauri) invoke("notify", { title, body }).catch(() => {});
}
