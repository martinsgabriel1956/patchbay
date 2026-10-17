import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useWorkspace } from "@/features/sidebar/store";
import { setCloseToTray, setGlobalShortcut, setWindowTheme } from "@/lib/desktop";

export type Theme = "dark" | "light" | "system";
export type Settings = {
  theme: Theme;
  closeToTray: boolean;
  locale: "en" | "pt-BR";
  /** Atalho global de mostrar/esconder a janela, no formato do Tauri ("CommandOrControl+Alt+P"). */
  globalShortcut: string;
  shortcutOn: boolean;
  /** Notificação nativa de mensagem WS/SSE recebida com a janela escondida. */
  notifyRealtime: boolean;
};

export const DEFAULT_SHORTCUT = "CommandOrControl+Alt+P";

// Chave lida também pelo script anti-flash do index.html. Campo novo sem valor salvo vem do padrão.
export const useSettings = create<
  Settings & {
    /** Por que o atalho global não registrou (inválido, tomado por outro app). Não persiste. */
    shortcutError?: string;
    update: (patch: Partial<Settings>) => void;
  }
>()(
  persist(
    (set) => ({
      theme: "dark",
      closeToTray: true,
      locale: "pt-BR",
      globalShortcut: DEFAULT_SHORTCUT,
      shortcutOn: true,
      notifyRealtime: false,
      update: (patch) => set(patch),
    }),
    {
      name: "patchbay.settings",
      partialize: ({ update, shortcutError, ...settings }) => settings,
    },
  ),
);

/** Aplica tema (DOM + barra de título) e informa o Rust sobre "ao fechar" e o atalho global. */
export function useApplySettings() {
  const theme = useSettings((s) => s.theme);
  const closeToTray = useSettings((s) => s.closeToTray);
  const shortcut = useSettings((s) => (s.shortcutOn ? s.globalShortcut.trim() : ""));

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

  // Atalho tomado por outro app ou inválido: o app segue sem atalho e avisa.
  useEffect(() => {
    setGlobalShortcut(shortcut || null).then(
      () => useSettings.setState({ shortcutError: undefined }),
      (err) => {
        const shortcutError = `Atalho global ${shortcut}: ${String(err)}`;
        useSettings.setState({ shortcutError });
        useWorkspace.setState({ notice: shortcutError });
      },
    );
  }, [shortcut]);
}
