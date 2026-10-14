import { describe, expect, it } from "vitest";
import { importCollections } from "./collection-import";

const on = (key: string, value: string) => ({ key, value, enabled: true });
const files = (text: unknown) => {
  const [col] = importCollections(JSON.stringify(text));
  // biome-ignore lint/suspicious/noExplicitAny: os testes leem campos do JSON gerado
  return { ...col, byPath: Object.fromEntries(col.files) as Record<string, any> };
};

describe("importCollections › Postman v2.1", () => {
  const postman = {
    info: {
      name: "Loja/API",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
    variable: [{ key: "baseUrl", value: "https://x.dev" }],
    event: [{ listen: "prerequest", script: { exec: ["console.log(1)"] } }],
    item: [
      {
        name: "Usuários",
        auth: {
          type: "basic",
          basic: [
            { key: "username", value: "ana" },
            { key: "password", value: "x" },
          ],
        },
        item: [
          {
            name: "Criar",
            event: [{ listen: "test", script: { exec: ["pm.test()"] } }],
            request: {
              method: "POST",
              header: [on("X-A", "1"), { key: "X-Off", value: "0", disabled: true }],
              url: { raw: "{{baseUrl}}/users?x=1", host: ["{{baseUrl}}"] },
              body: { mode: "raw", raw: '{"a":1}', options: { raw: { language: "json" } } },
            },
            response: [{ name: "ok" }],
          },
          { name: "Criar", request: { method: "GET", url: "{{baseUrl}}/users" } },
        ],
      },
      { name: "Vazia", item: [] },
      {
        name: "Form",
        request: {
          method: "post",
          url: "https://x.dev/f",
          auth: { type: "noauth" },
          body: {
            mode: "formdata",
            formdata: [
              { key: "a", value: "1", type: "text" },
              { key: "f", src: "/home/x/a.png", type: "file" },
            ],
          },
        },
      },
      {
        name: "GQL",
        request: {
          method: "POST",
          url: "https://x.dev/gql",
          auth: { type: "oauth2" },
          body: { mode: "graphql", graphql: { query: "{ a }", variables: '{"id":1}' } },
        },
      },
    ],
  };

  it("pastas, requests, headers, body, auth, variáveis e resumo do que ficou de fora", () => {
    const { name, byPath, skipped } = files(postman);
    expect(name).toBe("Loja-API");
    expect(Object.keys(byPath)).toEqual([
      "collection.json",
      "Usuários/",
      "Usuários/collection.json",
      "Usuários/Criar.json",
      "Usuários/Criar 2.json",
      "Vazia/",
      "Form.json",
      "GQL.json",
    ]);
    expect(byPath["collection.json"]).toEqual({
      name: "Loja-API",
      auth: { type: "bearer", token: "{{token}}" },
      vars: [on("baseUrl", "https://x.dev")],
    });
    expect(byPath["Usuários/collection.json"].auth).toEqual({
      type: "basic",
      username: "ana",
      password: "x",
    });
    const criar = byPath["Usuários/Criar.json"];
    expect(Object.keys(criar)).toEqual([
      "id",
      "name",
      "kind",
      "method",
      "url",
      "params",
      "headers",
      "body",
      "auth",
      "options",
    ]);
    expect(criar).toMatchObject({
      name: "Criar",
      method: "POST",
      url: "{{baseUrl}}/users?x=1",
      params: [on("x", "1")],
      headers: [on("X-A", "1"), { key: "X-Off", value: "0", enabled: false }],
      body: { type: "json", content: '{"a":1}' },
      auth: { type: "inherit" },
    });
    expect(byPath["Usuários/Criar 2.json"].name).toBe("Criar 2");
    expect(byPath["Form.json"]).toMatchObject({
      method: "POST",
      auth: { type: "none" },
      body: {
        type: "multipart",
        fields: [on("a", "1"), { key: "f", value: "", enabled: true, file: "/home/x/a.png" }],
      },
    });
    expect(byPath["GQL.json"].body).toEqual({
      type: "graphql",
      query: "{ a }",
      variables: '{"id":1}',
    });
    expect(skipped).toEqual([
      "coleção: script",
      "Criar: testes",
      "Criar: 1 exemplo(s) de resposta",
      'Form: arquivo "/home/x/a.png" precisa estar no workspace',
      "GQL: auth oauth2 (não suportada; ficou herdada)",
    ]);
  });
});

describe("importCollections › Insomnia v4", () => {
  const insomnia = {
    _type: "export",
    __export_format: 4,
    resources: [
      { _id: "wrk_1", _type: "workspace", parentId: null, name: "Pagamentos" },
      {
        _id: "env_base",
        _type: "environment",
        parentId: "wrk_1",
        name: "Base",
        data: { api: { url: "https://p.dev" } },
      },
      {
        _id: "env_dev",
        _type: "environment",
        parentId: "env_base",
        name: "dev",
        data: { token: "abc" },
      },
      { _id: "jar_1", _type: "cookie_jar", parentId: "wrk_1", name: "Default Jar" },
      {
        _id: "fld_1",
        _type: "request_group",
        parentId: "wrk_1",
        name: "Cobranças",
        environment: { x: 1 },
        authentication: { type: "bearer", token: "{{ _.token }}" },
      },
      {
        _id: "req_1",
        _type: "request",
        parentId: "fld_1",
        name: "Listar",
        method: "GET",
        url: "{{ _.api.url }}/charges",
        parameters: [
          { name: "page", value: "2" },
          { name: "off", value: "1", disabled: true },
        ],
        headers: [{ name: "Accept", value: "application/json" }],
        authentication: {},
        body: {},
      },
      {
        _id: "req_2",
        _type: "request",
        parentId: "wrk_1",
        name: "Criar",
        method: "POST",
        url: "https://p.dev/charges",
        body: {
          mimeType: "application/x-www-form-urlencoded",
          params: [{ name: "valor", value: "10" }],
        },
        authentication: { type: "basic", username: "u", password: "p" },
        afterResponseScript: "insomnia.test()",
      },
      {
        _id: "req_3",
        _type: "request",
        parentId: "wrk_1",
        name: "GQL",
        method: "POST",
        url: "https://p.dev/gql",
        body: { mimeType: "application/graphql", text: '{"query":"{ a }","variables":{"id":1}}' },
        authentication: { type: "apikey", key: "X-Key", value: "k", addTo: "queryParams" },
      },
    ],
  };

  it("workspace vira coleção com environments, pastas, auth e variáveis {{ _.x }} → {{x}}", () => {
    const { name, byPath, skipped } = files(insomnia);
    expect(name).toBe("Pagamentos");
    expect(Object.keys(byPath)).toEqual([
      "collection.json",
      "environments/dev.json",
      "Cobranças/",
      "Cobranças/collection.json",
      "Cobranças/Listar.json",
      "Criar.json",
      "GQL.json",
    ]);
    expect(byPath["collection.json"]).toEqual({
      name: "Pagamentos",
      vars: [on("api.url", "https://p.dev")],
    });
    expect(byPath["environments/dev.json"]).toEqual({ name: "dev", vars: [on("token", "abc")] });
    expect(byPath["Cobranças/collection.json"]).toEqual({
      name: "Cobranças",
      auth: { type: "bearer", token: "{{token}}" },
    });
    expect(byPath["Cobranças/Listar.json"]).toMatchObject({
      url: "{{api.url}}/charges?page=2",
      params: [on("page", "2"), { key: "off", value: "1", enabled: false }],
      headers: [on("Accept", "application/json")],
      body: { type: "none" },
      auth: { type: "inherit" },
    });
    expect(byPath["Criar.json"]).toMatchObject({
      body: { type: "form-urlencoded", fields: [on("valor", "10")] },
      auth: { type: "basic", username: "u", password: "p" },
    });
    expect(byPath["GQL.json"]).toMatchObject({
      body: { type: "graphql", query: "{ a }", variables: '{\n  "id": 1\n}' },
      auth: { type: "apikey", key: "X-Key", value: "k", in: "query" },
    });
    expect(skipped).toEqual([
      "Default Jar: cookie_jar",
      "Cobranças: variáveis de pasta (só a coleção tem variáveis)",
      "Criar: scripts",
    ]);
  });

  it("formato desconhecido dá erro legível", () => {
    expect(() => importCollections('{"a":1}')).toThrow(/Postman|Insomnia/);
  });
});
