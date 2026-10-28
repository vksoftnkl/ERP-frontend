/**
 * The screen ↔ the `stock/opening` contract.
 *
 * Out: `buildLines()` / `buildPayload()` — `OpeningStockEntry::buildLines()` and
 * `buildPayload()`, field for field. In: `lineFromPayload()` / the header —
 * `applyLines()` / `applyHeader()`. And the one error shape the screen reads
 * rather than just shows: a refused Save & Post's per-line `errors[]`.
 *
 * Pure. Nothing here knows about React or the network.
 */
import { toNumber } from "@/features/sales/quotation/quotation.utils";
import {
  RATE_SOURCES,
  TRACK,
  VOUCHER_STATUSES,
  type RateSource,
  type VoucherStatus,
} from "./opening-stock.constants";
import {
  blankLine,
  computeTotals,
  dateFromWire,
  dateToWire,
  hasItem,
  lineNumbersOf,
  normalizeSignature,
  takesBatchDetail,
  tracks,
} from "./opening-stock.lines";
import type {
  ApiFieldError,
  OpeningStockAuditStamps,
  OpeningStockDraft,
  OpeningStockHeaderPayload,
  OpeningStockLine,
  OpeningStockLinePayload,
  SaveOpeningStockDto,
  SaveOpeningStockHeaderDto,
  SaveOpeningStockLineDto,
} from "./opening-stock.types";

/**
 * Held to six places on the way out: every quantity and rate column is
 * numeric(18,6), so this never changes a stored figure — it only keeps binary
 * noise (`0.30000000000000004`) off the wire.
 */
function wire(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1e6) / 1e6;
}

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

// ---------------------------------------------------------------------------
// Out
// ---------------------------------------------------------------------------

/**
 * The lines, exactly as the DTO wants them. Rows with no item are skipped (the
 * trailing blank row, and any the operator emptied). Lines and splits are
 * numbered by `lineNumbersOf()` — a split continues its line only under the
 * same item — the rule the totals and the `#` column read too.
 *
 * Identity columns are sent ONLY when the item is tracked that way: an untracked
 * batch number is discarded by the engine anyway, and a reprint showing a batch
 * the stock does not have is worse than one showing none.
 *
 * `autoBatchNo` — `stock.auto_batch_no`: a batch-tracked line with its batch
 * left blank or server-given also carries its size, colour and model.
 */
export function buildLines(
  lines: readonly OpeningStockLine[],
  options: { autoBatchNo?: boolean } = {},
): SaveOpeningStockLineDto[] {
  const autoBatchNo = options.autoBatchNo === true;
  const out: SaveOpeningStockLineDto[] = [];
  const numbers = lineNumbersOf(lines);

  for (const line of lines) {
    const number = numbers.get(line.key);
    if (!number || !hasItem(line)) {
      continue;
    }

    const dto: SaveOpeningStockLineDto = {
      lineNo: number.lineNo,
      splitNo: number.splitNo,
      itemId: line.itemId,
      uomId: line.uomId,
      baseUomId: line.baseUomId,
      toBaseFactor: wire(line.toBaseFactor),
      godownId: line.godownId,
      qty: wire(line.qty),
      baseQty: wire(line.baseQty),
      freeQty: wire(line.freeQty),
      freeBaseQty: wire(line.freeBaseQty),
      weightQty: wire(line.weightQty),
      costRate: wire(line.costRate),
      costRateWot: wire(line.costRateWot),
      landedRate: wire(line.landedRate),
      taxPerc: wire(line.taxPerc),
    };

    // Every picked line carries one (SALEABLE); a line without simply takes the
    // column default rather than failing `@IsIn`.
    const bucket = trimmed(line.bucket);
    if (bucket) {
      dto.bucket = bucket as SaveOpeningStockLineDto["bucket"];
    }

    const signature = line.trackSignature;
    if (tracks(signature, TRACK.Batch) && trimmed(line.batchNo)) {
      dto.batchNo = trimmed(line.batchNo);
    }
    // Keyed dd/mm/yyyy and held that way in the cell; the engine wants ISO.
    if (tracks(signature, TRACK.Expiry)) {
      const mfg = dateToWire(line.mfgDate);
      if (mfg) {
        dto.mfgDate = mfg;
      }
      const expiry = dateToWire(line.expiryDate);
      if (expiry) {
        dto.expiryDate = expiry;
      }
    }
    if (tracks(signature, TRACK.Serial) && trimmed(line.serialNo)) {
      dto.serialNo = trimmed(line.serialNo);
    }
    if (tracks(signature, TRACK.Mrp)) {
      dto.mrp = wire(line.mrp);
    }
    if (tracks(signature, TRACK.SalePrice)) {
      dto.salePrice = wire(line.salePrice);
    }
    if (tracks(signature, TRACK.Supplier) && trimmed(line.supplierId)) {
      dto.supplierId = trimmed(line.supplierId);
    }
    // Textile: kept by the server against the batch number it gives this line.
    // Only on a line whose batch is the server's to give — a typed one is
    // refused with them (STOCK_BATCH_DETAIL_NEEDS_AUTO_BATCH). A name not on
    // the list has no id yet, and goes nowhere.
    if (takesBatchDetail(autoBatchNo, signature) && !line.batchTyped) {
      const sizeId = trimmed(line.sizeId);
      if (sizeId) {
        dto.sizeId = sizeId;
      }
      const colourId = trimmed(line.colourId);
      if (colourId) {
        dto.colourId = colourId;
      }
      const model = trimmed(line.model);
      if (model) {
        dto.model = model;
      }
    }
    if (trimmed(line.barcode)) {
      dto.barcode = trimmed(line.barcode);
    }
    if (trimmed(line.remarks)) {
      dto.remarks = trimmed(line.remarks);
    }

    out.push(dto);
  }
  return out;
}

