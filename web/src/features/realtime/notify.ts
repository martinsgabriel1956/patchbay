// Notificação nativa de mensagem WS/SSE recebida (Configurações › Notificar…). Quem decide se a
// janela está escondida é o Rust; aqui só o liga/desliga e o freio: no máximo uma tentativa por
// conexão a cada 10s, para um stream movimentado não virar uma enxurrada.
import { useRequest } from "@/features/request-editor/store";
import { useSettings } from "@/features/settings/store";
import { notify } from "@/lib/desktop";
import { useRealtime } from "./store";

const THROTTLE_MS = 10_000;
/** Conexão → id da última linha do log já vista. */
const seen: Record<string, number> = {};
/** Conexão → hora da última tentativa de notificar. */
const lastTry: Record<string, number> = {};

useRealtime.subscribe((s) => {
  for (const [key, conn] of Object.entries(s.conns)) {
    const entry = conn.log.at(-1);
    if (!entry || entry.id === seen[key]) continue;
    seen[key] = entry.id;
    if (entry.dir !== "in" || !useSettings.getState().notifyRealtime) continue;
    const now = Date.now();
    if (now - (lastTry[key] ?? 0) < THROTTLE_MS) continue;
    lastTry[key] = now;
    const tab = useRequest.getState().tabs.find((t) => t.key === key);
    const title = `${tab?.kind === "sse" ? "SSE" : "WS"} · ${tab?.name ?? "realtime"}`;
    notify(title, entry.binary ? "(mensagem binária)" : entry.data.slice(0, 200));
  }
});
