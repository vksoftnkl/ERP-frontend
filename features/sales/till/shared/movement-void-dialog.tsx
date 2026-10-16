"use client";

/**
 * Void movement — Qt `TillMovementVoidDialog` (ec9d92d): one hand-posted
 * movement (the Session Cockpit's Money documents tab) or a remittance (the
 * Cash Office) voided by a supervisor. What it decides is `movement-void.ts`;
 * a refusal is said in plain words with the server's sentence grey under it.
 *
 * Keys: Ctrl+Enter voids, Esc cancels.
 */
import { useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { useTillSessionClient } from "./api/till-session-api";
import { tillErrorOf } from "./errors";
import { formatFigure } from "./money";
import {
  EMPTY_MOVEMENT_VOID,
  movementVoidBody,
  movementVoidInfo,
  movementVoidProblem,
  voidNoteNeeded,
  voidReasons,
  type MovementVoidForm,
  type MovementVoidRequest,
} from "./movement-void";
import type { TillReason } from "./reasons";
import { TillDialog } from "./till-dialog";
import type { TillMovementFull } from "./wire/types";
import styles from "./till.module.scss";

export type MovementVoidDialogProps = {
  request: MovementVoidRequest | null;
  /** Grid 134 rows, every category: the dialog keeps the live MOVEMENT_VOID ones. */
  reasons: readonly TillReason[];
  onClose: () => void;
  onVoided: (result: TillMovementFull) => void;
};

export function MovementVoidDialog({ request, reasons, onClose, onVoided }: MovementVoidDialogProps) {
  return request ? <MovementVoidBody request={request} reasons={reasons} onClose={onClose} onVoided={onVoided} /> : null;
}

function MovementVoidBody({
  request,
  reasons,
  onClose,
  onVoided,
}: MovementVoidDialogProps & { request: MovementVoidRequest }) {
  const client = useTillSessionClient();
  const [form, setForm] = useState<MovementVoidForm>(EMPTY_MOVEMENT_VOID);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const inFlight = useRef(false);

  const options = voidReasons(reasons);
  const needsNote = voidNoteNeeded(reasons, form.reasonId);
  const problem = movementVoidProblem(form, needsNote);
  const canVoid = !problem && !busy;
  const patch = (next: Partial<MovementVoidForm>) => setForm((current) => ({ ...current, ...next }));

  const submit = async () => {
    if (!canVoid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      onVoided(await client.movementVoid(movementVoidBody(request, form)));
    } catch (thrown) {
      setRefusal(tillErrorOf(thrown, "The movement could not be voided.").refusal);
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
      title="Void movement"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void submit();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.dangerButton} disabled={!canVoid} title={problem} onClick={() => void submit()}>
            Void - Ctrl+Enter
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
            ["Document", request.docNo || "—"],
            ["Kind", request.kind.replace(/_/g, " ")],
            ["Amount", formatFigure(request.amount)],
          ] as const
        ).map(([caption, value]) => (
          <div key={caption} className={styles.fact}>
            <span className={styles.cap}>{caption}</span>
            <span className={styles.val} title={value}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor="till-void-reason">
          Reason
        </label>
        <select
          id="till-void-reason"
          className={styles.select}
          autoFocus
          value={form.reasonId}
          onChange={(event) => patch({ reasonId: event.target.value })}
        >
          <option value="">Pick a reason</option>
          {options.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {reason.name}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor="till-void-note">
          Note
        </label>
        <input
          id="till-void-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder={needsNote ? "required for this reason" : "optional"}
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />
      </div>

      <p className={styles.muted}>{movementVoidInfo(request.kind)}</p>
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
