// Textos em en e pt-BR, escolhidos pelo `locale` das configurações (padrão pt-BR). Cada feature
// declara o próprio dicionário ao lado do componente; aqui só a escolha.
// ponytail: a interface antiga ainda é só pt-BR; migrar para cá conforme for traduzida.
import { type Settings, useSettings } from "@/features/settings/store";

export type Dict<T> = Record<Settings["locale"], T>;

/** Dentro de componente: re-renderiza quando o locale muda. */
export const useStrings = <T>(dict: Dict<T>): T =>
  dict[useSettings((s) => s.locale)] ?? dict["pt-BR"];

/** Fora do React (stores, linhas de log). */
export const strings = <T>(dict: Dict<T>): T =>
  dict[useSettings.getState().locale] ?? dict["pt-BR"];
