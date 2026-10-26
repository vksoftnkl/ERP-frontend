/**
 * Translations between the screen and `/stock/physical/*` — what goes out on a
 * save, and how the answers are read back. Pure.
 */
import { batchDetailItemText } from "@/features/stocks/shared/batch-detail";
import { holdingKey } from "./physical-stock.state";
import {
  formatNetQty,
  g13,
  parseCounted,
  toNumberOrNull,
  toWireInstant,
} from "./physical-stock.format";
import type {
  CountLine,
  CountSheetRow,
  CountTotals,
  PhysicalStockDraft,
  PhysicalStockLineProblem,
  PhysicalStockWireLine,
  SavePhysicalStockHeader,
  SavePhysicalStockLine,
  SavePhysicalStockPayload,
} from "./physical-stock.types";

// ---------------------------------------------------------------------------
// Out
// ---------------------------------------------------------------------------

function toInt(value: number | null): number {
  return value === null || !Number.isFinite(value) ? 0 : Math.trunc(value);
}

/**
 * The lines of a save (buildLines). A count line is four required fields and
 * one typed number; everything else the engine reads off the LOT.
 *
 * AN UNCOUNTED LINE IS NOT SENT AT ALL. Absent `countedQty` is refused by the
 * route — "not counted yet" is not "0 found" — so a half-walked sheet saves the
 * lines that HAVE been walked, and the next save (a full replace) picks the
 * rest up as they are counted.
 *
 * A SAVED line sends its `sviId`, so the server updates that row — and can tell
 * the operator its book figure moved since (Qt 74b755c, notes 150 #4).
 */
export function buildLines(lines: readonly CountLine[]): SavePhysicalStockLine[] {
  const out: SavePhysicalStockLine[] = [];
  for (const line of lines) {
    if (!line.lotId) {
      continue; // not a holding
    }
    if (line.countedText.trim() === "") {
      continue;
    }
    const entry: SavePhysicalStockLine = {
      ...(line.sviId ? { sviId: line.sviId } : {}),
      lineNo: toInt(line.lineNo),
      splitNo: Math.max(1, toInt(line.splitNo)),
      itemId: line.itemId,
      godownId: line.godownId,
      lotId: line.lotId,
      bucket: line.bucket,
      countedQty: parseCounted(line.countedText),
    };
    if (line.reasonId) {
      entry.reasonId = line.reasonId;
    }
    const remarks = line.remarks.trim();
    if (remarks) {
      entry.remarks = remarks;
    }
    out.push(entry);
  }
  return out;
}

/**
 * The whole save (buildPayload). The header totals are the screen's — nothing
 * server-side sums the grid — and on a count they mean the NET VARIANCE:
 * `lineCount` is the walked lines actually on the document, `totalQty` the net
 * difference (signed), `totalValue` the screen's ESTIMATE of what it is worth.
 */
export function buildPayload(
  draft: PhysicalStockDraft,
  totals: CountTotals,
): SavePhysicalStockPayload {
  const header: SavePhysicalStockHeader = {
    ...(draft.svhId ? { svhId: draft.svhId } : {}),
    accYear: draft.accYear,
    companyId: draft.companyId,
    branchId: draft.branchId,
    deviceId: draft.deviceId,
    docDate: draft.docDate,
    toGodownId: draft.godownId,
    rateSource: draft.rateSource,
    freezeStock: draft.freezeStock,
    lineCount: totals.counted,
    totalQty: totals.netQty,
    totalValue: totals.netValue,
    totalValueWot: totals.netValue,
  };
  if (draft.reasonId) {
    header.reasonId = draft.reasonId;
  }
  // The freeze is a WALL-CLOCK window, and the DTO wants both ends with it.
  if (draft.freezeStock) {
    header.freezeFrom = toWireInstant(draft.freezeFrom);
    header.freezeTo = toWireInstant(draft.freezeTo);
  }
  const usrRefno = draft.usrRefno.trim();
  if (usrRefno) {
    header.usrRefno = usrRefno;
  }
  const remarks = draft.remarks.trim();
  if (remarks) {
    header.remarks = remarks;
  }
  return { header, lines: buildLines(draft.lines) };
}

/**
 * Post = the save payload with header.status "POSTED" — ONE /create call that
 * saves and posts in one transaction (notes 106). A refused line fails the save
 * as well, so a refusal leaves no document and no number behind; with svhId
 * set (a reopened draft) the same call replaces its lines and posts it.
 */
