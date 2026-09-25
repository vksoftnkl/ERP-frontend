"use client";

/**
 * Two prompts that carry more weight than their size suggests, because in both
 * cases the wording is load-bearing.
 *
 *  - **`CancelLinePrompt` (§8)** — removing a line that came from a sales order
 *    is not one action but THREE, and the operator has to choose. A dialog that
 *    offered only "remove" would decide on their behalf whether the order line
 *    stays open, and nobody would know it had.
 *  - **`CancelBillPrompt` (§17.9)** — a POSTED bill is cancelled by reversal.
 *    It keeps its number and stays on the list; the stock, the ledger and the
 *    register are reversed. The reason is stored with the cancellation and
 *    cannot be edited afterwards, so the dialog says so and offers the usual
 *    ones ready-made.
 *  - **`AmendRemarkPrompt` (§17.8)** — a posted bill being saved again keeps
 *    its number and date, and the operator is asked what they changed. The
 *    remark rides on `/bills/amend` as `editRemark`.
 *
 * Every reason is mandatory: the columns are `varchar(250)` and the server
 * rejects a blank, so there is nowhere to hide an unexplained cancellation —
 * which is the point.
 */
import { useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/sales/quotation/page.module.scss";
import { CANCEL_REASON_PRESETS, REMARK_MAX_LENGTH } from "@/features/sales/testbill/constants";
import billStyles from "@/features/sales/testbill/page.module.scss";

const REASON_MAX = 250;

export type CancelLinePromptProps = {
  isOpen: boolean;
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onCancelOnOrder: () => void;
  onRemoveFromBill: () => void;
  onAbort: () => void;
};

export function CancelLinePrompt({
  isOpen,
  reason,
  busy,
  onReasonChange,
  onCancelOnOrder,
  onRemoveFromBill,
  onAbort,
}: CancelLinePromptProps) {
  return (
    <ModalShell title="This line came from a sales order" isOpen={isOpen} narrow onClose={onAbort}>
      <div className={styles.promptOptions}>
        <button
          type="button"
          className={styles.promptOption}
          disabled={busy || !reason.trim()}
          onClick={onCancelOnOrder}
        >
          Cancel on Order
          <br />
          <span className={styles.modalNote}>
            Writes the pending quantity off THIS order line and takes the row off the bill. The
            row goes only if the server agrees — a refused cancellation leaves the bill as it is.
            Needs a reason.
          </span>
        </button>
        <button
          type="button"
          className={styles.promptOption}
          disabled={busy}
          onClick={onRemoveFromBill}
        >
          Remove from Bill
          <br />
          <span className={styles.modalNote}>
            Comes off this bill and stays pending on the order, to be billed later.
          </span>
        </button>
        <button type="button" className={styles.promptOption} disabled={busy} onClick={onAbort}>
          Cancel
          <br />
          <span className={styles.modalNote}>
            The row was picked by mistake — nothing happens.
          </span>
        </button>
      </div>
      <label className={styles.label} htmlFor="cancel-line-reason">
        Reason
        <span className={styles.requiredMark}>*</span>
        <input
          id="cancel-line-reason"
          className={styles.input}
          value={reason}
          maxLength={REASON_MAX}
          disabled={busy}
          placeholder="Why is this order line being cancelled?"
          onChange={(event) => onReasonChange(event.target.value)}
        />
      </label>
      <p className={styles.modalNote}>
        The reason is written onto the order line and into its status trail. Only the first option
        needs it.
      </p>
    </ModalShell>
  );
}

export type CancelBillPromptProps = {
  isOpen: boolean;
  refno: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function CancelBillPrompt({ isOpen, refno, busy, onCancel, onConfirm }: CancelBillPromptProps) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell
      title={`Cancel bill ${refno}`}
      isOpen={isOpen}
      narrow
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={styles.button} disabled={busy} onClick={onCancel}>
            Go back
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.buttonPrimary)}
            disabled={busy || !reason.trim()}
            onClick={() => void onConfirm(reason)}
          >
            {busy ? "Cancelling…" : "Cancel the bill"}
          </button>
        </>
      }
    >
      <p className={styles.modalNote}>
        Why is bill {refno} being cancelled? The reason is stored with the cancellation and cannot
        be edited afterwards.
      </p>
      <div className={billStyles.reasonPresets}>
        {CANCEL_REASON_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={billStyles.reasonPreset}
            disabled={busy}
            onClick={() => setReason(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <label className={styles.label} htmlFor="cancel-bill-reason">
        Reason
        <span className={styles.requiredMark}>*</span>
        <input
          id="cancel-bill-reason"
          className={styles.input}
          value={reason}
          maxLength={REMARK_MAX_LENGTH}
          disabled={busy}
          autoFocus
          placeholder="Why is this bill being cancelled?"
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && reason.trim() && !busy) {
              event.preventDefault();
              void onConfirm(reason);
            }
          }}
        />
      </label>
      <p className={styles.modalNote}>
        The stock, the ledger and the register are reversed. The bill keeps its number and stays on
        the list.
      </p>
    </ModalShell>
  );
}

export type AmendRemarkPromptProps = {
  isOpen: boolean;
  refno: string;
  busy: boolean;
  /** Save changes & Print, or plain Save changes — for the button's wording. */
  print: boolean;
  onCancel: () => void;
  onConfirm: (editRemark: string) => void | Promise<void>;
};

export function AmendRemarkPrompt({ isOpen, refno, busy, print, onCancel, onConfirm }: AmendRemarkPromptProps) {
  const [remark, setRemark] = useState("");
  return (
    <ModalShell
      title="What did you change?"
      isOpen={isOpen}
      narrow
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={styles.button} disabled={busy} onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.buttonPrimary)}
            disabled={busy || !remark.trim()}
            onClick={() => void onConfirm(remark)}
          >
            {busy ? "Saving…" : print ? "Save changes & Print" : "Save changes"}
          </button>
        </>
      }
    >
      <p className={styles.modalNote}>
        Bill {refno} keeps its number and date. The remark is stored with the new revision.
      </p>
      <label className={styles.label} htmlFor="amend-remark">
        Remark
        <span className={styles.requiredMark}>*</span>
        <input
          id="amend-remark"
          className={styles.input}
          value={remark}
          maxLength={REMARK_MAX_LENGTH}
          disabled={busy}
          autoFocus
          placeholder="e.g. quantity of line 2 corrected"
          onChange={(event) => setRemark(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && remark.trim() && !busy) {
              event.preventDefault();
              void onConfirm(remark);
            }
          }}
        />
      </label>
    </ModalShell>
  );
}
