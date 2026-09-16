"use client";

/**
 * Size Entry — one item quoted in several sizes, keyed in one pass.
 *
 * Opened by double-click or F3 on an item row (F4 is the unit switcher). The
 * rows here are **local state until Save**: the draft is not touched while the
 * dialog is open, so Cancel is genuinely free and the operator cannot leave the
 * items grid half-rewritten by closing the dialog. Save hands the rows to
 * `applySizeEntry`, which is where every rule about what a replaced row keeps
 * lives — this file only collects the keystrokes.
 *
 * The Size column is the same four boxes the grid's Size cell uses (length ft ×
 * width in × thickness in × pieces): `sqi_size` is free text and no size master
 * exists to drive a dropdown from. Qty follows the CFT those dimensions work out
 * to until the operator keys one themselves, exactly as the grid's Size cell
 * feeds Bill Qty — a board cut short is why it stays editable.
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, formatQty } from "@/domain/pricing";
import {
  createSizeEntryRow,
  findSizeGroup,
  openSizeEntry,
  sizeEntryTotals,
  validateSizeEntry,
  type SizeEntryRow,
} from "../quotation.sizes";
import type { DraftLine } from "../quotation.types";
import {
  SIZE_FACTOR_COUNT,
  SIZE_FACTOR_LABELS,
  SIZE_FACTOR_PLACEHOLDERS,
  SIZE_FACTOR_SEPARATORS,
  SIZE_UOM,
  cubicFeetFromSize,
  joinSizeFactors,
  sanitizeSizeFactorInput,
  sanitizeSizeInput,
} from "../quotation.utils";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";

export type SizeEntryModalProps = {
  /** The row the dialog was opened on. */
  anchorKey: string;
  /** The draft's lines, read ONCE at mount — see `useState` below. */
  lines: DraftLine[];
  onClose: () => void;
  onSave: (anchorKey: string, rows: SizeEntryRow[]) => void;
};

/**
 * The four dimension boxes.
 *
 * Deliberately a local component rather than a reach into `GridCell`: that one
 * keeps an uncommitted buffer and writes to the draft on blur, because a grid
 * cell must not dispatch per keystroke. Here the rows ARE local state, so every
 * keystroke can land straight on them and the buffer would be a second copy of
 * the same value waiting to go stale.
 */
