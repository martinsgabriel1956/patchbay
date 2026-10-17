// Inspetor de webhooks: um servidor HTTP à parte, aberto pelo /realtime (que passa pelas guardas
// do server.ts) e fechado junto com ele. Sem rotas, sem token, sem /files nem /send: só grava cada
// request que chega e responde o status/body configurado. Escuta só em 127.0.0.1; para receber de
// fora, um túnel (ngrok, cloudflared) aponta para a porta.
import { isUtf8 } from "node:buffer";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { CapturedRequest, WebhookEvent, WebhookStart } from "../schemas.js";
import { headerPairs } from "./http.js";

/** Mesmo corte do body da resposta no /send. */
const LIMIT = 5 * 1024 * 1024;

type Event = WebhookEvent extends infer E ? (E extends unknown ? Omit<E, "at"> : never) : never;

/** Sobe o listener e devolve o "parar". Erro ao escutar (porta em uso) vira error + close. */
export function webhook(start: WebhookStart, emit: (event: Event) => void) {
  const body = start.body ?? "";
  const type = /^\s*[[{]/.test(body) ? "application/json" : "text/plain; charset=utf-8";
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    let sizeBytes = 0;
    try {
      for await (const chunk of req) {
        sizeBytes += chunk.length;
        // Lê até o fim (o cliente espera a resposta), mas guarda só os primeiros 5 MB.
        if (sizeBytes - chunk.length < LIMIT) chunks.push(chunk as Buffer);
      }
    } catch {
      return; // o cliente desistiu no meio
    }
    const raw = Buffer.concat(chunks).subarray(0, LIMIT);
    const isBinary = !isUtf8(raw);
    const captured: CapturedRequest = {
      method: req.method ?? "",
      url: req.url ?? "/",
      headers: headerPairs(req.rawHeaders),
      body: raw.toString(isBinary ? "base64" : "utf8"),
      isBinary,
      truncated: sizeBytes > LIMIT,
      sizeBytes,
    };
    emit({ type: "request", data: captured });
    res.writeHead(start.status ?? 200, body ? { "content-type": type } : {}).end(body);
  });
  let closed = false;
  const close = (code: number, reason: string) => {
    if (closed) return;
    closed = true;
    server.close();
    server.closeAllConnections();
    emit({ type: "close", data: { code, reason } });
  };
  server.on("error", (err) => {
    emit({ type: "error", data: err.message });
    close(1011, err.message);
  });
  server.listen(start.port ?? 0, "127.0.0.1", () => {
    // Parado antes de terminar de abrir (o listen resolve o host antes): fecha agora.
    if (closed) return server.close();
    emit({ type: "listening", data: { port: (server.address() as AddressInfo).port } });
  });
  return () => close(1000, "stopped");
}
