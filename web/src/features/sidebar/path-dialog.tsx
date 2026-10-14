// Um diálogo para tudo que pede nome (e pasta): salvar, criar, renomear/mover.
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type PathDialogProps = {
  title: string;
  name: string;
  /** undefined = sem seletor de pasta (ex.: coleção nova sempre fica na raiz). */
  folder?: string;
  submit: (name: string, folder: string) => Promise<void>;
};

const field =
  "border border-line bg-bg px-2.5 py-1.5 font-mono text-[14px] text-ink outline-offset-[-2px]";

function invalid(name: string) {
  if (!name) return "Dê um nome.";
  if (name.includes("/") || name.includes("\\")) return "O nome não pode ter barra.";
  if (name.startsWith(".")) return "O nome não pode começar com ponto (fica oculto).";
  if (name === "collection") return "“collection” é reservado.";
}

export function PathDialog(props: PathDialogProps & { folders: string[]; onClose: () => void }) {
  const [name, setName] = useState(props.name);
  const [folder, setFolder] = useState(props.folder);
  const [error, setError] = useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="gap-4 p-[18px]">
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription className="sr-only">Nome e pasta no workspace</DialogDescription>
        <form
          className="grid gap-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const clean = name.trim();
            const problem = invalid(clean);
            if (problem) return setError(problem);
            try {
              await props.submit(clean, folder ?? "");
              props.onClose();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <label className="grid gap-1.5">
            <span className="label text-[12px] text-mute">Nome</span>
            <input
              value={name}
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              className={field}
            />
          </label>
          {folder !== undefined && (
            <label className="grid gap-1.5">
              <span className="label text-[12px] text-mute">Pasta</span>
              <select value={folder} onChange={(e) => setFolder(e.target.value)} className={field}>
                {props.folders.map((path) => (
                  <option key={path} value={path}>
                    {path ? path.split("/").join(" / ") : "Raiz do workspace"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="font-mono text-[13px] text-prod-text">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="label h-[34px] w-fit border border-mute px-3.5 text-[12px] hover:shadow-[inset_0_-2px_var(--ink)]"
          >
            Salvar
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
