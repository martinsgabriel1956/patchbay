// Parser de text/event-stream (WHATWG HTML › Server-sent events › Parsing an event stream).
// Recebe os bytes em pedaços quaisquer e devolve os eventos completos de cada pedaço.

export type SseEvent = { data: string; event?: string; id?: string };

const EOL = /\r\n|\r|\n/g;

export function sseParser() {
  // UTF-8 em streaming; o TextDecoder já descarta o BOM do início do stream (ignoreBOM: false).
  const decoder = new TextDecoder();
  let buffer = "";
  let data = "";
  let event = "";
  let id: string | undefined;

  const line = (text: string, out: SseEvent[]) => {
    // Linha vazia despacha o bloco; sem data, o bloco é descartado.
    if (text === "") {
      if (data !== "") {
        out.push({
          data: data.slice(0, -1),
          ...(event && { event }),
          ...(id !== undefined && { id }),
        });
      }
      data = "";
      event = "";
      id = undefined;
      return;
    }
    if (text.startsWith(":")) return; // comentário
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data += `${value}\n`;
    else if (field === "event") event = value;
    else if (field === "id" && !value.includes("\0")) id = value;
    // "retry" só serve para reconexão automática, que o Patchbay não faz; campo desconhecido é ignorado.
  };

  /** Sem chunk = fim do stream: um CR pendente vale como fim de linha. */
  return (chunk?: Uint8Array): SseEvent[] => {
    buffer += chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode();
    const out: SseEvent[] = [];
    let start = 0;
    EOL.lastIndex = 0;
    for (let m = EOL.exec(buffer); m; m = EOL.exec(buffer)) {
      // CR no fim do pedaço pode ser metade de um CRLF: espera o próximo pedaço.
      if (chunk && m[0] === "\r" && m.index === buffer.length - 1) break;
      line(buffer.slice(start, m.index), out);
      start = EOL.lastIndex;
    }
    buffer = buffer.slice(start);
    return out;
  };
}
