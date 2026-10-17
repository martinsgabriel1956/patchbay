import { useEffect } from "react";
import { CodeEditor } from "@/components/code-editor";
import { Segmented } from "@/components/segmented";
import { Tab, TabList, TabPanel, TabsRoot } from "@/components/tabs";
import { VarInput } from "@/components/var-input";
import { AssertsEditor } from "@/features/asserts/asserts-ui";
import { useRequestContext } from "@/features/environments/store";
import { useWorkspace } from "@/features/sidebar/store";
import { isCurl } from "@/lib/curl";
import { effectiveAuth } from "@/lib/interpolate";
import { isMac, modalOpen } from "@/lib/utils";
import { AuthEditor, authName } from "./auth-editor";
import { FilePicker } from "./file-picker";
import { GraphqlQuery } from "./graphql";
import { KvTable } from "./kv-table";
import { activeTab, type BodyType, type Field, useRequest, where } from "./store";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const BODY_TYPES: [BodyType, string][] = [
  ["none", "Nenhum"],
  ["json", "JSON"],
  ["text", "Texto"],
  ["xml", "XML"],
  ["form-urlencoded", "Form"],
  ["multipart", "Multipart"],
  ["binary", "Binário"],
  ["graphql", "GraphQL"],
];
const count = (rows: { key: string; enabled: boolean }[]) =>
  rows.filter((row) => row.enabled && row.key).length || "";

// Multipart: valor "@caminho" (como no curl -F) é um arquivo do workspace.
const withFiles = (fields: Field[]) =>
  fields.map((f) => (f.file === undefined ? f : { ...f, value: `@${f.file}` }));
const toFields = (rows: Field[]): Field[] =>
  rows.map(({ file: _, ...row }) =>
    row.value.startsWith("@") ? { ...row, value: "", file: row.value.slice(1) } : row,
  );

