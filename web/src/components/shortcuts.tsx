// Folha de atalhos (PRODUCT.md › Toda ação tem atalho): na coluna da resposta vazia e em
// "Atalhos" na palette (Ctrl /). Uma lista só, para não divergir do que o App faz.
import { mod } from "@/lib/utils";

export const SHORTCUTS: [string, string][] = [
  [mod("↵"), "Enviar"],
  [mod("Shift ↵"), "Enviar mesmo com variável sem valor"],
  ["Esc", "Cancelar a request em voo"],
  [mod("S"), "Salvar"],
  [mod("T"), "Nova request"],
  [mod("W"), "Fechar aba"],
  [mod("Tab"), "Próxima aba (com Shift, a anterior)"],
  [mod("1–9"), "Abrir o canal pelo número"],
  [mod("L"), "Ir para a URL"],
  [mod("B"), "Mostrar ou ocultar coleções"],
  [mod("K"), "Command palette"],
  ["F2", "Renomear o canal focado no trilho"],
  ["Delete", "Deletar o canal focado no trilho"],
  [mod("Z"), "Desfazer o último deletar (fora de campos)"],
  [mod("/"), "Esta lista"],
];

export function ShortcutList() {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3.5 gap-y-1.5">
      {SHORTCUTS.map(([keys, action]) => (
        <div key={keys} className="contents">
          <dt>
            <kbd className="kbd inline-block whitespace-nowrap">{keys}</kbd>
          </dt>
          <dd className="text-[15px] text-ink-2">{action}</dd>
        </div>
      ))}
    </dl>
  );
}
