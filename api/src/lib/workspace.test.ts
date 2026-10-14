import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { resolve, root } from "./workspace.js";

const tmp = mkdtempSync(path.join(tmpdir(), "patchbay-ws-"));
const outside = path.join(tmp, "outside");
process.env.WORKSPACE_DIR = path.join(tmp, "ws");

it("resolve recusa tudo que sai da raiz, inclusive via symlink", async () => {
  const ws = await root();
  mkdirSync(outside);
  writeFileSync(path.join(outside, "secret.json"), "{}");
  mkdirSync(path.join(ws, "col"));
  symlinkSync(outside, path.join(ws, "link")); // pasta para fora
  symlinkSync(path.join(outside, "nope.json"), path.join(ws, "dangling.json")); // alvo ainda não existe
  symlinkSync(path.join(ws, "col"), path.join(ws, "inside")); // symlink para dentro: ok

  await expect(resolve("col/a.json")).resolves.toBe(path.join(ws, "col/a.json"));
  await expect(resolve("new/dir/a.json")).resolves.toBe(path.join(ws, "new/dir/a.json"));
  await expect(resolve("inside/a.json")).resolves.toBe(path.join(ws, "col/a.json"));
  await expect(resolve("col/../col/a.json")).resolves.toBe(path.join(ws, "col/a.json"));
  // "%2e%2e" chega literal (a rota já decodou a query uma vez): é só um nome de pasta.
  await expect(resolve("%2e%2e/a.json")).resolves.toBe(path.join(ws, "%2e%2e/a.json"));

  for (const rel of [
    "../outside/secret.json",
    "col/../../outside/secret.json",
    path.join(outside, "secret.json"), // absoluto
    "/etc/passwd",
    "",
    ".",
    "col/..",
    "link",
    "link/secret.json",
    "link/new/file.json", // arquivo novo cujo pai sai da raiz
    "dangling.json",
    "a\0.json",
  ]) {
    await expect(resolve(rel), rel).rejects.toMatchObject({ status: 403 });
  }
});
