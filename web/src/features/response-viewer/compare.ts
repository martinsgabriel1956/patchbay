import type { HttpResponse } from "@api/schemas";

/** Chaves de objeto em ordem alfabética (no diff, ordem diferente não é mudança). */
const sortKeys = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : value;

/** Body JSON com 2 espaços (sorted: chaves em ordem alfabética); null se não for JSON (ou vier
 *  truncado). */
export function prettyJson(response: HttpResponse, sorted = false): string | null {
  const { body, isBinary, headers } = response;
  const type = headers.find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  if (isBinary || !(/json/i.test(type) || /^\s*[[{]/.test(body))) return null;
  try {
    return JSON.stringify(JSON.parse(body), (_, v) => (sorted ? sortKeys(v) : v), 2);
  } catch {
    return null; // inválido ou truncado: fica o texto cru
  }
}

/** Header que mudou entre duas respostas. Sem `before`: novo; sem `after`: sumiu. Headers
 *  repetidos (Set-Cookie) viram um valor só, um por linha. */
export type HeaderChange = { name: string; before?: string; after?: string };

export function diffHeaders(
  before: HttpResponse["headers"],
  after: HttpResponse["headers"],
): HeaderChange[] {
  const group = (headers: HttpResponse["headers"]) => {
    const map = new Map<string, { name: string; value: string }>();
    for (const [name, value] of headers) {
      const prev = map.get(name.toLowerCase());
      map.set(
        name.toLowerCase(),
        prev ? { name, value: `${prev.value}\n${value}` } : { name, value },
      );
    }
    return map;
  };
  const a = group(before);
  const b = group(after);
  return [...new Set([...a.keys(), ...b.keys()])].flatMap((key) => {
    const [x, y] = [a.get(key), b.get(key)];
    if (x?.value === y?.value) return [];
    return [{ name: (y ?? x)?.name ?? key, before: x?.value, after: y?.value }];
  });
}
