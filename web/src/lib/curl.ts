// Importar e exportar cURL (PLANNING Fase 5). Puro: comando → request e request → comando.
// Import segue o curl: sem -L não segue redirect, sem -X o método vem do body.
import type { Auth, Body, HttpRequest, KV } from "@api/schemas";
import { paramsFromUrl } from "@/features/request-editor/query";

export type CurlRequest = Omit<HttpRequest, "id" | "name">;

export const isCurl = (text: string) => /^\s*curl\s/.test(text);

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  a: "\x07",
  b: "\b",
  e: "\x1b",
  E: "\x1b",
  f: "\f",
  v: "\v",
};
// \xHH, \uHHHH, \UHHHHHHHH e octal \nnn (o Chrome usa \u e \041).
const NUMERIC = /^(?:x([0-9a-f]{1,2})|u([0-9a-f]{1,4})|U([0-9a-f]{1,8})|([0-7]{1,3}))/i;

/** Divide como o bash: aspas simples, duplas, $'…', escape com \ e \ de continuação de linha. */
export function shellWords(cmd: string): string[] {
  const words: string[] = [];
  let word: string | undefined;
  const add = (text: string) => {
    word = (word ?? "") + text;
  };
  let i = 0;
  while (i < cmd.length) {
    const c = cmd[i];
    if (c === "\\") {
      const next = cmd.slice(i + 1, i + 3);
      if (next.startsWith("\n")) i += 2;
      else if (next === "\r\n") i += 3;
      else {
        add(cmd[i + 1] ?? "");
        i += 2;
      }
    } else if (/\s/.test(c)) {
      if (word !== undefined) words.push(word);
      word = undefined;
      i++;
    } else if (c === "'") {
      const end = cmd.indexOf("'", i + 1);
      if (end < 0) throw new Error("Aspas simples sem fechar.");
      add(cmd.slice(i + 1, end));
      i = end + 1;
    } else if (c === "$" && cmd[i + 1] === "'") {
      let text = "";
      for (i += 2; cmd[i] !== "'"; ) {
        if (i >= cmd.length) throw new Error("Aspas $'…' sem fechar.");
        if (cmd[i] !== "\\") {
          text += cmd[i++];
          continue;
        }
        const m = NUMERIC.exec(cmd.slice(i + 1));
        if (m) {
          const [, x, u, U, octal] = m;
          text += String.fromCodePoint(octal ? parseInt(octal, 8) : parseInt(x ?? u ?? U, 16));
          i += 1 + m[0].length;
        } else {
          const e = cmd[i + 1];
          text += ESCAPES[e] ?? e;
          i += 2;
        }
      }
      add(text);
      i++;
    } else if (c === '"') {
      let text = "";
      for (i++; cmd[i] !== '"'; ) {
        if (i >= cmd.length) throw new Error("Aspas duplas sem fechar.");
        // Dentro de "…", \ só escapa $ ` " \ e a quebra de linha.
        if (cmd[i] === "\\" && /[$`"\\\n]/.test(cmd[i + 1] ?? "")) {
          if (cmd[i + 1] !== "\n") text += cmd[i + 1];
          i += 2;
        } else text += cmd[i++];
      }
      add(text);
      i++;
    } else {
      add(c);
      i++;
    }
  }
  if (word !== undefined) words.push(word);
  return words;
}

// Opções que levam valor. As do fim são ignoradas, mas o valor delas não pode virar a URL.
const VALUED = new Set(
  (
    "-X --request -H --header -d --data --data-ascii --data-raw --data-binary --data-urlencode " +
    "--json -F --form --form-string -u --user -A --user-agent -b --cookie -e --referer --url " +
    "-o --output -m --max-time --connect-timeout -w --write-out -x --proxy -U --proxy-user " +
    "-c --cookie-jar -r --range -T --upload-file --retry --retry-delay --max-redirs --resolve " +
    "--cacert --cert -E --key --interface --limit-rate --unix-socket -K --config"
  ).split(" "),
);

/** Comando curl → request (sem id/nome). Lança erro com mensagem legível se não der. */
export function parseCurl(cmd: string): CurlRequest {
  const words = shellWords(cmd.trim());
  if (!/(^|\/)curl$/.test(words[0] ?? "")) throw new Error("O comando não começa com curl.");

  const args: [string, string][] = [];
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w.startsWith("--")) args.push([w, VALUED.has(w) ? (words[++i] ?? "") : ""]);
    else if (w.startsWith("-") && w.length > 1) {
      // -sSL, -XPOST, -sX POST
      for (let j = 1; j < w.length; j++) {
        const flag = `-${w[j]}`;
        if (!VALUED.has(flag)) {
          args.push([flag, ""]);
          continue;
        }
        args.push([flag, w.slice(j + 1) || (words[++i] ?? "")]);
        break;
      }
    } else args.push(["url", w]);
  }

  let url = "";
  let method: string | undefined;
  const headers: KV[] = [];
  const data: string[] = [];
  let dataFile: string | undefined;
  const form: (KV & { file?: string })[] = [];
  let auth: Auth = { type: "inherit" };
  let get = false;
  let head = false;
  let json = false;
  let followRedirects = false;
  let insecureTls = false;
  const header = (key: string, value: string) => headers.push({ key, value, enabled: true });
  const pushData = (value: string, raw = false) => {
    if (!raw && value.startsWith("@")) dataFile = value.slice(1);
    else data.push(value);
  };

  for (const [flag, value] of args) {
    switch (flag) {
      case "url":
      case "--url":
        url ||= value;
        break;
      case "-X":
      case "--request":
        method = value.toUpperCase();
        break;
      case "-H":
      case "--header": {
        const colon = value.indexOf(":");
        if (colon > 0) {
          const v = value.slice(colon + 1).trimStart();
          if (v) header(value.slice(0, colon).trim(), v); // "Nome:" sem valor só remove no curl
        } else if (value.endsWith(";")) header(value.slice(0, -1).trim(), "");
        break;
      }
      case "-d":
      case "--data":
      case "--data-ascii":
      case "--data-binary":
        pushData(value);
        break;
      case "--data-raw":
        pushData(value, true);
        break;
      case "--json":
        json = true;
        pushData(value);
        break;
      case "--data-urlencode": {
        const eq = value.indexOf("=");
        data.push(
          eq < 0
            ? encodeURIComponent(value)
            : `${value.slice(0, eq) && `${value.slice(0, eq)}=`}${encodeURIComponent(value.slice(eq + 1))}`,
        );
        break;
      }
      case "-F":
      case "--form":
      case "--form-string": {
        const eq = value.indexOf("=");
        const key = eq < 0 ? value : value.slice(0, eq);
        const v = eq < 0 ? "" : value.slice(eq + 1);
        // @arquivo e <arquivo viram arquivo do workspace; ";type=…" e ";filename=…" saem.
        if (flag !== "--form-string" && /^[@<]/.test(v))
          form.push({ key, value: "", enabled: true, file: v.slice(1).split(";")[0] });
        else form.push({ key, value: v, enabled: true });
        break;
      }
      case "-u":
      case "--user": {
        const colon = value.indexOf(":");
        auth =
          colon < 0
            ? { type: "basic", username: value, password: "" }
            : { type: "basic", username: value.slice(0, colon), password: value.slice(colon + 1) };
        break;
      }
      case "-A":
      case "--user-agent":
        header("User-Agent", value);
        break;
      case "-e":
      case "--referer":
        header("Referer", value);
        break;
      case "-b":
      case "--cookie":
        if (value.includes("=")) header("Cookie", value); // sem "=" é um arquivo de cookies
        break;
      case "-G":
      case "--get":
        get = true;
        break;
      case "-I":
      case "--head":
        head = true;
        break;
      case "-L":
      case "--location":
        followRedirects = true;
        break;
      case "-k":
      case "--insecure":
        insecureTls = true;
        break;
      // --compressed e o resto: ignorados (a api não pede compressão e mostra o tamanho real).
    }
  }
  if (!url) throw new Error("Nenhuma URL no comando curl.");

  const has = (name: string) => headers.some((h) => h.key.toLowerCase() === name);
  if (json) {
    if (!has("content-type")) header("Content-Type", "application/json");
    if (!has("accept")) header("Accept", "application/json");
  }

  const text = data.join("&");
  let body: Body = { type: "none" };
  if (get && data.length) url += (url.includes("?") ? "&" : "?") + text;
  else if (form.length) body = { type: "multipart", fields: form };
  else if (dataFile !== undefined && !data.length) body = { type: "binary", file: dataFile };
  else if (data.length) body = bodyFor(text, headers, header);

  return {
    kind: "http",
    method: method ?? (head ? "HEAD" : get ? "GET" : body.type === "none" ? "GET" : "POST"),
    url,
    params: paramsFromUrl(url, []),
    headers,
    body,
    auth,
    options: { followRedirects, insecureTls },
  };
}

/** Body pelo Content-Type. Sem ele o curl manda form-urlencoded: vira campos se der sem perda. */
function bodyFor(text: string, headers: KV[], header: (k: string, v: string) => void): Body {
  const type =
    headers.find((h) => h.key.toLowerCase() === "content-type")?.value.toLowerCase() ?? "";
  if (!type || type.includes("x-www-form-urlencoded")) {
    const fields = formFields(text);
    if (fields) return { type: "form-urlencoded", fields };
    if (!type) header("Content-Type", "application/x-www-form-urlencoded");
    return { type: "text", content: text };
  }
  if (type.includes("json")) return { type: "json", content: text };
  if (type.includes("xml")) return { type: "xml", content: text };
  return { type: "text", content: text };
}

/** Só texto já url-encoded (ex.: a=1&b=x%20y) vira campos; JSON e afins ficam como texto. */
function formFields(text: string): KV[] | undefined {
  if (!/^[\w.~*!'()+%=&@:/,;$?-]+$/.test(text)) return;
  const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " "));
  try {
    return text
      .split("&")
      .filter(Boolean)
      .map((pair) => {
        const eq = pair.indexOf("=");
        const [k, v] = eq < 0 ? [pair, ""] : [pair.slice(0, eq), pair.slice(eq + 1)];
        return { key: decode(k), value: decode(v), enabled: true };
      });
  } catch {
    return; // % malformado
  }
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const CONTENT_TYPES: Partial<Record<Body["type"], string>> = {
  json: "application/json",
  graphql: "application/json",
  xml: "application/xml",
  text: "text/plain; charset=utf-8",
  binary: "application/octet-stream",
};

/** Request (já resolvida pelo prepare) → comando curl, no formato do "Copy as cURL" do Chrome. */
export function toCurl(req: CurlRequest): string {
  const on = <T extends KV>(list: T[]) => list.filter((kv) => kv.enabled && kv.key);
  const { body } = req;
  const parts = [`curl ${q(req.url)}`];
  if (req.method !== (body.type === "none" ? "GET" : "POST")) parts.push(`-X ${req.method}`);
  const headers = on(req.headers);
  for (const h of headers) parts.push(`-H ${q(h.value ? `${h.key}: ${h.value}` : `${h.key};`)}`);
  // O que a api mandaria sozinha (o curl mandaria form-urlencoded).
  const type = CONTENT_TYPES[body.type];
  if (type && !headers.some((h) => h.key.toLowerCase() === "content-type"))
    parts.push(`-H ${q(`Content-Type: ${type}`)}`);
  if (req.auth.type === "basic") parts.push(`-u ${q(`${req.auth.username}:${req.auth.password}`)}`);

  switch (body.type) {
    case "json":
    case "text":
    case "xml":
      parts.push(`--data-raw ${q(body.content)}`);
      break;
    case "graphql": {
      const variables = body.variables.trim() ? JSON.parse(body.variables) : undefined;
      parts.push(`--data-raw ${q(JSON.stringify({ query: body.query, variables }))}`);
      break;
    }
    case "form-urlencoded":
      for (const f of on(body.fields)) parts.push(`--data-urlencode ${q(`${f.key}=${f.value}`)}`);
      break;
    case "multipart":
      for (const f of on(body.fields)) {
        if (f.file !== undefined) parts.push(`-F ${q(`${f.key}=@${f.file}`)}`);
        // Valor que começa com @ ou < seria lido como arquivo pelo -F.
        else
          parts.push(
            `${/^[@<]/.test(f.value) ? "--form-string" : "-F"} ${q(`${f.key}=${f.value}`)}`,
          );
      }
      break;
    case "binary":
      parts.push(`--data-binary ${q(`@${body.file}`)}`);
      break;
  }
  if (req.options?.insecureTls) parts.push("-k");
  if (req.options?.followRedirects) parts.push("-L");
  return parts.join(" \\\n  ");
}
