// Servidor local da Patchbay. Escuta só em 127.0.0.1 numa porta livre, imprime UMA linha
// JSON {"port","token"} no stdout e sai quando o stdin fecha (sem processo órfão).
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { isSea } from "node:sea";
import Fastify from "fastify";
import { root } from "./lib/workspace.js";
import { filesRoute } from "./routes/files.js";
import { oauthRoute } from "./routes/oauth.js";
import { realtimeRoute } from "./routes/realtime.js";
import { sendRoute } from "./routes/send.js";

// Knobs de dev (porta fixa, token fixo, origem do Vite) nunca valem no binário SEA de produção.
const dev = !isSea();
const token = (dev && process.env.PATCHBAY_TOKEN) || randomBytes(32).toString("base64url");
const allowedOrigins = new Set(["tauri://localhost", "http://tauri.localhost"]);
if (dev && process.env.PATCHBAY_DEV_ORIGIN) allowedOrigins.add(process.env.PATCHBAY_DEV_ORIGIN);

const sameToken = (value: unknown) => {
  if (typeof value !== "string") return false;
  const a = Buffer.from(value);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

// O browser não manda header no upgrade do WebSocket: ali o token vem como subprotocolo
// `patchbay.token.<token>` (nunca na URL, que acaba em logs). A api responde só "patchbay".
const TOKEN_PROTOCOL = "patchbay.token.";
const protocolToken = (header?: string) =>
  header
    ?.split(",")
    .map((p) => p.trim())
    .find((p) => p.startsWith(TOKEN_PROTOCOL))
    ?.slice(TOKEN_PROTOCOL.length);

const app = Fastify({ logger: false });

// Guardas da seção 7 do PLANNING, em toda request (inclusive 404 e upgrade de WS).
app.addHook("onRequest", async (req, reply) => {
  const { port } = app.server.address() as AddressInfo;
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    return reply.code(403).send({ error: "host not allowed" });
  }
  const origin = req.headers.origin;
  if (origin !== undefined) {
    if (!allowedOrigins.has(origin)) return reply.code(403).send({ error: "origin not allowed" });
    reply.header("access-control-allow-origin", origin).header("vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    return reply
      .code(204)
      .header("access-control-allow-methods", "GET, POST, PUT, DELETE")
      .header("access-control-allow-headers", "content-type, x-session-token")
      .header("access-control-max-age", "600")
      .send();
  }
  const { "x-session-token": header, "sec-websocket-protocol": protocols } = req.headers;
  if (!sameToken(header) && !sameToken(protocolToken(protocols))) {
    return reply.code(401).send({ error: "invalid session token" });
  }
});

app.get("/health", async () => ({ ok: true }));
sendRoute(app);
filesRoute(app);
realtimeRoute(app);
oauthRoute(app);

process.stdin.on("end", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));
process.stdin.resume();

// Sem top-level await: o bundle do SEA é CommonJS. O workspace (WORKSPACE_DIR, padrão
// ~/patchbay) é criado antes de escutar; se não der, a api nem sobe.
root()
  .then(() => app.listen({ host: "127.0.0.1", port: Number(process.env.PORT ?? 0) }))
  .then(() => {
    const { port } = app.server.address() as AddressInfo;
    process.stdout.write(`${JSON.stringify({ port, token })}\n`);
  });
