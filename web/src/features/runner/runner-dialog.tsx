// Resultado do runner: uma linha por request (canal, método, nome, status, tempo, asserts).
// Clicar abre a request. Cor só como código: status pela classe, carimbo prod-text na falha.

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AssertResults } from "@/features/asserts/asserts-ui";
import { STAMPS } from "@/features/response-viewer/diagnose";
import { openChannel } from "@/features/sidebar/sidebar";
import { type Dict, useStrings } from "@/lib/i18n";
import { type RunRow, useRunner } from "./store";

const RUNNER_STRINGS: Dict<{
  title: (folder: string) => string;
  description: string;
  noEnv: string;
  empty: string;
  cancel: string;
  again: string;
  progress: (done: number, total: number) => string;
  summary: (ok: number, failed: number) => string;
  running: string;
  pending: string;
  skipped: string;
  blocked: string;
  open: (name: string) => string;
}> = {
  en: {
    title: (folder) => `Run ${folder}`,
    description:
      "Every HTTP request in the folder, in order, with the active environment. Each response becomes {{name.res.…}} for the next ones.",
    noEnv: "no environment",
    empty: "No HTTP requests in this folder.",
    cancel: "Cancel",
    again: "Run again",
    progress: (done, total) => `${done}/${total}`,
    summary: (ok, failed) => `${ok} passed · ${failed} failed`,
    running: "in flight",
    pending: "waiting",
    skipped: "skipped",
    blocked: "Not sent",
    open: (name) => `Open ${name}`,
  },
  "pt-BR": {
    title: (folder) => `Rodar ${folder}`,
    description:
      "Todas as requests HTTP da pasta, em ordem, com o environment ativo. Cada resposta vira {{nome.res.…}} para as seguintes.",
    noEnv: "sem environment",
    empty: "Nenhuma request HTTP nesta pasta.",
    cancel: "Cancelar",
    again: "Rodar de novo",
    progress: (done, total) => `${done}/${total}`,
    summary: (ok, failed) => `${ok} ok · ${failed} falharam`,
    running: "em voo",
    pending: "na fila",
    skipped: "pulada",
    blocked: "Não enviada",
    open: (name) => `Abrir ${name}`,
  },
};

// Classe de status = cor da fita, na variante *-text (DESIGN.md › Secondary).
const TONES: Record<number, string> = {
  2: "text-dev-text",
  3: "text-local-text",
  4: "text-staging-text",
  5: "text-prod-text",
};
const button =
  "label h-[34px] border border-mute px-3.5 text-[12px] hover:shadow-[inset_0_-2px_var(--ink)]";

/** Passou: enviada e todos os asserts ok. */
const passed = (row: RunRow) => row.state === "done" && !row.results?.some((r) => !r.pass);

export function RunnerDialog() {
  const t = useStrings(RUNNER_STRINGS);
  const { folder, env, rows, running, open, run, cancel } = useRunner();
  const finished = rows.filter((r) => r.state === "done" || r.state === "failed").length;
  const ok = rows.filter(passed).length;

  return (
    <Dialog open={open && !!folder} onOpenChange={(open) => useRunner.setState({ open })}>
      <DialogContent className="max-h-[85vh] content-start overflow-y-auto p-[18px] sm:max-w-[min(900px,calc(100%-2rem))]">
        <DialogTitle>
          {t.title(folder ?? "")} · {env ?? t.noEnv}
        </DialogTitle>
        <DialogDescription>{t.description}</DialogDescription>

        <div className="flex items-center gap-3.5">
          <span role="status" className="font-mono text-[13px] text-ink tabular-nums">
            {running ? t.progress(finished, rows.length) : t.summary(ok, rows.length - ok)}
          </span>
          {running ? (
            <button type="button" onClick={cancel} className={`${button} ml-auto`}>
              {t.cancel}
            </button>
          ) : (
            folder && (
              <button type="button" onClick={() => run(folder)} className={`${button} ml-auto`}>
                {t.again}
              </button>
            )
          )}
        </div>

        {rows.length === 0 ? (
          <p className="text-[15px] text-mute">{t.empty}</p>
        ) : (
          <ol className="grid border-t border-line">
            {rows.map((row) => (
              <li key={row.path} className="border-b border-line">
                <button
                  type="button"
                  aria-label={t.open(row.path)}
                  title={row.path}
                  onClick={() => {
                    useRunner.setState({ open: false });
                    openChannel(row.path);
                  }}
                  className="grid w-full grid-cols-[22px_42px_minmax(0,1fr)_auto_auto] items-center gap-2.5 px-1.5 py-1.5 text-left outline-offset-[-2px] hover:shadow-[inset_2px_0_var(--ink)]"
                >
                  <span className="font-mono text-[12px] text-mute tabular-nums">
                    {row.channel ? String(row.channel).padStart(2, "0") : "--"}
                  </span>
                  <span className="label">{row.method === "DELETE" ? "DEL" : row.method}</span>
                  <span className="label w-fit max-w-full truncate bg-ink px-2 py-0.5 text-bg">
                    {row.name}
                  </span>
                  <Outcome row={row} />
                  <span className="w-16 text-right font-mono text-[12px] text-mute tabular-nums">
                    {row.timeMs !== undefined && `${row.timeMs} ms`}
                  </span>
                </button>
                {row.results?.some((r) => !r.pass) && (
                  <div className="px-1.5 pb-2 pl-[74px]">
                    <AssertResults results={row.results.filter((r) => !r.pass)} />
                  </div>
                )}
                {row.state === "failed" && row.message && (
                  <p className="px-1.5 pb-2 pl-[74px] font-mono text-[12px] break-words text-ink-2">
                    {row.message}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Status e asserts (2/3), ou o carimbo da falha, ou o estado na fila. */
function Outcome({ row }: { row: RunRow }) {
  const t = useStrings(RUNNER_STRINGS);
  if (row.state === "failed")
    return (
      <span className="label border-2 border-prod-text px-1.5 text-[11px] text-prod-text">
        {row.reason === "blocked" ? t.blocked : STAMPS[row.reason ?? "error"]}
      </span>
    );
  if (row.state !== "done")
    return (
      <span
        className={`font-mono text-[12px] ${row.state === "running" ? "text-cord-text" : "text-mute"}`}
      >
        {row.state === "running" ? t.running : row.state === "pending" ? t.pending : t.skipped}
      </span>
    );
  const results = row.results ?? [];
  const failed = results.filter((r) => !r.pass).length;
  return (
    <span className="flex items-center gap-2.5 font-mono text-[12px] tabular-nums">
      {results.length > 0 && (
        <span className={failed ? "text-prod-text" : "text-mute"}>
          {results.length - failed}/{results.length}
        </span>
      )}
      <span className={`font-semibold ${TONES[Math.floor((row.status ?? 0) / 100)] ?? "text-ink"}`}>
        {row.status}
      </span>
    </span>
  );
}