function SizeBoxes(props: {
  factors: string[];
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  onChange: (factors: string[]) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  const { factors, disabled, invalid, autoFocus, onChange, onKeyDown } = props;
  return (
    <span className={styles.cellSizeBoxes}>
      {factors.map((factor, index) => (
        <Fragment key={SIZE_FACTOR_LABELS[index]}>
          {index > 0 && (
            <span aria-hidden className={styles.cellSizeSep}>
              {SIZE_FACTOR_SEPARATORS[index]}
            </span>
          )}
          <input
            className={cx(styles.cellInput, styles.cellSizeBox, invalid && styles.cellInvalid)}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            title={SIZE_FACTOR_LABELS[index]}
            aria-label={SIZE_FACTOR_LABELS[index]}
            placeholder={SIZE_FACTOR_PLACEHOLDERS[index]}
            value={factor}
            onChange={(event) => {
              const next = [...factors];
              // Only the last box tolerates a `*`: nothing keyed through the
              // boxes produces one, but a size saved as free text before the
              // boxes existed keeps its extra factors there, and stripping them
              // on the first keystroke would rewrite the operator's value.
              next[index] =
                index === SIZE_FACTOR_COUNT - 1
                  ? sanitizeSizeInput(event.target.value)
                  : sanitizeSizeFactorInput(event.target.value);
              onChange(next);
            }}
            onKeyDown={onKeyDown}
          />
        </Fragment>
      ))}
    </span>
  );
}

export function SizeEntryModal(props: SizeEntryModalProps) {
  const { anchorKey, lines, onClose, onSave } = props;

  /**
   * The group and the rows are captured ONCE, in the `useState` initialisers.
   *
   * The dialog is mounted only while it is open, so mount is the open — and
   * re-reading `lines` afterwards would be a live wire: any dispatch that
   * replaces the lines array (a revalidation, a stray commit landing from a cell
   * that had focus) would re-seed the dialog and throw away everything the
   * operator has keyed into it. Nothing outside can change this item's sizes
   * while the dialog owns them, so a snapshot is the honest model.
   */
  const [group] = useState(() => findSizeGroup(lines, anchorKey));
  const [rows, setRows] = useState<SizeEntryRow[]>(() =>
    group ? openSizeEntry(group) : [],
  );
  /**
   * Errors stay hidden until Save is pressed. A dialog that opens with "Size is
   * required" under a blank row it just added is telling the operator off for
   * not having typed yet; blocking the save and pointing at the cell then is the
   * same information at the moment it is actually useful.
   */
  const [showErrors, setShowErrors] = useState(false);
  /** The dialog body — the scope the Enter walker reads its boxes from. */
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const template = group?.lines[0] ?? null;
  const baseRate = template?.rate ?? 0;

  const validation = useMemo(() => validateSizeEntry(rows), [rows]);
  const totals = useMemo(() => sizeEntryTotals(rows), [rows]);

  const patchRow = (key: string, patch: Partial<SizeEntryRow>): void => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  /**
   * Move focus one keyable box along, in DOM order.
   *
   * Read off the live DOM rather than tracked per row: the boxes ARE the tab
   * order here, so asking the document is both shorter and automatically right
   * as rows are added and removed. Stops at either end instead of wrapping —
   * Enter past the last box should settle, not jump back to the top.
   */
  const focusAdjacentField = (from: HTMLElement, delta: 1 | -1): void => {
    const root = bodyRef.current;
    if (!root) {
      return;
    }
    const fields = Array.from(root.querySelectorAll<HTMLInputElement>("input:not([disabled])"));
    const next = fields[fields.indexOf(from as HTMLInputElement) + delta];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const addRow = useCallback((): void => {
    setRows((current) => [...current, createSizeEntryRow(baseRate)]);
  }, [baseRate]);

  const removeRow = (key: string): void => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const save = useCallback((): void => {
    if (!validateSizeEntry(rows).ok) {
      setShowErrors(true);
      return;
    }
    onSave(anchorKey, rows);
    onClose();
  }, [anchorKey, onClose, onSave, rows]);

  /**
   * Ctrl+Enter saves, from a document listener rather than a handler on the
   * dialog's own markup.
   *
   * A React `onKeyDown` only ever sees keys pressed on something inside it, and
   * focus is not reliably there: deleting a row unmounts the button that had it
   * and focus falls back to `<body>`, from where the shortcut was simply dead.
   * Captured for the same reason `ModalShell` captures Escape — it must beat the
   * entry screen's own F-key handler underneath.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        save();
        return;
      }
      // Alt+R adds a size — the same chord the item grid uses to add a row, so
      // it is one thing to learn rather than two. `event.code` is checked
      // alongside `event.key` because Alt+letter is a dead key on some layouts,
      // where `key` arrives as the composed character rather than as "r" (the
      // grid's own Alt+R carries this same guard).
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.key.toLowerCase() === "r" || event.code === "KeyR")
      ) {
        event.preventDefault();
        event.stopPropagation();
        addRow();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // Re-registered whenever the rows change rather than held in a ref: the
    // listener has to see the rows as they are NOW, and a dialog this small
    // re-binding one handler per keystroke costs nothing.
  }, [addRow, save]);

  const errorsFor = (key: string) => (showErrors ? validation.rows[key] : undefined);

  return (
    <ModalShell
      title="Size entry"
      isOpen={group !== null}
      onClose={onClose}
      footer={
        <>
          <span className={styles.modalNote}>
            {rows.length} size{rows.length === 1 ? "" : "s"} · total{" "}
            <strong>
              {/* `formatQty` blanks a zero by design — an item grid full of
                  "0.00" is unreadable. A lone footer total is the opposite case:
                  "total  CFT" with a hole in it just looks broken. */}
              {totals.qty === 0 ? "0.000" : formatQty(totals.qty, 3)} {SIZE_UOM}
            </strong>
            {showErrors && !validation.ok ? " · fix the highlighted sizes to continue" : ""}
          </span>
          <span className={styles.gridHeadActions}>
            {/* `buttonPrimary` is a MODIFIER — colour only. On its own the button
                keeps the browser's default font size and no padding, which is
                why OK rendered bigger than Cancel and spilled out of its fill.
                Every other primary button on this screen composes the pair. */}
            <button
              type="button"
              className={cx(styles.button, styles.sizeEntryFooterButton)}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cx(styles.button, styles.buttonPrimary, styles.sizeEntryFooterButton)}
              onClick={save}
            >
              OK
            </button>
          </span>
        </>
      }
    >
      <div ref={bodyRef} className={styles.sizeEntry}>
        <dl className={styles.sizeEntryHead}>
          <div>
            <dt>Code</dt>
            <dd>{template?.itemCode || "—"}</dd>
          </div>
          <div className={styles.sizeEntryHeadWide}>
            <dt>Item</dt>
            <dd>{template?.itemName || "—"}</dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>{template?.unitName || "—"}</dd>
          </div>
          <div>
            <dt>Base rate</dt>
            <dd>{formatCurrency(baseRate, 2, false)}</dd>
          </div>
        </dl>

        <div className={styles.listViewport}>
          <table className={styles.listTable}>
            <thead>
              <tr>
                <th scope="col" className={styles.sizeEntrySerialCell}>
                  #
                </th>
                <th scope="col" className={styles.sizeEntrySizeHead}>
                  Size (L × W T-Pcs)
                </th>
                <th scope="col" className={styles.alignRight}>
                  = {SIZE_UOM}
                </th>
                <th scope="col" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const errors = errorsFor(row.key);
                const cft = cubicFeetFromSize(joinSizeFactors(row.factors));
                return (
                  <tr key={row.key}>
                    <td className={styles.sizeEntrySerialCell}>{index + 1}</td>
                    <td>
                      <SizeBoxes
                        factors={row.factors}
                        invalid={Boolean(errors?.size)}
                        autoFocus={index === 0}
                        onKeyDown={(event) => {
                          // Enter moves to the next box, the way it walks the
                          // cells of the grid behind this dialog — L → W → T →
                          // Pcs → the next row's L. It does NOT add a row:
                          // that is Alt+R, so Enter can be held down to run
                          // through the fields without breeding empty rows.
                          if (event.key !== "Enter" || event.ctrlKey || event.metaKey) {
                            return;
                          }
                          event.preventDefault();
                          focusAdjacentField(event.currentTarget, event.shiftKey ? -1 : 1);
                        }}
                        onChange={(factors) => {
                          const next = cubicFeetFromSize(joinSizeFactors(factors));
                          patchRow(row.key, {
                            factors,
                            // Keying a size re-derives Qty, ALWAYS — this is
                            // exactly what the grid's own Size cell does, and
                            // the two must not disagree about what the same edit
                            // means. A quantity keyed afterwards overrides it
                            // again, which is the visible, correctable order.
                            //
                            // Text that is not yet a size leaves the quantity
                            // alone rather than zeroing a row mid-keying —
                            // the grid's `if (cft !== null)` guard.
                            ...(next === null ? {} : { qty: String(next), qtyTouched: false }),
                          });
                        }}
                      />
                      {errors?.size ? (
                        <span className={styles.sizeEntryError}>{errors.size}</span>
                      ) : null}
                    </td>
                    {/* Read-only: the quantity this size works out to. The
                        dialog keys SIZES — Qty and Rate stay on the item grid,
                        where they already are, and a size that yields nothing
                        reports itself under the size boxes above. */}
                    <td className={cx(styles.alignRight, styles.sizeEntryCftCell)}>
                      {cft === null ? "—" : formatQty(cft, 3)}
                    </td>
                    <td className={styles.sizeEntrySerialCell}>
                      <button
                        type="button"
                        className={styles.rowButton}
                        title="Remove this size"
                        aria-label={`Remove size row ${index + 1}`}
                        onClick={() => removeRow(row.key)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyGrid}>
                    {validation.formError ?? "No sizes on this item."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={styles.sizeEntryActions}>
          <button type="button" className={styles.button} onClick={addRow}>
            + Add size
            <span className={styles.buttonHint}>Alt+R</span>
          </button>
          <span className={styles.modalNote}>
            Each size becomes its own line · Enter next field · Alt+R adds a size · Ctrl+Enter
            is OK · Esc cancels
          </span>
        </div>
      </div>
    </ModalShell>
  );
}
