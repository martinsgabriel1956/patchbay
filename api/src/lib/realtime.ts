// Proxy WebSocket e SSE (PLANNING §6 › WS /realtime). Uma conexão web↔api por sessão: a 1ª
// mensagem abre o upstream, as seguintes vão para ele (só WS), e fechar de qualquer lado fecha o
// outro. SSE: GET com stream, cada evento vira um "message". Sem reconexão automática.
// `{ kind: "watch" }` como 1ª mensagem faz da conexão o aviso de mudanças no workspace (watch.ts).
// Proxy e certificado de cliente (options): o SSE usa os dois; o WS só o certificado.
// `{ kind: "webhook" }` sobe um listener à parte (webhook.ts) que vive enquanto a conexão viver.

import { request } from "undici";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";
import {
  type RealtimeEvent,
  RealtimeStart,
  WebhookStart,
  type WorkspaceEvent,
} from "../schemas.js";
import { dispatcher, headerPairs, tlsOptions } from "./http.js";
import { sseParser } from "./sse.js";
import { watch } from "./watch.js";
import { webhook } from "./webhook.js";

type Event = RealtimeEvent extends infer E ? (E extends unknown ? Omit<E, "at"> : never) : never;
type Emit = (event: Event) => void;

/** SSE: emite open/message/error e, no fim, close. Abortar o signal fecha o upstream em silêncio. */
async function sse(start: RealtimeStart, emit: Emit, signal: AbortSignal) {
  const headers: [string, string][] = [];
  for (const h of start.headers) if (h.enabled && h.key) headers.push([h.key, h.value]);
  const has = (name: string) => headers.some(([key]) => key.toLowerCase() === name);
  if (!has("accept")) headers.push(["accept", "text/event-stream"]);
  if (!has("user-agent")) headers.push(["user-agent", "patchbay"]);
  try {
    const url = new URL(start.url);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error(`unsupported protocol: ${url.protocol}`);
    // ponytail: não segue redirects (3xx vira erro); usar o loop de http.ts se fizer falta.
    const res = await request(url, {
      headers: headers.flat(),
      signal,
      dispatcher: await dispatcher(start.options), // sem bodyTimeout: o stream pode ficar quieto
      responseHeaders: "raw",
    });
    const pairs = headerPairs(res.headers as unknown as string[]);
    const type = pairs.find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
    const problem =
      res.statusCode < 200 || res.statusCode > 299
        ? `HTTP ${res.statusCode} ${res.statusText ?? ""}`.trim()
        : !/^text\/event-stream\b/i.test(type)
          ? `expected Content-Type text/event-stream, got "${type}"`
          : undefined;
    if (problem) {
      await res.body.dump();
      emit({ type: "error", data: problem });
      return emit({ type: "close", data: { code: 1011, reason: problem } });
    }
    emit({ type: "open", data: { protocol: "", headers: pairs, status: res.statusCode } });
    const parse = sseParser();
    const forward = (events: ReturnType<typeof parse>) => {
      for (const e of events) emit({ type: "message", ...e });
    };
    for await (const chunk of res.body) forward(parse(chunk as Buffer));
    forward(parse());
    emit({ type: "close", data: { code: 1000, reason: "stream ended" } });
  } catch (err) {
    if (signal.aborted) return; // a web fechou: ninguém para avisar
    const { message, code } = err as Error & { code?: string };
    const reason = message || code || String(err); // AggregateError (ECONNREFUSED) vem sem message
    emit({ type: "error", data: reason });
    emit({ type: "close", data: { code: 1011, reason } });
  }
}