export function buildPostPayload(
  draft: PhysicalStockDraft,
  totals: CountTotals,
): SavePhysicalStockPayload {
  const payload = buildPayload(draft, totals);
  return { ...payload, header: { ...payload.header, status: "POSTED" } };
}

/**
 * The question Post asks BEFORE the call — once it is sent the sheet is posted
 * or it does not exist. Uncounted holdings are not sent, so they move nothing.
 */
export function postConfirmMessage(totals: CountTotals): string {
  const unwalked = totals.lines - totals.counted;
  return (
    "Posting writes the stock ledger for the lines that DISAGREE and freezes this sheet. " +
    "A line that matches writes nothing.\n\n" +
    `${totals.counted} / ${totals.lines} counted · ${totals.varianceLines} with a variance · ` +
    `net ${formatNetQty(totals.netQty)}` +
    (unwalked > 0
      ? `\n\n${unwalked} holdings on screen are not counted and are left off the document.`
      : "")
  );
}

// ---------------------------------------------------------------------------
// The book moved since the lines were drawn
// ---------------------------------------------------------------------------

/** How far apart two book figures must be to count as moved — Qt `qAbs(before - now) > 0.0005`. */
const BOOK_MOVED_EPSILON = 0.0005;

/**
 * The book figure on screen of every COUNTED line, by holding, taken just
 * before a save. The save re-reads every book quantity from stock_balance, so a
 * sheet drawn hours ago, with stock moving since, comes back counted against a
 * NEW book — the difference changes without anyone touching the line. On a
 * re-save the server says so per line (`bookChanged`); on a first save only
 * the screen knows what it drew (Qt `saveDraft()`).
 */
export function bookBeforeSave(lines: readonly CountLine[]): Map<string, number> {
  const before = new Map<string, number>();
  for (const line of lines) {
    if (line.lotId && line.countedText.trim() !== "") {
      // cellNumber(): a blank book cell reads as 0.
      before.set(holdingKey(line.lotId, line.bucket), line.bookQty ?? 0);
    }
  }
  return before;
}

/**
 * "Line 3  Shirt · XL — book 2 → 3" for every line whose book moved: the
 * server says so (`bookChanged`, with `previousBookQty`), or the figure the
 * screen showed differs from the one the save came back with.
 */
export function bookMovedLines(
  saved: readonly PhysicalStockWireLine[],
  before: ReadonlyMap<string, number>,
): string[] {
  const moved: string[] = [];
  for (const line of saved) {
    const key = holdingKey(line.lotId ?? "", line.bucket ?? "");
    const now = toNumberOrNull(line.bookQty) ?? 0;
    const serverSays = line.bookChanged === true;
    const was = serverSays ? (toNumberOrNull(line.previousBookQty) ?? 0) : (before.get(key) ?? now);
    if (serverSays || Math.abs(was - now) > BOOK_MOVED_EPSILON) {
      moved.push(
        `Line ${Math.trunc(Number(line.lineNo) || 0)}  ${batchDetailItemText(line)} — book ` +
          `${g13(was)} → ${g13(now)}`,
      );
    }
  }
  return moved;
}

/** What the Saved message carries after its own text — nothing when no book moved. */
export function bookMovedText(moved: readonly string[]): string {
  if (moved.length === 0) {
    return "";
  }
  return (
    "\n\nStock moved since these lines were drawn, so their book quantity — and the " +
    `difference — changed. Check the count is still right:\n${moved.join("\n")}`
  );
}

/** The draft save's message (Qt `saveDraft()`), with the moved lines after it. */
export function savedDraftMessage(
  refno: string,
  unwalked: number,
  onScreen: number,
  moved: readonly string[],
): string {
  const head =
    unwalked > 0
      ? `${refno} saved as a draft. No stock has moved.\n\n${unwalked} of ${onScreen} ` +
        "holdings on screen have not been counted yet, so they are NOT on the saved " +
        "document — count them and save again to add them. A blank is not the same as " +
        "counting zero."
      : `${refno} saved as a draft. No stock has moved.`;
  return head + bookMovedText(moved);
}

/** The posted-sheet cancel question (Qt 74b755c): a second count is usually the fix. */
export const CANCEL_POSTED_CONFIRM =
  "This writes one reversing ledger row for every variance row the count posted, so the " +
  "book goes back to the figure the shelf disagreed with. Nothing is deleted — the sheet " +
  "stays in the list as CANCELLED.\n\nIf the counter miscounted, a SECOND COUNT is usually " +
  "the right fix, not a cancel. A cancel is refused once the stock has been sold, or once " +
  "the holding has been counted again.";

