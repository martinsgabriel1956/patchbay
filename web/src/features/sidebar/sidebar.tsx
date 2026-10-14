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

const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const parent = (path: string) => path.split("/").slice(0, -1).join("/");
const fail = (err: unknown) => useWorkspace.setState({ error: (err as Error).message });
const reload = () => useWorkspace.getState().load();

/** Depois de mover/copiar, o "name" de dentro do arquivo acompanha o nome novo. */
async function syncName(from: string, to: string, isDir: boolean) {
  const file = isDir ? "/collection.json" : "";
  const content = useWorkspace.getState().contents[from + file];
  if (content && typeof content === "object" && "name" in content) {
    await files.write(to + file, json({ ...content, name: baseName(to) }));
  }
}

export function Sidebar() {
  const { tree, contents, history, error, load, loadHistory } = useWorkspace();
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

  // Ctrl+S salva a aba ativa; se ela ainda não tem arquivo, pergunta nome e pasta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "s" || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const tab = activeTab(useRequest.getState());
      if (tab.path) {
        useRequest.getState().save().catch(fail);
        return;
      }
      const { tree } = useWorkspace.getState();
      setDialog({
        title: "Salvar request",
        name: tab.name,
        folder: tree.find((e) => e.type === "dir")?.path ?? "",
        submit: async (name, folder) => {
          const path = join(folder, `${name}.json`);
          if (path in useWorkspace.getState().contents) throw new Error(`Já existe: ${path}`);
          await useRequest.getState().save(path);
        },
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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

  const remove = async (path: string) => {
    await files.remove(path);
    useRequest.getState().removed(path);
    await reload();
  };

  const open = (path: string) => {
    const content = contents[path];
    if (!content) return fail(new Error(`JSON inválido em ${path}: corrija o arquivo à mão.`));
    useRequest.getState().open(fromRequest(content), path);
  };

  const fileMenu = (path: string): MenuItem[] => [
    ["Renomear / mover", () => renameOrMove(path, false)],
    ["Duplicar", () => duplicate(path, false).catch(fail)],
    ["Deletar", () => remove(path).catch(fail)],
  ];
  const folderMenu = (path: string): MenuItem[] => [
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
    ["Deletar", () => remove(path).catch(fail)],
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
                      title={`${entry.path} · F2 renomeia, Delete deleta`}
                      onClick={() => open(entry.path)}
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

type MenuItem = [string, () => void];

function Menu(props: { label: string; items: MenuItem[] }) {
  return (
    // modal={false}: abrir um Dialog a partir do item não deixa o body travado.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={props.label}
        className="shrink-0 px-2 font-mono text-[14px] opacity-0 outline-offset-[-2px] group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      >
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-44 border border-line bg-bg py-1 text-ink"
        >
          {props.items.map(([text, action]) => (
            <DropdownMenu.Item
              key={text}
              onSelect={action}
              className="label cursor-default px-3.5 py-1.5 text-[12px] outline-none data-highlighted:bg-ink data-highlighted:text-bg"
            >
              {text}
            </DropdownMenu.Item>
          ))}
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
const STAMPS = { cancelled: "Cancelada", timeout: "Timeout", error: "Falhou" };

function when(at: string) {
  const date = new Date(at);
  const today = date.toDateString() === new Date().toDateString();
  return today
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Mesmo formato do canal, com a hora no lugar do número; clicar reabre numa aba nova. */
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
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: entradas não têm id; o histórico só cresce no topo
            <li key={`${entry.at}-${index}`}>
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
                <span className="truncate font-mono text-[12px] text-ink-2">
                  {request.url.replace(/^https?:\/\//, "")}
                </span>
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
