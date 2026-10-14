import { describe, expect, it } from "vitest";
import { isCurl, parseCurl, shellWords, toCurl } from "./curl";
import { prepare } from "./interpolate";

const on = (key: string, value: string) => ({ key, value, enabled: true });

describe("shellWords", () => {
  it("aspas simples, duplas, $'…', escapes e \\ de continuação", () => {
    expect(shellWords(String.raw`a 'b c' "d \"e\" \$x \n" f\ g`)).toEqual([
      "a",
      "b c",
      'd "e" $x \\n',
      "f g",
    ]);
    expect(shellWords(String.raw`$'l1\nl2\t\'q\' ç\041\x41'`)).toEqual(["l1\nl2\t'q' ç!A"]);
    expect(shellWords("curl \\\n  -s \\\r\n  'x'' y' ''")).toEqual(["curl", "-s", "x y", ""]);
    expect(() => shellWords("curl 'aberta")).toThrow(/sem fechar/);
  });
});

describe("parseCurl", () => {
  it("só aceita curl e exige URL", () => {
    expect(isCurl("  curl https://x.dev")).toBe(true);
    expect(isCurl("curly")).toBe(false);
    expect(() => parseCurl("wget x")).toThrow(/curl/);
    expect(() => parseCurl("curl -s")).toThrow(/URL/);
  });

  it("GET simples: params da query, auth herdada, sem seguir redirect", () => {
    expect(parseCurl("curl https://x.dev/a?b=1&c")).toEqual({
      kind: "http",
      method: "GET",
      url: "https://x.dev/a?b=1&c",
      params: [on("b", "1"), on("c", "")],
      headers: [],
      body: { type: "none" },
      auth: { type: "inherit" },
      options: { followRedirects: false, insecureTls: false },
    });
  });

  it("-X, -H repetido, -L, -k, --compressed e flags juntas", () => {
    const r = parseCurl(
      `curl -sSLk -XPUT --compressed -H 'A: 1' -H "A: 2" -H 'B;' -H 'C:' https://x.dev`,
    );
    expect(r.method).toBe("PUT");
    expect(r.headers).toEqual([on("A", "1"), on("A", "2"), on("B", "")]);
    expect(r.options).toEqual({ followRedirects: true, insecureTls: true });
  });

  it("-d vira form (campos) e POST; -d com JSON sem Content-Type fica como texto", () => {
    const form = parseCurl("curl x.dev -d 'a=1&b=x%20y+z' --data 'c=@'");
    expect(form.method).toBe("POST");
    expect(form.body).toEqual({
      type: "form-urlencoded",
      fields: [on("a", "1"), on("b", "x y z"), on("c", "@")],
    });
    const raw = parseCurl(`curl x.dev -d '{"a":1}'`);
    expect(raw.body).toEqual({ type: "text", content: '{"a":1}' });
    expect(raw.headers).toEqual([on("Content-Type", "application/x-www-form-urlencoded")]);
  });

  it("--data-raw com Content-Type JSON, --json, --data-urlencode e @arquivo", () => {
    const json = parseCurl(`curl x.dev -H 'content-type: application/json' --data-raw '@{"a":1}'`);
    expect(json.body).toEqual({ type: "json", content: '@{"a":1}' });
    const j = parseCurl(`curl x.dev --json '{"b":2}'`);
    expect(j.headers).toEqual([
      on("Content-Type", "application/json"),
      on("Accept", "application/json"),
    ]);
    expect(j.body).toEqual({ type: "json", content: '{"b":2}' });
    const enc = parseCurl("curl x.dev --data-urlencode 'q=a b&c' --data-urlencode '=só'");
    expect(enc.body).toEqual({ type: "form-urlencoded", fields: [on("q", "a b&c"), on("só", "")] });
    expect(parseCurl("curl x.dev --data-binary @foto.png").body).toEqual({
      type: "binary",
      file: "foto.png",
    });
  });

  it("-G manda os dados na query; -I é HEAD", () => {
    const r = parseCurl("curl -G 'x.dev/s?x=1' -d q=a --data-urlencode 'n=b c'");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("x.dev/s?x=1&q=a&n=b%20c");
    expect(r.body).toEqual({ type: "none" });
    expect(parseCurl("curl -I x.dev").method).toBe("HEAD");
  });

  it("-u vira Basic; -F vira multipart (arquivo sem ;type=)", () => {
    const r = parseCurl(
      "curl -u ana:se:nha x.dev -F nome=Ana -F 'foto=@fotos/a.png;type=image/png' --form-string 'x=@lit'",
    );
    expect(r.auth).toEqual({ type: "basic", username: "ana", password: "se:nha" });
    expect(r.method).toBe("POST");
    expect(r.body).toEqual({
      type: "multipart",
      fields: [
        on("nome", "Ana"),
        { key: "foto", value: "", enabled: true, file: "fotos/a.png" },
        on("x", "@lit"),
      ],
    });
  });

  it("comando do Copy as cURL do Chrome", () => {
    const chrome = String.raw`curl 'https://api.example.com/v1/items?page=2' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'accept-language: pt-BR,pt;q=0.9' \
  -b 'session=abc123; theme=dark' \
  -H 'content-type: application/json' \
  -H 'origin: https://app.example.com' \
  -H 'user-agent: Mozilla/5.0 (X11; Linux x86_64)' \
  --data-raw $'{"name":"O\'Brien","note":"a\\nb ç"}' \
  --compressed`;
    const r = parseCurl(chrome);
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://api.example.com/v1/items?page=2");
    expect(r.params).toEqual([on("page", "2")]);
    expect(r.headers.map((h) => h.key)).toEqual([
      "accept",
      "accept-language",
      "Cookie",
      "content-type",
      "origin",
      "user-agent",
    ]);
    expect(r.headers[2].value).toBe("session=abc123; theme=dark");
    expect(r.body).toEqual({
      type: "json",
      content: String.raw`{"name":"O'Brien","note":"a\nb ç"}`,
    });
  });
});

