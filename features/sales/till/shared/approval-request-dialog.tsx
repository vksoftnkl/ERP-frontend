"use client";

/**
 * Needs approval — Qt `TillApprovalRequestDialog` (425fa80): what a screen
 * shows when the server answers 428 TILL_APPROVAL_REQUIRED (notes 124 §5, a
 * company on `till.approval_gate` REFUSE). POST /till/approvals/request, two
 * ways:
 *
 *   Approve now        the approver standing here picks their name and types
 *                      their till PIN: decided in this one call. APPROVED →
 *                      `onApproved(tapId)`, and the screen retries at once
 *                      with `approvalId`.
 *   Send to inbox      PENDING for an approver's own login. Pressed again
 *                      later it asks for the same document, and once that
 *                      request is APPROVED the dialog closes with its id.
 *
 * The counter is never kept waiting by it: Esc leaves the document as it was
 * (a saved draft stays a draft). What it decides is `approval-gate.ts`.
 *
 * Keys: Enter walks the fields, Ctrl+Enter approves now, Esc cancels.
 */
import { useMemo, useRef, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import { focusNextInteractiveControl } from "@/components/design-system/ui/focus-next-control";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useTillSessionClient } from "./api/till-session-api";
import {
  EMPTY_APPROVAL_REQUEST,
  SEND_TO_INBOX_TIP,
  approvalAnswerOf,
  approvalNeedsLine,
  approvalRequestBody,
  approveHereProblem,
  requestRefusalHitsPin,
  type ApprovalRequestForm,
  type ApprovalRequestState,
} from "./approval-gate";
import { tillErrorOf } from "./errors";
import { TillDialog } from "./till-dialog";
import styles from "./till.module.scss";

export type ApprovalRequestDialogProps = {
  /** Null = closed. Built with `approvalAskOf(need, …)` from the 428. */
  request: ApprovalRequestState | null;
  /** APPROVED: the id the retried call sends as `approvalId`. */
  onApproved: (tapId: string) => void;
  /** Closed without an approval; `sentToInbox` when a PENDING request now waits. */
  onClose: (sentToInbox: boolean) => void;
};

export function ApprovalRequestDialog({ request, onApproved, onClose }: ApprovalRequestDialogProps) {
  return request ? <ApprovalRequestBody request={request} onApproved={onApproved} onClose={onClose} /> : null;
}

const NOTE_ID = "till-approval-request-note";
const APPROVER_ID = "till-approval-request-approver";
const PIN_ID = "till-approval-request-pin";

function ApprovalRequestBody({ request, onApproved, onClose }: ApprovalRequestDialogProps & { request: ApprovalRequestState }) {
  const client = useTillSessionClient();
  const userDropdownId = useDropdownId("tillApproverUser");
  const userParams = useMemo(() => ({ icompany_id: request.ask.companyId }), [request.ask.companyId]);
  const [form, setForm] = useState<ApprovalRequestForm>(EMPTY_APPROVAL_REQUEST);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const [state, setState] = useState("");
  const [sentToInbox, setSentToInbox] = useState(false);
  /** Two presses inside one render must not file two requests. */
  const inFlight = useRef(false);

  const hereProblem = approveHereProblem(form);
  const patch = (next: Partial<ApprovalRequestForm>) => setForm((current) => ({ ...current, ...next }));

  const send = async (approverHere: boolean) => {
    if (busy || inFlight.current) return;
    if (approverHere && hereProblem) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      const answer = approvalAnswerOf(await client.approvalRequest(approvalRequestBody(request, form, approverHere)));
      if (answer.kind === "approved") {
        onApproved(answer.tapId);
        return;
      }
      setState(answer.text);
      if (answer.kind === "pending") setSentToInbox(true);
    } catch (thrown) {
      const read = tillErrorOf(thrown, "The approval could not be asked for.");
      setRefusal(read.refusal);
      if (requestRefusalHitsPin(read)) {
        patch({ pin: "" });
        document.getElementById(PIN_ID)?.focus();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <TillDialog
      open
      size="narrow"
      busy={busy}
      title="Needs approval"
      subtitle={approvalNeedsLine(request)}
      onClose={() => onClose(sentToInbox)}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void send(true);
        }
      }}
      footer={
        <>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => onClose(sentToInbox)}>
            Esc  Cancel
          </button>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            title={SEND_TO_INBOX_TIP}
            onClick={() => void send(false)}
          >
            Send to inbox / check
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy || Boolean(hereProblem)}
            title={hereProblem}
            onClick={() => void send(true)}
          >
            Approve now - Ctrl+Enter
          </button>
        </>
      }
    >
      <div
        className={styles.formGrid}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.defaultPrevented) return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) return;
          event.preventDefault();
          // The PIN is the last field: Enter there approves, as Qt's Enter walk
          // lands on the default button.
          if (target.id === PIN_ID) {
            void send(true);
            return;
          }
          focusNextInteractiveControl(target);
        }}
      >
        <label className={styles.formLabel} htmlFor={NOTE_ID}>
          Note
        </label>
        <input
          id={NOTE_ID}
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          autoFocus
          placeholder="Why — the approver reads it"
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor={APPROVER_ID}>
          Approver here
        </label>
        <NexDropdownSingle
          id={APPROVER_ID}
          dropdownId={userDropdownId}
          params={userParams}
          clearOnParamsChange={false}
          value={form.approver}
          onChange={(approver) => patch({ approver, pin: approver?.id === form.approver?.id ? form.pin : "" })}
          placeholder="The approver standing here"
          aria-label="Approver here"
          className={styles.dropdown}
        />

        <label className={styles.formLabel} htmlFor={PIN_ID}>
          Their PIN
        </label>
        <input
          id={PIN_ID}
          type="password"
          inputMode="numeric"
          className={styles.input}
          maxLength={6}
          autoComplete="off"
          data-uppercase="off"
          placeholder="Their till PIN"
          value={form.pin}
          onChange={(event) => patch({ pin: event.target.value.replace(/\D/g, "").slice(0, 6) })}
        />
      </div>

      {state ? <p className={styles.muted}>{state}</p> : null}
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
