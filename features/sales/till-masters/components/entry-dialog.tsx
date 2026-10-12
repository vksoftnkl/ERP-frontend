"use client";

/**
 * The popup entry every till master list opens — the web side of Qt's
 * NexCrudForm: a title and a subtitle that says what the record is, the
 * fields, a facts line and the warnings, and Cancel / Save (Update on an edit).
 *
 * Keys, as Qt's NexDialog: Enter moves to the next field (a required box left
 * empty keeps the caret), Ctrl+Enter saves, Esc closes. An open dropdown list
 * takes Enter and Esc first — it prevents them, and this popup checks.
 *
 * Mounted fresh per opening (keyed by the list), so nothing is carried over
 * from the last record. Portaled with the house three-part overlay (isolated
 * overlay, separate backdrop, pre-promoted panel) so the grid underneath
 * cannot ghost through it.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import ModalPortal from "@/components/ui/modal-portal";
import { confirm, getConfirmations } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { useTillMastersSaveMutation } from "@/store/api/tillApi";
import { tillErrorText } from "../domain/api-error";
import {
  TILL_MASTER_SPECS,
  entryBody,
  entryFacts,
  entryHeading,
  entryWarnings,
  firstField,
  lockedFields,
  problemOf,
  type CounterForm,
  type DenominationForm,
  type EntryMode,
  type GridRow,
  type ReasonForm,
  type SafeForm,
  type TillForm,
  type TillMasterKind,
} from "../domain/till-masters";
import { CounterFields } from "./counter-fields";
import { DenominationFields } from "./denomination-fields";
import { Notes, fieldId } from "./form-bits";
import { ReasonFields } from "./reason-fields";
import { SafeFields } from "./safe-fields";
import styles from "../page.module.scss";

/** Qt's `iconText` per popup. */
const ICON_TEXT: Record<TillMasterKind, string> = {
  counters: "TC",
  safes: "SF",
  reasons: "TR",
  denominations: "DN",
};

/** What the Enter walk visits: the fields, then Save. Other buttons are skipped. */
const WALK_SELECTOR = [
  'input:not([type="hidden"]):not(:disabled)',
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "button[data-entry-save]:not(:disabled)",
].join(", ");

export type TillEntryDialogProps = {
  kind: TillMasterKind;
  row: GridRow | null;
  mode: EntryMode;
  initial: TillForm;
  /** Set when the operator may look but not save (no right): the subtitle says so. */
  readOnlyReason: string | null;
  /** The scope the row was listed under — what Save posts. */
  companyId: string;
  branchId: string;
  onClose: () => void;
  /** Saved: the list re-reads once the server's grid cache has turned over. */
  onSaved: () => void;
};

