import { on, once } from "node:events";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { WebhookEvent } from "../schemas.js";
import { realtimeRoute } from "./realtime.js";

const api = Fastify();
realtimeRoute(api);
let apiUrl: string;
beforeAll(async () => {
  await api.listen({ host: "127.0.0.1", port: 0 });
  apiUrl = `ws://127.0.0.1:${(api.server.address() as AddressInfo).port}/realtime`;
});
afterAll(() => api.close());

/** Abre o inspetor pelo /realtime e lê os eventos em ordem. */
async function inspector(start: Record<string, unknown> = {}) {
  const ws = new WebSocket(apiUrl, ["patchbay"]);
  const events = on(ws, "message");
  await once(ws, "open");
  ws.send(JSON.stringify({ kind: "webhook", ...start }));
  const next = async () => JSON.parse((await events.next()).value[0].toString()) as WebhookEvent;
  return { ws, next };
}

/** Request crua para o listener. Headers em lista (permite repetir): o Node não põe nenhum
 *  sozinho, então Host e Content-Length vão aqui. */
function hit(port: number, path: string, method: string, list: string[], body?: Buffer) {
  const headers = ["Host", `127.0.0.1:${port}`, ...list];
  if (body) headers.push("Content-Length", String(body.length));
  return new Promise<{ status: number; type?: string; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          type: res.headers["content-type"],
          body: Buffer.concat(chunks).toString(),
        }),
      );
    });
    req.on("error", reject);
    req.end(body);
  });
}

describe("WS /realtime com kind webhook", () => {
  it("escuta, grava a request crua e responde o status/body configurado", async () => {
    const { ws, next } = await inspector({ status: 202, body: '{"ok":true}' });
    const listening = await next();
    expect(listening).toMatchObject({ type: "listening", data: { port: expect.any(Number) } });
    const port = listening.type === "listening" ? listening.data.port : 0;

    const res = await hit(
      port,
      "/hooks/stripe?x=1&x=2",
      "POST",
      ["Content-Type", "application/json", "X-Sig", "a", "X-Sig", "b"],
      Buffer.from('{"id":1}'),
    );
    expect(res).toEqual({ status: 202, type: "application/json", body: '{"ok":true}' });

    const got = await next();
    expect(got).toMatchObject({
      type: "request",
      data: {
        method: "POST",
        url: "/hooks/stripe?x=1&x=2",
        body: '{"id":1}',
        isBinary: false,
        truncated: false,
        sizeBytes: 8,
      },
    });
    const headers = got.type === "request" ? got.data.headers : [];
    expect(headers).toContainEqual(["X-Sig", "a"]);
    expect(headers).toContainEqual(["X-Sig", "b"]);
    expect(got.at).toMatch(/^\d{4}-\d\d-\d\dT/);
    ws.close();
  });

  it("padrão 200 sem body; binário em base64; corta acima de 5 MB", async () => {
    const { ws, next } = await inspector();
    const listening = await next();
    const port = listening.type === "listening" ? listening.data.port : 0;

    expect(await hit(port, "/", "PUT", [], Buffer.from([0, 255, 254]))).toMatchObject({
      status: 200,
      body: "",
    });
    expect(await next()).toMatchObject({
      type: "request",
      data: { method: "PUT", body: "AP/+", isBinary: true, sizeBytes: 3 },
    });

    const big = Buffer.alloc(5 * 1024 * 1024 + 10, "a");
    expect((await hit(port, "/big", "POST", [], big)).status).toBe(200);
    const cut = await next();
    expect(cut).toMatchObject({
      type: "request",
      data: { truncated: true, sizeBytes: big.length },
    });
    expect(cut.type === "request" && cut.data.body.length).toBe(5 * 1024 * 1024);
    ws.close();
  });

  it("web fecha → listener fecha (sem porta órfã)", async () => {
    const { ws, next } = await inspector();
    const listening = await next();
    const port = listening.type === "listening" ? listening.data.port : 0;
    ws.terminate();
    await expect
      .poll(() => hit(port, "/", "GET", []).then(String, (err) => err.code), { timeout: 2000 })
      .toBe("ECONNREFUSED");
  });

  it("config inválida ou porta em uso viram error e o canal fecha", async () => {
    const bad = await inspector({ status: 99 });
    expect((await bad.next()).type).toBe("error");
    await once(bad.ws, "close");

    const first = await inspector();
    const listening = await first.next();
    const port = listening.type === "listening" ? listening.data.port : 0;
    const taken = await inspector({ port });
    const closed = once(taken.ws, "close");
    expect(await taken.next()).toMatchObject({
      type: "error",
      data: expect.stringMatching(/EADDRINUSE/),
    });
    expect(await taken.next()).toMatchObject({ type: "close", data: { code: 1011 } });
    await closed;
    first.ws.close();
  });
});
