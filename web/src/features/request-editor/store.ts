import type { Auth, Body, HttpRequest, HttpResponse, KV, RealtimeRequest } from "@api/schemas";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { requestContext } from "@/features/environments/store";
import { useRealtime } from "@/features/realtime/store";
import { files, json, useWorkspace } from "@/features/sidebar/store";
import { api } from "@/lib/api-client";
import { parseCurl, toCurl } from "@/lib/curl";
import { prepare } from "@/lib/interpolate";
import { paramsFromUrl, urlWithParams } from "./query";

export type BodyType = Body["type"];
export type Field = KV & { file?: string };
export type Result =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "done"; response: HttpResponse }
  | { state: "failed"; reason: "cancelled" | "timeout" | "error"; message: string };

export type Draft = {
  id: string;
  name: string;
  /** Abas salvas antes da Fase 4 não têm kind: o merge do persist completa com "http". */
  kind: "http" | "ws" | "sse";
  method: string;
  url: string;
  params: KV[];
  headers: KV[];
  // Conteúdo, campos e arquivo ficam guardados ao trocar o tipo do body.
  bodyType: BodyType;
  bodyContent: string;
  bodyFields: Field[];
  bodyFile: string;
  /** Só graphql (a query fica em bodyContent). Abas salvas antes da Fase 5 não têm. */
  bodyVariables?: string;
  auth: Auth;
  options: NonNullable<HttpRequest["options"]>;
  /** Só ws. Editado como texto separado por vírgula; limpo ao salvar e ao conectar. */
  protocols: string[];
};

/** Aba aberta: o draft em edição, de onde veio no disco e o texto da última gravação. */
export type Tab = Draft & { key: string; path?: string; saved: string; result: Result };

type RequestStore = {
  tabs: Tab[];
  active: string;
  /** Conta envios terminados; o histórico recarrega quando muda. */
  sends: number;
  set: (patch: Partial<Draft>) => void;
  setUrl: (url: string) => void;
  setParams: (params: KV[]) => void;
  send: () => Promise<void>;
  cancel: () => void;
  /** Comando curl → aba ativa (método, URL, headers, body, auth, opções); nome e arquivo ficam. */
  importCurl: (cmd: string) => void;
  /** A aba ativa resolvida (vars, auth em header) como comando curl. */
  exportCurl: () => Promise<string>;
  open: (draft: Draft, path?: string) => void;
  newTab: (kind?: Draft["kind"]) => void;
  activate: (key: string) => void;
  close: (key: string) => void;
  save: (path?: string) => Promise<void>;
  /** O arquivo (ou pasta) `from` virou `to` no disco. */
  moved: (from: string, to: string) => void;
  /** O arquivo (ou pasta) foi para a lixeira: as abas ficam abertas, sem path e não salvas. */
  removed: (path: string) => void;
};

const blank = (kind: Draft["kind"] = "http"): Draft => ({
  id: crypto.randomUUID(),
  name: { http: "Nova request", ws: "Novo WebSocket", sse: "Novo SSE" }[kind],
  kind,
  method: "GET",
  url: "",
  params: [],
  headers: [],
  bodyType: "none",
  bodyContent: "",
  bodyFields: [],
  bodyFile: "",
  bodyVariables: "",
  auth: { type: "inherit" },
  options: { timeoutMs: 30_000, followRedirects: true, insecureTls: false },
  protocols: [],
});

type AnyRequest = Partial<Omit<HttpRequest, "kind">> & Partial<Omit<RealtimeRequest, "kind">>;

