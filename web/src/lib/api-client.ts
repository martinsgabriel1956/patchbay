// Fala com a api/. No Tauri, porta e token vêm do invoke("api_info").
// Em dev:web, vai para /api no próprio Vite, cujo proxy aponta para a porta fixa e injeta o token.
import { apiInfo, inTauri } from "./desktop";

const target: Promise<{ base: string; token?: string }> = inTauri
  ? apiInfo().then(({ port, token }) => ({ base: `http://127.0.0.1:${port}`, token }))
  : Promise.resolve({ base: "/api" });

export async function api(path: string, init: RequestInit = {}) {
  const { base, token } = await target;
  const headers: Record<string, string> = token ? { "x-session-token": token } : {};
  const res = await fetch(base + path, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.error ?? `${res.status} ${res.statusText}`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res;
}

/** WebSocket com o /realtime. O browser não manda header no upgrade: o token vai como
 *  subprotocolo (nunca na URL) e a api responde só "patchbay". Em dev:web o proxy injeta. */
export async function realtime() {
  const { base, token } = await target;
  const url = new URL(`${base}/realtime`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(url, token ? ["patchbay", `patchbay.token.${token}`] : ["patchbay"]);
}
