// GraphQL: introspection pelo /send (mesma URL, headers e auth do envio), schema em memória por
// URL, e autocomplete, lint e docs no hover no editor da query (cm6-graphql). Servidor com
// introspection desligada: o editor continua funcionando, só sem schema.
import type { HttpResponse } from "@api/schemas";
import { autocompletion } from "@codemirror/autocomplete";
import { hoverTooltip } from "@codemirror/view";
import { getSchema, graphql, offsetToPos } from "cm6-graphql";
import {
  buildClientSchema,
  type GraphQLSchema,
  getIntrospectionQuery,
  type IntrospectionQuery,
} from "graphql";
import { getHoverInformation } from "graphql-language-service";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { CodeEditor } from "@/components/code-editor";
import { CommandItem } from "@/components/ui/command";
import { requestContext, type Scope } from "@/features/environments/store";
import { api } from "@/lib/api-client";
import { effectiveAuth, interpolate, prepare } from "@/lib/interpolate";
import { ensureAuth } from "@/lib/oauth";
import { activeTab, type Tab, toRequest, useRequest, where } from "./store";

type Entry = { schema?: GraphQLSchema; error?: string; loading?: boolean };
/** URL resolvida → schema. Some ao fechar o app. */
export const useSchemas = create<{ byUrl: Record<string, Entry> }>(() => ({ byUrl: {} }));

const put = (url: string, entry: Entry) =>
  useSchemas.setState((s) => ({ byUrl: { ...s.byUrl, [url]: entry } }));

/** Resposta da introspection → schema, ou um erro que diz o porquê. */
export function schemaFrom(res: HttpResponse): GraphQLSchema {
  let json: { data?: IntrospectionQuery; errors?: { message?: string }[] } | undefined;
  try {
    json = JSON.parse(res.body);
  } catch {
    // não é JSON: cai no erro abaixo
  }
  if (json?.data?.__schema) return buildClientSchema(json.data);
  const reason = json?.errors?.[0]?.message ?? `HTTP ${res.status} sem __schema na resposta`;
  throw new Error(`Introspection indisponível: ${reason}`);
}

/** Roda a introspection da aba e guarda o schema pela URL resolvida. */
export async function introspect(tab: Tab) {
  const { scope, parents } = await requestContext(where(tab));
  const url = interpolate(tab.url, scope.vars);
  if (!url.trim()) return;
  put(url, { ...useSchemas.getState().byUrl[url], loading: true });
  try {
    await ensureAuth(effectiveAuth(tab.auth, parents), (t) => interpolate(t, scope.vars));
    const body = { type: "graphql" as const, query: getIntrospectionQuery(), variables: "" };
    const req = prepare({ ...toRequest(tab), method: "POST", body }, scope.vars, parents);
    if (!/^[a-z][\w+.-]*:\/\//i.test(req.url)) req.url = `http://${req.url}`;
    const res = await api("/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...req, history: false }),
    });
    put(url, { schema: schemaFrom(await res.json()) });
  } catch (err) {
    put(url, { error: (err as Error).message });
  }
}

export const refreshSchema = () => introspect(activeTab(useRequest.getState()));

/** Docs do campo/tipo sob o mouse, do schema carregado. */
const hover = hoverTooltip((view, pos) => {
  const schema = getSchema(view.state);
  if (!schema) return null;
  const doc = view.state.doc;
  const info = getHoverInformation(schema, doc.toString(), offsetToPos(doc, pos));
  const text = [info]
    .flat()
    .map((part) => (typeof part === "string" ? part : part.value))
    .join("\n")
    .trim();
  if (!text) return null;
  return {
    pos,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "cm-gql-info";
      dom.textContent = text;
      return { dom };
    },
  };
});

export function GraphqlQuery(props: { scope: Scope }) {
  const r = useRequest(activeTab);
  const set = useRequest((s) => s.set);
  const url = interpolate(r.url, props.scope.vars);
  const entry = useSchemas((s) => s.byUrl[url]);
  const extensions = useMemo(
    () => [graphql(entry?.schema), autocompletion(), hover],
    [entry?.schema],
  );

  // Primeira vez nesta URL: busca o schema sozinho. Depois só pelo botão ou pela palette.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao abrir o editor; digitar a URL não dispara introspection
  useEffect(() => {
    if (url.trim() && !useSchemas.getState().byUrl[url]) introspect(r);
  }, []);

  return (
    <>
      <div className="min-h-40 flex-1 border border-line">
        <CodeEditor
          label="Query GraphQL"
          value={r.bodyContent}
          onChange={(bodyContent) => set({ bodyContent })}
          scope={props.scope}
          extensions={extensions}
        />
      </div>
      <p role="status" className="flex flex-wrap items-baseline gap-x-2.5 text-[15px] text-mute">
        {entry?.loading
          ? "Buscando schema…"
          : entry?.schema
            ? "Schema carregado: autocomplete (Ctrl Espaço), validação e docs no hover."
            : entry?.error
              ? `${entry.error.replace(/\.$/, "")}. Sem autocomplete.`
              : "Sem schema."}
        <button
          type="button"
          disabled={entry?.loading || !url.trim()}
          onClick={() => introspect(r)}
          className="text-ink underline decoration-dashed underline-offset-4 hover:decoration-solid disabled:text-mute disabled:no-underline"
        >
          Atualizar schema
        </button>
      </p>
    </>
  );
}

/** Itens da command palette (aba HTTP com body GraphQL). */
export function GraphqlCommands(props: { run: (action: () => void) => () => void }) {
  const graphqlTab = useRequest((s) => {
    const tab = activeTab(s);
    return tab.kind === "http" && tab.bodyType === "graphql";
  });
  if (!graphqlTab) return null;
  return <CommandItem onSelect={props.run(refreshSchema)}>GraphQL: atualizar schema</CommandItem>;
}
