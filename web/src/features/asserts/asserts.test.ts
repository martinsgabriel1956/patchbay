import type { Assert, HttpResponse } from "@api/schemas";
import { expect, it } from "vitest";
import { evaluate } from "./asserts";

const res = (patch: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 201,
  statusText: "Created",
  headers: [
    ["Content-Type", "application/json"],
    ["Set-Cookie", "a=1"],
    ["Set-Cookie", "b=2"],
  ],
  body: JSON.stringify({ user: { id: 7, name: "Ana" }, items: [{ id: "x" }], ok: true }),
  isBinary: false,
  truncated: false,
  timeMs: 120,
  sizeBytes: 60,
  decodedSizeBytes: 60,
  ...patch,
});

const a = (patch: Partial<Assert>): Assert => ({
  enabled: true,
  target: "body",
  path: "",
  op: "equals",
  expected: "",
  ...patch,
});

/** Um assert só: o resultado dele. */
const one = (patch: Partial<Assert>, response = res(), vars = {}) =>
  evaluate([a(patch)], response, vars)[0];

it("equals e notEquals comparam texto; status, tempo, header e body", () => {
  expect(one({ target: "status", expected: "201" })).toMatchObject({ pass: true, actual: "201" });
  expect(one({ target: "status", expected: "200" }).pass).toBe(false);
  expect(one({ target: "time", op: "notEquals", expected: "1" }).pass).toBe(true);
  expect(one({ target: "body", path: "user.name", expected: "Ana" }).pass).toBe(true);
  // Não-string vira JSON compacto: número, booleano, objeto.
  expect(one({ path: "$.user.id", expected: "7" }).pass).toBe(true);
  expect(one({ path: "ok", expected: "true" }).pass).toBe(true);
  expect(one({ path: "items[0]", expected: '{"id":"x"}' }).pass).toBe(true);
  // Header sem diferenciar caixa; repetido junta com ", ".
  expect(one({ target: "header", path: "set-cookie", expected: "a=1, b=2" }).pass).toBe(true);
});

it("contains, exists, lessThan, greaterThan e matches", () => {
  expect(
    one({ target: "header", path: "content-type", op: "contains", expected: "json" }).pass,
  ).toBe(true);
  expect(
    one({ target: "header", path: "content-type", op: "contains", expected: "xml" }).pass,
  ).toBe(false);
  expect(one({ path: "user", op: "exists" }).pass).toBe(true);
  expect(one({ path: "user.email", op: "exists" }).pass).toBe(false);
  expect(one({ target: "time", op: "lessThan", expected: "500" }).pass).toBe(true);
  expect(one({ target: "time", op: "greaterThan", expected: "500" }).pass).toBe(false);
  expect(one({ target: "status", op: "greaterThan", expected: "199" }).pass).toBe(true);
  expect(one({ target: "status", op: "matches", expected: "^2\\d\\d$" }).pass).toBe(true);
  expect(one({ path: "user.name", op: "matches", expected: "^B" }).pass).toBe(false);
});

it("expected e path aceitam {{var}}", () => {
  const vars = { userId: "7", field: "id" };
  expect(one({ path: "user.{{field}}", expected: "{{userId}}" }, res(), vars).pass).toBe(true);
  // Variável sem valor fica como está (e não casa).
  expect(one({ path: "user.id", expected: "{{nope}}" }, res(), vars).pass).toBe(false);
});

it("asserts desligados não entram; a ordem é a da lista", () => {
  const list = [
    a({ target: "status", expected: "201" }),
    a({ target: "status", expected: "500", enabled: false }),
    a({ target: "time", op: "lessThan", expected: "1" }),
  ];
  expect(evaluate(list, res(), {}).map((r) => [r.assert.target, r.pass])).toEqual([
    ["status", true],
    ["time", false],
  ]);
});

it("caminho que não existe falha em todo operador, sem valor atual", () => {
  for (const op of ["equals", "notEquals", "contains", "exists", "matches"] as const) {
    const r = one({ path: "missing.deep", op, expected: "x" });
    expect(r).toMatchObject({ pass: false });
    expect(r.actual).toBeUndefined();
    expect(r.error).toBeUndefined();
  }
  expect(one({ target: "header", path: "x-nope", op: "exists" }).pass).toBe(false);
  expect(one({ path: "items[5].id", op: "exists" }).pass).toBe(false);
});

it("body não-JSON: caminho vira erro; sem caminho compara o texto", () => {
  const text = res({ body: "hello world", headers: [["Content-Type", "text/plain"]] });
  expect(one({ path: "a.b", op: "exists" }, text)).toMatchObject({ pass: false, error: "notJson" });
  expect(one({ op: "contains", expected: "world" }, text).pass).toBe(true);
  expect(one({ op: "equals", expected: "hello world" }, text).pass).toBe(true);
});

it("body truncado (JSON quebrado) e binário viram erro; status e header ainda valem", () => {
  const cut = res({ body: '{"user": {"id": 7, "na', truncated: true });
  expect(one({ path: "user.id", expected: "7" }, cut)).toMatchObject({
    pass: false,
    error: "truncated",
  });
  const binary = res({ body: "AP8=", isBinary: true });
  expect(one({ op: "contains", expected: "A" }, binary)).toMatchObject({
    pass: false,
    error: "binary",
  });
  expect(one({ target: "status", expected: "201" }, binary).pass).toBe(true);
  expect(one({ target: "header", path: "content-type", op: "exists" }, cut).pass).toBe(true);
});

it("número e regex inválidos e caminho malformado viram erro", () => {
  expect(one({ path: "user.name", op: "lessThan", expected: "3" })).toMatchObject({
    pass: false,
    error: "notNumber",
    actual: "Ana",
  });
  expect(one({ target: "time", op: "greaterThan", expected: "" }).error).toBe("notNumber");
  expect(one({ target: "status", op: "matches", expected: "(" })).toMatchObject({
    pass: false,
    error: "badRegex",
  });
  expect(one({ path: "user..id", op: "exists" })).toMatchObject({ pass: false, error: "badPath" });
});
