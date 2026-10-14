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
  if (/EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|Connect Timeout/i.test(message))
    return {
      hint: "O host não respondeu à conexão (inalcançável ou bloqueado). Confira o IP, a VPN ou o firewall.",
      fix: "url",
    };
  // Realtime: o servidor respondeu, mas não abriu o WebSocket / stream SSE.
  const status = message.match(/Unexpected server response: (\d{3})|^HTTP (\d{3})/);
  if (status)
    return {
      hint: `O servidor respondeu HTTP ${status[1] ?? status[2]} em vez de abrir a conexão. Confira o caminho, a auth e os headers.`,
      fix: "url",
    };
  const type = message.match(/expected Content-Type text\/event-stream, got "([^"]*)"/);
  if (type)
    return {
      hint: `Esse endpoint não é um stream SSE: respondeu ${type[1] || "sem Content-Type"}. Confira o caminho.`,
      fix: "url",
    };
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
