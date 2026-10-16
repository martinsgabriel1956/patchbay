// Executa uma HttpRequest já resolvida via undici e devolve a resposta crua (PLANNING §6, §10).
import { isUtf8 } from "node:buffer";
import { openAsBlob } from "node:fs";
import { readFile } from "node:fs/promises";
import { STATUS_CODES } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream";
import {
  createBrotliDecompress,
  createGunzip,
  createInflate,
  createZstdDecompress,
} from "node:zlib";
import { type Dispatcher, EnvHttpProxyAgent, FormData, request } from "undici";
import type { Body, HttpRequest, HttpResponse, KV, Network } from "../schemas.js";
import { exists, resolve } from "./workspace.js";

const LIMIT = 5 * 1024 * 1024;
const MAX_REDIRECTS = 10;
const DEFAULT_TIMEOUT_MS = 30_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const TEXT = /^text\/|json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|yaml/i;
const DECODERS: Record<string, () => NodeJS.ReadWriteStream> = {
  gzip: createGunzip,
  "x-gzip": createGunzip,
  deflate: createInflate,
  br: createBrotliDecompress,
  zstd: createZstdDecompress,
};

/** Erro com o status que a rota devolve para a web (400 request inválida, 504 timeout). */
export const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};

// PEM de cert/key/ca. Path relativo = dentro do workspace (resolve() barra a fuga). Path absoluto
// vale como está, mesmo fora do workspace: quem configura é o próprio usuário, o arquivo só é lido
// (nunca volta para a web) e a chave privada costuma morar fora do repositório versionado.
async function pem(file?: string) {
  if (!file) return undefined;
  const abs = path.isAbsolute(file) ? file : await resolve(file);
  return readFile(abs, "utf8").catch(() => fail(400, `could not read certificate file: ${file}`));
}

/** Opções TLS do cliente (as do `tls.connect`), com os PEM já lidos. Servem ao undici e ao `ws`. */
export async function tlsOptions(net: Network & { insecureTls?: boolean } = {}) {
  const tls = {
    cert: await pem(net.cert),
    key: await pem(net.key),
    ca: await pem(net.ca),
    passphrase: net.passphrase || undefined,
    rejectUnauthorized: net.insecureTls ? false : undefined,
  };
  return Object.fromEntries(Object.entries(tls).filter(([, v]) => v !== undefined)) as typeof tls;
}

const MAX_DISPATCHERS = 16;
const dispatchers = new Map<string, Dispatcher>();

/**
 * Um dispatcher por configuração (proxy, certificados, insecureTls), reaproveitado entre envios.
 * Sem proxy configurado valem HTTP_PROXY/HTTPS_PROXY/NO_PROXY do ambiente, como no curl.
 * Os timeouts do undici ficam desligados: quem manda é options.timeoutMs (e, no SSE, a web).
 */
export async function dispatcher(net: Network & { insecureTls?: boolean } = {}) {
  const tls = await tlsOptions(net);
  const proxy = net.proxy?.trim() || undefined;
  const noProxy = net.noProxy?.trim() || undefined;
  const id = JSON.stringify([proxy, noProxy, tls]); // com o conteúdo dos PEM: arquivo trocado = outro
  let found = dispatchers.get(id);
  if (found) return found;
  try {
    // connect: TLS direto com o destino; requestTls: o mesmo TLS dentro do túnel do proxy.
    found = new EnvHttpProxyAgent({
      headersTimeout: 0,
      bodyTimeout: 0,
      httpProxy: proxy,
      httpsProxy: proxy,
      noProxy,
      connect: tls,
      requestTls: tls,
    });
  } catch (err) {
    return fail(400, `invalid proxy: ${(err as Error).message}`);
  }
  dispatchers.set(id, found);
  // ponytail: descarta o mais antigo por ordem de criação, não o menos usado; basta para poucas
  // configurações. close() espera as requests em andamento terminarem.
  if (dispatchers.size > MAX_DISPATCHERS) {
    const [oldest, old] = dispatchers.entries().next().value as [string, Dispatcher];
    dispatchers.delete(oldest);
    old.close().catch(() => {});
  }
  return found;
}

/** Com responseHeaders "raw": [nome, valor, nome, valor…], na ordem e na caixa originais. */
export function headerPairs(raw: string[]) {
  const pairs: [string, string][] = [];
  for (let i = 0; i < raw.length; i += 2) pairs.push([raw[i], raw[i + 1]]);
  return pairs;
}

const enabled = <T extends KV>(list: T[]) => list.filter((kv) => kv.enabled && kv.key !== "");

// Arquivos (multipart e binary) são paths dentro do workspace, conferidos por resolve().
// Arquivo que não existe é erro da request (400), não do upstream.
async function workspaceFile(rel: string) {
  const abs = await resolve(rel);
  if (!(await exists(abs))) fail(400, `file not found in the workspace: ${rel}`);
  return abs;
}