describe("toCurl", () => {
  const commands = [
    "curl https://x.dev/a?b=1",
    `curl -X PUT 'https://x.dev' -H 'A: 1' -H 'A: 2' -H 'B;' -H 'content-type: application/json' --data-raw '{"it'\\''s":1}' -L -k`,
    "curl x.dev -d 'a=1&b=x%20y' -u 'ana:s3 nha'",
    `curl x.dev -d '{"a":1}'`,
    "curl x.dev -F nome=Ana -F 'foto=@a.png' --form-string 'x=@lit'",
    "curl -X DELETE x.dev",
    "curl -I x.dev",
    `curl x.dev --json '{"b":2}'`,
  ];

  it.each(commands)("ida e volta import → export → import: %s", (cmd) => {
    const first = parseCurl(cmd);
    expect(parseCurl(toCurl(first))).toEqual(first);
  });

  it("exporta a request resolvida: vars, auth em header, Content-Type que a api mandaria", () => {
    const req = prepare(
      {
        id: "1",
        name: "r",
        kind: "http",
        method: "POST",
        url: "{{base}}/gql",
        params: [],
        headers: [on("X-Off", "1"), { key: "X-Off", value: "1", enabled: false }],
        body: { type: "graphql", query: "{ a(id: $id) }", variables: '{"id": "{{id}}"}' },
        auth: { type: "bearer", token: "{{tok}}" },
        options: { followRedirects: true },
      },
      { base: "https://x.dev", id: "7", tok: "abc" },
    );
    expect(toCurl(req)).toBe(
      [
        "curl 'https://x.dev/gql'",
        "-H 'X-Off: 1'",
        "-H 'Authorization: Bearer abc'",
        "-H 'Content-Type: application/json'",
        `--data-raw '{"query":"{ a(id: $id) }","variables":{"id":"7"}}'`,
        "-L",
      ].join(" \\\n  "),
    );
  });
});
