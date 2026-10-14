// Falha de envio → uma linha em pt-BR com o próximo passo. A mensagem crua continua na tela
// (PRODUCT.md › Mostrar o que aconteceu, cru); isto só diz o que fazer com ela.

export type FailReason = "cancelled" | "timeout" | "error";

/** Texto do carimbo, igual na resposta e no histórico. */
export const STAMPS: Record<FailReason, string> = {
  cancelled: "Cancelada",
  timeout: "Timeout",
  error: "Falhou",
};

/** `fix`: onde se corrige. "url" ganha "Corrigir URL"; "env", os botões de environment. */
export type Diagnosis = { hint: string; fix?: "url" | "env" };

/** `url`: a URL da aba como foi digitada (o erro da api pode vir com o host em minúsculas). */
export function diagnose(reason: FailReason, message: string, url = ""): Diagnosis | null {
  if (reason === "cancelled") return { hint: "Você cancelou antes de a resposta chegar." };
  if (reason === "timeout")
    return {
      hint: "Sem resposta dentro do timeout. Aumente em Opções › Timeout ou veja se o servidor travou.",
    };

  const lower = message.match(/\{\{\s*([^}]+?)\s*\}\}/)?.[1];
  const variable =
    lower &&
    ([...url.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].find(
      (m) => m[1].toLowerCase() === lower.toLowerCase(),
    )?.[1] ??
      lower);
  if (variable)
    return {
      hint: `A variável {{${variable}}} não tem valor. Escolha um environment ou defina-a na coleção.`,
      fix: "env",
    };
  if (/invalid URL|unsupported protocol/i.test(message))
    return { hint: "URL inválida: confira o esquema (http, https) e se há espaços.", fix: "url" };

  const refused = message.match(/ECONNREFUSED\s+(\S+)/)?.[1];
  if (/ECONNREFUSED/.test(message))
    return {
      hint: `Nada escutando em ${refused ?? "nesse host e porta"}. O servidor está de pé nessa porta?`,
      fix: "url",
    };
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) {
    const host = message.match(/(?:ENOTFOUND|EAI_AGAIN)\s+(\S+)/)?.[1];
    return {
      hint: `Host ${host ?? "da URL"} não encontrado (DNS). Confira o nome ou a conexão.`,
      fix: "url",
    };
  }
  if (/certificate|self[- ]signed|CERT_|SSL/i.test(message))
    return {
      hint: "Certificado TLS recusado. Em dev, marque Opções › Aceitar certificado TLS inválido.",
    };
  if (/ECONNRESET|socket hang up|other side closed/i.test(message))
    return { hint: "A conexão caiu antes da resposta: o servidor reiniciou ou fechou o socket." };
  if (/file not found in the workspace/.test(message))
    return { hint: "O arquivo do body não existe no workspace. Confira o caminho em Body." };
  // Sem resposta da própria api (proxy do dev:web ou fetch do Tauri).
  if (/^502 Bad Gateway$|Failed to fetch|NetworkError|Load failed/.test(message))
    return { hint: "A api local do Patchbay não respondeu. Veja o indicador api no topo." };
  return null;
}