async function encodeBody(
  body: Body,
): Promise<{ data?: string | FormData | Buffer; type?: string }> {
  switch (body.type) {
    case "none":
      return {};
    case "json":
      return { data: body.content, type: "application/json" };
    case "text":
      return { data: body.content, type: "text/plain; charset=utf-8" };
    case "xml":
      return { data: body.content, type: "application/xml" };
    case "form-urlencoded": {
      const form = new URLSearchParams(enabled(body.fields).map((f) => [f.key, f.value]));
      return { data: form.toString(), type: "application/x-www-form-urlencoded" };
    }
    case "multipart": {
      // O undici gera o Content-Type com o boundary. O Blob lê o arquivo sob demanda (stream).
      const form = new FormData();
      for (const field of enabled(body.fields)) {
        if (field.file === undefined) form.append(field.key, field.value);
        else {
          const blob = await openAsBlob(await workspaceFile(field.file));
          form.append(field.key, blob, path.basename(field.file));
        }
      }
      return { data: form };
    }
    case "binary":
      if (!body.file) fail(400, "binary body needs a file");
      return {
        data: await readFile(await workspaceFile(body.file)),
        type: "application/octet-stream",
      };
    case "graphql": {
      let variables: unknown;
      try {
        variables = body.variables.trim() ? JSON.parse(body.variables) : undefined;
      } catch {
        fail(400, "GraphQL variables must be valid JSON");
      }
      return { data: JSON.stringify({ query: body.query, variables }), type: "application/json" };
    }
  }
}

export async function send(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, followRedirects = true, ...net } = req.options ?? {};
  const timeout = AbortSignal.timeout(timeoutMs);
  const abort = AbortSignal.any([signal, timeout]);

  // URL usada como veio: o parser WHATWG só encoda o que não pode ir cru (espaço, unicode)
  // e não toca em %20 nem em +. A query já vem montada pela web (params ficam como espelho).
  let url = URL.parse(req.url) ?? fail(400, `invalid URL: ${req.url}`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(400, `unsupported protocol: ${url.protocol}`);
  }
  let method = req.method.toUpperCase();
  let { data, type } = await encodeBody(req.body);
  let headers = enabled(req.headers).map((h): [string, string] => [h.key, h.value]);
  const has = (name: string) => headers.some(([key]) => key.toLowerCase() === name);
  if (type && !has("content-type")) headers.push(["content-type", type]);
  if (!has("user-agent")) headers.push(["user-agent", "patchbay"]);
  if (!has("accept")) headers.push(["accept", "*/*"]);
  const via = await dispatcher(net);

  const start = performance.now();
  try {
    for (let hop = 0; ; hop++) {
      const res = await request(url, {
        method,
        headers: headers.flat(),
        body: data,
        signal: abort,
        dispatcher: via,
        responseHeaders: "raw",
      });
      const pairs = headerPairs(res.headers as unknown as string[]);
      const get = (name: string) => pairs.find(([key]) => key.toLowerCase() === name)?.[1];

      const location = get("location");
      if (followRedirects && location && REDIRECTS.has(res.statusCode) && hop < MAX_REDIRECTS) {
        await res.body.dump();
        const next = new URL(location, url);
        // Como browsers e undici: credenciais não vazam para outra origem.
        if (next.origin !== url.origin) {
          headers = headers.filter(([key]) => !/^(authorization|cookie)$/i.test(key));
        }
        if (res.statusCode === 303 || (res.statusCode < 303 && method === "POST")) {
          if (method !== "HEAD") method = "GET";
          data = undefined;
          headers = headers.filter(([key]) => !/^content-/i.test(key));
        }
        url = next;
        continue;
      }

      const encoding = get("content-encoding")?.trim().toLowerCase();
      const decoder = encoding && encoding !== "identity" ? DECODERS[encoding] : undefined;
      let sizeBytes = 0;
      const counted = async function* () {
        for await (const chunk of res.body) {
          sizeBytes += chunk.length;
          yield chunk as Buffer;
        }
      };
      // Descomprime só para exibir; sizeBytes conta o que trafegou.
      const stream = decoder ? pipeline(counted, decoder(), () => {}) : counted();
      const chunks: Buffer[] = [];
      let decodedSizeBytes = 0;
      let truncated = false;
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
        decodedSizeBytes += chunk.length;
        if (decodedSizeBytes > LIMIT) {
          truncated = true; // sair do loop destrói o stream e fecha o upstream
          break;
        }
      }
      const body = Buffer.concat(chunks).subarray(0, LIMIT);
      const contentType = get("content-type");
      const undecodable = encoding !== undefined && encoding !== "identity" && !decoder;
      const isBinary = undecodable || (contentType ? !TEXT.test(contentType) : !isUtf8(body));

      return {
        status: res.statusCode,
        statusText: res.statusText || STATUS_CODES[res.statusCode] || "",
        headers: pairs,
        body: body.toString(isBinary ? "base64" : "utf8"),
        isBinary,
        truncated,
        timeMs: Math.round(performance.now() - start),
        sizeBytes,
        decodedSizeBytes,
      };
    }
  } catch (err) {
    if (timeout.aborted && !signal.aborted) fail(504, `timeout after ${timeoutMs} ms`);
    throw err;
  }
}
