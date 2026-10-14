import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CollectionDialog } from "@/features/environments/collection-dialog";
import { EnvBar, useCurrentEnvironments } from "@/features/environments/env-bar";
import { useEnvironments } from "@/features/environments/store";
import { RealtimeEditor } from "@/features/realtime/realtime-editor";
import { RealtimePanel } from "@/features/realtime/realtime-panel";
import { RequestEditor } from "@/features/request-editor/request-editor";
import { RequestTabs } from "@/features/request-editor/request-tabs";
import { activeTab, useRequest } from "@/features/request-editor/store";
import { ResponseViewer } from "@/features/response-viewer/response-viewer";
import { SettingsDialog, THEMES } from "@/features/settings/settings-dialog";
import { useApplySettings, useSettings } from "@/features/settings/store";
import { Sidebar } from "@/features/sidebar/sidebar";
import { useWorkspace } from "@/features/sidebar/store";
import { api } from "@/lib/api-client";
import { isMac } from "@/lib/utils";

/** A request ativa, resolvida, como curl na área de transferência. Falha aparece na sidebar.
 *  ClipboardItem com promise: o WebKit (Tauri no Linux) só aceita escrever dentro do gesto do
 *  usuário, e o await que resolve as variáveis o perderia; writeText fica de reserva. */
const copyCurl = () => {
  const text = useRequest.getState().exportCurl();
  const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
  navigator.clipboard
    .write([new ClipboardItem({ "text/plain": blob })])
    .catch(() => text.then((t) => navigator.clipboard.writeText(t)))
    .catch((err) =>
      useWorkspace.setState({ error: `Copiar como cURL: ${(err as Error).message}` }),
    );
};

export function App() {
  useApplySettings();
  const update = useSettings((s) => s.update);
  const [health, setHealth] = useState<"…" | "ok" | "offline">("…");
  const [palette, setPalette] = useState(false);
  const [settings, setSettings] = useState(false);
  const active = useRequest((s) => activeTab(s).key);
  const realtime = useRequest((s) => activeTab(s).kind !== "http");
  const { collection, envs } = useCurrentEnvironments();

  useEffect(() => {
    api("/health").then(
      () => setHealth("ok"),
      () => setHealth("offline"),
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (action: () => void) => () => {
    setPalette(false);
    action();
  };

  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <header className="flex items-center gap-4 border-b border-line px-[18px] py-2.5">
        <img src="/lockup.svg" alt="Patchbay" className="on-dark h-6 w-auto" />
        <img src="/lockup-light.svg" alt="Patchbay" className="on-light h-6 w-auto" />
        <EnvBar />
        <span
          className={`font-mono text-[12px] tabular-nums ${health === "offline" ? "text-prod-text" : "text-mute"}`}
        >
          api {health}
        </span>
        <button type="button" className="kbd" onClick={() => setPalette(true)}>
          {isMac ? "⌘K" : "Ctrl K"}
        </button>
        <button type="button" className="label text-[12px]" onClick={() => setSettings(true)}>
          Configurações
        </button>
      </header>

      <main className="grid min-h-0 grid-cols-[270px_minmax(0,1fr)_450px]">
        <section aria-label="Canais" className="min-h-0 border-r border-line">
          <Sidebar />
        </section>
        <section aria-label="Request" className="flex min-h-0 flex-col border-r border-line">
          <RequestTabs />
          {/* key: cada aba tem o próprio editor (cursor, undo, aba interna) */}
          <div className="min-h-0 flex-1">
            {realtime ? <RealtimeEditor key={active} /> : <RequestEditor key={active} />}
          </div>
        </section>
        <section aria-label="Resposta" className="min-h-0">
          {realtime ? <RealtimePanel /> : <ResponseViewer key={active} />}
        </section>
      </main>

      <CommandDialog title="Command palette" open={palette} onOpenChange={setPalette}>
        <CommandInput placeholder="Comando…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandItem onSelect={run(() => useRequest.getState().send())}>
            Enviar request
          </CommandItem>
          <CommandItem onSelect={run(() => useRequest.getState().newTab())}>
            Nova request
          </CommandItem>
          <CommandItem onSelect={run(() => useRequest.getState().newTab("ws"))}>
            Nova request WebSocket
          </CommandItem>
          <CommandItem onSelect={run(() => useRequest.getState().newTab("sse"))}>
            Nova request SSE
          </CommandItem>
          {!realtime && <CommandItem onSelect={run(copyCurl)}>Copiar como cURL</CommandItem>}
          <CommandItem onSelect={run(() => useWorkspace.setState({ importing: true }))}>
            Importar coleção (Postman, Insomnia)
          </CommandItem>
          {collection &&
            [{ name: "" }, ...envs].map(({ name }) => (
              <CommandItem
                key={`env-${name}`}
                onSelect={run(() =>
                  useEnvironments.getState().select(collection, name || undefined),
                )}
              >
                Environment: {name || "nenhum"}
              </CommandItem>
            ))}
          {collection && (
            <CommandItem onSelect={run(() => useEnvironments.getState().edit(collection))}>
              Editar environments de {collection}
            </CommandItem>
          )}
          {THEMES.map(([theme, name]) => (
            <CommandItem key={theme} onSelect={run(() => update({ theme }))}>
              Tema: {name}
            </CommandItem>
          ))}
          <CommandItem onSelect={run(() => setSettings(true))}>Abrir configurações</CommandItem>
        </CommandList>
      </CommandDialog>
      <SettingsDialog open={settings} onOpenChange={setSettings} />
      <CollectionDialog />
    </div>
  );
}
