// Conexões realtime e seus logs, fora dos componentes: sobrevivem a trocar de aba e a esconder a
// janela (a webview continua viva na tray). Chave = key da aba. Não persiste: recarregar a
// página derruba as conexões (e a api fecha os upstreams).
import type { RealtimeEvent, RealtimeRequest } from "@api/schemas";
import { create } from "zustand";
import { requestContext } from "@/features/environments/store";
import { realtime } from "@/lib/api-client";
import { setTrayStatus } from "@/lib/desktop";
import { effectiveAuth, interpolate, prepareRealtime } from "@/lib/interpolate";
import { ensureAuth } from "@/lib/oauth";

/** Uma linha do log. "in"/"out" são mensagens; "event" é open/close/error da conexão. */
export type Entry = {
  id: number;
  at: string;
  dir: "in" | "out" | "event";
  data: string;
  binary?: boolean;
  /** Só SSE: nome do evento e id, quando o bloco os tinha. */
  event?: string;
  sseId?: string;
  /** Só "event": o tipo, para o carimbo de erro. */
  kind?: "open" | "close" | "error";
};

export type Connection = {
  status: "connecting" | "open" | "closed";
  log: Entry[];
  /** Do handshake com o upstream. */
  protocol?: string;
  headers?: [string, string][];
};

type RealtimeStore = {
  conns: Record<string, Connection>;
  /** Mensagem em edição por aba (não vai para o disco). */
  drafts: Record<string, string>;
  connect: (key: string, req: RealtimeRequest, path?: string) => Promise<void>;
  disconnect: (key: string) => void;
  /** path = arquivo da aba, para achar a coleção das `{{var}}`. */
  send: (key: string, path?: string) => Promise<void>;
  setDraft: (key: string, text: string) => void;
  clear: (key: string) => void;
  /** A aba fechou: desconecta e esquece o log. */
  drop: (key: string) => void;
};

// ponytail: log limitado às últimas 1000 linhas por conexão; virtualizar a lista se precisar de mais.
const LIMIT = 1000;
const sockets = new Map<string, WebSocket>();
let ids = 0;

export const useRealtime = create<RealtimeStore>()((set, get) => {
  const patch = (key: string, p: Partial<Connection>) =>
    set((s) => (s.conns[key] ? { conns: { ...s.conns, [key]: { ...s.conns[key], ...p } } } : s));
  const add = (key: string, entry: Omit<Entry, "id" | "at"> & { at?: string }) =>
    set((s) => {
      const conn = s.conns[key];
      if (!conn) return s;
      const line = { ...entry, id: ++ids, at: entry.at ?? new Date().toISOString() };
      return { conns: { ...s.conns, [key]: { ...conn, log: [...conn.log, line].slice(-LIMIT) } } };
    });
  const closed = (key: string, data: string, at?: string) => {
    if (get().conns[key]?.status === "closed") return;
    add(key, { dir: "event", kind: "close", data, at });
    patch(key, { status: "closed" });
  };

  return {
    conns: {},
    drafts: {},

    connect: async (key, req, path) => {
      get().disconnect(key);
      set((s) => ({
        conns: { ...s.conns, [key]: { status: "connecting", log: s.conns[key]?.log ?? [] } },
      }));
      try {
        const { scope, parents } = await requestContext(path);
        const inherited = effectiveAuth({ type: "inherit" }, parents);
        await ensureAuth(inherited, (t) => interpolate(t, scope.vars));
        const start = prepareRealtime(req, scope.vars, parents);
        // Sem esquema, assume ws:// ou http:// (como o editor HTTP).
        if (!/^[a-z][\w+.-]*:\/\//i.test(start.url))
          start.url = `${req.kind === "sse" ? "http" : "ws"}://${start.url}`;
        add(key, { dir: "event", kind: "open", data: `Conectando em ${start.url}` });
        const ws = await realtime();
        // Desconectou (ou fechou a aba) enquanto resolvia as variáveis.
        if (get().conns[key]?.status !== "connecting") return ws.close();
        sockets.set(key, ws);
        ws.onopen = () => ws.send(JSON.stringify(start));
        // Só o socket atual da aba conta: um antigo, fechando, não mexe no estado.
        ws.onmessage = (e) => {
          if (sockets.get(key) !== ws) return;
          const event: RealtimeEvent = JSON.parse(e.data);
          if (event.type === "open") {
            const { protocol, headers, status } = event.data;
            patch(key, { status: "open", protocol, headers });
            const detail = protocol
              ? ` · subprotocolo ${protocol}`
              : status
                ? ` · HTTP ${status}`
                : "";
            add(key, { dir: "event", kind: "open", data: `Conectado${detail}`, at: event.at });
          } else if (event.type === "message") {
            const { data, binary, at, event: name, id } = event;
            add(key, { dir: "in", data, binary, at, event: name, sseId: id });
          } else if (event.type === "error") {
            add(key, { dir: "event", kind: "error", data: event.data, at: event.at });
          } else {
            const { code, reason } = event.data;
            // O motivo que só repete o erro da linha de cima (falha do SSE) não vale outra vez.
            const repeated = get().conns[key]?.log.at(-1)?.data === reason;
            const text =
              repeated || !reason
                ? "Fechada"
                : code === 1000
                  ? `Fechada · ${reason}`
                  : `Fechada · ${code} ${reason}`;
            closed(key, text, event.at);
          }
        };
        // Canal com a api fechou: fim da sessão (desconectar, upstream fechou ou api caiu).
        ws.onclose = (e) => {
          if (sockets.get(key) !== ws) return;
          sockets.delete(key);
          closed(key, e.code === 1000 ? "Desconectado" : `Canal com a api caiu · ${e.code}`);
        };
      } catch (err) {
        add(key, { dir: "event", kind: "error", data: (err as Error).message });
        closed(key, "Desconectado");
      }
    },

    disconnect: (key) => {
      sockets.get(key)?.close();
      sockets.delete(key);
      closed(key, "Desconectado");
    },

    send: async (key, path) => {
      const ws = sockets.get(key);
      const text = get().drafts[key] ?? "";
      if (!ws || get().conns[key]?.status !== "open" || !text) return;
      // {{var}} na mensagem também valem.
      const { scope } = await requestContext(path);
      const data = interpolate(text, scope.vars);
      ws.send(data);
      add(key, { dir: "out", data });
    },

    setDraft: (key, text) => set((s) => ({ drafts: { ...s.drafts, [key]: text } })),
    clear: (key) => patch(key, { log: [] }),
    drop: (key) => {
      get().disconnect(key);
      set((s) => {
        const { [key]: _, ...conns } = s.conns;
        const { [key]: __, ...drafts } = s.drafts;
        return { conns, drafts };
      });
    },
  };
});

// Tray: "N conexões ativas" acompanha as conexões abertas.
let active = 0;
useRealtime.subscribe((s) => {
  const count = Object.values(s.conns).filter((c) => c.status === "open").length;
  if (count === active) return;
  active = count;
  setTrayStatus(count);
});
