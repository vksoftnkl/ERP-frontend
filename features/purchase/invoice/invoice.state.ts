/**
 * Purchase Entry (menu 24) — the draft and every rule over it, pure: the Qt
 * `PurchaseInvoiceEntry`'s grid bookkeeping, `buildPayload`, `paintCalc`,
 * `applyLoaded` and `resetScreen`, as one reducer.
 *
 * Money: a typed line is worked out at once on the client as an ESTIMATE (Qt
 * NexERP dd59c2c P11 — invoice-figures.ts `repriceLine` / `liveTotalsOf`); the
 * server's figures (`POST /purchase/invoices/validate`), painted back by
 * `calc`, follow and replace it. Charges, landing cost, ITC, the check and the
 * prices are the server's alone; a loaded document shows the stored ones.
 */
import { allocDtoOf, type PurchaseAllocEntry } from "../shared/purchase-dialogs.types";
import { isoFromTyped, num, qtyText, text } from "../shared/purchase.format";
import {
  COL,
  EDITABLE_COLUMNS,
  EXPRESSION_COLUMNS,
  FOCUS_STOPS,
  GRN_LINE_COLUMNS,
  MARKUP_COLUMNS,
  PRICE_LEVELS,
  SELL_COLUMNS,
  STATUS,
} from "./invoice.constants";
import {
  derivedPairs,
  lineHalfTyped,
  liveTotalsOf,
  NO_DERIVED,
  repriceLine,
  waitingHint,
} from "./invoice-figures";
import {
  evalMoneyExpression,
  foldAllocs,
  itcText,
  refnoTail,
  schemeFreeText,
  splitLabel,
  type Scheme,
  type SourceLine,
} from "./invoice-lines";
import {
  applyChargeCalc,
  chargeFromMaster,
  chargesPayload,
  dropOffBill,
  droppedOffBillHint,
  editCharge,
  foldStoredCharges,
  masterOnBill,
} from "./invoice-charges";
import type { PurchaseChargeMasterRow, SisterBillPull } from "./invoice-header.types";
import {
  EMPTY_FACTS,
  EMPTY_HEADER_EXT,
  EMPTY_ISSUES,
  factsOf,
  headerExtDto,
  headerExtFromHeader,
  totalsFromStoredHeader,
  checkChips,
  type CheckChip,
  type InvoiceHeaderExt,
  type InvoiceIssues,
  type InvoiceLineCheck,
} from "./invoice-fidelity";
import type {
  GstParts,
  InvoiceDraft,
  InvoiceLine,
  InvoiceScope,
  InvoiceTotals,
  LineCalc,
  LineSettings,
  PurchaseAllocDto,
  PurchaseAllocRow,
  PurchaseCalcAnswer,
  PurchaseInvoiceLineDto,
  PurchaseInvoicePayload,
  PurchaseItemLookup,
  SavePurchaseInvoiceDto,
} from "./invoice.types";

/** Until the settings answer: no price columns, no textile cells (Qt's defaults). */
export const DEFAULT_LINE_SETTINGS: LineSettings = { priceUpdate: false, autoBatchNo: false };

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

/** A rate as stored (`100.0000`) → as keyed (`100`); 4 places at most. */
export function rateText(value: unknown): string {
  const n = num(value, Number.NaN);
  if (!Number.isFinite(n)) {
    return "";
  }
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

/** A typed number cell → number; blank / junk → 0 (Qt `cellNumber`). */
export function cellNumber(raw: string): number {
  return num(raw.replace(/,/g, ""), 0);
}

/** ISO `yyyy-MM-dd…` → `dd/MM/yyyy`; "" when it is not a date. */
export function displayDate(iso: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function isoDay(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value));
  return match ? match[1] : "";
}

export function rowHasItem(line: InvoiceLine): boolean {
  return line.itemId !== "";
}

export function itemLines(draft: InvoiceDraft): InvoiceLine[] {
  return draft.lines.filter(rowHasItem);
}

