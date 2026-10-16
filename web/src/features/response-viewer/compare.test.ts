import type { HttpResponse } from "@api/schemas";
import { expect, it } from "vitest";
import { diffHeaders, prettyJson } from "./compare";

it("compara headers sem ligar para caixa e junta os repetidos", () => {
  const before: HttpResponse["headers"] = [
    ["Content-Type", "application/json"],
    ["ETag", '"a"'],
    ["Set-Cookie", "a=1"],
    ["X-Old", "1"],
  ];
  const after: HttpResponse["headers"] = [
    ["content-type", "application/json"],
    ["etag", '"b"'],
    ["set-cookie", "a=1"],
    ["set-cookie", "b=2"],
    ["X-New", "1"],
  ];
  expect(diffHeaders(before, after)).toEqual([
    { name: "etag", before: '"a"', after: '"b"' },
    { name: "set-cookie", before: "a=1", after: "a=1\nb=2" },
    { name: "X-Old", before: "1", after: undefined },
    { name: "X-New", before: undefined, after: "1" },
  ]);
  expect(diffHeaders(before, before)).toEqual([]);
});

it("formata JSON e deixa o resto cru", () => {
  const res = (body: string, type = "application/json"): HttpResponse => ({
    status: 200,
    statusText: "OK",
    headers: [["content-type", type]],
    body,
    isBinary: false,
    truncated: false,
    timeMs: 1,
    sizeBytes: body.length,
    decodedSizeBytes: body.length,
  });
  expect(prettyJson(res('{"b":1,"a":[2]}'))).toBe('{\n  "b": 1,\n  "a": [\n    2\n  ]\n}');
  expect(prettyJson(res('{"b":{"d":1,"c":2},"a":[{"z":0,"y":0}]}'), true)).toBe(
    JSON.stringify({ a: [{ y: 0, z: 0 }], b: { c: 2, d: 1 } }, null, 2),
  );
  expect(prettyJson(res('{"a":', "application/json"))).toBeNull();
  expect(prettyJson(res("<p>oi</p>", "text/html"))).toBeNull();
});
