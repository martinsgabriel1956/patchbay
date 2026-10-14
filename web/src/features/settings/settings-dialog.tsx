import { Segmented } from "@/components/segmented";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { type Theme, useSettings } from "./store";

const THEMES: [Theme, string][] = [
  ["dark", "Escuro"],
  ["light", "Claro"],
  ["system", "Sistema"],
];

export function SettingsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { theme, closeToTray, update } = useSettings();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="gap-6 p-[18px]">
        <DialogTitle>Configurações</DialogTitle>
        <DialogDescription className="sr-only">Tema e comportamento da janela</DialogDescription>
        <Segmented
          label="Tema"
          options={THEMES}
          value={theme}
          onChange={(value) => update({ theme: value })}
        />
        <Segmented
          label="Ao fechar a janela"
          options={[
            [true, "Minimizar para a bandeja"],
            [false, "Sair"],
          ]}
          value={closeToTray}
          onChange={(value) => update({ closeToTray: value })}
        />
      </DialogContent>
    </Dialog>
  );
}

export { THEMES };
