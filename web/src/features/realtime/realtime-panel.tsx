// Coluna da direita de uma request realtime: estado da conexão (lâmpada de cabo quando viva),
// handshake (headers da resposta, no SSE) e o log. MessageLog só recebe linhas: WS e SSE usam o mesmo.
import { Fragment, memo, useMemo, useState } from "react";
import { Tab, TabList, TabPanel, TabsRoot } from "@/components/tabs";
import { activeTab, toRealtime, useRequest, where } from "@/features/request-editor/store";
import { diagnose, STAMPS } from "@/features/response-viewer/diagnose";
import { focusUrl, mod } from "@/lib/utils";
import { type Entry, useRealtime } from "./store";

const STATUS = { connecting: "Conectando", open: "Conectado", closed: "Desconectado" };
const NO_LOG: Entry[] = [];
const action =
  "label h-[34px] border border-mute px-3.5 text-[12px] hover:shadow-[inset_0_-2px_var(--ink)]";

/** Erro da última tentativa de conexão, se ela terminou em erro (e não num Desconectar). */
export function lastError(log: Entry[]) {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "error") return e.data;
    if (e.kind === "open") return undefined; // tentativa nova (ou conectou) sem erro depois
  }
}

export function RealtimePanel() {
  const key = useRequest((s) => activeTab(s).key);
  const sse = useRequest((s) => activeTab(s).kind === "sse");
  const conn = useRealtime((s) => s.conns[key]);
  const status = conn?.status ?? "closed";
  const headers = conn?.headers ?? [];
  const error = status === "closed" ? lastError(conn?.log ?? NO_LOG) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <Failure error={error} />
      ) : (
        <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5" role="status">
          {status !== "closed" && <span className="size-[9px] shrink-0 rounded-full bg-cord" />}
          <span
            className={`label text-[17px] ${status === "closed" ? "text-mute" : "text-cord-text"}`}
          >
            {STATUS[status]}
          </span>
          {conn?.protocol && (
            <span className="ml-auto font-mono text-[13px]">
              <span className="text-mute">subprotocolo</span> {conn.protocol}
            </span>
          )}
        </div>
      )}

      <TabsRoot defaultValue="log" className="flex min-h-0 flex-1 flex-col">
        <TabList aria-label="Partes da conexão">
          <Tab value="log">Mensagens</Tab>
          <Tab value="handshake">
            {sse ? "Resposta" : "Handshake"} {headers.length || ""}
          </Tab>
        </TabList>
        <TabPanel value="log" className="flex flex-col p-0">
          <MessageLog
            entries={conn?.log ?? NO_LOG}
            onClear={() => useRealtime.getState().clear(key)}
          />
        </TabPanel>
        <TabPanel value="handshake">
          {headers.length === 0 ? (
            <p className="text-[15px] text-mute">
              Os headers da resposta {sse ? "do stream" : "do handshake"} aparecem ao conectar.
            </p>
          ) : (
            <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-px border border-line bg-line font-mono text-[13px]">
              {headers.map(([k, v], index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: headers repetem; a ordem é a identidade
                <Fragment key={index}>
                  <dt className="bg-bg px-2.5 py-1 break-all text-ink">{k}</dt>
                  <dd className="bg-bg px-2.5 py-1 break-all text-ink-2">{v}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </TabPanel>
      </TabsRoot>
    </div>
  );
}

/** Conexão que terminou em erro: o mesmo carimbo, diagnóstico e saídas de uma request HTTP. */
function Failure({ error }: { error: string }) {
  const url = useRequest((s) => activeTab(s).url);
  const diagnosis = diagnose("error", error, url);
  const reconnect = () => {
    const tab = activeTab(useRequest.getState());
    useRealtime.getState().connect(tab.key, toRealtime(tab), where(tab));
  };
  return (
    <div className="grid gap-3 px-[18px] pt-[18px] pb-3.5" role="alert">
      <span className="label w-fit border-2 border-prod-text px-2 py-px text-prod-text">
        {STAMPS.error}
      </span>
      {diagnosis && <p className="max-w-[64ch] text-[15px] text-ink">{diagnosis.hint}</p>}
      <p className="font-mono text-[13px] break-words text-ink-2">{error}</p>
      <div className="flex flex-wrap gap-2">
        {diagnosis?.fix === "url" && (
          <button type="button" onClick={focusUrl} className={action}>
            Corrigir URL
            <span className="ml-1.5 font-mono font-normal tracking-normal text-mute normal-case">
              {mod("L")}
            </span>
          </button>
        )}
        <button type="button" onClick={reconnect} className={action}>
          Reconectar
          <span className="ml-1.5 font-mono font-normal tracking-normal text-mute normal-case">
            {mod("↵")}
          </span>
        </button>
      </div>
    </div>
  );
}

// Faixa de frames (DESIGN.md › assinatura): uma barra fina por frame, a mais nova à direita.
// Altura pelo tamanho (escala log até 64 KB), cor pelo código: in em tinta, out no cabo, erro em
// prod-text (a mesma cor do erro no log). Sem animação própria: a barra nova só aparece quando o frame chega.
const SLOTS = 120;
const SLOT = 4;
const STRIP_H = 36;
const FILL = { in: "fill-ink", out: "fill-cord", err: "fill-prod-text" };

function FrameStrip({ entries }: { entries: Entry[] }) {
  const frames = entries
    .filter((e) => e.dir !== "event" || e.kind === "error")
    .slice(-SLOTS)
    .map((e) => ({
      id: e.id,
      tone: e.dir === "event" ? ("err" as const) : e.dir,
      size: e.binary ? Math.floor((e.data.length * 3) / 4) : e.data.length,
    }));
  if (frames.length === 0) return null;
  const count = (tone: keyof typeof FILL) => frames.filter((f) => f.tone === tone).length;
  return (
    <svg
      role="img"
      aria-label={`Últimos ${frames.length} frames: ${count("in")} recebidos, ${count("out")} enviados, ${count("err")} erros`}
      viewBox={`0 0 ${SLOTS * SLOT} ${STRIP_H}`}
      preserveAspectRatio="none"
      className="block h-9 w-full shrink-0"
    >
      <title>Frames: recebidos em tinta, enviados no cabo, erros em vermelho</title>
      {frames.map((f, i) => {
        const h = 3 + (STRIP_H - 4) * Math.min(1, Math.log2(f.size + 1) / 16);
        return (
          <rect
            key={f.id}
            x={(SLOTS - frames.length + i) * SLOT}
            y={STRIP_H - h}
            width={SLOT * 0.38}
            height={h}
            className={FILL[f.tone]}
          />
        );
      })}
    </svg>
  );
}

/** Timecode desde a última abertura da conexão: `HH:MM:SS:cc` (cc = centésimos). */
export function timecode(ms: number) {
  const t = Math.max(0, Math.floor(ms / 10));
  const pad = (n: number) => String(n).padStart(2, "0");
  return [Math.floor(t / 360000), Math.floor(t / 6000) % 60, Math.floor(t / 100) % 60, t % 100]
    .map(pad)
    .join(":");
}

/** Log de frames, mais novo no topo. Filtro por texto e Limpar. Com onSelect (webhook), o
 *  cabeçalho de cada linha vira botão e a selecionada inverte. */
export function MessageLog({
  entries,
  onClear,
  selected,
  onSelect,
}: {
  entries: Entry[];
  onClear: () => void;
  selected?: number;
  onSelect?: (id: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const [raw, setRaw] = useState(false);
  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    const list = q
      ? entries.filter((e) => `${e.event ?? ""} ${e.data}`.toLowerCase().includes(q))
      : entries;
    return list.slice().reverse();
  }, [entries, filter]);
  // Cada linha conta a partir do "open" mais recente antes dela (reconectar zera o relógio).
  const codes = useMemo(() => {
    const out = new Map<number, string>();
    let base = 0;
    for (const e of entries) {
      const at = Date.parse(e.at);
      if (e.kind === "open" || !base) base = at;
      out.set(e.id, timecode(at - base));
    }
    return out;
  }, [entries]);

  return (
    <>
      {entries.length > 0 && (
        <div className="shrink-0 border-b border-line px-[18px] pt-2.5 pb-1.5">
          <FrameStrip entries={entries} />
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-[18px] py-2">
        <input
          type="search"
          aria-label="Filtrar mensagens"
          placeholder="Filtrar"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-0 flex-1 border border-line bg-bg px-2.5 py-1 font-mono text-[13px] text-ink outline-offset-[-2px] placeholder:text-mute"
        />
        <span className="font-mono text-[12px] text-mute tabular-nums">
          {filter ? `${shown.length}/${entries.length}` : entries.length}
        </span>
        <div className="inline-flex shrink-0 border border-mute">
          {(["Raw", "Pretty"] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={raw === (name === "Raw")}
              onClick={() => setRaw(name === "Raw")}
              className="label px-2.5 py-1 text-[12px] aria-pressed:bg-ink aria-pressed:text-bg"
            >
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          className="label px-2 py-1 text-[12px] outline-offset-[-2px] enabled:hover:shadow-[inset_0_-2px_var(--ink)] disabled:text-mute"
        >
          Limpar
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="p-[18px] text-[15px] text-mute">Nenhuma mensagem ainda.</p>
      ) : (
        <ol aria-label="Mensagens" className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {shown.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              code={codes.get(entry.id) ?? ""}
              raw={raw}
              selected={entry.id === selected}
              onSelect={onSelect}
            />
          ))}
        </ol>
      )}
    </>
  );
}

const clock = (at: string) =>
  new Date(at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

function pretty(data: string) {
  if (!/^\s*[[{]/.test(data)) return data;
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}

// memo: linhas não mudam depois de criadas; só as novas renderizam (e só elas parseiam JSON).
const Row = memo(function Row({
  entry,
  code,
  raw,
  selected,
  onSelect,
}: {
  entry: Entry;
  code: string;
  raw: boolean;
  selected?: boolean;
  onSelect?: (id: number) => void;
}) {
  const event = entry.dir === "event";
  const tone = entry.kind === "error" ? "text-prod-text" : event ? "text-mute" : "text-ink-2";
  return (
    <li className="grid grid-cols-[auto_28px_minmax(0,1fr)] gap-x-2.5 px-[18px] py-1 font-mono text-[12.5px] leading-[1.6]">
      <span className="text-[12px] text-mute tabular-nums" title={clock(entry.at)}>
        {code}
      </span>
      <span
        className={
          entry.kind === "error"
            ? "text-prod-text"
            : entry.dir === "out"
              ? "text-cord-text"
              : "text-mute"
        }
      >
        {event ? (entry.kind === "error" ? "err" : "·") : entry.dir}
      </span>
      <div className="min-w-0">
        {onSelect && entry.event ? (
          <button
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(entry.id)}
            className="block max-w-full truncate px-1 text-left text-ink outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)] aria-pressed:bg-ink aria-pressed:text-bg"
          >
            {entry.event}
          </button>
        ) : (
          (entry.event || entry.sseId !== undefined) && (
            <span className="block text-mute">
              {entry.event && <span className="text-ink">{entry.event}</span>}
              {entry.sseId !== undefined && ` · id ${entry.sseId}`}
            </span>
          )
        )}
        {entry.binary ? (
          <span className="block break-all text-ink-2">
            <span className="text-mute">binário · {atob(entry.data).length} B · base64 </span>
            {entry.data}
          </span>
        ) : (
          <pre className={`break-words whitespace-pre-wrap ${tone}`}>
            {event || raw ? entry.data : pretty(entry.data)}
          </pre>
        )}
      </div>
    </li>
  );
});
