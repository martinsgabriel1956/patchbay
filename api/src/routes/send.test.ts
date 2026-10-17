import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { type AddressInfo, connect } from "node:net";
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
echo.get("/delay", async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return "ok";
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

// Proxy mínimo: CONNECT (túnel, https) e URI absoluta (http). Anota o que passou por ele.
const proxied: { line: string; auth?: string }[] = [];
const proxy = createServer((req, res) => {
  proxied.push({ line: `${req.method} ${req.url}`, auth: req.headers["proxy-authorization"] });
  const upstream = httpRequest(req.url ?? "", { method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  req.pipe(upstream);
});
proxy.on("connect", (req, socket, head) => {
  proxied.push({ line: `CONNECT ${req.url}`, auth: req.headers["proxy-authorization"] });
  const [host, port] = (req.url ?? "").split(":");
  const upstream = connect(Number(port), host, () => {
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
    upstream.pipe(socket).pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

// mTLS: CA, certificado do servidor (127.0.0.1) e do cliente (chave com passphrase), gerados aqui.
const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"]);
    return true;
  } catch {
    return false;
  }
})();
const certs = mkdtempSync(path.join(tmpdir(), "patchbay-certs-"));
function makeCerts() {
  const ssl = (...args: string[]) => execFileSync("openssl", args, { cwd: certs, stdio: "ignore" });
  const ec = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1"];
  writeFileSync(path.join(certs, "san.cnf"), "subjectAltName=IP:127.0.0.1\n");
  ssl(
    "req",
    "-x509",
    ...ec,
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.pem",
    "-days",
    "1",
    "-subj",
    "/CN=ca",
  );
  ssl("req", ...ec, "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=server");
  ssl(
    "x509",
    "-req",
    "-in",
    "server.csr",
    "-CA",
    "ca.pem",
    "-CAkey",
    "ca.key",
    "-out",
    "server.pem",
    "-days",
    "1",
    "-extfile",
    "san.cnf",
  );
  ssl(
    "req",
    ...ec,
    "-keyout",
    "client.key",
    "-passout",
    "pass:segredo",
    "-out",
    "client.csr",
    "-subj",
    "/CN=cliente",
  );
  ssl(
    "x509",
    "-req",
    "-in",
    "client.csr",
    "-CA",
    "ca.pem",
    "-CAkey",
    "ca.key",
    "-out",
    "client.pem",
    "-days",
    "1",
  );
}
const read = (name: string) => readFileSync(path.join(certs, name));
let mtls: ReturnType<typeof createHttpsServer> | undefined;

const api = Fastify();
sendRoute(api);

let echoUrl: string;
let apiUrl: string;
let proxyPort: number;
let mtlsUrl: string;
const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((done) =>
    server.listen(0, "127.0.0.1", () => done((server.address() as AddressInfo).port)),
  );
beforeAll(async () => {
  await echo.listen({ host: "127.0.0.1", port: 0 });
  await api.listen({ host: "127.0.0.1", port: 0 });
  echoUrl = `http://127.0.0.1:${(echo.server.address() as AddressInfo).port}`;
  apiUrl = `http://127.0.0.1:${(api.server.address() as AddressInfo).port}`;
  proxyPort = await listen(proxy);
  if (hasOpenssl) {
    makeCerts();
    const tls = { key: read("server.key"), cert: read("server.pem"), ca: read("ca.pem") };
    mtls = createHttpsServer({ ...tls, requestCert: true, rejectUnauthorized: true }, (req, res) =>
      res.end(
        `oi, ${(req.socket as import("node:tls").TLSSocket).getPeerCertificate().subject.CN}`,
      ),
    );
    mtlsUrl = `https://127.0.0.1:${await listen(mtls)}`;
  }
});
afterAll(async () => {
  await api.close();
  await echo.close();
  proxy.closeAllConnections();
  proxy.close();
  mtls?.closeAllConnections();
  mtls?.close();
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

    // history: false (token OAuth, introspection) não vira linha.
    await sendOk({ url: `${echoUrl}/echo?secret=1`, history: false });
    const after = readFileSync(path.join(await root(), ".history.jsonl"), "utf8").trim();
    expect(after.split("\n")).toHaveLength(lines.length);
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
    expect(followed.timings?.redirect).toBeGreaterThan(0);
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

  it("timings: fases por request; conexão reaproveitada fica sem DNS/TCP/TLS", async () => {
    // localhost: origem que nenhum outro teste usa, então conexão nova e com DNS. Duas ao mesmo
    // tempo abrem dois sockets, cada uma com os seus tempos; a terceira reaproveita um deles.
    const url = `${echoUrl.replace("127.0.0.1", "localhost")}/delay`;
    const fresh = await Promise.all([sendOk({ url }), sendOk({ url })]);
    const reused = await sendOk({ url });
    for (const res of [...fresh, reused]) {
      const t = res.timings;
      if (!t) throw new Error("sem timings");
      const phases = [t.redirect, t.dns, t.tcp, t.tls, t.ttfb, t.download].map((n) => n ?? 0);
      for (const n of phases) expect(n).toBeGreaterThanOrEqual(0);
      expect(Math.abs(phases.reduce((a, b) => a + b) - t.total)).toBeLessThan(1);
      expect(Math.abs(t.total - res.timeMs)).toBeLessThanOrEqual(0.5);
      expect(t.ttfb).toBeGreaterThanOrEqual(45); // o /delay segura 50 ms antes dos headers
      expect(t.tls).toBeUndefined(); // http
    }
    for (const { timings } of fresh) {
      expect(timings?.dns).toBeDefined();
      expect(timings?.tcp).toBeDefined();
    }
    expect(reused.timings?.dns).toBeUndefined();
    expect(reused.timings?.tcp).toBeUndefined();
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

  it("proxy: passa por ele com basic auth na URL; noProxy desvia", async () => {
    const options = { proxy: `http://ana:s3nha@127.0.0.1:${proxyPort}` };
    const res = await sendOk({ url: `${echoUrl}/echo?via=proxy`, options });
    expect(echoed(res).url).toBe("/echo?via=proxy");
    const seen = proxied.at(-1);
    expect(seen?.line).toMatch(/127\.0\.0\.1/);
    expect(seen?.auth).toBe(`Basic ${Buffer.from("ana:s3nha").toString("base64")}`);

    const count = proxied.length;
    await sendOk({ url: `${echoUrl}/echo`, options: { ...options, noProxy: "127.0.0.1" } });
    expect(proxied).toHaveLength(count);

    const bad = await post({ url: `${echoUrl}/echo`, options: { proxy: "nem é url" } });
    expect(bad.status).toBe(400);
  });

  it.skipIf(!hasOpenssl)(
    "mTLS: cert e key (com passphrase) do workspace, CA absoluta",
    async () => {
      const ws = await root();
      mkdirSync(path.join(ws, "certs"));
      writeFileSync(path.join(ws, "certs/client.pem"), read("client.pem"));
      writeFileSync(path.join(ws, "certs/client.key"), read("client.key"));
      const ca = path.join(certs, "ca.pem");
      const client = {
        cert: "certs/client.pem",
        key: "certs/client.key",
        passphrase: "segredo",
        ca,
      };

      const ok = await sendOk({ url: mtlsUrl, options: client });
      expect(ok.body).toBe("oi, cliente");

      // Pelo proxy: túnel CONNECT, com o mesmo certificado de cliente dentro dele.
      const tunneled = await sendOk({
        url: mtlsUrl,
        options: { ...client, proxy: `http://127.0.0.1:${proxyPort}` },
      });
      expect(tunneled.body).toBe("oi, cliente");
      expect(proxied.at(-1)?.line).toBe(`CONNECT ${new URL(mtlsUrl).host}`);

      // Sem certificado o servidor recusa o handshake; path para fora do workspace dá 403.
      expect((await post({ url: mtlsUrl, options: { ca } })).status).toBe(502);
      expect(
        (await post({ url: mtlsUrl, options: { ...client, key: "../fora.key" } })).status,
      ).toBe(403);
      expect(
        (await post({ url: mtlsUrl, options: { ...client, cert: "certs/nada.pem" } })).status,
      ).toBe(400);
    },
  );
});
