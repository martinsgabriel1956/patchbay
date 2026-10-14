// Fita de environment na barra superior (DESIGN.md › Fita de environment): cor pelo nome, texto
// fosco, corte nas pontas. Os environments da coleção atual ficam ao lado: um clique troca.
import { useEffect } from "react";
import { activeTab, useRequest } from "@/features/request-editor/store";
import { useWorkspace } from "@/features/sidebar/store";
import { collectionOf, environmentsOf, useEnvironments, useRequestContext } from "./store";

// Cor é código: só os quatro nomes do DESIGN.md (e apelidos óbvios) têm cor; o resto é apoio.
const TONES: [RegExp, string][] = [
  [/^(dev|development|desenv)/i, "bg-dev"],
  [/^local/i, "bg-local"],
  [/^(stag|stage|hml|homolog)/i, "bg-staging"],
  [/^(prod|production|produção|producao)/i, "bg-prod"],
];
const tone = (name: string) => TONES.find(([re]) => re.test(name))?.[1] ?? "bg-dim";

/** Coleção e environments da aba ativa (barra superior e command palette). */
export function useCurrentEnvironments() {
  const path = useRequest((s) => activeTab(s).path);
  const contents = useWorkspace((s) => s.contents);
  const { collection, env, scope } = useRequestContext(path);
  const envs = collection ? environmentsOf(contents, collection) : [];
  return { path, collection, env, scope, envs };
}

export function EnvBar() {
  const { path, collection, env, scope, envs } = useCurrentEnvironments();
  const { select, edit, loadSecrets } = useEnvironments.getState();

  useEffect(() => {
    const own = collectionOf(path);
    if (own) useEnvironments.setState({ last: own });
  }, [path]);
  useEffect(() => {
    if (collection) loadSecrets(collection);
  }, [collection, loadSecrets]);

  if (!collection) return <div className="flex-1" />;
  const current = envs.find((e) => e.name === env);
  const base = scope.display.baseUrl ?? scope.display.base_url ?? scope.display.base;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="label max-w-40 shrink-0 truncate text-[12px] text-mute" title="Coleção">
        {collection}
      </span>
      {envs.length > 0 && (
        <fieldset className="flex shrink-0 border border-mute">
          <legend className="sr-only">Environment ativo</legend>
          {[{ name: "" }, ...envs].map((e) => (
            <button
              key={e.name}
              type="button"
              aria-pressed={(env ?? "") === e.name}
              title={e.name ? `Environment ${e.name}` : "Sem environment"}
              onClick={() => {
                useEnvironments.setState({ last: collection });
                select(collection, e.name || undefined);
              }}
              className="label h-[34px] px-3 text-[12px] focus-visible:outline-offset-2 aria-pressed:bg-ink aria-pressed:text-bg aria-[pressed=false]:hover:shadow-[inset_0_-2px_var(--ink)]"
            >
              {e.name || "—"}
            </button>
          ))}
        </fieldset>
      )}
      {current ? (
        <div
          className={`flex h-9 min-w-0 flex-1 items-center gap-4 px-[18px] text-matte [clip-path:var(--cut)] ${tone(current.name)}`}
        >
          <span className="label shrink-0 text-[19px]">{current.name}</span>
          {base && <span className="min-w-0 truncate font-mono text-[13px]">{base}</span>}
          <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums">
            {Object.keys(scope.vars).length} vars
          </span>
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13px] text-mute">
          {envs.length ? "Sem environment: só as variáveis da coleção." : "Nenhum environment."}
        </span>
      )}
      <button
        type="button"
        onClick={() => edit(collection)}
        className="label shrink-0 px-2 py-1 text-[12px] outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)]"
      >
        {envs.length ? "Environments" : "+ Environment"}
      </button>
    </div>
  );
}
