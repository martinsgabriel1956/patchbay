import type { HttpRequest, HttpResponse } from "@api/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { interpolate, prepare } from "./interpolate";
import {
  authorizeUrl,
  nextStep,
  type OAuth2,
  oauth,
  parseToken,
  pkce,
  resolveOAuth,
  tokenKey,
  tokenRequest,
} from "./oauth";

const auth = (patch: Partial<OAuth2> = {}): OAuth2 => ({
  type: "oauth2",
  grant: "client_credentials",
  tokenUrl: "{{idp}}/token",
  authUrl: "{{idp}}/authorize",
  clientId: "app",
  clientSecret: "{{secret}}",
  scope: "read write",
  audience: "",
  in: "header",
  ...patch,
});
const vars = { idp: "https://idp.dev", secret: "s3cr3t", base: "https://api.dev" };

const request = (patch: Partial<HttpRequest> = {}): HttpRequest => ({
  id: "1",
  name: "r",
  kind: "http",
  method: "GET",
  url: "{{base}}/me",
  params: [],
  headers: [],
  body: { type: "none" },
  auth: auth(),
  ...patch,
});

const response = (status: number, body: unknown): HttpResponse => ({
  status,
  statusText: "",
  headers: [],
  body: typeof body === "string" ? body : JSON.stringify(body),
  isBinary: false,
  truncated: false,
  timeMs: 1,
  sizeBytes: 1,
  decodedSizeBytes: 1,
});

/** Token em cache para a auth resolvida com `vars`. */
const sub = (text: string) => interpolate(text, vars);
const cache = (a: OAuth2, accessToken: string) =>
  oauth.setState({ tokens: { [tokenKey(resolveOAuth(a, sub))]: { accessToken } } });

afterEach(() => oauth.setState({ tokens: {}, errors: {} }));

describe("pkce", () => {
  it("challenge S256 do vetor da RFC 7636", async () => {
    const { challenge } = await pkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("verifier aleatório: 43 caracteres base64url, diferente a cada vez", async () => {
    const [a, b] = await Promise.all([pkce(), pkce()]);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe("nextStep (expirar e renovar)", () => {
  const now = 1_000_000;

  it("usa o token válido, e o sem expires_in", () => {
    expect(nextStep({ accessToken: "t", expiresAt: now + 60_000 }, "client_credentials", now)).toBe(
      "use",
    );
    expect(nextStep({ accessToken: "t" }, "authorization_code", now)).toBe("use");
  });

  it("perto de expirar (30s de folga) já conta como expirado", () => {
    const token = { accessToken: "t", expiresAt: now + 10_000 };
    expect(nextStep(token, "client_credentials", now)).toBe("fetch");
    expect(nextStep({ ...token, refreshToken: "r" }, "client_credentials", now)).toBe("refresh");
  });

  it("sem token: client credentials pede sozinho, authorization code pede login", () => {
    expect(nextStep(undefined, "client_credentials", now)).toBe("fetch");
    expect(nextStep(undefined, "authorization_code", now)).toBe("authorize");
    const expired = { accessToken: "t", expiresAt: now - 1 };
    expect(nextStep(expired, "authorization_code", now)).toBe("authorize");
    expect(nextStep({ ...expired, refreshToken: "r" }, "authorization_code", now)).toBe("refresh");
  });
});

describe("token endpoint", () => {
  it("form-urlencoded sem campos vazios, credenciais do cliente no body", () => {
    const a = resolveOAuth(auth(), sub);
    const req = tokenRequest(a, { grant_type: "client_credentials", scope: a.scope, audience: "" });
    expect(req.method).toBe("POST");
    expect(req.body).toEqual({
      type: "form-urlencoded",
      fields: [
        { key: "grant_type", value: "client_credentials", enabled: true },
        { key: "scope", value: "read write", enabled: true },
        { key: "client_id", value: "app", enabled: true },
        { key: "client_secret", value: "s3cr3t", enabled: true },
      ],
    });
  });

  it("lê a resposta e mantém o refresh_token anterior se não vier outro", () => {
    const now = 5_000;
    const ok = response(200, { access_token: "a2", expires_in: 3600, scope: "read" });
    expect(parseToken(ok, { accessToken: "a1", refreshToken: "r1" }, now)).toEqual({
      accessToken: "a2",
      refreshToken: "r1",
      expiresAt: now + 3_600_000,
      scope: "read",
    });
  });

  it("erro do provedor vira mensagem legível", () => {
    const bad = response(400, { error: "invalid_client", error_description: "cliente errado" });
    expect(() => parseToken(bad)).toThrow("Token endpoint respondeu 400: cliente errado");
    expect(() => parseToken(response(200, "<html>"))).toThrow(/respondeu 200/);
  });
});

describe("authorizeUrl", () => {
  it("monta a URL com PKCE e mantém a query que já existia", () => {
    const a = auth({ grant: "authorization_code", authUrl: "https://idp.dev/auth?prompt=login" });
    const url = new URL(
      authorizeUrl(a, { state: "st", challenge: "ch", redirectUri: "http://127.0.0.1:5/callback" }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      prompt: "login",
      response_type: "code",
      client_id: "app",
      redirect_uri: "http://127.0.0.1:5/callback",
      scope: "read write",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });

  it("auth URL inválida explica", () => {
    expect(() =>
      authorizeUrl(auth({ authUrl: "" }), { state: "s", challenge: "c", redirectUri: "r" }),
    ).toThrow("Auth URL inválida");
  });
});

describe("prepare com OAuth", () => {
  it("token em cache vira Authorization: Bearer (com as {{var}} da auth resolvidas)", () => {
    cache(auth(), "tok");
    const sent = prepare(request(), vars);
    expect(sent.headers).toEqual([{ key: "Authorization", value: "Bearer tok", enabled: true }]);
    expect(sent.auth).toEqual({ type: "none" });
  });

  it("em query vira access_token=", () => {
    cache(auth({ in: "query" }), "t k");
    const sent = prepare(request({ auth: auth({ in: "query" }) }), vars);
    expect(sent.url).toBe("https://api.dev/me?access_token=t%20k");
    expect(sent.headers).toEqual([]);
  });

  it("herdada da coleção; header escrito à mão ganha; sem token vai sem", () => {
    cache(auth(), "tok");
    const inherited = request({ auth: { type: "inherit" } });
    expect(prepare(inherited, vars, [{ auth: auth() }]).headers[0].value).toBe("Bearer tok");
    const manual = request({ headers: [{ key: "authorization", value: "x", enabled: true }] });
    expect(prepare(manual, vars).headers).toEqual(manual.headers);
    oauth.setState({ tokens: {} });
    expect(prepare(request(), vars).headers).toEqual([]);
  });

  it("outra configuração (outro client) não pega o token alheio", () => {
    cache(auth(), "tok");
    expect(prepare(request({ auth: auth({ clientId: "outro" }) }), vars).headers).toEqual([]);
  });
});
