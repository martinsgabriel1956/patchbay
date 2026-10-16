// {{var}} e auth (PLANNING §6, Fase 3). Puro, sem React: recebe a request como está no disco
// (com os {{var}}) e devolve a request resolvida que vai para o POST /send.
import type { Auth, HttpRequest, KV, Network, RealtimeRequest, RealtimeStart } from "@api/schemas";

export type Vars = Record<string, string>;
/** Uma pasta/coleção acima da request (collection.json), da mais próxima para a mais distante. */
export type Parent = { auth?: Auth; headers?: KV[]; network?: Network };

/** `{{nome}}` ou `{{ nome }}`. Nome sem espaço nem chave; `{{}}` e `{{a b}}` não são variável. */
export const VAR = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const SPLIT = /(\{\{\s*[^{}\s]+\s*\}\})/;

const on = (kv: KV) => kv.enabled && kv.key !== "";

/** Junta camadas de variáveis; a última ganha (coleção < environment < .env.local.json). */
export function varsFrom(...layers: unknown[]): Vars {
  const vars: Vars = {};
  for (const layer of layers) {
    if (!Array.isArray(layer)) continue; // arquivo editado à mão com formato errado
    for (const kv of layer as KV[]) if (on(kv)) vars[kv.key] = String(kv.value ?? "");
  }
  return vars;
}

/** Uma passada só: valor que contém `{{` não é reinterpretado. Indefinida fica como está. */
export const interpolate = (text: string, vars: Vars) =>
  text.replace(VAR, (raw, name: string) => (Object.hasOwn(vars, name) ? vars[name] : raw));

/** Nomes das `{{var}}` que sobraram numa request já resolvida (sem valor no escopo). */
export const unresolved = (req: unknown) => [
  ...new Set([...JSON.stringify(req).matchAll(VAR)].map((m) => m[1])),
];

/** Texto em pedaços para destacar: `name` só nos pedaços que são variável. */
export const parts = (text: string) =>
  text
    .split(SPLIT)
    .map((piece, i) => (i % 2 ? { text: piece, name: piece.slice(2, -2).trim() } : { text: piece }))
    .filter((piece) => piece.text !== "");

/** Auth efetiva: a da request ou, se "inherit", a da pasta/coleção mais próxima que defina uma. */
export function effectiveAuth(own: Auth, parents: Parent[]): Auth {
  if (own.type !== "inherit") return own;
  return parents.find((p) => p.auth && p.auth.type !== "inherit")?.auth ?? { type: "none" };
}

const NETWORK = ["proxy", "noProxy", "cert", "key", "ca", "passphrase"] as const;

/** Proxy e certificados: cada campo vem da pasta/coleção mais próxima que o preencha. */
export function effectiveNetwork(parents: Parent[], vars: Vars) {
  const network: Network = {};
  for (const key of NETWORK) {
    const value = parents.find((p) => p.network?.[key])?.network?.[key];
    if (value) network[key] = interpolate(value, vars);
  }
  return network;
}

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

function addQuery(url: string, pair: string) {
  const hash = url.indexOf("#");
  const base = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? "" : url.slice(hash);
  const sep = /[?&]$/.test(base) ? "" : base.includes("?") ? "&" : "?";
  return `${base}${sep}${pair}${fragment}`;
}

/**
 * Request do editor → request enviada: headers herdados das pastas, `{{var}}` substituídas em
 * tudo (URL, params, headers, body, auth) e a auth convertida em header/query. Header escrito
 * à mão ganha da auth e do herdado (mesmo nome, sem diferenciar caixa).
 */
export function prepare(req: HttpRequest, vars: Vars, parents: Parent[] = []): HttpRequest {
  const sub = (text: string) => interpolate(text, vars);
  const subKv = <T extends KV & { file?: string }>(kv: T): T => ({
    ...kv,
    key: sub(kv.key),
    value: sub(kv.value),
    ...(kv.file === undefined ? {} : { file: sub(kv.file) }),
  });

  let headers = req.headers;
  for (const parent of parents) {
    const taken = new Set(headers.filter(on).map((h) => h.key.toLowerCase()));
    const inherited = (parent.headers ?? []).filter(
      (h) => on(h) && !taken.has(h.key.toLowerCase()),
    );
    headers = [...inherited, ...headers];
  }
  headers = headers.map(subKv);
  let url = sub(req.url);
  const params = req.params.map(subKv);

  const { body } = req;
  const resolvedBody =
    body.type === "binary"
      ? { ...body, file: sub(body.file) }
      : body.type === "graphql"
        ? { ...body, query: sub(body.query), variables: sub(body.variables) }
        : "content" in body
          ? { ...body, content: sub(body.content) }
          : "fields" in body
            ? { ...body, fields: body.fields.map(subKv) }
            : body;

  const header = (key: string, value: string) => {
    if (!headers.some((h) => on(h) && h.key.toLowerCase() === key.toLowerCase()))
      headers.push({ key, value, enabled: true });
  };
  const auth = effectiveAuth(req.auth, parents);
  if (auth.type === "bearer") header("Authorization", `Bearer ${sub(auth.token)}`);
  if (auth.type === "basic")
    header("Authorization", `Basic ${base64(`${sub(auth.username)}:${sub(auth.password)}`)}`);
  if (auth.type === "apikey" && sub(auth.key)) {
    const [key, value] = [sub(auth.key), sub(auth.value)];
    if (auth.in === "header") header(key, value);
    else {
      const [k, v] = [encodeURIComponent(key), encodeURIComponent(value)];
      url = addQuery(url, `${k}=${v}`);
      params.push({ key: k, value: v, enabled: true });
    }
  }

  // Auth já virou header/query: a request enviada (e o histórico) leva "none".
  const options = { ...req.options, ...effectiveNetwork(parents, vars) };
  return { ...req, url, params, headers, body: resolvedBody, auth: { type: "none" }, options };
}

/**
 * Request realtime → 1ª mensagem do /realtime. Mesmas regras do `prepare` (headers herdados,
 * `{{var}}`, auth da pasta/coleção em header ou query); a request realtime não tem auth própria.
 */
export function prepareRealtime(req: RealtimeRequest, vars: Vars, parents: Parent[] = []) {
  const { url, headers } = prepare(
    {
      ...req,
      kind: "http",
      method: "GET",
      params: [],
      body: { type: "none" },
      auth: { type: "inherit" },
    },
    vars,
    parents,
  );
  const protocols = (req.protocols ?? []).map((p) => interpolate(p, vars).trim()).filter(Boolean);
  const network = effectiveNetwork(parents, vars);
  const options = Object.keys(network).length ? { options: network } : {};
  return {
    kind: req.kind,
    url,
    headers: headers.filter(on),
    protocols,
    ...options,
  } satisfies RealtimeStart;
}
