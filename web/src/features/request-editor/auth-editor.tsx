// Aba Auth (request) e auth da coleção/pasta. Só edita o objeto Auth; a conversão em
// header/query acontece em lib/interpolate.ts › prepare(), logo antes do envio.
import type { Auth } from "@api/schemas";
import { Segmented } from "@/components/segmented";
import { VarInput } from "@/components/var-input";
import { type Scope, useEnvironments } from "@/features/environments/store";
import type { OAuth2 } from "@/lib/oauth";
import { OAuthPanel } from "./oauth-panel";

type AuthType = Auth["type"];
const TYPES: [AuthType, string][] = [
  ["inherit", "Herdar"],
  ["none", "Nenhuma"],
  ["bearer", "Bearer"],
  ["basic", "Basic"],
  ["apikey", "API Key"],
  ["oauth2", "OAuth 2.0"],
];
export const authName = (type: AuthType) => TYPES.find(([t]) => t === type)?.[1] ?? type;

type Fields = {
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
} & Partial<Omit<OAuth2, "type">>;

/** Troca o tipo levando o que já foi digitado; chaves sempre na mesma ordem (diff limpo no git). */
function withType(type: AuthType, prev: Auth): Auth {
  const f = prev as Fields;
  switch (type) {
    case "bearer":
      return { type, token: f.token ?? "" };
    case "basic":
      return { type, username: f.username ?? "", password: f.password ?? "" };
    case "apikey":
      return {
        type,
        key: f.key ?? "",
        value: f.value ?? "",
        in: prev.type === "apikey" ? prev.in : "header",
      };
    case "oauth2":
      return {
        type,
        grant: f.grant ?? "client_credentials",
        tokenUrl: f.tokenUrl ?? "",
        authUrl: f.authUrl ?? "",
        clientId: f.clientId ?? "",
        clientSecret: f.clientSecret ?? "",
        scope: f.scope ?? "",
        audience: f.audience ?? "",
        in: f.in ?? "header",
      };
    default:
      return { type };
  }
}

const input = "border border-line bg-bg text-ink";
const field = "px-2.5 py-1.5 font-mono text-[14px] outline-offset-[-2px] placeholder:text-mute";

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  scope?: Scope;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="label text-[12px] text-mute">{props.label}</span>
      <VarInput
        aria-label={props.label}
        spellCheck={false}
        value={props.value}
        placeholder={props.placeholder}
        scope={props.scope}
        onChange={(e) => props.onChange(e.target.value)}
        className={input}
        field={field}
      />
    </div>
  );
}

