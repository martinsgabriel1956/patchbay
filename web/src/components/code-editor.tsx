// CodeMirror 6 no tom do DESIGN.md: tinta sobre fundo, chaves em tinta, strings em tinta 3
// (o único realce), sem cor de sintaxe. Seleção nativa, então segue o ::selection (inversão).
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { foldGutter, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import type { Scope } from "@/features/environments/store";
import { defined, VAR } from "@/lib/interpolate";

export const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--ink)" },
  { tag: tags.string, color: "var(--ink-3)" },
]);

export const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--ink-2)", backgroundColor: "transparent", fontSize: "13px" },
  "&.cm-focused": { outline: "2px solid var(--focus)", outlineOffset: "-2px" },
  ".cm-scroller": {
    fontFamily: "'Red Hat Mono', ui-monospace, monospace",
    lineHeight: "1.75",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-content": { caretColor: "var(--ink)" },
  ".cm-var, .cm-var-missing": {
    textDecoration: "underline dashed 1px",
    textUnderlineOffset: "4px",
  },
  ".cm-var": { color: "var(--ink)", fontWeight: "600" },
  ".cm-var-missing": { color: "var(--prod-text)" },
  ".cm-gutters": {
    backgroundColor: "var(--bg)",
    color: "var(--mute)",
    border: "none",
    borderRight: "1px solid var(--line)",
  },
  // Busca (Ctrl F): ocorrência com a régua inset de tinta, a atual invertida (DESIGN.md › Seleção).
  ".cm-searchMatch": { backgroundColor: "transparent", boxShadow: "inset 0 -2px var(--ink)" },
  ".cm-searchMatch-selected, .cm-searchMatch-selected *": {
    backgroundColor: "var(--ink)",
    color: "var(--bg)",
  },
  ".cm-panels": { backgroundColor: "var(--bg)", color: "var(--ink)" },
  ".cm-panels-top": { borderBottom: "1px solid var(--line)" },
  ".cm-panel.cm-search": {
    padding: "8px 40px 8px 18px",
    "& input, & button, & label": { margin: "3px 10px 3px 0" },
    "& label": { fontSize: "12px", color: "var(--mute)" },
    "& input[type=checkbox]": { margin: "0 6px 0 0", accentColor: "var(--ink)" },
    "& [name=close]": { top: "8px", right: "14px", color: "var(--mute)", fontSize: "17px" },
  },
  ".cm-textfield": {
    border: "1px solid var(--line)",
    backgroundColor: "var(--bg)",
    color: "var(--ink)",
    fontFamily: "'Red Hat Mono', ui-monospace, monospace",
    fontSize: "13px",
    padding: "4px 10px",
    outlineOffset: "-2px",
  },
  // Autocomplete, hover e lint (GraphQL): chapados, com fio; o item escolhido inverte.
  ".cm-tooltip": {
    backgroundColor: "var(--bg)",
    color: "var(--ink-2)",
    border: "1px solid var(--line)",
    fontFamily: "'Red Hat Mono', ui-monospace, monospace",
    fontSize: "12.5px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--ink)",
    color: "var(--bg)",
  },
  ".cm-tooltip.cm-completionInfo, .cm-gql-info, .cm-diagnostic": {
    padding: "6px 10px",
    maxWidth: "56ch",
    whiteSpace: "pre-wrap",
  },
  ".cm-completionDetail": { color: "var(--mute)", fontStyle: "normal" },
  ".cm-diagnostic-error": { borderLeft: "2px solid var(--prod-text)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--prod-text) 1px",
  },
  ".cm-button, .cm-panel label": {
    fontWeight: "700",
    fontVariationSettings: "'wdth' 70",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "transparent",
    border: "1px solid var(--mute)",
    borderRadius: "0",
    fontSize: "12px",
    padding: "4px 12px",
    "&:hover": { boxShadow: "inset 0 -2px var(--ink)" },
    "&:active": { backgroundImage: "none", backgroundColor: "var(--ink)", color: "var(--bg)" },
  },
});

/** Textos da busca do CodeMirror em pt-BR, como o resto da interface. */
const phrases = EditorState.phrases.of({
  Find: "Buscar",
  next: "próximo",
  previous: "anterior",
  all: "todos",
  "match case": "maiúsculas",
  regexp: "regex",
  "by word": "palavra inteira",
  close: "Fechar",
  Replace: "Substituir",
  replace: "substituir",
  "replace all": "substituir todos",
  "current match": "Ocorrência atual",
  "on line": "na linha",
  "replaced match on line $": "Substituído na linha $",
  "replaced $ matches": "$ ocorrências substituídas",
  "Go to line": "Ir para a linha",
  go: "ir",
});

/** {{var}} com a mesma marcação do VarInput; o title mostra o valor (segredo mascarado). */
function varMarks(scope: Scope) {
  const decorator = new MatchDecorator({
    regexp: new RegExp(VAR.source, "g"),
    decoration: ([, name]) =>
      defined(name, scope.vars)
        ? Decoration.mark({
            class: "cm-var",
            attributes: { title: scope.display[name] ?? "gerada no envio" },
          })
        : Decoration.mark({ class: "cm-var-missing", attributes: { title: "indefinida" } }),
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export function CodeEditor(props: {
  value: string;
  onChange?: (value: string) => void;
  language?: "json";
  label: string;
  /** Com scope, {{var}} aparecem destacadas. */
  scope?: Scope;
  /** Linguagem extra (GraphQL com schema); trocar reconfigura sem recriar o editor. */
  extensions?: Extension;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const marks = useRef(new Compartment());
  const extra = useRef(new Compartment());
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  const readOnly = !props.onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: o valor entra pelo efeito abaixo; recriar o editor a cada tecla perderia cursor e histórico
  useEffect(() => {
    const editor = new EditorView({
      parent: parent.current as HTMLDivElement,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          search({ top: true }),
          phrases,
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({ "aria-label": props.label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange.current?.(update.state.doc.toString());
          }),
          theme,
          props.language === "json" ? json() : [],
          marks.current.of(props.scope ? varMarks(props.scope) : []),
          extra.current.of(props.extensions ?? []),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
  }, [props.language, readOnly]);

  useEffect(() => {
    view.current?.dispatch({
      effects: marks.current.reconfigure(props.scope ? varMarks(props.scope) : []),
    });
  }, [props.scope]);

  useEffect(() => {
    view.current?.dispatch({ effects: extra.current.reconfigure(props.extensions ?? []) });
  }, [props.extensions]);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== props.value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: props.value } });
    }
  }, [props.value]);

  return <div ref={parent} className="h-full min-h-0" />;
}
