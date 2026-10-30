"use client";

/**
 * From GRN / PO · Ctrl+L (invoice) / From PO · Ctrl+L (GRN) — Qt
 * `PurchaseSourcePicker` (purchase_parts.cpp): one list, a heading per kind,
 * rows already on the document shown but not pickable. Single mode: Enter /
 * double-click picks the current row. Multi mode: Space ticks, Enter / Bring in
 * takes the ticked rows, or the current one when none is ticked.
 */
import { useCallback, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { purchaseSourceRows, type PurchaseSourceChoice } from "../purchase-parts";
import styles from "./purchase-parts.module.scss";

export type PurchaseSourcePickerProps = {
  open: boolean;
  choices: readonly PurchaseSourceChoice[];
  /** Several at once (Space ticks). */
  multi?: boolean;
  /** The heading per kind (default the invoice's GRN / PO wording). */
  headings?: Readonly<Record<string, string>>;
  hint?: string;
  title?: string;
  /** Still loading the choices. */
  loading?: boolean;
  onPick?: (kind: string, id: string) => void;
  onPickMany?: (ids: string[]) => void;
  onClose: () => void;
};

const DEFAULT_HINT = "A GRN's lines come in whole (its qty and batches); a PO's pending lines come in at the PO's rate.";

export function PurchaseSourcePicker(props: PurchaseSourcePickerProps) {
  return props.open ? <OpenSourcePicker {...props} /> : null;
}

function OpenSourcePicker({ choices, multi, headings, hint, title, loading, onPick, onPickMany, onClose }: PurchaseSourcePickerProps) {
  const rows = useMemo(() => purchaseSourceRows(choices, headings), [choices, headings]);
  const pickable = useMemo(() => choices.map((choice, index) => ({ choice, index })).filter(({ choice }) => !choice.done), [choices]);
  const [picked, setCurrent] = useState<number>(() => pickable[0]?.index ?? -1);
  // the choices may arrive after the picker opened: the first pickable one is current until one is chosen
  const current = picked >= 0 ? picked : (pickable[0]?.index ?? -1);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  // The list takes the focus when it really mounts: ModalShell portals its body one
  // commit late, so a mount effect would find no element and leave the focus on the
  // screen behind (Enter after Ctrl+L then did nothing until a click).
  const focused = useRef(false);
  const listRef = useCallback((element: HTMLDivElement | null) => {
    if (element && !focused.current) {
      focused.current = true;
      element.focus();
    }
  }, []);

  const choose = (index = current) => {
    if (multi) {
      const ids = choices.filter((choice) => !choice.done && ticked.has(choice.id)).map((choice) => choice.id);
      if (ids.length === 0 && index >= 0 && !choices[index]?.done) ids.push(choices[index].id);
      if (ids.length === 0) return;
      onPickMany?.(ids);
      onClose();
      return;
    }
    const choice = choices[index];
    if (!choice || choice.done) return;
    onPick?.(choice.kind, choice.id);
    onClose();
  };

  const toggle = (id: string) =>
    setTicked((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const at = pickable.findIndex((row) => row.index === current);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = pickable[Math.min(pickable.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next) setCurrent(next.index);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose();
    } else if (event.key === " " && multi && current >= 0) {
      event.preventDefault();
      toggle(choices[current].id);
    }
  };

  const footer = (
    <>
      {multi ? <span className={styles.footerNote}>Space ticks · Enter brings in the ticked ones (or the one under the cursor)</span> : null}
      <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={() => choose()}>
        Bring in
      </button>
      <button type="button" className={quotationStyles.button} onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <ModalShell title={title ?? (multi ? "From PO" : "From GRN / PO")} isOpen fixedHeight panelClassName={styles.pickerPanel} onClose={onClose} footer={footer}>
      <p className={styles.hint}>{hint ?? DEFAULT_HINT}</p>
      <div ref={listRef} className={styles.list} tabIndex={0} role="listbox" aria-multiselectable={multi || undefined} onKeyDown={onKeyDown} data-purchase-source-picker="">
        {loading ? <div className={styles.listEmpty}>Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className={styles.listEmpty}>Nothing waiting for this supplier.</div> : null}
        {rows.map((row) =>
          row.type === "heading" ? (
            <div key={`h-${row.kind}`} className={styles.listHeading}>
              {row.text}
            </div>
          ) : (
            <button
              key={`c-${row.choice.id}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={row.index === current}
              disabled={row.choice.done}
              className={cx(styles.listRow, row.index === current && styles.listRowCurrent)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setCurrent(row.index);
                if (multi) toggle(row.choice.id);
              }}
              onDoubleClick={() => choose(row.index)}
            >
              {multi && !row.choice.done ? <input type="checkbox" tabIndex={-1} readOnly checked={ticked.has(row.choice.id)} /> : null}
              <span>{row.choice.text}</span>
              {row.choice.done ? <span className={styles.footerNote}>(on this document)</span> : null}
            </button>
          ),
        )}
      </div>
    </ModalShell>
  );
}
