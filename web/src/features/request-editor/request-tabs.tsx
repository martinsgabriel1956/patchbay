// Abas das requests abertas, acima do editor. Mesmo desenho das abas do DESIGN.md (ativa em
// tinta com régua de 2px); "•" marca o que ainda não foi salvo no disco.
import { useRealtime } from "@/features/realtime/store";
import { activeTab, isDirty, useRequest } from "./store";

export function RequestTabs() {
  const tabs = useRequest((s) => s.tabs);
  const active = useRequest((s) => activeTab(s).key);
  const { activate, close, newTab } = useRequest.getState();
  const conns = useRealtime((s) => s.conns);

  const closeTab = (key: string) => {
    const tab = tabs.find((t) => t.key === key);
    if (tab && isDirty(tab) && !window.confirm(`Fechar "${tab.name}" sem salvar?`)) return;
    close(key);
  };

  return (
    <div className="flex shrink-0 overflow-x-auto border-b border-line">
      <nav aria-label="Requests abertas" className="flex">
        {tabs.map((tab) => {
          const selected = tab.key === active;
          const dirty = isDirty(tab);
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
                className="flex max-w-[220px] items-center gap-2 py-2 pr-1.5 pl-3.5 outline-offset-[-2px]"
              >
                <span className={`label text-[12px] ${live ? "text-cord-text" : ""}`}>
                  {tab.kind === "http" ? tab.method : tab.kind.toUpperCase()}
                </span>
                <span className="truncate text-[13px]">{tab.name}</span>
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
        title="Nova request"
        onClick={() => newTab()}
        className="shrink-0 px-3.5 font-mono text-[14px] text-mute outline-offset-[-2px] hover:text-ink"
      >
        +
      </button>
    </div>
  );
}
