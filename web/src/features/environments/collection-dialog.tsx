// Configuração de uma coleção (pasta do topo) ou pasta: environments, variáveis da coleção,
// auth e headers herdados. Edita em memória; "Salvar" grava só os arquivos que mudaram.
// Segredos vão para <coleção>/.env.local.json (gitignored), nunca para os arquivos versionados.
import type { Auth, KV } from "@api/schemas";
import { useEffect, useState } from "react";
import { Tab, TabList, TabPanel, TabsRoot } from "@/components/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AuthEditor } from "@/features/request-editor/auth-editor";
import { KvTable } from "@/features/request-editor/kv-table";
import { files, json, useWorkspace } from "@/features/sidebar/store";
import {
  type Collection,
  environmentsOf,
  envPath,
  type Secrets,
  secretsPath,
  useEnvironments,
} from "./store";

type EnvDraft = { name: string; from?: string; vars: KV[]; secrets: KV[] };

const clean = (rows: KV[]) => rows.map(({ key, value, enabled }) => ({ key, value, enabled }));
const button =
  "label h-[34px] w-fit border border-mute px-3.5 text-[12px] hover:shadow-[inset_0_-2px_var(--ink)]";
const note = "text-[15px] text-mute";

function invalid(names: string[]) {
  for (const name of names) {
    if (!name) return "Todo environment precisa de nome.";
    if (/[/\\]/.test(name) || name.startsWith(".")) return `Nome inválido: “${name}”.`;
  }
  const dup = names.find((name, i) => names.indexOf(name) !== i);
  if (dup) return `Dois environments com o nome “${dup}”.`;
}

export function CollectionDialog() {
  const folder = useEnvironments((s) => s.editing);
  const [secrets, setSecrets] = useState<Secrets | null>(null);

  useEffect(() => {
    setSecrets(null);
    if (folder && !folder.includes("/"))
      useEnvironments.getState().loadSecrets(folder).then(setSecrets);
    else setSecrets({});
  }, [folder]);

  if (!folder || !secrets) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && useEnvironments.getState().edit(undefined)}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-4 p-[18px] sm:max-w-3xl">
        <Editor folder={folder} secrets={secrets} />
      </DialogContent>
    </Dialog>
  );
}

