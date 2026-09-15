"use client";

/**
 * Two prompts that carry more weight than their size suggests, because in both
 * cases the wording is load-bearing.
 *
 *  - **`CancelLinePrompt` (§8)** — removing a line that came from a sales order
 *    is not one action but THREE, and the operator has to choose. A dialog that
 *    offered only "remove" would decide on their behalf whether the order line
 *    stays open, and nobody would know it had.
 *  - **`CancelOrderPrompt` (§16)** — "cancel bill" is what an operator would
 *    call it, and it is NOT what the route does. It writes off every open line
 *    of the source ORDER and leaves the bill exactly as it is. Saying so is the
 *    whole job of this dialog.
 *
 * Both reasons are mandatory: `soi_cancel_reason` is `varchar(250)` and the
 * server rejects a blank, so there is nowhere to hide an unexplained
 * cancellation — which is the point.
 */
import { useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/sales/quotation/page.module.scss";

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

export type CancelOrderPromptProps = {
  isOpen: boolean;
  /** The source document's reference, for the wording. */
  refno: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function CancelOrderPrompt({
  isOpen,
  refno,
  busy,
  onCancel,
  onConfirm,
}: CancelOrderPromptProps) {
  const [reason, setReason] = useState("");
  const [username, setUsername] = useState("");
  return (
    <ModalShell
      title="Cancel the source order"
      isOpen={isOpen}
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
            {busy ? "Cancelling…" : "Cancel the order"}
          </button>
        </>
      }
    >
      {/*
        Said plainly, because the route's name says the opposite. An operator who
        reads "cancel" and expects the bill to go away will not find out
        otherwise until the accounts do.
      */}
      <p className={styles.warning}>
        This does <strong>not</strong> cancel the bill. There is no route that does.
      </p>
      <p className={styles.modalNote}>
        Every still-open line of {refno ? <strong>{refno}</strong> : "the source order"} is written
        off: its pending quantity moves into cancelled, and the order&apos;s status and amounts
        follow. The bill, its lines, its charges, its tenders and its voucher posting are left
        exactly as they are. Running it twice cancels nothing the second time.
      </p>
      <label className={styles.label} htmlFor="cancel-order-reason">
        Reason
        <span className={styles.requiredMark}>*</span>
        <input
          id="cancel-order-reason"
          className={styles.input}
          value={reason}
          maxLength={REASON_MAX}
          disabled={busy}
          placeholder="Why is the order being closed out?"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {/*
        Shown but not keyed in practice: the actor defaults to the signed-in
        operator. It is here because the server records it on every row the call
        writes, and an operator cancelling on somebody else's instruction should
        be able to say so.
      */}
      <label className={styles.label} htmlFor="cancel-order-user">
        Recorded as
        <input
          id="cancel-order-user"
          className={styles.input}
          value={username}
          maxLength={50}
          disabled={busy}
          placeholder="(the signed-in operator)"
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
    </ModalShell>
  );
}
