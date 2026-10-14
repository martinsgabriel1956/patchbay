import type { HttpResponse } from "@api/schemas";
import { Fragment, useMemo, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { ShortcutList } from "@/components/shortcuts";
import { Tab, TabList, TabPanel, TabsRoot } from "@/components/tabs";
import { useCurrentEnvironments } from "@/features/environments/env-bar";
import { useEnvironments } from "@/features/environments/store";
import { activeTab, useRequest } from "@/features/request-editor/store";
import { focusUrl, isMac, mod } from "@/lib/utils";
import { diagnose, STAMPS } from "./diagnose";

// Classe de status = cor da fita (DESIGN.md › Secondary), sempre na variante *-text.
const TONES: Record<number, string> = {
  2: "text-dev-text",
  3: "text-local-text",
  4: "text-staging-text",
  5: "text-prod-text",
};
const button =
  "label h-[34px] border border-mute px-3.5 text-[12px] hover:shadow-[inset_0_-2px_var(--ink)]";

/** Botão de ação com o atalho ao lado, em mono. */
function Action(props: { onClick: () => void; children: string; keys?: string }) {
  return (
    <button type="button" onClick={props.onClick} className={button}>
      {props.children}
      {props.keys && (
        <span className="ml-1.5 font-mono font-normal tracking-normal text-mute normal-case">
          {props.keys}
        </span>
      )}
    </button>
  );
}

/** Variável sem valor: escolher outro environment (foco no seletor) ou editar os da coleção. */
function EnvActions() {
  const { collection, envs } = useCurrentEnvironments();
  if (!collection) return null;
  return (
    <>
      {envs.length > 0 && (
        <Action
          onClick={() =>
            document.querySelector<HTMLElement>("#env-select [aria-pressed=true]")?.focus()
          }
        >
          Escolher environment
        </Action>
      )}
      <Action onClick={() => useEnvironments.getState().edit(collection)}>
        Editar environments
      </Action>
    </>
  );
}

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${number.format(n / 1024)} KB`
      : `${number.format(n / 1024 / 1024)} MB`;

export function ResponseViewer() {
  const result = useRequest((s) => activeTab(s).result);
  const url = useRequest((s) => activeTab(s).url);
  const cancel = useRequest((s) => s.cancel);
  const send = useRequest((s) => s.send);

  if (result.state === "idle") {
    return (
      <div className="grid content-start gap-4 overflow-y-auto p-[18px]">
        <p className="text-[15px] text-mute">
          Nenhuma resposta ainda. Monte a request e envie com {isMac ? "⌘↵" : "Ctrl ↵"}.
        </p>
        <section aria-label="Atalhos" className="grid gap-2.5">
          <h2 className="label text-[12px] text-mute">Atalhos</h2>
          <ShortcutList />
        </section>
      </div>
    );
  }
  if (result.state === "sending") {
    return (
      <div className="flex items-center gap-2.5 p-[18px]" role="status">
        <span className="size-[9px] rounded-full bg-cord" />
        <span className="label text-cord-text">Em voo</span>
        <button type="button" onClick={cancel} className={`${button} ml-auto`}>
          Cancelar
        </button>
      </div>
    );
  }
  if (result.state === "blocked") {
    const names = result.missing.map((name) => `{{${name}}}`).join(", ");
    return (
      <div className="grid gap-3.5 p-[18px]" role="alert">
        <span className="label w-fit border-2 border-prod-text px-2 py-px text-prod-text">
          Não enviada
        </span>
        <p className="max-w-[64ch] text-[15px] text-ink">
          {result.missing.length === 1 ? "A variável " : "As variáveis "}
          <code className="font-mono text-[14px] text-prod-text">{names}</code>
          {result.missing.length === 1 ? " não tem valor" : " não têm valor"} no environment ativo.
          Escolha outro environment, defina o valor ou envie assim mesmo.
        </p>
        <div className="flex flex-wrap gap-2">
          <EnvActions />
          <Action onClick={() => send(true)} keys={mod("Shift ↵")}>
            Enviar mesmo assim
          </Action>
        </div>
      </div>
    );
  }
  if (result.state === "failed") {
    const diagnosis = diagnose(result.reason, result.message, url);
    return (
      <div className="grid gap-3.5 p-[18px]" role="alert">
        <span className="label w-fit border-2 border-prod-text px-2 py-px text-prod-text">
          {STAMPS[result.reason]}
        </span>
        {diagnosis && <p className="max-w-[64ch] text-[15px] text-ink">{diagnosis.hint}</p>}
        <p className="font-mono text-[13px] break-words text-ink-2">{result.message}</p>
        <div className="flex flex-wrap gap-2">
          {diagnosis?.fix === "url" && (
            <Action onClick={focusUrl} keys={mod("L")}>
              Corrigir URL
            </Action>
          )}
          {diagnosis?.fix === "env" && <EnvActions />}
          <Action onClick={() => send()} keys={mod("↵")}>
            Tentar de novo
          </Action>
        </div>
      </div>
    );
  }
  return <Response response={result.response} />;
}

function Response({ response }: { response: HttpResponse }) {
  const [pretty, setPretty] = useState(true);
  const type = response.headers.find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3.5 px-[18px] pt-[18px]">
        <span
          className={`font-mono text-[48px] leading-none font-semibold tabular-nums ${TONES[Math.floor(response.status / 100)] ?? "text-ink"}`}
        >
          {response.status}
        </span>
        <span className="label min-w-0 truncate text-[17px]">{response.statusText}</span>
        <div className="ml-auto inline-flex shrink-0 border border-mute">
          {(["Raw", "Pretty"] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={pretty === (name === "Pretty")}
              onClick={() => setPretty(name === "Pretty")}
              className="label px-3.5 py-[5px] text-[13px] aria-pressed:bg-ink aria-pressed:text-bg"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-4 px-[18px] py-3.5 font-mono text-[13px] tabular-nums">
        <Meta label="tempo" value={`${response.timeMs} ms`} />
        <Meta label="tamanho" value={bytes(response.sizeBytes)} />
        {response.decodedSizeBytes !== response.sizeBytes && (
          <Meta label="descomprimido" value={bytes(response.decodedSizeBytes)} />
        )}
        {response.truncated && <Meta label="truncado em" value="5 MB" />}
      </dl>

      <TabsRoot defaultValue="body" className="flex min-h-0 flex-1 flex-col">
        <TabList aria-label="Partes da resposta">
          <Tab value="body">Body</Tab>
          <Tab value="headers">Headers {response.headers.length}</Tab>
        </TabList>
        <TabPanel value="body" className="p-0">
          <Body response={response} type={type} pretty={pretty} />
        </TabPanel>
        <TabPanel value="headers">
          <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-px border border-line bg-line font-mono text-[13px]">
            {response.headers.map(([key, value], index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: headers repetem (Set-Cookie); a ordem é a identidade
              <Fragment key={index}>
                <dt className="bg-bg px-2.5 py-1 break-all text-ink">{key}</dt>
                <dd className="bg-bg px-2.5 py-1 break-all text-ink-2">{value}</dd>
              </Fragment>
            ))}
          </dl>
        </TabPanel>
      </TabsRoot>
    </div>
  );
}

function Meta(props: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-mute">{props.label}</dt>
      <dd className="font-medium text-ink">{props.value}</dd>
    </div>
  );
}

function Body({
  response,
  type,
  pretty,
}: {
  response: HttpResponse;
  type: string;
  pretty: boolean;
}) {
  const { body, isBinary } = response;
  const mime = type.split(";")[0].trim();
  const json = useMemo(() => {
    if (isBinary || !(/json/i.test(mime) || /^\s*[[{]/.test(body))) return null;
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return null; // inválido ou truncado: fica o texto cru
    }
  }, [body, isBinary, mime]);

  if (pretty && mime.startsWith("image/")) {
    const src = isBinary
      ? `data:${mime};base64,${body}`
      : `data:${mime},${encodeURIComponent(body)}`;
    return (
      <div className="p-[18px]">
        <img src={src} alt="Preview da imagem da resposta" className="max-w-full" />
      </div>
    );
  }
  if (pretty && isBinary) {
    return (
      <p className="p-[18px] text-[15px] text-mute">
        Body binário ({mime || "sem Content-Type"}). O conteúdo em base64 está em Raw.
      </p>
    );
  }
  if (!body) return <p className="p-[18px] text-[15px] text-mute">Resposta sem body.</p>;
  return (
    <CodeEditor
      label="Body da resposta"
      language={pretty && json !== null ? "json" : undefined}
      value={pretty && json !== null ? json : body}
    />
  );
}
