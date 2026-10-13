"use client";

/**
 * Conditional formatting -- QtRPT's "Highlighting".
 *
 * Each rule is a condition and what to change when it holds: bold, italic,
 * underline, strikeout, the text colour, the background. Every rule whose
 * condition holds applies, in order, so a later rule wins a clash. A typical
 * pair: amounts below zero in red, amounts above a limit bold on yellow.
 *
 * Edited for one element at a time: rules are a list, and merging two
 * elements' lists into one editor would invent rules neither had.
 */

import type { CSSProperties } from "react";
import type { Highlight, TextLikeElement } from "@/features/print-designer/types/template-definition";
import { useElementPatch } from "@/features/print-designer/components/panels/usePatch";
import {
  ColorInput,
  FieldRow,
  Section,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export type HighlightSectionProps = {
  bandIndex: number;
  elements: TextLikeElement[];
  onEditExpression: (request: {
    title: string;
    value: string;
    onCommit: (value: string) => void;
  }) => void;
};

const FLAGS: ReadonlyArray<{ key: "bold" | "italic" | "underline" | "strikeout"; label: string; title: string; css: CSSProperties }> = [
  { key: "bold", label: "B", title: "Bold", css: { fontWeight: 700 } },
  { key: "italic", label: "I", title: "Italic", css: { fontStyle: "italic" } },
  { key: "underline", label: "U", title: "Underline", css: { textDecoration: "underline" } },
  { key: "strikeout", label: "S", title: "Strikeout", css: { textDecoration: "line-through" } },
];

export function HighlightSection({ bandIndex, elements, onEditExpression }: HighlightSectionProps) {
  const patch = useElementPatch(
    bandIndex,
    elements.map((element) => element.id),
  );

  if (elements.length !== 1) {
    return (
      <Section title="Conditional formatting" defaultOpen={false}>
        <p className={styles.listRowMeta}>Select one element to edit its rules.</p>
      </Section>
    );
  }

  const rules = elements[0].highlights ?? [];
  const setRules = (next: Highlight[], label: string, coalesceKey?: string) =>
    patch({ highlights: next.length ? next : undefined }, label, coalesceKey);
  const update = (index: number, change: Partial<Highlight>, label: string, coalesceKey?: string) =>
    setRules(
      rules.map((rule, position) => (position === index ? { ...rule, ...change } : rule)),
      label,
      coalesceKey,
    );

  return (
    <Section title="Conditional formatting" defaultOpen={rules.length > 0}>
      {rules.map((rule, index) => (
        <div key={`rule-${index}`} className={styles.axisLevel}>
          <div className={styles.axisLevelHead}>
            <span className={styles.listRowMeta}>{`Rule ${index + 1}`}</span>
            <button
              type="button"
              className={styles.toolButton}
              title="Remove this rule"
              onClick={() => setRules(rules.filter((_rule, position) => position !== index), "Remove highlight")}
            >
              ×
            </button>
          </div>
          <FieldRow label="When" wide>
            <div className={styles.expressionRow}>
              <textarea
                className={styles.textarea}
                style={{ minHeight: 32 }}
                spellCheck={false}
                placeholder="{{ row.amount < 0 }}"
                value={rule.when}
                onChange={(event) =>
                  update(index, { when: event.target.value }, "Edit highlight condition", `highlight-${bandIndex}-${index}`)
                }
                onKeyDown={(event) => event.stopPropagation()}
              />
              <button
                type="button"
                className={styles.fxButton}
                title="Open the expression editor"
                onClick={() =>
                  onEditExpression({
                    title: `Highlight ${index + 1} condition`,
                    value: rule.when,
                    onCommit: (when) => update(index, { when }, "Edit highlight condition"),
                  })
                }
              >
                fx
              </button>
            </div>
          </FieldRow>
          <FieldRow label="Then">
            <div className={styles.toggleRow}>
              {FLAGS.map((flag) => (
                <button
                  key={flag.key}
                  type="button"
                  title={`${flag.title} when the condition holds`}
                  className={`${styles.toolButton} ${rule[flag.key] ? styles.toolButtonActive : ""}`}
                  onClick={() =>
                    update(index, { [flag.key]: rule[flag.key] ? undefined : true }, `Highlight ${flag.title.toLowerCase()}`)
                  }
                >
                  <span className={styles.toolIcon} style={flag.css}>
                    {flag.label}
                  </span>
                </button>
              ))}
            </div>
          </FieldRow>
          <ColorInput
            label="Text colour"
            value={rule.color}
            onCommit={(color) => update(index, { color: color || undefined }, "Highlight colour", `highlight-colour-${index}`)}
          />
          <ColorInput
            label="Background"
            value={rule.fill}
            onCommit={(fill) => update(index, { fill: fill || undefined }, "Highlight background", `highlight-fill-${index}`)}
          />
        </div>
      ))}
      <button
        type="button"
        className={styles.axisAdd}
        disabled={rules.length >= 10}
        onClick={() => setRules([...rules, { when: "{{ row.amount < 0 }}", color: "#c00000" }], "Add highlight")}
      >
        + Add a rule
      </button>
    </Section>
  );
}

export default HighlightSection;
