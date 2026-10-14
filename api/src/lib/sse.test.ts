import { describe, expect, it } from "vitest";
import { sseParser } from "./sse.js";

const enc = (text: string) => new TextEncoder().encode(text);
/** Alimenta o parser com os pedaços dados e fecha o stream. */
const parse = (...chunks: (string | Uint8Array)[]) => {
  const p = sseParser();
  return [
    ...chunks.flatMap((c) => p(typeof c === "string" ? enc(c) : c)),
    ...p(), // fim do stream
  ];
};

describe("sseParser", () => {
  it("event, data, id; bloco termina na linha vazia", () => {
    expect(parse("event: tick\nid: 7\ndata: oi\n\ndata: dois\n\n")).toEqual([
      { event: "tick", id: "7", data: "oi" },
      { data: "dois" },
    ]);
  });

  it("data multilinha, um espaço tirado só, campo sem dois-pontos", () => {
    expect(parse("data: a\ndata:  b\ndata\ndata:c\n\n")).toEqual([{ data: "a\n b\n\nc" }]);
  });

  it("comentários, retry e campos desconhecidos são ignorados; bloco sem data não sai", () => {
    expect(parse(": ping\n\nretry: 3000\nfoo: bar\n\nevent: x\n\n: hi\ndata: ok\n\n")).toEqual([
      { data: "ok" },
    ]);
  });

  it("CRLF, LF e CR, inclusive CRLF partido entre pedaços", () => {
    expect(parse("data: a\r\n\r\ndata: b\r\rdata: c\n\n")).toEqual([
      { data: "a" },
      { data: "b" },
      { data: "c" },
    ]);
    expect(parse("data: a\r", "\n\r", "\ndata: b\r", "\r")).toEqual([{ data: "a" }, { data: "b" }]);
  });

  it("BOM no início é descartado; UTF-8 partido entre pedaços", () => {
    const bytes = enc("﻿data: ação\n\n");
    expect(parse(bytes.slice(0, 2), bytes.slice(2, 10), bytes.slice(10))).toEqual([
      { data: "ação" },
    ]);
    // Só o primeiro BOM: um segundo vira parte do nome do campo (desconhecido).
    expect(parse("﻿﻿data: x\n\n")).toEqual([]);
  });

  it("bloco sem linha vazia no fim do stream é descartado; id com NUL é ignorado", () => {
    expect(parse("data: a\n\ndata: incompleto\n")).toEqual([{ data: "a" }]);
    expect(parse("id: a\0b\ndata: x\n\nid\ndata: y\n\n")).toEqual([
      { data: "x" },
      { id: "", data: "y" },
    ]);
  });
});
