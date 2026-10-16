// Filtro da resposta JSON: um caminho simples, não JSONPath inteiro. `$` e o ponto inicial são
// opcionais: `data.items[0].name`, `$.data.items[*].id`, `[-1]`, `meta["x.y"]`.

const SEGMENT = /\.([^.[\]]+)|\[(\*|-?\d+|"(?:[^"\\]|\\.)*")\]/y;

/** Um passo: chave de objeto ou índice de array (negativo conta do fim). Sem nada: []. */
function step(node: unknown, key: string): unknown[] {
  if (Array.isArray(node)) {
    if (!/^-?\d+$/.test(key)) return [];
    const item = node.at(+key);
    return item === undefined ? [] : [item];
  }
  return node !== null && typeof node === "object" && Object.hasOwn(node, key)
    ? [(node as Record<string, unknown>)[key]]
    : [];
}

/** O pedaço de `root` em `path`. Com `*` (`.*` ou `[*]`) o resultado é a lista de tudo que
 *  casou; sem, é o valor ou undefined se não existe. Caminho malformado lança erro. */
export function pick(root: unknown, path: string): unknown {
  let rest = path.trim().replace(/^\$/, "");
  if (rest === ".") rest = "";
  if (rest && !/^[.[]/.test(rest)) rest = `.${rest}`;
  let nodes = [root];
  let many = false;
  SEGMENT.lastIndex = 0;
  while (SEGMENT.lastIndex < rest.length) {
    const at = SEGMENT.lastIndex;
    const match = SEGMENT.exec(rest);
    if (!match) throw new Error(`Caminho inválido em "${rest.slice(at)}"`);
    const key = match[1] ?? match[2];
    if (key === "*") {
      many = true;
      nodes = nodes.flatMap((n) => (n !== null && typeof n === "object" ? Object.values(n) : []));
    } else {
      const name = key.startsWith('"') ? (JSON.parse(key) as string) : key;
      nodes = nodes.flatMap((n) => step(n, name));
    }
  }
  return many ? nodes : nodes[0];
}