/** Request do disco ou do histórico → draft. Tolerante a campos faltando (arquivo editado à mão). */
export function fromRequest(r: AnyRequest & { kind?: string }): Draft {
  const d = blank(r.kind === "ws" || r.kind === "sse" ? r.kind : "http");
  const body = r.body ?? { type: "none" };
  return {
    id: r.id ?? d.id,
    name: r.name ?? d.name,
    kind: d.kind,
    method: r.method ?? d.method,
    url: r.url ?? "",
    params: r.params ?? [],
    headers: r.headers ?? [],
    bodyType: body.type,
    bodyContent: "content" in body ? body.content : body.type === "graphql" ? body.query : "",
    bodyFields: "fields" in body ? body.fields : [],
    bodyFile: body.type === "binary" ? body.file : "",
    bodyVariables: body.type === "graphql" ? body.variables : "",
    auth: r.auth ?? d.auth,
    options: { ...d.options, ...r.options },
    protocols: r.protocols ?? [],
  };
}

function toBody(d: Draft): Body {
  switch (d.bodyType) {
    case "none":
      return { type: "none" };
    case "form-urlencoded":
    case "multipart":
      return { type: d.bodyType, fields: d.bodyFields.map(kv) };
    case "binary":
      return { type: "binary", file: d.bodyFile };
    case "graphql":
      return { type: "graphql", query: d.bodyContent, variables: d.bodyVariables ?? "" };
    default:
      return { type: d.bodyType, content: d.bodyContent };
  }
}

// Objetos montados sempre na mesma ordem de chaves: o arquivo não muda à toa no git.
const kv = ({ key, value, enabled, file }: Field): Field =>
  file === undefined ? { key, value, enabled } : { key, value, enabled, file };

export function toRequest(d: Draft): HttpRequest {
  const { timeoutMs, followRedirects, insecureTls } = d.options;
  return {
    id: d.id,
    name: d.name,
    kind: "http",
    method: d.method,
    url: d.url,
    params: d.params.map(kv),
    headers: d.headers.map(kv),
    body: toBody(d),
    auth: d.auth,
    options: { timeoutMs, followRedirects, insecureTls },
  };
}

/** SSE não tem subprotocolos: a chave nem vai para o arquivo. */
export const toRealtime = (d: Draft): RealtimeRequest => ({
  id: d.id,
  name: d.name,
  kind: d.kind === "sse" ? "sse" : "ws",
  url: d.url,
  headers: d.headers.map(kv),
  ...(d.kind === "ws" && { protocols: d.protocols.map((p) => p.trim()).filter(Boolean) }),
});

/** Texto do arquivo da request. Só a request: resposta e log nunca vão para o disco. */
export const serialize = (d: Draft) => json(d.kind === "http" ? toRequest(d) : toRealtime(d));
export const isDirty = (tab: Tab) => serialize(tab) !== tab.saved;
export const activeTab = (s: { tabs: Tab[]; active: string }) =>
  s.tabs.find((t) => t.key === s.active) ?? s.tabs[0];
export const baseName = (path: string) => (path.split("/").pop() ?? path).replace(/\.json$/, "");

const newTab = (draft: Draft, path?: string): Tab => ({
  ...draft,
  key: crypto.randomUUID(),
  path,
  saved: serialize(draft),
  result: { state: "idle" },
});

const inflight = new Map<string, AbortController>();
const first = newTab(blank());

