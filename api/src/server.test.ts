import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

const DEV_ORIGIN = "http://localhost:5173";

async function start() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: "0",
      PATCHBAY_TOKEN: "",
      PATCHBAY_DEV_ORIGIN: DEV_ORIGIN,
      WORKSPACE_DIR: mkdtempSync(path.join(tmpdir(), "patchbay-server-")), // nunca o ~/patchbay
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const [line] = await once(createInterface({ input: child.stdout }), "line");
  return { child, ...(JSON.parse(line) as { port: number; token: string }) };
}

function get(port: number, path: string, headers: Record<string, string>, method = "GET") {
  return new Promise<{ status: number; headers: Record<string, unknown> }>((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, headers: res.headers });
    })
      .on("error", reject)
      .end();
  });
}

describe("guardas da api", () => {
  let api: Awaited<ReturnType<typeof start>>;
  beforeAll(async () => {
    api = await start();
  });
  afterAll(() => api.child.kill());

  it("exige Host, Origin, token e responde CORS só para a allowlist", async () => {
    const host = `127.0.0.1:${api.port}`;
    const ok = { host, "x-session-token": api.token };

    expect((await get(api.port, "/health", ok)).status).toBe(200);
    expect((await get(api.port, "/health", { ...ok, host: `localhost:${api.port}` })).status).toBe(
      200,
    );
    // sem token / token errado
    expect((await get(api.port, "/health", { host })).status).toBe(401);
    expect((await get(api.port, "/health", { host, "x-session-token": "x" })).status).toBe(401);
    // DNS rebinding: Host diferente
    expect((await get(api.port, "/health", { ...ok, host: `evil.com:${api.port}` })).status).toBe(
      403,
    );
    expect((await get(api.port, "/health", { ...ok, host: "127.0.0.1:1" })).status).toBe(403);
    // Origin fora da allowlist
    expect((await get(api.port, "/health", { ...ok, origin: "https://evil.com" })).status).toBe(
      403,
    );
    expect((await get(api.port, "/health", { ...ok, origin: "null" })).status).toBe(403);

    for (const origin of ["tauri://localhost", DEV_ORIGIN]) {
      const res = await get(api.port, "/health", { ...ok, origin });
      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    }
    // preflight: sem token, mas só para origem permitida; nunca "*"
    const pre = await get(api.port, "/health", { host, origin: "tauri://localhost" }, "OPTIONS");
    expect(pre.status).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe("tauri://localhost");
    expect(pre.headers["access-control-allow-headers"]).toContain("x-session-token");
    const badPre = await get(api.port, "/health", { host, origin: "https://evil.com" }, "OPTIONS");
    expect(badPre.status).toBe(403);
    expect(badPre.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("as guardas valem no upgrade do WS /realtime", async () => {
    const url = `ws://127.0.0.1:${api.port}/realtime`;
    const tokenProtocol = `patchbay.token.${api.token}`;
    /** Resolve com o subprotocolo aceito ou com o status da recusa. */
    const upgrade = (protocols: string[], headers: Record<string, string> = {}) =>
      new Promise<string | number>((resolve, reject) => {
        const ws = new WebSocket(url, protocols, { headers });
        ws.on("open", () => {
          resolve(ws.protocol);
          ws.close();
        });
        ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
        ws.on("error", reject);
      });

    const origin = "tauri://localhost";
    // token como subprotocolo (webview) ou header (proxy do Vite); a api responde só "patchbay"
    expect(await upgrade(["patchbay", tokenProtocol], { origin })).toBe("patchbay");
    expect(await upgrade(["patchbay"], { origin: DEV_ORIGIN, "x-session-token": api.token })).toBe(
      "patchbay",
    );
    // sem token, token errado, Origin fora da allowlist, Host errado
    expect(await upgrade(["patchbay"], { origin })).toBe(401);
    expect(await upgrade(["patchbay", "patchbay.token.x"], { origin })).toBe(401);
    expect(await upgrade(["patchbay", tokenProtocol], { origin: "https://evil.com" })).toBe(403);
    expect(await upgrade(["patchbay", tokenProtocol], { host: "evil.com" })).toBe(403);
  });

  it("listener de webhook: só abre com token e não expõe as rotas da api", async () => {
    const url = `ws://127.0.0.1:${api.port}/realtime`;
    const origin = "tauri://localhost";
    // Sem token, o upgrade nem acontece: não dá para subir um listener.
    const denied = await new Promise<number>((resolve) => {
      new WebSocket(url, ["patchbay"], { headers: { origin } }).on(
        "unexpected-response",
        (_req, res) => resolve(res.statusCode ?? 0),
      );
    });
    expect(denied).toBe(401);

    const ws = new WebSocket(url, ["patchbay", `patchbay.token.${api.token}`], {
      headers: { origin },
    });
    await once(ws, "open");
    ws.send(JSON.stringify({ kind: "webhook", status: 204 }));
    const [message] = await once(ws, "message");
    const port: number = JSON.parse(message.toString()).data.port;
    expect(port).not.toBe(api.port);

    // Mesmo com o token certo, /health, /files e /send do listener só respondem o configurado.
    const ok = { host: `127.0.0.1:${port}`, "x-session-token": api.token };
    for (const [path, method] of [
      ["/health", "GET"],
      ["/files/tree", "GET"],
      ["/send", "POST"],
    ]) {
      const res = await get(port, path, ok, method);
      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    }
    ws.close();
  });
});

it("sai quando o stdin fecha", async () => {
  const { child } = await start();
  const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
  child.stdin?.end();
  expect(await exited).toBe(0);
});