/**
 * Header + lines. `status: "POSTED"` is what Save & Post adds — one request that
 * saves, runs the pre-post check and posts in one transaction.
 *
 * The four totals are the SCREEN's: nothing server-side recomputes a draft's, so
 * what is sent here is what the list shows for it.
 */
export function buildPayload(
  draft: OpeningStockDraft,
  options: { post?: boolean; autoBatchNo?: boolean } = {},
): SaveOpeningStockDto {
  const totals = computeTotals(draft.lines);
  const header: SaveOpeningStockHeaderDto = {
    ...(draft.svhId ? { svhId: draft.svhId } : {}),
    accYear: draft.accYear,
    companyId: draft.companyId,
    branchId: draft.branchId,
    deviceId: draft.deviceId,
    docDate: draft.header.docDate,
    toGodownId: draft.header.godownId,
    rateSource: draft.header.rateSource,
    lineCount: totals.lines,
    totalQty: wire(totals.qty),
    totalValue: wire(totals.value),
    totalValueWot: wire(totals.valueWot),
  };
  const usrRefno = trimmed(draft.header.usrRefno);
  if (usrRefno) {
    header.usrRefno = usrRefno;
  }
  const remarks = trimmed(draft.header.remarks);
  if (remarks) {
    header.remarks = remarks;
  }
  if (options.post) {
    header.status = "POSTED";
  }
  return { header, lines: buildLines(draft.lines, { autoBatchNo: options.autoBatchNo }) };
}

/**
 * The SENT lines whose batch is left to the server — indexes into
 * `buildLines()`'s output, which skips a row with no item exactly as this does.
 * Worked out BEFORE the save, while a blank batch still means "give me one";
 * the reply then says what each was given (`givenBatchesText`). Qt
 * `autoBatchLineIndexes()`.
 */
export function autoBatchLineIndexes(lines: readonly OpeningStockLine[], autoBatchNo: boolean): number[] {
  const indexes: number[] = [];
  if (!autoBatchNo) {
    return indexes;
  }
  let sent = 0;
  for (const line of lines) {
    if (!hasItem(line)) {
      continue; // buildLines() skips it too
    }
    if (tracks(line.trackSignature, TRACK.Batch) && !trimmed(line.batchNo)) {
      indexes.push(sent);
    }
    sent += 1;
  }
  return indexes;
}

/**
 * A "Batch numbers given:" paragraph — one "Line 1  Shirt — CBE26-00001" per
 * line — appended to the Saved / Posted message so the numbers can be read out
 * before the screen moves on; empty when none was given. Read off the reply's lines by the same index: the
 * reply is ordered by line and split, the order the lines were sent in (Qt
 * `givenBatchesText()` reads the grid the reply was painted into, row = index).
 */
