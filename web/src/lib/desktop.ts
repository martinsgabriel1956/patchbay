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
