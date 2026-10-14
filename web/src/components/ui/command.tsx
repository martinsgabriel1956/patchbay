import { Command as CommandPrimitive } from "cmdk";
import { cn } from "cn";
import type * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// shadcn/ui (radix-lyra), ajustado ao DESIGN.md: item ativo por inversão, sem ícones.
function CommandDialog({
  title,
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & { title: string }) {
  return (
    <Dialog {...props}>
      <DialogContent className="top-1/3 translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <CommandPrimitive className="flex size-full flex-col overflow-hidden">
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
      className={cn("max-h-72 overflow-y-auto py-1.5", className)}
      {...props}
    />
  );
}

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="px-3.5 py-6 text-[15px] text-mute" {...props} />;
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

export { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList };
