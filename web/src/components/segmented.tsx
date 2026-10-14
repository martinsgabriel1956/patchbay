// Botões segmentados (DESIGN.md › Seletor de tema): o pressionado inverte.
export function Segmented<T>(props: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="label mb-2 text-[12px] text-mute">{props.label}</legend>
      <div className="inline-flex w-fit border border-mute">
        {props.options.map(([value, text]) => (
          <button
            key={text}
            type="button"
            aria-pressed={props.value === value}
            onClick={() => props.onChange(value)}
            className="label h-[34px] px-3.5 text-[12px] focus-visible:outline-offset-2 aria-pressed:bg-ink aria-pressed:text-bg aria-[pressed=false]:hover:shadow-[inset_0_-2px_var(--ink)] max-[860px]:h-11"
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
