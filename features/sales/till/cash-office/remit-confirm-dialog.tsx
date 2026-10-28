"use client";

/**
 * Confirm remittance — Qt `TillRemitConfirmDialog` (ec9d92d): a CIT
 * remittance still on the way, confirmed against the bank statement from the
 * Cash Office's On the way tab. What it decides is `remit-confirm.ts`; a
 * refusal is said in plain words with the server's sentence grey under it.
 *
 * Keys: Enter walks the fields, Ctrl+Enter confirms, Esc cancels.
 */
import { useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { tillErrorOf } from "../shared/errors";
import { isAmountDraft, paiseOf } from "../shared/money";
import { selectOnFocus } from "../shared/select-on-focus";
import { TillDialog } from "../shared/till-dialog";
import type { TillRemitConfirmResult } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { walkOnEnter } from "./enter-walk";
import {
  creditedPaise,
  initialRemitConfirmForm,
  remitConfirmBody,
  remitConfirmFacts,
  remitConfirmHint,
  remitConfirmProblem,
  type RemitConfirmForm,
  type RemitConfirmRequest,
} from "./remit-confirm";
import local from "./cash-office.module.scss";
import { DateInput } from "@/components/design-system/ui/date-input";

export type RemitConfirmDialogProps = {
  request: RemitConfirmRequest | null;
  onClose: () => void;
  /** The server's answer once confirmed. */
  onConfirmed: (result: TillRemitConfirmResult) => void;
};

export function RemitConfirmDialog({ request, onClose, onConfirmed }: RemitConfirmDialogProps) {
  return request ? <RemitConfirmBody request={request} onClose={onClose} onConfirmed={onConfirmed} /> : null;
}

function RemitConfirmBody({ request, onClose, onConfirmed }: RemitConfirmDialogProps & { request: RemitConfirmRequest }) {
  const client = useTillSessionClient();
  const { remit } = request;
  const [facts] = useState(() => remitConfirmFacts(remit));
  // The server's today is the business date (past midnight before the cutoff it is still yesterday).
  const [form, setForm] = useState<RemitConfirmForm>(() =>
    initialRemitConfirmForm(remit, request.businessDate.slice(0, 10) || undefined),
  );
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const inFlight = useRef(false);

  const problem = remitConfirmProblem(form);
  const canConfirm = !problem && !busy;
  const patch = (next: Partial<RemitConfirmForm>) => setForm((current) => ({ ...current, ...next }));

  const confirmIt = async () => {
    if (!canConfirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      onConfirmed(await client.remitConfirm(remitConfirmBody(request, form)));
    } catch (thrown) {
      setRefusal(tillErrorOf(thrown, "The remittance could not be confirmed.").refusal);
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
      title="Confirm with the bank statement"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void confirmIt();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canConfirm}
            title={problem}
            onClick={() => void confirmIt()}
          >
            Confirm - Ctrl+Enter
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        {(
          [
            ["Remittance", facts.doc],
            ["Agency · bag", facts.agency || "—"],
            ["Sent", facts.sent],
          ] as const
        ).map(([caption, value]) => (
          <div key={caption} className={styles.fact}>
            <span className={styles.cap}>{caption}</span>
            <span className={caption === "Sent" ? styles.figure : styles.val} title={value}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.formGrid} onKeyDown={walkOnEnter}>
        <label className={styles.formLabel} htmlFor="till-remit-confirm-date">
          Bank date
        </label>
        <DateInput
          block
          id="till-remit-confirm-date"
          className={styles.input}
          min={remit.docDate.slice(0, 10) || undefined}
          max={request.businessDate.slice(0, 10) || undefined}
          value={form.bankDate}
          onChange={(value) => patch({ bankDate: value })}
        />

        <label className={styles.formLabel} htmlFor="till-remit-confirm-ref">
          Bank reference
        </label>
        <input
          id="till-remit-confirm-ref"
          className={styles.input}
          maxLength={50}
          autoComplete="off"
          autoFocus
          placeholder="the statement's reference (UTR …)"
          value={form.bankRef}
          onChange={(event) => patch({ bankRef: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-remit-confirm-credited">
          Credited by the bank
        </label>
        <input
          id="till-remit-confirm-credited"
          className={cx(styles.input, styles.number, local.amountInput)}
          inputMode="decimal"
          autoComplete="off"
          value={form.creditedText}
          onFocus={selectOnFocus}
          onChange={(event) => {
            const text = event.target.value.trim();
            if (isAmountDraft(text)) patch({ creditedText: text });
          }}
        />

        <label className={styles.formLabel} htmlFor="till-remit-confirm-note">
          Note
        </label>
        <input
          id="till-remit-confirm-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder="optional"
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />
      </div>

      <p className={cx(styles.muted, local.twoLines)}>{remitConfirmHint(paiseOf(remit.amount), creditedPaise(form))}</p>
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
