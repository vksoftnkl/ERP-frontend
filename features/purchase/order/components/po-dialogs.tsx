"use client";

/**
 * The DOC-01 popups of the Purchase Order screen (Qt
 * `purchase_order_dialogs.cpp`, NexERP 6c6b5c2) and the amendment's question:
 *
 *  - AmendReasonDialog — "Why is the order changed?" (optional; Qt `askText`
 *    without the required flag), asked by Save amendment;
 *  - PoMergeDialog — the supplier's confirmed POs with something pending,
 *    ticked ones become ONE new draft (`/purchase/orders/merge`);
 *  - PoRevisionsDialog — every save of the PO, newest first
 *    (`/purchase/orders/revisions`).
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { money } from "@/features/purchase/shared/purchase.format";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { dateTime12Of } from "@/lib/time-format";
import type { MergeChoice, RevisionRow } from "../purchase-order.state";
import styles from "./po-dialogs.module.scss";

// ---------------------------------------------------------------------------
// Save amendment — why
// ---------------------------------------------------------------------------

export function AmendReasonDialog({
  refno,
  onCancel,
  onConfirm,
}: {
  refno: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <ModalShell
      title={`Amend ${refno}`}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.actions}>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            onClick={() => onConfirm(value.trim())}
          >
            Save amendment
          </button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.note}>Why is the order changed? (kept with the old version)</p>
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          maxLength={250}
          placeholder="e.g. supplier revised the rate"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onConfirm(value.trim());
            }
          }}
        />
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Merge…
// ---------------------------------------------------------------------------

export function PoMergeDialog({
  supplierName,
  choices,
  initiallyTicked,
  busy,
  onCancel,
  onMerge,
}: {
  supplierName: string;
  choices: readonly MergeChoice[];
  /** `poId|accYear` of the PO on screen when it is a confirmed one (Qt ticks it). */
  initiallyTicked: string;
  busy: boolean;
  onCancel: () => void;
  onMerge: (picked: MergeChoice[]) => void;
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() =>
    new Set(choices.some((choice) => choice.key === initiallyTicked) ? [initiallyTicked] : []),
  );
  const [problem, setProblem] = useState("");
  const toggle = (key: string) => {
    setProblem("");
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const merge = () => {
    const picked = choices.filter((choice) => ticked.has(choice.key));
    if (picked.length < 2) {
      setProblem("Tick at least two orders to merge.");
      return;
    }
    onMerge(picked);
  };
  return (
    <ModalShell
      title={`Merge purchase orders — ${supplierName}`}
      isOpen
      onClose={onCancel}
      footer={
        <div className={styles.actions}>
          {problem ? <span className={styles.problem}>{problem}</span> : null}
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={busy || choices.length < 2}
            onClick={merge}
          >
            {busy ? "Merging…" : "Merge"}
          </button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.note}>
          Tick two or more confirmed orders. What is still pending on them becomes ONE new draft; the ticked orders are
          short-closed &quot;Merged into …&quot;.
        </p>
        {choices.length === 0 ? (
          <p className={styles.empty}>This supplier has no confirmed order with anything pending.</p>
        ) : (
          <ul className={styles.choiceList} role="listbox" aria-multiselectable="true" aria-label="Orders to merge">
            {choices.map((choice, index) => (
              <li key={choice.key}>
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={ticked.has(choice.key)}
                    autoFocus={index === 0}
                    onChange={() => toggle(choice.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        merge();
                      }
                    }}
                  />
                  <span>{choice.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Versions…
// ---------------------------------------------------------------------------

export function PoRevisionsDialog({
  refno,
  rows,
  onClose,
}: {
  refno: string;
  rows: readonly RevisionRow[];
  onClose: () => void;
}) {
  return (
    <ModalShell
      title={`Versions of ${refno}`}
      isOpen
      wide
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <button type="button" className={quotationStyles.button} autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.note}>Every save of the order, newest first — the value and lines it had after that save.</p>
        {rows.length === 0 ? (
          <p className={styles.empty}>No saved version is recorded for this order.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.num}>Rev</th>
                  <th>Saved on</th>
                  <th>By</th>
                  <th className={styles.what}>What</th>
                  <th className={styles.num}>Lines</th>
                  <th className={styles.num}>PO value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.revNo}-${index}`}>
                    <td className={styles.num}>{row.revNo}</td>
                    <td>{dateTime12Of(row.savedOn) || row.savedOn}</td>
                    <td>{row.by}</td>
                    <td className={styles.what}>{row.what}</td>
                    <td className={styles.num}>{row.lines}</td>
                    <td className={styles.num}>{money(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
