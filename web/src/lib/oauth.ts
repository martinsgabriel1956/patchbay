// OAuth 2.0 (client credentials e authorization code + PKCE). Toda request ao provedor passa
// pelo /send (a api só move bytes); a volta do browser no authorization code chega por um
// listener temporário da api (/oauth/listen). Tokens ficam só em memória: nunca vão para a
// coleção nem para o .env.local.json (a troca com o provedor nem entra no histórico; a request
// que usa o token entra, com o header, como no Bearer). Fechar o app = pedir token de novo.
import type { Auth, HttpRequest, HttpResponse } from "@api/schemas";
import { createStore } from "zustand/vanilla";
import { api } from "./api-client";
import { openBrowser } from "./desktop";

export type OAuth2 = Extract<Auth, { type: "oauth2" }>;
export type Token = {
  accessToken: string;
  refreshToken?: string;
  /** ms desde a época; sem expires_in na resposta, vale até o servidor recusar. */
  expiresAt?: number;
  scope?: string;
};

export const oauth = createStore<{
  /** tokenKey → token. */
  tokens: Record<string, Token>;
  /** Login no browser em andamento (authorization code): a URL, para abrir de novo. */
  waiting?: { key: string; url: string; cancel: () => void };
  /** tokenKey → último erro ao obter token. */
  errors: Record<string, string>;
}>(() => ({ tokens: {}, errors: {} }));

/** Auth com as `{{var}}` substituídas (sub = interpolate com o escopo da request). */
export const resolveOAuth = (auth: OAuth2, sub: (text: string) => string): OAuth2 => ({
  ...auth,
  tokenUrl: sub(auth.tokenUrl),
  authUrl: sub(auth.authUrl),
  clientId: sub(auth.clientId),
  clientSecret: sub(auth.clientSecret),
  scope: sub(auth.scope),
  audience: sub(auth.audience),
});

/** Mesma configuração resolvida = mesmo token (requests que herdam da coleção o dividem). */
export const tokenKey = (a: OAuth2) =>
  JSON.stringify([a.grant, a.tokenUrl, a.authUrl, a.clientId, a.scope, a.audience]);

/** Margem para não mandar um token que expira no caminho. */
const SKEW_MS = 30_000;

/** O que fazer antes de enviar: usar o token, renovar com o refresh_token, pedir outro sozinho
 *  (client credentials) ou pedir o login no browser (authorization code, só por ação do usuário). */
export function nextStep(token: Token | undefined, grant: OAuth2["grant"], now = Date.now()) {
  if (token && (token.expiresAt === undefined || now < token.expiresAt - SKEW_MS)) return "use";
  if (token?.refreshToken) return "refresh";
  return grant === "client_credentials" ? "fetch" : "authorize";
}

export const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** PKCE S256 (RFC 7636): verifier de 43 caracteres, challenge = base64url(sha256(verifier)). */
export async function pkce(verifier = random()) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** URL de login do authorization code. Parâmetros que já estejam na authUrl ficam. */
export function authorizeUrl(
  a: OAuth2,
  p: { state: string; challenge: string; redirectUri: string },
) {
  let url: URL;
  try {
    url = new URL(a.authUrl);
  } catch {
    throw new Error(`Auth URL inválida: ${a.authUrl || "(vazia)"}`);
  }
  const params = {
    response_type: "code",
    client_id: a.clientId,
    redirect_uri: p.redirectUri,
    scope: a.scope,
    audience: a.audience,
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  };
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

/** POST form-urlencoded no token endpoint. Credenciais do cliente no body
 *  (client_secret_post); campos vazios não vão. */
export function tokenRequest(a: OAuth2, params: Record<string, string>): HttpRequest {
  const fields = Object.entries({
    ...params,
    client_id: a.clientId,
    client_secret: a.clientSecret,
  })
    .filter(([, value]) => value)
    .map(([key, value]) => ({ key, value, enabled: true }));
  return {
    id: "oauth-token",
    name: "OAuth token",
    kind: "http",
    method: "POST",
    url: a.tokenUrl,
    params: [],
    headers: [{ key: "Accept", value: "application/json", enabled: true }],
    body: { type: "form-urlencoded", fields },
    auth: { type: "none" },
  };
}

/** Resposta do token endpoint → Token. Sem refresh_token novo, fica o anterior (RFC 6749 §6). */
export function parseToken(res: HttpResponse, previous?: Token, now = Date.now()): Token {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(res.body);
  } catch {
    // body não-JSON: cai no erro abaixo com o status
  }
  const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : undefined);
  const accessToken = str("access_token");
  if (res.status >= 400 || !accessToken) {
    const reason = str("error_description") ?? str("error") ?? res.body.slice(0, 200);
    throw new Error(`Token endpoint respondeu ${res.status}: ${reason || res.statusText}`);
  }
  const expiresIn = Number(data.expires_in);
  return {
    accessToken,
    refreshToken: str("refresh_token") ?? previous?.refreshToken,
    expiresAt: expiresIn > 0 ? now + expiresIn * 1000 : undefined,
    scope: str("scope") ?? previous?.scope,
  };
}

