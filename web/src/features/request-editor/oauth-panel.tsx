// Estado do token OAuth da auth (já com as `{{var}}` do escopo): validade, escopos, obter e
// limpar. O token vive só em memória (lib/oauth.ts).
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { CommandItem } from "@/components/ui/command";
import { useRequestContext } from "@/features/environments/store";
import { useWorkspace } from "@/features/sidebar/store";
import { openBrowser } from "@/lib/desktop";
import { effectiveAuth, interpolate, type Vars } from "@/lib/interpolate";
import {
  clearToken,
  getToken,
  nextStep,
  type OAuth2,
  oauth,
  resolveOAuth,
  tokenKey,
} from "@/lib/oauth";
import { activeTab, useRequest, where } from "./store";

const button =
  "label h-[34px] shrink-0 border border-mute px-3 text-[12px] focus-visible:outline-offset-2 hover:shadow-[inset_0_-2px_var(--ink)]";

/** "45 s", "12 min", "3 h". */
function inTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

export function OAuthPanel(props: { auth: OAuth2; vars: Vars }) {
  const a = resolveOAuth(props.auth, (text) => interpolate(text, props.vars));
  const key = tokenKey(a);
  const token = useStore(oauth, (s) => s.tokens[key]);
  const error = useStore(oauth, (s) => s.errors[key]);
  const waiting = useStore(oauth, (s) => (s.waiting?.key === key ? s.waiting : undefined));
  const [busy, setBusy] = useState(false);
  // "Expira em" anda sozinho.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const obtain = () => {
    setBusy(true);
    getToken(a)
      .catch(() => {}) // o erro fica no store e aparece abaixo
      .finally(() => setBusy(false));
  };

  const step = nextStep(token, a.grant, now);
  const status = !token
    ? "Sem token."
    : step === "use"
      ? `Token válido${token.expiresAt ? ` · expira em ${inTime(token.expiresAt - now)}` : ""}`
      : step === "refresh"
        ? "Token expirado · renova sozinho no próximo envio"
        : "Token expirado";

  return (
    <div className="grid gap-2.5 border-t border-line pt-4">
      <p role="status" className="font-mono text-[13px] text-ink tabular-nums">
        {status}
        {token?.scope && <span className="text-mute"> · escopos: {token.scope}</span>}
      </p>
      {waiting && (
        <p className="text-[15px] text-mute">
          Esperando o login no browser…{" "}
          <button
            type="button"
            onClick={() => openBrowser(waiting.url)}
            className="text-ink underline decoration-dashed underline-offset-4 hover:decoration-solid"
          >
            Abrir a página de login de novo
          </button>
        </p>
      )}
      {error && <p className="text-[15px] text-prod-text">{error}</p>}
      <div className="flex gap-2.5">
        {waiting ? (
          <button type="button" className={button} onClick={waiting.cancel}>
            Cancelar login
          </button>
        ) : (
          <button type="button" className={button} disabled={busy} onClick={obtain}>
            {busy ? "Obtendo…" : token ? "Obter novo token" : "Obter token"}
          </button>
        )}
        {token && (
          <button type="button" className={button} onClick={() => clearToken(a)}>
            Limpar token
          </button>
        )}
      </div>
      <p className="text-[15px] text-mute">
        O token fica só na memória do app, fora da coleção e do git. Como todo header enviado,
        aparece no histórico local.
        {a.grant === "client_credentials" && " Expirado, o envio pede outro sozinho."}
      </p>
    </div>
  );
}

/** Itens da command palette quando a aba ativa usa OAuth (dela ou herdado; realtime só herda). */
export function OAuthCommands(props: { run: (action: () => void) => () => void }) {
  const own = useRequest((s) => {
    const tab = activeTab(s);
    return tab.kind === "http" ? tab.auth : undefined;
  });
  const path = useRequest((s) => where(activeTab(s)));
  const { scope, parents } = useRequestContext(path);
  const auth = effectiveAuth(own ?? { type: "inherit" }, parents);
  if (auth.type !== "oauth2") return null;
  const a = resolveOAuth(auth, (text) => interpolate(text, scope.vars));
  const obtain = () =>
    getToken(a).catch((err) => useWorkspace.setState({ error: `OAuth: ${err.message}` }));
  return (
    <>
      <CommandItem onSelect={props.run(obtain)}>OAuth: obter token</CommandItem>
      <CommandItem onSelect={props.run(() => clearToken(a))}>OAuth: limpar token</CommandItem>
    </>
  );
}
