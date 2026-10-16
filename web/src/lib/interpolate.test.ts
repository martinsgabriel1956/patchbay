import type { HttpRequest } from "@api/schemas";
import { describe, expect, it } from "vitest";
import {
  defined,
  effectiveAuth,
  interpolate,
  parts,
  prepare,
  prepareRealtime,
  unresolved,
  varsFrom,
} from "./interpolate";

const on = (key: string, value: string) => ({ key, value, enabled: true });

const request = (patch: Partial<HttpRequest> = {}): HttpRequest => ({
  id: "1",
  name: "r",
  kind: "http",
  method: "GET",
  url: "{{base}}/get",
  params: [],
  headers: [],
  body: { type: "none" },
  auth: { type: "none" },
  ...patch,
});

describe("interpolate", () => {
  const vars = { base: "https://x.dev", id: "42", nasty: "{{id}}" };

  it("substitui, deixa indefinida como está e aceita espaços", () => {
    expect(interpolate("{{base}}/u/{{ id }}/{{nope}}", vars)).toBe("https://x.dev/u/42/{{nope}}");
    expect(interpolate("{{id}}{{id}}-{{  id  }}", vars)).toBe("4242-42");
  });

  it("ignora chaves sem fechar, {{}} e nome com espaço", () => {
    expect(interpolate("{{id", vars)).toBe("{{id");
    expect(interpolate("id}}", vars)).toBe("id}}");
    expect(interpolate("{{}} {{ }} {{a b}}", vars)).toBe("{{}} {{ }} {{a b}}");
    expect(interpolate("{{{id}}}", vars)).toBe("{42}");
  });

  it("valor com {{ não é reinterpretado (sem recursão)", () => {
    expect(interpolate("{{nasty}}", vars)).toBe("{{id}}");
    expect(interpolate("{{self}}", { self: "{{self}}" })).toBe("{{self}}");
  });

  it("precedência: coleção < environment < .env.local.json; desligadas e sem chave não contam", () => {
    const collection = [on("a", "col"), on("b", "col"), on("c", "col")];
    const env = [on("b", "env"), on("c", "env"), { key: "a", value: "off", enabled: false }];
    const local = [on("c", "local"), on("", "vazio")];
    expect(varsFrom(collection, env, local)).toEqual({ a: "col", b: "env", c: "local" });
    expect(varsFrom(undefined, "lixo", [on("x", "1")])).toEqual({ x: "1" });
  });

  it("parts separa variáveis do texto", () => {
    expect(parts("{{base}}/u/{{ id }}?x")).toEqual([
      { text: "{{base}}", name: "base" },
      { text: "/u/" },
      { text: "{{ id }}", name: "id" },
      { text: "?x" },
    ]);
    expect(parts("{{}} {{a")).toEqual([{ text: "{{}} {{a" }]);
  });
});

