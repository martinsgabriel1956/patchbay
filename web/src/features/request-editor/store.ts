import type {
  Assert,
  Auth,
  Body,
  HttpRequest,
  HttpResponse,
  KV,
  RealtimeRequest,
} from "@api/schemas";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { jarKey, requestContext, useEnvironments } from "@/features/environments/store";
import { useRealtime } from "@/features/realtime/store";
import { channelOf, files, json, nextChannel, useWorkspace } from "@/features/sidebar/store";
import { api } from "@/lib/api-client";
import { parseCurl, toCurl } from "@/lib/curl";
import { prepare, unresolved } from "@/lib/interpolate";
import { focusUrl } from "@/lib/utils";
import { paramsFromUrl, urlWithParams } from "./query";

export type BodyType = Body["type"];
export type Field = KV & { file?: string };
export type Result =
  | { state: "idle" }
  | { state: "sending" }
  /** Não enviada: sobrou `{{var}}` sem valor ("Enviar mesmo assim" usa send(true)) ou, com
   *  `missing` vazio, faltou a URL. */
  | { state: "blocked"; missing: string[] }
  | { state: "done"; response: HttpResponse }
  | { state: "failed"; reason: "cancelled" | "timeout" | "error"; message: string };

export type Draft = {
  id: string;
  name: string;
  /** Número fixo do canal; só existe depois de salvo no workspace. */
  channel?: number;
  /** Abas salvas antes da Fase 4 não têm kind: o merge do persist completa com "http".
   *  "webhook": inspetor de webhooks, só em aba (não vai para o disco). */
  kind: "http" | "ws" | "sse" | "webhook";
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
  /** Só http. Abas salvas antes dos asserts não têm. */
  asserts?: Assert[];
};

/** Resposta recebida nesta sessão, para comparar (Comparar com…). Só em memória. */
export type Past = { at: string; url: string; response: HttpResponse };

/** Aba aberta: o draft em edição, de onde veio no disco e o texto da última gravação. */
export type Tab = Draft & {
  key: string;
  path?: string;
  /** Cópia aberta do histórico: o arquivo de onde veio, para herdar coleção, environment e
   *  auth dele (e não da última coleção visitada). */
  origin?: string;
  saved: string;
  result: Result;
  /** O arquivo mudou no disco (fora do app) com alterações não salvas na aba: o usuário escolhe. */
  changedOnDisk?: boolean;
  /** Últimas respostas da aba, a mais nova (a da tela) primeiro. Nunca vão para o disco. */
  past?: Past[];
};

/** O arquivo que define o contexto da aba (variáveis, auth herdada, pasta para salvar). */
export const where = (tab: { path?: string; origin?: string }) => tab.path ?? tab.origin;

type RequestStore = {
  tabs: Tab[];
  active: string;
  /** Conta envios terminados; o histórico recarrega quando muda. */
  sends: number;
  /** Diálogo "Comparar com…" aberto (resposta da aba ativa). */
  comparing: boolean;
  set: (patch: Partial<Draft>) => void;
  setUrl: (url: string) => void;
  setParams: (params: KV[]) => void;
  /** force: envia mesmo com `{{var}}` sem valor. */
  send: (force?: boolean) => Promise<void>;
  cancel: () => void;
  /** Comando curl → aba ativa (método, URL, headers, body, auth, opções); nome e arquivo ficam. */
  importCurl: (cmd: string) => void;
  /** A aba ativa resolvida (vars, auth em header) como comando curl. */
  exportCurl: () => Promise<string>;
  open: (draft: Draft, path?: string, origin?: string) => void;
  newTab: (kind?: Draft["kind"]) => void;
  activate: (key: string) => void;
  close: (key: string) => void;
  /** Ctrl Shift T: reabre a última aba fechada (rascunho incluso), nesta sessão. */
  reopen: () => void;
  save: (path?: string) => Promise<void>;
  /** O arquivo (ou pasta) `from` virou `to` no disco. */
  moved: (from: string, to: string) => void;
  /** O arquivo (ou pasta) foi para a lixeira: as abas ficam abertas, sem path e não salvas. */
  removed: (path: string) => void;
  /** Algo mudou no disco (git pull, editor): confere toda aba com arquivo. Limpa recarrega
   *  calada; com alteração, fica marcada; apagado vira como o removed. */
  diskChanged: () => Promise<void>;
  /** Aba marcada: troca as alterações pelo que está no disco, ou fica com elas. */
  reload: (key: string) => Promise<void>;
  keep: (key: string) => void;
};

