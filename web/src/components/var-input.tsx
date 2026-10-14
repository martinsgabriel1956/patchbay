// Input com {{var}} destacadas (DESIGN.md › Inputs › Variáveis): definida em tinta 600 com
// sublinhado tracejado; indefinida em prod-text. Um espelho atrás do input desenha o texto
// colorido; o input fica com texto transparente por cima (caret, seleção e teclado nativos).
// O title mostra o texto resolvido (segredos mascarados).
import { cn } from "cn";
import { type ComponentProps, useRef } from "react";
import type { Scope } from "@/features/environments/store";
import { interpolate, parts } from "@/lib/interpolate";

const mark = "underline decoration-dashed decoration-1 underline-offset-4";

export function VarInput({
  scope,
  value,
  className,
  field,
  ...props
}: Omit<ComponentProps<"input">, "value"> & {
  value: string;
  scope?: Scope;
  /** Classes de texto (padding, fonte) comuns ao input e ao espelho. className vai no contêiner. */
  field?: string;
}) {
  const mirror = useRef<HTMLDivElement>(null);
  const pieces = scope && value.includes("{{") ? parts(value) : null;
  const vars = pieces?.some((p) => p.name) ? pieces : null;
  const sync = (e: { currentTarget: HTMLInputElement }) => {
    if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={mirror}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center overflow-hidden",
          field,
        )}
      >
        {vars && (
          <span className="shrink-0 whitespace-pre">
            {vars.map((p, i) =>
              p.name === undefined ? (
                p.text
              ) : (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: pedaços do texto; a posição é a identidade
                  key={i}
                  className={cn(
                    mark,
                    Object.hasOwn(scope?.vars ?? {}, p.name) ? "font-semibold" : "text-prod-text",
                  )}
                >
                  {p.text}
                </span>
              ),
            )}
          </span>
        )}
      </div>
      <input
        {...props}
        value={value}
        title={vars && scope ? interpolate(value, scope.display) : props.title}
        onScroll={sync}
        onSelect={sync}
        className={cn(
          "relative size-full bg-transparent",
          field,
          vars && "text-transparent caret-ink",
        )}
      />
    </div>
  );
}
