// POST /send: recebe uma HttpRequest já resolvida e devolve a HttpResponse (PLANNING §6).
// Todo envio, com sucesso ou não, vira uma linha no histórico do workspace.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { send } from "../lib/http.js";
import { appendHistory } from "../lib/workspace.js";
import { type HistoryEntry, HttpRequest } from "../schemas.js";

const HISTORY_BODY_LIMIT = 64 * 1024;

/** Histórico guarda a request e o resumo da resposta; body de request grande é cortado. */
function record(request: HttpRequest, at: string, outcome: Omit<HistoryEntry, "at" | "request">) {
  const { body } = request;
  if ("content" in body && body.content.length > HISTORY_BODY_LIMIT) {
    request = { ...request, body: { ...body, content: body.content.slice(0, HISTORY_BODY_LIMIT) } };
  }
  // Falha ao gravar o histórico nunca derruba o envio.
  return appendHistory({ at, request, ...outcome }).catch(() => {});
}

export function sendRoute(app: FastifyInstance) {
  app.post("/send", { bodyLimit: 20 * 1024 * 1024 }, async (req, reply) => {
    const parsed = HttpRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });

    // Cancelar = a web aborta o próprio fetch; a conexão fecha e o upstream é abortado.
    const cancel = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) cancel.abort();
    });
    const at = new Date().toISOString();
    try {
      const res = await send(parsed.data, cancel.signal);
      const { status, statusText, timeMs, sizeBytes } = res;
      await record(parsed.data, at, { response: { status, statusText, timeMs, sizeBytes } });
      return res;
    } catch (err) {
      const { status = 502, message, code } = err as Error & { status?: number; code?: string };
      // AggregateError (ex.: ECONNREFUSED em ::1 e 127.0.0.1) vem sem message.
      const error = message || code || String(err);
      const reason = cancel.signal.aborted ? "cancelled" : status === 504 ? "timeout" : "error";
      await record(parsed.data, at, { failed: { reason, message: error } });
      return reply.code(status).send({ error });
    }
  });
}
