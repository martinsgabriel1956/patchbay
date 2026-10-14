// Importar coleções do Postman (v2.1) e do Insomnia (export v4 JSON) para o layout de disco
// (PLANNING §8). Puro: JSON → arquivos da coleção (caminho relativo → conteúdo) e o que ficou de
// fora (scripts, testes, auth não suportada…). Caminho terminado em "/" é uma pasta (pode ser vazia).
import type { Auth, Body, Environment, HttpRequest, KV } from "@api/schemas";
import { paramsFromUrl, urlWithParams } from "@/features/request-editor/query";

export type Imported = { name: string; files: [string, unknown][]; skipped: string[] };

// biome-ignore lint/suspicious/noExplicitAny: JSON de terceiros, lido com cuidado campo a campo
type Json = any;

export function importCollections(text: string): Imported[] {
  const data: Json = JSON.parse(text);
  if (data?._type === "export" && Array.isArray(data.resources)) return fromInsomnia(text);
  if (Array.isArray(data?.item)) return [fromPostman(data)];
  throw new Error(
    "Formato não reconhecido: use uma coleção Postman v2.1 ou um export Insomnia v4.",
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
