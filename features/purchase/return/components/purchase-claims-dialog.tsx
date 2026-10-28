"use client";

/**
 * Claims… — the open claim rows of posted returns (Qt `PurchaseClaimsDialog`,
 * NexERP 8ca6ff3; ui_table 60): the picked supplier's, else every supplier's.
 * Per row: Credit (the party's credit note, part or whole), Short-settle (the
 * rest written off), Reject (written off; GST on goods sent re-availed), Undo
 * last (a reversing row). Settling is judged on menu 25 POST, the undo on
 * CANCEL — the server's own checks.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { toast } from "@/lib/notify";
import { useUiTableId } from "@/lib/ui-tables";
import { money, purchaseRefusalText } from "../../shared/purchase.format";
import { usePurchaseClaimsOpenMutation, usePurchaseClaimsSettleMutation, usePurchaseClaimsSettleUndoMutation } from "../return.api";
import { resolveColumns } from "../return.columns";
import {
  CLAIM_COL,
  CLAIM_FALLBACK_TITLES,
  CLAIM_FALLBACK_WIDTHS,
  CLAIM_HINT,
  CLAIM_SHOWN_COLUMNS,
  CLAIMS_GRID_UI_TABLE_KEY,
} from "../return.constants";
import { claimRowsOf, creditAmount, settleRefusal, undoRefusal } from "../return.state";
import type { ClaimRow } from "../return.types";
import styles from "../page.module.scss";

type Ask =
  | { kind: "credit"; row: ClaimRow }
  | { kind: "SHORT_SETTLED" | "REJECTED"; row: ClaimRow }
  | { kind: "undo"; row: ClaimRow };

export type PurchaseClaimsDialogProps = {
  supplierId: string;
  supplierName: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  /** Menu 25 POST — settle. */
  canSettle: boolean;
  /** Menu 25 CANCEL — undo a settlement. */
  canUndo: boolean;
  onClose: () => void;
};

/** The credit: how much the party credited (the open amount by default) and their note no. */
function CreditDialog({ row, onCancel, onConfirm }: { row: ClaimRow; onCancel: () => void; onConfirm: (amount: number, cnNo: string) => void }) {
  const [amount, setAmount] = useState(row.open.toFixed(2));
  const [cnNo, setCnNo] = useState("");
  const value = creditAmount(amount, row.open);
  const submit = () => {
    if (value !== null) {
      onConfirm(value, cnNo.trim());
    }
  };
  return (
    <ModalShell
      title="Credit the claim"
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Back
          </button>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} disabled={value === null} onClick={submit}>
            Credit
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.prompt}>
          {row.refno} line {row.lineNo} · {row.itemName}
          {"\n"}Amount the party credited (open {money(row.open)}):
        </p>
        <input
          className={quotationStyles.input}
          value={amount}
          inputMode="decimal"
          autoFocus
          data-uppercase="off"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        {value === null ? <p className={styles.fieldProblem}>More than 0 and at most {money(row.open)}.</p> : null}
        <p className={styles.prompt}>Their credit note no (optional):</p>
        <input
          className={quotationStyles.input}
          value={cnNo}
          maxLength={60}
          onChange={(event) => setCnNo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>
    </ModalShell>
  );
}

