"use client";

/**
 * The 2026-10-29 rebuild's PO popups (Qt purchase_order_dialogs.cpp +
 * PurchaseOrderEntry::openCloneMergeMenu / openSendMenu):
 *
 *  - PoShortCloseDialog — Short close…: the pending lines ticked (the current
 *    one, or all), a reason; every line ticked = the whole PO;
 *  - PoReorderDialog — Reorder suggestions · F7: items at or below their
 *    reorder level, ticked ones become lines at the suggested qty;
 *  - PoChoiceMenu — the two little menus (Clone / merge pending; Send).
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { qtyText } from "@/features/purchase/shared/purchase.format";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { toast } from "@/lib/notify";
import { shortCloseLineIds, suggestionText, type ReorderSuggestion, type ShortCloseLine } from "../po-fidelity";
import styles from "./po-dialogs.module.scss";

export function PoShortCloseDialog({
  refno,
  lines,
  tickLineId,
  onCancel,
  onConfirm,
}: {
  refno: string;
  lines: readonly ShortCloseLine[];
  /** The current line (when several): ticked alone; else every line is ticked. */
  tickLineId: string;
  onCancel: () => void;
  /** lineIds empty = every pending line (the whole PO). */
  onConfirm: (lineIds: string[], reason: string) => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(lines.filter((l) => !tickLineId || l.lineId === tickLineId).map((l) => l.lineId)),
  );
  const [reason, setReason] = useState("");
  const reasonRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => reasonRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const accept = () => {
    const ids = shortCloseLineIds(lines, ticked);
    if (ids === null) {
      toast.warn("Tick the lines to close.", { title: "Tick a line" });
      return;
    }
    if (!reason.trim()) {
      toast.warn("Type why the order is short closed.", { title: "Reason needed" });
      reasonRef.current?.focus();
      return;
    }
    onConfirm(ids, reason.trim());
  };
  return (
    <ModalShell
      title={`Short close ${refno}`}
      isOpen
      onClose={onCancel}
      footer={
        <div className={styles.actions}>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={accept} disabled={lines.length === 0}>
            Short close
          </button>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Cancel
          </button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.note}>
          Stop waiting for the rest of the ticked lines — what came stays, what is pending is closed. Tick every line to close the whole
          order.
        </p>
        {lines.length === 0 ? <p className={styles.empty}>Nothing is pending on this order.</p> : null}
        <ul className={styles.choiceList}>
          {lines.map((l) => (
            <li key={l.lineId}>
              <label className={styles.choice}>
                <input
                  type="checkbox"
                  checked={ticked.has(l.lineId)}
                  onChange={(event) =>
                    setTicked((set) => {
                      const next = new Set(set);
                      if (event.target.checked) next.add(l.lineId);
                      else next.delete(l.lineId);
                      return next;
                    })
                  }
                />
                <span>
                  {l.item} — ordered {qtyText(l.ordered)} {l.unit}, received {qtyText(l.received)}, pending {qtyText(l.pending)}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <input
          ref={reasonRef}
          className={styles.input}
          value={reason}
          maxLength={250}
          aria-label="Reason"
          placeholder="Reason * — why stop waiting (e.g. supplier out of stock)"
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              accept();
            }
          }}
        />
      </div>
    </ModalShell>
  );
}

export function PoReorderDialog({
  supplierName,
  rows,
  onCancel,
  onPick,
}: {
  supplierName: string;
  rows: readonly ReorderSuggestion[];
  onCancel: () => void;
  onPick: (rows: ReorderSuggestion[]) => void;
}) {
  const [ticked, setTicked] = useState<Set<number>>(() => new Set(rows.map((_, index) => index)));
  const add = () => {
    onPick(rows.filter((_, index) => ticked.has(index)));
  };
  return (
    <ModalShell
      title={supplierName ? `Reorder suggestions — ${supplierName}` : "Reorder suggestions"}
      isOpen
      onClose={onCancel}
      footer={
        <div className={styles.actions}>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={add} disabled={rows.length === 0}>
            Add to the order
          </button>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Close
          </button>
        </div>
      }
    >
      <div
        className={styles.body}
        onKeyDown={(event) => {
          if (event.key === "Enter" && rows.length > 0) {
            event.preventDefault();
            add();
          }
        }}
      >
        <p className={styles.note}>
          Items at or below their reorder level (item card → reorder policy). The ticked ones are added to this order at the suggested qty —
          change the qty on the line if you need.
        </p>
        {rows.length === 0 ? (
          <p className={styles.empty}>
            {supplierName ? "No item of this supplier is at or below its reorder level." : "No item is at or below its reorder level."}
          </p>
        ) : null}
        <ul className={styles.choiceList}>
          {rows.map((row, index) => (
            <li key={`${row.itemId}-${row.uomId}`}>
              <label className={styles.choice}>
                <input
                  type="checkbox"
                  autoFocus={index === 0}
                  checked={ticked.has(index)}
                  onChange={(event) =>
                    setTicked((set) => {
                      const next = new Set(set);
                      if (event.target.checked) next.add(index);
                      else next.delete(index);
                      return next;
                    })
                  }
                />
                <span>{suggestionText(row)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}

export type PoChoice = { key: string; label: string; disabled?: boolean };

/** Qt QMenu as a small popup: ↑ / ↓ and Enter, or a click. */
export function PoChoiceMenu({
  title,
  choices,
  onCancel,
  onPick,
}: {
  title: string;
  choices: readonly PoChoice[];
  onCancel: () => void;
  onPick: (key: string) => void;
}) {
  const first = choices.findIndex((c) => !c.disabled);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => refs.current[first]?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [first]);
  return (
    <ModalShell title={title} isOpen narrow onClose={onCancel}>
      <div className={styles.body} role="menu">
        {choices.map((choice, index) => (
          <button
            key={choice.key}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="menuitem"
            className={quotationStyles.button}
            disabled={choice.disabled}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                for (let at = index + step; at >= 0 && at < choices.length; at += step) {
                  if (!choices[at].disabled) {
                    refs.current[at]?.focus();
                    break;
                  }
                }
              }
            }}
            onClick={() => onPick(choice.key)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
