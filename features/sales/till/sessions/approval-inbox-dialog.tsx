"use client";

/**
 * Waiting for approval — Qt `TillApprovalInboxDialog` (425fa80, notes 124
 * §5 / S7), opened from Till Sessions (273): GET /till/approvals/pending for
 * the header company · branch, one list for every kind the server waits on —
 *
 *   REQUEST           asked at a counter → Approve / Reject here
 *                     (`approval-decide-dialog.tsx`), or Cancel by whoever asked
 *   SESSION_VARIANCE  a session's cash gap → the Session Cockpit's Approve
 *   RECEIVE_VARIANCE  a received bag's gap → the Session Cockpit's Approve
 *   SAFE_VARIANCE     a safe count's gap   → Cash Office (287)
 *
 * Each row says whether YOU can decide it (canDecide / cannotBecause, from
 * your own grants); a variance's amount is hidden without 273 OVERRIDE. The
 * row texts are `../shared/approval-gate.ts`, the screen's own part
 * `approval-inbox.ts`. The Cockpit is a route here, so opening a cash gap
 * leaves the inbox (Qt opens it over the inbox and refreshes on its close).
 *
 * Keys: ↑ / ↓ / Home / End pick a row, Enter (or a double-click) opens it,
 * F5 refreshes, Esc closes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { getAuthUserId } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import {
  HIDDEN_AMOUNT_TIP,
  INBOX_HINT,
  approvalCancelBody,
  canCancelOwnRequest,
  decidedText,
  inboxHeadText,
  inboxRowKey,
  inboxRowText,
} from "../shared/approval-gate";
import { TillDialog } from "../shared/till-dialog";
import type { TillApprovalInboxItem, TillApprovalInboxPayload, TillSessionKey } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { ApprovalDecideDialog } from "./approval-decide-dialog";
import {
  CANCEL_REQUEST_PROMPT,
  CANCEL_REQUEST_TITLE,
  DECIDED_TITLE,
  INBOX_LOADING,
  INBOX_READ_FAILED,
  INBOX_TITLE,
  inboxOpenOf,
  inboxPickedIndex,
  type InboxScope,
} from "./approval-inbox";
import { pickedIndexAfter } from "./cockpit";
import local from "./sessions.module.scss";

export type ApprovalInboxDialogProps = {
  open: boolean;
  /** The header company · branch (Qt: the login's). */
  scope: InboxScope;
  onClose: () => void;
  /** A cash gap's row: its session's Cockpit (a route — the screen navigates). */
  onOpenCockpit: (key: TillSessionKey) => void;
};

export function ApprovalInboxDialog({ open, ...props }: ApprovalInboxDialogProps) {
  return open ? <InboxBody {...props} /> : null;
}

type Read = { status: "loading" | "ready" | "error"; payload: TillApprovalInboxPayload | null };

const NO_ITEMS: readonly TillApprovalInboxItem[] = [];

/** Enter there is the control's own (a button presses, a field submits). */
function ownsEnter(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("button, input, select, textarea, a, [contenteditable]") !== null;
}

