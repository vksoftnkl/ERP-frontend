"use client";

/**
 * Approve or reject — Qt `TillApprovalDecideDialog` (425fa80): an approver's
 * decision on one REQUEST of the inbox (notes 124 §5), opened from Waiting for
 * approval. POST /till/approvals/decide.
 *
 * The note is required; the PIN is the approver's own (the rule's channel
 * decides whether the server insists). A two-person rule takes a second
 * person (dd 68 TILL APPROVER USERS) and their PIN on APPROVE. Grant, limit,
 * self and expiry are the server's calls — its refusal in plain words, its
 * sentence grey under them, nothing written, and the PIN it names typed again
 * from empty. What it decides is `../shared/approval-gate.ts`.
 *
 * Keys: Enter walks the fields (on the last PIN it decides), Ctrl+Enter
 * decides, Esc cancels.
 */
import { useMemo, useRef, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import { focusNextInteractiveControl } from "@/components/design-system/ui/focus-next-control";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useTillSessionClient } from "../shared/api/till-session-api";
import {
  EMPTY_APPROVAL_DECIDE,
  approvalDecideBody,
  approvalDecideProblem,
  decideFacts,
  decideRefusalTarget,
  decideTitle,
  type ApprovalDecideForm,
} from "../shared/approval-gate";
import { tillErrorOf } from "../shared/errors";
import { TillDialog } from "../shared/till-dialog";
import type { TillApprovalInboxItem } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import type { InboxScope } from "./approval-inbox";
import local from "./sessions.module.scss";

export type ApprovalDecideDialogProps = {
  /** A REQUEST row of `/till/approvals/pending`; null = closed. */
  item: TillApprovalInboxItem | null;
  /** The inbox's company · branch: the request is decided there. */
  scope: InboxScope;
  onClose: () => void;
  /** The server took it. */
  onDecided: (decision: ApprovalDecideForm["decision"]) => void;
};

export function ApprovalDecideDialog({ item, scope, onClose, onDecided }: ApprovalDecideDialogProps) {
  return item ? <DecideBody item={item} scope={scope} onClose={onClose} onDecided={onDecided} /> : null;
}

const NOTE_ID = "till-approval-decide-note";
const PIN_ID = "till-approval-decide-pin";
const SECOND_ID = "till-approval-decide-second";
const SECOND_PIN_ID = "till-approval-decide-second-pin";

/** A till PIN as typed: digits only, six at most (Qt's `\d{0,6}` validator). */
function pinOf(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function DecideBody({ item, scope, onClose, onDecided }: ApprovalDecideDialogProps & { item: TillApprovalInboxItem }) {
  const client = useTillSessionClient();
  const userDropdownId = useDropdownId("tillApproverUser");
  const userParams = useMemo(() => ({ icompany_id: scope.companyId }), [scope.companyId]);
  const [form, setForm] = useState<ApprovalDecideForm>(EMPTY_APPROVAL_DECIDE);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  /** Two Ctrl+Enters inside one render must not send two decisions. */
  const inFlight = useRef(false);

  const problem = approvalDecideProblem(item, form);
  const canDecide = !problem && !busy;
  const facts = decideFacts(item);
  const lastPinId = item.twoPerson ? SECOND_PIN_ID : PIN_ID;
  const patch = (next: Partial<ApprovalDecideForm>) => setForm((current) => ({ ...current, ...next }));

  const decide = async () => {
    if (!canDecide || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      await client.approvalDecide(approvalDecideBody(item, scope, form));
      onDecided(form.decision);
    } catch (thrown) {
      const read = tillErrorOf(thrown, "The decision could not be recorded.");
      setRefusal(read.refusal);
      // The fields stay enabled while the request is out (only the button
      // waits, as in Qt), so the PIN the refusal names takes the focus now.
      const target = decideRefusalTarget(read);
      if (target === "second") {
        patch({ secondPin: "" });
        // No one picked yet: the picker, not its disabled PIN box.
        document.getElementById(form.second?.id ? SECOND_PIN_ID : SECOND_ID)?.focus();
      } else if (target === "pin") {
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
      title={decideTitle(item)}
      subtitle="Approve or reject"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void decide();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
          <button type="button" className={styles.primaryButton} disabled={!canDecide} title={problem} onClick={() => void decide()}>
            {form.decision === "REJECT" ? "Reject - Ctrl+Enter" : "Approve - Ctrl+Enter"}
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        {facts.map((fact) => (
          <div key={fact.caption} className={styles.fact}>
            <span className={styles.cap}>{fact.caption}</span>
            <span
              className={cx(fact.tone ? styles.figure : cx(styles.val, local.factWrap), fact.tone === "amber" && styles.toneAmber)}
            >
              {fact.value}
            </span>
          </div>
        ))}
      </div>

      <div
        className={styles.formGrid}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.defaultPrevented) return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) return;
          event.preventDefault();
          // The last PIN is the last field: Enter there decides, as Qt's Enter
          // walk lands on the button.
          if (target.id === lastPinId) {
            void decide();
            return;
          }
          focusNextInteractiveControl(target);
        }}
      >
        <span className={styles.formLabel}>Decision</span>
        <div className={styles.radioRow} role="radiogroup" aria-label="Decision">
          {(
            [
              ["APPROVE", "Approve"],
              ["REJECT", "Reject"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={styles.radio}>
              <input
                type="radio"
                name="till-approval-decision"
                checked={form.decision === value}
                onChange={() => patch({ decision: value })}
              />
              {label}
            </label>
          ))}
        </div>

        <label className={styles.formLabel} htmlFor={NOTE_ID}>
          Your note *
        </label>
        <input
          id={NOTE_ID}
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          autoFocus
          placeholder="Why — kept with the decision"
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor={PIN_ID}>
          Your PIN
        </label>
        <input
          id={PIN_ID}
          type="password"
          inputMode="numeric"
          className={styles.input}
          maxLength={6}
          autoComplete="off"
          data-uppercase="off"
          placeholder="Your till PIN"
          value={form.pin}
          onChange={(event) => patch({ pin: pinOf(event.target.value) })}
        />

        {item.twoPerson ? (
          <>
            <label className={styles.formLabel} htmlFor={SECOND_ID}>
              Second person *
            </label>
            <NexDropdownSingle
              id={SECOND_ID}
              dropdownId={userDropdownId}
              params={userParams}
              clearOnParamsChange={false}
              value={form.second}
              onChange={(second) => patch({ second, secondPin: second?.id === form.second?.id ? form.secondPin : "" })}
              placeholder="Who signs with you"
              aria-label="Second person"
              className={styles.dropdown}
            />

            <label className={styles.formLabel} htmlFor={SECOND_PIN_ID}>
              Their PIN *
            </label>
            <input
              id={SECOND_PIN_ID}
              type="password"
              inputMode="numeric"
              className={styles.input}
              maxLength={6}
              autoComplete="off"
              data-uppercase="off"
              placeholder="Their till PIN"
              disabled={!form.second?.id}
              value={form.secondPin}
              onChange={(event) => patch({ secondPin: pinOf(event.target.value) })}
            />
          </>
        ) : null}
      </div>

      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
