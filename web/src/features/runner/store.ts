// Runner de coleção: envia em sequência todas as requests HTTP de uma pasta (e subpastas), na
// ordem do trilho, com o environment ativo. Cada resposta vira `{{nome.res.…}}` antes da próxima
// (o mesmo mecanismo do editor), então um login no começo alimenta o resto. Lê do disco: alteração
// não salva numa aba não entra. Resultado só em memória.
import type { HttpRequest, HttpResponse } from "@api/schemas";
import { create } from "zustand";
import { type AssertResult, evaluate } from "@/features/asserts/asserts";
import { jarKey, requestContext, useEnvironments } from "@/features/environments/store";
import { fromRequest, toRequest, useRequest } from "@/features/request-editor/store";
import { channelOf, groups, useWorkspace } from "@/features/sidebar/store";
import { api } from "@/lib/api-client";
import { effectiveAuth, interpolate, prepare, unresolved } from "@/lib/interpolate";
import { ensureAuth } from "@/lib/oauth";

export type RunRow = {
  path: string;
  name: string;
  method: string;
  channel?: number;
  state: "pending" | "running" | "done" | "failed" | "skipped";
  status?: number;
  timeMs?: number;
  results?: AssertResult[];
  /** failed: o motivo; "blocked" = sobrou `{{var}}` sem valor (message lista quais). */
  reason?: "cancelled" | "timeout" | "error" | "blocked";
  message?: string;
};

type Runner = {
  folder?: string;
  env?: string;
  rows: RunRow[];
  running: boolean;
  /** Diálogo de resultados aberto. Fechar não cancela: a execução segue por trás. */
  open: boolean;
  run: (folder: string) => Promise<void>;
  cancel: () => void;
};

const isHttp = (content: unknown) => {
  if (!content || typeof content !== "object") return false; // JSON inválido não roda
  const kind = (content as { kind?: unknown }).kind;
  return kind === undefined || kind === "http";
};

/** Requests HTTP da pasta e das subpastas, na ordem do trilho. */
export function requestsIn(folder: string) {
  const { tree, contents } = useWorkspace.getState();
  return groups(tree, contents)
    .filter((g) => g.path === folder || g.path.startsWith(`${folder}/`))
    .flatMap((g) => g.requests.map((r) => r.path))
    .filter((path) => isHttp(contents[path]));
}

let controller: AbortController | undefined;

export const useRunner = create<Runner>()((set, get) => {
  const patch = (index: number, p: Partial<RunRow>) =>
    set((s) => ({ rows: s.rows.map((row, i) => (i === index ? { ...row, ...p } : row)) }));

  return {
    rows: [],
    running: false,
    open: false,

    run: async (folder) => {
      if (get().running) return set({ open: true });
      const { contents } = useWorkspace.getState();
      const paths = requestsIn(folder);
      const drafts = paths.map((path) => fromRequest(contents[path] as Partial<HttpRequest>));
      const run = new AbortController();
      controller = run;
      set({
        folder,
        env: useEnvironments.getState().active[folder.split("/")[0]],
        open: true,
        running: true,
        rows: paths.map((path, i) => ({
          path,
          name: drafts[i].name,
          method: drafts[i].method,
          channel: channelOf(contents[path]),
          state: "pending",
        })),
      });

      // Em sequência: a próxima pode depender da resposta desta.
      for (const [i, path] of paths.entries()) {
        if (run.signal.aborted) break;
        patch(i, { state: "running" });
        try {
          const { collection, env, scope, parents } = await requestContext(path);
          // OAuth: obtém/renova o token antes do prepare, como o Enviar do editor.
          await ensureAuth(effectiveAuth(drafts[i].auth, parents), (t) =>
            interpolate(t, scope.vars),
          );
          const req = prepare(toRequest(drafts[i]), scope.vars, parents);
          const missing = unresolved(req);
          if (missing.length) {
            const message = missing.map((name) => `{{${name}}}`).join(", ");
            patch(i, { state: "failed", reason: "blocked", message });
            continue;
          }
          if (!/^[a-z][\w+.-]*:\/\//i.test(req.url)) req.url = `http://${req.url}`;
          const res = await api("/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...req, jar: jarKey(collection, env) }),
            signal: run.signal,
          });
          const response: HttpResponse = await res.json();
          useEnvironments.setState((s) => ({ responses: { ...s.responses, [path]: response } }));
          const results = evaluate(drafts[i].asserts ?? [], response, scope.vars);
          patch(i, { state: "done", status: response.status, timeMs: response.timeMs, results });
        } catch (err) {
          const { status, message } = err as Error & { status?: number };
          if (run.signal.aborted) {
            patch(i, { state: "failed", reason: "cancelled", message: "" });
            break;
          }
          patch(i, { state: "failed", reason: status === 504 ? "timeout" : "error", message });
        }
      }
      set((s) => ({
        running: false,
        rows: s.rows.map((row) => (row.state === "pending" ? { ...row, state: "skipped" } : row)),
      }));
      // O histórico ganhou uma linha por envio: recarrega como depois do Enviar.
      useRequest.setState((s) => ({ sends: s.sends + 1 }));
    },

    cancel: () => controller?.abort(),
  };
});