export function PurchaseClaimsDialog({
  supplierId,
  supplierName,
  companyId,
  branchId,
  deviceId,
  canSettle,
  canUndo,
  onClose,
}: PurchaseClaimsDialogProps) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [hint, setHint] = useState(CLAIM_HINT);
  const [ask, setAsk] = useState<Ask | null>(null);

  const uiTableId = useUiTableId(CLAIMS_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(
    () => resolveColumns(layout, CLAIM_SHOWN_COLUMNS, CLAIM_FALLBACK_TITLES, CLAIM_FALLBACK_WIDTHS),
    [layout],
  );

  const [openMutation] = usePurchaseClaimsOpenMutation();
  const [settleMutation] = usePurchaseClaimsSettleMutation();
  const [undoMutation] = usePurchaseClaimsSettleUndoMutation();

  const generation = useRef(0);
  const reload = useCallback(async () => {
    generation.current += 1;
    const mine = generation.current;
    setBusy(true);
    try {
      const wire = await openMutation({ companyId, branchId, ...(supplierId ? { supplierId } : {}) }).unwrap();
      if (mine !== generation.current) {
        return;
      }
      const next = claimRowsOf(wire);
      setRows(next);
      setSelected((current) => (current && next.some((row) => row.returnItemId === current) ? current : (next[0]?.returnItemId ?? null)));
    } catch (error) {
      if (mine === generation.current) {
        setHint(purchaseRefusalText(error));
      }
    } finally {
      if (mine === generation.current) {
        setBusy(false);
      }
    }
  }, [branchId, companyId, openMutation, supplierId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = rows.find((row) => row.returnItemId === selected) ?? null;
  const totalOpen = rows.reduce((sum, row) => sum + row.open, 0);

  const startSettle = (kind: "credit" | "SHORT_SETTLED" | "REJECTED") => {
    const why = settleRefusal(current);
    if (why || !current) {
      toast.warn(why, { title: current ? "Nothing open" : "Pick a claim" });
      return;
    }
    setAsk({ kind, row: current });
  };

  const startUndo = () => {
    const why = undoRefusal(current);
    if (why || !current) {
      toast.warn(why, { title: current ? "Nothing to undo" : "Pick a claim" });
      return;
    }
    setAsk({ kind: "undo", row: current });
  };

  const settle = async (row: ClaimRow, action: "CREDIT" | "SHORT_SETTLED" | "REJECTED", extra: { amount?: number; cnNo?: string; reason?: string }) => {
    setBusy(true);
    try {
      const answer = await settleMutation({
        returnItemId: row.returnItemId,
        accYear: row.accYear,
        deviceId,
        action,
        ...(action === "CREDIT" ? { amount: extra.amount, receivedAs: "CN" as const, ...(extra.cnNo ? { cnNo: extra.cnNo } : {}) } : {}),
        ...(extra.reason ? { reason: extra.reason } : {}),
      }).unwrap();
      setHint(answer.message || CLAIM_HINT);
      await reload();
    } catch (error) {
      setBusy(false);
      setHint(purchaseRefusalText(error));
      toast.apiError(error, { title: "Not settled" });
    }
  };

  const undo = async (row: ClaimRow, reason: string) => {
    setBusy(true);
    try {
      const answer = await undoMutation({ settlementId: row.lastSettlementId, accYear: row.accYear, reason }).unwrap();
      setHint(answer.message || CLAIM_HINT);
      await reload();
    } catch (error) {
      setBusy(false);
      toast.apiError(error, { title: "Not undone" });
    }
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const index = rows.findIndex((row) => row.returnItemId === selected);
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      setSelected(next.returnItemId);
    }
  };

  const cell = (row: ClaimRow, no: number) => {
    switch (no) {
      case CLAIM_COL.Refno:
        return row.refno;
      case CLAIM_COL.Date:
        return row.date;
      case CLAIM_COL.Line:
        return row.lineNo;
      case CLAIM_COL.Item:
        return row.itemName;
      case CLAIM_COL.Claim:
        return row.claim;
      case CLAIM_COL.ClaimOn:
        return row.claimOn;
      case CLAIM_COL.Value:
        return money(row.value);
      case CLAIM_COL.Settled:
        return money(row.settled);
      case CLAIM_COL.Open:
        return money(row.open);
      default:
        return "";
    }
  };
  const right = (no: number) => no === CLAIM_COL.Value || no === CLAIM_COL.Settled || no === CLAIM_COL.Open || no === CLAIM_COL.Line;

  const working = busy || ask !== null;
  const title = supplierName ? `Open claims — ${supplierName}` : "Open purchase claims";

  return (
    <>
      <ModalShell
        title={title}
        isOpen
        wide
        fixedHeight
        onClose={onClose}
        footer={
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
              disabled={working || !canSettle || !current}
              title={canSettle ? "The party's credit note — part or whole" : "You do not have permission to settle a claim"}
              onClick={() => startSettle("credit")}
            >
              Credit…
            </button>
            <button
              type="button"
              className={quotationStyles.button}
              disabled={working || !canSettle || !current}
              title="Write the rest of the claim off"
              onClick={() => startSettle("SHORT_SETTLED")}
            >
              Short-settle…
            </button>
            <button
              type="button"
              className={quotationStyles.button}
              disabled={working || !canSettle || !current}
              title="Write the claim off — GST on goods sent is re-availed"
              onClick={() => startSettle("REJECTED")}
            >
              Reject…
            </button>
            <button
              type="button"
              className={quotationStyles.button}
              disabled={working || !canUndo || !current}
              title={canUndo ? "Undo the claim's last settlement" : "You do not have permission to undo a settlement"}
              onClick={startUndo}
            >
              Undo last…
            </button>
            <button type="button" className={quotationStyles.button} onClick={onClose}>
              Close · Esc
            </button>
          </div>
        }
      >
        <div className={styles.claimsBody}>
          <div
            className={cx(quotationStyles.gridViewport, styles.claimsViewport)}
            tabIndex={0}
            // The rows own the keyboard: ↑ / ↓ pick the claim the buttons act on.
            autoFocus
            aria-label="Open claims"
            onKeyDown={onGridKeyDown}
          >
            <table className={cx(quotationStyles.grid, styles.lineGrid)}>
              <colgroup>
                {columns.map((column) => (
                  <col key={column.no} style={{ width: `${column.widthPct}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.no} scope="col">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, columns.length)} className={styles.emptyCell}>
                      {busy ? "Loading…" : "No open claims."}
                    </td>
                  </tr>
                ) : null}
                {rows.map((row, index) => (
                  <tr
                    key={row.returnItemId}
                    className={cx(
                      index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                      row.returnItemId === selected && styles.selectedRow,
                    )}
                    aria-selected={row.returnItemId === selected}
                    onMouseDown={() => setSelected(row.returnItemId)}
                  >
                    {columns.map((column) => (
                      <td key={column.no}>
                        <div className={cx(quotationStyles.cellText, right(column.no) && quotationStyles.alignRight)}>
                          {cell(row, column.no) || " "}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.hintLine}>{hint}</p>
          <p className={styles.totalsLine}>
            {rows.length} claim row{rows.length === 1 ? "" : "s"} · <strong>Open {money(totalOpen)}</strong>
          </p>
        </div>
      </ModalShell>
      {ask?.kind === "credit" ? (
        <CreditDialog
          row={ask.row}
          onCancel={() => setAsk(null)}
          onConfirm={(amount, cnNo) => {
            const row = ask.row;
            setAsk(null);
            void settle(row, "CREDIT", { amount, cnNo });
          }}
        />
      ) : null}
      {ask?.kind === "SHORT_SETTLED" || ask?.kind === "REJECTED" ? (
        <ReasonDialog
          title={ask.kind === "REJECTED" ? "Reject the claim" : "Short-settle the claim"}
          message={`Why? ${money(ask.row.open)} is written off.`}
          placeholder="Type the reason"
          onCancel={() => setAsk(null)}
          onConfirm={(reason) => {
            const { row, kind } = ask;
            setAsk(null);
            void settle(row, kind, { reason });
          }}
        />
      ) : null}
      {ask?.kind === "undo" ? (
        <ReasonDialog
          title="Undo the last settlement"
          message="Why is it being undone?"
          placeholder="Type the reason"
          onCancel={() => setAsk(null)}
          onConfirm={(reason) => {
            const row = ask.row;
            setAsk(null);
            void undo(row, reason);
          }}
        />
      ) : null}
    </>
  );
}
