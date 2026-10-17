import { useState } from "react";
import { Segmented } from "@/components/segmented";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inTauri } from "@/lib/desktop";
import { DEFAULT_SHORTCUT, type Theme, useSettings } from "./store";

const THEMES: [Theme, string][] = [
  ["dark", "Escuro"],
  ["light", "Claro"],
  ["system", "Sistema"],
];
const ON_OFF: [boolean, string][] = [
  [true, "Ligado"],
  [false, "Desligado"],
];

/** Atalho em edição: só registra ao sair do campo ou com Enter (não a cada tecla). */
function ShortcutField() {
  const { globalShortcut, update } = useSettings();
  const [draft, setDraft] = useState(globalShortcut);
  const commit = () => update({ globalShortcut: draft.trim() || DEFAULT_SHORTCUT });
  return (
    <label className="grid gap-1.5">
      <span className="label text-[12px] text-mute">Teclas</span>
      <input
        spellCheck={false}
        value={draft}
        placeholder={DEFAULT_SHORTCUT}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="border border-line bg-bg px-2.5 py-1.5 font-mono text-[14px] text-ink outline-offset-[-2px] placeholder:text-mute"
      />
      <span className="text-[15px] text-mute">
        Ex.: <code className="font-mono text-[13px] text-ink">CommandOrControl+Alt+P</code>,{" "}
        <code className="font-mono text-[13px] text-ink">Super+Shift+Space</code>.
      </span>
    </label>
  );
}

export function SettingsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { theme, closeToTray, shortcutOn, shortcutError, notifyRealtime, update } = useSettings();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-6 overflow-y-auto p-[18px]">
        <DialogTitle>Configurações</DialogTitle>
        <DialogDescription className="sr-only">
          Tema, janela, atalho global e notificações
        </DialogDescription>
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
        <div className="grid gap-3">
          <Segmented
            label="Atalho global: mostrar / esconder a janela"
            options={ON_OFF}
            value={shortcutOn}
            onChange={(value) => update({ shortcutOn: value })}
          />
          {shortcutOn && <ShortcutField />}
          {shortcutOn && shortcutError && (
            <p role="alert" className="text-[15px] text-prod-text">
              {shortcutError}
            </p>
          )}
        </div>
        <Segmented
          label="Notificar mensagem WS/SSE com a janela escondida"
          options={ON_OFF}
          value={notifyRealtime}
          onChange={(value) => update({ notifyRealtime: value })}
        />
        {!inTauri && (
          <p className="text-[15px] text-mute">
            Atalho global e notificações só funcionam no app desktop.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { THEMES };
