import { cn } from "cn";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { useRef } from "react";
import { create } from "zustand";
import { focusUrl } from "@/lib/utils";

// shadcn/ui (radix-lyra), ajustado ao DESIGN.md: cantos retos, fio de 1px, sem sombra nem blur.
function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

/** Botões de rodapé: a ação principal em tinta (inversão), as outras em fio. */
const dialogButton =
  "label h-[34px] w-fit border border-mute px-3.5 text-[12px] hover:shadow-[inset_0_-2px_var(--ink)]";
const dialogPrimary =
  "label h-[34px] w-fit border border-ink bg-ink px-3.5 text-[12px] text-bg hover:shadow-[inset_0_-2px_var(--bg)]";

function DialogContent({
  className,
  children,
  close = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { close?: boolean }) {
  // Quem tinha o foco ao abrir. Ao fechar, o foco volta para ele; se ele sumiu (item de menu,
  // canal renomeado), vai para a URL. Nunca fica no <body>.
  const opener = useRef<Element | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg/70 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onOpenAutoFocus={(e) => {
          opener.current = document.activeElement;
          onOpenAutoFocus?.(e);
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          const el = opener.current;
          setTimeout(() => {
            if (document.activeElement !== document.body) return; // outro diálogo pegou o foco
            if (el instanceof HTMLElement && el !== document.body && el.isConnected) el.focus();
            else focusUrl();
          });
        }}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 border border-line bg-bg p-4 text-ink outline-none sm:max-w-md duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className,
        )}
        {...props}
      >
        {children}
        {close && (
          <DialogPrimitive.Close
            aria-label="Fechar (Esc)"
            title="Fechar (Esc)"
            className="absolute top-2 right-2 grid size-8 place-items-center font-mono text-[16px] text-mute outline-offset-[-2px] hover:text-ink"
          >
            ×
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("label text-[13px]", className)} {...props} />;
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("text-[15px] text-mute", className)} {...props} />
  );
}

/** Pergunta no lugar do window.confirm: mesmo mundo visual, foco na ação principal. */
type Ask = {
  title: string;
  body: string;
  /** Ação principal (Enter). */
  confirm: string;
  /** Segunda ação opcional, ex. "Salvar e fechar"; vira a principal quando existe. */
  alt?: string;
};
type Answer = "confirm" | "alt" | "cancel";
const useAsk = create<{ ask?: Ask & { resolve: (a: Answer) => void } }>(() => ({}));

export const confirm = (ask: Ask) =>
  new Promise<Answer>((resolve) => useAsk.setState({ ask: { ...ask, resolve } }));

function ConfirmDialog() {
  const ask = useAsk((s) => s.ask);
  const primary = useRef<HTMLButtonElement>(null);
  const answer = (a: Answer) => {
    ask?.resolve(a);
    useAsk.setState({ ask: undefined });
  };
  return (
    <Dialog open={!!ask} onOpenChange={(open) => !open && answer("cancel")}>
      {ask && (
        <DialogContent
          role="alertdialog"
          className="gap-4 p-[18px]"
          // Abre com a ação principal focada: Enter confirma, Esc cancela.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            primary.current?.focus();
          }}
        >
          <DialogTitle>{ask.title}</DialogTitle>
          <DialogDescription className="text-ink-2">{ask.body}</DialogDescription>
          <div className="flex flex-wrap gap-2">
            {ask.alt && (
              <button
                ref={primary}
                type="button"
                className={dialogPrimary}
                onClick={() => answer("alt")}
              >
                {ask.alt}
              </button>
            )}
            <button
              ref={ask.alt ? undefined : primary}
              type="button"
              className={ask.alt ? dialogButton : dialogPrimary}
              onClick={() => answer("confirm")}
            >
              {ask.confirm}
            </button>
            <button type="button" className={dialogButton} onClick={() => answer("cancel")}>
              Cancelar
            </button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  dialogButton,
  dialogPrimary,
};
