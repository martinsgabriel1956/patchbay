// Folha de atalhos (PRODUCT.md › Toda ação tem atalho): na coluna da resposta vazia e em
// "Atalhos" na palette (Ctrl /). Uma lista só, para não divergir do que o App faz.
import { mod } from "@/lib/utils";

export const SHORTCUTS: [string, string][] = [
  [mod("↵"), "Enviar (WebSocket/SSE: conectar, e conectado, enviar a mensagem)"],
  [mod("Shift ↵"), "Enviar mesmo com variável sem valor"],
  ["Esc", "Cancelar a request em voo"],
  [mod("S"), "Salvar"],
  [mod("T"), "Nova request"],
  [mod("W"), "Fechar aba"],
  [mod("Shift T"), "Reabrir a última aba fechada"],
  [mod("Tab"), "Próxima aba (com Shift, a anterior)"],
  [mod("1–9"), "Abrir o canal pelo número (fixo, gravado no arquivo)"],
  [mod("L"), "Ir para a URL"],
  [mod("F"), "Buscar no body da resposta (num editor, nele; Enter e F3 andam)"],
  [mod("E"), "Escolher o environment (com Shift, pula para o próximo)"],
  [mod("B"), "Mostrar ou ocultar coleções (e ir até elas)"],
  [mod("K"), "Command palette: o resto, e busca no histórico"],
  ["↑ ↓", "Andar pelas coleções e pelo histórico (→ menu ⋯, Esc volta à URL)"],
  ["F2", "Renomear a request focada nas coleções"],
  ["Delete", "Deletar a request focada nas coleções"],
  [mod("Z"), "Desfazer o último deletar (fora de campos)"],
  [mod("/"), "Esta lista"],
];

/** Os atalhos e as duas coisas que não se adivinham: variáveis e o que só existe na palette. */
export function ShortcutList() {
  return (
    <div className="grid gap-4">
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
      <p className="max-w-[64ch] text-[15px] text-ink-2">
        <code className="font-mono text-[14px] text-ink">{"{{nome}}"}</code> na URL, nos headers e
        no body vira o valor do environment ativo. Sem valor, fica em vermelho e a request não sai
        até você escolher outro environment, definir o valor ou enviar assim mesmo.
      </p>
      <p className="max-w-[64ch] text-[15px] text-ink-2">
        Só na palette: nova request WebSocket ou SSE, copiar como cURL, importar do Postman ou
        Insomnia, duplicar, nova pasta, tema, filtrar o JSON da resposta por caminho. Colar um
        comando curl na URL preenche a request.
      </p>
    </div>
  );
}
