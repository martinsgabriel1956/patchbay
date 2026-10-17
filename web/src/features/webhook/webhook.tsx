// Inspetor de webhooks (aba "webhook"): a api sobe um listener em 127.0.0.1 e repassa cada request
// que chega pelo /realtime. Coluna do meio: porta, status e body da resposta, Escutar/Parar. Coluna
// da direita: o log (o mesmo MessageLog do WS/SSE) e os detalhes da request selecionada.
import type { CapturedRequest } from "@api/schemas";
import { Fragment, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { CodeEditor } from "@/components/code-editor";
import { MessageLog } from "@/features/realtime/realtime-panel";
import { useRealtime } from "@/features/realtime/store";
import { paramsFromUrl } from "@/features/request-editor/query";
import { activeTab, fromRequest, useRequest } from "@/features/request-editor/store";
import { useWorkspace } from "@/features/sidebar/store";
import { type Dict, strings, useStrings } from "@/lib/i18n";
import { isMac, modalOpen } from "@/lib/utils";

const WEBHOOK_STRINGS: Dict<{
  port: string;
  portHint: string;
  listen: string;
  stop: string;
  copy: string;
  copied: string;
  status: string;
  body: string;
  help: string;
  restart: string;
  listening: string;
  connecting: string;
  stopped: string;
  idle: string;
  details: string;
  close: string;
  save: string;
  headers: string;
  binary: (bytes: number) => string;
  noBody: string;
  truncated: string;
  size: string;
}> = {
  en: {
    port: "Port",
    portHint: "empty = any free port",
    listen: "Listen",
    stop: "Stop",
    copy: "Copy URL",
    copied: "Webhook URL copied",
    status: "Response status",
    body: "Response body",
    help: "Listens on 127.0.0.1 only. To receive from outside, point a tunnel (ngrok, cloudflared) at the port. Every request gets the status and body above; the listener stops with the tab or the app.",
    restart: "Changes apply on the next Listen.",
    listening: "Listening",
    connecting: "Starting",
    stopped: "Stopped",
    idle: "Start listening and send something to the URL.",
    details: "Request",
    close: "Close details",
    save: "Save as request",
    headers: "Headers",
    binary: (bytes) => `Binary body, ${bytes} B. The base64 is in the log.`,
    noBody: "No body.",
    truncated: "cut at 5 MB",
    size: "size",
  },
  "pt-BR": {
    port: "Porta",
    portHint: "vazio = qualquer porta livre",
    listen: "Escutar",
    stop: "Parar",
    copy: "Copiar URL",
    copied: "URL do webhook copiada",
    status: "Status da resposta",
    body: "Body da resposta",
    help: "Escuta só em 127.0.0.1. Para receber de fora, aponte um túnel (ngrok, cloudflared) para a porta. Toda request recebe o status e o body acima; o listener para junto com a aba ou o app.",
    restart: "Mudanças valem no próximo Escutar.",
    listening: "Escutando",
    connecting: "Abrindo",
    stopped: "Parado",
    idle: "Comece a escutar e mande algo para a URL.",
    details: "Request",
    close: "Fechar detalhes",
    save: "Salvar como request",
    headers: "Headers",
    binary: (bytes) => `Body binário, ${bytes} B. O base64 está no log.`,
    noBody: "Sem body.",
    truncated: "cortado em 5 MB",
    size: "tamanho",
  },
};

/** Configuração do listener por aba (só em memória; texto como digitado). */
type Config = { port: string; status: string; body: string };
const DEFAULT: Config = { port: "", status: "200", body: "" };
const useConfig = create<Record<string, Config>>()(() => ({}));

const urlOf = (port?: number) => (port ? `http://127.0.0.1:${port}` : "");

/** Escuta com a configuração da aba (Ctrl ↵, botão, palette). */
export function startWebhook(key: string) {
  const c = useConfig.getState()[key] ?? DEFAULT;
  const port = Number(c.port);
  useRealtime.getState().listen(key, {
    port: c.port.trim() && Number.isInteger(port) ? port : undefined,
    status: Number(c.status) || 200,
    body: c.body || undefined,
  });
}

/** URL do listener da aba ativa na área de transferência. */
export function copyWebhookUrl() {
  const key = activeTab(useRequest.getState()).key;
  const url = urlOf(useRealtime.getState().conns[key]?.port);
  if (!url) return;
  navigator.clipboard
    .writeText(url)
    .then(() => useWorkspace.setState({ notice: strings(WEBHOOK_STRINGS).copied }))
    .catch((err) => useWorkspace.setState({ error: (err as Error).message }));
}

const action =
  "label h-[34px] shrink-0 border border-mute px-3.5 text-[12px] hover:shadow-[inset_0_-2px_var(--ink)]";

export function WebhookEditor() {
  const t = useStrings(WEBHOOK_STRINGS);
  const key = useRequest((s) => activeTab(s).key);
  const conn = useRealtime((s) => s.conns[key]);
  const config = useConfig((s) => s[key] ?? DEFAULT);
  const status = conn?.status ?? "closed";
  const live = status !== "closed";
  const url = status === "open" ? urlOf(conn?.port) : "";
  const set = (patch: Partial<Config>) =>
    useConfig.setState((s) => ({ [key]: { ...(s[key] ?? DEFAULT), ...patch } }));

  // Ctrl ↵ começa a escutar (como o Conectar do WS/SSE).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || modalOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      const k = activeTab(useRequest.getState()).key;
      if (useRealtime.getState().conns[k]?.status !== "open") startWebhook(k);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="m-[18px] mb-3.5 flex h-11 shrink-0 border border-mute"
        onSubmit={(e) => {
          e.preventDefault();
          startWebhook(key);
        }}
      >
        <span
          className={`label grid w-[84px] shrink-0 place-items-center border-r border-line text-[17px] ${status === "open" ? "text-cord-text" : "text-ink"}`}
        >
          HOOK
        </span>
        {url ? (
          <span className="flex min-w-0 flex-1 items-center px-3.5 font-mono text-[14px] text-ink">
            <span className="truncate">{url}</span>
          </span>
        ) : (
          <input
            id="url"
            aria-label={`${t.port} (${t.portHint})`}
            inputMode="numeric"
            placeholder={`${t.port}: ${t.portHint}`}
            value={config.port}
            disabled={live}
            onChange={(e) => set({ port: e.target.value.replace(/\D/g, "") })}
            className="min-w-0 flex-1 bg-bg px-3.5 font-mono text-[14px] text-ink outline-offset-[-2px] placeholder:text-mute"
          />
        )}
        {url && (
          <button
            type="button"
            onClick={copyWebhookUrl}
            className="label shrink-0 border-l border-line px-3.5 text-[12px] outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)]"
          >
            {t.copy}
          </button>
        )}
        {live ? (
          <button
            type="button"
            // preventDefault: o React troca este botão pelo submit no mesmo nó durante o clique.
            onClick={(e) => {
              e.preventDefault();
              useRealtime.getState().disconnect(key);
            }}
            className="label flex shrink-0 items-center border-l border-line px-4 text-[16px] text-ink outline-offset-[-2px]"
          >
            {t.stop}
          </button>
        ) : (
          <button
            type="submit"
            className="label flex shrink-0 items-center gap-2.5 bg-cord px-4 focus-visible:outline-matte focus-visible:outline-offset-[-4px] text-[16px] text-matte"
          >
            {t.listen}
            <span className="font-mono text-[12px] font-normal normal-case tracking-normal">
              {isMac ? "⌘↵" : "Ctrl ↵"}
            </span>
          </button>
        )}
      </form>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-[18px] pb-[18px]">
        <label className="flex items-center gap-2.5 text-[15px]">
          {t.status}
          <input
            inputMode="numeric"
            value={config.status}
            onChange={(e) => set({ status: e.target.value.replace(/\D/g, "").slice(0, 3) })}
            className="w-20 border border-line bg-bg px-2.5 py-1 font-mono text-[14px] tabular-nums"
          />
        </label>
        <span className="label text-[12px] text-mute">{t.body}</span>
        <div className="min-h-32 flex-1 border border-line">
          <CodeEditor
            label={t.body}
            language="json"
            value={config.body}
            onChange={(body) => set({ body })}
          />
        </div>
        <p className="max-w-[64ch] text-[15px] text-mute">
          {t.help}
          {live && ` ${t.restart}`}
        </p>
      </div>
    </div>
  );
}

