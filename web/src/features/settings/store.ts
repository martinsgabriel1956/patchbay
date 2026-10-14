import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setCloseToTray, setWindowTheme } from "@/lib/desktop";

export type Theme = "dark" | "light" | "system";
export type Settings = { theme: Theme; closeToTray: boolean; locale: "en" | "pt-BR" };

// Chave lida também pelo script anti-flash do index.html.
export const useSettings = create<Settings & { update: (patch: Partial<Settings>) => void }>()(
  persist(
    (set) => ({ theme: "dark", closeToTray: true, locale: "pt-BR", update: (patch) => set(patch) }),
    { name: "patchbay.settings", partialize: ({ update, ...settings }) => settings },
  ),
);

/** Aplica tema (DOM + barra de título) e informa o Rust sobre "ao fechar". */
export function useApplySettings() {
  const theme = useSettings((s) => s.theme);
  const closeToTray = useSettings((s) => s.closeToTray);

  useEffect(() => {
    const pref = theme === "light" || theme === "system" ? theme : "dark";
    const mq = matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const light = pref === "light" || (pref === "system" && mq.matches);
      document.documentElement.dataset.theme = light ? "light" : "dark";
    };
    setWindowTheme(pref === "system" ? null : pref);
    apply();
    if (pref !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => setCloseToTray(closeToTray), [closeToTray]);
}
