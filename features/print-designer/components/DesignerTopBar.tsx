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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { layoutRect, layoutViewportSize, type LayoutRect } from "@/lib/ui-scale";
import { Z_POPUP } from "@/lib/z-index";
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
import { useCanvasHost } from "@/features/print-designer/host/canvas-host";
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
  /*
   * A hosted canvas has no `/reports/templates` row behind it, so Preview,
   * Publish, Clone and Version history have nothing to act on -- their endpoints
   * are 404 in any case. The host owns those decisions; here they go away rather
   * than sitting there failing.
   */
  const host = useCanvasHost();

  /*
   * The bar scrolls sideways (`.toolbar` is `overflow-x: auto`), and that clips
   * anything hanging out of its 28px strip — an inline dropdown opened there
   * invisibly. The panel is portaled to <body> and pinned under the button
   * instead; the anchor is measured once, on open, and any resize or scroll
   * closes the menu rather than leaving it stranded.
   */
  const [menuAnchor, setMenuAnchor] = useState<LayoutRect | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setMenuAnchor(null), []);

  useEffect(() => {
    if (!menuAnchor) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The panel lives outside this subtree, so it needs its own check.
      if (menuPanelRef.current?.contains(target) || menuButtonRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [closeMenu, menuAnchor]);

  const toggleMenu = () => {
    const button = menuButtonRef.current;
    setMenuAnchor((anchor) => (anchor || !button ? null : layoutRect(button)));
  };

  const lastSaved = useMemo(() => {
    const stamp = meta.version ? `v${meta.version}` : "unsaved";
    return `${meta.docType || "no doc type"} · ${meta.outputMode} · ${meta.paperCode} · ${stamp}`;
  }, [meta.docType, meta.outputMode, meta.paperCode, meta.version]);

  return (
    <div className={styles.toolbar}>
      {host ? (
        <button
          type="button"
          className={styles.backLink}
          title="Back to the design"
          onClick={host.onClose}
        >
          <span className={styles.toolIcon}>◀</span>
          <span>Close</span>
        </button>
      ) : (
        <Link href={PRINT_TEMPLATES_ROUTE} className={styles.backLink} title="Back to the list">
          <span className={styles.toolIcon}>◀</span>
          <span>Templates</span>
        </Link>
      )}

      <div className={styles.toolDivider} />

      <div className={styles.titleBlock}>
        <input
          className={styles.nameInput}
          value={meta.name}
          placeholder="Untitled template"
          readOnly={Boolean(host)}
          title={host ? "The name lives on the Template tab" : undefined}
          onChange={(event) => dispatch(nameChanged(event.target.value))}
          aria-label="Template name"
        />
        <span className={styles.metaLine}>{host ? host.label : lastSaved}</span>
      </div>

      {host?.readOnly ? (
        <span className={`${styles.badge} ${styles.badgeSystem}`} title={host.readOnlyReason}>
          read only
        </span>
      ) : null}
      {!host && meta.isDefault ? (
        <span className={`${styles.badge} ${styles.badgeDefault}`}>default</span>
      ) : null}
      {!host && meta.isSystemTemplate ? (
        <span className={`${styles.badge} ${styles.badgeSystem}`}>system</span>
      ) : null}
      {dirty ? <span className={`${styles.badge} ${styles.badgeDirty}`}>modified</span> : null}
      {/*
        The store's status is always DRAFT for a hosted canvas — `draftStarted`
        seeds it — which would sit a "draft" pill beside a PUBLISHED revision.
        The host's own label carries the real status.
      */}
      {!host && status === "DRAFT" ? <span className={styles.badge}>draft</span> : null}

      <span className={styles.spacer} />

      {!host && meta.isSystemTemplate ? (
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

      {/*
        Preview is back for a hosted canvas, and only where the host can render:
        the endpoint takes a revision id, and a design that has never been saved
        has none. Publish stays gone — the printing module publishes from its
        own Version rail, where the pointer actually lives.
      */}
      {host?.preview ? (
        <button type="button" className={styles.button} title="Ctrl+P" onClick={onPreview}>
          Preview
        </button>
      ) : null}

      {host ? null : (
        <button
          type="button"
          className={styles.button}
          disabled={publishing || !templateId || meta.isSystemTemplate}
          onClick={() => void publish()}
        >
          Publish
        </button>
      )}

      <div className={styles.menuWrap}>
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.toolButton}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAnchor)}
          onClick={toggleMenu}
        >
          <span className={styles.toolIcon}>⋮</span>
        </button>
        {menuAnchor
          ? createPortal(
              <div
                ref={menuPanelRef}
                role="menu"
                className={`${styles.overlayTokens} ${styles.menuPanel}`}
                style={{
                  top: menuAnchor.bottom + 2,
                  right: Math.max(4, layoutViewportSize().width - menuAnchor.right),
                  zIndex: Z_POPUP,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  disabled={!templateId}
                  onClick={() => {
                    closeMenu();
                    onOpenRevisions();
                  }}
                >
                  Version history…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  disabled={!templateId}
                  onClick={() => {
                    closeMenu();
                    void exportJson();
                  }}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  disabled={!templateId}
                  onClick={() => {
                    closeMenu();
                    void clone();
                  }}
                >
                  Duplicate template
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    closeMenu();
                    onOpenShortcuts();
                  }}
                >
                  Keyboard shortcuts
                </button>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

export default DesignerTopBar;
