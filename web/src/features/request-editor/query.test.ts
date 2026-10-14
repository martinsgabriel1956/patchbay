import { describe, expect, it } from "vitest";
import { paramsFromUrl, urlWithParams } from "./query";

const on = (key: string, value: string) => ({ key, value, enabled: true });

describe("query ↔ params", () => {
  it("lê a query crua, sem decodar", () => {
    expect(paramsFromUrl("https://x.dev/a?q=a%20b&p=1+2&u=ç&flag#top", [])).toEqual([
      on("q", "a%20b"),
      on("p", "1+2"),
      on("u", "ç"),
      on("flag", ""),
    ]);
    expect(paramsFromUrl("https://x.dev/a", [])).toEqual([]);
    expect(paramsFromUrl("https://x.dev/?a=1=2&&", [])).toEqual([on("a", "1=2")]);
  });

  it("mantém os params desligados ao editar a URL", () => {
    const off = { key: "debug", value: "1", enabled: false };
    expect(paramsFromUrl("https://x.dev/?a=1", [on("a", "0"), off])).toEqual([on("a", "1"), off]);
  });

  it("reescreve só a query, sem encodar, preservando base e fragmento", () => {
    const params = [on("q", "a%20b"), on("p", "1+2"), { key: "off", value: "1", enabled: false }];
    expect(urlWithParams("https://x.dev/a?old=1#top", params)).toBe(
      "https://x.dev/a?q=a%20b&p=1+2#top",
    );
    expect(urlWithParams("https://x.dev/a?old=1", [])).toBe("https://x.dev/a");
    expect(urlWithParams("https://x.dev/a", [on("flag", "")])).toBe("https://x.dev/a?flag");
  });

  it("ida e volta não muda a URL", () => {
    const url = "https://x.dev/a?q=a%20b&p=1+2&u=ç#f";
    expect(urlWithParams(url, paramsFromUrl(url, []))).toBe(url);
  });
});
