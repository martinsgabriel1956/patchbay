import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { root } from "../lib/workspace.js";
import type { HistoryEntry, HttpRequest, HttpResponse, SendRequest } from "../schemas.js";
import { sendRoute } from "./send.js";

process.env.WORKSPACE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "patchbay-send-")), "ws");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
let hangClosed: () => void;
const hangClosedP = new Promise<void>((resolve) => {
  hangClosed = resolve;
});

// Servidor de eco: devolve o que recebeu, como recebeu.
const echo = Fastify();
echo.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => done(null, body));
echo.all("/echo", async (req) => ({
  method: req.method,
  url: req.url,
  headers: req.headers,
  body: req.body,
}));
echo.get("/slow", async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return "late";
});
echo.get("/hang", (_req, reply) => {
  reply.raw.on("close", () => hangClosed());
});
echo.get("/cookies", async (_req, reply) => reply.header("set-cookie", ["a=1", "b=2"]).send("ok"));
echo.get("/login", async (_req, reply) =>
  reply.header("set-cookie", "sid=1; Path=/; HttpOnly").redirect("/echo", 302),
);
echo.post("/redirect", async (_req, reply) => reply.redirect("/echo?from=redirect", 302));
echo.get("/gzip", async (_req, reply) =>
  reply
    .header("content-encoding", "gzip")
    .type("application/json")
    .send(gzipSync(JSON.stringify({ text: "x".repeat(10_000) }))),
);
echo.get("/png", async (_req, reply) => reply.type("image/png").send(PNG));
echo.get("/big", async (_req, reply) => reply.type("text/plain").send("a".repeat(6 * 1024 * 1024)));

const api = Fastify();
sendRoute(api);

let echoUrl: string;
let apiUrl: string;
beforeAll(async () => {
  await echo.listen({ host: "127.0.0.1", port: 0 });
  await api.listen({ host: "127.0.0.1", port: 0 });
  echoUrl = `http://127.0.0.1:${(echo.server.address() as AddressInfo).port}`;
  apiUrl = `http://127.0.0.1:${(api.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await api.close();
  await echo.close();
});

const base: HttpRequest = {
  id: "t",
  name: "t",
  kind: "http",
  method: "GET",
  url: "",
  params: [],
  headers: [],
  body: { type: "none" },
  auth: { type: "none" },
};

function post(req: Partial<SendRequest>, signal?: AbortSignal) {
  return fetch(`${apiUrl}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...base, ...req }),
    signal,
  });
}

async function sendOk(req: Partial<SendRequest>) {
  const res = await post(req);
  expect(res.status).toBe(200);
  return (await res.json()) as HttpResponse;
}

const echoed = (res: HttpResponse) => JSON.parse(res.body);

