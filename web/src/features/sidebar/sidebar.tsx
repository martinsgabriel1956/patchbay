// Trilho de canais (DESIGN.md › Navigation): coleções do workspace e histórico.
// Cada pasta é um grupo ("loja / usuários"); cada .json é um canal numerado.
import type { HistoryEntry, TreeEntry } from "@api/schemas";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState } from "react";
import { useEnvironments } from "@/features/environments/store";
import { useRealtime } from "@/features/realtime/store";
import {
  activeTab,
  baseName,
  fromRequest,
  serialize,
  useRequest,
} from "@/features/request-editor/store";
import { STAMPS } from "@/features/response-viewer/diagnose";
import { mod } from "@/lib/utils";
import { ImportDialog } from "./import-dialog";
import { PathDialog, type PathDialogProps } from "./path-dialog";
import { files, json, useWorkspace } from "./store";

type Group = { path: string; requests: TreeEntry[] };

/** Árvore → grupos em ordem de leitura: a raiz (se tiver requests) e cada pasta.
 *  `<coleção>/environments/` não é grupo de requests: é editado em Configurar. */
function groups(entries: TreeEntry[], path = "", out: Group[] = []): Group[] {
  const requests = entries
    .filter((e) => e.type === "file" && e.name.endsWith(".json") && e.name !== "collection.json")
    .sort((a, b) => baseName(a.name).localeCompare(baseName(b.name))); // "X" antes de "X cópia"
  if (path || requests.length) out.push({ path, requests });
  for (const e of entries) {
    const envDir = e.name === "environments" && e.path.split("/").length === 2;
    if (e.type === "dir" && !envDir) groups(e.children ?? [], e.path, out);
  }
  return out;
}

/** Requests na ordem do trilho: o canal n é o item n-1 (Ctrl 1–9, palette). */
export const channels = (tree: TreeEntry[]) => groups(tree).flatMap((g) => g.requests);

/** Abre o arquivo da request numa aba (ou foca a aba que já o tem). */
export function openChannel(path: string) {
  const content = useWorkspace.getState().contents[path];
  if (!content) return fail(new Error(`JSON inválido em ${path}: corrija o arquivo à mão.`));
  useRequest.getState().open(fromRequest(content), path);
}

const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const parent = (path: string) => path.split("/").slice(0, -1).join("/");
const fail = (err: unknown) => useWorkspace.setState({ error: (err as Error).message });
const reload = () => useWorkspace.getState().load();
/** Abas soltas pelo último Deletar (só o último tem Desfazer). */
let detached: { key: string; path?: string; saved: string }[] = [];

/** Foco num elemento do trilho depois que o React redesenhar (o teclado não cai no <body>). */
const focusLater = (selector: string) =>
  setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus());

async function undo({ from, to }: { from: string; to: string }) {
  await files.move(to, from);
  useRequest.setState((s) => ({
    tabs: s.tabs.map((t) => ({ ...t, ...detached.find((d) => d.key === t.key) })),
  }));
  useWorkspace.setState({ trashed: undefined });
  await reload();
  focusLater(`[data-path="${CSS.escape(from)}"]`);
}

/** Depois de mover/copiar, o "name" de dentro do arquivo acompanha o nome novo. */
async function syncName(from: string, to: string, isDir: boolean) {
  const file = isDir ? "/collection.json" : "";
  const content = useWorkspace.getState().contents[from + file];
  if (content && typeof content === "object" && "name" in content) {
    await files.write(to + file, json({ ...content, name: baseName(to) }));
  }
}

