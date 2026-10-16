// CodeMirror 6 no tom do DESIGN.md: tinta sobre fundo, chaves em tinta, strings em tinta 3
// (o único realce), sem cor de sintaxe. Seleção nativa, então segue o ::selection (inversão).
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { foldGutter, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
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
import { VAR } from "@/lib/interpolate";

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
});

/** {{var}} com a mesma marcação do VarInput; o title mostra o valor (segredo mascarado). */
function varMarks(scope: Scope) {
  const decorator = new MatchDecorator({
    regexp: new RegExp(VAR.source, "g"),
    decoration: ([, name]) =>
      Object.hasOwn(scope.vars, name)
        ? Decoration.mark({ class: "cm-var", attributes: { title: scope.display[name] } })
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
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const marks = useRef(new Compartment());
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
          keymap.of([...defaultKeymap, ...historyKeymap]),
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
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== props.value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: props.value } });
    }
  }, [props.value]);

  return <div ref={parent} className="h-full min-h-0" />;
}
