"use client";

/**
 * The document toolbar — identity and the file actions.
 *
 * Save and Publish are deliberately separate. Save writes a new version of a
 * template that may not be in use anywhere; Publish makes it THE template for a
 * company/branch/docType/mode/paper, which changes what prints at a counter the
 * next time someone hits Ctrl+P. Collapsing them into one button would make
 * that scope change invisible.
 *
 * A system template cannot be saved at all — it is a shipped design shared by
 * every tenant — so the bar offers "Clone to edit" in place of Save rather than
 * letting the user work for ten minutes and then fail at the last step.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { nameChanged } from "@/features/print-designer/store/designerSlice";
import {
  selectDirty,
  selectMeta,
  selectProblemCounts,
  selectStatus,
  selectTemplateId,
} from "@/features/print-designer/store/selectors";
import { useTemplateSave } from "@/features/print-designer/hooks/useTemplateSave";
import { useTemplateActions } from "@/features/print-designer/hooks/useTemplateActions";
import { PRINT_TEMPLATES_ROUTE } from "@/features/print-designer/routes";
import styles from "@/features/print-designer/components/designer.module.scss";

export type DesignerTopBarProps = {
  onPreview: () => void;
  onOpenRevisions: () => void;
  onOpenShortcuts: () => void;
};

export function DesignerTopBar({
  onPreview,
  onOpenRevisions,
  onOpenShortcuts,
}: DesignerTopBarProps) {
  const dispatch = useAppDispatch();

  const meta = useAppSelector(selectMeta);
  const templateId = useAppSelector(selectTemplateId);
  const status = useAppSelector(selectStatus);
  const dirty = useAppSelector(selectDirty);
  const counts = useAppSelector(selectProblemCounts);

  const { save, saving, canSave } = useTemplateSave();
  const { publish, publishing, clone, cloning, exportJson } = useTemplateActions();

  const [menuOpen, setMenuOpen] = useState(false);

  const lastSaved = useMemo(() => {
    const stamp = meta.version ? `v${meta.version}` : "unsaved";
    return `${meta.docType || "no doc type"} · ${meta.outputMode} · ${meta.paperCode} · ${stamp}`;
  }, [meta.docType, meta.outputMode, meta.paperCode, meta.version]);

  return (
    <div className={styles.toolbar}>
      <Link href={PRINT_TEMPLATES_ROUTE} className={styles.backLink} title="Back to the list">
        <span className={styles.toolIcon}>◀</span>
        <span>Templates</span>
      </Link>

      <div className={styles.toolDivider} />

      <div className={styles.titleBlock}>
        <input
          className={styles.nameInput}
          value={meta.name}
          placeholder="Untitled template"
          onChange={(event) => dispatch(nameChanged(event.target.value))}
          aria-label="Template name"
        />
        <span className={styles.metaLine}>{lastSaved}</span>
      </div>

      {meta.isDefault ? (
        <span className={`${styles.badge} ${styles.badgeDefault}`}>default</span>
      ) : null}
      {meta.isSystemTemplate ? (
        <span className={`${styles.badge} ${styles.badgeSystem}`}>system</span>
      ) : null}
      {dirty ? <span className={`${styles.badge} ${styles.badgeDirty}`}>modified</span> : null}
      {status === "DRAFT" ? <span className={styles.badge}>draft</span> : null}

      <span className={styles.spacer} />

      {meta.isSystemTemplate ? (
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={cloning}
          onClick={() => void clone()}
        >
          Clone to edit
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={!canSave || saving}
          title={
            counts.errors
              ? "Fix the problems first — the server would reject this definition."
              : "Ctrl+S"
          }
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}

      <button type="button" className={styles.button} title="Ctrl+P" onClick={onPreview}>
        Preview
      </button>

      <button
        type="button"
        className={styles.button}
        disabled={publishing || !templateId || meta.isSystemTemplate}
        onClick={() => void publish()}
      >
        Publish
      </button>

      <div className={styles.menuWrap}>
        <button
          type="button"
          className={styles.toolButton}
          aria-label="More actions"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.toolIcon}>⋮</span>
        </button>
        {menuOpen ? (
          <div className={styles.menuPanel} onMouseLeave={() => setMenuOpen(false)}>
            <button
              type="button"
              className={styles.menuItem}
              disabled={!templateId}
              onClick={() => {
                setMenuOpen(false);
                onOpenRevisions();
              }}
            >
              Version history…
            </button>
            <button
              type="button"
              className={styles.menuItem}
              disabled={!templateId}
              onClick={() => {
                setMenuOpen(false);
                void exportJson();
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              className={styles.menuItem}
              disabled={!templateId}
              onClick={() => {
                setMenuOpen(false);
                void clone();
              }}
            >
              Duplicate template
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false);
                onOpenShortcuts();
              }}
            >
              Keyboard shortcuts
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DesignerTopBar;
