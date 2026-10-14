import { Command as CommandPrimitive } from "cmdk";
import { cn } from "cn";
import type * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// shadcn/ui (radix-lyra), ajustado ao DESIGN.md: item ativo por inversão, sem ícones.
// Busca por substring (não fuzzy): "tema" acha só "Tema: …", nunca "imporTar colEção (postMAn".
// Várias palavras valem todas, em qualquer ordem: "post localhost:1".
const contains = (value: string, search: string, keywords?: string[]) => {
  const text = [value, ...(keywords ?? [])].join(" ").toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => text.includes(w))
    ? 1
    : 0;
};

function CommandDialog({
  title,
  children,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title: string;
  onCloseAutoFocus?: (e: Event) => void;
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className="top-1/3 translate-y-0 gap-0 p-0 sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <CommandPrimitive filter={contains} className="flex size-full flex-col overflow-hidden">
          {children}
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <CommandPrimitive.Input
      className={cn(
        "h-11 w-full border-b border-line bg-transparent px-3.5 font-mono text-sm outline-hidden placeholder:text-mute",
        className,
      )}
      {...props}
    />
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-[min(60vh,420px)] overflow-y-auto py-1.5", className)}
      {...props}
    />
  );
}

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="px-3.5 py-6 text-[15px] text-mute" {...props} />;
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "pb-1.5 [&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-mute",
        className,
      )}
      {...props}
    />
  );
}

/** Atalho à direita do item; herda a cor para continuar legível na inversão. */
function CommandShortcut(props: { children: React.ReactNode }) {
  return (
    <span className="ml-auto pl-4 font-mono text-[12px] font-normal tracking-normal normal-case">
      {props.children}
    </span>
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "label flex cursor-default items-center gap-2 px-3.5 py-1.5 select-none data-selected:bg-ink data-selected:text-bg",
        className,
      )}
      {...props}
    />
  );
}

export {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
};