export function AuthEditor(props: {
  auth: Auth;
  onChange: (auth: Auth) => void;
  scope?: Scope;
  /** Coleção (topo) não herda de ninguém. */
  inheritable: boolean;
  /** O que "Herdar" resolve agora, e de onde vem. */
  inherited?: { auth: Auth; from?: string };
}) {
  const { auth, onChange, scope } = props;
  const types = props.inheritable ? TYPES : TYPES.filter(([t]) => t !== "inherit");

  return (
    <div className="grid max-w-xl content-start gap-4">
      <Segmented
        label="Tipo de auth"
        options={types}
        value={auth.type}
        onChange={(type) => onChange(withType(type, auth))}
      />
      {auth.type === "inherit" && (
        <p className="text-[15px] text-mute">
          {props.inherited?.from ? (
            <>
              Usa a auth de{" "}
              <code className="font-mono text-[13px] text-ink">{props.inherited.from}</code>:{" "}
              <span className="label text-ink">{authName(props.inherited.auth.type)}</span>.
            </>
          ) : (
            "Nenhuma pasta acima define auth: a request vai sem."
          )}{" "}
          {props.inherited?.from ? (
            <button
              type="button"
              onClick={() => useEnvironments.getState().edit(props.inherited?.from)}
              className="text-ink underline decoration-dashed underline-offset-4 hover:decoration-solid"
            >
              Configurar auth de {props.inherited.from}
            </button>
          ) : (
            "Para mudar, use “Configurar” no menu ⋯ da pasta."
          )}
        </p>
      )}
      {auth.type === "inherit" && props.inherited?.auth.type === "oauth2" && scope && (
        <OAuthPanel auth={props.inherited.auth} vars={scope.vars} />
      )}
      {auth.type === "none" && <p className="text-[15px] text-mute">Request sem auth.</p>}
      {auth.type === "bearer" && (
        <Field
          label="Token"
          value={auth.token}
          scope={scope}
          placeholder="{{token}}"
          onChange={(token) => onChange({ ...auth, token })}
        />
      )}
      {auth.type === "basic" && (
        <>
          <Field
            label="Usuário"
            value={auth.username}
            scope={scope}
            onChange={(username) => onChange({ ...auth, username })}
          />
          <Field
            label="Senha"
            value={auth.password}
            scope={scope}
            placeholder="{{senha}}"
            onChange={(password) => onChange({ ...auth, password })}
          />
        </>
      )}
      {auth.type === "apikey" && (
        <>
          <Field
            label="Nome"
            value={auth.key}
            scope={scope}
            placeholder="X-API-Key"
            onChange={(key) => onChange({ ...auth, key })}
          />
          <Field
            label="Valor"
            value={auth.value}
            scope={scope}
            placeholder="{{apiKey}}"
            onChange={(value) => onChange({ ...auth, value })}
          />
          <Segmented<"header" | "query">
            label="Enviar em"
            options={[
              ["header", "Header"],
              ["query", "Query"],
            ]}
            value={auth.in}
            onChange={(where) => onChange({ ...auth, in: where })}
          />
        </>
      )}
      {auth.type === "oauth2" && (
        <>
          <Segmented<OAuth2["grant"]>
            label="Grant"
            options={[
              ["client_credentials", "Client credentials"],
              ["authorization_code", "Authorization code + PKCE"],
            ]}
            value={auth.grant}
            onChange={(grant) => onChange({ ...auth, grant })}
          />
          {auth.grant === "authorization_code" && (
            <Field
              label="Auth URL"
              value={auth.authUrl}
              scope={scope}
              placeholder="https://login.exemplo.dev/authorize"
              onChange={(authUrl) => onChange({ ...auth, authUrl })}
            />
          )}
          <Field
            label="Token URL"
            value={auth.tokenUrl}
            scope={scope}
            placeholder="https://login.exemplo.dev/oauth/token"
            onChange={(tokenUrl) => onChange({ ...auth, tokenUrl })}
          />
          <Field
            label="Client ID"
            value={auth.clientId}
            scope={scope}
            onChange={(clientId) => onChange({ ...auth, clientId })}
          />
          <Field
            label="Client secret"
            value={auth.clientSecret}
            scope={scope}
            placeholder="{{clientSecret}}"
            onChange={(clientSecret) => onChange({ ...auth, clientSecret })}
          />
          <Field
            label="Scope"
            value={auth.scope}
            scope={scope}
            placeholder="read write"
            onChange={(value) => onChange({ ...auth, scope: value })}
          />
          <Field
            label="Audience (opcional)"
            value={auth.audience}
            scope={scope}
            onChange={(audience) => onChange({ ...auth, audience })}
          />
          <Segmented<"header" | "query">
            label="Enviar token em"
            options={[
              ["header", "Header Authorization: Bearer"],
              ["query", "Query access_token"],
            ]}
            value={auth.in}
            onChange={(where) => onChange({ ...auth, in: where })}
          />
          {auth.grant === "authorization_code" && (
            <p className="text-[15px] text-mute">
              Redirect URI:{" "}
              <code className="font-mono text-[13px] text-ink">
                http://127.0.0.1:&lt;porta&gt;/callback
              </code>
              , com porta livre a cada login. O provedor precisa aceitar qualquer porta em loopback
              (RFC 8252).
            </p>
          )}
          {scope ? (
            <OAuthPanel auth={auth} vars={scope.vars} />
          ) : (
            <p className="text-[15px] text-mute">Token: obtenha pela aba Auth de uma request.</p>
          )}
        </>
      )}
      {(auth.type === "bearer" ||
        auth.type === "basic" ||
        auth.type === "apikey" ||
        auth.type === "oauth2") && (
        <p className="text-[15px] text-mute">
          Segredo? Use uma variável (
          <code className="font-mono text-[13px] text-ink">{"{{token}}"}</code>) e guarde o valor em
          Segredos do environment: fica no{" "}
          <code className="font-mono text-[13px] text-ink">.env.local.json</code>, fora do git.
        </p>
      )}
    </div>
  );
}
