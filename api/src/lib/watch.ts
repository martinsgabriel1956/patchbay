// O workspace mudou no disco (git pull, editor): avisa a web pelo /realtime (PLANNING §6). Ligado
// enquanto houver alguém ouvindo. O que a própria api escreve (files.ts chama own()) não vira
// aviso: a web já sabe.
//
// Um fs.watch por pasta, e não o { recursive: true }: no Linux o recursivo do Node 22 vigia o
// inode de cada arquivo e fica cego depois de uma escrita atômica (temp + rename, como a nossa,
// a do git e a de muitos editores). A pasta não troca de inode: vê tudo o que acontece nela.
import { type FSWatcher, watch as fsWatch } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { root } from "./workspace.js";

type Listener = (paths: string[]) => void;

const DEBOUNCE_MS = 150;
// ponytail: janela fixa depois de cada escrita da api; uma mudança externa no mesmo arquivo dentro
// dela passa batida (comparar mtime/conteúdo se fizer falta).
const OWN_MS = 1000;

const listeners = new Set<Listener>();
const ownUntil = new Map<string, number>();
/** Pasta (relativa; "" = raiz) → watcher. */
const dirs = new Map<string, FSWatcher>();
let pending = new Set<string>();
let timer: NodeJS.Timeout | undefined;

const clean = (rel: string) =>
  path.posix.normalize(rel.split(path.sep).join("/")).replace(/\/$/, "");

/** Paths (relativos à raiz) que a api está escrevendo agora: os eventos deles são ignorados. */
export function own(...rels: string[]) {
  const until = Date.now() + OWN_MS;
  for (const rel of rels) ownUntil.set(clean(rel), until);
}

const isOwn = (rel: string) => {
  const now = Date.now();
  for (const [p, until] of ownUntil) {
    if (until < now) ownUntil.delete(p);
    // O próprio path, o que está dentro dele e as pastas acima (criadas ou tocadas pela escrita).
    else if (rel === p || rel.startsWith(`${p}/`) || p.startsWith(`${rel}/`)) return true;
  }
  return false;
};

// Ocultos (.git, .trash, .history.jsonl) não estão na árvore; .tmp é o meio da escrita atômica.
const ignored = (rel: string) =>
  rel.split("/").some((part) => part.startsWith(".")) || rel.endsWith(".tmp");

const unwatch = (rel: string) => {
  for (const [dir, watcher] of dirs) {
    if (dir !== rel && !dir.startsWith(`${rel}/`)) continue;
    watcher.close();
    dirs.delete(dir);
  }
};

function watchDir(base: string, rel: string) {
  if (dirs.has(rel) || !listeners.size) return;
  const abs = path.join(base, rel);
  try {
    const watcher = fsWatch(
      abs,
      (_event, name) => name && changed(base, path.posix.join(rel, name)),
    );
    watcher.on("error", () => unwatch(rel)); // pasta apagada etc.: a api segue de pé
    dirs.set(rel, watcher);
  } catch {
    return; // sumiu antes de dar para ouvir
  }
  readdir(abs, { withFileTypes: true }).then(
    (entries) => {
      for (const e of entries)
        if (e.isDirectory() && !e.name.startsWith("."))
          watchDir(base, path.posix.join(rel, e.name));
    },
    () => {},
  );
}

function changed(base: string, rel: string) {
  if (ignored(rel)) return;
  // Pasta nova passa a ser ouvida; a que sumiu deixa de ser. lstat: symlink não leva para fora.
  lstat(path.join(base, rel)).then(
    (s) => s.isDirectory() && watchDir(base, rel),
    () => unwatch(rel),
  );
  if (isOwn(rel)) return;
  pending.add(rel);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const paths = [...pending];
    pending = new Set();
    for (const listener of listeners) listener(paths);
  }, DEBOUNCE_MS);
}

/** Ouve mudanças no workspace (paths relativos, em lote). Devolve a função que para de ouvir. */
export function watch(listener: Listener) {
  listeners.add(listener);
  root().then((base) => watchDir(base, ""));
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    for (const watcher of dirs.values()) watcher.close();
    dirs.clear();
    clearTimeout(timer);
    pending = new Set();
  };
}