export function givenBatchesText(
  lineIndexes: readonly number[],
  replyLines: readonly OpeningStockLinePayload[] | null | undefined,
): string {
  const lines = replyLines ?? [];
  const given: string[] = [];
  for (const index of lineIndexes) {
    const line = lines[index];
    const batch = trimmed(line?.batchNo);
    if (line && batch) {
      given.push(`Line ${index + 1}  ${trimmed(line.itemName)} — ${batch}`);
    }
  }
  return given.length ? `\n\nBatch numbers given:\n${given.join("\n")}` : "";
}

// ---------------------------------------------------------------------------
// In
// ---------------------------------------------------------------------------

export function statusOf(value: string | null | undefined): VoucherStatus {
  const text = trimmed(value).toUpperCase();
  return (VOUCHER_STATUSES as readonly string[]).includes(text) ? (text as VoucherStatus) : "DRAFT";
}

export function rateSourceOf(value: string | null | undefined): RateSource {
  const text = trimmed(value).toUpperCase();
  // An unknown source falls back to the first entry — the Qt combo's index 0.
  return (RATE_SOURCES as readonly string[]).includes(text) ? (text as RateSource) : RATE_SOURCES[0];
}

/**
 * One stored line → one grid row, as `applyLines()` paints it. NOTHING is
 * recomputed: every figure is the one that was saved.
 */
export function lineFromPayload(line: OpeningStockLinePayload, key?: string): OpeningStockLine {
  const factor = toNumber(line.toBaseFactor ?? undefined);
  const costRate = toNumber(line.costRate ?? undefined);
  return {
    ...blankLine(key),
    sviId: line.sviId ?? "",
    lineNo: toNumber(line.lineNo ?? undefined),
    splitNo: toNumber(line.splitNo ?? undefined),
    itemId: line.itemId ?? "",
    itemCode: line.itemCode ?? "",
    itemName: line.itemName ?? "",
    uomId: line.uomId ?? "",
    unitName: line.unitName ?? "",
    baseUomId: line.baseUomId ?? "",
    toBaseFactor: factor,
    godownId: line.godownId ?? "",
    godownName: line.godownName ?? "",
    bucket: line.bucket ?? "",
    barcode: line.barcode ?? "",
    batchNo: line.batchNo ?? "",
    // Painted dd/mm/yyyy, the way they were keyed; the response carries ISO.
    mfgDate: dateFromWire(line.mfgDate),
    expiryDate: dateFromWire(line.expiryDate),
    mrp: toNumber(line.mrp ?? undefined),
    salePrice: toNumber(line.salePrice ?? undefined),
    serialNo: line.serialNo ?? "",
    supplierId: line.supplierId ?? "",
    supplierName: line.supplierName ?? "",
    qty: toNumber(line.qty ?? undefined),
    baseQty: toNumber(line.baseQty ?? undefined),
    freeQty: toNumber(line.freeQty ?? undefined),
    freeBaseQty: toNumber(line.freeBaseQty ?? undefined),
    weightQty: toNumber(line.weightQty ?? undefined),
    costRate,
    // The stored rate is per BASE unit; show what would have been typed. A
    // factor of 0 is a broken line — treated as 1 rather than wiping the cost.
    costPerUnit: costRate * (factor > 0 ? factor : 1),
    costRateWot: toNumber(line.costRateWot ?? undefined),
    landedRate: toNumber(line.landedRate ?? undefined),
    taxPerc: toNumber(line.taxPerc ?? undefined),
    value: toNumber(line.value ?? undefined),
    valueWot: toNumber(line.valueWot ?? undefined),
    remarks: line.remarks ?? "",
    // NULL while the document is a draft and filled at Post — not missing data.
    lotId: line.lotId ?? "",
    trackSignature: normalizeSignature(line.trackSignature),
    // Textile: the batch's size / colour / model, read from its batch detail
    // row. A loaded batch number counts as GIVEN, not typed — the server
    // decides on save whether it carries them.
    sizeId: line.sizeId ?? "",
    sizeName: line.sizeName ?? "",
    colourId: line.colourId ?? "",
    colourName: line.colourName ?? "",
    model: line.model ?? "",
    batchTyped: false,
  };
}

