// Environments e variáveis (PLANNING §8, Fase 3). Tudo vem do disco:
//   <coleção>/collection.json         { name, auth?, headers?, vars? } (pastas: { name, auth?, headers? })
//   <coleção>/environments/<nome>.json { name, vars }
//   <coleção>/.env.local.json          { "<environment>": KV[] }  segredos, gitignored
// Coleção = pasta do primeiro nível. Aqui só fica o environment ativo de cada coleção (localStorage)
// e o cache dos segredos e das últimas respostas (memória, nunca localStorage).
import type { Auth, Environment, HttpResponse, KV, TreeEntry } from "@api/schemas";
import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { files, useWorkspace } from "@/features/sidebar/store";
import { api } from "@/lib/api-client";
import { type Parent, responseVars, type Vars, varsFrom } from "@/lib/interpolate";

export type Collection = { name?: string; auth?: Auth; headers?: KV[]; vars?: KV[] };
export type Secrets = Record<string, KV[]>;
/** Variáveis resolvidas e a versão para mostrar na tela (segredos mascarados). */
export type Scope = { vars: Vars; display: Vars };

type EnvStore = {
  /** coleção → environment ativo */
  active: Record<string, string>;
  /** Última coleção usada: vale para abas ainda não salvas. */
  last?: string;
  secrets: Record<string, Secrets>;
  /** arquivo da request → última resposta (`{{nome.res.…}}`). Some ao fechar o app. */
  responses: Record<string, HttpResponse>;
  /** Pasta cujo diálogo de configuração está aberto. */
  editing?: string;
  /** Menu de environments da fita aberto (clique na fita, "Escolher environment"). */
  picking?: boolean;
  edit: (folder?: string) => void;
  select: (collection: string, env?: string) => void;
  loadSecrets: (collection: string) => Promise<Secrets>;
};

export const secretsPath = (collection: string) => `${collection}/.env.local.json`;
export const envPath = (collection: string, env: string) =>
  `${collection}/environments/${env}.json`;

export const useEnvironments = create<EnvStore>()(
  persist(
    (set, get) => ({
      active: {},
      secrets: {},
      responses: {},
      edit: (editing) => set({ editing }),
      select: (collection, env) =>
        set((s) => {
          const { [collection]: _, ...rest } = s.active;
          return { active: env ? { ...rest, [collection]: env } : rest };
        }),
      loadSecrets: async (collection) => {
        const cached = get().secrets[collection];
        if (cached) return cached;
        let secrets: Secrets = {};
        try {
          secrets = JSON.parse(await files.read(secretsPath(collection)));
        } catch (err) {
          // Sem arquivo = sem segredos. JSON inválido aparece como erro, sem sobrescrever nada.
          if ((err as { status?: number }).status !== 404)
            useWorkspace.setState({
              error: `${secretsPath(collection)}: ${(err as Error).message}`,
            });
        }
        set((s) => ({ secrets: { ...s.secrets, [collection]: secrets } }));
        return secrets;
      },
    }),
    { name: "patchbay.environments", partialize: ({ active, last }) => ({ active, last }) },
  ),
);

/** Cookie jar na api (só em memória): um por coleção + environment; "nenhum" é um jar à parte. */
export const jarKey = (collection?: string, env?: string) => `${collection ?? ""}/${env ?? ""}`;
export const cookiesPath = (collection?: string, env?: string) =>
  `/cookies?jar=${encodeURIComponent(jarKey(collection, env))}`;
export const clearCookies = (collection?: string, env?: string) =>
  api(cookiesPath(collection, env), { method: "DELETE" }).catch((err) =>
    useWorkspace.setState({ error: `Limpar cookies: ${(err as Error).message}` }),
  );

export const collectionOf = (path?: string) =>
  path?.includes("/") ? path.split("/")[0] : undefined;

/** Coleção da request; aba não salva usa a última coleção usada (ou a primeira que existir). */
function pickCollection(path: string | undefined, last: string | undefined, tree: TreeEntry[]) {
  const dirs = tree.filter((e) => e.type === "dir").map((e) => e.name);
  return collectionOf(path) ?? (last && dirs.includes(last) ? last : dirs[0]);
}

