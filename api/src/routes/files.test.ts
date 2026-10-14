import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterAll, expect, it } from "vitest";
import { appendHistory, root } from "../lib/workspace.js";
import { filesRoute } from "./files.js";

process.env.WORKSPACE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "patchbay-files-")), "ws");

const app = Fastify();
filesRoute(app);
afterAll(() => app.close());

const q = (p: string) => `/files?path=${encodeURIComponent(p)}`;
const put = (p: string, text?: string) =>
  app.inject({
    method: "PUT",
    url: q(p),
    headers: text === undefined ? {} : { "content-type": "text/plain; charset=utf-8" },
    payload: text,
  });
const post = (url: string, from: string, to: string) =>
  app.inject({ method: "POST", url, payload: { from, to } });

it("CRUD, move, copy e delete para a .trash", async () => {
  const ws = await root();
  expect(readFileSync(path.join(ws, ".gitignore"), "utf8")).toContain(".history.jsonl");

  expect((await put("loja/collection.json", '{\n  "name": "loja"\n}\n')).statusCode).toBe(204);
  expect((await put("loja/users/list.json", '{"a":1}')).statusCode).toBe(204);
  expect((await put("loja/vazia/")).statusCode).toBe(204);
  expect((await app.inject(q("loja/users/list.json"))).body).toBe('{"a":1}');
  expect((await app.inject(q("loja/nada.json"))).statusCode).toBe(404);

  expect((await app.inject("/files/tree")).json()).toEqual([
    {
      name: "loja",
      path: "loja",
      type: "dir",
      children: [
        { name: "collection.json", path: "loja/collection.json", type: "file" },
        {
          name: "users",
          path: "loja/users",
          type: "dir",
          children: [{ name: "list.json", path: "loja/users/list.json", type: "file" }],
        },
        { name: "vazia", path: "loja/vazia", type: "dir", children: [] },
      ],
    },
  ]);

  // move não sobrescreve; copy duplica pastas inteiras
  expect((await post("/files/move", "loja/users/list.json", "loja/list.json")).statusCode).toBe(
    204,
  );
  expect((await post("/files/copy", "loja", "loja2")).statusCode).toBe(204);
  expect((await post("/files/move", "loja/list.json", "loja2/list.json")).statusCode).toBe(409);
  expect((await post("/files/move", "loja", "loja/dentro")).statusCode).toBe(400);
  expect((await post("/files/move", "nada", "x")).statusCode).toBe(404);
  expect((await app.inject(q("loja2/list.json"))).body).toBe('{"a":1}');

  // delete vai para a .trash, preservando o caminho e sem colidir
  expect((await app.inject({ method: "DELETE", url: q("loja/list.json") })).json()).toEqual({
    trashed: ".trash/loja/list.json",
  });
  await put("loja/list.json", "v2");
  expect((await app.inject({ method: "DELETE", url: q("loja/list.json") })).json()).toEqual({
    trashed: ".trash/loja/list 2.json",
  });
  expect(readFileSync(path.join(ws, ".trash/loja/list.json"), "utf8")).toBe('{"a":1}');
  expect(readFileSync(path.join(ws, ".trash/loja/list 2.json"), "utf8")).toBe("v2");
  expect(existsSync(path.join(ws, "loja/list.json"))).toBe(false);
  // .trash e .history.jsonl não aparecem na árvore
  const names = (await app.inject("/files/tree")).json().map((e: { name: string }) => e.name);
  expect(names).toEqual(["loja", "loja2"]);
});

it("recusa path fora do workspace, inclusive encodado", async () => {
  for (const url of [
    "/files?path=../x.json",
    "/files?path=%2e%2e%2fx.json",
    "/files?path=..%2F..%2Fetc%2Fpasswd",
    "/files?path=%2Fetc%2Fpasswd",
  ]) {
    expect((await app.inject(url)).statusCode, url).toBe(403);
  }
  expect((await put("../evil.json", "x")).statusCode).toBe(403);
  expect((await app.inject({ method: "DELETE", url: q(".") })).statusCode).toBe(403);
  expect((await post("/files/move", "loja", "../fora")).statusCode).toBe(403);
  expect((await app.inject("/files")).statusCode).toBe(400);
});

it("histórico: mais novo primeiro, com limite", async () => {
  const request = {
    id: "r",
    name: "r",
    kind: "http" as const,
    method: "GET",
    url: "http://x",
    params: [],
    headers: [],
    body: { type: "none" as const },
    auth: { type: "none" as const },
  };
  for (const at of ["1", "2", "3"]) await appendHistory({ at, request });
  const res = await app.inject("/history?limit=2");
  expect(res.json().map((e: { at: string }) => e.at)).toEqual(["3", "2"]);
});
