import { once } from "node:events";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterAll, expect, it } from "vitest";
import WebSocket from "ws";
import { realtimeRoute } from "../routes/realtime.js";
import type { WorkspaceEvent } from "../schemas.js";
import { own } from "./watch.js";
import { root } from "./workspace.js";

process.env.WORKSPACE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "patchbay-watch-")), "ws");

const api = Fastify();
realtimeRoute(api);
afterAll(() => api.close());

it("WS /realtime com kind watch: escrita de fora vira changed; oculto e escrita da api, não", async () => {
  const dir = await root();
  await api.listen({ host: "127.0.0.1", port: 0 });
  const { port } = api.server.address() as AddressInfo;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/realtime`, ["patchbay"]);
  await once(ws, "open");
  ws.send(JSON.stringify({ kind: "watch" }));
  const events: WorkspaceEvent[] = [];
  ws.on("message", (data) => events.push(JSON.parse(data.toString())));

  mkdirSync(path.join(dir, ".trash"));
  // Os watchers sobem em segundo plano: escreve (mais devagar que o debounce) até o aviso.
  for (let i = 0; !events.length && i < 20; i++) {
    own("mine.json");
    writeFileSync(path.join(dir, "mine.json"), String(i));
    writeFileSync(path.join(dir, ".trash", "x.json"), String(i));
    writeFileSync(path.join(dir, "loja.json"), String(i));
    await new Promise((r) => setTimeout(r, 300));
  }
  expect(events[0]).toEqual({ type: "changed", paths: ["loja.json"] });

  // Depois de uma escrita atômica (temp + rename) e numa pasta nova, continua avisando.
  const settle = () => new Promise((r) => setTimeout(r, 400));
  writeFileSync(path.join(dir, "x.tmp"), "a");
  renameSync(path.join(dir, "x.tmp"), path.join(dir, "loja.json"));
  mkdirSync(path.join(dir, "nova"));
  await settle();
  events.length = 0;
  writeFileSync(path.join(dir, "loja.json"), "b");
  writeFileSync(path.join(dir, "nova", "a.json"), "c");
  await settle();
  expect(events.flatMap((e) => e.paths).sort()).toEqual(["loja.json", "nova/a.json"]);
  ws.close();
}, 10_000);