const blank = (kind: Draft["kind"] = "http"): Draft => ({
  id: crypto.randomUUID(),
  name: { http: "Nova request", ws: "Novo WebSocket", sse: "Novo SSE", webhook: "Webhook" }[kind],
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
  asserts: [],
});

type AnyRequest = Partial<Omit<HttpRequest, "kind">> & Partial<Omit<RealtimeRequest, "kind">>;

/** Request do disco ou do histórico → draft. Tolerante a campos faltando (arquivo editado à mão). */
export function fromRequest(r: AnyRequest & { kind?: string }): Draft {
  const d = blank(r.kind === "ws" || r.kind === "sse" ? r.kind : "http");
  const body = r.body ?? { type: "none" };
  return {
    id: r.id ?? d.id,
    name: r.name ?? d.name,
    channel: r.channel,
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
    asserts: r.asserts ?? [],
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
    channel: d.channel,
    kind: "http",
    method: d.method,
    url: d.url,
    params: d.params.map(kv),
    headers: d.headers.map(kv),
    body: toBody(d),
    auth: d.auth,
    options: { timeoutMs, followRedirects, insecureTls },
    // Sem asserts, a chave nem vai para o arquivo (arquivos antigos não mudam ao salvar).
    ...(d.asserts?.length
      ? {
          asserts: d.asserts.map(({ enabled, target, path, op, expected }) => ({
            enabled,
            target,
            path,
            op,
            expected,
          })),
        }
      : {}),
  };
}

