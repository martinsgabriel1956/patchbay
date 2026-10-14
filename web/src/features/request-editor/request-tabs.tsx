// Abas das requests abertas, acima do editor. Mesmo desenho das abas do DESIGN.md (ativa em
// tinta com régua de 2px); "•" marca o que ainda não foi salvo no disco.

import { useEffect, useRef } from "react";
import { useRealtime } from "@/features/realtime/store";
import { focusUrl, mod } from "@/lib/utils";
import { activeTab, isDirty, useRequest } from "./store";

/** Fecha a aba; com alteração não salva, pergunta antes (×, clique do meio, Ctrl W). */
export function closeTab(key: string) {
  const tab = useRequest.getState().tabs.find((t) => t.key === key);
  if (tab && isDirty(tab) && !window.confirm(`Fechar "${tab.name}" sem salvar?`)) return;
  useRequest.getState().close(key);
  // O foco não cai no <body>: vai para a URL da aba que ficou ativa.
  setTimeout(focusUrl);
}

export function RequestTabs() {
  const tabs = useRequest((s) => s.tabs);
  const active = useRequest((s) => activeTab(s).key);
  const { activate, newTab } = useRequest.getState();
  const conns = useRealtime((s) => s.conns);
  const strip = useRef<HTMLElement>(null);

  // A aba ativa sempre à vista, mesmo com mais abas do que cabem (Ctrl T, Ctrl Tab, Ctrl 1–9).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-rola quando a ativa ou a contagem muda
  useEffect(() => {
    strip.current
      ?.querySelector("[aria-current=true]")
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active, tabs.length]);

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
          // Duas abas com o mesmo nome: a pasta desempata.
          const folder =
            tabs.some((t) => t !== tab && t.name === tab.name) && tab.path?.split("/").at(-2);
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
                  {tab.kind === "http" ? tab.method : tab.kind.toUpperCase()}
                </span>
                <span className="truncate text-[13px]">
                  {tab.name}
                  {folder && <span className="font-mono text-[12px] text-mute"> · {folder}</span>}
                </span>
                {dirty && (
                  <span className="font-mono text-[12px]" title="Não salvo">
                    •<span className="sr-only">não salvo</span>
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={`Fechar ${tab.name}`}
                onClick={() => closeTab(tab.key)}
                className="px-2 font-mono text-[14px] text-mute outline-offset-[-2px] hover:text-ink"
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
