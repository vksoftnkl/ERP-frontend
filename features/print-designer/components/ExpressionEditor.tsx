"use client";

/**
 * The expression editor.
 *
 * Autocomplete is driven by the same metadata the server publishes — the band's
 * dataset fields for `row.*`, the declared datasets by name, and the built-in
 * roots — so the list can only ever offer identifiers the engine will resolve.
 *
 * The lint line below the box is advisory by construction: it is a scanner, not
 * jexl (see lib/expression.ts), and it must never be the reason a user cannot
 * save. The server validates on save and reports the exact JSON path.
 */

import { useMemo, useRef, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import {
  applyCompletion,
  completionsAt,
  lintTemplateString,
  type CompletionItem,
} from "@/features/print-designer/lib/expression";
import {
  BUILTIN_ROOT_IDENTIFIERS,
  TRANSFORM_SIGNATURES,
} from "@/features/print-designer/lib/vocabulary";
import type { FieldMeta } from "@/features/print-designer/types/template-definition";
import styles from "@/features/print-designer/components/designer.module.scss";

export type ExpressionEditorProps = {
  open: boolean;
  title: string;
  value: string;
  /** Dataset names declared by the template; valid expression roots. */
  datasetNames: readonly string[];
  /** Fields reachable through `row.*`, from the band's dataset. */
  rowFields: readonly FieldMeta[];
  /** Fields of each named dataset, for `invoice.partyName`-style references. */
  fieldsByDataset: Readonly<Record<string, readonly FieldMeta[]>>;
  onClose: () => void;
  onCommit: (value: string) => void;
};

const BUILTIN_MEMBERS: Readonly<Record<string, ReadonlyArray<{ name: string; detail?: string }>>> = {
  page: [
    { name: "number", detail: "current page" },
    { name: "total", detail: "page count" },
    { name: "isFirst" },
    { name: "isLast" },
  ],
  ctx: [
    { name: "companyName" },
    { name: "companyLogo" },
    { name: "branchName" },
    { name: "accYear" },
    { name: "docId" },
    { name: "userId" },
  ],
  sys: [{ name: "now" }, { name: "renderedAt" }],
  group: [{ name: "key" }, { name: "count" }],
  agg: [{ name: "sum" }, { name: "count" }],
};

export function ExpressionEditor({
  open,
  title,
  value,
  datasetNames,
  rowFields,
  fieldsByDataset,
  onClose,
  onCommit,
}: ExpressionEditorProps) {
  const [draft, setDraft] = useState(value);
  const [caret, setCaret] = useState(value.length);
  const [activeCompletion, setActiveCompletion] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Seed the draft as the dialog opens, during render rather than in an effect.
  // Only on the transition: re-seeding while it is open would throw away
  // whatever the user has typed the moment the underlying element re-renders.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(value);
      setCaret(value.length);
      setActiveCompletion(0);
    }
  }

  const completionContext = useMemo(() => {
    const fieldsByRoot: Record<string, ReadonlyArray<{ name: string; detail?: string }>> = {
      ...BUILTIN_MEMBERS,
      row: [
        { name: "__index", detail: "1-based row number" },
        ...rowFields.map((field) => ({ name: field.name, detail: field.label })),
      ],
    };
    for (const [name, fields] of Object.entries(fieldsByDataset)) {
      fieldsByRoot[name] = fields.map((field) => ({ name: field.name, detail: field.label }));
    }
    return {
      roots: [...BUILTIN_ROOT_IDENTIFIERS, ...datasetNames],
      fieldsByRoot,
    };
  }, [datasetNames, fieldsByDataset, rowFields]);

  const completions = useMemo(
    () => (open ? completionsAt(draft, caret, completionContext).slice(0, 40) : []),
    [caret, completionContext, draft, open],
  );

  const issues = useMemo(
    () => lintTemplateString(draft, datasetNames),
    [datasetNames, draft],
  );

  if (!open) {
    return null;
  }

  const insert = (text: string) => {
    const next = draft.slice(0, caret) + text + draft.slice(caret);
    setDraft(next);
    const nextCaret = caret + text.length;
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const accept = (item: CompletionItem) => {
    const result = applyCompletion(draft, caret, item);
    setDraft(result.text);
    setCaret(result.caret);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(result.caret, result.caret);
      }
    });
  };

  return (
    <ModalPortal>
      <div className={`${styles.overlayTokens} ${styles.backdrop}`} onClick={onClose} />
      <div className={`${styles.overlayTokens} ${styles.dialogLayer}`}>
        <div className={`${styles.dialog} ${styles.dialogMedium}`} data-uppercase="off">
          <header className={styles.dialogHead}>
            <span>{title}</span>
            <span className={styles.spacer} />
            <button type="button" className={styles.button} onClick={onClose}>
              Close
            </button>
          </header>

          <div className={styles.dialogBody}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              style={{ minHeight: 90 }}
              value={draft}
              spellCheck={false}
              autoFocus
              onChange={(event) => {
                setDraft(event.target.value);
                setCaret(event.target.selectionStart ?? event.target.value.length);
                setActiveCompletion(0);
              }}
              onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
              onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={(event) => {
                if (!completions.length) {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    onCommit(draft);
                  }
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveCompletion((index) => (index + 1) % completions.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveCompletion(
                    (index) => (index - 1 + completions.length) % completions.length,
                  );
                } else if (event.key === "Tab") {
                  event.preventDefault();
                  accept(completions[activeCompletion] ?? completions[0]);
                }
              }}
            />

            <div className={styles.toggleRow}>
              <button type="button" className={styles.toolButton} onClick={() => insert("{{  }}")}>
                {"{{ }}"}
              </button>
              <button type="button" className={styles.toolButton} onClick={() => insert("row.")}>
                row.
              </button>
              <button type="button" className={styles.toolButton} onClick={() => insert("ctx.")}>
                ctx.
              </button>
              <button
                type="button"
                className={styles.toolButton}
                onClick={() => insert("page.number")}
              >
                page.number
              </button>
              <button
                type="button"
                className={styles.toolButton}
                onClick={() => insert("row.__index")}
              >
                row.__index
              </button>
            </div>

            {completions.length ? (
              <div className={styles.completionList}>
                {completions.map((item, index) => (
                  <button
                    key={`${item.kind}-${item.label}`}
                    type="button"
                    className={`${styles.completionItem} ${
                      index === activeCompletion ? styles.completionItemActive : ""
                    }`}
                    onMouseEnter={() => setActiveCompletion(index)}
                    onClick={() => accept(item)}
                  >
                    <span>{item.label}</span>
                    <span className={styles.completionDetail}>{item.detail ?? item.kind}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div>
              <span className={styles.fieldLabel}>Transforms</span>
              <div className={styles.transformList}>
                {TRANSFORM_SIGNATURES.map((transform) => (
                  <button
                    key={transform.name}
                    type="button"
                    className={styles.transformRow}
                    onClick={() => insert(`|${transform.name}`)}
                    title={transform.description}
                  >
                    <span className={styles.transformName}>{transform.signature}</span>
                    <span className={styles.listRowMeta}>{transform.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {issues.map((issue, index) => (
              <p key={`${issue.message}-${index}`} className={styles.issueLine}>
                {issue.message}
              </p>
            ))}
          </div>

          <footer className={styles.dialogFoot}>
            <span className={styles.listRowMeta}>Ctrl+Enter applies</span>
            <span className={styles.spacer} />
            <button type="button" className={styles.button} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={() => onCommit(draft)}
            >
              Apply
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}

export default ExpressionEditor;
