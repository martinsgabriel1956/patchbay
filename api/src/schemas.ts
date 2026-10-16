// Fonte única dos tipos (PLANNING §8). A web importa só os tipos: `import type` daqui.
import { z } from "zod";

export const KV = z.object({ key: z.string(), value: z.string(), enabled: z.boolean() });
export type KV = z.infer<typeof KV>;

export const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.enum(["json", "text", "xml"]), content: z.string() }),
  z.object({ type: z.literal("form-urlencoded"), fields: z.array(KV) }),
  // file = path dentro do workspace
  z.object({
    type: z.literal("multipart"),
    fields: z.array(KV.extend({ file: z.string().optional() })),
  }),
  z.object({ type: z.literal("binary"), file: z.string() }),
  // variables = texto JSON (pode ter {{var}}); a api envia POST JSON {query, variables}.
  z.object({ type: z.literal("graphql"), query: z.string(), variables: z.string() }),
]);
export type Body = z.infer<typeof Body>;

export const Auth = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["none", "inherit"]) }),
  z.object({ type: z.literal("bearer"), token: z.string() }),
  z.object({ type: z.literal("basic"), username: z.string(), password: z.string() }),
  z.object({
    type: z.literal("apikey"),
    key: z.string(),
    value: z.string(),
    in: z.enum(["header", "query"]),
  }),
]);
export type Auth = z.infer<typeof Auth>;

export const HttpRequest = z.object({
  id: z.string(),
  name: z.string(),
  /** Número fixo do canal (Ctrl 1–9, trilho): dado na criação, não muda ao renomear. */
  channel: z.number().int().positive().optional(),
  kind: z.literal("http"),
  method: z.string(),
  url: z.string(),
  params: z.array(KV),
  headers: z.array(KV),
  body: Body,
  auth: Auth,
  options: z
    .object({
      timeoutMs: z.number().int().positive().optional(),
      followRedirects: z.boolean().optional(),
      insecureTls: z.boolean().optional(),
    })
    .optional(),
});
export type HttpRequest = z.infer<typeof HttpRequest>;

export const RealtimeRequest = z.object({
  id: z.string(),
  name: z.string(),
  channel: z.number().int().positive().optional(),
  kind: z.enum(["ws", "sse"]),
  url: z.string(),
  headers: z.array(KV),
  protocols: z.array(z.string()).optional(),
});
export type RealtimeRequest = z.infer<typeof RealtimeRequest>;

/** 1ª mensagem da web no WS /realtime: a request já resolvida (vars e auth viram headers). */
export const RealtimeStart = RealtimeRequest.pick({
  url: true,
  headers: true,
  protocols: true,
}).extend({ kind: z.enum(["ws", "sse"]) });
export type RealtimeStart = z.infer<typeof RealtimeStart>;

/**
 * O que a api repassa à web pelo /realtime. `at` em ISO 8601. No open: o subprotocolo aceito pelo
 * upstream ("" se nenhum ou SSE), os headers da resposta do handshake e, no SSE, o status HTTP.
 * Mensagem binária (só WS) vem em base64; `event`/`id` só no SSE, quando o bloco os tinha.
 */
export type RealtimeEvent = { at: string } & (
  | { type: "open"; data: { protocol: string; headers: [string, string][]; status?: number } }
  | { type: "message"; data: string; binary?: boolean; event?: string; id?: string }
  | { type: "error"; data: string }
  | { type: "close"; data: { code: number; reason: string } }
);

/** Pelo /realtime aberto com `{ kind: "watch" }`: paths (relativos) que mudaram no disco fora da
 *  api. Um diretório na lista vale por tudo dentro dele. */
export type WorkspaceEvent = { type: "changed"; paths: string[] };

export const Environment = z.object({ name: z.string(), vars: z.array(KV) });
export type Environment = z.infer<typeof Environment>;

export const HttpResponse = z.object({
  status: z.number().int(),
  statusText: z.string(),
  headers: z.array(z.tuple([z.string(), z.string()])), // array: headers podem repetir (Set-Cookie)
  body: z.string(), // base64 se binário
  isBinary: z.boolean(),
  truncated: z.boolean(),
  timeMs: z.number(),
  sizeBytes: z.number().int(), // trafegado (comprimido, se veio comprimido)
  decodedSizeBytes: z.number().int(), // descomprimido, o que a web exibe (PLANNING §10)
});
export type HttpResponse = z.infer<typeof HttpResponse>;

/** Uma linha do `.history.jsonl`: a request enviada e só o resumo do que voltou (sem body). */
export const HistoryEntry = z.object({
  at: z.string(), // ISO 8601
  request: HttpRequest,
  response: HttpResponse.pick({
    status: true,
    statusText: true,
    timeMs: true,
    sizeBytes: true,
  }).optional(),
  failed: z
    .object({ reason: z.enum(["cancelled", "timeout", "error"]), message: z.string() })
    .optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

/** Nó de `GET /files/tree`. Paths relativos à raiz do workspace, sempre com `/`. */
export type TreeEntry = {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeEntry[];
};
