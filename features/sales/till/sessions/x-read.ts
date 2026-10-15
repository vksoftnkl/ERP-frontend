/**
 * X read — Qt `TillXReadDialog` (c77f3f1, notes 117 §6) without the widgets:
 * the answer of POST /till/sessions/x-report, read only — the session's
 * expected figures per tender at this moment, with the server's X number and
 * time. The read is journalled (X_REPORT) by the call itself, before this
 * shows. Print renders purpose TILL_SESSION_X (TillSessionX80, an 80 mm roll).
 */
import { clockOf } from "../shared/format";
import { CASH_TENDER_TYPE_ID } from "../shared/denom";
import { formatMoney, toPaise } from "../shared/money";
import type { TillSessionTender, TillXReport } from "../shared/wire/types";

/** open + sales − refunds + receipts − payments − expenses + in − out = expected (the server's own figures). */
export const X_FIGURES = [
  ["openAmount", "Open"],
  ["salesAmount", "Sales"],
  ["refundAmount", "Refunds"],
  ["receiptAmount", "Receipts"],
  ["paymentAmount", "Payments"],
  ["expenseAmount", "Expenses"],
  ["movedIn", "In"],
  ["movedOut", "Out"],
  ["expected", "Expected"],
] as const satisfies readonly (readonly [keyof TillSessionTender, string])[];

export const X_NOTE = "Journalled as X_REPORT. Print gives the 80 mm X read.";

export const X_CASH_CAPTION = "Cash in the drawer now";

/** A figure the payload may hide (null) shows as a dash. */
function figure(value: unknown): string {
  const paise = toPaise(value);
  return paise === null ? "—" : formatMoney(paise);
}

export type XReadRow = { key: string; tender: string; mode: string; cells: string[] };

export type XReadView = {
  title: string;
  sub: string;
  rows: XReadRow[];
  /** Σ expected of the cash tenders, "—" when none is known. */
  cash: string;
};

export function xReadView(x: TillXReport): XReadView {
  let cash = 0;
  let cashKnown = false;
  const rows = (x.tenders ?? []).map((t, index) => {
    if (t.tenderTypeId === CASH_TENDER_TYPE_ID) {
      const expected = toPaise(t.expected);
      if (expected !== null) {
        cash += expected;
        cashKnown = true;
      }
    }
    return {
      key: `${t.tenderTypeId}|${t.tenderId ?? ""}|${index}`,
      tender: t.tenderName || t.tenderTypeName || "",
      mode: t.closeMode ?? "",
      cells: X_FIGURES.map(([field]) => figure(t[field])),
    };
  });
  return {
    title: `X ${Number(x.xNo) || 0} · ${x.tssSessionNo ?? ""} · ${clockOf(x.xReadOn)}`,
    sub:
      `${x.operatorName ?? ""} · ${x.counterName ?? ""} (${x.counterCode ?? ""}) · opened ${clockOf(x.tssOpenedOn)} · ` +
      `status ${(x.tssStatus ?? "").replace(/_/g, " ")}`,
    rows,
    cash: cashKnown ? formatMoney(cash) : "—",
  };
}
