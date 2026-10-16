// Importar coleção Postman v2.1 / Insomnia v4 / OpenAPI: arquivo escolhido ou texto colado. Grava no
// workspace (layout do PLANNING §8) e mostra o resumo, com o que ficou de fora.
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { type Imported, importCollections } from "@/lib/collection-import";
import { files, json, useWorkspace } from "./store";

type Summary = { name: string; requests: number; skipped: string[] }[];

const field =
  "border border-line bg-bg px-2.5 py-1.5 font-mono text-[13px] text-ink outline-offset-[-2px]";
const button =
  "label h-[34px] w-fit border border-mute px-3.5 text-[12px] enabled:hover:shadow-[inset_0_-2px_var(--ink)] disabled:text-mute";

/** Cada coleção numa pasta nova da raiz; nome repetido ganha " 2". Nunca sobrescreve. */
async function write(cols: Imported[]): Promise<Summary> {
  const taken = new Set(useWorkspace.getState().tree.map((e) => e.name));
  const summary: Summary = [];
  for (const col of cols) {
    let name = col.name;
    for (let n = 2; taken.has(name); n++) name = `${col.name} ${n}`;
    taken.add(name);
    for (const [path, content] of col.files) {
      if (path.endsWith("/")) await files.mkdir(`${name}/${path.slice(0, -1)}`);
      else
        await files.write(
          `${name}/${path}`,
          json(path === "collection.json" ? { ...(content as object), name } : content),
        );
    }
    const requests = col.files.filter(
      ([p]) =>
        p.endsWith(".json") && !p.endsWith("collection.json") && !p.startsWith("environments/"),
    ).length;
    summary.push({ name, requests, skipped: col.skipped });
  }
  await useWorkspace.getState().load();
  return summary;
}

export function ImportDialog() {
  const open = useWorkspace((s) => s.importing);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    useWorkspace.setState({ importing: false });
    setText("");
    setError("");
    setSummary(null);
  };

  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto p-[18px] sm:max-w-xl">
        <DialogTitle>Importar coleção</DialogTitle>
        <DialogDescription>
          Postman v2.1, Insomnia (export v4, JSON) ou OpenAPI 3.x / Swagger 2.0 (JSON ou YAML).
        </DialogDescription>
        {summary ? (
          <div className="grid gap-3.5">
            {summary.map((s) => (
              <section key={s.name} className="grid gap-1.5">
                <p className="text-[15px]">
                  Coleção <span className="font-mono text-[14px]">{s.name}</span> criada com{" "}
                  <span className="font-mono tabular-nums">{s.requests}</span> request(s).
                </p>
                {s.skipped.length > 0 && (
                  <>
                    <h3 className="label text-[12px] text-mute">Ficou de fora</h3>
                    <ul className="grid gap-0.5 font-mono text-[12.5px] text-ink-2">
                      {s.skipped.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            ))}
            <button type="button" onClick={close} className={button}>
              Fechar
            </button>
          </div>
        ) : (
          <form
            className="grid gap-3.5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                setSummary(await write(importCollections(text)));
                setError("");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="grid gap-1.5">
              <span className="label text-[12px] text-mute">Arquivo</span>
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json"
                onChange={(e) =>
                  e.target.files?.[0]?.text().then(setText, (err) => setError(err.message))
                }
                className="text-[13px] file:label file:mr-3 file:h-[34px] file:border file:border-mute file:bg-bg file:px-3.5 file:text-[12px] file:text-ink"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="label text-[12px] text-mute">Ou cole o conteúdo</span>
              <textarea
                value={text}
                spellCheck={false}
                rows={8}
                onChange={(e) => setText(e.target.value)}
                className={`${field} resize-y`}
              />
            </label>
            {error && (
              <p role="alert" className="font-mono text-[13px] text-prod-text">
                {error}
              </p>
            )}
            <button type="submit" disabled={!text.trim() || busy} className={button}>
              {busy ? "Importando…" : "Importar"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
