import type { TreeEntry } from "@api/schemas";
import { useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { api } from "@/lib/api-client";

const allFiles = (entries: TreeEntry[]): string[] =>
  entries.flatMap((e) => (e.type === "dir" ? allFiles(e.children ?? []) : [e.path]));

/** Botão que escolhe um arquivo do workspace (a api só envia arquivos de dentro dele). */
export function FilePicker(props: {
  label: string;
  onPick: (path: string) => void;
  className?: string;
}) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();

  const open = async () => {
    setError(undefined);
    setPaths([]);
    try {
      // Árvore lida na hora: pega arquivos que acabaram de ser copiados para o workspace.
      const found = allFiles(await (await api("/files/tree")).json());
      setPaths((p) => p && found); // fechado antes da resposta continua fechado
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <button type="button" aria-label={props.label} onClick={open} className={props.className}>
        Escolher…
      </button>
      <CommandDialog
        title="Escolher arquivo do workspace"
        open={paths !== null}
        onOpenChange={(o) => !o && setPaths(null)}
      >
        <CommandInput placeholder="Arquivo do workspace…" />
        <CommandList>
          <CommandEmpty>{error ?? "Nenhum arquivo no workspace."}</CommandEmpty>
          {paths?.map((path) => (
            <CommandItem
              key={path}
              value={path}
              onSelect={() => {
                props.onPick(path);
                setPaths(null);
              }}
              className="font-mono normal-case tracking-normal"
            >
              {path}
            </CommandItem>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
