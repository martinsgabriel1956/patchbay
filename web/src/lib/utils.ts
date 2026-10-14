export { cn } from "cn";

export const isMac = navigator.platform.startsWith("Mac");

/** Rótulo de atalho com a tecla modificadora da plataforma: "⌘T" / "Ctrl T". */
export const mod = (key: string) => (isMac ? `⌘${key}` : `Ctrl ${key}`);

/** Foco no campo de URL da aba ativa (HTTP e realtime usam o mesmo id). */
export const focusUrl = () => document.getElementById("url")?.focus();

/** Há um diálogo aberto (palette inclusa): atalhos globais não agem por baixo dele. */
export const modalOpen = () =>
  document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
