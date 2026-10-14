"use client";

/**
 * "Who can approve?" (F7) — Qt `TillWhoCanApproveDialog` (NexERP a449b8c).
 * Pick a branch, an event and an amount: the rule in force there (grid 151,
 * branch > company > shipped) and every approver's verdict against it (grid
 * 152, ended grants too), plus the gap check — the events at that branch
 * nobody could approve at the rule's own threshold. Reads only.
 *
 * As Qt: a new branch or event re-checks at once; a new amount waits for
 * Check (or Enter).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { NumberBox } from "@/features/sales/till-masters/components/form-bits";
import { isApprovalAbort, useTillApprovalClient } from "@/features/sales/till/approval-setup/api/till-approval-api";
import { DataTable, Pill, type Column } from "@/features/sales/till/approval-setup/components/form-bits";
import { normalizeAmount } from "@/features/sales/till/approval-setup/domain/amount";
import {
  allEvents,
  approvalErrorText,
  gapText,
  type GridRow,
  type WhoLine,
} from "@/features/sales/till/approval-setup/domain/approval-setup";
import {
  WHO_DEFAULT_AMOUNT,
  WHO_DEFAULT_EVENT,
  WHO_LOGIN_BRANCH,
  WHO_SUBTITLE,
  whoCheck,
} from "../domain/approval-authority";
import { PopupFrame, popupStyles } from "./popup-frame";
import styles from "../page.module.scss";

const EVENTS = allEvents(false);

const WHO_COLUMNS: readonly Column<WhoLine>[] = [
  { key: "name", label: "Approver", text: (row) => row.name },
  { key: "level", label: "Level", text: (row) => row.level },
  { key: "max", label: "Max", align: "right", text: (row) => row.max },
  { key: "pin", label: "Counter PIN", align: "center", text: (row) => (row.pin ? "✓" : "") },
  { key: "remote", label: "Remote", align: "center", text: (row) => (row.remote ? "✓" : "") },
  {
    key: "verdict",
    label: "Verdict",
    stretch: true,
    text: (row) => row.verdict,
    tone: (row) => (row.ok ? "success" : "danger"),
  },
];

type Asked = { branchId: string; event: string; amount: string };
type Rows = { rules: GridRow[]; grants: GridRow[] };

export function WhoCanApproveDialog({
  companyId,
  loginBranch,
  today,
  onClose,
}: {
  companyId: string;
  /** The header's branch: the check opens on it, and a cleared pick falls back to it. */
  loginBranch: string;
  today: string;
  onClose: () => void;
}) {
  const client = useTillApprovalClient();
  const branchDropdownId = useDropdownId("branchByCompany");
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);

  const [rows, setRows] = useState<Rows | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [branch, setBranch] = useState<DropdownSelection | null>(
    loginBranch ? { id: loginBranch, text: WHO_LOGIN_BRANCH } : null,
  );
  const [event, setEvent] = useState(WHO_DEFAULT_EVENT);
  const [amount, setAmount] = useState(WHO_DEFAULT_AMOUNT);
  const [asked, setAsked] = useState<Asked>({ branchId: loginBranch, event: WHO_DEFAULT_EVENT, amount: WHO_DEFAULT_AMOUNT });

  // Both grids, every token of each: 152 also takes 'iinactive' ('true' = ended too).
  useEffect(() => {
    if (!companyId) return;
    const controller = new AbortController();
    Promise.all([
      client.gridRows({ grid: "tillApprovalRules", params: { icompany_id: companyId } }, controller.signal),
      client.gridRows(
        { grid: "tillApprovalGrants", params: { icompany_id: companyId, iinactive: "true" } },
        controller.signal,
      ),
    ])
      .then(([rules, grants]) => setRows({ rules, grants }))
      .catch((error: unknown) => {
        if (controller.signal.aborted || isApprovalAbort(error)) return;
        setFailed(true);
        toast.error(approvalErrorText(error, "The rules and grants could not be read."));
      });
    return () => controller.abort();
  }, [attempt, client, companyId]);

  const result = useMemo(
    () => (rows ? whoCheck(rows.rules, rows.grants, { companyId, today, ...asked }) : null),
    [asked, companyId, rows, today],
  );

  /** Check (Qt `runCheck`): what is on the ask row now. */
  const check = useCallback(
    (next: { branch?: DropdownSelection | null; event?: string } = {}) => {
      const pickedBranch = next.branch === undefined ? branch : next.branch;
      setAsked({
        branchId: pickedBranch?.id || loginBranch,
        event: next.event ?? event,
        amount: normalizeAmount(amount) || "0.00",
      });
    },
    [amount, branch, event, loginBranch],
  );

  const emptyText = failed ? (
    <>
      The rules and grants could not be read.{" "}
      <button
        type="button"
        className={popupStyles.secondaryButton}
        onClick={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      >
        Try again
      </button>
    </>
  ) : rows ? (
    "No approver has a grant yet."
  ) : (
    "Loading…"
  );

  return (
    <PopupFrame
      icon="WA"
      title="Who can approve?"
      subtitle={WHO_SUBTITLE}
      width={900}
      onClose={onClose}
      footer={
        <>
          <span className={popupStyles.footerHint}>Enter check · Esc close</span>
          <button type="button" className={popupStyles.secondaryButton} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className={styles.whoBody}>
        <form
          className={styles.whoBar}
          noValidate
          onSubmit={(submitted) => {
            submitted.preventDefault();
            check();
          }}
        >
          <label className={styles.whoCap} htmlFor="till-who-branch">
            Branch
          </label>
          <NexDropdownSingle
            id="till-who-branch"
            dropdownId={branchDropdownId}
            params={branchParams}
            clearOnParamsChange={false}
            value={branch}
            onChange={(picked) => {
              setBranch(picked);
              check({ branch: picked });
            }}
            disabled={!companyId}
            advanceFocusOnSelect={false}
            placeholder="Pick a branch"
            aria-label="Branch"
            className={popupStyles.dropdown}
          />
          <label className={styles.whoCap} htmlFor="till-who-event">
            Event
          </label>
          <select
            id="till-who-event"
            className={popupStyles.selectInput}
            value={event}
            autoFocus
            onChange={(changed) => {
              setEvent(changed.target.value);
              check({ event: changed.target.value });
            }}
          >
            {EVENTS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <label className={styles.whoCap} htmlFor="till-who-amount">
            Amount
          </label>
          <NumberBox id="till-who-amount" value={amount} max={999999999.99} onChange={setAmount} />
          <button type="submit" className={popupStyles.primaryButton}>
            Check
          </button>
        </form>

        <p className={styles.ruleLine}>{result?.ruleLine ?? ""}</p>
        <DataTable
          label="Who can approve"
          columns={WHO_COLUMNS}
          rows={result?.lines ?? []}
          rowKey={(line) => line.userId}
          emptyText={emptyText}
          className={styles.whoTable}
        />
        {result && result.gaps.length > 0 ? (
          <div className={styles.gap}>
            <Pill tone="warning">GAP</Pill>
            <span>{gapText(result.gaps)}</span>
          </div>
        ) : null}
      </div>
    </PopupFrame>
  );
}
