// Aba Asserts do editor (mesma tabela do kv-table: última linha vazia cria uma nova) e a lista de
// resultados que a resposta e o runner mostram. Passou em tinta; falhou com o carimbo prod-text.
import type { Assert } from "@api/schemas";
import { VarInput } from "@/components/var-input";
import type { Scope } from "@/features/environments/store";
import { type Dict, useStrings } from "@/lib/i18n";
import type { AssertError, AssertResult } from "./asserts";

type Strings = {
  label: string;
  target: string;
  path: string;
  op: string;
  expected: string;
  targets: Record<Assert["target"], string>;
  ops: Record<Assert["op"], string>;
  pathHint: Record<Assert["target"], string>;
  row: (n: number | "new") => string;
  enable: string;
  remove: string;
  help: string;
  pass: string;
  fail: string;
  missing: string;
  errors: Record<AssertError, string>;
};

export const ASSERT_STRINGS: Dict<Strings> = {
  en: {
    label: "Asserts",
    target: "Target",
    path: "Header / JSON path",
    op: "Operator",
    expected: "Expected",
    targets: { status: "Status", header: "Header", time: "Time (ms)", body: "Body" },
    ops: {
      equals: "equals",
      notEquals: "not equals",
      contains: "contains",
      exists: "exists",
      lessThan: "less than",
      greaterThan: "greater than",
      matches: "matches regex",
    },
    pathHint: { status: "", header: "content-type", time: "", body: "data.items[0].id" },
    row: (n) => (n === "new" ? "new row" : `row ${n}`),
    enable: "Enable",
    remove: "Remove",
    help: "Checked after Send and by the collection runner. Body: a path like the response filter (data.items[0].id); empty compares the whole body as text. Expected accepts {{var}}.",
    pass: "pass",
    fail: "fail",
    missing: "missing",
    errors: {
      binary: "binary body",
      notJson: "body is not JSON",
      truncated: "body cut at 5 MB, JSON is incomplete",
      badPath: "invalid path",
      notNumber: "not a number",
      badRegex: "invalid regex",
    },
  },
  "pt-BR": {
    label: "Asserts",
    target: "Alvo",
    path: "Header / caminho JSON",
    op: "Operador",
    expected: "Esperado",
    targets: { status: "Status", header: "Header", time: "Tempo (ms)", body: "Body" },
    ops: {
      equals: "igual a",
      notEquals: "diferente de",
      contains: "contém",
      exists: "existe",
      lessThan: "menor que",
      greaterThan: "maior que",
      matches: "casa a regex",
    },
    pathHint: { status: "", header: "content-type", time: "", body: "data.items[0].id" },
    row: (n) => (n === "new" ? "nova linha" : `linha ${n}`),
    enable: "Ativar",
    remove: "Remover",
    help: "Conferidos depois do Enviar e no runner da coleção. Body: caminho como no filtro da resposta (data.items[0].id); vazio compara o body inteiro como texto. Esperado aceita {{var}}.",
    pass: "ok",
    fail: "falhou",
    missing: "não existe",
    errors: {
      binary: "body binário",
      notJson: "body não é JSON",
      truncated: "body cortado em 5 MB, JSON incompleto",
      badPath: "caminho inválido",
      notNumber: "não é número",
      badRegex: "regex inválida",
    },
  },
};

const TARGETS = ["status", "header", "time", "body"] as const;
const OPS = [
  "equals",
  "notEquals",
  "contains",
  "exists",
  "lessThan",
  "greaterThan",
  "matches",
] as const;
const field = "px-2.5 py-1.5 font-mono text-[14px] outline-offset-[-2px]";
const head = "label bg-bg px-2.5 py-1.5 text-[12px] text-mute";
const select = "label bg-bg px-1.5 text-[12px] outline-offset-[-2px]";

const blankAssert: Assert = {
  enabled: true,
  target: "status",
  path: "",
  op: "equals",
  expected: "",
};

