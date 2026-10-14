// Coluna da direita de uma request realtime: estado da conexão (lâmpada de cabo quando viva),
// handshake (headers da resposta, no SSE) e o log. MessageLog só recebe linhas: WS e SSE usam o mesmo.
import { Fragment, memo, useMemo, useState } from "react";
import { Tab, TabList, TabPanel, TabsRoot } from "@/components/tabs";
import { activeTab, useRequest } from "@/features/request-editor/store";
import { type Entry, useRealtime } from "./store";

const STATUS = { connecting: "Conectando", open: "Conectado", closed: "Desconectado" };
const NO_LOG: Entry[] = [];

export function RealtimePanel() {
  const key = useRequest((s) => activeTab(s).key);
  const sse = useRequest((s) => activeTab(s).kind === "sse");
  const conn = useRealtime((s) => s.conns[key]);
  const status = conn?.status ?? "closed";
  const headers = conn?.headers ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
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

/** Log de frames, mais novo no topo. Filtro por texto e Limpar. */
export function MessageLog({ entries, onClear }: { entries: Entry[]; onClear: () => void }) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    const list = q ? entries.filter((e) => e.data.toLowerCase().includes(q)) : entries;
    return list.slice().reverse();
  }, [entries, filter]);

  return (
    <>
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
            <Row key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </>
  );
}

const time = (at: string) =>
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
const Row = memo(function Row({ entry }: { entry: Entry }) {
  const event = entry.dir === "event";
  const tone = entry.kind === "error" ? "text-prod-text" : event ? "text-mute" : "text-ink-2";
  return (
    <li className="grid grid-cols-[auto_28px_minmax(0,1fr)] gap-x-2.5 px-[18px] py-1 font-mono text-[12.5px] leading-[1.6]">
      <span className="text-[12px] text-mute tabular-nums">{time(entry.at)}</span>
      <span className="text-mute">
        {event ? (entry.kind === "error" ? "err" : "·") : entry.dir}
      </span>
      {entry.binary ? (
        <span className="break-all text-ink-2">
          <span className="text-mute">binário · {atob(entry.data).length} B · base64 </span>
          {entry.data}
        </span>
      ) : (
        <div className="min-w-0">
          {(entry.event || entry.sseId !== undefined) && (
            <span className="block text-mute">
              {entry.event && <span className="text-ink">{entry.event}</span>}
              {entry.sseId !== undefined && ` · id ${entry.sseId}`}
            </span>
          )}
          <pre className={`break-words whitespace-pre-wrap ${tone}`}>
            {event ? entry.data : pretty(entry.data)}
          </pre>
        </div>
      )}
    </li>
  );
});