export function TillEntryDialog({
  kind,
  row,
  mode,
  initial,
  readOnlyReason,
  companyId,
  branchId,
  onClose,
  onSaved,
}: TillEntryDialogProps) {
  const spec = TILL_MASTER_SPECS[kind];
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const savingRef = useRef(false);
  const [form, setForm] = useState<TillForm>(initial);
  const [saveMaster, { isLoading: saving }] = useTillMastersSaveMutation();

  const readOnly = mode === "locked" || readOnlyReason !== null;
  const editable = !readOnly && !saving;
  const heading = entryHeading(kind, row, mode);
  const subtitle = readOnlyReason ?? heading.subtitle;
  const locked = useMemo(() => lockedFields(kind, mode, row), [kind, mode, row]);
  const [focus] = useState(() => firstField(kind, mode, row, readOnly));
  const dirty = !readOnly && JSON.stringify(form) !== JSON.stringify(initial);
  const facts = entryFacts(kind, row, mode);
  const warnings = entryWarnings(kind, form, row, mode);

  const update = useCallback((patch: Partial<TillForm>) => {
    setForm((current) => ({ ...current, ...patch }) as TillForm);
  }, []);

  // The page underneath does not scroll while the popup is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const focusField = useCallback(
    (field: string) => {
      const element = document.getElementById(fieldId(kind, field));
      if (element instanceof HTMLElement) element.focus();
    },
    [kind],
  );

  const submit = useCallback(async () => {
    if (readOnly || savingRef.current) return;
    const problem = problemOf(kind, form);
    if (problem) {
      toast.warn(problem.message);
      focusField(problem.field);
      return;
    }
    savingRef.current = true;
    try {
      await saveMaster({ master: spec.master, body: entryBody(kind, form, row, mode, { companyId, branchId }) }).unwrap();
      onSaved();
    } catch (error) {
      toast.error(tillErrorText(error, "Save Failed"));
    } finally {
      savingRef.current = false;
    }
  }, [branchId, companyId, focusField, form, kind, mode, onSaved, readOnly, row, saveMaster, spec.master]);

  const close = useCallback(async () => {
    if (savingRef.current) return;
    if (
      dirty &&
      !(await confirm({
        title: "Discard changes?",
        message: `The ${spec.entity} has changes that are not saved. Close and drop them?`,
        confirmLabel: "Discard",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    onClose();
  }, [dirty, onClose, spec.entity]);

  /** Enter-as-Tab; true when the key was this walk's. */
  const walkEnter = useCallback((target: EventTarget) => {
    if (!(target instanceof HTMLElement) || target instanceof HTMLButtonElement) return false;
    const panel = panelRef.current;
    if (!panel) return false;
    // A required box left empty keeps the caret (NexDialog's `textNecessary`).
    if (target instanceof HTMLInputElement && target.dataset.required === "true" && !target.value.trim()) return true;
    const stops = Array.from(panel.querySelectorAll<HTMLElement>(WALK_SELECTOR)).filter(
      (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
    );
    const at = stops.indexOf(target);
    const next = at >= 0 ? stops[at + 1] : undefined;
    if (!next) return false;
    next.focus();
    if (next instanceof HTMLInputElement && /^(text|search|)$/.test(next.type)) next.select();
    return true;
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      // An open dropdown list, or a dialog over this one, already answered it.
      if (event.nativeEvent.defaultPrevented || getConfirmations().length > 0) return;
      const { key } = event;
      const modified = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
      if (key === "Escape" && !modified) {
        event.preventDefault();
        void close();
        return;
      }
      if (key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        void submit();
        return;
      }
      if (key === "Enter" && !modified) {
        if (walkEnter(event.target)) event.preventDefault();
        return;
      }
      // The list under the popup listens on the window for F1 / F2 / F3 / F5,
      // Alt+C / Alt+A and Ctrl+D; none of them belongs to it while this is up.
      const listKey =
        /^F\d{1,2}$/.test(key) ||
        (event.altKey && !event.ctrlKey && /^[ac]$/i.test(key)) ||
        ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "d");
      if (listKey) event.preventDefault();
    },
    [close, submit, walkEnter],
  );

  const fields = (() => {
    const common = { mode, row, editable, locked, focus, companyId, branchId };
    switch (kind) {
      case "counters":
        return (
          <CounterFields
            {...common}
            form={form as CounterForm}
            update={update as (patch: Partial<CounterForm>) => void}
          />
        );
      case "safes":
        return (
          <SafeFields {...common} form={form as SafeForm} update={update as (patch: Partial<SafeForm>) => void} />
        );
      case "reasons":
        return (
          <ReasonFields
            {...common}
            form={form as ReasonForm}
            update={update as (patch: Partial<ReasonForm>) => void}
          />
        );
      default:
        return (
          <DenominationFields
            {...common}
            form={form as DenominationForm}
            update={update as (patch: Partial<DenominationForm>) => void}
          />
        );
    }
  })();

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close"
          tabIndex={-1}
          onMouseDown={() => void close()}
        />
        <section
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          // Clicks inside land focus on the panel, so Esc still reaches it.
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          <header className={styles.panelHeader}>
            <span className={styles.panelIcon} aria-hidden="true">
              {ICON_TEXT[kind]}
            </span>
            <div className={styles.panelHeading}>
              <h2 id={titleId} className={styles.panelTitle}>
                {heading.title}
              </h2>
              <p className={styles.panelSubtitle}>{subtitle}</p>
            </div>
            <button
              type="button"
              className={styles.panelClose}
              aria-label="Close"
              tabIndex={-1}
              onClick={() => void close()}
            >
              ×
            </button>
          </header>
          <form className={styles.panelBody} noValidate onSubmit={(event) => event.preventDefault()}>
            {fields}
            <Notes facts={facts} warnings={warnings} />
          </form>
          <footer className={styles.panelFooter}>
            <span className={styles.footerHint}>
              Enter next · Ctrl+Enter {heading.submitLabel.toLowerCase()} · Esc close
            </span>
            <button
              type="button"
              className={styles.secondaryButton}
              // Qt's Cancel takes no focus; it does when nothing else can.
              tabIndex={focus === null ? 0 : -1}
              autoFocus={focus === null}
              onClick={() => void close()}
            >
              Cancel
            </button>
            <button
              type="button"
              data-entry-save
              className={styles.primaryButton}
              disabled={readOnly || saving}
              title={`${heading.submitLabel} (Ctrl+Enter)`}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : heading.submitLabel}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
