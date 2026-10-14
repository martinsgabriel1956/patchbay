import type { KV } from "@api/schemas";
import { VarInput } from "@/components/var-input";
import type { Scope } from "@/features/environments/store";

const field = "px-2.5 py-1.5 font-mono text-[14px] outline-offset-[-2px]";
const head = "label bg-bg px-2.5 py-1.5 text-[12px] text-mute";

/** Tabela chave/valor. A última linha está sempre vazia: digitar nela cria uma nova. */
export function KvTable(props: {
  label: string;
  rows: KV[];
  onChange: (rows: KV[]) => void;
  /** Com scope, {{var}} aparecem destacadas. */
  scope?: Scope;
}) {
  const { rows, onChange } = props;
  const all = [...rows, { key: "", value: "", enabled: true }];
  const update = (index: number, patch: Partial<KV>) =>
    onChange(
      index === rows.length
        ? [...rows, { ...all[index], ...patch }]
        : rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{props.label}</legend>
      <div className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1.4fr)_34px] gap-px border border-line bg-line">
        <span className="bg-bg" />
        <span className={head}>Chave</span>
        <span className={head}>Valor</span>
        <span className="bg-bg" />
        {all.map((row, index) => {
          const blank = index === rows.length;
          const name = blank ? "nova linha" : `linha ${index + 1}`;
          const color = row.enabled ? "bg-bg text-ink" : "bg-bg text-mute";
          const cell = `${field} ${row.enabled ? "" : "line-through"}`;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: linhas não têm id; a posição é a identidade
            <div key={index} className="contents">
              <span className="grid place-items-center bg-bg">
                {!blank && (
                  <input
                    type="checkbox"
                    aria-label={`Ativar ${name}`}
                    checked={row.enabled}
                    onChange={(e) => update(index, { enabled: e.target.checked })}
                    className="size-3.5 accent-ink"
                  />
                )}
              </span>
              <VarInput
                aria-label={`Chave da ${name}`}
                placeholder={blank ? "nova chave" : ""}
                value={row.key}
                scope={props.scope}
                onChange={(e) => update(index, { key: e.target.value })}
                className={color}
                field={`${cell} placeholder:text-mute`}
              />
              <VarInput
                aria-label={`Valor da ${name}`}
                value={row.value}
                scope={props.scope}
                onChange={(e) => update(index, { value: e.target.value })}
                className={color}
                field={cell}
              />
              <span className="grid bg-bg">
                {!blank && (
                  <button
                    type="button"
                    aria-label={`Remover ${name}`}
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
  );
}