/** A DRAFT open for keying — the only state anything on screen may change. */
export function isEditable(draft: InvoiceDraft): boolean {
  return draft.status === STATUS.draft && draft.viewMode === "entry";
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function blankLine(key: string): InvoiceLine {
  return {
    key,
    itemId: "",
    itemCode: "",
    itemName: "",
    uomId: "",
    unitName: "",
    factor: 1,
    signature: "",
    batch: "",
    expiry: "",
    billed: "",
    recd: "",
    dmg: "",
    free: "",
    rate: "",
    discPct: "",
    mrp: "",
    gstPct: "",
    lineId: "",
    split: null,
    calc: null,
    grnItemId: "",
    grnYear: "",
    poItemId: "",
    poYear: "",
    sisterSaleItemId: "",
    sisterSaleItemYear: "",
    srcRefno: "",
    sizeId: "",
    sizeName: "",
    colourId: "",
    colourName: "",
    model: "",
    sellA: "",
    sellB: "",
    sellC: "",
    sellD: "",
    markup: "",
    marginPct: "",
    schPct: "",
    extraDisc: "",
    costIncl: "",
    costTyped: false,
    freeTyped: false,
    freeAuto: "",
    priceKept: false,
    discAmt: "",
    schAmt: "",
    markupB: "",
    markupC: "",
    markupD: "",
    marginBPct: "",
    marginCPct: "",
    marginDPct: "",
    hsn: "",
    msp: "",
    mspOwned: false,
    est: null,
    derived: NO_DERIVED,
  };
}

/** R4: a line billing a GRN line. */
export function rowFromGrn(line: InvoiceLine): boolean {
  return line.grnItemId !== "";
}

/** DOC-04: a line receiving a PO line. */
export function rowFromPo(line: InvoiceLine): boolean {
  return line.poItemId !== "";
}

/** Qt `rowTextile`: auto batch no + a batch-tracked item, not a GRN line. */
export function rowTextile(line: InvoiceLine, rules: LineSettings): boolean {
  return rules.autoBatchNo && line.signature.includes("B") && !rowFromGrn(line);
}

/** The Size / Colour pick-lists open: a textile line, not split, Batch blank. */
export function textileOpen(line: InvoiceLine, rules: LineSettings): boolean {
  return rowHasItem(line) && rowTextile(line, rules) && !line.split && line.batch.trim() === "";
}

/**
 * A draft remembered (screen memory) before these line fields existed: every
 * missing one takes its blank value; an old `keptAllocs` becomes the split.
 */
export function withLineDefaults(draft: InvoiceDraft): InvoiceDraft {
  const lines = draft.lines.map((line) => {
    const loose = line as Partial<InvoiceLine> & { key: string; keptAllocs?: PurchaseAllocDto[] | null };
    if (loose.split !== undefined && loose.grnItemId !== undefined && loose.freeAuto !== undefined && loose.derived !== undefined) {
      return line;
    }
    const legacy = loose.keptAllocs;
    const split: PurchaseAllocEntry[] | null = legacy
      ? legacy.map((dto) => ({ ...dto, bucket: dto.bucket === "DAMAGED" ? "DAMAGED" : "SALEABLE", qty: dto.qty }))
      : null;
    // a remembered calc from before dd59c2c has no charge split / GST parts
    const calc = loose.calc ? { ...EMPTY_CALC_EXTRAS, ...loose.calc } : null;
    return { ...blankLine(loose.key), ...line, calc, split: loose.split ?? split };
  });
  return {
    ...draft,
    lines,
    lineSettings: draft.lineSettings ?? DEFAULT_LINE_SETTINGS,
    awaitingServer: draft.awaitingServer ?? false,
    liveTotals: draft.liveTotals ?? null,
    gstBreakup: draft.gstBreakup ?? null,
    supplierTaxMode: draft.supplierTaxMode ?? "",
  };
}

const NO_GST_PARTS: GstParts = { cgst: 0, sgst: 0, igst: 0, cess: 0 };
const EMPTY_CALC_EXTRAS: Pick<LineCalc, "chrgBeforeTax" | "chrgAfterTax" | "gstParts"> = {
  chrgBeforeTax: 0,
  chrgAfterTax: 0,
  gstParts: NO_GST_PARTS,
};

/** Qt `resetScreen`: today's date on both dates, one blank line, DRAFT. */
export function createDraft(scope: InvoiceScope, today: string, lineSettings: LineSettings = DEFAULT_LINE_SETTINGS): InvoiceDraft {
  return {
    piId: "",
    refno: "",
    status: STATUS.draft,
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear,
    deviceId: scope.deviceId,
    supplierId: "",
    supplierName: "",
    supplierInvNo: "",
    supplierInvDate: today,
    docDate: today,
    godownId: "",
    godownName: "",
    invoiceAmount: "",
    remarks: "",
    lines: [blankLine("l1")],
    totals: null,
    hint: "",
    viewMode: "entry",
    dirty: false,
    nextKey: 2,
    lineSettings,
    // PI-HEADER
    charges: [],
    nextChargeKey: 1,
    chargesSeeded: false,
    tcsAmount: "",
    ewbNo: "",
    ewbDate: "",
    paymentHold: false,
    holdReason: "",
    ext: EMPTY_HEADER_EXT,
    facts: EMPTY_FACTS,
    issues: EMPTY_ISSUES,
    serverTotals: null,
    awaitingServer: false,
    liveTotals: null,
    gstBreakup: null,
    supplierTaxMode: "",
  };
}

/** Qt `ensureTrailingBlankRow`: an editable grid always ends on a blank line. */
export function ensureTrailingBlank(draft: InvoiceDraft): InvoiceDraft {
  const last = draft.lines[draft.lines.length - 1];
  if (last && !rowHasItem(last)) {
    return draft;
  }
  return {
    ...draft,
    lines: [...draft.lines, blankLine(`l${draft.nextKey}`)],
    nextKey: draft.nextKey + 1,
  };
}

// ---------------------------------------------------------------------------
// Which cells open, and where Enter stops
// ---------------------------------------------------------------------------

/**
 * Why a cell will not open on an editable document ("" = it opens). The Qt
 * edit predicate: Barcode only on a blank line, everything else only on a
 * line with an item; the figures are the server's.
 */
export function whyNotEditable(line: InvoiceLine, column: number, rules: LineSettings = DEFAULT_LINE_SETTINGS): string {
  const textileCell = column === COL.Size || column === COL.Colour;
  if (!EDITABLE_COLUMNS.has(column) && !textileCell) {
    return column === COL.Unit
      ? "The item's purchase unit — F4 steps to its next unit."
      : column === COL.Short || column === COL.Check
        ? "What did not come — the server works it out from billed, received and damaged."
        : column === COL.Grn
          ? "The PO or GRN this line came from."
          : column === COL.Itc
            ? "The input tax credit, as the server classed it."
            : column === COL.Hsn
              ? "The item's HSN, from the item master."
              : column === COL.ChrgBeforeTax || column === COL.ChrgAfterTax
                ? "The line's share of the bill's charges — the server spreads them."
                : "Worked out by the server from the line.";
  }
  if (!rowHasItem(line)) {
    return column === COL.Barcode || column === COL.Item ? "" : "Scan or pick the item first.";
  }
  if (column === COL.Barcode) {
    return "The barcode only finds the item — pick another item on Item.";
  }
  // Qt dd59c2c: prices (and the MSP that goes with them) are keyed only where the bill writes them (the price policy)
  if ((column === COL.Msp || SELL_COLUMNS.has(column) || MARKUP_COLUMNS.has(column)) && !rules.priceUpdate) {
    return "Selling prices and the MSP are keyed only while the bill writes them (purchase settings).";
  }
  if (rowFromGrn(line)) {
    // R4: what came in is the GRN's — only the supplier's figures are keyed.
    return GRN_LINE_COLUMNS.has(column)
      ? ""
      : column === COL.Item
        ? "This line bills a GRN line — remove it to bill another item."
        : "Came in on a GRN — its qty, unit and batches are the GRN's. Billed, Rate and the discounts are keyed.";
  }
  if (line.split && (column === COL.Batch || column === COL.Expiry || column === COL.Model || textileCell)) {
    return `${splitLabel(line.split).replace(" (F12)", "")} on this line — F12 changes them.`;
  }
  if (column === COL.Model || textileCell) {
    if (!rowTextile(line, rules)) {
      return "Size, colour and model are for a batch-tracked item while the company numbers its own batches.";
    }
    if (line.batch.trim() !== "") {
      return "A typed batch carries no size / colour / model — empty Batch to have one given on Post.";
    }
  }
  return "";
}

/**
 * Qt dd59c2c P15 `lineStop` — Enter on a line stops at the typing cells only:
 * Item (a blank line's) → [Batch → Expiry on an item tracked by them] → Billed
 * → Free → Rate → Disc % → Sch % → Extra disc → the next line. A cell the line
 * cannot take (a GRN line's Free, a split line's Batch) is stepped over.
 */
export function lineStopOf(line: InvoiceLine, column: number, rules: LineSettings = DEFAULT_LINE_SETTINGS): boolean {
  if (column === COL.Item) {
    return !rowHasItem(line); // a keyed line's item is not re-picked by Enter
  }
  if (!rowHasItem(line)) {
    return false;
  }
  if (column === COL.Batch) {
    return line.signature.includes("B") && !rowTextile(line, rules) && !line.split && !rowFromGrn(line);
  }
  if (column === COL.Expiry) {
    return line.signature.includes("E") && !line.split && !rowFromGrn(line);
  }
  if (rowFromGrn(line)) {
    // a GRN line: only the supplier's figures are keyed (R4)
    return (
      column === COL.Billed || column === COL.Rate || column === COL.DiscPct || column === COL.SchPct || column === COL.ExtraDisc
    );
  }
  return true;
}

export function isEnterStop(line: InvoiceLine, column: number, rules: LineSettings = DEFAULT_LINE_SETTINGS): boolean {
  return FOCUS_STOPS.has(column) && whyNotEditable(line, column, rules) === "" && lineStopOf(line, column, rules);
}

// ---------------------------------------------------------------------------
// The payload (Qt `buildPayload`)
// ---------------------------------------------------------------------------

function positive(raw: string): number | undefined {
  const value = cellNumber(raw);
  return value > 0 ? value : undefined;
}

/**
 * Batch / expiry typed on the row = one SALEABLE row for what came in good
 * (+ free), and one DAMAGED row for the damaged qty. A line split into several
 * batches when it was loaded sends its stored rows back.
 */
export function allocsOf(line: InvoiceLine, billGodownId = ""): PurchaseAllocDto[] | undefined {
  if (rowFromGrn(line)) {
    return undefined; // the GRN's lots — the server takes them from the GRN line
  }
  if (line.split) {
    // The bill's godown unless the row named one (Qt buildPayload).
    return line.split.map((entry) => {
      const dto: PurchaseAllocDto = allocDtoOf(entry);
      if (!dto.godownId && billGodownId) {
        dto.godownId = billGodownId;
      }
      return dto;
    });
  }
  const batch = line.batch.trim();
  const expiry = isoFromTyped(line.expiry);
  const sizeId = line.sizeId.trim();
  const colourId = line.colourId.trim();
  const model = line.model.trim();
  if (!batch && !expiry && !sizeId && !colourId && !model) {
    return undefined;
  }
  const billed = cellNumber(line.billed);
  const dmg = cellNumber(line.dmg);
  const free = cellNumber(line.free);
  const recd = line.recd.trim() ? cellNumber(line.recd) : Math.max(0, billed - dmg);
  const mrp = positive(line.mrp);
  const row = (bucket: "SALEABLE" | "DAMAGED", qty: number, freeQty: number): PurchaseAllocDto => ({
    bucket,
    ...(batch ? { batchNo: batch } : {}),
    ...(expiry ? { expiryDate: expiry } : {}),
    ...(mrp !== undefined ? { mrp } : {}),
    ...(sizeId ? { sizeId } : {}),
    ...(colourId ? { colourId } : {}),
    ...(model ? { model } : {}),
    qty,
    ...(freeQty > 0 ? { freeQty } : {}),
  });
  const allocs: PurchaseAllocDto[] = [];
  if (recd + free > 0) {
    allocs.push(row("SALEABLE", recd, free));
  }
  if (dmg > 0) {
    allocs.push(row("DAMAGED", dmg, 0));
  }
  return allocs;
}

/** What `lineDto` reads off the bill (its godown, the session's line rules). */
export type LineDtoContext = { godownId: string; lineSettings: LineSettings; accYear: string };

export function lineDto(line: InvoiceLine, lineNo: number, bill?: LineDtoContext): PurchaseInvoiceLineDto {
  const dto: PurchaseInvoiceLineDto = {
    lineNo,
    itemId: line.itemId,
    uomId: line.uomId,
    billedQty: cellNumber(line.billed),
    rate: cellNumber(line.rate),
  };
  const accYear = bill?.accYear ?? "";
  if (bill?.lineSettings.priceUpdate) {
    // Written on Post (D16 keeps a newer change).
    const sells = { sellA: line.sellA, sellB: line.sellB, sellC: line.sellC, sellD: line.sellD } as const;
    for (const [key, raw] of Object.entries(sells) as [keyof typeof sells, string][]) {
      const value = positive(raw);
      if (value !== undefined) {
        dto[key] = value;
      }
    }
    // ENT-18 / P8: a markup with no Sell prices its level (the answer paints the Sell back) — A to D.
    const markups = [
      ["markupAPct", line.sellA, line.markup],
      ["markupBPct", line.sellB, line.markupB],
      ["markupCPct", line.sellC, line.markupC],
      ["markupDPct", line.sellD, line.markupD],
    ] as const;
    for (const [key, sell, markup] of markups) {
      if (!sell.trim() && markup.trim()) {
        dto[key] = cellNumber(markup);
      }
    }
  }
  // P9 / Q4: the line's MSP, only while the line owns it (0 = no MSP); untouched = left out — the item's current one is the server's default.
  if (line.mspOwned && line.msp.trim()) {
    dto.minPrice = cellNumber(line.msp);
  }
  // P7: Sch % else the Sch amount (the server takes the amount only without a %).
  const sch = positive(line.schPct);
  const schAmt = positive(line.schAmt);
  if (sch !== undefined) {
    dto.schPct = sch;
  } else if (schAmt !== undefined) {
    dto.schAmt = schAmt;
  }
  const extra = positive(line.extraDisc);
  if (extra !== undefined) {
    dto.extraDiscAmt = extra;
  }
  // ENT-04: the answer's rate replaces Rate.
  const costIncl = positive(line.costIncl);
  if (line.costTyped && costIncl !== undefined) {
    dto.costIncl = costIncl;
  }
  if (line.sisterSaleItemId) {
    dto.sisterSaleItemId = line.sisterSaleItemId;
    if (line.sisterSaleItemYear) {
      dto.sisterSaleItemAccYear = line.sisterSaleItemYear;
    }
  }
  if (rowFromPo(line)) {
    dto.poItemId = line.poItemId;
    dto.poItemAccYear = line.poYear || accYear;
  }
  if (rowFromGrn(line)) {
    // Qty in, unit and batches are the GRN's — the server takes them from it.
    dto.grnItemId = line.grnItemId;
    dto.grnItemAccYear = line.grnYear || accYear;
    const grnDisc = positive(line.discPct);
    const grnDiscAmt = positive(line.discAmt);
    if (grnDisc !== undefined) {
      dto.discPct = grnDisc;
    } else if (grnDiscAmt !== undefined) {
      dto.discAmt = grnDiscAmt; // P7
    }
    return dto;
  }
  if (line.recd.trim()) {
    dto.receivedQty = cellNumber(line.recd);
  }
  const dmg = positive(line.dmg);
  if (dmg !== undefined) {
    dto.damagedQty = dmg;
  }
  const free = positive(line.free);
  if (free !== undefined) {
    dto.freeQty = free;
  }
  const disc = positive(line.discPct);
  const discAmt = positive(line.discAmt);
  if (disc !== undefined) {
    dto.discPct = disc;
  } else if (discAmt !== undefined) {
    dto.discAmt = discAmt; // P7: the amount only without a %
  }
  const mrp = positive(line.mrp);
  if (mrp !== undefined) {
    dto.mrp = mrp;
  }
  const allocs = allocsOf(line, bill?.godownId ?? "");
  if (allocs) {
    dto.allocs = allocs;
  }
  return dto;
}

/**
 * The save / validate body and the line keys in the order they were sent —
 * the answer's lines come back in that order (Qt matches them by position).
 * /validate leaves out a line with an item but no qty yet (Qt dd59c2c P11:
 * the server would refuse the whole check for it); Save still names it.
 */
export function buildPayload(
  draft: InvoiceDraft,
  post: boolean,
  today: string,
  forValidate = false,
): { body: SavePurchaseInvoiceDto; sentKeys: string[] } {
  const lines = forValidate ? itemLines(draft).filter((line) => !lineHalfTyped(line)) : itemLines(draft);
  const invNo = draft.supplierInvNo.trim();
  const remarks = draft.remarks.trim();
  return {
    body: {
      header: {
        ...(draft.piId ? { piId: draft.piId } : {}),
        companyId: draft.companyId,
        branchId: draft.branchId,
        accYear: draft.accYear,
        deviceId: draft.deviceId,
        supplierId: draft.supplierId,
        // The calculation does not care which bill it is; the DTO does.
        supplierInvNo: forValidate && !invNo ? "-" : invNo,
        supplierInvDate: draft.supplierInvDate || draft.docDate || today,
        docDate: draft.docDate || today,
        godownId: draft.godownId,
        invoiceAmountPrinted: cellNumber(draft.invoiceAmount),
        ...(remarks ? { remarks } : {}),
        ...headerExtrasDto(draft),
        ...headerExtDto(draft.ext),
        post,
      },
      lines: lines.map((line, index) => lineDto(line, index + 1, draft)),
      charges: chargesPayload(draft.charges ?? []),
    },
    sentKeys: lines.map((line) => line.key),
  };
}

/** Qt `recalcNow`'s gate: nothing is asked until supplier, godown and a line with its qty are there. */
export function canRecalc(draft: InvoiceDraft): boolean {
  return Boolean(draft.supplierId && draft.godownId && itemLines(draft).some((line) => !lineHalfTyped(line)));
}

/** Qt `saveDocument`'s gate. */
export function checkBeforeSave(draft: InvoiceDraft): { title: string; message: string } | null {
  if (draft.status !== STATUS.draft) {
    return { title: "Not a draft", message: `${draft.refno || "This bill"} is ${draft.status}.` };
  }
  if (!draft.supplierId || !draft.supplierInvNo.trim() || !draft.godownId) {
    return {
      title: "Header incomplete",
      message: "Pick the supplier and the godown, and type the supplier's invoice no.",
    };
  }
  if (itemLines(draft).length === 0) {
    return { title: "No lines", message: "Add at least one item." };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Answers painted back
// ---------------------------------------------------------------------------

export function calcOf(row: {
  taxable?: unknown;
  gstPct?: unknown;
  cgst?: unknown;
  sgst?: unknown;
  igst?: unknown;
  cess?: unknown;
  total?: unknown;
  amount?: unknown;
  chrgBeforeTax?: unknown;
  chrgAfterTax?: unknown;
  landedCostWot?: unknown;
  pendingShortQty?: unknown;
  rejectedQty?: unknown;
  itcClass?: unknown;
  itcEligible?: unknown;
  itcPending?: unknown;
  itcIneligible?: unknown;
  check?: InvoiceLineCheck | null;
}): LineCalc {
  const after = num(row.chrgAfterTax);
  const cgst = num(row.cgst);
  const sgst = num(row.sgst);
  const igst = num(row.igst);
  const cess = num(row.cess);
  return {
    taxable: num(row.taxable),
    gstPct: num(row.gstPct),
    tax: cgst + sgst + igst + cess,
    // P10: Total = the server's amount (the after-tax share in); an older server's total + that share
    total: row.amount !== undefined && row.amount !== null ? num(row.amount) : Math.round((num(row.total) + after) * 100) / 100,
    chrgBeforeTax: num(row.chrgBeforeTax),
    chrgAfterTax: after,
    gstParts: { cgst, sgst, igst, cess },
    costWot: num(row.landedCostWot),
    shortQty: num(row.pendingShortQty),
    rejectedQty: num(row.rejectedQty),
    itc: itcText(row.itcClass, row.itcEligible, row.itcPending, row.itcIneligible),
    check: row.check ?? null,
  };
}

export function totalsFromCalc(answer: PurchaseCalcAnswer): InvoiceTotals {
  const t = answer.totals ?? {};
  return {
    taxable: num(t.taxable),
    gst: num(t.cgst) + num(t.sgst) + num(t.igst) + num(t.cess),
    roundOff: num(t.roundOff),
    netPayable: num(t.netPayable),
    invoiceAmount: num(answer.invoiceAmountPrinted),
    difference: num(answer.difference),
    shortValue: num(t.shortValue),
    itcPending: num(t.itcPending),
    chargesOnBill: num(t.chargesOnBill),
    offbillCharges: num(t.offbillCharges),
    tcs: num(t.tcs),
  };
}

export function totalsFromHeader(header: PurchaseInvoicePayload["header"]): InvoiceTotals {
  const printed = num(header.piInvoiceAmountPrinted);
  const net = num(header.piNetPayable);
  return {
    taxable: num(header.piTaxableAmt),
    gst: num(header.piCgstAmt) + num(header.piSgstAmt) + num(header.piIgstAmt) + num(header.piCessAmt),
    roundOff: num(header.piRoundOff),
    netPayable: net,
    invoiceAmount: printed,
    difference: Math.round((printed - net) * 100) / 100,
    shortValue: num(header.piShortValue),
    itcPending: num(header.piItcPendingAmt),
    chargesOnBill: num(header.piChargesOnBill),
    offbillCharges: num(header.piOffbillCharges),
    tcs: num(header.piTcsAmt),
  };
}

/**
 * The Check column (Qt `checkText`): "REJECTED n" (billed, but sent back on a
 * GRN return — R18), "SHORT n" (billed, never came), else "OK"; a posted line
 * whose price a newer change beat adds "PRICE KEPT" (D16).
 */
export function checkText(line: InvoiceLine): string {
  return lineCheckChips(line)
    .map((chip) => chip.text)
    .join(" · ");
}

/** The Check cell's chips (Qt `checkChips`, rebuild 2026-10-29): the server's `lines[].check` judged. */
export function lineCheckChips(line: InvoiceLine): CheckChip[] {
  if (!line.calc) {
    return line.priceKept ? [{ text: "PRICE KEPT", tone: "neutral" }] : [];
  }
  return checkChips(line.calc.shortQty, line.calc.rejectedQty, line.calc.check, line.priceKept);
}

/** The Check cell's tone: red for a short, amber for a rejection / kept price, green for OK. */
export function checkTone(check: string): "bad" | "warn" | "good" | null {
  if (check.startsWith("SHORT")) {
    return "bad";
  }
  if (check.startsWith("REJECTED") || check.includes("PRICE KEPT")) {
    return "warn";
  }
  return check === "OK" ? "good" : null;
}

/** One stored pur_item_alloc row, in the shape F12 edits and the save sends (Qt `applyLoaded`). */
export function allocEntryOf(row: PurchaseAllocRow): PurchaseAllocEntry {
  const entry: PurchaseAllocEntry = {
    bucket: text(row.piaBucket).toUpperCase() === "DAMAGED" ? "DAMAGED" : "SALEABLE",
    qty: num(row.piaQty),
  };
  const put = <K extends keyof PurchaseAllocEntry>(key: K, value: PurchaseAllocEntry[K] | "" | undefined) => {
    if (value !== undefined && value !== "") {
      entry[key] = value as PurchaseAllocEntry[K];
    }
  };
  put("godownId", text(row.piaGodownId));
  put("batchNo", text(row.piaBatchNo));
  put("mfgDate", isoDay(row.piaMfgDate));
  put("expiryDate", isoDay(row.piaExpiryDate));
  put("mrp", num(row.piaMrp) > 0 ? num(row.piaMrp) : undefined);
  put("serialNo", text(row.piaSerialNo));
  put("warrantyTo", isoDay(row.piaWarrantyTo));
  put("sizeId", text(row.piaSizeId));
  put("colourId", text(row.piaColourId));
  put("model", text(row.piaModel));
  put("freeQty", num(row.piaFreeQty) > 0 ? num(row.piaFreeQty) : undefined);
  return entry;
}

/**
 * Qt `setLineAllocs`: one SALEABLE row (+ its DAMAGED twin) goes back onto the
 * row as Batch / Expiry / MRP / Size / Colour / Model; anything more stays the
 * line's split, and the Batch cell reads "n batches (F12)".
 */
export function withAllocs(line: InvoiceLine, rows: readonly PurchaseAllocEntry[], billGodownId: string): InvoiceLine {
  const folded = foldAllocs(rows, billGodownId);
  if (folded) {
    return {
      ...line,
      split: null,
      batch: folded.batch,
      expiry: displayDate(folded.expiryIso),
      mrp: folded.mrp > 0 ? qtyText(folded.mrp) : line.mrp,
      sizeId: folded.sizeId,
      sizeName: folded.sizeId ? folded.sizeName : "",
      colourId: folded.colourId,
      colourName: folded.colourId ? folded.colourName : "",
      model: folded.model,
    };
  }
  if (rows.length === 0) {
    return { ...line, split: null, batch: "", expiry: "" };
  }
  return {
    ...line,
    split: rows.map((row) => ({ ...row })),
    batch: splitLabel(rows),
    expiry: "",
    sizeId: "",
    sizeName: "",
    colourId: "",
    colourName: "",
    model: "",
  };
}

function loadedLine(row: PurchaseInvoicePayload["lines"][number], key: string, billGodownId: string): InvoiceLine {
  const line = blankLine(key);
  const dmg = num(row.piiDamagedQty);
  const free = num(row.piiFreeQty);
  const disc = num(row.piiDiscPct);
  const mrp = num(row.piiMrp);
  const billed = num(row.piiBilledQty);
  const srcType = text(row.piiSrcDocType).toUpperCase();
  const positiveText = (value: unknown) => (num(value) > 0 ? qtyText(num(value)) : "");
  const markupText = (value: unknown) => (text(value) ? qtyText(num(value)) : "");
  // P7: a % line keeps its %, an amount line its amount; the pair's figure shows muted
  const schPct = num(row.piiSchPct);
  const discAmt = num(row.piiDiscAmt);
  const schAmt = num(row.piiSchAmt);
  // P10: Total = taxable + GST + the after-tax share (the PO's Amount)
  const before = num(row.piiChrgBeforeTax);
  const after = num(row.piiChrgAfterTax);
  const cgst = num(row.piiCgstAmt);
  const sgst = num(row.piiSgstAmt);
  const igst = num(row.piiIgstAmt);
  const cess = num(row.piiCessAmt);
  const storedMsp = text(row.piiMinPrice);
  const base: InvoiceLine = {
    ...line,
    itemId: text(row.piiItemId),
    uomId: text(row.piiUomId),
    lineId: text(row.piiId),
    billed: qtyText(billed),
    recd: qtyText(num(row.piiReceivedQty)),
    dmg: dmg > 0 ? qtyText(dmg) : "",
    free: free > 0 ? qtyText(free) : "",
    rate: rateText(row.piiRate),
    discPct: disc > 0 ? qtyText(disc) : "",
    discAmt: disc <= 0 && discAmt > 0 ? qtyText(discAmt) : "",
    schAmt: schPct <= 0 && schAmt > 0 ? qtyText(schAmt) : "",
    derived: derivedPairs({ gross: num(row.piiGrossAmt), discAmt, schAmt }, { discPct: disc > 0, schPct: schPct > 0 }),
    mrp: mrp > 0 ? qtyText(mrp) : "",
    gstPct: qtyText(num(row.piiGstPct)),
    hsn: text(row.piiHsnCode),
    // Q4: stored on the bill = the line owns it (sent back until cleared)
    msp: storedMsp ? qtyText(num(row.piiMinPrice)) : "",
    mspOwned: storedMsp !== "",
    grnItemId: srcType === "GRN" ? text(row.piiSrcItemId) : "",
    grnYear: srcType === "GRN" ? text(row.piiSrcDocYear) : "",
    poItemId: srcType === "PURCHASE_ORDER" ? text(row.piiSrcItemId) : "",
    poYear: srcType === "PURCHASE_ORDER" ? text(row.piiSrcDocYear) : "",
    sisterSaleItemId: srcType === "SALE_BILL" ? text(row.piiSrcItemId) : "",
    sisterSaleItemYear: srcType === "SALE_BILL" ? text(row.piiSrcDocYear) : "",
    // A sister bill's number stays whole (Qt); a PO / GRN shows its last segment.
    srcRefno: srcType === "SALE_BILL" ? text(row.piiSrcDocRefno) : srcType ? refnoTail(row.piiSrcDocRefno) : "",
    schPct: schPct > 0 ? qtyText(schPct) : "",
    extraDisc: positiveText(row.piiExtraDiscAmt),
    costIncl: billed > 0 ? (num(row.piiTotalAmt) / billed).toFixed(2) : "",
    markup: markupText(row.piiMarkupAPct),
    markupB: markupText(row.piiMarkupBPct),
    markupC: markupText(row.piiMarkupCPct),
    markupD: markupText(row.piiMarkupDPct),
    sellA: positiveText(row.piiSellA),
    sellB: positiveText(row.piiSellB),
    sellC: positiveText(row.piiSellC),
    sellD: positiveText(row.piiSellD),
    priceKept: text(row.piiPriceUpdateResult).toUpperCase() === "KEPT_NEWER",
    calc: {
      taxable: num(row.piiTaxableAmt),
      gstPct: num(row.piiGstPct),
      tax: cgst + sgst + igst + cess,
      total: Math.round((num(row.piiTotalAmt) + after) * 100) / 100,
      chrgBeforeTax: before,
      chrgAfterTax: after,
      gstParts: { cgst, sgst, igst, cess },
      costWot: num(row.piiLandedCostWot),
      shortQty: num(row.piiShortQty),
      rejectedQty: num(row.piiRejectedAtGrnQty),
      itc: itcText(row.piiItcClass, row.piiItcEligibleAmt, row.piiItcPendingAmt, row.piiItcIneligibleAmt),
      check: row.check ?? null,
    },
  };
  // A GRN line's lots are the GRN's: they are not this bill's to show or send.
  const allocs = rowFromGrn(base) ? [] : (row.allocs ?? []).map(allocEntryOf);
  return allocs.length > 0 ? withAllocs(base, allocs, billGodownId) : base;
}

/** Qt `applyLoaded`: the stored document. Item and unit names follow from the lookup. */
export function draftFromPayload(
  payload: PurchaseInvoicePayload,
  viewMode: "browse" | "entry",
  lineSettings: LineSettings = DEFAULT_LINE_SETTINGS,
): InvoiceDraft {
  const h = payload.header;
  const lines = (payload.lines ?? []).map((row, index) => loadedLine(row, `l${index + 1}`, text(h.piGodownId)));
  const draft: InvoiceDraft = {
    piId: text(h.piId),
    refno: text(h.piRefno),
    status: text(h.piStatus).toUpperCase() || STATUS.draft,
    companyId: text(h.piCompanyId),
    branchId: text(h.piBranchId),
    accYear: text(h.piAccYear),
    deviceId: text(h.piDeviceId),
    supplierId: text(h.piSupplierId),
    supplierName: text(h.supplierName),
    supplierInvNo: text(h.piSupplierInvNo),
    supplierInvDate: isoDay(h.piSupplierInvDate),
    docDate: isoDay(h.piDocDate),
    godownId: text(h.piGodownId),
    godownName: text(h.godownName),
    invoiceAmount: rateText(h.piInvoiceAmountPrinted),
    remarks: text(h.piRemarks),
    lines,
    totals: totalsFromHeader(h),
    hint: "",
    viewMode,
    dirty: false,
    nextKey: lines.length + 1,
    lineSettings,
    ...headerExtrasFromPayload(payload),
    ext: headerExtFromHeader(h as unknown as Record<string, unknown>),
    facts: factsOf(h as unknown as Record<string, unknown>),
    issues: { warnings: payload.warnings ?? [], refusals: payload.refusals ?? [] },
    serverTotals: payload.totals ?? totalsFromStoredHeader(h as unknown as Record<string, unknown>),
    // another document: the last answer was the previous one's
    awaitingServer: false,
    liveTotals: null,
    gstBreakup: Array.isArray(payload.gstBreakup) ? payload.gstBreakup : null,
    supplierTaxMode: "",
    audit: {
      createdBy: text(h.piCreatedBy),
      createdOn: text(h.piCreatedOn),
      createdByName: text(h.createdByName),
      modifiedBy: text(h.piModifiedBy),
      modifiedOn: text(h.piModifiedOn),
      modifiedByName: text(h.modifiedByName),
    },
  };
  return isEditable(draft) ? ensureTrailingBlank(draft) : draft;
}

/** Something on screen worth bringing back after a menu trip. */
export function isWorthRemembering(draft: InvoiceDraft): boolean {
  return (
    draft.dirty &&
    draft.status === STATUS.draft &&
    Boolean(draft.supplierId || draft.supplierInvNo.trim() || itemLines(draft).length > 0)
  );
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export type HeaderPatch = Partial<
  Pick<InvoiceDraft, "supplierInvNo" | "supplierInvDate" | "docDate" | "invoiceAmount" | "remarks" | "tcsAmount" | "ewbNo" | "ewbDate">
>;

export type InvoiceAction =
  | { type: "reset"; scope: InvoiceScope; today: string }
  | { type: "loaded"; payload: PurchaseInvoicePayload; viewMode: "browse" | "entry" }
  | { type: "header"; patch: HeaderPatch }
  | { type: "supplier"; id: string; name: string }
  | { type: "godown"; id: string; name: string }
  | { type: "editCell"; key: string; column: number; raw: string }
  /**
   * An item lookup landed. `quiet` = the names of a loaded line, not an edit;
   * `source` = a line a PO brought in (quiet, but its GST % / MRP fill in where blank).
   */
  | { type: "applyItem"; key: string; item: PurchaseItemLookup; name?: string; quiet?: boolean; source?: boolean }
  | { type: "removeLine"; key: string }
  | { type: "addLine" }
  | { type: "calc"; sentKeys: readonly string[]; answer: PurchaseCalcAnswer }
  | { type: "hint"; hint: string }
  | { type: "beginEdit" }
  // ── Qt 0fbe19c..e0c56ef line actions (PI-LINES) ────────────────────────
  /** The session's line rules arrived (purchase / stock settings). Not an edit. */
  | { type: "lineSettings"; settings: LineSettings }
  /** F4: the line's next unit, looked up. */
  | { type: "unitSwitched"; key: string; item: PurchaseItemLookup }
  /** F12 OK: the line's batches / serials. */
  | { type: "setAllocs"; key: string; rows: readonly PurchaseAllocEntry[] }
  /** A Size / Colour pick ("" / "" empties the cell). */
  | { type: "pickChoice"; key: string; field: "size" | "colour"; id: string; name: string }
  /** ENT-07: the supplier's scheme for the line's item is known — fill Free. */
  | { type: "schemeFree"; key: string; itemId: string; scheme: Scheme }
  /** ENT-02: a new line's rate / discounts from the pending PO or the last purchase. */
  | { type: "lineDefaults"; key: string; itemId: string; rate: string; discPct: string; schPct: string; said: string }
  /** From GRN / From PO (and a sister company's bill): lines appended, the blank ones dropped first. */
  | { type: "addSourceLines"; lines: readonly SourceLine[]; hint: string }
  /** ENT-16: the unknown barcode was saved as the line's item's EAN. */
  | { type: "barcodeSaved"; key: string; code: string }
  // ── Qt 88cd3f2 / 4c09536 header and side actions (PI-HEADER) ──────────
  /** A fresh bill's auto-apply purchase charges (Qt `seedAutoCharges`). */
  | { type: "chargesSeed"; masters: readonly PurchaseChargeMasterRow[] }
  /** A charge picked from the master. */
  | { type: "chargeAdd"; master: PurchaseChargeMasterRow }
  | { type: "chargeEdit"; key: string; field: "rate" | "amount"; raw: string }
  | { type: "chargeRemove"; key: string }
  /** Off-bill payees (loadmen), in pick order. */
  | { type: "chargePayees"; key: string; payees: readonly { id: string; text: string }[] }
  /** DOC-08: a sister company's sale bill pulled into this bill. */
  | { type: "sisterPull"; pull: SisterBillPull }
  // ── 2026-10-29 fidelity rebuild ──
  /** The header's new fields (mode, credit days, agent, bill from, IRN / Ack, goods received, transport). */
  | { type: "ext"; patch: Partial<InvoiceHeaderExt> }
  /**
   * The supplier's context arrived: its default credit days and bill-from GSTIN (not an edit), and
   * the godown a new bill takes when none is picked yet — the supplier's default, else the
   * branch's (Qt dd59c2c P11, 1600680 Q5).
   */
  | { type: "supplierDefaults"; creditDays: number | null; billFromGstin: string; godownId?: string; godownName?: string }
  /** The strip's rows (a refused save / post). */
  | { type: "issues"; issues: InvoiceIssues }
  /** Qt 7d8c926 `m_dirtyAfterLoad`: a held / autosaved bill brought back is unsaved work. */
  | { type: "markDirty" };

function patchLine(draft: InvoiceDraft, key: string, patch: (line: InvoiceLine) => InvoiceLine): InvoiceDraft {
  let touched = false;
  const lines = draft.lines.map((line) => {
    if (line.key !== key) {
      return line;
    }
    touched = true;
    return patch(line);
  });
  return touched ? { ...draft, lines } : draft;
}

type TypedField =
  | "billed"
  | "recd"
  | "dmg"
  | "free"
  | "rate"
  | "discPct"
  | "mrp"
  | "sellA"
  | "sellB"
  | "sellC"
  | "sellD"
  | "markup"
  | "schPct"
  | "extraDisc"
  | "costIncl"
  | "discAmt"
  | "schAmt"
  | "msp"
  | "markupB"
  | "markupC"
  | "markupD";

const NUMBER_FIELDS: Readonly<Partial<Record<number, TypedField>>> = {
  [COL.Billed]: "billed",
  [COL.Recd]: "recd",
  [COL.Dmg]: "dmg",
  [COL.Free]: "free",
  [COL.Rate]: "rate",
  [COL.DiscPct]: "discPct",
  [COL.Mrp]: "mrp",
  [COL.SellA]: "sellA",
  [COL.SellB]: "sellB",
  [COL.SellC]: "sellC",
  [COL.SellD]: "sellD",
  [COL.Markup]: "markup",
  [COL.SchPct]: "schPct",
  [COL.ExtraDisc]: "extraDisc",
  [COL.CostIncl]: "costIncl",
  [COL.DiscAmt]: "discAmt",
  [COL.SchAmt]: "schAmt",
  [COL.Msp]: "msp",
  [COL.MarkupB]: "markupB",
  [COL.MarkupC]: "markupC",
  [COL.MarkupD]: "markupD",
};

/** P8: a level's Sell ↔ its Markup (and the markup's margin) — the fields one clears on the other. */
const SELL_OF_MARKUP: Readonly<Partial<Record<number, TypedField>>> = {
  [COL.Markup]: "sellA",
  [COL.MarkupB]: "sellB",
  [COL.MarkupC]: "sellC",
  [COL.MarkupD]: "sellD",
};
const MARKUP_OF_SELL: Readonly<Partial<Record<number, { markup: TypedField; margin: "marginPct" | "marginBPct" | "marginCPct" | "marginDPct" }>>> = {
  [COL.SellA]: { markup: "markup", margin: "marginPct" },
  [COL.SellB]: { markup: "markupB", margin: "marginBPct" },
  [COL.SellC]: { markup: "markupC", margin: "marginCPct" },
  [COL.SellD]: { markup: "markupD", margin: "marginDPct" },
};

const QTY_COLUMNS: ReadonlySet<number> = new Set([COL.Billed, COL.Recd, COL.Dmg, COL.Free]);

/** What a cell holds as typed, by column — the grid's editors read it. */
export function typedCell(line: InvoiceLine, column: number): string {
  const field = NUMBER_FIELDS[column];
  if (field) {
    return line[field];
  }
  switch (column) {
    case COL.Batch:
      return line.batch;
    case COL.Expiry:
      return line.expiry;
    case COL.Model:
      return line.model;
    default:
      return "";
  }
}

function editCell(draft: InvoiceDraft, key: string, column: number, raw: string): InvoiceDraft {
  const index = draft.lines.findIndex((candidate) => candidate.key === key);
  const line = draft.lines[index];
  if (!line || !isEditable(draft) || whyNotEditable(line, column, draft.lineSettings) !== "") {
    return draft;
  }
  const lineNo = index + 1;
  const field = NUMBER_FIELDS[column];
  if (field) {
    let value = raw.replace(/,/g, "").trim();
    let refused = "";
    if (EXPRESSION_COLUMNS.has(column)) {
      // ENT-05 / ENT-19: the cell then holds the answer; a text that is no sum is cleared.
      const result = evalMoneyExpression(value, { sell: SELL_COLUMNS.has(column), mrp: cellNumber(line.mrp) });
      if (result.ok) {
        value = result.value;
      } else {
        value = "";
        refused = `Line ${lineNo}: ${result.hint}`;
      }
    }
    if (line[field] === value && !refused) {
      return draft;
    }
    const next = patchLine(draft, key, (current) => {
      const patched: InvoiceLine = { ...current, [field]: value };
      if (column === COL.Free) {
        patched.freeTyped = true; // ENT-07: typed (even blanked) — the scheme leaves it alone now
      }
      if (column === COL.CostIncl) {
        patched.costTyped = value !== ""; // ENT-04: the answer back-solves Rate
      }
      // P8: a typed markup prices its level (the answer paints the Sell back); a typed Sell clears its markup — A to D
      const sellField = SELL_OF_MARKUP[column];
      if (sellField && value !== "") {
        patched[sellField] = "";
      }
      const markupFields = MARKUP_OF_SELL[column];
      if (markupFields) {
        patched[markupFields.markup] = "";
        patched[markupFields.margin] = "";
      }
      // P7: Disc % or Disc, Sch % or Sch — typing one clears the other (the server takes the amount only without a %)
      if (column === COL.DiscPct && value !== "") {
        patched.discAmt = "";
      }
      if (column === COL.DiscAmt && value !== "") {
        patched.discPct = "";
      }
      if (column === COL.SchPct && value !== "") {
        patched.schAmt = "";
      }
      if (column === COL.SchAmt && value !== "") {
        patched.schPct = "";
      }
      if (column === COL.Msp) {
        patched.mspOwned = true; // P9 / Q4: typed here (blank again = not sent)
      }
      return patched;
    });
    let hint = refused;
    if (!hint && line.split && QTY_COLUMNS.has(column)) {
      hint = `Line ${lineNo}: the qty changed — open F12 and make the batches add up again.`;
    }
    return hint ? { ...next, dirty: true, hint } : { ...next, dirty: true };
  }
  if (column === COL.Batch) {
    const value = raw.trim().toUpperCase();
    if (line.batch === value) {
      return draft;
    }
    if (value && rowTextile(line, draft.lineSettings) && (line.sizeId || line.colourId || line.model)) {
      return {
        ...patchLine(draft, key, (current) => ({
          ...current,
          batch: value,
          sizeId: "",
          sizeName: "",
          colourId: "",
          colourName: "",
          model: "",
        })),
        dirty: true,
        hint: `Line ${lineNo}: a typed batch carries no size / colour / model — leave Batch blank to have one given on Post.`,
      };
    }
    return { ...patchLine(draft, key, (current) => ({ ...current, batch: value })), dirty: true };
  }
  if (column === COL.Expiry) {
    const value = raw.trim();
    if (line.expiry === value) {
      return draft;
    }
    const next = { ...patchLine(draft, key, (current) => ({ ...current, expiry: value })), dirty: true };
    if (value && !isoFromTyped(value)) {
      return { ...next, hint: `Line ${lineNo}: expiry must be dd/MM/yyyy.` };
    }
    return next;
  }
  if (column === COL.Model) {
    const value = raw.trim().slice(0, 60);
    return line.model === value ? draft : { ...patchLine(draft, key, (current) => ({ ...current, model: value })), dirty: true };
  }
  return draft;
}

function applyItem(
  draft: InvoiceDraft,
  key: string,
  item: PurchaseItemLookup,
  name: string | undefined,
  quiet: boolean,
  source: boolean,
): InvoiceDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !item.itemId) {
    return draft;
  }
  // A loaded (or source) line's names: only if the line still holds that item.
  if (quiet && line.itemId !== item.itemId) {
    return draft;
  }
  const mrp = num(item.mrp);
  const sameItem = line.itemId === item.itemId;
  const fresh = !sameItem || line.uomId !== text(item.uomId);
  const next = patchLine(draft, key, (current) => {
    const patched: InvoiceLine = {
      ...current,
      itemId: item.itemId,
      itemCode: text(item.itemCode),
      itemName: name?.trim() || (quiet && current.itemName ? current.itemName : text(item.itemName)),
      uomId: text(item.uomId),
      unitName: text(item.unitName),
      factor: num(item.toBaseFactor, 1) || 1,
      signature: text(item.trackSignature),
      // The stored GST % stays on a loaded line; a keyed one starts from the item's (a PO line where it has none).
      gstPct: !quiet || (source && !current.gstPct) ? qtyText(num(item.taxPerc)) : current.gstPct,
      // A PO line brings its own MRP (Qt keepMrp); a keyed line takes the item's.
      mrp: mrp > 0 && (!quiet || (source && !current.mrp)) ? qtyText(mrp) : current.mrp,
      // A different item: the old figures are not this line's any more.
      calc: !quiet && fresh ? null : current.calc,
      est: !quiet && fresh ? null : current.est,
      derived: !quiet && fresh ? NO_DERIVED : current.derived,
    };
    if (!sameItem && !quiet) {
      // Another item on the line: its scheme, split, textile cells and PO link were the old item's.
      Object.assign(patched, {
        freeTyped: false,
        freeAuto: "",
        split: null,
        batch: current.split ? "" : current.batch,
        sizeId: "",
        sizeName: "",
        colourId: "",
        colourName: "",
        model: "",
        poItemId: "",
        poYear: "",
        sisterSaleItemId: "",
        sisterSaleItemYear: "",
        srcRefno: "",
        // and its HSN / MSP (an owned MSP would otherwise go out on the new item)
        hsn: "",
        msp: "",
        mspOwned: false,
      } satisfies Partial<InvoiceLine>);
    }
    return patched;
  });
  const withHint = quiet ? next : { ...next, dirty: true, hint: "" };
  return isEditable(withHint) ? ensureTrailingBlank(withHint) : withHint;
}

/** Sell / Markup / margin of one level, as the line keeps them (Qt `paintServerLine` levels). */
const LEVEL_FIELDS = {
  A: { sell: "sellA", markup: "markup", margin: "marginPct" },
  B: { sell: "sellB", markup: "markupB", margin: "marginBPct" },
  C: { sell: "sellC", markup: "markupC", margin: "marginCPct" },
  D: { sell: "sellD", markup: "markupD", margin: "marginDPct" },
} as const satisfies Record<string, { sell: keyof InvoiceLine; markup: keyof InvoiceLine; margin: keyof InvoiceLine }>;

/**
 * Qt `paintServerLine`: one line of the server's answer — its money, the charge
 * split (P10), the cost, ITC, Sell / Markup A–D (P8), HSN and MSP (P9), what
 * the blank Disc / Sch pair stands for (P7). A key the server does not send
 * leaves its field alone; the estimate gives way.
 */
function paintServerLine(line: InvoiceLine, row: PurchaseCalcAnswer["lines"][number], priceUpdate: boolean): InvoiceLine {
  const calc = calcOf(row);
  const next: InvoiceLine = { ...line, calc, est: null, gstPct: qtyText(calc.gstPct) };
  if (line.costTyped && text(row.rate) !== "") {
    // ENT-04: the server's back-solved rate.
    next.rate = rateText(row.rate);
    next.costTyped = false;
  }
  if (text(row.costIncl)) {
    next.costIncl = text(row.costIncl);
  }
  if (priceUpdate) {
    // Sell / Markup A–D; the margin is the markup's tooltip (B–D: a server with P8)
    for (const { level } of PRICE_LEVELS) {
      const markupKey = `markup${level}Pct` as const;
      const row2 = row as Record<string, unknown>;
      if (row2[markupKey] === undefined) {
        continue;
      }
      const fields = LEVEL_FIELDS[level];
      if (num(row2[`sell${level}`]) > 0) {
        next[fields.sell] = qtyText(num(row2[`sell${level}`]));
      }
      next[fields.markup] = text(row2[markupKey]) ? qtyText(num(row2[markupKey])) : "";
      next[fields.margin] = text(row2[`margin${level}Pct`]) ? qtyText(num(row2[`margin${level}Pct`])) : "";
    }
  }
  if (row.hsn !== undefined) {
    next.hsn = text(row.hsn);
  }
  if (row.minPrice !== undefined && !line.mspOwned) {
    // a line's own MSP stays as typed; else the item's current one, as the server shows it
    next.msp = text(row.minPrice) ? qtyText(num(row.minPrice)) : "";
  }
  if (row.gross !== undefined) {
    next.derived = derivedPairs(
      { gross: num(row.gross), discAmt: num(row.discAmt), schAmt: num(row.schAmt) },
      { discPct: line.discPct.trim() !== "", schPct: line.schPct.trim() !== "" },
    );
  }
  return next;
}

function applyCalc(draft: InvoiceDraft, sentKeys: readonly string[], answer: PurchaseCalcAnswer): InvoiceDraft {
  const byKey = new Map<string, PurchaseCalcAnswer["lines"][number]>();
  const out = answer.lines ?? [];
  sentKeys.forEach((key, index) => {
    const row = out[index];
    if (row) {
      byKey.set(key, row);
    }
  });
  const priceUpdate = draft.lineSettings.priceUpdate;
  const lines = draft.lines.map((line) => {
    const row = byKey.get(line.key);
    return row && rowHasItem(line) ? paintServerLine(line, row, priceUpdate) : line;
  });
  return {
    ...draft,
    lines,
    awaitingServer: false,
    liveTotals: null,
    gstBreakup: Array.isArray(answer.gstBreakup) ? answer.gstBreakup : null,
    supplierTaxMode: text(answer.supplierTaxMode) || draft.supplierTaxMode || "",
    charges: applyChargeCalc(draft.charges ?? [], answer.charges),
    totals: totalsFromCalc(answer),
    serverTotals: {
      ...(answer.totals ?? {}),
      ...(answer.invoiceAmountPrinted !== undefined ? { invoiceAmountPrinted: answer.invoiceAmountPrinted } : {}),
      ...(answer.difference !== undefined ? { difference: answer.difference } : {}),
    },
    facts: answer.header ? factsOf(answer.header, answer.interState) : draft.facts,
    issues: { warnings: answer.warnings ?? [], refusals: answer.refusals ?? [] },
    // the server's goods-received date shows until one is typed (Qt paintHeaderFacts)
    ext:
      answer.header && !draft.ext.goodsTyped && text(answer.header.goodsReceivedOn)
        ? { ...draft.ext, goodsReceivedOn: text(answer.header.goodsReceivedOn).slice(0, 10) }
        : draft.ext,
    // P11: the lines with no qty yet were left out of this check
    hint: waitingHint(lines),
  };
}

/** A source line (GRN / PO / sister bill) as a bill line. */
function sourceLineOf(source: SourceLine, key: string): InvoiceLine {
  return {
    ...blankLine(key),
    itemId: source.itemId,
    itemName: source.itemName,
    uomId: source.uomId,
    unitName: source.unitName,
    billed: source.billed,
    recd: source.recd,
    dmg: source.dmg,
    free: source.free,
    rate: source.rate,
    discPct: source.discPct,
    schPct: source.schPct,
    mrp: source.mrp,
    srcRefno: source.srcRefno,
    grnItemId: source.grnItemId ?? "",
    grnYear: source.grnYear ?? "",
    poItemId: source.poItemId ?? "",
    poYear: source.poYear ?? "",
    sisterSaleItemId: source.sisterSaleItemId ?? "",
    sisterSaleItemYear: source.sisterSaleItemYear ?? "",
    sellA: source.sellA ?? "",
    sellB: source.sellB ?? "",
    sellC: source.sellC ?? "",
    sellD: source.sellD ?? "",
  };
}

function addSourceLines(draft: InvoiceDraft, sources: readonly SourceLine[], hint: string): InvoiceDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  let nextKey = draft.nextKey;
  const added = sources.map((source) => sourceLineOf(source, `l${nextKey++}`));
  return ensureTrailingBlank({
    ...draft,
    lines: [...draft.lines.filter(rowHasItem), ...added],
    nextKey,
    dirty: draft.dirty || added.length > 0,
    hint,
  });
}

function lineNoOf(draft: InvoiceDraft, key: string): number {
  return draft.lines.findIndex((line) => line.key === key) + 1;
}

function lineAction(draft: InvoiceDraft, action: InvoiceAction): InvoiceDraft {
  switch (action.type) {
    case "lineSettings": {
      const now = draft.lineSettings;
      if (now.priceUpdate === action.settings.priceUpdate && now.autoBatchNo === action.settings.autoBatchNo) {
        return draft;
      }
      return { ...draft, lineSettings: { ...action.settings } };
    }
    case "unitSwitched": {
      const line = draft.lines.find((candidate) => candidate.key === action.key);
      if (!line || !isEditable(draft) || rowFromGrn(line) || line.itemId !== action.item.itemId) {
        return draft;
      }
      const mrp = num(action.item.mrp);
      const next = patchLine(draft, action.key, (current) => ({
        ...current,
        uomId: text(action.item.uomId),
        unitName: text(action.item.unitName),
        factor: num(action.item.toBaseFactor, 1) || 1,
        signature: text(action.item.trackSignature),
        gstPct: qtyText(num(action.item.taxPerc)),
        mrp: mrp > 0 ? qtyText(mrp) : "",
        calc: null,
        est: null,
      }));
      return { ...next, dirty: true, hint: `Line ${lineNoOf(draft, action.key)}: unit changed — check the rate.` };
    }
    case "setAllocs": {
      const line = draft.lines.find((candidate) => candidate.key === action.key);
      if (!line || !rowHasItem(line) || !isEditable(draft) || rowFromGrn(line)) {
        return draft;
      }
      return { ...patchLine(draft, action.key, (current) => withAllocs(current, action.rows, draft.godownId)), dirty: true, hint: "" };
    }
    case "pickChoice": {
      const line = draft.lines.find((candidate) => candidate.key === action.key);
      if (!line || !isEditable(draft) || !textileOpen(line, draft.lineSettings)) {
        return draft;
      }
      const id = action.id.trim();
      const name = id ? action.name.trim() : "";
      if (action.field === "size") {
        return line.sizeId === id
          ? draft
          : { ...patchLine(draft, action.key, (current) => ({ ...current, sizeId: id, sizeName: name })), dirty: true };
      }
      return line.colourId === id
        ? draft
        : { ...patchLine(draft, action.key, (current) => ({ ...current, colourId: id, colourName: name })), dirty: true };
    }
    case "schemeFree": {
      const line = draft.lines.find((candidate) => candidate.key === action.key);
      if (!line || !isEditable(draft) || line.itemId !== action.itemId || rowFromGrn(line) || line.freeTyped) {
        return draft;
      }
      const now = line.free;
      if (now !== "" && now !== line.freeAuto) {
        return draft; // a reopened draft's own free
      }
      const free = schemeFreeText(cellNumber(line.billed), action.scheme);
      if (free === now) {
        return draft;
      }
      const next = { ...patchLine(draft, action.key, (current) => ({ ...current, free, freeAuto: free })), dirty: true };
      if (!free) {
        return next;
      }
      const lineNo = lineNoOf(draft, action.key);
      return {
        ...next,
        hint: `Line ${lineNo}: scheme buy ${qtyText(action.scheme.buy)} get ${qtyText(action.scheme.free)} — ${free} free. Type over Free if the bill says otherwise.`,
      };
    }
    case "lineDefaults": {
      const line = draft.lines.find((candidate) => candidate.key === action.key);
      // The operator got there first, or the line holds another item now.
      if (!line || !isEditable(draft) || line.itemId !== action.itemId || line.rate.trim() !== "" || !action.rate) {
        return draft;
      }
      const next = patchLine(draft, action.key, (current) => ({
        ...current,
        rate: action.rate,
        discPct: action.discPct || current.discPct,
        schPct: action.schPct || current.schPct,
      }));
      return {
        ...next,
        dirty: true,
        hint: `Line ${lineNoOf(draft, action.key)}: ${action.said} — change it if the bill says otherwise.`,
      };
    }
    case "addSourceLines":
      return addSourceLines(draft, action.lines, action.hint);
    case "barcodeSaved": {
      const next = patchLine(draft, action.key, (current) => ({ ...current, itemCode: action.code }));
      return { ...next, hint: `Barcode ${action.code} saved.` };
    }
    default:
      return draft;
  }
}

/**
 * The draft after an action, with the live estimate Qt dd59c2c P11 paints at
 * once (`repriceRow` + `paintLive`): the lines the action touched work
 * themselves out again and the totals follow, until the server's answer
 * (`calc`) replaces both.
 */
export function invoiceReducer(draft: InvoiceDraft, action: InvoiceAction): InvoiceDraft {
  const next = reduceInvoice(draft, action);
  return next === draft ? draft : withLiveEstimate(draft, next, action);
}

/** Which lines an action re-prices (Qt: a typed cell, a source / new-unit line's lookup, the line defaults, lines brought in). */
function repricedKeys(before: InvoiceDraft, after: InvoiceDraft, action: InvoiceAction): string[] | null {
  switch (action.type) {
    case "editCell":
    case "unitSwitched":
    case "lineDefaults":
      return [action.key];
    case "applyItem":
      return action.source ? [action.key] : null;
    case "addSourceLines":
    case "sisterPull": {
      const had = new Set(before.lines.map((line) => line.key));
      return after.lines.filter((line) => !had.has(line.key)).map((line) => line.key);
    }
    case "removeLine":
    case "chargeAdd":
    case "chargeEdit":
    case "chargeRemove":
      return []; // the totals only
    case "header":
      return action.patch.invoiceAmount !== undefined || action.patch.tcsAmount !== undefined ? [] : null;
    default:
      return null;
  }
}

function withLiveEstimate(before: InvoiceDraft, after: InvoiceDraft, action: InvoiceAction): InvoiceDraft {
  // only where the server's answer follows (a recalc is scheduled), so the estimate never outstays it
  if (!isEditable(after) || !changesFigures(action)) {
    return after;
  }
  const keys = repricedKeys(before, after, action);
  if (keys === null) {
    return after;
  }
  const wanted = new Set(keys);
  const ctx = { interState: Boolean(after.facts?.interState), supplierTaxMode: after.supplierTaxMode ?? "" };
  const lines = wanted.size === 0 ? after.lines : after.lines.map((line) => (wanted.has(line.key) ? repriceLine(line, ctx) : line));
  return { ...after, lines, liveTotals: liveTotalsOf({ ...after, lines }), awaitingServer: true };
}

function reduceInvoice(draft: InvoiceDraft, action: InvoiceAction): InvoiceDraft {
  switch (action.type) {
    case "reset":
      return createDraft(action.scope, action.today, draft.lineSettings);
    case "loaded":
      return draftFromPayload(action.payload, action.viewMode, draft.lineSettings);
    case "header":
      return isEditable(draft) ? { ...draft, ...action.patch, dirty: true } : draft;
    case "supplier":
      if (!isEditable(draft) || draft.supplierId === action.id) {
        return draft;
      }
      // Qt: a new supplier's credit days and bill-from come with its context
      return {
        ...draft,
        supplierId: action.id,
        supplierName: action.name,
        ext: { ...draft.ext, creditDaysTyped: false, billFromGstin: "" },
        dirty: true,
      };
    case "ext":
      return isEditable(draft) ? { ...draft, ext: { ...draft.ext, ...action.patch }, dirty: true } : draft;
    case "supplierDefaults": {
      if (!isEditable(draft)) {
        return draft;
      }
      const ext = { ...draft.ext };
      if (!ext.creditDaysTyped && !ext.creditDays && action.creditDays !== null) {
        ext.creditDays = String(action.creditDays);
      }
      if (action.billFromGstin && ext.billFromGstin !== action.billFromGstin && !draft.ext.billFromGstin) {
        ext.billFromGstin = action.billFromGstin;
      }
      // a godown already picked is left alone; a stored bill keeps its own
      const godownId = (action.godownId ?? "").trim();
      const takeGodown = godownId !== "" && !draft.godownId && !draft.piId && draft.supplierId !== "";
      if (ext.creditDays === draft.ext.creditDays && ext.billFromGstin === draft.ext.billFromGstin && !takeGodown) {
        return draft;
      }
      return takeGodown ? { ...draft, ext, godownId, godownName: (action.godownName ?? "").trim() } : { ...draft, ext };
    }
    case "issues":
      return { ...draft, issues: action.issues };
    case "markDirty":
      return isEditable(draft) && !draft.dirty ? { ...draft, dirty: true } : draft;
    case "godown":
      if (!isEditable(draft) || draft.godownId === action.id) {
        return draft;
      }
      return { ...draft, godownId: action.id, godownName: action.name, dirty: true };
    case "editCell":
      return editCell(draft, action.key, action.column, action.raw);
    case "applyItem":
      return applyItem(draft, action.key, action.item, action.name, Boolean(action.quiet || action.source), Boolean(action.source));
    case "removeLine": {
      const line = draft.lines.find((candidate) => candidate.key === action.key);
      if (!line || !rowHasItem(line) || !isEditable(draft)) {
        return draft;
      }
      return ensureTrailingBlank({
        ...draft,
        lines: draft.lines.filter((candidate) => candidate.key !== action.key),
        dirty: true,
      });
    }
    case "addLine":
      return isEditable(draft) ? ensureTrailingBlank(draft) : draft;
    case "calc":
      return applyCalc(draft, action.sentKeys, action.answer);
    case "hint":
      return draft.hint === action.hint ? draft : { ...draft, hint: action.hint };
    case "beginEdit":
      if (draft.status !== STATUS.draft || draft.viewMode === "entry") {
        return draft;
      }
      return ensureTrailingBlank({ ...draft, viewMode: "entry" });
    // ── PI-HEADER ──
    case "addSourceLines":
      // R4: goods from a GRN — our own costs were paid on the GRN.
      return dropOffBillForGrn(lineAction(draft, action), action.lines.some((line) => Boolean(line.grnItemId)));
    case "chargesSeed":
    case "chargeAdd":
    case "chargeEdit":
    case "chargeRemove":
    case "chargePayees":
    case "sisterPull":
      return headerAction(draft, action);
    default:
      return lineAction(draft, action);
  }
}

/** The changes that alter the figures — what schedules a recalculation. */
export function changesFigures(action: InvoiceAction): boolean {
  switch (action.type) {
    case "supplier":
    // Qt waits for the next edit; the godown only opens the gate, so ask now.
    case "godown":
    case "removeLine":
    case "unitSwitched":
    case "setAllocs":
    case "schemeFree":
    case "lineDefaults":
    case "addSourceLines":
    case "lineSettings":
      return true;
    case "applyItem":
      // a picked item, and a source / new-unit line's lookup (Qt fetchItem quiet → m_recalc); not a loaded line's names
      return !action.quiet;
    case "header":
      return action.patch.invoiceAmount !== undefined || action.patch.tcsAmount !== undefined;
    case "ext":
      // Qt m_recalc on mode / credit days / bill from / agent; not on IRN / Ack / transport / typing a date
      return (
        action.patch.mode !== undefined ||
        action.patch.creditDays !== undefined ||
        action.patch.billFromGstin !== undefined ||
        action.patch.agentId !== undefined
      );
    case "supplierDefaults":
      return true;
    // PI-HEADER
    case "chargesSeed":
    case "chargeAdd":
    case "chargeEdit":
    case "chargeRemove":
    case "chargePayees":
    case "sisterPull":
      return true;
    case "editCell":
      return (
        action.column !== COL.Batch &&
        action.column !== COL.Expiry &&
        action.column !== COL.Barcode &&
        action.column !== COL.Model
      );
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Header and side — charges, TCS / e-way bill, payment hold, sister company
// bill (Qt NexERP 88cd3f2, 9028830, 348957f, 4c09536; PI-HEADER)
// ---------------------------------------------------------------------------

/** The header fields Qt 9028830 added to the body: TCS (when charged), e-way bill no / date. */
function headerExtrasDto(draft: InvoiceDraft): { tcsAmount?: number; ewbNo?: string; ewbDate?: string } {
  const tcs = cellNumber(draft.tcsAmount ?? "");
  const ewbNo = (draft.ewbNo ?? "").trim();
  const ewbDate = (draft.ewbDate ?? "").trim();
  return {
    ...(tcs > 0 ? { tcsAmount: tcs } : {}),
    ...(ewbNo ? { ewbNo } : {}),
    ...(ewbDate ? { ewbDate } : {}),
  };
}

/** A stored bill's charges (folded per payee), TCS, e-way bill and payment hold (Qt `applyLoaded`). */
function headerExtrasFromPayload(
  payload: PurchaseInvoicePayload,
): Pick<
  InvoiceDraft,
  "charges" | "nextChargeKey" | "chargesSeeded" | "tcsAmount" | "ewbNo" | "ewbDate" | "paymentHold" | "holdReason"
> {
  const h = payload.header;
  const charges = foldStoredCharges(payload.charges, (index) => `c${index + 1}`);
  const tcs = num(h.piTcsAmt);
  return {
    charges,
    nextChargeKey: charges.length + 1,
    chargesSeeded: true,
    tcsAmount: tcs > 0 ? tcs.toFixed(2) : "",
    ewbNo: text(h.piEwbNo),
    ewbDate: isoDay(h.piEwbDate),
    paymentHold: Boolean(h.piPaymentHold),
    holdReason: text(h.piHoldReason),
  };
}

/** R4: once a GRN line is on the bill, its off-bill charges go (Qt `dropOffBillCharges`). */
function dropOffBillForGrn(draft: InvoiceDraft, fromGrn: boolean): InvoiceDraft {
  if (!fromGrn || !isEditable(draft)) {
    return draft;
  }
  const { rows, gone } = dropOffBill(draft.charges ?? []);
  if (gone.length === 0) {
    return draft;
  }
  const said = droppedOffBillHint(gone);
  return { ...draft, charges: rows, dirty: true, hint: draft.hint ? `${draft.hint}\n${said}` : said };
}

/** A sister bill's line, with its batch / expiry (Qt `fillFromSister`). */
function sisterLine(line: SisterBillPull["lines"][number], refno: string, key: string): InvoiceLine {
  const free = num(line.freeQty);
  const mrp = num(line.mrp);
  const rate = num(line.rate);
  return {
    ...blankLine(key),
    itemId: text(line.itemId),
    itemName: text(line.itemName),
    uomId: text(line.uomId),
    unitName: text(line.unitName),
    billed: qtyText(num(line.billedQty)),
    free: free > 0 ? qtyText(free) : "",
    rate: rate.toFixed(2),
    mrp: mrp > 0 ? qtyText(mrp) : "",
    gstPct: text(line.gstPct) ? qtyText(num(line.gstPct)) : "",
    batch: text(line.batchNo).toUpperCase(),
    expiry: displayDate(line.expiryDate),
    srcRefno: refno,
    sisterSaleItemId: text(line.sisterSaleItemId),
    sisterSaleItemYear: text(line.sisterSaleItemAccYear),
  };
}

function headerAction(draft: InvoiceDraft, action: InvoiceAction): InvoiceDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  const charges = draft.charges ?? [];
  switch (action.type) {
    case "chargesSeed": {
      // A loaded bill (or charges already on) won the race.
      if (draft.chargesSeeded || draft.piId || charges.some((row) => row.chgId)) {
        return draft.chargesSeeded ? draft : { ...draft, chargesSeeded: true };
      }
      let next = draft.nextChargeKey ?? 1;
      const seeded = action.masters.map((master) => chargeFromMaster(master, `c${next++}`));
      return { ...draft, charges: seeded, nextChargeKey: next, chargesSeeded: true };
    }
    case "chargeAdd": {
      const master = action.master;
      if (!master.chgId || charges.some((row) => row.chgId === master.chgId)) {
        return draft;
      }
      if (!masterOnBill(master) && draft.lines.some((line) => line.grnItemId)) {
        return {
          ...draft,
          hint: `${master.chgName} is our own (off-bill) cost — on goods from a GRN it belongs on the GRN, not the bill.`,
        };
      }
      const key = `c${draft.nextChargeKey ?? charges.length + 1}`;
      return {
        ...draft,
        charges: [...charges, chargeFromMaster(master, key)],
        nextChargeKey: (draft.nextChargeKey ?? charges.length + 1) + 1,
        chargesSeeded: true,
        dirty: true,
        hint: "",
      };
    }
    case "chargeEdit": {
      let touched = false;
      const rows = charges.map((row) => {
        if (row.key !== action.key) {
          return row;
        }
        const edited = editCharge(row, action.field, action.raw);
        touched = edited !== row;
        return edited;
      });
      return touched ? { ...draft, charges: rows, dirty: true } : draft;
    }
    case "chargeRemove": {
      const rows = charges.filter((row) => row.key !== action.key);
      return rows.length === charges.length ? draft : { ...draft, charges: rows, dirty: true };
    }
    case "chargePayees": {
      const row = charges.find((candidate) => candidate.key === action.key);
      if (!row || row.onBill) {
        return draft;
      }
      return {
        ...draft,
        charges: charges.map((candidate) =>
          candidate.key === action.key
            ? { ...candidate, payeeIds: action.payees.map((payee) => payee.id), payeeNames: action.payees.map((payee) => payee.text) }
            : candidate,
        ),
        dirty: true,
      };
    }
    case "sisterPull": {
      // The supplier is the sister company as a supplier; the bill no, date and amount are the sale bill's.
      const { bill, lines } = action.pull;
      let nextKey = draft.nextKey;
      const added = lines.map((line) => sisterLine(line, text(bill.refno), `l${nextKey++}`));
      const amount = num(bill.amount);
      const count = added.length === 1 ? "1 line" : `${added.length} lines`;
      return ensureTrailingBlank({
        ...draft,
        supplierId: text(bill.supplierId) || draft.supplierId,
        supplierName: text(bill.supplierName) || draft.supplierName,
        supplierInvNo: text(bill.refno),
        supplierInvDate: isoDay(bill.billDate) || draft.supplierInvDate,
        invoiceAmount: amount > 0 ? amount.toFixed(2) : draft.invoiceAmount,
        lines: [...draft.lines.filter(rowHasItem), ...added],
        nextKey,
        dirty: true,
        hint: `${count} from ${text(bill.sisterCompanyName) || "the sister company"}'s bill ${text(bill.refno)} — the bill is locked to this purchase once it is saved.`,
      });
    }
    default:
      return draft;
  }
}

/** A remembered draft from before these fields existed gets their blanks (screen memory outlives a deploy). */
export function withHeaderDefaults(draft: InvoiceDraft): InvoiceDraft {
  if (!draft.ext || !draft.facts || !draft.issues) {
    draft = {
      ...draft,
      ext: { ...EMPTY_HEADER_EXT, ...(draft.ext ?? {}) },
      facts: draft.facts ?? EMPTY_FACTS,
      issues: draft.issues ?? EMPTY_ISSUES,
      serverTotals: draft.serverTotals ?? null,
    };
  }
  if (Array.isArray(draft.charges)) {
    return draft;
  }
  return {
    ...draft,
    charges: [],
    nextChargeKey: 1,
    chargesSeeded: Boolean(draft.piId),
    tcsAmount: "",
    ewbNo: "",
    ewbDate: "",
    paymentHold: false,
    holdReason: "",
  };
}
