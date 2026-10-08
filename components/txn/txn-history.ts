/**
 * History on a transaction — the readings the dialog takes from grid 126
 * "POPUP - TXN HISTORY", as the Qt `TxnHistoryDialog::statusTrail()` takes
 * them. Pure: no React.
 *
 * Every transaction writes `public.txn_status_log` on each step — created,
 * posted, amended, retendered, cancelled … — with who, when, from → to, on
 * which device and why. Grid 126 reads those rows for ONE document, keyed by
 * its own id (a uuid is unique across doc types), its accounting year (the
 * partition) and its company: `idoc_id`, `iacc_year`, `icompany_id`.
 */
import { extractRows } from "@/app/master/_shared/crud-utils";

export type TxnHistoryRow = Record<string, string>;

/** The fields the dialog itself reads; every other column is shown as it arrives. */
export const TXN_HISTORY_FIELDS = {
  id: "tsl_id",
  seq: "tsl_seq_no",
  event: "tsl_event_text",
  status: "tsl_status_text",
  when: "tsl_changed_at",
  user: "tsl_user_name",
} as const;

/** What the grid's own column config shows, for when that config cannot be read. */
export const TXN_HISTORY_FALLBACK_COLUMNS = [
  { field: "tsl_seq_no", header: "#", align: "center" },
  { field: "tsl_event_text", header: "Event", align: "left" },
  { field: "tsl_status_text", header: "Status", align: "left" },
  { field: "tsl_changed_at", header: "When", align: "left" },
  { field: "tsl_user_name", header: "By", align: "left" },
  { field: "tsl_device_name", header: "Device", align: "left" },
  { field: "tsl_remarks", header: "Remarks", align: "left" },
] as const;

/**
 * The Event pill, by what HAPPENED — not by the lists' state buckets, where
 * POSTED is the dim "locked" slate: put in the books = green, a change to a
 * live document = amber, undone = red, moved on = blue, made = grey. The Qt
 * trail's own overrides, matched on the event text in any case.
 */
export type TxnEventTone = "green" | "amber" | "red" | "blue" | "grey";

const EVENT_TONES: Record<string, TxnEventTone> = {
  POSTED: "green",
  APPROVED: "green",
  ACCEPTED: "green",
  REOPENED: "green",
  AMENDED: "amber",
  RETENDERED: "amber",
  "TRANSPORT EDITED": "amber",
  "REMARKS EDITED": "amber",
  "STATUS CHANGED": "amber",
  UNPOSTED: "amber",
  EXPIRED: "amber",
  CANCELLED: "red",
  DELETED: "red",
  REJECTED: "red",
  CLOSED: "red",
  CONVERTED: "blue",
  SENT: "blue",
  SUBMITTED: "blue",
  PACKED: "blue",
  CREATED: "grey",
};

/**
 * An event the table above does not name, read by the words in it. Checked in
 * this order, so UNPOSTED (amber) is claimed before the POST inside it (green).
 */
const EVENT_WORDS: ReadonlyArray<readonly [TxnEventTone, readonly string[]]> = [
  ["red", ["CANCEL", "REJECT", "VOID", "FAIL", "BOUNCE", "RETURN", "REVERS", "DELET"]],
  ["amber", ["UNPOST", "PENDING", "EXPIR", "OVERDUE", "HOLD", "HELD", "AMEND", "EDIT", "REVISED", "CHANGED"]],
  ["blue", ["SENT", "SUBMIT", "CONVERT", "PACK", "DISPATCH", "SHIP", "PRINT"]],
  ["green", ["POST", "APPROV", "ACCEPT", "PAID", "SETTLE", "DELIVER", "COMPLET", "REOPEN"]],
];

export function txnEventTone(event: string): TxnEventTone {
  const key = event.trim().toUpperCase().replace(/[_\s]+/g, " ");
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

function seqOf(row: TxnHistoryRow): number {
  const parsed = Number.parseFloat(row[TXN_HISTORY_FIELDS.seq] ?? "");
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

/**
 * The grid's answer, oldest first. The runner wraps the SQL, so an inner
 * ORDER BY would be lost — the rows are sorted here on `tsl_seq_no`, as a
 * number (step 10 comes after step 9).
 */
export function toTxnHistoryRows(payload: unknown): TxnHistoryRow[] {
  return extractRows(payload)
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => {
      const out: TxnHistoryRow = {};
      for (const [key, value] of Object.entries(row)) {
        out[key] = text(value);
      }
      return out;
    })
    .sort((left, right) => seqOf(left) - seqOf(right));
}

/** One run of the summary line; `strong` runs are bold. */
export type TxnSummaryRun = { text: string; strong?: boolean };

/**
 * The line over the trail, which answers "who made it and where does it stand"
 * before anyone reads the grid:
 *
 *   **Created** by VKPOS on 06-10-2026 16:44:03 · now **POSTED** — Posted by
 *   VKPOS on 06-10-2026 16:44:03 · 2 steps
 *
 * One entry per ` · `-separated item. Empty when there are no rows, as Qt
 * hides the card then. "now …" is the LAST step's to-status — the part of
 * "DRAFT → POSTED" after the arrow — and is left out of a one-step trail,
 * where it would only repeat the first item.
 */
export function txnHistorySummary(rows: readonly TxnHistoryRow[]): TxnSummaryRun[][] {
  if (rows.length === 0) {
    return [];
  }
  const who = (row: TxnHistoryRow) => (row[TXN_HISTORY_FIELDS.user] ?? "").trim() || "unknown";
  const first = rows[0];
  const last = rows[rows.length - 1];
  const items: TxnSummaryRun[][] = [
    [
      { text: "Created", strong: true },
      { text: ` by ${who(first)} on ${first[TXN_HISTORY_FIELDS.when] ?? ""}` },
    ],
  ];
  if (rows.length > 1) {
    const status = (last[TXN_HISTORY_FIELDS.status] ?? "").split("→").pop()?.trim() || "—";
    items.push([
      { text: "now " },
      { text: status, strong: true },
      {
        text: ` — ${last[TXN_HISTORY_FIELDS.event] ?? ""} by ${who(last)} on ${last[TXN_HISTORY_FIELDS.when] ?? ""}`,
      },
    ]);
  }
  items.push([{ text: rows.length === 1 ? "1 step" : `${rows.length} steps` }]);
  return items;
}