describe("prepare", () => {
  const vars = { base: "https://x.dev", tok: "s3cr3t", user: "ana", pass: "pá:ss", k: "X-Key" };

  it("resolve URL, params, headers, body e campos de form/multipart/binário", () => {
    const req = request({
      url: "{{base}}/get?q={{tok}}",
      params: [on("q", "{{tok}}")],
      headers: [on("X-{{user}}", "{{tok}}")],
      body: { type: "json", content: '{"u":"{{user}}","x":"{{nope}}"}' },
    });
    const out = prepare(req, vars);
    expect(out.url).toBe("https://x.dev/get?q=s3cr3t");
    expect(out.params).toEqual([on("q", "s3cr3t")]);
    expect(out.headers).toEqual([on("X-ana", "s3cr3t")]);
    expect(out.body).toEqual({ type: "json", content: '{"u":"ana","x":"{{nope}}"}' });
    expect(out.auth).toEqual({ type: "none" });
    // O original não muda: o arquivo salvo guarda os {{var}}.
    expect(req.url).toBe("{{base}}/get?q={{tok}}");

    const form = prepare(
      request({ body: { type: "form-urlencoded", fields: [on("{{user}}", "{{tok}}")] } }),
      vars,
    );
    expect(form.body).toEqual({ type: "form-urlencoded", fields: [on("ana", "s3cr3t")] });
    const multipart = prepare(
      request({
        body: { type: "multipart", fields: [{ ...on("f", ""), file: "{{user}}/a.png" }] },
      }),
      vars,
    );
    expect(multipart.body).toEqual({
      type: "multipart",
      fields: [{ ...on("f", ""), file: "ana/a.png" }],
    });
    const binary = prepare(request({ body: { type: "binary", file: "{{user}}.bin" } }), vars);
    expect(binary.body).toEqual({ type: "binary", file: "ana.bin" });
  });

  it("bearer e basic viram Authorization, depois da interpolação", () => {
    const bearer = prepare(request({ auth: { type: "bearer", token: "{{tok}}" } }), vars);
    expect(bearer.headers).toEqual([on("Authorization", "Bearer s3cr3t")]);
    const basic = prepare(
      request({ auth: { type: "basic", username: "{{user}}", password: "{{pass}}" } }),
      vars,
    );
    const encoded = Buffer.from("ana:pá:ss", "utf8").toString("base64");
    expect(basic.headers).toEqual([on("Authorization", `Basic ${encoded}`)]);
  });

  it("header escrito à mão ganha da auth", () => {
    const out = prepare(
      request({ headers: [on("authorization", "manual")], auth: { type: "bearer", token: "x" } }),
      vars,
    );
    expect(out.headers).toEqual([on("authorization", "manual")]);
  });

  it("API key no header ou na query (encodada, antes do #fragmento)", () => {
    const header = prepare(
      request({ auth: { type: "apikey", key: "{{k}}", value: "{{tok}}", in: "header" } }),
      vars,
    );
    expect(header.headers).toEqual([on("X-Key", "s3cr3t")]);

    const auth = { type: "apikey", key: "api key", value: "a&b", in: "query" } as const;
    expect(prepare(request({ auth }), vars).url).toBe("https://x.dev/get?api%20key=a%26b");
    const withQuery = prepare(request({ url: "{{base}}/get?x=1#top", auth }), vars);
    expect(withQuery.url).toBe("https://x.dev/get?x=1&api%20key=a%26b#top");
    expect(withQuery.params).toEqual([on("api%20key", "a%26b")]);
  });

  it("inherit pega a auth e os headers da pasta mais próxima, depois da coleção", () => {
    const folder = { auth: { type: "inherit" as const }, headers: [on("X-Env", "folder")] };
    const collection = {
      auth: { type: "bearer" as const, token: "{{tok}}" },
      headers: [on("X-Env", "col"), on("X-Col", "1")],
    };
    const out = prepare(request({ auth: { type: "inherit" } }), vars, [folder, collection]);
    expect(out.headers).toEqual([
      on("X-Col", "1"),
      on("X-Env", "folder"),
      on("Authorization", "Bearer s3cr3t"),
    ]);
    // Auth própria ganha da herdada; sem nada definido, inherit = none.
    const own = prepare(request({ auth: { type: "none" } }), vars, [collection]);
    expect(own.headers.map((h) => h.key)).toEqual(["X-Env", "X-Col"]);
    expect(effectiveAuth({ type: "inherit" }, [folder])).toEqual({ type: "none" });
  });
});

describe("prepareRealtime", () => {
  it("resolve URL, headers e protocolos; auth herdada vira header", () => {
    const start = prepareRealtime(
      {
        id: "1",
        name: "ws",
        kind: "ws",
        url: "{{ws}}/chat",
        headers: [on("X-Id", "{{id}}"), { key: "X-Off", value: "1", enabled: false }],
        protocols: ["{{proto}}", " "],
      },
      { ws: "wss://x.dev", id: "42", proto: "graphql-ws", token: "t" },
      [{ auth: { type: "bearer", token: "{{token}}" } }],
    );
    expect(start).toEqual({
      kind: "ws",
      url: "wss://x.dev/chat",
      headers: [on("X-Id", "42"), on("Authorization", "Bearer t")],
      protocols: ["graphql-ws"],
    });
  });
});

describe("variáveis dinâmicas", () => {
  it("gera um valor novo a cada ocorrência", () => {
    const [a, b] = interpolate("{{$uuid}} {{ $uuid }}", {}).split(" ");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b).not.toBe(a);
  });

  it("timestamp em segundos, ISO e inteiro de 0 a 1000", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(Number(interpolate("{{$timestamp}}", {}))).toBeGreaterThanOrEqual(now);
    expect(interpolate("{{$isoTimestamp}}", {})).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    for (let i = 0; i < 50; i++) {
      const n = Number(interpolate("{{$randomInt}}", {}));
      expect(Number.isInteger(n) && n >= 0 && n <= 1000).toBe(true);
    }
  });

  it("variável de mesmo nome ganha; $ desconhecida continua indefinida", () => {
    expect(interpolate("{{$uuid}}", { $uuid: "fixo" })).toBe("fixo");
    expect(interpolate("{{$foo}}", {})).toBe("{{$foo}}");
    expect(defined("$uuid", {})).toBe(true);
    expect(defined("$foo", {})).toBe(false);
    expect(defined("$foo", { $foo: "1" })).toBe(true);
    expect(unresolved(prepare(request({ url: "http://a/{{$uuid}}/{{$foo}}" }), {}))).toEqual([
      "$foo",
    ]);
  });
});

describe("unresolved", () => {
  it("lista as {{var}} que sobraram depois de resolver, sem repetir", () => {
    const req = { url: "{{baseUrl}}/x?q={{ q }}", headers: [{ key: "X", value: "{{baseUrl}}" }] };
    expect(unresolved(req)).toEqual(["baseUrl", "q"]);
    expect(unresolved({ url: "http://a/{{}}" })).toEqual([]);
  });
});