describe("POST /send", () => {
  it("GET: status, headers e body, sem re-encodar a URL", async () => {
    const res = await sendOk({
      url: `${echoUrl}/echo?q=a%20b&p=1+2&u=ç&s=a b`,
      headers: [
        { key: "X-Ok", value: "1", enabled: true },
        { key: "X-Off", value: "1", enabled: false },
      ],
    });
    expect(res).toMatchObject({ status: 200, statusText: "OK", isBinary: false, truncated: false });
    expect(res.timeMs).toBeGreaterThanOrEqual(0);
    const body = echoed(res);
    expect(body.url).toBe("/echo?q=a%20b&p=1+2&u=%C3%A7&s=a%20b");
    expect(body.headers["x-ok"]).toBe("1");
    expect(body.headers["x-off"]).toBeUndefined();
    expect(body.headers["user-agent"]).toBe("patchbay");
  });

  it("POST JSON com Content-Type automático", async () => {
    const res = await sendOk({
      method: "POST",
      url: `${echoUrl}/echo`,
      body: { type: "json", content: '{"a":1}' },
    });
    const body = echoed(res);
    expect(body.headers["content-type"]).toBe("application/json");
    expect(body.body).toEqual({ a: 1 });
  });

  it("GraphQL vira POST JSON {query, variables}; variables inválidas dão 400", async () => {
    const gql = (variables: string) =>
      post({
        method: "POST",
        url: `${echoUrl}/echo`,
        body: { type: "graphql", query: "{ a }", variables },
      });
    const body = echoed((await (await gql('{"id":1}')).json()) as HttpResponse);
    expect(body.headers["content-type"]).toBe("application/json");
    expect(body.body).toEqual({ query: "{ a }", variables: { id: 1 } });
    expect(echoed((await (await gql(" ")).json()) as HttpResponse).body).toEqual({
      query: "{ a }",
    });
    expect((await gql("{nope")).status).toBe(400);
  });

  it("form-urlencoded e multipart", async () => {
    const fields = [
      { key: "a", value: "1 2", enabled: true },
      { key: "b", value: "x", enabled: false },
    ];
    const form = echoed(
      await sendOk({
        method: "POST",
        url: `${echoUrl}/echo`,
        body: { type: "form-urlencoded", fields },
      }),
    );
    expect(form.body).toBe("a=1+2");

    const multi = echoed(
      await sendOk({ method: "POST", url: `${echoUrl}/echo`, body: { type: "multipart", fields } }),
    );
    expect(multi.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(multi.body).toContain('name="a"\r\n\r\n1 2\r\n');
    expect(multi.body).not.toContain('name="b"');
  });

  it("multipart com arquivo e body binary vêm do workspace", async () => {
    const ws = await root();
    mkdirSync(path.join(ws, "files"));
    writeFileSync(path.join(ws, "files/foto.png"), PNG);
    writeFileSync(path.join(ws, "files/nota.txt"), "conteúdo do arquivo");

    const multi = echoed(
      await sendOk({
        method: "POST",
        url: `${echoUrl}/echo`,
        body: {
          type: "multipart",
          fields: [
            { key: "texto", value: "oi", enabled: true },
            { key: "anexo", value: "", enabled: true, file: "files/nota.txt" },
          ],
        },
      }),
    );
    expect(multi.body).toContain('name="texto"\r\n\r\noi\r\n');
    expect(multi.body).toMatch(
      /name="anexo"; filename="nota.txt"\r\n.*\r\n\r\nconteúdo do arquivo\r\n/,
    );

    const bin = echoed(
      await sendOk({
        method: "PUT",
        url: `${echoUrl}/echo`,
        body: { type: "binary", file: "files/nota.txt" },
      }),
    );
    expect(bin.headers["content-type"]).toBe("application/octet-stream");
    expect(bin.body).toBe("conteúdo do arquivo");

    const fileBody = (file: string) => ({
      method: "POST",
      url: `${echoUrl}/echo`,
      body: { type: "binary" as const, file },
    });
    expect((await post(fileBody("../../etc/passwd"))).status).toBe(403);
    expect((await post(fileBody("files/nada.bin"))).status).toBe(400);
  });

  it("cada envio vira uma linha no histórico, sem o body da resposta", async () => {
    await sendOk({ url: `${echoUrl}/png` });
    const lines = readFileSync(path.join(await root(), ".history.jsonl"), "utf8")
      .trim()
      .split("\n");
    const last: HistoryEntry = JSON.parse(lines.at(-1) ?? "");
    expect(last.request.url).toBe(`${echoUrl}/png`);
    expect(last.response).toEqual({
      status: 200,
      statusText: "OK",
      timeMs: expect.any(Number),
      sizeBytes: PNG.length,
    });
    expect(lines.at(-2)).toMatch(/"failed":\{"reason":"error"/); // o 400 do arquivo inexistente
  });

  it("headers repetidos chegam como pares, na ordem", async () => {
    const res = await sendOk({ url: `${echoUrl}/cookies` });
    expect(res.headers.filter(([key]) => key === "set-cookie")).toEqual([
      ["set-cookie", "a=1"],
      ["set-cookie", "b=2"],
    ]);
  });

  it("cookie jar por environment: Set-Cookie (até no redirect) volta depois; Cookie explícito vence", async () => {
    const jar = "col/dev";
    const cookieOf = async (req: Partial<SendRequest>) =>
      echoed(await sendOk({ url: `${echoUrl}/echo`, ...req })).headers.cookie;
    // O cookie veio no 302 e já foi no hop seguinte.
    expect(echoed(await sendOk({ jar, url: `${echoUrl}/login` })).headers.cookie).toBe("sid=1");
    expect(await cookieOf({ jar })).toBe("sid=1");
    expect(await cookieOf({ jar: "col/prod" })).toBeUndefined();
    expect(await cookieOf({})).toBeUndefined();
    const explicit = [{ key: "Cookie", value: "x=2", enabled: true }];
    expect(await cookieOf({ jar, headers: explicit })).toBe("x=2");

    const cookies = `${apiUrl}/cookies?jar=${encodeURIComponent(jar)}`;
    expect(await (await fetch(cookies)).json()).toEqual([
      { name: "sid", value: "1", domain: "127.0.0.1", path: "/" },
    ]);
    expect((await fetch(cookies, { method: "DELETE" })).status).toBe(204);
    expect(await cookieOf({ jar })).toBeUndefined();
  });

  it("segue redirect (POST → GET) ou não, conforme o toggle", async () => {
    const followed = await sendOk({ method: "POST", url: `${echoUrl}/redirect` });
    expect(echoed(followed)).toMatchObject({ method: "GET", url: "/echo?from=redirect" });
    const manual = await sendOk({
      method: "POST",
      url: `${echoUrl}/redirect`,
      options: { followRedirects: false },
    });
    expect(manual.status).toBe(302);
  });

  it("gzip: tamanho trafegado e descomprimido; binário em base64; trunca acima de 5 MB", async () => {
    const gz = await sendOk({ url: `${echoUrl}/gzip` });
    expect(echoed(gz).text).toHaveLength(10_000);
    expect(gz.sizeBytes).toBeLessThan(gz.decodedSizeBytes);

    const png = await sendOk({ url: `${echoUrl}/png` });
    expect(png.isBinary).toBe(true);
    expect(Buffer.from(png.body, "base64")).toEqual(PNG);

    const big = await sendOk({ url: `${echoUrl}/big` });
    expect(big.truncated).toBe(true);
    expect(big.body).toHaveLength(5 * 1024 * 1024);
  });

  it("timeout vira 504", async () => {
    const res = await post({ url: `${echoUrl}/slow`, options: { timeoutMs: 100 } });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/timeout/);
  });

  it("cancelar na web aborta o upstream", async () => {
    const controller = new AbortController();
    const pending = post({ url: `${echoUrl}/hang` }, controller.signal);
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toThrow();
    await hangClosedP; // o servidor de eco viu a conexão fechar
  });

  it("request inválida e falha de conexão", async () => {
    expect((await post({ url: "not a url" })).status).toBe(400);
    expect((await post({ url: "ftp://x" })).status).toBe(400);
    const refused = await post({ url: "http://127.0.0.1:1/" });
    expect(refused.status).toBe(502);
    expect((await refused.json()).error).toMatch(/ECONNREFUSED/);
  });
});
