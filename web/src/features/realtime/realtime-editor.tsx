// Editor de uma request WebSocket ou SSE (coluna do meio): URL + Conectar/Desconectar, mensagem e
// subprotocolos (só WS) e headers. O log fica na coluna da direita (realtime-panel.tsx).
import { useEffect } from "react";
import { CodeEditor } from "@/components/code-editor";
import { Tab, TabList, TabPanel, TabsRoot } from "@/components/tabs";
import { VarInput } from "@/components/var-input";
import { useRequestContext } from "@/features/environments/store";
import { authName } from "@/features/request-editor/auth-editor";
import { KvTable } from "@/features/request-editor/kv-table";
import { activeTab, toRealtime, useRequest } from "@/features/request-editor/store";
import { effectiveAuth } from "@/lib/interpolate";
import { isMac } from "@/lib/utils";
import { useRealtime } from "./store";

const count = (rows: { key: string; enabled: boolean }[]) =>
  rows.filter((row) => row.enabled && row.key).length || "";

export function RealtimeEditor() {
  const r = useRequest(activeTab);
  const { set } = useRequest.getState();
  const status = useRealtime((s) => s.conns[r.key]?.status ?? "closed");
  const draft = useRealtime((s) => s.drafts[r.key] ?? "");
  const { connect, disconnect, send, setDraft } = useRealtime.getState();
  const { scope, parents } = useRequestContext(r.path);
  const inheritedFrom = parents.find((p) => p.auth && p.auth.type !== "inherit")?.folder;
  const auth = effectiveAuth({ type: "inherit" }, parents);
  const live = status !== "closed";
  const protocols = r.protocols.map((p) => p.trim()).filter(Boolean);
  const sse = r.kind === "sse";

  // Ctrl+Enter envia a mensagem de qualquer lugar (inclusive de dentro do CodeMirror).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const tab = activeTab(useRequest.getState());
      useRealtime.getState().send(tab.key, tab.path);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="m-[18px] mb-3.5 flex h-11 shrink-0 border border-line"
        onSubmit={(e) => {
          e.preventDefault();
          if (r.url.trim()) connect(r.key, toRealtime(r), r.path);
        }}
      >
        <span
          className={`label grid w-[84px] shrink-0 place-items-center border-r border-line text-[17px] ${status === "open" ? "text-cord-text" : "text-ink"}`}
        >
          {sse ? "SSE" : "WS"}
        </span>
        <VarInput
          id="url"
          aria-label="URL"
          // Aba nova (Ctrl T, palette, +) já abre digitando a URL.
          autoFocus={!r.url}
          placeholder={
            sse
              ? "https://sse.dev/test  ou  {{baseUrl}}/events"
              : "wss://echo.websocket.org  ou  {{wsUrl}}/chat"
          }
          spellCheck={false}
          value={r.url}
          scope={scope}
          onChange={(e) => set({ url: e.target.value })}
          className="flex-1 bg-bg text-ink"
          field="px-3.5 font-mono text-[14px] outline-offset-[-2px] placeholder:text-mute"
        />
        {live ? (
          <button
            type="button"
            // preventDefault: o React troca este botão pelo "Conectar" (submit) no mesmo nó
            // durante o clique, e o form reconectaria.
            onClick={(e) => {
              e.preventDefault();
              disconnect(r.key);
            }}
            className="label flex shrink-0 items-center border-l border-line px-4 text-[16px] text-ink outline-offset-[-2px]"
          >
            Desconectar
          </button>
        ) : (
          <button
            type="submit"
            className="label flex shrink-0 items-center bg-cord px-4 focus-visible:outline-matte focus-visible:outline-offset-[-4px] text-[16px] text-matte"
          >
            Conectar
          </button>
        )}
      </form>

      <TabsRoot defaultValue={sse ? "headers" : "message"} className="flex min-h-0 flex-1 flex-col">
        <TabList aria-label="Partes da conexão">
          {!sse && <Tab value="message">Mensagem</Tab>}
          <Tab value="headers">Headers {count(r.headers)}</Tab>
          {!sse && <Tab value="protocols">Subprotocolos {protocols.length || ""}</Tab>}
        </TabList>
        <TabPanel value="message" className="flex flex-col gap-3.5">
          <div className="min-h-40 flex-1 border border-line">
            <CodeEditor
              label="Mensagem"
              language="json"
              value={draft}
              onChange={(text) => setDraft(r.key, text)}
              scope={scope}
            />
          </div>
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              disabled={status !== "open" || !draft}
              onClick={() => send(r.key, r.path)}
              className="label h-[34px] border border-mute px-3.5 text-[12px] enabled:hover:shadow-[inset_0_-2px_var(--ink)] disabled:text-mute"
            >
              Enviar mensagem
            </button>
            <span className="kbd">{isMac ? "⌘↵" : "Ctrl ↵"}</span>
            {status !== "open" && (
              <span className="text-[15px] text-mute">Conecte para enviar.</span>
            )}
          </div>
        </TabPanel>
        <TabPanel value="headers" className="grid content-start gap-3.5">
          <KvTable
            label={sse ? "Headers da request" : "Headers do handshake"}
            rows={r.headers}
            onChange={(headers) => set({ headers })}
            scope={scope}
          />
          <p className="text-[15px] text-mute">
            {sse
              ? "Vão no GET do stream (Accept: text/event-stream entra se faltar), inclusive os que o browser bloqueia. Sem reconexão automática."
              : "Vão no handshake, inclusive os que o browser bloqueia (Authorization, Origin, Cookie)."}
            {auth.type !== "none" &&
              ` Auth ${authName(auth.type)} herdada de ${inheritedFrom} entra como header.`}
          </p>
        </TabPanel>
        <TabPanel value="protocols" className="grid content-start gap-2">
          <span className="label text-[12px] text-mute">Subprotocolos, separados por vírgula</span>
          <VarInput
            aria-label="Subprotocolos"
            placeholder="graphql-transport-ws, chat"
            spellCheck={false}
            value={r.protocols.join(",")}
            scope={scope}
            onChange={(e) => set({ protocols: e.target.value.split(",") })}
            className="border border-line bg-bg text-ink"
            field="px-2.5 py-1.5 font-mono text-[14px] outline-offset-[-2px] placeholder:text-mute"
          />
        </TabPanel>
      </TabsRoot>
    </div>
  );
}