export function Sidebar() {
  const { tree, contents, history, error, trashed, saving, op, load, loadHistory } = useWorkspace();
  const activePath = useRequest((s) => activeTab(s).path);
  // Arquivos com WebSocket/SSE aberto (numa aba): o "WS"/"SSE" do canal fica em cord-text.
  const tabs = useRequest((s) => s.tabs);
  const conns = useRealtime((s) => s.conns);
  const live = new Set(tabs.filter((t) => conns[t.key]?.status === "open").map((t) => t.path));
  const [dialog, setDialog] = useState<PathDialogProps | null>(null);

  const all = groups(tree);
  const folders = ["", ...all.filter((g) => g.path).map((g) => g.path)];
  const exists = (path: string) => path in contents || folders.includes(path);
  const ensureFree = (path: string) => {
    if (exists(path)) throw new Error(`Já existe: ${path}`);
  };

  useEffect(() => {
    load();
    loadHistory();
    // Histórico recarrega a cada envio terminado.
    return useRequest.subscribe((s, prev) => {
      if (s.sends !== prev.sends) loadHistory();
    });
  }, [load, loadHistory]);

  // Ctrl+S (atalho no App) e a palette pedem `saving`; sem arquivo ainda, pergunta nome e pasta.
  useEffect(() => {
    if (!saving) return;
    useWorkspace.setState({ saving: false });
    const tab = activeTab(useRequest.getState());
    if (tab.path) {
      useRequest.getState().save().catch(fail);
      return;
    }
    setDialog({
      title: "Salvar request",
      name: tab.name,
      folder: useWorkspace.getState().tree.find((e) => e.type === "dir")?.path ?? "",
      submit: async (name, folder) => {
        const path = join(folder, `${name}.json`);
        if (path in useWorkspace.getState().contents) throw new Error(`Já existe: ${path}`);
        await useRequest.getState().save(path);
      },
    });
  }, [saving]);

  // Ctrl Z desfaz o último deletar, fora de campos de texto (lá o Ctrl Z é do texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { trashed } = useWorkspace.getState();
      if (!trashed || e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey)
        return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true], .cm-editor")) return;
      e.preventDefault();
      undo(trashed).catch(fail);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const newCollection = () =>
    setDialog({
      title: "Nova coleção",
      name: "",
      submit: async (name) => {
        ensureFree(name);
        await files.write(`${name}/collection.json`, json({ name }));
        await reload();
      },
    });

  const newRequest = (folder: string, kind?: "ws" | "sse") =>
    setDialog({
      title:
        kind === "ws"
          ? "Nova request WebSocket"
          : kind === "sse"
            ? "Nova request SSE"
            : "Nova request",
      name: "",
      folder,
      submit: async (name, folder) => {
        const path = join(folder, `${name}.json`);
        ensureFree(path);
        const draft = fromRequest({ name, kind });
        await files.write(path, serialize(draft));
        await reload();
        useRequest.getState().open(draft, path);
      },
    });

  const newFolder = (folder: string) =>
    setDialog({
      title: "Nova pasta",
      name: "",
      folder,
      submit: async (name, folder) => {
        ensureFree(join(folder, name));
        await files.mkdir(join(folder, name));
        await reload();
      },
    });

  const renameOrMove = (path: string, isDir: boolean) =>
    setDialog({
      title: isDir ? "Renomear / mover pasta" : "Renomear / mover request",
      name: baseName(path),
      folder: parent(path),
      submit: async (name, folder) => {
        const to = join(folder, isDir ? name : `${name}.json`);
        if (to === path) return;
        await files.move(path, to);
        await syncName(path, to, isDir);
        useRequest.getState().moved(path, to);
        await reload();
      },
    });

  const duplicate = async (path: string, isDir: boolean) => {
    const ext = isDir ? "" : ".json";
    const base = join(parent(path), `${baseName(path)} cópia`);
    let to = base + ext;
    for (let n = 2; exists(to); n++) to = `${base} ${n}${ext}`;
    await files.copy(path, to);
    await syncName(path, to, isDir);
    await reload();
  };

  // Request deletada tem "Desfazer"; pasta leva tudo junto, então confirma antes com a contagem.
  const remove = async (path: string, isDir = false) => {
    if (isDir) {
      const inside = all.filter((g) => g.path === path || g.path.startsWith(`${path}/`));
      const n = inside.reduce((sum, g) => sum + g.requests.length, 0);
      const what = n === 1 ? "1 request" : `${n} requests`;
      if (!window.confirm(`Deletar "${path}" com ${what}? Vai para .trash/.`)) return;
    }
    const to = await files.remove(path);
    // Abas desse arquivo/pasta ficam soltas; o Desfazer as religa ao arquivo restaurado.
    detached = useRequest
      .getState()
      .tabs.filter((t) => t.path === path || t.path?.startsWith(`${path}/`))
      .map(({ key, path, saved }) => ({ key, path, saved }));
    useRequest.getState().removed(path);
    useWorkspace.setState({ trashed: { from: path, to } });
    await reload();
    focusLater("#undo-trash"); // Enter ou Ctrl Z desfaz; Tab segue para o trilho
  };

  // Operações pedidas pela command palette.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só quando chega um pedido novo
  useEffect(() => {
    if (!op) return;
    useWorkspace.setState({ op: undefined });
    const run = {
      rename: () => renameOrMove(op.path, false),
      duplicate: () => duplicate(op.path, false).catch(fail),
      delete: () => remove(op.path).catch(fail),
      newCollection,
      newFolder: () => newFolder(op.path),
    };
    run[op.kind]();
  }, [op]);

  const fileMenu = (path: string): (MenuItem | null)[] => [
    ["Renomear / mover", () => renameOrMove(path, false), "F2"],
    ["Duplicar", () => duplicate(path, false).catch(fail)],
    null,
    ["Deletar", () => remove(path).catch(fail), "Delete"],
  ];
  const folderMenu = (path: string): (MenuItem | null)[] => [
    [
      path.includes("/") ? "Configurar (auth, headers)" : "Configurar (environments, auth…)",
      () => useEnvironments.getState().edit(path),
    ],
    ["Nova request", () => newRequest(path)],
    ["Nova request WebSocket", () => newRequest(path, "ws")],
    ["Nova request SSE", () => newRequest(path, "sse")],
    ["Nova pasta", () => newFolder(path)],
    ["Renomear / mover", () => renameOrMove(path, true)],
    ["Duplicar", () => duplicate(path, true).catch(fail)],
    null,
    ["Deletar", () => remove(path, true).catch(fail)],
  ];

  let channel = 0;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-line py-1.5 pr-1.5 pl-3.5">
        <h2 className="label text-[12px] text-mute">Coleções</h2>
        <span className="flex">
          <button
            type="button"
            onClick={() => useWorkspace.setState({ importing: true })}
            title="Importar coleção do Postman ou do Insomnia"
            className="label px-2 py-1 text-[12px] outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)]"
          >
            Importar
          </button>
          <button
            type="button"
            onClick={newCollection}
            className="label px-2 py-1 text-[12px] outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)]"
          >
            + Coleção
          </button>
        </span>
      </div>

      {error && (
        <p role="alert" className="flex gap-2 border-b border-line px-3.5 py-2">
          <span className="min-w-0 flex-1 font-mono text-[12px] break-words text-prod-text">
            {error}
          </span>
          <button
            type="button"
            aria-label="Dispensar erro"
            onClick={() => useWorkspace.setState({ error: undefined })}
            className="font-mono text-[14px] text-mute hover:text-ink"
          >
            ×
          </button>
        </p>
      )}

      {trashed && (
        <p
          role="status"
          className="flex items-center gap-2 border-b border-line py-1.5 pr-1.5 pl-3.5"
        >
          <span
            className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2"
            title={trashed.to}
          >
            {baseName(trashed.from)} na .trash/
          </span>
          <button
            id="undo-trash"
            type="button"
            title={`Desfazer (${mod("Z")})`}
            onClick={() => undo(trashed).catch(fail)}
            className="label shrink-0 px-2 py-1 text-[12px] outline-offset-[-2px] hover:shadow-[inset_0_-2px_var(--ink)]"
          >
            Desfazer
          </button>
          <button
            type="button"
            aria-label="Dispensar aviso"
            onClick={() => useWorkspace.setState({ trashed: undefined })}
            className="px-1.5 font-mono text-[14px] text-mute hover:text-ink"
          >
            ×
          </button>
        </p>
      )}

      <nav aria-label="Coleções" className="min-h-0 flex-1 overflow-y-auto py-2">
        {all.length === 0 && (
          <p className="px-3.5 text-[15px] text-mute">
            Nenhuma coleção ainda. Crie uma em “+ Coleção” ou salve a request com Ctrl S.
          </p>
        )}
        {all.map((group) => (
          <section key={group.path} aria-label={group.path || "Raiz"} className="mb-4">
            {group.path && (
              <div className="group flex items-center pr-1.5 pl-3.5">
                <h3 className="label min-w-0 flex-1 truncate py-1 text-[12px] text-mute">
                  {group.path.split("/").join(" / ")}
                </h3>
                <Menu label={`Ações da pasta ${group.path}`} items={folderMenu(group.path)} />
              </div>
            )}
            <ul>
              {group.requests.map((entry) => {
                channel++;
                const content = contents[entry.path] as { method?: string; kind?: string } | null;
                const method = !content
                  ? "JSON?"
                  : content.kind === "ws" || content.kind === "sse"
                    ? content.kind.toUpperCase()
                    : (content.method ?? "?");
                const selected = entry.path === activePath;
                return (
                  <li
                    key={entry.path}
                    className={`group flex items-center ${selected ? "bg-ink text-bg" : ""}`}
                  >
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      data-path={entry.path}
                      title={`${entry.path} · F2 renomeia, Delete deleta`}
                      onClick={() => openChannel(entry.path)}
                      onKeyDown={(e) => {
                        if (e.key === "F2") renameOrMove(entry.path, false);
                        if (e.key === "Delete") remove(entry.path).catch(fail);
                      }}
                      className="grid min-w-0 flex-1 grid-cols-[22px_42px_minmax(0,1fr)] items-center gap-2 py-1.5 pl-3.5 text-left outline-offset-[-2px]"
                    >
                      <span
                        className={`font-mono text-[12px] tabular-nums ${selected ? "" : "text-mute"}`}
                      >
                        {String(channel).padStart(2, "0")}
                      </span>
                      <span
                        className={`label ${live.has(entry.path) && !selected ? "text-cord-text" : ""}`}
                      >
                        {method === "DELETE" ? "DEL" : method}
                      </span>
                      <span
                        className={`label w-fit max-w-full truncate px-2 py-0.5 ${selected ? "bg-bg text-ink" : "bg-ink text-bg"}`}
                      >
                        {entry.name.replace(/\.json$/, "")}
                      </span>
                    </button>
                    <Menu label={`Ações de ${entry.path}`} items={fileMenu(entry.path)} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <History entries={history} />

      {dialog && <PathDialog {...dialog} folders={folders} onClose={() => setDialog(null)} />}
      <ImportDialog />
    </div>
  );
}

/** Texto, ação e, se tiver, a tecla que faz o mesmo no canal focado. */
type MenuItem = [string, () => void, string?];

function Menu(props: { label: string; items: (MenuItem | null)[] }) {
  return (
    // modal={false}: abrir um Dialog a partir do item não deixa o body travado.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={props.label}
        className="shrink-0 px-2 font-mono text-[14px] opacity-40 outline-offset-[-2px] group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      >
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-44 border border-line bg-bg py-1 text-ink"
        >
          {/* null = fio separando o destrutivo do resto */}
          {props.items.map((item, i) =>
            item ? (
              <DropdownMenu.Item
                key={item[0]}
                onSelect={item[1]}
                className="label flex cursor-default items-center gap-4 px-3.5 py-1.5 text-[12px] outline-none data-highlighted:bg-ink data-highlighted:text-bg"
              >
                {item[0]}
                {item[2] && (
                  <span className="ml-auto font-mono font-normal tracking-normal normal-case">
                    {item[2]}
                  </span>
                )}
              </DropdownMenu.Item>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: separador não tem identidade própria
              <DropdownMenu.Separator key={i} className="my-1 h-px bg-line" />
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// Classe de status = cor da fita, na variante *-text (DESIGN.md › Secondary).
const TONES: Record<number, string> = {
  2: "text-dev-text",
  3: "text-local-text",
  4: "text-staging-text",
  5: "text-prod-text",
};

/** "https://api.x.dev/users?id=1" → host "api.x.dev", caminho "/users?id=1". */
function splitUrl(url: string) {
  const rest = url.replace(/^[a-z][\w+.-]*:\/\//i, "");
  const i = rest.search(/[/?#]/);
  return i < 0 ? { host: rest, path: "/" } : { host: rest.slice(0, i), path: rest.slice(i) };
}

function when(at: string) {
  const date = new Date(at);
  const today = date.toDateString() === new Date().toDateString();
  return today
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Mesmo formato do canal, com a hora no lugar do número; clicar reabre numa aba nova.
 *  A linha mostra só o caminho; o host vira um cabeçalho quando muda em relação à linha de cima. */
function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <section
      aria-label="Histórico"
      className="flex max-h-[40%] min-h-0 flex-col border-t border-line"
    >
      <h2 className="label shrink-0 px-3.5 py-1.5 text-[12px] text-mute">Histórico</h2>
      {entries.length === 0 && (
        <p className="px-3.5 pb-3 text-[15px] text-mute">Nada enviado ainda.</p>
      )}
      <ul className="min-h-0 overflow-y-auto pb-2">
        {entries.map((entry, index) => {
          const { request, response, failed } = entry;
          const { host, path } = splitUrl(request.url);
          const newHost = index === 0 || splitUrl(entries[index - 1].request.url).host !== host;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: entradas não têm id; o histórico só cresce no topo
            <li key={`${entry.at}-${index}`}>
              {newHost && (
                <p className="truncate px-3.5 pt-1.5 font-mono text-[12px] text-mute" title={host}>
                  {host}
                </p>
              )}
              <button
                type="button"
                title={`${request.method} ${request.url}`}
                onClick={() => useRequest.getState().open(fromRequest(request))}
                className="grid w-full grid-cols-[38px_42px_minmax(0,1fr)_auto] items-center gap-2 px-3.5 py-1 text-left outline-offset-[-2px] hover:shadow-[inset_2px_0_var(--ink)]"
              >
                <span className="font-mono text-[12px] text-mute tabular-nums">
                  {when(entry.at)}
                </span>
                <span className="label">
                  {request.method === "DELETE" ? "DEL" : request.method}
                </span>
                <span className="truncate font-mono text-[12px] text-ink-2">{path}</span>
                {failed ? (
                  <span className="label border-2 border-prod-text px-2 py-px text-[11px] text-prod-text">
                    {STAMPS[failed.reason]}
                  </span>
                ) : (
                  <span
                    className={`font-mono text-[12px] font-semibold tabular-nums ${TONES[Math.floor((response?.status ?? 0) / 100)] ?? "text-ink"}`}
                  >
                    {response?.status}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
