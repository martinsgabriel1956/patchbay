// Importar coleções do Postman (v2.1), do Insomnia (export v4 JSON) e specs OpenAPI (3.x e
// Swagger 2.0, JSON ou YAML) para o layout de disco (PLANNING §8). Puro: texto → arquivos da
// coleção (caminho relativo → conteúdo) e o que ficou de fora (scripts, testes, auth não
// suportada…). Caminho terminado em "/" é uma pasta (pode ser vazia).
import type { Auth, Body, Environment, HttpRequest, KV } from "@api/schemas";
import { parse as parseYaml } from "yaml";
import { paramsFromUrl, urlWithParams } from "@/features/request-editor/query";

export type Imported = { name: string; files: [string, unknown][]; skipped: string[] };

// biome-ignore lint/suspicious/noExplicitAny: JSON de terceiros, lido com cuidado campo a campo
type Json = any;

export function importCollections(text: string): Imported[] {
  const data: Json = /^\s*[{[]/.test(text) ? JSON.parse(text) : parseYaml(text);
  if (data?._type === "export" && Array.isArray(data.resources)) return fromInsomnia(text);
  if (Array.isArray(data?.item)) return [fromPostman(data)];
  if (/^3\./.test(str(data?.openapi)) || str(data?.swagger) === "2.0") return [fromOpenApi(data)];
  throw new Error(
    "Formato não reconhecido: use uma coleção Postman v2.1, um export Insomnia v4 ou uma spec OpenAPI.",
  );
}

/** Nome válido de arquivo/pasta no workspace (sem barra, sem ponto no início). */
export const cleanName = (name: unknown, fallback = "sem nome") =>
  String(name ?? "")
    .replace(/[/\\]/g, "-")
    .replace(/^[.\s]+/, "")
    .trim() || fallback;

/** Caminhos únicos dentro da coleção. "environments/" na raiz e "collection.json" são reservados. */
function namer() {
  const used = new Set(["environments"]);
  return (dir: string, raw: unknown, ext = "") => {
    const base = cleanName(raw);
    const at = (name: string) => (dir ? `${dir}/${name}${ext}` : `${name}${ext}`);
    let name = base;
    for (let n = 2; used.has(at(name)) || (ext && name === "collection"); n++)
      name = `${base} ${n}`;
    used.add(at(name));
    return at(name);
  };
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const list = (v: unknown): Json[] => (Array.isArray(v) ? v : []);
const fileName = (path: string) =>
  path
    .split("/")
    .pop()
    ?.replace(/\.json$/, "") ?? path;

/** Mesma ordem de chaves do toRequest da web: o arquivo sai igual ao que o app grava. */
function request(path: string, r: Partial<HttpRequest>): HttpRequest {
  const url = r.url ?? "";
  return {
    id: crypto.randomUUID(),
    name: fileName(path),
    kind: "http",
    method: (r.method || "GET").toUpperCase(),
    url,
    params: r.params ?? paramsFromUrl(url, []),
    headers: r.headers ?? [],
    body: r.body ?? { type: "none" },
    auth: r.auth ?? { type: "inherit" },
    options: { timeoutMs: 30_000, followRedirects: true, insecureTls: false },
  };
}

function collectionFile(name: string, auth: Auth, headers: KV[] = [], vars?: KV[]) {
  return {
    name,
    ...(auth.type !== "inherit" && { auth }),
    ...(headers.length > 0 && { headers }),
    ...(vars && vars.length > 0 && { vars }),
  };
}

// ---------- Postman v2.1 ----------

const pmKv = (v: unknown): KV[] =>
  list(v).map((h) => ({ key: str(h.key), value: str(h.value), enabled: !h.disabled }));

function pmAuth(auth: Json, where: string, skipped: string[]): Auth {
  if (!auth?.type) return { type: "inherit" };
  const get = (key: string) => str(list(auth[auth.type]).find((p) => p.key === key)?.value);
  switch (auth.type) {
    case "noauth":
      return { type: "none" };
    case "inherit":
      return { type: "inherit" };
    case "bearer":
      return { type: "bearer", token: get("token") };
    case "basic":
      return { type: "basic", username: get("username"), password: get("password") };
    case "apikey":
      return {
        type: "apikey",
        key: get("key"),
        value: get("value"),
        in: get("in") === "query" ? "query" : "header",
      };
    default:
      skipped.push(`${where}: auth ${auth.type} (não suportada; ficou herdada)`);
      return { type: "inherit" };
  }
}

function pmBody(body: Json, where: string, skipped: string[]): Body {
  const outside = (file: string) => {
    if (file) skipped.push(`${where}: arquivo "${file}" precisa estar no workspace`);
    return file;
  };
  switch (body?.mode) {
    case "raw": {
      const lang = body.options?.raw?.language;
      const type = lang === "json" ? "json" : lang === "xml" ? "xml" : "text";
      return { type, content: str(body.raw) };
    }
    case "urlencoded":
      return { type: "form-urlencoded", fields: pmKv(body.urlencoded) };
    case "formdata":
      return {
        type: "multipart",
        fields: list(body.formdata).map((f) =>
          f.type === "file"
            ? {
                key: str(f.key),
                value: "",
                enabled: !f.disabled,
                file: outside(str([f.src].flat()[0])),
              }
            : { key: str(f.key), value: str(f.value), enabled: !f.disabled },
        ),
      };
    case "file":
      return { type: "binary", file: outside(str(body.file?.src)) };
    case "graphql":
      return {
        type: "graphql",
        query: str(body.graphql?.query),
        variables: str(body.graphql?.variables),
      };
    default:
      return { type: "none" };
  }
}

function fromPostman(data: Json): Imported {
  const name = cleanName(data.info?.name, "postman");
  const skipped: string[] = [];
  const path = namer();
  const scripts = (item: Json, where: string) => {
    const kinds = list(item.event).map((e) => (e.listen === "test" ? "testes" : "script"));
    if (kinds.length) skipped.push(`${where}: ${[...new Set(kinds)].join(" e ")}`);
  };
  const files: [string, unknown][] = [
    [
      "collection.json",
      collectionFile(name, pmAuth(data.auth, "coleção", skipped), [], pmKv(data.variable)),
    ],
  ];
  scripts(data, "coleção");

  const walk = (items: Json[], dir: string) => {
    for (const item of items) {
      const where = str(item.name) || "sem nome";
      scripts(item, where);
      if (Array.isArray(item.item)) {
        const folder = path(dir, item.name);
        files.push([`${folder}/`, null]);
        const auth = pmAuth(item.auth, where, skipped);
        if (auth.type !== "inherit")
          files.push([`${folder}/collection.json`, collectionFile(fileName(folder), auth)]);
        walk(item.item, folder);
        continue;
      }
      const r = typeof item.request === "string" ? { url: item.request } : (item.request ?? {});
      if (list(item.response).length)
        skipped.push(`${where}: ${item.response.length} exemplo(s) de resposta`);
      const file = path(dir, item.name, ".json");
      files.push([
        file,
        request(file, {
          method: str(r.method),
          url: typeof r.url === "string" ? r.url : str(r.url?.raw),
          headers: pmKv(r.header),
          body: pmBody(r.body, where, skipped),
          auth: pmAuth(r.auth, where, skipped),
        }),
      ]);
    }
  };
  walk(list(data.item), "");
  return { name, files, skipped };
}

// ---------- Insomnia v4 ----------

const insKv = (v: unknown): KV[] =>
  list(v).map((h) => ({ key: str(h.name), value: str(h.value), enabled: !h.disabled }));

/** Variáveis aninhadas do Insomnia ({ api: { url } }) viram "api.url", como no {{ _.api.url }}. */
function flatten(data: Json, prefix = ""): KV[] {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return prefix
      ? [
          {
            key: prefix,
            value: Array.isArray(data) ? JSON.stringify(data) : str(data),
            enabled: true,
          },
        ]
      : [];
  return Object.entries(data).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}

function insAuth(auth: Json, where: string, skipped: string[]): Auth {
  if (!auth?.type) return { type: "inherit" };
  if (auth.disabled || auth.type === "none") return { type: "none" };
  switch (auth.type) {
    case "bearer":
      if (auth.prefix && auth.prefix !== "Bearer")
        skipped.push(`${where}: prefixo "${auth.prefix}" do bearer (vira "Bearer")`);
      return { type: "bearer", token: str(auth.token) };
    case "basic":
      return { type: "basic", username: str(auth.username), password: str(auth.password) };
    case "apikey":
      return {
        type: "apikey",
        key: str(auth.key),
        value: str(auth.value),
        in: auth.addTo === "queryParams" ? "query" : "header",
      };
    default:
      skipped.push(`${where}: auth ${auth.type} (não suportada; ficou herdada)`);
      return { type: "inherit" };
  }
}

function insBody(body: Json, where: string, skipped: string[]): Body {
  const mime = str(body?.mimeType).toLowerCase();
  const text = str(body?.text);
  if (mime === "application/x-www-form-urlencoded")
    return { type: "form-urlencoded", fields: insKv(body.params) };
  if (mime === "multipart/form-data")
    return {
      type: "multipart",
      fields: list(body.params).map((p) =>
        p.type === "file"
          ? { key: str(p.name), value: "", enabled: !p.disabled, file: str(p.fileName) }
          : { key: str(p.name), value: str(p.value), enabled: !p.disabled },
      ),
    };
  if (mime === "application/octet-stream") {
    if (body.fileName)
      skipped.push(`${where}: arquivo "${body.fileName}" precisa estar no workspace`);
    return { type: "binary", file: str(body.fileName) };
  }
  if (mime === "application/graphql") {
    try {
      const { query, variables } = JSON.parse(text || "{}");
      return {
        type: "graphql",
        query: str(query),
        variables: variables ? JSON.stringify(variables, null, 2) : "",
      };
    } catch {
      return { type: "graphql", query: text, variables: "" };
    }
  }
  if (!text) return { type: "none" };
  if (mime.includes("json")) return { type: "json", content: text };
  if (mime.includes("xml")) return { type: "xml", content: text };
  return { type: "text", content: text };
}

function fromInsomnia(raw: string): Imported[] {
  // {{ _.var }} (Insomnia) → {{var}}. Tags {% … %} não têm equivalente: ficam como texto.
  const data: Json = JSON.parse(raw.replace(/\{\{\s*_\.([^{}\s]+)\s*\}\}/g, "{{$1}}"));
  const resources = list(data.resources);
  const children = (id: string) => resources.filter((r) => r.parentId === id);
  const workspaces = resources.filter((r) => r._type === "workspace");
  if (!workspaces.length) throw new Error("Export do Insomnia sem workspace.");

  return workspaces.map((ws) => {
    const name = cleanName(ws.name, "insomnia");
    const skipped: string[] = [];
    const path = namer();
    const files: [string, unknown][] = [];
    if (/\{%/.test(raw)) skipped.push("tags de template {% … %} (ficaram como texto)");

    // Ambiente base (filho do workspace) = variáveis da coleção; os filhos dele = environments.
    const base = children(ws._id).find((r) => r._type === "environment");
    files.push([
      "collection.json",
      collectionFile(name, { type: "inherit" }, [], flatten(base?.data)),
    ]);
    for (const env of base ? children(base._id) : []) {
      if (env._type !== "environment") continue;
      const file = path("environments", env.name, ".json");
      files.push([file, { name: fileName(file), vars: flatten(env.data) } satisfies Environment]);
    }

    const walk = (parentId: string, dir: string) => {
      for (const r of children(parentId)) {
        const where = str(r.name) || str(r._id);
        if (str(r.preRequestScript).trim() || str(r.afterResponseScript).trim())
          skipped.push(`${where}: scripts`);
        if (r._type === "request_group") {
          const folder = path(dir, r.name);
          files.push([`${folder}/`, null]);
          if (Object.keys(r.environment ?? {}).length)
            skipped.push(`${where}: variáveis de pasta (só a coleção tem variáveis)`);
          const auth = insAuth(r.authentication, where, skipped);
          const headers = insKv(r.headers);
          if (auth.type !== "inherit" || headers.length)
            files.push([
              `${folder}/collection.json`,
              collectionFile(fileName(folder), auth, headers),
            ]);
          walk(r._id, folder);
        } else if (r._type === "request") {
          const file = path(dir, r.name, ".json");
          const params = [...paramsFromUrl(str(r.url), []), ...insKv(r.parameters)];
          const url = r.parameters?.length ? urlWithParams(str(r.url), params) : str(r.url);
          files.push([
            file,
            request(file, {
              method: str(r.method),
              url,
              params,
              headers: insKv(r.headers),
              body: insBody(r.body, where, skipped),
              auth: insAuth(r.authentication, where, skipped),
            }),
          ]);
        } else if (r._type !== "environment") skipped.push(`${where}: ${r._type}`);
      }
    };
    walk(ws._id, "");
    return { name, files, skipped };
  });
}

// ---------- OpenAPI 3.x / Swagger 2.0 ----------

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const FORMS = ["application/x-www-form-urlencoded", "multipart/form-data"];
/** Exemplo como texto de param/campo (objeto vira JSON). */
const asText = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : str(v));

function fromOpenApi(spec: Json): Imported {
  const name = cleanName(spec.info?.title, "openapi");
  const v2 = str(spec.swagger) === "2.0";
  const skipped: string[] = [];
  const path = namer();
  const files: [string, unknown][] = [];

  /** Segue $ref locais ("#/components/…"); externo, quebrado ou em ciclo vira {}. */
  const deref = (node: Json, seen: string[] = []): Json => {
    const ref = node?.$ref;
    if (typeof ref !== "string") return node;
    if (!ref.startsWith("#/")) skipped.push(`$ref externo "${ref}" (ignorado)`);
    if (!ref.startsWith("#/") || seen.includes(ref)) return {};
    const target = ref
      .slice(2)
      .split("/")
      .reduce((o: Json, k) => o?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
    return deref(target ?? {}, [...seen, ref]);
  };

  /** Exemplo a partir do schema: example/default/enum, senão um valor por tipo. Um $ref que já
   *  está no caminho (ciclo) some do objeto, e a profundidade tem teto. */
  const sample = (s: Json, depth = 0, refs: string[] = []): unknown => {
    if (!s || typeof s !== "object" || depth > 8) return undefined;
    if (typeof s.$ref === "string")
      return refs.includes(s.$ref) ? undefined : sample(deref(s), depth, [...refs, s.$ref]);
    for (const v of [s.example, list(s.examples)[0], s.default, s.const, list(s.enum)[0]])
      if (v !== undefined) return v;
    const next = (x: Json) => sample(x, depth + 1, refs);
    const one = list(s.oneOf)[0] ?? list(s.anyOf)[0];
    if (one) return next(one);
    const type = [s.type].flat().find((t) => t !== "null");
    if (type === "array") {
      const item = next(s.items);
      return item === undefined ? [] : [item];
    }
    if (type === "object" || s.properties || s.allOf) {
      const own = Object.entries(s.properties ?? {}).map(([k, v]) => [k, next(v)]);
      const parts = [...list(s.allOf).map(next), Object.fromEntries(own)];
      return Object.assign({}, ...parts.filter((p) => p && typeof p === "object"));
    }
    return ({ string: "string", integer: 0, number: 0, boolean: false } as Json)[type] ?? null;
  };

  /** Exemplo explícito de parâmetro ou media type ("examples" é um mapa de { value }). */
  const example = (o: Json) => o?.example ?? deref(Object.values(o?.examples ?? {})[0])?.value;

  const schemes = (v2 ? spec.securityDefinitions : spec.components?.securitySchemes) ?? {};
  /** Primeira alternativa não vazia de "security" → Auth; nenhuma = sem auth. */
  const auth = (security: Json, where: string): Auth => {
    const names = Object.keys(list(security).find((r) => Object.keys(r ?? {}).length) ?? {});
    if (!names.length) return { type: "none" };
    if (names.length > 1)
      skipped.push(`${where}: auth ${names.slice(1).join(", ")} (só ${names[0]})`);
    const s = deref(schemes[names[0]]) ?? {};
    const kind = s.type === "http" ? str(s.scheme).toLowerCase() : str(s.type);
    if (kind === "bearer") return { type: "bearer", token: "{{token}}" };
    if (kind === "basic")
      return { type: "basic", username: "{{username}}", password: "{{password}}" };
    if (kind === "apiKey" && s.in !== "cookie")
      return {
        type: "apikey",
        key: str(s.name),
        value: "{{apiKey}}",
        in: s.in === "query" ? "query" : "header",
      };
    skipped.push(`${where}: auth ${kind || names[0]} (não suportada; ficou herdada)`);
    return { type: "inherit" };
  };

  const body = (content: Json, headers: KV[]): Body => {
    const types = Object.keys(content);
    const type = types.find((t) => /json/i.test(t)) ?? types[0];
    if (!type) return { type: "none" };
    const media = content[type] ?? {};
    if (FORMS.includes(type)) {
      const value = sample(media.schema);
      const props = deref(media.schema)?.properties ?? {};
      const fields = Object.entries(value && typeof value === "object" ? value : {}).map(
        ([key, v]) =>
          deref(props[key])?.format === "binary"
            ? { key, value: "", enabled: true, file: "" }
            : { key, value: asText(v), enabled: true },
      );
      return type === FORMS[0]
        ? { type: "form-urlencoded", fields }
        : { type: "multipart", fields };
    }
    if (type !== "application/json" && !headers.some((h) => /^content-type$/i.test(h.key)))
      headers.push({ key: "Content-Type", value: type, enabled: true });
    const ex = example(media) ?? sample(media.schema);
    if (/json/i.test(type))
      return { type: "json", content: ex === undefined ? "" : JSON.stringify(ex, null, 2) };
    if (/xml|^text\//i.test(type))
      return {
        type: /xml/i.test(type) ? "xml" : "text",
        content: typeof ex === "string" ? ex : "",
      };
    return { type: "binary", file: "" };
  };

  const global: Auth = spec.security ? auth(spec.security, "coleção") : { type: "inherit" };
  files.push(["collection.json", collectionFile(name, global)]);

  // Cada servidor vira um environment com baseUrl ({var} do servidor vira o default dela).
  const host = `${list(spec.schemes)[0] ?? "https"}://${str(spec.host)}`;
  const servers = v2
    ? [{ url: `${spec.host ? host : ""}${str(spec.basePath)}` }]
    : list(spec.servers);
  for (const [i, server] of (servers.length ? servers : [{}]).entries()) {
    const url = str(server.url)
      .replace(/\{([^{}]+)\}/g, (_, v) => str(server.variables?.[v]?.default))
      .replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(url))
      skipped.push(`baseUrl "${url}" sem host (complete no environment)`);
    const file = path(
      "environments",
      server.description || (i ? `servidor ${i + 1}` : "padrão"),
      ".json",
    );
    files.push([
      file,
      {
        name: fileName(file),
        vars: [{ key: "baseUrl", value: url, enabled: true }],
      } satisfies Environment,
    ]);
  }

  const folders = new Map<string, string>(); // tag → pasta
  for (const [route, item] of Object.entries(spec.paths ?? {})) {
    const pathItem = deref(item) ?? {};
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      const where = str(op.summary || op.operationId) || `${method.toUpperCase()} ${route}`;
      const tag = str(list(op.tags)[0]);
      if (tag && !folders.has(tag)) {
        folders.set(tag, path("", tag));
        files.push([`${folders.get(tag)}/`, null]);
      }
      // Parâmetros do path + da operação; a operação sobrescreve (mesmo name + in).
      const byKey = new Map<string, Json>();
      for (const p of [...list(pathItem.parameters), ...list(op.parameters)].map((p) => deref(p)))
        byKey.set(`${p?.in}:${p?.name}`, p ?? {});
      const params = [...byKey.values()];
      const kv = (place: string): KV[] =>
        params
          .filter((p) => p.in === place)
          .map((p) => {
            const s = deref(p.schema) ?? p; // 2.0: tipo, default e enum ficam no próprio parâmetro
            const v = example(p) ?? p["x-example"] ?? s.example ?? s.default ?? list(s.enum)[0];
            return { key: str(p.name), value: asText(v), enabled: !!p.required };
          });
      if (params.some((p) => p.in === "cookie")) skipped.push(`${where}: parâmetros de cookie`);
      if (op.callbacks) skipped.push(`${where}: callbacks`);

      // 2.0: parâmetro "body" e "formData" viram o mesmo formato de content do 3.x.
      const consumes = list(op.consumes ?? spec.consumes);
      const form = params.filter((p) => p.in === "formData");
      const bodyParam = params.find((p) => p.in === "body");
      const content = !v2
        ? (deref(op.requestBody)?.content ?? {})
        : bodyParam
          ? {
              [consumes.find((t) => /json/i.test(t)) ?? consumes[0] ?? "application/json"]: {
                schema: bodyParam.schema,
              },
            }
          : form.length
            ? {
                [form.some((p) => p.type === "file") || consumes.includes(FORMS[1])
                  ? FORMS[1]
                  : FORMS[0]]: {
                  schema: {
                    properties: Object.fromEntries(
                      form.map((p) => [p.name, p.type === "file" ? { format: "binary" } : p]),
                    ),
                  },
                },
              }
            : {};

      const query = kv("query");
      const headers = kv("header");
      const url = `{{baseUrl}}${route.replace(/\{([^{}]+)\}/g, "{{$1}}")}`;
      const same = JSON.stringify(op.security) === JSON.stringify(spec.security);
      const file = path(folders.get(tag) ?? "", where, ".json");
      files.push([
        file,
        request(file, {
          method,
          url: urlWithParams(url, query),
          params: query,
          headers,
          body: body(content, headers),
          auth: op.security === undefined || same ? { type: "inherit" } : auth(op.security, where),
        }),
      ]);
    }
  }
  if (spec.webhooks) skipped.push("webhooks");
  return { name, files, skipped: [...new Set(skipped)] };
}
