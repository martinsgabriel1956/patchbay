// Fita de environment na barra superior (DESIGN.md › Fita de environment): cor pelo nome, texto
// fosco, corte nas pontas. A fita é o seletor: clique (ou Ctrl E) troca o environment.
import { DropdownMenu } from "radix-ui";
import { useEffect } from "react";
import { activeTab, useRequest, where } from "@/features/request-editor/store";
import { useWorkspace } from "@/features/sidebar/store";
import { mod } from "@/lib/utils";
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
  const path = useRequest((s) => where(activeTab(s)));
  const contents = useWorkspace((s) => s.contents);
  const { collection, env, scope } = useRequestContext(path);
  const envs = collection ? environmentsOf(contents, collection) : [];
  return { path, collection, env, scope, envs };
}

export function EnvBar() {
  const { path, collection, env, scope, envs } = useCurrentEnvironments();
  const { select, edit, loadSecrets } = useEnvironments.getState();
  const picking = useEnvironments((s) => s.picking ?? false);

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
  const vars = Object.keys(scope.vars).length;
  const pick = (name: string) => {
    useEnvironments.setState({ last: collection });
    select(collection, name || undefined);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className="label max-w-40 min-w-0 shrink truncate text-[12px] text-mute max-[900px]:hidden"
        title={`Coleção ${collection}`}
      >
        {collection}
      </span>
      <span role="status" className="sr-only">
        Environment {current?.name ?? "nenhum"}
      </span>
      {envs.length === 0 ? (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] text-mute max-[1100px]:invisible">
            Nenhum environment.
          </span>
          <button
            type="button"
            onClick={() => edit(collection)}
            className="label shrink-0 px-2 py-1 text-[12px] outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)]"
          >
            + Environment
          </button>
        </>
      ) : (
        // A fita é o seletor: um environment dito uma vez só, no lugar onde ele já aparece.
        <DropdownMenu.Root
          modal={false}
          open={picking}
          onOpenChange={(open) => useEnvironments.setState({ picking: open })}
        >
          <DropdownMenu.Trigger
            id="env-select"
            aria-label={`Environment ${current?.name ?? "nenhum"}. Trocar (${mod("E")})`}
            title={`Trocar environment (clique ou ${mod("E")})`}
            className="flex h-9 min-w-0 flex-1 text-left focus-visible:outline-offset-2"
          >
            {current ? (
              <span
                className={`flex size-full min-w-0 items-center gap-4 px-[18px] text-matte [clip-path:var(--cut)] ${tone(current.name)}`}
              >
                <span className="label shrink-0 text-[19px]">{current.name}</span>
                {base && <span className="min-w-0 truncate font-mono text-[13px]">{base}</span>}
                <span className="ml-auto shrink-0 font-mono text-[12px] tabular-nums">
                  {vars === 1 ? "1 variável" : `${vars} variáveis`}
                </span>
              </span>
            ) : (
              <span className="flex size-full min-w-0 items-center gap-4 border border-mute px-[18px] text-mute hover:text-ink">
                <span className="label shrink-0 text-[15px]">sem environment</span>
                <span className="min-w-0 truncate text-[13px] max-[1100px]:hidden">
                  só as variáveis da coleção
                </span>
                <span className="ml-auto shrink-0 font-mono text-[12px]">{mod("E")}</span>
              </span>
            )}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-60 border border-line bg-bg py-1 text-ink"
            >
              <DropdownMenu.Label className="label px-3.5 py-1.5 text-[12px] text-mute">
                Environment de {collection}
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={env ?? ""} onValueChange={pick}>
                {[{ name: "" }, ...envs].map((e) => (
                  <DropdownMenu.RadioItem
                    key={e.name}
                    value={e.name}
                    className="label flex cursor-default items-center gap-3 px-3.5 py-1.5 text-[12px] outline-none data-highlighted:bg-ink data-highlighted:text-bg"
                  >
                    <span
                      className={`size-[9px] shrink-0 ${e.name ? tone(e.name) : "border border-mute"}`}
                    />
                    {e.name || "nenhum"}
                    <DropdownMenu.ItemIndicator className="ml-auto font-mono font-normal tracking-normal normal-case">
                      atual
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                onSelect={() => edit(collection)}
                className="label flex cursor-default items-center px-3.5 py-1.5 text-[12px] outline-none data-highlighted:bg-ink data-highlighted:text-bg"
              >
                Editar environments…
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}
