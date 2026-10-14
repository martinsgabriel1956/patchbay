// Pasta de trabalho (PLANNING §6 › Arquivos, §7 item 6, §8). Todo path vindo da web passa por
// resolve(): nada fora da raiz, nem via `..`, path absoluto, symlink ou pai que sai da raiz.
import { randomBytes } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { HistoryEntry, TreeEntry } from "../schemas.js";

const HISTORY = ".history.jsonl";
// O workspace pode virar repositório git: histórico (tem tokens), lixeira e segredos ficam fora.
const GITIGNORE = `${HISTORY}\n.trash/\n.env.local.json\n`;

let rootDir: Promise<string> | undefined;

/** Raiz real (sem symlink) do workspace, criada na primeira chamada. Lê WORKSPACE_DIR uma vez. */
export function root() {
  rootDir ??= (async () => {
    const dir = path.resolve(process.env.WORKSPACE_DIR || path.join(homedir(), "patchbay"));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, ".gitignore"), GITIGNORE, { flag: "wx" }).catch(() => {});
    return realpath(dir);
  })();
  return rootDir;
}

const outside = (rel: string) =>
  Object.assign(new Error(`not a path inside the workspace: ${JSON.stringify(rel)}`), {
    status: 403,
  });

const realpathOrNull = (p: string) =>
  realpath(p).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });

/** Path absoluto e real de `rel`, estritamente dentro da raiz (a raiz em si é recusada). */
export async function resolve(rel: string) {
  const base = await root();
  const target = path.resolve(base, rel);
  if (rel.includes("\0") || !target.startsWith(base + path.sep)) throw outside(rel);
  // Sobe até o primeiro ancestral que existe e usa o realpath dele: pega symlink no meio do
  // caminho e arquivo novo cujo pai é um symlink para fora.
  let existing = target;
  let real = await realpathOrNull(existing);
  while (real === null) {
    // Symlink quebrado: realpath dá ENOENT, mas escrever nele criaria o alvo lá fora.
    if ((await lstat(existing).catch(() => null))?.isSymbolicLink()) throw outside(rel);
    existing = path.dirname(existing);
    real = await realpathOrNull(existing);
  }
  const resolved = path.join(real, path.relative(existing, target));
  if (!resolved.startsWith(base + path.sep)) throw outside(rel);
  return resolved;
}

/** Árvore do workspace, sem arquivos/pastas ocultos (.git, .trash, .history.jsonl). */
export async function tree(dir?: string): Promise<TreeEntry[]> {
  const base = await root();
  const abs = dir ?? base;
  const entries: TreeEntry[] = [];
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(abs, entry.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      entries.push({ name: entry.name, path: rel, type: "dir", children: await tree(full) });
    } else if (entry.isFile()) {
      entries.push({ name: entry.name, path: rel, type: "file" });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Escreve de forma atômica (temp + rename): um crash no meio nunca deixa o arquivo pela metade. */
export async function write(rel: string, text: string) {
  const abs = await resolve(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, abs).catch(async (err) => {
    await rm(tmp, { force: true });
    throw err;
  });
}

export const exists = (abs: string) =>
  lstat(abs).then(
    () => true,
    () => false,
  );

/** "Deletar" = mover para `.trash/<mesmo caminho>`; colisão vira `nome 2.json`, `nome 3.json`… */
export async function trash(rel: string) {
  const abs = await resolve(rel);
  const inTrash = path.join(".trash", path.relative(await root(), abs));
  let dest = await resolve(inTrash);
  const { dir, name, ext } = path.parse(dest);
  for (let n = 2; await exists(dest); n++) dest = path.join(dir, `${name} ${n}${ext}`);
  await mkdir(dir, { recursive: true });
  await rename(abs, dest);
}

export async function appendHistory(entry: HistoryEntry) {
  await appendFile(await resolve(HISTORY), `${JSON.stringify(entry)}\n`);
}

/** Últimas `limit` entradas, da mais nova para a mais velha. */
export async function readHistory(limit: number): Promise<HistoryEntry[]> {
  // ponytail: lê o arquivo inteiro a cada chamada; trocar por leitura do fim se passar de alguns MB.
  const text = await readFile(await resolve(HISTORY), "utf8").catch(() => "");
  const entries: HistoryEntry[] = [];
  for (const line of text.split("\n").reverse()) {
    if (entries.length >= limit) break;
    try {
      if (line) entries.push(JSON.parse(line));
    } catch {} // linha corrompida (ex.: crash no meio do append) não derruba o histórico
  }
  return entries;
}
