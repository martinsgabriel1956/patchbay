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
  /** Diálogo de importar coleção (Postman/Insomnia) aberto. */
  importing?: boolean;
  /** Pedido de salvar a aba ativa (Ctrl S, palette); a sidebar atende e pergunta o nome se faltar. */
  saving?: boolean;
  /** Operação de arquivo pedida de fora do trilho (command palette); a sidebar atende. */
  op?: { kind: "rename" | "duplicate" | "delete" | "newCollection" | "newFolder"; path: string };
  /** Último item deletado: `to` é onde ficou na lixeira, para o "Desfazer". */
  trashed?: { from: string; to: string };
  load: () => Promise<void>;
  loadHistory: () => Promise<void>;
};

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