function InboxBody({ scope, onClose, onOpenCockpit }: Omit<ApprovalInboxDialogProps, "open">) {
  const client = useTillSessionClient();
  const { companyId, branchId } = scope;
  const me = (getAuthUserId() ?? "").toLowerCase();
  const [read, setRead] = useState<Read>({ status: "loading", payload: null });
  /** The current row's key: kept across a refresh while the row is still listed. */
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<TillApprovalInboxItem | null>(null);
  const [cancelling, setCancelling] = useState<TillApprovalInboxItem | null>(null);
  /** A cancel is on the wire: a second press must not send it twice. */
  const cancelInFlight = useRef(false);
  const tableRef = useRef<HTMLTableElement | null>(null);

  /** Bumped by F5 / Refresh and after a decide or a cancel: the effect below reads again. */
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => {
    setRead((current) => ({ ...current, status: "loading" }));
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await client.approvalPending({ companyId, branchId });
        if (!cancelled) setRead({ status: "ready", payload });
      } catch (error) {
        if (cancelled) return;
        setRead((current) => ({ ...current, status: "error" }));
        toast.apiError(error, { fallback: "The approvals waiting could not be read." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId, client, companyId, tick]);

  const items = read.payload?.items ?? NO_ITEMS;
  const at = inboxPickedIndex(items, pickedKey);
  const current = at >= 0 ? items[at] : null;
  const head =
    read.status === "loading" ? INBOX_LOADING : read.status === "error" || !read.payload ? INBOX_READ_FAILED : inboxHeadText(read.payload);
  const canCancel = canCancelOwnRequest(current, me);

  /** The list takes the keyboard once it is in the page (the portal mounts a commit late). */
  const focusOnce = useRef(false);
  const attachTable = useCallback((element: HTMLTableElement | null) => {
    tableRef.current = element;
    if (element && !focusOnce.current) {
      focusOnce.current = true;
      element.focus();
    }
  }, []);

  /** A nested dialog closed: the keyboard goes back to the list. */
  const refocusList = () => tableRef.current?.focus();

  const openRow = (item: TillApprovalInboxItem | null) => {
    const target = inboxOpenOf(item, scope);
    if (!target) return;
    if (target.kind === "decide") setDeciding(target.item);
    else if (target.kind === "info") toast.info(target.text, { title: target.title });
    else onOpenCockpit(target.key);
  };

  const pick = (index: number) => {
    const item = items[index];
    if (!item) return;
    setPickedKey(inboxRowKey(item));
    tableRef.current?.querySelectorAll("tbody tr")[index]?.scrollIntoView({ block: "nearest" });
  };

  const cancelRequest = async (item: TillApprovalInboxItem, note: string) => {
    if (cancelInFlight.current) return;
    cancelInFlight.current = true;
    try {
      await client.approvalCancel(approvalCancelBody(item, scope, note));
    } catch (error) {
      toast.apiError(error, { fallback: "The request could not be cancelled." });
    } finally {
      cancelInFlight.current = false;
      refresh();
    }
  };

  return (
    <>
      <TillDialog
        open
        size="wide"
        title={INBOX_TITLE}
        subtitle={head}
        onClose={onClose}
        onKey={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (event.key === "F5") {
            event.preventDefault();
            refresh();
            return;
          }
          if (event.key === "Enter") {
            if (ownsEnter(event.target)) return;
            event.preventDefault();
            openRow(current);
            return;
          }
          if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea")) return;
          const next = pickedIndexAfter(event.key, at, items.length);
          if (next < 0) return;
          event.preventDefault();
          pick(next);
        }}
        footer={
          <>
            <button type="button" className={styles.secondaryButton} onClick={refresh}>
              Refresh - F5
            </button>
            <span className={styles.spacer} />
            {canCancel ? (
              <button type="button" className={styles.secondaryButton} onClick={() => setCancelling(current)}>
                Cancel my request
              </button>
            ) : null}
            <button type="button" className={styles.primaryButton} disabled={!current} onClick={() => openRow(current)}>
              Open - Enter
            </button>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Close - Esc
            </button>
          </>
        }
      >
        <div className={local.inboxScroll}>
          <table ref={attachTable} className={cx(styles.table, local.pickTable)} tabIndex={0} aria-label="Waiting for approval">
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Till / safe</th>
                <th scope="col">Document</th>
                <th scope="col" className={styles.right}>
                  Amount
                </th>
                <th scope="col">Asked by</th>
                <th scope="col">When</th>
                <th scope="col">Needs</th>
                <th scope="col">You</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const row = inboxRowText(item);
                return (
                  <tr
                    key={inboxRowKey(item)}
                    aria-selected={index === at}
                    onClick={() => setPickedKey(inboxRowKey(item))}
                    onDoubleClick={() => {
                      setPickedKey(inboxRowKey(item));
                      openRow(item);
                    }}
                  >
                    <td className={cx(local.inboxWrap, local.inboxWhat)}>{row.what}</td>
                    <td className={local.inboxWrap}>{row.till}</td>
                    <td>{row.document}</td>
                    <td
                      className={cx(styles.right, row.amountHidden && styles.toneMuted)}
                      title={row.amountHidden ? HIDDEN_AMOUNT_TIP : undefined}
                    >
                      {row.amount}
                    </td>
                    <td>{row.askedBy}</td>
                    <td>{row.when}</td>
                    <td className={local.inboxWrap}>{row.needs}</td>
                    <td className={cx(local.inboxWrap, row.canDecide ? styles.toneGreen : styles.toneMuted)}>{row.you}</td>
                  </tr>
                );
              })}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyCell}>
                    {read.status === "loading" ? INBOX_LOADING : read.status === "error" ? INBOX_READ_FAILED : "Nothing is waiting."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>{INBOX_HINT}</p>
      </TillDialog>

      <ApprovalDecideDialog
        item={deciding}
        scope={scope}
        onClose={() => {
          // Qt refreshes whatever the dialog answered: the request may have
          // been decided, cancelled or expired meanwhile.
          setDeciding(null);
          refocusList();
          refresh();
        }}
        onDecided={(decision) => {
          setDeciding(null);
          refocusList();
          toast.info(decidedText(decision), { title: DECIDED_TITLE });
          refresh();
        }}
      />
      {cancelling ? (
        <CancelPrompt
          onBack={() => {
            setCancelling(null);
            refocusList();
          }}
          onConfirm={(note) => {
            const item = cancelling;
            setCancelling(null);
            refocusList();
            void cancelRequest(item, note);
          }}
        />
      ) : null}
    </>
  );
}

/** Qt's `QInputDialog::getText` over "Cancel my request": an optional note, then the cancel. */
function CancelPrompt({ onBack, onConfirm }: { onBack: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <TillDialog
      open
      size="narrow"
      title={CANCEL_REQUEST_TITLE}
      onClose={onBack}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryButton} onClick={onBack}>
            Esc  Back
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => onConfirm(note)}>
            Cancel my request - Enter
          </button>
        </>
      }
    >
      <label className={styles.formLabel} htmlFor="till-approval-cancel-note">
        {CANCEL_REQUEST_PROMPT}
      </label>
      <input
        id="till-approval-cancel-note"
        className={styles.input}
        maxLength={400}
        autoComplete="off"
        autoFocus
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          event.preventDefault();
          onConfirm(note);
        }}
      />
    </TillDialog>
  );
}