export function RequestEditor() {
  const r = useRequest(activeTab);
  const { set, setUrl, setParams, send, cancel } = useRequest.getState();
  const sending = r.result.state === "sending";
  const bodyName = BODY_TYPES.find(([type]) => type === r.bodyType)?.[1];
  const { scope, parents } = useRequestContext(where(r));
  const inheritedFrom = parents.find((p) => p.auth && p.auth.type !== "inherit")?.folder;
  const auth = effectiveAuth(r.auth, parents);

  // Ctrl+Enter envia de qualquer lugar (Shift: mesmo com variável sem valor) (inclusive de dentro do CodeMirror); Esc cancela em voo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { send, cancel, ...s } = useRequest.getState();
      if (modalOpen()) return; // Esc e Ctrl ↵ são do diálogo aberto
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        send(e.shiftKey); // Ctrl Shift ↵: envia mesmo com {{var}} sem valor
      } else if (e.key === "Escape" && activeTab(s).result.state === "sending") {
        cancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="m-[18px] mb-3.5 flex h-11 shrink-0 border border-mute"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <select
          aria-label="Método"
          value={r.method}
          onChange={(e) => set({ method: e.target.value })}
          className="label w-[84px] shrink-0 appearance-none border-r border-line bg-bg text-center text-[17px] text-ink outline-offset-[-2px]"
        >
          {METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
        <VarInput
          id="url"
          aria-label="URL"
          // Aba nova (Ctrl T, palette, +) já abre digitando a URL.
          autoFocus={!r.url}
          placeholder="https://api.exemplo.dev/recurso  ou  {{baseUrl}}/recurso"
          spellCheck={false}
          value={r.url}
          scope={scope}
          onChange={(e) => setUrl(e.target.value)}
          // Colar um comando curl preenche a request inteira.
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!isCurl(text)) return;
            e.preventDefault();
            try {
              useRequest.getState().importCurl(text);
            } catch (err) {
              useWorkspace.setState({ error: `cURL: ${(err as Error).message}` });
            }
          }}
          className="flex-1 bg-bg text-ink"
          field="px-3.5 font-mono text-[14px] outline-offset-[-2px] placeholder:text-mute"
        />
        {sending ? (
          <button
            type="button"
            onClick={cancel}
            className="label flex shrink-0 items-center gap-2.5 border-l border-line px-4 text-[16px] text-ink outline-offset-[-2px]"
          >
            Cancelar <span className="font-mono text-[12px] font-normal text-mute">Esc</span>
          </button>
        ) : (
          <button
            type="submit"
            className="label flex shrink-0 items-center gap-2.5 bg-cord px-4 focus-visible:outline-matte focus-visible:outline-offset-[-4px] text-[16px] text-matte"
          >
            Enviar
            <span className="font-mono text-[12px] font-normal normal-case tracking-normal">
              {isMac ? "⌘↵" : "Ctrl ↵"}
            </span>
          </button>
        )}
      </form>

      <TabsRoot defaultValue="params" className="flex min-h-0 flex-1 flex-col">
        <TabList aria-label="Partes da request">
          <Tab value="params">Params {count(r.params)}</Tab>
          <Tab value="headers">Headers {count(r.headers)}</Tab>
          <Tab value="body">Body {r.bodyType === "none" ? "" : bodyName}</Tab>
          <Tab value="auth">Auth {auth.type === "none" ? "" : authName(auth.type)}</Tab>
          <Tab value="options">Opções</Tab>
          <Tab value="asserts">Asserts {r.asserts?.filter((a) => a.enabled).length || ""}</Tab>
        </TabList>
        <TabPanel value="params">
          <KvTable label="Params" rows={r.params} onChange={setParams} scope={scope} />
        </TabPanel>
        <TabPanel value="headers">
          <KvTable
            label="Headers"
            rows={r.headers}
            onChange={(headers) => set({ headers })}
            scope={scope}
          />
        </TabPanel>
        <TabPanel value="body" className="flex flex-col gap-4">
          <Segmented
            label="Tipo do body"
            options={BODY_TYPES}
            value={r.bodyType}
            // GraphQL é POST: um GET passa a POST ao escolher o modo.
            onChange={(bodyType) =>
              set(
                bodyType === "graphql" && r.method === "GET"
                  ? { bodyType, method: "POST" }
                  : { bodyType },
              )
            }
          />
          {(r.bodyType === "json" || r.bodyType === "text" || r.bodyType === "xml") && (
            <div className="min-h-60 flex-1 border border-line">
              <CodeEditor
                label="Body da request"
                language={r.bodyType === "json" ? "json" : undefined}
                value={r.bodyContent}
                onChange={(bodyContent) => set({ bodyContent })}
                scope={scope}
              />
            </div>
          )}
          {r.bodyType === "form-urlencoded" && (
            <KvTable
              label="Campos do body"
              rows={r.bodyFields}
              onChange={(bodyFields) => set({ bodyFields })}
              scope={scope}
            />
          )}
          {r.bodyType === "multipart" && (
            <>
              <KvTable
                label="Campos do body"
                rows={withFiles(r.bodyFields)}
                onChange={(rows) => set({ bodyFields: toFields(rows) })}
                scope={scope}
                files
              />
              <p className="text-[15px] text-mute">
                Para enviar um arquivo do workspace, use "Escolher…" ou escreva{" "}
                <code className="font-mono text-[13px] text-ink">@caminho/no/workspace</code> no
                valor.
              </p>
            </>
          )}
          {r.bodyType === "binary" && (
            <div className="grid gap-2">
              <label htmlFor="body-file" className="label text-[12px] text-mute">
                Arquivo (caminho no workspace)
              </label>
              <div className="flex border border-line">
                <input
                  id="body-file"
                  spellCheck={false}
                  placeholder="pasta/arquivo.bin"
                  value={r.bodyFile}
                  onChange={(e) => set({ bodyFile: e.target.value })}
                  className="min-w-0 flex-1 bg-bg px-2.5 py-1.5 font-mono text-[14px] outline-offset-[-2px] placeholder:text-mute"
                />
                <FilePicker
                  label="Escolher arquivo"
                  onPick={(bodyFile) => set({ bodyFile })}
                  className="label shrink-0 border-l border-line px-3.5 text-[14px] text-ink outline-offset-[-2px]"
                />
              </div>
            </div>
          )}
          {r.bodyType === "graphql" && (
            <>
              <GraphqlQuery scope={scope} />
              <span className="label text-[12px] text-mute">Variables (JSON)</span>
              <div className="h-32 shrink-0 border border-line">
                <CodeEditor
                  label="Variables GraphQL"
                  language="json"
                  value={r.bodyVariables ?? ""}
                  onChange={(bodyVariables) => set({ bodyVariables })}
                  scope={scope}
                />
              </div>
              <p className="text-[15px] text-mute">Vai como POST JSON {"{query, variables}"}.</p>
            </>
          )}
          {r.bodyType === "none" && <p className="text-[15px] text-mute">Request sem body.</p>}
        </TabPanel>
        <TabPanel value="auth">
          <AuthEditor
            auth={r.auth}
            onChange={(auth) => set({ auth })}
            scope={scope}
            inheritable
            inherited={{ auth, from: inheritedFrom }}
          />
        </TabPanel>
        <TabPanel value="options" className="grid content-start gap-3.5 text-[15px]">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={r.options.followRedirects ?? true}
              onChange={(e) =>
                set({ options: { ...r.options, followRedirects: e.target.checked } })
              }
              className="size-3.5 accent-ink"
            />
            Seguir redirects
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={r.options.insecureTls ?? false}
              onChange={(e) => set({ options: { ...r.options, insecureTls: e.target.checked } })}
              className="size-3.5 accent-ink"
            />
            Aceitar certificado TLS inválido
          </label>
          <label className="flex items-center gap-2.5">
            Timeout
            <input
              type="number"
              min={1}
              value={r.options.timeoutMs ?? ""}
              onChange={(e) => {
                const ms = Math.round(Number(e.target.value));
                set({ options: { ...r.options, timeoutMs: ms > 0 ? ms : undefined } });
              }}
              className="w-28 border border-line bg-bg px-2.5 py-1 font-mono text-[14px] tabular-nums"
            />
            <span className="font-mono text-[13px] text-mute">ms</span>
          </label>
        </TabPanel>
        <TabPanel value="asserts">
          <AssertsEditor
            rows={r.asserts ?? []}
            onChange={(asserts) => set({ asserts })}
            scope={scope}
          />
        </TabPanel>
      </TabsRoot>
    </div>
  );
}
