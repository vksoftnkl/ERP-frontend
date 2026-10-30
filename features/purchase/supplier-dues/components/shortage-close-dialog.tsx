"use client";

/**
 * "Close row… (CN / claim / write-off)" — Qt `ShortageCloseDialog`
 * (NexERP src/modules/purchase/dues/shortage_close_dialog.cpp), shared by
 * Supplier Dues (menu 297, section B) and the Shortage Receipt (menu 195).
 * Closes one or several open shortages without goods:
 *   Supplier CN            the supplier credits it (bill-wise): CN no / date
 *   Claim on transporter   the receivable moves to that party (settled under A. CLAIMS)
 *   Claim on insurer       the same, on an insurer
 *   Write off              with a reason
 * Qty is asked only for one row (default its whole open qty); several rows close whole.
 * The dialog only decides the body keys; the caller adds shortageId / accYear /
 * deviceId per row and does the POST /purchase/shortages/close.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { DateInput } from "@/components/design-system/ui";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  CLOSE_REASON_MAX,
  CN_NO_MAX,
  SHORTAGE_CLOSE_CHOICES,
  closeBody,
  closeFieldsFor,
  closeNoteFor,
  closeQtyProblem,
  closeReady,
  closeTitle,
  closeWindowTitle,
  initialCloseForm,
  type ShortageCloseBody,
  type ShortageCloseChoice,
  type ShortageCloseForm,
} from "../shortage-close";
import styles from "../supplier-dues.module.scss";

export type { ShortageCloseBody, ShortageCloseKind } from "../shortage-close";

export type ShortageCloseDialogProps = {
  open: boolean;
  /** How many shortages are being closed. */
  rows: number;
  /** The single row's open qty / unit (rows === 1). */
  openQty: number;
  unit: string;
  onCancel: () => void;
  onAccept: (body: ShortageCloseBody) => void;
};

export function ShortageCloseDialog(props: ShortageCloseDialogProps): JSX.Element | null {
  if (!props.open) {
    return null;
  }
  return <ShortageCloseDialogBody {...props} />;
}

function ShortageCloseDialogBody({ rows, openQty, unit, onCancel, onAccept }: ShortageCloseDialogProps) {
  const [form, setForm] = useState<ShortageCloseForm>(() => initialCloseForm(openQty));
  const [problem, setProblem] = useState("");
  const ledgerDropdownId = useDropdownId("ledgerAll");
  const kindRef = useRef<HTMLSelectElement | null>(null);
  const fields = closeFieldsFor(form.choice, rows);
  const ready = closeReady(form);
  const note = useMemo(() => problem || closeNoteFor(form.choice), [problem, form.choice]);

  useEffect(() => {
    const timer = window.setTimeout(() => kindRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const patch = (next: Partial<ShortageCloseForm>) => {
    setProblem("");
    setForm((current) => ({ ...current, ...next }));
  };

  const accept = () => {
    if (!ready) {
      return;
    }
    const why = closeQtyProblem(form, rows, openQty);
    if (why) {
      setProblem(why);
      return;
    }
    onAccept(closeBody(form, rows, openQty));
  };

  return (
    <ModalShell
      title={closeWindowTitle(rows)}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={!ready}
            onClick={accept}
          >
            Close row
          </button>
        </div>
      }
    >
      <div
        className={styles.closeDialog}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.defaultPrevented && (event.ctrlKey || (event.target as HTMLElement).tagName === "INPUT")) {
            const target = event.target as HTMLElement;
            // The ledger picker takes its own Enter.
            if (target.closest("[data-nex-dropdown]")) {
              return;
            }
            event.preventDefault();
            accept();
          }
        }}
      >
        <p className={styles.closeTitle}>{closeTitle(rows, openQty, unit)}</p>
        <div className={styles.closeGrid}>
          <label className={styles.cap} htmlFor="sdu-close-kind">
            Close as
          </label>
          <select
            id="sdu-close-kind"
            ref={kindRef}
            className={styles.input}
            value={form.choice}
            onChange={(event) => patch({ choice: event.target.value as ShortageCloseChoice })}
          >
            {SHORTAGE_CLOSE_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>

          {fields.showQty ? (
            <>
              <label className={styles.cap} htmlFor="sdu-close-qty">
                Qty
              </label>
              <input
                id="sdu-close-qty"
                className={cx(styles.input, styles.inputNumber)}
                inputMode="decimal"
                autoComplete="off"
                title="Base units; the whole open qty unless you type less"
                value={form.qty}
                onChange={(event) => patch({ qty: event.target.value })}
              />
            </>
          ) : null}

          {fields.showCn ? (
            <>
              <label className={styles.cap} htmlFor="sdu-close-cn">
                Credit note
              </label>
              <div className={styles.cnRow}>
                <input
                  id="sdu-close-cn"
                  className={styles.input}
                  maxLength={CN_NO_MAX}
                  placeholder="their credit note no"
                  autoComplete="off"
                  data-uppercase="off"
                  value={form.cnNo}
                  onChange={(event) => patch({ cnNo: event.target.value })}
                />
                <DateInput aria-label="CN date" value={form.cnDate} onChange={(value) => patch({ cnDate: value })} />
              </div>
            </>
          ) : null}

          {fields.showParty ? (
            <>
              <span className={styles.cap}>Claim on</span>
              <div data-nex-dropdown title="The transporter / insurer ledger the claim is on — it is then settled under A. CLAIMS">
                <NexDropdownSingle
                  dropdownId={ledgerDropdownId}
                  aria-label="Claim on"
                  placeholder="Pick the ledger"
                  value={form.partyId ? { id: form.partyId, text: form.partyName } : null}
                  onChange={(selection) => patch({ partyId: selection?.id ?? "", partyName: selection?.text ?? "" })}
                />
              </div>
            </>
          ) : null}

          <label className={styles.cap} htmlFor="sdu-close-reason">
            Reason
          </label>
          <input
            id="sdu-close-reason"
            className={styles.input}
            maxLength={CLOSE_REASON_MAX}
            placeholder={fields.reasonPlaceholder}
            autoComplete="off"
            value={form.reason}
            onChange={(event) => patch({ reason: event.target.value })}
          />
        </div>
        <p className={cx(styles.closeNote, problem && styles.closeNoteBad)} role="status">
          {note}
        </p>
      </div>
    </ModalShell>
  );
}