async function fetchToken(a: OAuth2, params: Record<string, string>, previous?: Token) {
  if (!a.tokenUrl) throw new Error("OAuth: falta a Token URL.");
  const res = await api("/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Fora do histórico: o body leva o client_secret.
    body: JSON.stringify({ ...tokenRequest(a, params), history: false }),
  });
  const token = parseToken(await res.json(), previous);
  const key = tokenKey(a);
  oauth.setState((s) => {
    const { [key]: _, ...errors } = s.errors;
    return { tokens: { ...s.tokens, [key]: token }, errors };
  });
  return token;
}

const clientCredentials = (a: OAuth2) =>
  fetchToken(a, { grant_type: "client_credentials", scope: a.scope, audience: a.audience });

/** Authorization code + PKCE: listener da api, browser do sistema, troca do code por token. */
async function authorize(a: OAuth2) {
  oauth.getState().waiting?.cancel();
  const state = random();
  const { verifier, challenge } = await pkce();
  const listen = await api("/oauth/listen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const { port } = (await listen.json()) as { port: number };
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const url = authorizeUrl(a, { state, challenge, redirectUri });
  const controller = new AbortController();
  oauth.setState({ waiting: { key: tokenKey(a), url, cancel: () => controller.abort() } });
  try {
    await openBrowser(url);
    const res = await api(`/oauth/listen/${port}`, { signal: controller.signal });
    const { code } = (await res.json()) as { code: string };
    return await fetchToken(a, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
  } finally {
    if (oauth.getState().waiting?.url === url) oauth.setState({ waiting: undefined });
  }
}

/** Botão "Obter token" (e palette): sempre um token novo. Erro fica em `errors` e é relançado. */
export async function getToken(a: OAuth2) {
  try {
    return a.grant === "client_credentials" ? await clientCredentials(a) : await authorize(a);
  } catch (err) {
    const message = (err as Error).name === "AbortError" ? "Login cancelado." : String(err);
    const clean = message.replace(/^Error: /, "");
    oauth.setState((s) => ({ errors: { ...s.errors, [tokenKey(a)]: clean } }));
    throw new Error(clean);
  }
}

export function clearToken(a: OAuth2) {
  const key = tokenKey(a);
  oauth.setState((s) => {
    const { [key]: _, ...tokens } = s.tokens;
    const { [key]: __, ...errors } = s.errors;
    return { tokens, errors };
  });
}

/** Antes de enviar: garante um token válido, renovando se preciso. Auth que não é OAuth passa.
 *  sub = interpolate com o escopo da request. */
export async function ensureAuth(auth: Auth, sub: (text: string) => string) {
  if (auth.type !== "oauth2") return;
  const a = resolveOAuth(auth, sub);
  const token = oauth.getState().tokens[tokenKey(a)];
  const step = nextStep(token, a.grant);
  if (step === "use") return;
  if (step === "refresh" && token?.refreshToken) {
    try {
      return void (await fetchToken(
        a,
        { grant_type: "refresh_token", refresh_token: token.refreshToken, scope: a.scope },
        token,
      ));
    } catch {
      clearToken(a); // refresh_token vencido ou revogado: recomeça do zero
      if (a.grant === "authorization_code") throw new Error(LOGIN_AGAIN);
    }
  }
  if (a.grant === "client_credentials") return void (await clientCredentials(a));
  throw new Error(LOGIN_AGAIN);
}

const LOGIN_AGAIN =
  "OAuth: sem token válido. Use “Obter token” na aba Auth (ou na command palette) e envie de novo.";

/** Token em cache para a auth já resolvida (prepare() o põe no header ou na query). */
export const cachedToken = (a: OAuth2) => oauth.getState().tokens[tokenKey(a)];
