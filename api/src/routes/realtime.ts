// WS /realtime (PLANNING §6). As guardas do onRequest (server.ts) valem no upgrade: o
// @fastify/websocket passa o upgrade pelo roteador do Fastify antes de aceitar.
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { relay } from "../lib/realtime.js";

/** Subprotocolo da sessão. O token também pode vir como `patchbay.token.<token>` (server.ts). */
const PROTOCOL = "patchbay";

export function realtimeRoute(app: FastifyInstance) {
  app.register(websocket, {
    // Responde só "patchbay": o subprotocolo com o token nunca volta na resposta.
    options: { handleProtocols: (protocols) => (protocols.has(PROTOCOL) ? PROTOCOL : false) },
  });
  app.register(async (scope) => {
    scope.get("/realtime", { websocket: true }, (socket) => relay(socket));
  });
}
