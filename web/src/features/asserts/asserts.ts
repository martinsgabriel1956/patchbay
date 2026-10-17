// Asserts declarativos (sem sandbox JS): alvo → valor atual, operador, valor esperado com {{var}}.
// Puro, sem React: o editor mostra o resultado depois do Enviar e o runner usa o mesmo.
import type { Assert, HttpResponse } from "@api/schemas";
import { pick } from "@/features/response-viewer/json-path";
import { interpolate, type Vars } from "@/lib/interpolate";

export type AssertResult = {
  assert: Assert;
  pass: boolean;
  /** O valor que veio (texto); undefined = não existe na resposta. */
  actual?: string;
  /** Por que não deu para comparar; a UI traduz. `detail` é a mensagem crua (caminho, regex). */
  error?: AssertError;
  detail?: string;
};
export type AssertError = "binary" | "notJson" | "truncated" | "badPath" | "notNumber" | "badRegex";

/** Valor atual do alvo como texto, ou o motivo de não haver um. */
type Actual = { value?: string; error?: AssertError; detail?: string };
function actualOf(a: Assert, res: HttpResponse, vars: Vars): Actual {
  if (a.target === "status") return { value: String(res.status) };
  if (a.target === "time") return { value: String(res.timeMs) };
  const path = interpolate(a.path, vars).trim();
  if (a.target === "header") {
    // Header repetido junta com ", " (como `{{x.res.headers.…}}`).
    const values = res.headers.filter(([k]) => k.toLowerCase() === path.toLowerCase());
    return { value: values.length ? values.map(([, v]) => v).join(", ") : undefined };
  }
  if (res.isBinary) return { error: "binary" };
  if (!path) return { value: res.body };
  let json: unknown;
  try {
    json = JSON.parse(res.body);
  } catch {
    return { error: res.truncated ? "truncated" : "notJson" }; // cortado em 5 MB: JSON quebrado
  }
  let value: unknown;
  try {
    value = pick(json, path);
  } catch (err) {
    return { error: "badPath", detail: (err as Error).message };
  }
  if (value === undefined) return {};
  return { value: typeof value === "string" ? value : JSON.stringify(value) };
}

/** Avalia os asserts ativos, na ordem. Valor que não existe falha em todo operador. */
export function evaluate(asserts: Assert[], res: HttpResponse, vars: Vars): AssertResult[] {
  return asserts
    .filter((a) => a.enabled)
    .map((assert): AssertResult => {
      const { value: actual, error, detail } = actualOf(assert, res, vars);
      if (error) return { assert, pass: false, error, detail };
      if (actual === undefined) return { assert, pass: false };
      const expected = interpolate(assert.expected, vars);
      switch (assert.op) {
        case "exists":
          return { assert, pass: true, actual };
        case "equals":
          return { assert, pass: actual === expected, actual };
        case "notEquals":
          return { assert, pass: actual !== expected, actual };
        case "contains":
          return { assert, pass: actual.includes(expected), actual };
        case "lessThan":
        case "greaterThan": {
          const [a, b] = [Number(actual), Number(expected)];
          if (actual.trim() === "" || expected.trim() === "" || Number.isNaN(a) || Number.isNaN(b))
            return { assert, pass: false, actual, error: "notNumber" };
          return { assert, pass: assert.op === "lessThan" ? a < b : a > b, actual };
        }
        case "matches":
          try {
            return { assert, pass: new RegExp(expected).test(actual), actual };
          } catch (err) {
            const detail = (err as Error).message;
            return { assert, pass: false, actual, error: "badRegex", detail };
          }
      }
      return { assert, pass: false, actual };
    });
}