/** A draft's cancel question — nothing had posted. */
export const CANCEL_DRAFT_CONFIRM =
  "This draft has posted no variance, so there is nothing to reverse. Nothing is deleted — " +
  "the sheet stays in the list as CANCELLED, with the reason against it.";

// ---------------------------------------------------------------------------
// In
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The count sheet's rows, whatever shape the envelope takes. It answers
 * `{ data: { items: [...], meta } }` — "items", not "rows": reading the wrong
 * key once made every picked item report "no holding in this godown" while the
 * godown was full of them. Parsed in ONE place.
 */
export function sheetRowsOf(payload: unknown): CountSheetRow[] {
  const root = asRecord(payload);
  const data = root ? root.data : payload;
  if (Array.isArray(data)) {
    return data as CountSheetRow[];
  }
  const object = asRecord(data);
  if (!object) {
    return [];
  }
  for (const key of ["items", "rows", "data"]) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value as CountSheetRow[];
    }
  }
  return [];
}

/** The validate answer's failing lines — every line comes back, clean ones with a null problem. */
export function failingLines(rows: readonly PhysicalStockLineProblem[]): PhysicalStockLineProblem[] {
  return rows.filter((row) => (row.problem ?? "").trim() !== "");
}

/** showLineProblems — "Line 3: MILK 500ML — the book quantity has changed …". */
export function lineProblemsMessage(rows: readonly PhysicalStockLineProblem[]): string {
  const problems = failingLines(rows).map(
    (row) => `Line ${Math.trunc(Number(row.lineNo) || 0)}: ${row.itemName ?? ""} — ${row.problem}`,
  );
  return `${problems.length} of the lines have to be fixed first:\n\n${problems.join("\n")}`;
}

/**
 * A refused post's per-line answer — the preflight rows, when the refusal
 * carries them in `data` — or nothing, and the caller shows the server's
 * message instead. RTK's error is `{ status, data: body }`.
 */
export function refusalLineProblems(error: unknown): PhysicalStockLineProblem[] {
  const body = asRecord(asRecord(error)?.data);
  const rows = body?.data;
  if (!Array.isArray(rows)) {
    return [];
  }
  return failingLines(
    rows.filter(
      (row): row is PhysicalStockLineProblem => typeof asRecord(row)?.problem === "string",
    ),
  );
}

/**
 * The posted answer's message. `rowsPosted` is one ledger row per VARYING
 * line, so 0 is a success (everything matched); not a number at all says only
 * that it posted.
 */
export function postedMessage(refno: string, rowsPosted: unknown): string {
  if (typeof rowsPosted !== "number" || !Number.isFinite(rowsPosted)) {
    return `${refno} posted.`;
  }
  const rows = Math.trunc(rowsPosted);
  return rows === 0
    ? `${refno} posted — every holding counted matched the book, so no ledger row was ` +
        "written. Nothing was wrong."
    : `${refno} posted — ${rows} variance rows written.`;
}

/**
 * An API failure, worded as the Qt client words it: the headline, then every
 * per-field reason the server listed beside it — "Validation failed" alone is
 * untraceable once it reaches an operator.
 */
export function apiErrorText(error: unknown, fallback = "An unexpected error occurred."): string {
  const outer = asRecord(error);
  const body = asRecord(outer?.data) ?? outer;
  const lines: string[] = [];
  const message = body?.message;
  const messageObject = asRecord(message);
  if (messageObject) {
    const inner = messageObject.message;
    if (Array.isArray(inner)) {
      for (const entry of inner) {
        if (typeof entry === "string" && entry.trim()) {
          lines.push(entry.trim());
        }
      }
    } else if (typeof inner === "string" && inner.trim()) {
      lines.push(inner.trim());
    }
  } else if (typeof message === "string" && message.trim()) {
    lines.push(message.trim());
  }
  const errors = body?.errors;
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (typeof entry === "string") {
        if (entry.trim()) {
          lines.push(entry.trim());
        }
        continue;
      }
      const detail = asRecord(entry);
      const field = typeof detail?.field === "string" ? detail.field.trim() : "";
      const detailText = typeof detail?.message === "string" ? detail.message.trim() : "";
      if (!detailText) {
        continue;
      }
      lines.push(field ? `• ${field} — ${detailText}` : detailText);
    }
  }
  if (lines.length === 0 && typeof outer?.message === "string" && outer.message.trim()) {
    lines.push(outer.message.trim());
  }
  return lines.length > 0 ? lines.join("\n") : fallback;
}