/** The header fields the screen keeps, as `applyHeader()` reads them. */
export function headerFromPayload(header: OpeningStockHeaderPayload): OpeningStockDraft["header"] {
  return {
    docDate: (header.docDate ?? "").slice(0, 10),
    godownId: header.godownId ?? "",
    godownName: header.godownName ?? "",
    rateSource: rateSourceOf(header.rateSource),
    usrRefno: header.usrRefno ?? "",
    remarks: header.remarks ?? "",
  };
}

/** A UUID — what `svh_created_by` holds when a USER saved the document. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who created / posted / cancelled the document, and when — read off the GET's
 * header for the lines under the title (`showAudit()`).
 *
 * The creator is the display name when the server has one. Without it, the
 * stored `createdBy` is shown only when it is not a bare user id (a till or an
 * import job's name says something; a uuid does not).
 */
export function stampsFromHeader(header: OpeningStockHeaderPayload): OpeningStockAuditStamps {
  const createdBy = trimmed(header.createdBy);
  return {
    createdOn: trimmed(header.createdOn),
    createdBy: trimmed(header.createdByName) || (UUID.test(createdBy) ? "" : createdBy),
    postedOn: trimmed(header.postedOn),
    postedBy: trimmed(header.postedByName),
    cancelledOn: trimmed(header.cancelledOn),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** One line the pre-post check refused, located the way the server named it. */
export type LineProblem = {
  lineNo: number;
  splitNo: number;
  message: string;
};

/**
 * A refused Save & Post (422) names each bad line as `field: "lines.<lineNo>"`
 * with the message `Line <n>[ split <s>] (<item>): <problem>` — the line number
 * being the one THIS screen sent, so it locates the row exactly.
 */
export function lineProblemsOf(errors: readonly ApiFieldError[]): LineProblem[] {
  const problems: LineProblem[] = [];
  for (const error of errors) {
    const message = trimmed(error.message);
    if (!message) {
      continue;
    }
    const field = /^lines\.(\d+)/.exec(trimmed(error.field));
    const fromMessage = /^Line\s+(\d+)(?:\s+split\s+(\d+))?/i.exec(message);
    const lineNo = Number.parseInt(field?.[1] ?? fromMessage?.[1] ?? "", 10);
    if (!Number.isFinite(lineNo)) {
      continue;
    }
    const splitNo = Number.parseInt(fromMessage?.[2] ?? "1", 10) || 1;
    problems.push({ lineNo, splitNo, message });
  }
  return problems;
}

/** The `errors[]` of a failed request's body, whatever else it carries. */
export function fieldErrorsOf(data: unknown): ApiFieldError[] {
  if (!data || typeof data !== "object") {
    return [];
  }
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .map((entry): ApiFieldError => {
      if (typeof entry === "string") {
        return { message: entry };
      }
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        return {
          field: typeof record.field === "string" ? record.field : undefined,
          message: typeof record.message === "string" ? record.message : undefined,
        };
      }
      return {};
    })
    .filter((entry) => Boolean(entry.message));
}

/**
 * What an operator is told about a failed request — the server's sentence, and
 * every field error under it, the way `ApiClient::handleError` shows them. A 404
 * from the item lookup is an ANSWER ("a service item", "no unit conversion") and
 * has to reach the operator in the server's words.
 */
export function describeError(
  error: unknown,
  fallback = "The request failed.",
): string {
  const record = (error && typeof error === "object" ? error : {}) as {
    message?: unknown;
    data?: unknown;
    status?: unknown;
  };
  const body = (record.data && typeof record.data === "object" ? record.data : {}) as {
    message?: unknown;
  };
  const headline =
    (typeof body.message === "string" && body.message.trim()) ||
    (typeof record.message === "string" && record.message.trim()) ||
    fallback;
  const details = fieldErrorsOf(record.data)
    .map((entry) => entry.message ?? "")
    .filter((message) => message && message !== headline);
  return details.length ? `${headline}\n\n${details.join("\n")}` : headline;
}

/** The HTTP status of a failed RTK request, when it had one. */
export function statusOfError(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}