export const useRequest = create<RequestStore>()(
  persist(
    (setState, get) => {
      const patch = (key: string, p: Partial<Tab>) =>
        setState((s) => ({ tabs: s.tabs.map((t) => (t.key === key ? { ...t, ...p } : t)) }));
      const current = () => activeTab(get());

      return {
        tabs: [first],
        active: first.key,
        sends: 0,

        set: (p) => patch(current().key, p),
        setUrl: (url) =>
          patch(current().key, { url, params: paramsFromUrl(url, current().params) }),
        setParams: (params) =>
          patch(current().key, { params, url: urlWithParams(current().url, params) }),

        send: async () => {
          const tab = current();
          if (tab.kind !== "http" || tab.result.state === "sending" || !tab.url.trim()) return;
          const controller = new AbortController();
          inflight.set(tab.key, controller);
          patch(tab.key, { result: { state: "sending" } });
          try {
            // Variáveis e auth resolvidas aqui; o arquivo continua com os {{var}}.
            const { scope, parents } = await requestContext(tab.path);
            const req = prepare(toRequest(tab), scope.vars, parents);
            // Sem esquema, assume http:// (como o curl).
            if (!/^[a-z][\w+.-]*:\/\//i.test(req.url)) req.url = `http://${req.url}`;
            const res = await api("/send", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(req),
              signal: controller.signal,
            });
            patch(tab.key, { result: { state: "done", response: await res.json() } });
          } catch (err) {
            const { status, message } = err as Error & { status?: number };
            patch(tab.key, {
              result: controller.signal.aborted
                ? { state: "failed", reason: "cancelled", message: "Cancelada antes da resposta." }
                : { state: "failed", reason: status === 504 ? "timeout" : "error", message },
            });
          } finally {
            inflight.delete(tab.key);
            setState((s) => ({ sends: s.sends + 1 }));
          }
        },
        cancel: () => inflight.get(current().key)?.abort(),
        importCurl: (cmd) => {
          const { id: _, name: __, ...draft } = fromRequest(parseCurl(cmd));
          patch(current().key, draft);
        },
        exportCurl: async () => {
          const tab = current();
          const { scope, parents } = await requestContext(tab.path);
          return toCurl(prepare(toRequest(tab), scope.vars, parents));
        },

        open: (draft, path) => {
          const { tabs } = get();
          const existing = path && tabs.find((t) => t.path === path);
          if (existing) return setState({ active: existing.key });
          const tab = newTab(draft, path);
          // Uma aba "Nova request" intocada é substituída, como o preview de um editor.
          const only = tabs.length === 1 && !tabs[0].path && !isDirty(tabs[0]) && !tabs[0].url;
          setState({ tabs: only ? [tab] : [...tabs, tab], active: tab.key });
        },
        newTab: (kind) => {
          const tab = newTab(blank(kind));
          setState((s) => ({ tabs: [...s.tabs, tab], active: tab.key }));
        },
        activate: (key) => setState({ active: key }),
        close: (key) => {
          inflight.get(key)?.abort();
          useRealtime.getState().drop(key);
          const { tabs, active } = get();
          const index = tabs.findIndex((t) => t.key === key);
          const rest = tabs.filter((t) => t.key !== key);
          if (rest.length === 0) rest.push(newTab(blank()));
          const next = key === active ? rest[Math.min(index, rest.length - 1)].key : active;
          setState({ tabs: rest, active: next });
        },

        save: async (path) => {
          const tab = current();
          const target = path ?? tab.path;
          if (!target) return;
          const name = baseName(target);
          const text = serialize({ ...tab, name });
          await files.write(target, text);
          patch(tab.key, { path: target, name, saved: text });
          await useWorkspace.getState().load();
        },

        moved: (from, to) =>
          setState((s) => ({
            tabs: s.tabs.map((t) => {
              if (t.path === from) {
                const name = baseName(to);
                const saved = serialize({ ...fromRequest(JSON.parse(t.saved)), name });
                return { ...t, path: to, name, saved };
              }
              if (t.path?.startsWith(`${from}/`))
                return { ...t, path: to + t.path.slice(from.length) };
              return t;
            }),
          })),
        removed: (path) =>
          setState((s) => ({
            tabs: s.tabs.map((t) =>
              t.path === path || t.path?.startsWith(`${path}/`)
                ? { ...t, path: undefined, saved: "" }
                : t,
            ),
          })),
      };
    },
    {
      // Abas e rascunhos sobrevivem a recarregar a página e a reabrir o app. Respostas não.
      name: "patchbay.tabs",
      partialize: ({ tabs, active }) => ({
        tabs: tabs.map((t) => ({ ...t, result: { state: "idle" } as Result })),
        active,
      }),
      // Abas salvas antes da Fase 4 não têm kind: valem como "http".
      merge: (persisted, current) => {
        const p = persisted as Partial<RequestStore> | undefined;
        const tabs = p?.tabs?.map((t) => ({ ...t, kind: t.kind ?? "http" }));
        return { ...current, ...p, ...(tabs && { tabs }) };
      },
    },
  ),
);
