// Abas das requests abertas, acima do editor. Mesmo desenho das abas do DESIGN.md (ativa em
// tinta com régua de 2px); "•" marca o que ainda não foi salvo no disco e "↻" o que mudou nele.

import { useEffect, useRef } from "react";
import { confirm } from "@/components/ui/dialog";
import { useRealtime } from "@/features/realtime/store";
import { useWorkspace } from "@/features/sidebar/store";
import { focusUrl, mod } from "@/lib/utils";
import { activeTab, isDirty, useRequest } from "./store";

/** Fecha a aba. Com alteração não salva ou conexão realtime viva, pergunta antes (×, clique do
 *  meio, Ctrl W). */
export async function closeTab(key: string) {
  const tab = useRequest.getState().tabs.find((t) => t.key === key);
  if (!tab) return;
  const live = useRealtime.getState().conns[key]?.status === "open";
  const drops = live ? ` Fechar também desconecta o ${tab.kind.toUpperCase()}.` : "";
  if (isDirty(tab)) {
    const answer = await confirm({
      title: "Alterações não salvas",
      body: `"${label(tab)}" tem alterações que não estão no disco.${drops} Se fechar, ${mod("Shift T").replaceAll(" ", "\u00a0")} reabre.`,
      // Sem arquivo ainda: a ação principal é escolher onde salvar (a aba fica aberta).
      alt: tab.path ? "Salvar e fechar" : "Salvar…",
      confirm: "Fechar sem salvar",
    });
    if (answer === "cancel") return;
    if (answer === "alt") {
      useRequest.getState().activate(key);
      if (!tab.path) return useWorkspace.setState({ saving: true });
      await useRequest.getState().save();
    }
  } else if (live) {
    const answer = await confirm({
      title: "Conexão aberta",
      body: `Fechar "${label(tab)}" desconecta o ${tab.kind.toUpperCase()} e descarta o log.`,
      confirm: "Desconectar e fechar",
    });
    if (answer === "cancel") return;
  }
  // O foco segue para a URL da aba que ficou ativa (efeito em RequestTabs).
  useRequest.getState().close(key);
}

/** Aba nunca salva e já com URL: o caminho da URL diz mais que "Nova request". */
function label(tab: { name: string; path?: string; url: string }) {
  if (tab.path || !tab.url.trim()) return tab.name;
  const rest = tab.url.replace(/^[a-z][\w+.-]*:\/\//i, "");
  const i = rest.search(/[/?#]/);
  return i < 0 || rest.slice(i) === "/" ? rest : rest.slice(i);
}

export function RequestTabs() {
  const tabs = useRequest((s) => s.tabs);
  const active = useRequest((s) => activeTab(s).key);
  // O rótulo da ativa cresce ao digitar a URL: re-revela para ela não sair da vista.
  const activeLabel = useRequest((s) => label(activeTab(s)));
  const { activate, newTab } = useRequest.getState();
  const conns = useRealtime((s) => s.conns);
  const strip = useRef<HTMLElement>(null);

  // A aba ativa sempre à vista, mesmo com mais abas do que cabem (Ctrl T, Ctrl Tab, Ctrl 1–9).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-rola quando a ativa ou a contagem muda
  useEffect(() => {
    const reveal = () =>
      strip.current
        ?.querySelector("[aria-current=true]")
        ?.scrollIntoView({ inline: "nearest", block: "nearest" });
    reveal();
    // Trocou de aba (Ctrl Tab, Ctrl Shift T, histórico): o teclado segue para a URL, não cai no <body>.
    const timer = setTimeout(() => {
      if (document.activeElement === document.body) focusUrl();
    });
    window.addEventListener("resize", reveal);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", reveal);
    };
  }, [active, tabs.length, activeLabel]);

  return (
    <div className="flex shrink-0 border-b border-line">
      {/* Sem scrollbar nativa: a roda do mouse rola na horizontal. O "+" fica fora, sempre visível. */}
      <nav
        ref={strip}
        aria-label="Requests abertas"
        onWheel={(e) => {
          if (strip.current && Math.abs(e.deltaY) > Math.abs(e.deltaX))
            strip.current.scrollLeft += e.deltaY;
        }}
        className="relative flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const selected = tab.key === active;
          const dirty = isDirty(tab);
          const name = label(tab);
          // Duas abas com o mesmo nome: a pasta desempata; sem pasta (não salvas), a ordem.
          const twins = tabs.filter((t) => label(t) === name);
          const folder =
            twins.length > 1 &&
            (tab.path
              ? (tab.path.split("/").at(-2) ?? "raiz")
              : String(twins.filter((t) => !t.path).indexOf(tab) + 1));
          // Canal realtime conectado fica em cord-text (DESIGN.md › Monochrome Method Rule).
          const live = conns[tab.key]?.status === "open";
          return (
            <div
              key={tab.key}
              className={`flex shrink-0 items-center border-r border-line ${selected ? "text-ink shadow-[inset_0_-2px_var(--ink)]" : "text-mute"}`}
            >
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                title={tab.path ?? "Não salva no workspace"}
                onClick={() => activate(tab.key)}
                onAuxClick={(e) => e.button === 1 && closeTab(tab.key)}
                className={`flex items-center gap-2 py-2 pr-1.5 pl-3.5 outline-offset-[-2px] ${selected ? "max-w-[240px]" : "max-w-[160px]"}`}
              >
                <span className={`label text-[12px] ${live ? "text-cord-text" : ""}`}>
                  {tab.kind === "http"
                    ? tab.method
                    : tab.kind === "webhook"
                      ? "HOOK"
                      : tab.kind.toUpperCase()}
                </span>
                <span className="truncate text-[13px]">
                  {name}
                  {folder && <span className="font-mono text-[12px] text-mute"> · {folder}</span>}
                </span>
                {dirty && (
                  <span className="font-mono text-[12px]" title="Não salvo">
                    •<span className="sr-only">não salvo</span>
                  </span>
                )}
                {tab.changedOnDisk && (
                  <span className="font-mono text-[12px]" title="Mudou no disco">
                    ↻<span className="sr-only">mudou no disco</span>
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={`Fechar ${name}`}
                title={`Fechar (${mod("W")})`}
                onClick={() => closeTab(tab.key)}
                className="self-stretch px-2.5 font-mono text-[14px] text-mute outline-offset-[-2px] hover:text-ink"
              >
                ×
              </button>
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        aria-label="Nova request"
        title={`Nova request (${mod("T")})`}
        onClick={() => newTab()}
        className="shrink-0 px-3.5 font-mono text-[14px] text-mute outline-offset-[-2px] hover:text-ink"
      >
        +
      </button>
    </div>
  );
}