export function relay(client: WebSocket) {
  let upstream: WebSocket | undefined;
  let stream: AbortController | undefined;
  let watching = false;
  const emit = (event: Event) => {
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify({ ...event, at: new Date().toISOString() }));
  };
  // Erro antes do upstream abrir (mensagem inválida, URL ruim): avisa e encerra a sessão.
  const abort = (message: string) => {
    emit({ type: "error", data: message });
    client.close(1000);
  };

  client.on("error", () => {}); // frame inválido etc.: o "close" logo depois limpa tudo
  // Web caiu ou desconectou: o upstream não fica órfão (PLANNING §10).
  client.on("close", () => {
    if (upstream && upstream.readyState !== WebSocket.CLOSED) upstream.close(1000);
    stream?.abort();
  });

  let opening = false;
  client.on("message", async (data: RawData, isBinary: boolean) => {
    if (watching) return;
    if (stream) return emit({ type: "error", data: "SSE is read-only: messages are not sent" });
    if (upstream || opening) {
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      else emit({ type: "error", data: "upstream is not open" });
      return;
    }
    let start: RealtimeStart;
    try {
      const message = JSON.parse(data.toString());
      // { kind: "watch" }: em vez de upstream, avisa quando o workspace muda no disco.
      if (message?.kind === "watch") {
        watching = true;
        const stop = watch((paths) => {
          if (client.readyState === WebSocket.OPEN)
            client.send(JSON.stringify({ type: "changed", paths } satisfies WorkspaceEvent));
        });
        client.on("close", stop);
        return;
      }
      // { kind: "webhook" }: listener próprio; a web só ouve (mensagens seguintes são ignoradas).
      if (message?.kind === "webhook") {
        const hook = WebhookStart.safeParse(message);
        if (!hook.success) return abort(z.prettifyError(hook.error));
        watching = true;
        const stop = webhook(hook.data, (event) => {
          if (client.readyState === WebSocket.OPEN)
            client.send(JSON.stringify({ ...event, at: new Date().toISOString() }));
          if (event.type === "close") client.close(1000);
        });
        client.on("close", stop); // web fechou (ou caiu): o listener não fica órfão
        return;
      }
      const parsed = RealtimeStart.safeParse(message);
      if (!parsed.success) return abort(z.prettifyError(parsed.error));
      start = parsed.data;
    } catch {
      return abort("first message must be JSON");
    }

    if (start.kind === "sse") {
      stream = new AbortController();
      sse(start, emit, stream.signal).then(() => client.close(1000));
      return;
    }

    const headers: Record<string, string> = { "user-agent": "patchbay" };
    for (const h of start.headers) if (h.enabled && h.key) headers[h.key.toLowerCase()] = h.value;
    // ponytail: WS não passa por proxy (o `ws` precisaria de um agent com CONNECT, que não temos).
    opening = true;
    try {
      const tls = await tlsOptions(start.options);
      if (client.readyState !== WebSocket.OPEN) return; // a web saiu enquanto lia os certificados
      upstream = new WebSocket(start.url, start.protocols ?? [], { headers, ...tls });
    } catch (err) {
      return abort((err as Error).message); // URL ou subprotocolo inválido
    }

    // Headers da resposta do handshake (101), para o evento "open".
    const handshake: [string, string][] = [];
    upstream.on("upgrade", ({ rawHeaders: raw }) => {
      for (let i = 0; i < raw.length; i += 2) handshake.push([raw[i], raw[i + 1]]);
    });
    upstream.on("open", () =>
      emit({ type: "open", data: { protocol: upstream?.protocol ?? "", headers: handshake } }),
    );
    // binaryType padrão ("nodebuffer"): msg é sempre um Buffer.
    upstream.on("message", (msg: RawData, binary: boolean) => {
      const buf = msg as Buffer;
      emit(
        binary
          ? { type: "message", data: buf.toString("base64"), binary: true }
          : { type: "message", data: buf.toString("utf8") },
      );
    });
    upstream.on("error", (err) => emit({ type: "error", data: err.message }));
    upstream.on("close", (code, reason) => {
      emit({ type: "close", data: { code, reason: reason.toString() } });
      client.close(1000);
    });
  });
}