/** SSE não tem subprotocolos: a chave nem vai para o arquivo. */
export const toRealtime = (d: Draft): RealtimeRequest => ({
  id: d.id,
  name: d.name,
  channel: d.channel,
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

/** O arquivo como draft; null se o JSON não vale (editado pela metade, conflito de merge). */
const readDraft = async (path: string) => {
  const text = await files.read(path);
  try {
    return fromRequest(JSON.parse(text));
  } catch {
    return null;
  }
};

const inflight = new Map<string, AbortController>();
/** Abas fechadas nesta sessão, a última no fim (Ctrl Shift T). */
const closed: Tab[] = [];
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
        comparing: false,

        set: (p) => patch(current().key, p),
        setUrl: (url) =>
          patch(current().key, { url, params: paramsFromUrl(url, current().params) }),
        setParams: (params) =>
          patch(current().key, { params, url: urlWithParams(current().url, params) }),

        send: async (force = false) => {
          const tab = current();
          if (tab.kind !== "http" || tab.result.state === "sending") return;
          if (!tab.url.trim()) {
            patch(tab.key, { result: { state: "blocked", missing: [] } });
            return focusUrl();
          }
          // Variáveis e auth resolvidas aqui; o arquivo continua com os {{var}}.
          let req: HttpRequest;
          let jar: string;
          try {
            const { collection, env, scope, parents } = await requestContext(where(tab));
            req = prepare(toRequest(tab), scope.vars, parents);
            jar = jarKey(collection, env);
          } catch (err) {
            const message = (err as Error).message;
            patch(tab.key, { result: { state: "failed", reason: "error", message } });
            return;
          }
          const missing = unresolved(req);
          if (missing.length && !force) {
            patch(tab.key, { result: { state: "blocked", missing } });
            return;
          }
          const controller = new AbortController();
          inflight.set(tab.key, controller);
          patch(tab.key, { result: { state: "sending" } });
          try {
            // Sem esquema, assume http:// (como o curl).
            if (!/^[a-z][\w+.-]*:\/\//i.test(req.url)) req.url = `http://${req.url}`;
            const res = await api("/send", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...req, jar }),
              signal: controller.signal,
            });
            const response: HttpResponse = await res.json();
            // ponytail: até 5 por aba (body de até 5 MB cada); um limite global se pesar.
            const past = [
              { at: new Date().toISOString(), url: req.url, response },
              ...(tab.past ?? []),
            ];
            patch(tab.key, { result: { state: "done", response }, past: past.slice(0, 5) });
            // Salva: vira `{{nome.res.…}}` para as outras requests da coleção.
            const { path } = tab;
            if (path)
              useEnvironments.setState((s) => ({
                responses: { ...s.responses, [path]: response },
              }));
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
          const { scope, parents } = await requestContext(where(tab));
          return toCurl(prepare(toRequest(tab), scope.vars, parents));
        },

        open: (draft, path, origin) => {
          const { tabs } = get();
          const existing = path && tabs.find((t) => t.path === path);
          if (existing) return setState({ active: existing.key });
          const tab = { ...newTab(draft, path), origin };
          // Uma aba "Nova request" intocada é substituída, como o preview de um editor.
          const only = tabs.length === 1 && !tabs[0].path && !isDirty(tabs[0]) && !tabs[0].url;
          setState({ tabs: only ? [tab] : [...tabs, tab], active: tab.key });
        },
        newTab: (kind) => {
          const tab = newTab(blank(kind));
          setState((s) => ({ tabs: [...s.tabs, tab], active: tab.key }));
        },
        activate: (key) => setState({ active: key }),
        reopen: () => {
          const tab = closed.pop();
          if (!tab) return;
          const existing = tab.path && get().tabs.find((t) => t.path === tab.path);
          if (existing) return setState({ active: existing.key });
          setState((s) => ({ tabs: [...s.tabs, tab], active: tab.key }));
        },
        close: (key) => {
          inflight.get(key)?.abort();
          useRealtime.getState().drop(key);
          const { tabs, active } = get();
          const index = tabs.findIndex((t) => t.key === key);
          const tab = tabs[index];
          // Aba vazia e intocada não vale reabrir.
          if (tab && (tab.path || tab.url || isDirty(tab)))
            closed.push({ ...tab, result: { state: "idle" } });
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
          // Mesmo arquivo: o número fica (migrado com a aba aberta, vem do disco). Arquivo novo
          // (aba nova, cópia do histórico) ganha número e id próprios: nunca os da origem.
          const { contents } = useWorkspace.getState();
          const same = target === tab.path;
          const channel = same
            ? (tab.channel ?? channelOf(contents[target]) ?? nextChannel(contents))
            : nextChannel(contents);
          const id = same ? tab.id : crypto.randomUUID();
          const text = serialize({ ...tab, id, name, channel });
          await files.write(target, text);
          patch(tab.key, {
            path: target,
            id,
            name,
            channel,
            saved: text,
            changedOnDisk: undefined,
          });
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
                ? { ...t, path: undefined, saved: "", changedOnDisk: undefined }
                : t,
            ),
          })),

        // Todas, não só os paths do aviso: um rename (temp → arquivo) pode chegar só com o temp.
        diskChanged: async () => {
          for (const { key, path } of get().tabs) {
            if (!path) continue;
            const draft = await readDraft(path).catch((err: { status?: number }) =>
              err.status === 404 ? ("gone" as const) : undefined,
            );
            const tab = get().tabs.find((t) => t.key === key);
            // api fora, ou a aba fechou/mudou de arquivo enquanto lia.
            if (draft === undefined || tab?.path !== path) continue;
            if (draft === "gone") {
              get().removed(path);
              useWorkspace.setState({ notice: `${baseName(path)} foi apagado do disco` });
              continue;
            }
            const text = draft && serialize(draft);
            if (text === tab.saved) continue; // o que a aba já tem (inclui a própria gravação)
            if (draft && !isDirty(tab)) patch(key, { ...draft, saved: serialize(draft) });
            else patch(key, { changedOnDisk: true });
          }
        },
        reload: async (key) => {
          const path = get().tabs.find((t) => t.key === key)?.path;
          if (!path) return;
          const draft = await readDraft(path);
          if (!draft) throw new Error(`JSON inválido em ${path}: corrija o arquivo à mão.`);
          patch(key, { ...draft, saved: serialize(draft), changedOnDisk: undefined });
        },
        keep: (key) => patch(key, { changedOnDisk: undefined }),
      };
    },
    {
      // Abas e rascunhos sobrevivem a recarregar a página e a reabrir o app. Respostas não.
      name: "patchbay.tabs",
      partialize: ({ tabs, active }) => ({
        tabs: tabs.map((t) => ({ ...t, result: { state: "idle" } as Result, past: undefined })),
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
