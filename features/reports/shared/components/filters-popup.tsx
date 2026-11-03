"use client";
/**
 * The report filters popup's shell: every filter of a report in one modal
 * (Party-wise Outstanding set the pattern, 2026-11-02). The screen keeps the
 * draft; the popup's fields edit it live and the screen puts it back on
 * Cancel. This shell owns only the frame and the keys:
 *
 *  - Apply: the button, F5, or Enter on any field that is not a button and
 *    whose Enter nothing else took (a list's pick marks its Enter handled).
 *    Apply waits one task, so an As on / From / To still being typed settles
 *    into the draft first and the screen's Apply sees the draft of THAT render.
 *  - Cancel: the button, Esc, or the backdrop. Esc on an open list
 *    (`[role=combobox][aria-expanded=true]`) is left to the list.
 *  - Reset: the screen's defaults.
 *
 * The overlay is the house three-part one (ModalPortal, an isolated overlay
 * with no background, its own backdrop, a pre-promoted panel), so the grid
 * behind it cannot ghost through.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import { Z_MODAL } from "@/lib/z-index";
import styles from "./filters-popup.module.scss";

type Props = {
  title?: string;
  note?: string;
  /** The screen's own check, when Apply was refused: shown, and the popup stays open. */
  error: string | null;
  onApply: () => void;
  onReset: () => void;
  onCancel: () => void;
  /** The screen's tokens (control height and the like): the panel is portaled out of the page. */
  panelClassName?: string;
  /** Runs once the panel is really in the page (ModalPortal mounts a commit late): first focus. */
  onMounted?: (panel: HTMLDivElement) => void;
  children: ReactNode;
};

export function FiltersPopup({
  title = "More filters",
  note = "every filter of the report · Apply shows it",
  error,
  onApply,
  onReset,
  onCancel,
  panelClassName,
  onMounted,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const applyRef = useRef(onApply);
  useEffect(() => {
    applyRef.current = onApply;
  });
  const mountedRef = useRef(onMounted);
  const settleThenApply = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "text" && panelRef.current?.contains(active)) {
      active.blur();
      active.focus();
    }
    window.setTimeout(() => applyRef.current(), 0);
  }, []);
  const attachPanel = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    if (node) mountedRef.current?.(node);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F5") {
        event.preventDefault();
        event.stopPropagation();
        settleThenApply();
        return;
      }
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An open list takes its own Escape (it is portaled out of the panel).
      if (panelRef.current?.querySelector('[role="combobox"][aria-expanded="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, settleThenApply]);

  return (
    <ModalPortal>
      <div className={styles.overlay} style={{ zIndex: Z_MODAL }}>
        <button type="button" className={styles.backdrop} aria-label="Cancel" tabIndex={-1} onMouseDown={onCancel} />
        <div
          ref={attachPanel}
          className={cx(styles.panel, panelClassName)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onKeyDown={(event) => {
            // A list's own Enter (portaled, but still a React child) is already taken.
            if (event.key !== "Enter" || event.defaultPrevented) return;
            if ((event.target as HTMLElement).tagName === "BUTTON") return;
            event.preventDefault();
            settleThenApply();
          }}
        >
          <div className={styles.head}>
            {title}
            {note ? <span className={styles.headNote}>{note}</span> : null}
          </div>
          <div className={styles.body}>
            {children}
            {error ? (
              <div className={styles.error} role="alert">
                {error}
              </div>
            ) : null}
          </div>
          <div className={styles.foot}>
            <button type="button" className={cx(styles.button, styles.footLeft)} onClick={onReset}>
              Reset
            </button>
            <button type="button" className={styles.button} onClick={onCancel}>
              Cancel<span className={styles.key}>Esc</span>
            </button>
            <button type="button" className={styles.primaryButton} onClick={onApply}>
              Apply<span className={styles.key}>F5</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** One group of the popup: its head, then caption | field rows. `wide` spans both columns. */
export function FiltersSection({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={cx(styles.section, wide && styles.sectionWide)} aria-label={title}>
      <div className={styles.sectionHead}>{title}</div>
      {children}
    </section>
  );
}

/** A caption and its field. `htmlFor` makes the caption a label; leave it out for a combo (a label re-routes clicks). */
export function FiltersRow({
  label,
  htmlFor,
  required,
  title,
  flagged,
  flaggedClassName,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  title?: string;
  flagged?: boolean;
  /** The screen's own "this field is wrong" class (its controls are styled by the screen). */
  flaggedClassName?: string;
  children: ReactNode;
}) {
  const caption = (
    <>
      {label}
      {required ? <span className={styles.required}> *</span> : null}
    </>
  );
  return (
    <>
      {htmlFor ? (
        <label className={styles.caption} htmlFor={htmlFor} title={title}>
          {caption}
        </label>
      ) : (
        <span className={styles.caption} title={title}>
          {caption}
        </span>
      )}
      <div className={cx(styles.cell, flagged && flaggedClassName)} title={title}>
        {children}
      </div>
    </>
  );
}

/** A note under a section's rows, across both columns. */
export function FiltersNote({ children }: { children: ReactNode }) {
  return <span className={styles.note}>{children}</span>;
}

/** Check boxes, two to a row (`single`: one to a row, for a narrow section). */
export function FiltersChecks({ single, children }: { single?: boolean; children: ReactNode }) {
  return <div className={cx(styles.checks, single && styles.checksSingle)}>{children}</div>;
}

/** Sections stacked in one column of the popup. */
export function FiltersColumn({ children }: { children: ReactNode }) {
  return <div className={styles.column}>{children}</div>;
}
