// Volta do login OAuth (authorization code + PKCE). A web pede um listener temporário em
// 127.0.0.1 (porta livre, uso único, expira), abre o browser com o redirect_uri apontando para
// ele e espera o `code` aqui. O fluxo em si (PKCE, trocar o code por token) fica na web: a api
// só recebe a navegação do browser e repassa o code.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";

type Outcome = { code: string } | { error: string; status: number };
type Listener = { port: number; result: Promise<Outcome>; close: () => void };

const TIMEOUT_MS = 3 * 60_000;
const text = { "content-type": "text/plain; charset=utf-8", connection: "close" };

/** Escuta UMA volta do browser em `http://127.0.0.1:<porta>/callback` com o `state` esperado.
 *  State errado não consome o listener (não é a volta deste login). */
export async function listen(state: string, timeoutMs = TIMEOUT_MS): Promise<Listener> {
  let settle: (outcome: Outcome) => void = () => {};
  const result = new Promise<Outcome>((resolve) => {
    settle = resolve;
  });
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || url.pathname !== "/callback") return res.writeHead(404).end();
    const query = url.searchParams;
    if (query.get("state") !== state) {
      return res.writeHead(400, text).end("Patchbay: state inválido, login ignorado.");
    }
    const code = query.get("code");
    if (code) {
      res.writeHead(200, text).end("Patchbay: login concluído. Pode fechar esta aba.");
      return finish({ code });
    }
    const error = query.get("error_description") || query.get("error") || "sem code na volta";
    res.writeHead(400, text).end(`Patchbay: o login falhou (${error}).`);
    finish({ error, status: 400 });
  });
  const timer = setTimeout(
    () => finish({ error: "Tempo esgotado esperando o login no browser.", status: 408 }),
    timeoutMs,
  );
  const finish = (outcome: Outcome) => {
    clearTimeout(timer);
    server.close();
    settle(outcome);
  };
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { port, result, close: () => finish({ error: "Login cancelado.", status: 499 }) };
}

const pending = new Map<number, Listener>();

export function oauthRoute(app: FastifyInstance) {
  // Corpo: { state }. Resposta: { port }; o redirect_uri é http://127.0.0.1:<port>/callback.
  app.post<{ Body: { state?: unknown } }>("/oauth/listen", async (req, reply) => {
    const state = req.body?.state;
    if (typeof state !== "string" || state.length < 16) {
      return reply.code(400).send({ error: "state ausente ou curto demais" });
    }
    const listener = await listen(state);
    pending.set(listener.port, listener);
    // Quem não buscar o resultado em 30s depois de resolvido (web recarregou) perde.
    listener.result.then(() => setTimeout(() => pending.delete(listener.port), 30_000).unref());
    return { port: listener.port };
  });

  // Espera a volta do browser: { code } ou erro (400 do provedor, 408 tempo esgotado).
  // Uso único. Se a web desistir (fecha a conexão), o listener fecha junto.
  app.get<{ Params: { port: string } }>("/oauth/listen/:port", async (req, reply) => {
    const port = Number(req.params.port);
    const listener = pending.get(port);
    if (!listener) return reply.code(404).send({ error: "nenhum login OAuth esperando" });
    pending.delete(port);
    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) listener.close();
    });
    const outcome = await listener.result;
    if ("code" in outcome) return outcome;
    return reply.code(outcome.status).send({ error: outcome.error });
  });
}