const object = <T>(value: unknown) =>
  (value && typeof value === "object" ? value : undefined) as T | undefined;

/** Environments da coleção, pelo nome do arquivo. */
export function environmentsOf(contents: Record<string, unknown>, collection: string) {
  const prefix = `${collection}/environments/`;
  return Object.keys(contents)
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .map((p) => ({
      name: p.slice(prefix.length, -".json".length),
      env: object<Environment>(contents[p]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type Context = {
  collection?: string;
  env?: string;
  scope: Scope;
  parents: (Parent & { folder: string })[];
};

function context(
  path: string | undefined,
  collection: string | undefined,
  contents: Record<string, unknown>,
  active: Record<string, string>,
  secrets: Record<string, Secrets>,
  responses: Record<string, HttpResponse>,
): Context {
  if (!collection) return { scope: { vars: {}, display: {} }, parents: [] };
  const env = active[collection];
  const col = object<Collection>(contents[`${collection}/collection.json`]);
  const envFile = env ? object<Environment>(contents[envPath(collection, env)]) : undefined;
  const local = env ? secrets[collection]?.[env] : undefined;
  const vars = varsFrom(col?.vars, envFile?.vars);
  const hidden = varsFrom(local);
  // Respostas da mesma coleção, pelo nome (`login`) e pelo caminho na coleção (`auth/login`).
  const res: Vars = {};
  for (const [file, response] of Object.entries(responses)) {
    if (!file.startsWith(`${collection}/`)) continue;
    const rel = file.slice(collection.length + 1).replace(/\.json$/, "");
    Object.assign(res, responseVars(rel.split("/").pop() ?? rel, response));
    if (rel.includes("/")) Object.assign(res, responseVars(rel, response));
  }
  const display = {
    ...res,
    ...vars,
    ...Object.fromEntries(Object.keys(hidden).map((k) => [k, "•••••• (segredo)"])),
  };
  // Pastas da request até a coleção, da mais próxima para a mais distante.
  const folders: string[] = [];
  const segments = (path ?? `${collection}/x`).split("/").slice(0, -1);
  for (let i = segments.length; i > 0; i--) folders.push(segments.slice(0, i).join("/"));
  const parents = folders.map((folder) => ({
    folder,
    ...object<Collection>(contents[`${folder}/collection.json`]),
  }));
  return { collection, env, scope: { vars: { ...res, ...vars, ...hidden }, display }, parents };
}

/** Coleção da request e seus environments, fora do React (atalho Ctrl E). */
export function collectionEnvs(path?: string) {
  const { tree, contents } = useWorkspace.getState();
  const collection = pickCollection(path, useEnvironments.getState().last, tree);
  return { collection, envs: collection ? environmentsOf(contents, collection) : [] };
}

/** Para enviar: garante os segredos carregados antes de resolver. */
export async function requestContext(path?: string) {
  const { last, active, responses, loadSecrets } = useEnvironments.getState();
  const { tree, contents } = useWorkspace.getState();
  const collection = pickCollection(path, last, tree);
  if (collection) await loadSecrets(collection);
  const { secrets } = useEnvironments.getState();
  return context(path, collection, contents, active, secrets, responses);
}

/** Mesmo contexto, reativo, para destacar variáveis e mostrar a auth herdada. */
export function useRequestContext(path?: string): Context {
  const { tree, contents } = useWorkspace(
    useShallow((s) => ({ tree: s.tree, contents: s.contents })),
  );
  const { last, active, secrets, responses } = useEnvironments(
    useShallow((s) => ({
      last: s.last,
      active: s.active,
      secrets: s.secrets,
      responses: s.responses,
    })),
  );
  return useMemo(() => {
    const collection = pickCollection(path, last, tree);
    return context(path, collection, contents, active, secrets, responses);
  }, [path, last, tree, contents, active, secrets, responses]);
}