function Editor({ folder, secrets }: { folder: string; secrets: Secrets }) {
  const top = !folder.includes("/");
  const contents = useWorkspace((s) => s.contents);
  const colPath = `${folder}/collection.json`;
  const col = (contents[colPath] ?? {}) as Collection;
  const original = top ? environmentsOf(contents, folder) : [];

  const [envs, setEnvs] = useState<EnvDraft[]>(() =>
    original.map(({ name, env }) => ({
      name,
      from: name,
      vars: Array.isArray(env?.vars) ? env.vars : [],
      secrets: secrets[name] ?? [],
    })),
  );
  const [selected, setSelected] = useState(0);
  const [vars, setVars] = useState<KV[]>(Array.isArray(col.vars) ? col.vars : []);
  const [headers, setHeaders] = useState<KV[]>(Array.isArray(col.headers) ? col.headers : []);
  const [auth, setAuth] = useState<Auth>(col.auth ?? { type: top ? "none" : "inherit" });
  const [error, setError] = useState("");
  const env = envs[selected];
  const patchEnv = (patch: Partial<EnvDraft>) =>
    setEnvs(envs.map((e, i) => (i === selected ? { ...e, ...patch } : e)));

  const addEnv = () => {
    let name = "novo";
    for (let n = 2; envs.some((e) => e.name === name); n++) name = `novo ${n}`;
    setEnvs([...envs, { name, vars: [{ key: "baseUrl", value: "", enabled: true }], secrets: [] }]);
    setSelected(envs.length);
  };

  const save = async () => {
    const names = envs.map((e) => e.name.trim());
    const problem = invalid(names);
    if (problem) return setError(problem);
    const drafts = envs.map((e, i) => ({ ...e, name: names[i] }));

    // collection.json: chaves existentes ficam onde estão; as novas entram em ordem fixa.
    const next: Collection = {
      ...col,
      name: col.name ?? folder.split("/").pop(),
      auth,
      headers: clean(headers),
    };
    if (top) next.vars = clean(vars);
    const untouched = !(colPath in contents) && auth.type === "inherit" && !headers.length;
    if (!untouched && json(next) !== json(contents[colPath]))
      await files.write(colPath, json(next));

    for (const { name } of original)
      if (!drafts.some((d) => d.from === name && d.name === name))
        await files.remove(envPath(folder, name)); // vai para .trash/
    for (const d of drafts) {
      const path = envPath(folder, d.name);
      const text = json({ name: d.name, vars: clean(d.vars) });
      if (d.from !== d.name || json(contents[path]) !== text) await files.write(path, text);
    }

    const local = Object.fromEntries(
      drafts.filter((d) => d.secrets.length).map((d) => [d.name, clean(d.secrets)]),
    );
    if (top && json(local) !== json(secrets)) await files.write(secretsPath(folder), json(local));

    const store = useEnvironments.getState();
    const active = store.active[folder];
    const kept = drafts.find((d) => d.from === active);
    if (active && !drafts.some((d) => d.name === active)) store.select(folder, kept?.name);
    useEnvironments.setState((s) => ({ secrets: { ...s.secrets, [folder]: local } }));
    await useWorkspace.getState().load();
    store.edit(undefined);
  };

  return (
    <>
      <div>
        <DialogTitle>
          {top ? `Coleção ${folder}` : `Pasta ${folder.split("/").join(" / ")}`}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Environments, variáveis, auth e headers herdados pelas requests
        </DialogDescription>
      </div>
      <form
        className="flex min-h-0 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save().catch((err) => setError((err as Error).message));
        }}
      >
        <TabsRoot
          defaultValue={top ? "environments" : "auth"}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabList aria-label="Configuração" className="px-0">
            {top && <Tab value="environments">Environments {envs.length || ""}</Tab>}
            {top && <Tab value="vars">Variáveis</Tab>}
            <Tab value="auth">Auth</Tab>
            <Tab value="headers">Headers</Tab>
          </TabList>

          {top && (
            <TabPanel
              value="environments"
              className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 px-0"
            >
              <div className="grid content-start gap-2">
                <ul aria-label="Environments">
                  {envs.map((e, i) => (
                    <li key={e.from ?? `novo-${i}`}>
                      <button
                        type="button"
                        aria-current={i === selected ? "true" : undefined}
                        onClick={() => setSelected(i)}
                        className="label w-full truncate px-2.5 py-1.5 text-left text-[12px] outline-offset-[-2px] aria-[current=true]:bg-ink aria-[current=true]:text-bg"
                      >
                        {e.name || "sem nome"}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={addEnv} className={button}>
                  + Environment
                </button>
              </div>
              {env ? (
                <div className="grid content-start gap-4">
                  <label className="grid gap-1.5">
                    <span className="label text-[12px] text-mute">
                      Nome (dev, local, staging, prod têm cor)
                    </span>
                    <input
                      value={env.name}
                      spellCheck={false}
                      onChange={(e) => patchEnv({ name: e.target.value })}
                      className="border border-line bg-bg px-2.5 py-1.5 font-mono text-[14px] text-ink outline-offset-[-2px]"
                    />
                  </label>
                  <section className="grid gap-1.5">
                    <h3 className="label text-[12px] text-mute">Variáveis</h3>
                    <KvTable
                      label="Variáveis do environment"
                      rows={env.vars}
                      onChange={(vars) => patchEnv({ vars })}
                    />
                  </section>
                  <section className="grid gap-1.5">
                    <h3 className="label text-[12px] text-mute">Segredos</h3>
                    <p className={note}>
                      Só nesta máquina, em{" "}
                      <code className="font-mono text-[13px] text-ink">{secretsPath(folder)}</code>{" "}
                      (fora do git). Ganham das variáveis com o mesmo nome.
                    </p>
                    <KvTable
                      label="Segredos do environment"
                      rows={env.secrets}
                      onChange={(secrets) => patchEnv({ secrets })}
                    />
                  </section>
                  <button
                    type="button"
                    onClick={() => {
                      setEnvs(envs.filter((_, i) => i !== selected));
                      setSelected(Math.max(0, selected - 1));
                    }}
                    className={button}
                  >
                    Remover {env.name}
                  </button>
                </div>
              ) : (
                <p className={note}>
                  Nenhum environment. Crie um (dev, prod…) com variáveis como baseUrl.
                </p>
              )}
            </TabPanel>
          )}
          {top && (
            <TabPanel value="vars" className="grid content-start gap-3 px-0">
              <p className={note}>
                Valem em todo environment; o environment ativo e os segredos ganham destas.
              </p>
              <KvTable label="Variáveis da coleção" rows={vars} onChange={setVars} />
            </TabPanel>
          )}
          <TabPanel value="auth" className="px-0">
            <AuthEditor auth={auth} onChange={setAuth} inheritable={!top} />
          </TabPanel>
          <TabPanel value="headers" className="grid content-start gap-3 px-0">
            <p className={note}>
              Enviados por toda request {top ? "da coleção" : "desta pasta"}, a menos que a request
              (ou uma pasta mais próxima) defina um header com o mesmo nome.
            </p>
            <KvTable label="Headers herdados" rows={headers} onChange={setHeaders} />
          </TabPanel>
        </TabsRoot>

        {error && (
          <p role="alert" className="font-mono text-[13px] text-prod-text">
            {error}
          </p>
        )}
        <button type="submit" className={button}>
          Salvar
        </button>
      </form>
    </>
  );
}
