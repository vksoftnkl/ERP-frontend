/**
 * Ctrl+H on a temp credit — the readings the history dialog takes from grid
 * 132 "POPUP - TEMP CREDIT HISTORY", as the Qt `tempCredits()` trail
 * (`TxnHistoryTrail`) takes them. Pure: no React.
 *
 * A temp credit is not a logged document, so its story is assembled from
 * where it really lives: the credit itself (CREDIT), the bill's status trail
 * (BILL), the follow-ups in audit_log (FOLLOWUP) and the money that came in
 * against the bill (COUNTER at the till, SETTLE by a receipt or set-off).
 */
import { extractRows } from "@/app/master/_shared/crud-utils";
import type { ChipTone } from "@/features/accounts/receipt/components/chip";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { displayDate, type TempCreditRow } from "./row";

export type HistoryRow = {
  th_key: string;
  th_sort: string;
  th_when: string;
  th_event: string;
  th_detail: string;
  th_amount: number | null;
  th_user: string;
  th_ref: string;
  th_kind: string;
};

/**
 * The Event pill, by what HAPPENED — the Qt trail's own table: in the books =
 * green, a change to a live credit = amber, undone = red, the credit itself =
 * blue, the bill being made = grey. Matched on the event text, any case.
 */
const EVENT_TONES: Record<string, ChipTone> = {
  "BILL POSTED": "green",
  RECEIVED: "green",
  "CREDIT NOTE SET-OFF": "green",
  "ADVANCE SET-OFF": "green",
  "PAID WITH THE BILL": "green",
  "FOLLOW-UP": "amber",
  "BILL RETENDERED": "amber",
  "BILL AMENDED": "amber",
  REVERSED: "red",
  "WRITTEN OFF": "red",
  "BILL CANCELLED": "red",
  "CREDIT GIVEN": "blue",
  "BILL CREATED": "grey",
};

/** An event the table above does not name, read by the words in it. */
const EVENT_WORDS: ReadonlyArray<readonly [ChipTone, readonly string[]]> = [
  ["red", ["CANCEL", "REJECT", "VOID", "FAIL", "BOUNCE", "RETURN", "REVERS", "DELET"]],
  ["amber", ["PENDING", "EXPIRED", "OVERDUE", "HOLD", "HELD", "DUE", "REVISED", "AMEND", "UNPOST"]],
  ["green", ["ACCEPT", "APPROV", "CONVERT", "PAID", "SETTLE", "RECEIV", "POSTED", "REOPEN"]],
];

export function eventTone(event: string): ChipTone {
  const key = event.trim().toUpperCase();
  const named = EVENT_TONES[key];
  if (named) {
    return named;
  }
  for (const [tone, words] of EVENT_WORDS) {
    if (words.some((word) => key.includes(word))) {
      return tone;
    }
  }
  return "grey";
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * The grid's answer, oldest first. The runner wraps the SQL, so an inner
 * ORDER BY would be lost — the rows are sorted here on `th_sort`.
 */
export function toHistoryRows(payload: unknown): HistoryRow[] {
  return extractRows(payload)
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => {
      const amount = row.th_amount;
      const parsed =
        amount === null || amount === undefined || text(amount).trim() === ""
          ? Number.NaN
          : typeof amount === "number"
            ? amount
            : Number.parseFloat(text(amount));
      return {
        th_key: text(row.th_key),
        th_sort: text(row.th_sort),
        th_when: text(row.th_when),
        th_event: text(row.th_event),
        th_detail: text(row.th_detail),
        th_amount: Number.isFinite(parsed) ? parsed : null,
        th_user: text(row.th_user),
        th_ref: text(row.th_ref),
        th_kind: text(row.th_kind).trim().toUpperCase(),
      };
    })
    .sort((left, right) => left.th_sort.localeCompare(right.th_sort));
}

/**
 * What came in against the LOAN: the SETTLE rows only. A COUNTER row is the
 * bill's own cash at the till (the balance row is the whole bill), never part
 * of what was lent.
 */
export function settledOf(rows: readonly HistoryRow[]): number {
  return rows.reduce(
    (sum, row) => (row.th_kind === "SETTLE" && row.th_amount !== null ? sum + row.th_amount : sum),
    0,
  );
}

/** One piece of the summary line: the words, then the figure — bold if it matters. */
export type SummaryPart = { lead: string; value: string; strong?: boolean };

/**
 * The line over the trail — "ZT Borrower · 98655… · credit 210.00 · settled
 * 10.00 · balance 200.00 · now PARTIAL · due 08-10-2026 · 5 events": the credit
 * and the balance from the list row, what was settled summed from the trail.
 * Empty when there are no rows, as Qt hides the card then.
 */
export function historySummary(row: TempCreditRow, rows: readonly HistoryRow[]): SummaryPart[] {
  if (rows.length === 0) {
    return [];
  }
  const parts: SummaryPart[] = [
    { lead: "", value: row.atc_name || "—", strong: true },
    { lead: "", value: row.atc_mobile || "—" },
    { lead: "credit ", value: formatTotal(row.atc_credit_amount) },
    { lead: "settled ", value: formatTotal(settledOf(rows)) },
    { lead: "balance ", value: formatTotal(row.atc_balance_amount), strong: true },
    { lead: "now ", value: row.atc_status || "—", strong: true },
  ];
  const due = displayDate(row.atc_due_date);
  if (due) {
    parts.push({ lead: "due ", value: due });
  }
  parts.push({ lead: "", value: rows.length === 1 ? "1 event" : `${rows.length} events` });
  return parts;
}