/** Tabela de asserts. A última linha está sempre vazia: mexer nela cria uma nova. */
export function AssertsEditor(props: {
  rows: Assert[];
  onChange: (rows: Assert[]) => void;
  scope?: Scope;
}) {
  const t = useStrings(ASSERT_STRINGS);
  const { rows, onChange } = props;
  const all = [...rows, blankAssert];
  const update = (index: number, patch: Partial<Assert>) =>
    onChange(
      index === rows.length
        ? [...rows, { ...all[index], ...patch }]
        : rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  return (
    <div className="grid content-start gap-3.5">
      <fieldset className="min-w-0">
        <legend className="sr-only">{t.label}</legend>
        <div className="grid grid-cols-[34px_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_34px] gap-px border border-line bg-line">
          <span className="bg-bg" />
          <span className={head}>{t.target}</span>
          <span className={head}>{t.path}</span>
          <span className={head}>{t.op}</span>
          <span className={head}>{t.expected}</span>
          <span className="bg-bg" />
          {all.map((row, index) => {
            const blank = index === rows.length;
            const name = t.row(blank ? "new" : index + 1);
            const color = row.enabled ? "bg-bg text-ink" : "bg-bg text-mute";
            const noPath = row.target === "status" || row.target === "time";
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: linhas não têm id; a posição é a identidade
              <div key={index} className="contents">
                <span className="grid place-items-center bg-bg">
                  {!blank && (
                    <input
                      type="checkbox"
                      aria-label={`${t.enable} ${name}`}
                      checked={row.enabled}
                      onChange={(e) => update(index, { enabled: e.target.checked })}
                      className="size-3.5 accent-ink"
                    />
                  )}
                </span>
                <select
                  aria-label={`${t.target} · ${name}`}
                  value={row.target}
                  onChange={(e) => update(index, { target: e.target.value as Assert["target"] })}
                  className={`${select} ${row.enabled ? "text-ink" : "text-mute"}`}
                >
                  {TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {t.targets[target]}
                    </option>
                  ))}
                </select>
                {noPath ? (
                  <span className={`${field} bg-bg text-mute`}>—</span>
                ) : (
                  <VarInput
                    aria-label={`${t.path} · ${name}`}
                    placeholder={t.pathHint[row.target]}
                    spellCheck={false}
                    value={row.path}
                    scope={props.scope}
                    onChange={(e) => update(index, { path: e.target.value })}
                    className={color}
                    field={`${field} placeholder:text-mute`}
                  />
                )}
                <select
                  aria-label={`${t.op} · ${name}`}
                  value={row.op}
                  onChange={(e) => update(index, { op: e.target.value as Assert["op"] })}
                  className={`${select} ${row.enabled ? "text-ink" : "text-mute"}`}
                >
                  {OPS.map((op) => (
                    <option key={op} value={op}>
                      {t.ops[op]}
                    </option>
                  ))}
                </select>
                {row.op === "exists" ? (
                  <span className={`${field} bg-bg text-mute`}>—</span>
                ) : (
                  <VarInput
                    aria-label={`${t.expected} · ${name}`}
                    spellCheck={false}
                    value={row.expected}
                    scope={props.scope}
                    onChange={(e) => update(index, { expected: e.target.value })}
                    className={color}
                    field={field}
                  />
                )}
                <span className="grid bg-bg">
                  {!blank && (
                    <button
                      type="button"
                      aria-label={`${t.remove} ${name}`}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      className="font-mono text-[14px] text-mute outline-offset-[-2px] hover:text-ink"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </fieldset>
      <p className="max-w-[64ch] text-[15px] text-mute">{t.help}</p>
    </div>
  );
}

/** "body data.id igual a 7", no idioma da interface. */
export function useDescribe() {
  const t = useStrings(ASSERT_STRINGS);
  return (a: Assert) =>
    [
      t.targets[a.target],
      a.target === "header" || a.target === "body" ? a.path : "",
      t.ops[a.op],
      a.op === "exists" ? "" : a.expected,
    ]
      .filter(Boolean)
      .join(" ");
}

/** Um resultado por linha: carimbo, o assert e o valor que veio quando falhou. */
export function AssertResults({ results }: { results: AssertResult[] }) {
  const t = useStrings(ASSERT_STRINGS);
  const describe = useDescribe();
  return (
    <ul className="grid gap-1.5 font-mono text-[13px]">
      {results.map((r, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: asserts não têm id; a ordem é a da lista
        <li key={index} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2.5">
          {r.pass ? (
            <span className="label w-fit border-2 border-transparent px-1.5 text-[11px] text-ink">
              {t.pass}
            </span>
          ) : (
            <span className="label w-fit border-2 border-prod-text px-1.5 text-[11px] text-prod-text">
              {t.fail}
            </span>
          )}
          <span className="min-w-0 break-words">
            <span className="text-ink">{describe(r.assert)}</span>
            {!r.pass && (
              <span className="text-ink-2">
                {" → "}
                {r.error
                  ? `${t.errors[r.error]}${r.detail ? ` (${r.detail})` : ""}`
                  : (r.actual ?? t.missing)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
