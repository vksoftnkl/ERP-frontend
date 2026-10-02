/**
 * Translations between the screen and `/stock/physical/*` — what goes out on a
 * save, and how the answers are read back. Pure.
 */
import { parseCounted, toWireInstant } from "./physical-stock.format";
import type {
  CountLine,
  CountSheetRow,
  CountTotals,
  PhysicalStockDraft,
  PhysicalStockLineProblem,
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
