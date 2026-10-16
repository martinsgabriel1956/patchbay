// O workspace como a api mostra: árvore, conteúdo dos .json e histórico. O disco é a verdade:
// toda mutação chama a api e recarrega tudo.
import type { HistoryEntry, TreeEntry } from "@api/schemas";
import { create } from "zustand";
import { api } from "@/lib/api-client";

const q = (path: string) => `/files?path=${encodeURIComponent(path)}`;
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Formato dos arquivos: 2 espaços e quebra de linha no fim (diff limpo no git). */
export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export const files = {
  read: (path: string) => api(q(path)).then((res) => res.text()),
  write: (path: string, text: string) =>
    api(q(path), {
      method: "PUT",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: text,
    }),
  mkdir: (path: string) => api(q(`${path}/`), { method: "PUT" }),
  /** Vai para `.trash/` no workspace, não é apagado. Devolve o caminho na lixeira. */
  remove: (path: string) =>
    api(q(path), { method: "DELETE" })
      .then((res) => res.json())
      .then((r: { trashed: string }) => r.trashed),
  move: (from: string, to: string) => api("/files/move", post({ from, to })),
  copy: (from: string, to: string) => api("/files/copy", post({ from, to })),
};

type Workspace = {
  tree: TreeEntry[];
  /** Conteúdo parseado de cada .json; null = JSON inválido (não abre, para não sobrescrever). */
  contents: Record<string, unknown>;
  history: HistoryEntry[];
  error?: string;
  /** Diálogo de importar coleção (Postman/Insomnia/OpenAPI) aberto. */
  importing?: boolean;
  /** Pedido de salvar a aba ativa (Ctrl S, palette); a sidebar atende e pergunta o nome se faltar. */
  saving?: boolean;
  /** Operação de arquivo pedida de fora do trilho (command palette); a sidebar atende. */
  op?: { kind: "rename" | "duplicate" | "delete" | "newCollection" | "newFolder"; path: string };
  /** Confirmação curta (ex. "Salvo em …"); some sozinha. */
  notice?: string;
  /** Último item deletado: `to` é onde ficou na lixeira, para o "Desfazer". */
  trashed?: { from: string; to: string };
  load: () => Promise<void>;
  loadHistory: () => Promise<void>;
};

export type Group = { path: string; requests: TreeEntry[] };

const baseName = (name: string) => name.replace(/\.json$/, "");

/** Árvore → grupos em ordem de leitura: a raiz (se tiver requests) e cada pasta.
 *  `<coleção>/environments/` não é grupo de requests: é editado em Configurar. Dentro do grupo,
 *  pelo número do canal (sem número, depois, pelo nome). */
export function groups(
  entries: TreeEntry[],
  contents: Record<string, unknown> = {},
  path = "",
  out: Group[] = [],
): Group[] {
  const requests = entries
    .filter((e) => e.type === "file" && e.name.endsWith(".json") && e.name !== "collection.json")
    .sort(
      (a, b) =>
        (channelOf(contents[a.path]) ?? Infinity) - (channelOf(contents[b.path]) ?? Infinity) ||
        baseName(a.name).localeCompare(baseName(b.name)), // "X" antes de "X cópia"
    );
  if (path || requests.length) out.push({ path, requests });
  for (const e of entries) {
    const envDir = e.name === "environments" && e.path.split("/").length === 2;
    if (e.type === "dir" && !envDir) groups(e.children ?? [], contents, e.path, out);
  }
  return out;
}

/** O número gravado no arquivo, se for válido. */
export const channelOf = (content: unknown) => {
  const n = (content as { channel?: unknown } | null)?.channel;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Próximo número livre: o maior + 1 (o número de um canal deletado pode voltar a ser usado). */
export const nextChannel = (contents = useWorkspace.getState().contents) =>
  Math.max(0, ...Object.values(contents).map((c) => channelOf(c) ?? 0)) + 1;

/** Requests sem número, com número inválido ou repetido (cópia, import, merge do git): quem vem
 *  primeiro na ordem do trilho fica com o número; as outras ganham max+1, nessa ordem. */
export function numberChannels(paths: string[], contents: Record<string, unknown>) {
  const seen = new Set<number>();
  const missing: string[] = [];
  for (const path of paths) {
    const content = contents[path];
    if (!content || typeof content !== "object") continue; // JSON inválido: não sobrescreve
    const n = channelOf(content);
    if (n === undefined || seen.has(n)) missing.push(path);
    else seen.add(n);
  }
  let next = Math.max(0, ...seen);
  return missing.map((path) => ({ path, channel: ++next }));
}

/** O número entra logo depois do "name" (ordem de chaves fixa: diff limpo no git). */
export function withChannel(content: Record<string, unknown>, channel: number) {
  const out: Record<string, unknown> = {};
  if (!("name" in content)) out.channel = channel;
  for (const [key, value] of Object.entries(content)) {
    if (key === "channel") continue;
    out[key] = value;
    if (key === "name") out.channel = channel;
  }
  return out;
}

const jsonFiles = (entries: TreeEntry[]): string[] =>
  entries.flatMap((e) =>
    e.type === "dir" ? jsonFiles(e.children ?? []) : e.name.endsWith(".json") ? [e.path] : [],
  );

export const useWorkspace = create<Workspace>()((set) => ({
  tree: [],
  contents: {},
  history: [],

  load: async () => {
    try {
      const tree: TreeEntry[] = await (await api("/files/tree")).json();
      // ponytail: lê todos os .json a cada recarga (precisa do método de cada request na árvore);
      // trocar por leitura sob demanda se o workspace passar de centenas de arquivos.
      const paths = jsonFiles(tree);
      const texts = await Promise.all(paths.map(files.read));
      const contents: Record<string, unknown> = {};
      paths.forEach((path, i) => {
        try {
          contents[path] = JSON.parse(texts[i]);
        } catch {
          contents[path] = null;
        }
      });
      // Dá número às requests que ainda não têm (ou repetem) e grava no arquivo.
      const order = groups(tree).flatMap((g) => g.requests.map((r) => r.path));
      for (const { path, channel } of numberChannels(order, contents)) {
        contents[path] = withChannel(contents[path] as Record<string, unknown>, channel);
        await files.write(path, json(contents[path]));
      }
      set({ tree, contents, error: undefined });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  loadHistory: async () => {
    try {
      set({ history: await (await api("/history?limit=100")).json() });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
