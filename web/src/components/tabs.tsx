// Abas do DESIGN.md: condensadas 13px, gap 22px, inativas em apoio, a ativa em tinta com régua
// inset de 2px embaixo. Radix cuida de teclado (setas) e ARIA.
import { cn } from "cn";
import { Tabs } from "radix-ui";
import type { ComponentProps } from "react";

export const TabsRoot = Tabs.Root;

export function TabList({ className, ...props }: ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn("flex shrink-0 gap-[22px] border-b border-line px-[18px]", className)}
      {...props}
    />
  );
}

export function Tab({ className, ...props }: ComponentProps<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      className={cn(
        "label py-2.5 text-mute outline-offset-[-2px] data-[state=active]:text-ink data-[state=active]:shadow-[inset_0_-2px_var(--ink)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabPanel({ className, ...props }: ComponentProps<typeof Tabs.Content>) {
  return (
    <Tabs.Content
      className={cn("min-h-0 flex-1 overflow-auto p-[18px] outline-offset-[-2px]", className)}
      {...props}
    />
  );
}