export function WebhookPanel() {
  const t = useStrings(WEBHOOK_STRINGS);
  const key = useRequest((s) => activeTab(s).key);
  const conn = useRealtime((s) => s.conns[key]);
  const status = conn?.status ?? "closed";
  const log = conn?.log;
  const [selected, setSelected] = useState<number>();
  const entry = useMemo(() => log?.find((e) => e.id === selected && e.request), [log, selected]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5" role="status">
        {status !== "closed" && <span className="size-[9px] shrink-0 rounded-full bg-cord" />}
        <span
          className={`label text-[17px] ${status === "closed" ? "text-mute" : "text-cord-text"}`}
        >
          {status === "open" ? t.listening : status === "connecting" ? t.connecting : t.stopped}
        </span>
        {status === "open" && (
          <span className="ml-auto truncate font-mono text-[13px] text-ink">
            {urlOf(conn?.port)}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-line">
        {log?.length ? (
          <MessageLog
            entries={log}
            onClear={() => {
              setSelected(undefined);
              useRealtime.getState().clear(key);
            }}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <p className="p-[18px] text-[15px] text-mute">{t.idle}</p>
        )}
      </div>
      {entry?.request && (
        <Details request={entry.request} port={conn?.port} onClose={() => setSelected(undefined)} />
      )}
    </div>
  );
}

const SKIP = new Set(["host", "content-length", "connection", "transfer-encoding"]);

/** Request recebida → aba HTTP nova, apontando para o próprio listener (troque o host). Headers
 *  que o /send calcula ficam de fora; body binário não vem. */
function saveAsRequest(r: CapturedRequest, port?: number) {
  const url = `${urlOf(port) || "http://127.0.0.1"}${r.url}`;
  const type = r.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  const draft = fromRequest({
    name: `Webhook ${r.method}`,
    method: r.method,
    url,
    params: paramsFromUrl(url, []),
    headers: r.headers
      .filter(([k]) => !SKIP.has(k.toLowerCase()))
      .map(([key, value]) => ({ key, value, enabled: true })),
    body:
      r.isBinary || !r.body
        ? { type: "none" }
        : { type: /json/i.test(type) ? "json" : "text", content: r.body },
  });
  useRequest.getState().open(draft);
}

function pretty(body: string) {
  try {
    return { text: JSON.stringify(JSON.parse(body), null, 2), json: true };
  } catch {
    return { text: body, json: false };
  }
}

function Details(props: { request: CapturedRequest; port?: number; onClose: () => void }) {
  const t = useStrings(WEBHOOK_STRINGS);
  const r = props.request;
  const body = useMemo(() => (r.isBinary ? null : pretty(r.body)), [r]);
  return (
    <section
      aria-label={t.details}
      className="grid max-h-[55%] min-h-0 shrink-0 content-start gap-3 overflow-y-auto border-t border-line p-[18px]"
    >
      <div className="flex items-center gap-2.5">
        <span className="label shrink-0 text-[13px]">{r.method}</span>
        <span className="min-w-0 truncate font-mono text-[13px] text-ink" title={r.url}>
          {r.url}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[12px] text-mute tabular-nums">
          {t.size} <span className="text-ink">{r.sizeBytes} B</span>
          {r.truncated && ` · ${t.truncated}`}
        </span>
        <button type="button" onClick={() => saveAsRequest(r, props.port)} className={action}>
          {t.save}
        </button>
        <button
          type="button"
          aria-label={t.close}
          onClick={props.onClose}
          className="grid size-8 shrink-0 place-items-center font-mono text-[14px] text-mute outline-offset-[-2px] hover:text-ink"
        >
          ×
        </button>
      </div>
      <h3 className="label text-[12px] text-mute">
        {t.headers} {r.headers.length}
      </h3>
      <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-px border border-line bg-line font-mono text-[13px]">
        {r.headers.map(([k, v], index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: headers repetem; a ordem é a identidade
          <Fragment key={index}>
            <dt className="bg-bg px-2.5 py-1 break-all text-ink">{k}</dt>
            <dd className="bg-bg px-2.5 py-1 break-all text-ink-2">{v}</dd>
          </Fragment>
        ))}
      </dl>
      <h3 className="label text-[12px] text-mute">Body</h3>
      {r.isBinary ? (
        <p className="text-[15px] text-mute">{t.binary(r.sizeBytes)}</p>
      ) : !body?.text ? (
        <p className="text-[15px] text-mute">{t.noBody}</p>
      ) : (
        <div className="h-48 shrink-0 border border-line">
          <CodeEditor label="Body" language={body.json ? "json" : undefined} value={body.text} />
        </div>
      )}
    </section>
  );
}
