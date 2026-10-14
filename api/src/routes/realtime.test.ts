import { on, once } from "node:events";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import type { RealtimeEvent } from "../schemas.js";
import { realtimeRoute } from "./realtime.js";

// Upstream de eco: devolve texto e binário como recebeu; "bye" faz ele fechar com 4000.
const upstream = new WebSocketServer({ host: "127.0.0.1", port: 0 });
let handshake: IncomingHttpHeaders = {};
let upstreamClosed: Promise<unknown[]>; // close da última conexão que chegou no upstream
upstream.on("headers", (headers) => headers.push("X-Echo: 1"));
upstream.on("connection", (ws, req) => {
  handshake = req.headers;
  upstreamClosed = once(ws, "close");
  ws.on("message", (data, binary) => {
    if (!binary && data.toString() === "bye") ws.close(4000, "tchau");
    else ws.send(data, { binary });
  });
});

// Upstream SSE: /stream manda 2 eventos e fecha; /hang manda 1 e fica aberto; /json e /404 erram.
let sseHeaders: IncomingHttpHeaders = {};
let hangClosed: Promise<unknown[]>;
const sseServer = createServer((req, res) => {
  sseHeaders = req.headers;
  if (req.url === "/404") return res.writeHead(404).end("nope");
  if (req.url === "/json") return res.writeHead(200, { "content-type": "application/json" }).end();
  res.writeHead(200, { "content-type": "text/event-stream", "x-sse": "1" });
  res.write(": hello\n\nevent: tick\nid: 1\ndata: a\ndata: b\n\n");
  if (req.url === "/hang") hangClosed = once(res, "close");
  else res.end("data: fim\r\n\r\n");
});

const api = Fastify();
realtimeRoute(api);
let apiUrl: string;
let echoUrl: string;
beforeAll(async () => {
  await api.listen({ host: "127.0.0.1", port: 0 });
  apiUrl = `ws://127.0.0.1:${(api.server.address() as AddressInfo).port}/realtime`;
  echoUrl = `ws://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  sseServer.listen(0, "127.0.0.1");
  await once(sseServer, "listening");
  sseUrl = `http://127.0.0.1:${(sseServer.address() as AddressInfo).port}`;
});
let sseUrl: string;
afterAll(async () => {
  await api.close();
  upstream.close();
  sseServer.close();
});

/** Abre uma sessão no /realtime, manda a 1ª mensagem e lê os eventos em ordem. */
async function session(start: unknown) {
  const ws = new WebSocket(apiUrl, ["patchbay"]);
  const events = on(ws, "message");
  await once(ws, "open");
  ws.send(JSON.stringify(start));
  const next = async () => JSON.parse((await events.next()).value[0].toString()) as RealtimeEvent;
  return { ws, next };
}

const start = (patch = {}) => ({ kind: "ws", url: echoUrl, headers: [], ...patch });

describe("WS /realtime", () => {
  it("handshake leva headers e subprotocolo; eco de texto e binário", async () => {
    const { ws, next } = await session(
      start({
        headers: [
          { key: "Authorization", value: "Bearer abc", enabled: true },
          { key: "X-Off", value: "1", enabled: false },
        ],
        protocols: ["chat", "superchat"],
      }),
    );
    expect(ws.protocol).toBe("patchbay");
    const open = await next();
    expect(open).toMatchObject({ type: "open", data: { protocol: "chat" } });
    expect(open.type === "open" && open.data.headers).toContainEqual(["X-Echo", "1"]);
    expect(open.at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(handshake.authorization).toBe("Bearer abc");
    expect(handshake["x-off"]).toBeUndefined();
    expect(handshake["sec-websocket-protocol"]).toBe("chat,superchat");

    ws.send("oi");
    expect(await next()).toMatchObject({ type: "message", data: "oi" });
    ws.send(Buffer.from([0, 255]));
    expect(await next()).toMatchObject({ type: "message", data: "AP8=", binary: true });
    ws.close();
  });

  it("upstream fecha → a web recebe close e o canal fecha", async () => {
    const { ws, next } = await session(start());
    expect((await next()).type).toBe("open");
    const closed = once(ws, "close");
    ws.send("bye");
    expect(await next()).toMatchObject({ type: "close", data: { code: 4000, reason: "tchau" } });
    await closed;
  });

  it("web fecha → upstream fecha (sem conexão órfã)", async () => {
    const { ws, next } = await session(start());
    expect((await next()).type).toBe("open");
    ws.terminate(); // queda brusca, sem close frame
    expect((await upstreamClosed)[0]).toBe(1000);
  });

  it("1ª mensagem inválida ou upstream fora do ar viram error", async () => {
    const bad = await session({ kind: "ws" });
    expect((await bad.next()).type).toBe("error");
    await once(bad.ws, "close");

    const down = await session(start({ url: "ws://127.0.0.1:1" }));
    expect(await down.next()).toMatchObject({
      type: "error",
      data: expect.stringMatching(/ECONNREFUSED/),
    });
    expect((await down.next()).type).toBe("close");
  });
});

describe("WS /realtime com kind sse", () => {
  const sse = (path: string, patch = {}) =>
    session({ kind: "sse", url: sseUrl + path, headers: [], ...patch });

  it("open com status e headers; eventos repassados; fim do stream fecha", async () => {
    const { ws, next } = await sse("/stream", {
      headers: [{ key: "Authorization", value: "Bearer abc", enabled: true }],
    });
    const open = await next();
    expect(open).toMatchObject({ type: "open", data: { protocol: "", status: 200 } });
    expect(open.type === "open" && open.data.headers).toContainEqual(["x-sse", "1"]);
    expect(sseHeaders.accept).toBe("text/event-stream");
    expect(sseHeaders.authorization).toBe("Bearer abc");
    expect(await next()).toMatchObject({ type: "message", event: "tick", id: "1", data: "a\nb" });
    const last = await next();
    expect(last).toMatchObject({ type: "message", data: "fim" });
    expect(last).not.toHaveProperty("event");
    const closed = once(ws, "close");
    expect(await next()).toMatchObject({ type: "close", data: { code: 1000 } });
    await closed;
  });

  it("Accept do usuário é mantido; mensagem da web vira error", async () => {
    const { ws, next } = await sse("/hang", {
      headers: [{ key: "accept", value: "text/event-stream; q=1", enabled: true }],
    });
    expect((await next()).type).toBe("open");
    expect(sseHeaders.accept).toBe("text/event-stream; q=1");
    expect((await next()).type).toBe("message");
    ws.send("oi");
    expect(await next()).toMatchObject({ type: "error", data: expect.stringMatching(/read-only/) });
    ws.close();
  });

  it("web fecha → upstream abortado", async () => {
    const { ws, next } = await sse("/hang");
    expect((await next()).type).toBe("open");
    expect((await next()).type).toBe("message");
    ws.terminate();
    await hangClosed; // o servidor viu a conexão cair
  });

  it("status não-2xx e Content-Type errado viram error + close", async () => {
    for (const [path, pattern] of [
      ["/404", /HTTP 404/],
      ["/json", /text\/event-stream.*application\/json/],
    ] as const) {
      const { ws, next } = await sse(path);
      const closed = once(ws, "close");
      expect(await next()).toMatchObject({ type: "error", data: expect.stringMatching(pattern) });
      expect(await next()).toMatchObject({ type: "close", data: { code: 1011 } });
      await closed;
    }
    const down = await session({ kind: "sse", url: "http://127.0.0.1:1", headers: [] });
    expect(await down.next()).toMatchObject({
      type: "error",
      data: expect.stringMatching(/ECONNREFUSED/),
    });
  });
});
