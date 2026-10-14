// Sincroniza a query da URL com a aba Params, nos dois sentidos, sem encodar nem decodar nada:
// o que está na tabela é exatamente o que está na URL (PLANNING §10).
import type { KV } from "@api/schemas";

function split(url: string) {
  const hash = url.indexOf("#");
  const beforeHash = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? "" : url.slice(hash);
  const q = beforeHash.indexOf("?");
  return q < 0
    ? { base: beforeHash, query: "", fragment }
    : { base: beforeHash.slice(0, q), query: beforeHash.slice(q + 1), fragment };
}

/** URL → params: os da query (ligados) seguidos dos desligados que já existiam. */
export function paramsFromUrl(url: string, previous: KV[]): KV[] {
  const fromUrl = split(url)
    .query.split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq < 0
        ? { key: pair, value: "", enabled: true }
        : { key: pair.slice(0, eq), value: pair.slice(eq + 1), enabled: true };
    });
  return [...fromUrl, ...previous.filter((p) => !p.enabled)];
}

/** Params → URL: reescreve só a query, com os params ligados; base e #fragmento ficam. */
export function urlWithParams(url: string, params: KV[]): string {
  const { base, fragment } = split(url);
  const query = params
    .filter((p) => p.enabled && (p.key || p.value))
    .map((p) => (p.value === "" ? p.key : `${p.key}=${p.value}`))
    .join("&");
  return `${base}${query ? `?${query}` : ""}${fragment}`;
}
