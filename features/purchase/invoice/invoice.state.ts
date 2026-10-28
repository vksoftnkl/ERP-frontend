/**
 * Purchase Entry (menu 24) — the draft and every rule over it, pure: the Qt
 * `PurchaseInvoiceEntry`'s grid bookkeeping, `buildPayload`, `paintCalc`,
 * `applyLoaded` and `resetScreen`, as one reducer.
 *
 * The client never computes money. Every figure from Taxable onward is the
 * server's (`POST /purchase/invoices/validate`), painted back by `calc`; a
 * loaded document shows the stored ones.
 */
import { isoFromTyped, num, qtyText, text } from "../shared/purchase.format";
import { COL, EDITABLE_COLUMNS, FOCUS_STOPS, STATUS } from "./invoice.constants";
import type {
  InvoiceDraft,
  InvoiceLine,
  InvoiceScope,
  InvoiceTotals,
  LineCalc,
  PurchaseAllocDto,
  PurchaseAllocRow,
  PurchaseCalcAnswer,
  PurchaseInvoiceLineDto,
  PurchaseInvoicePayload,
  PurchaseItemLookup,
  SavePurchaseInvoiceDto,
} from "./invoice.types";

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
    keptAllocs: null,
    calc: null,
  };
}

/** Qt `resetScreen`: today's date on both dates, one blank line, DRAFT. */
export function createDraft(scope: InvoiceScope, today: string): InvoiceDraft {
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
export function whyNotEditable(line: InvoiceLine, column: number): string {
  if (!EDITABLE_COLUMNS.has(column)) {
    return column === COL.Unit
      ? "The item's purchase unit."
      : column === COL.Short || column === COL.Check
        ? "What did not come — the server works it out from billed, received and damaged."
        : "Worked out by the server from the line.";
  }
  if (!rowHasItem(line)) {
    return column === COL.Barcode || column === COL.Item ? "" : "Scan or pick the item first.";
  }
  if (column === COL.Barcode) {
    return "The barcode only finds the item — pick another item on Item.";
  }
  if ((column === COL.Batch || column === COL.Expiry) && line.keptAllocs) {
    return `${line.keptAllocs.length} batches on this line — kept as saved.`;
  }
  return "";
}

export function isEnterStop(line: InvoiceLine, column: number): boolean {
  return FOCUS_STOPS.has(column) && whyNotEditable(line, column) === "";
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
export function allocsOf(line: InvoiceLine): PurchaseAllocDto[] | undefined {
  if (line.keptAllocs) {
    return line.keptAllocs;
  }
  const batch = line.batch.trim();
  const expiry = isoFromTyped(line.expiry);
  if (!batch && !expiry) {
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

export function lineDto(line: InvoiceLine, lineNo: number): PurchaseInvoiceLineDto {
  const dto: PurchaseInvoiceLineDto = {
    lineNo,
    itemId: line.itemId,
    uomId: line.uomId,
    billedQty: cellNumber(line.billed),
    rate: cellNumber(line.rate),
  };
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
  if (disc !== undefined) {
    dto.discPct = disc;
  }
  const mrp = positive(line.mrp);
  if (mrp !== undefined) {
    dto.mrp = mrp;
  }
  const allocs = allocsOf(line);
  if (allocs) {
    dto.allocs = allocs;
  }
  return dto;
}

/**
 * The save / validate body and the line keys in the order they were sent —
 * the answer's lines come back in that order (Qt matches them by position).
 */
export function buildPayload(
  draft: InvoiceDraft,
  post: boolean,
  today: string,
  forValidate = false,
): { body: SavePurchaseInvoiceDto; sentKeys: string[] } {
  const lines = itemLines(draft);
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
        post,
      },
      lines: lines.map((line, index) => lineDto(line, index + 1)),
      charges: [],
    },
    sentKeys: lines.map((line) => line.key),
  };
}

/** Qt `recalcNow`'s gate: nothing is asked until supplier, godown and a line are there. */
export function canRecalc(draft: InvoiceDraft): boolean {
  return Boolean(draft.supplierId && draft.godownId && itemLines(draft).length > 0);
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
  landedCostWot?: unknown;
  pendingShortQty?: unknown;
}): LineCalc {
  return {
    taxable: num(row.taxable),
    gstPct: num(row.gstPct),
    tax: num(row.cgst) + num(row.sgst) + num(row.igst) + num(row.cess),
    total: num(row.total),
    costWot: num(row.landedCostWot),
    shortQty: num(row.pendingShortQty),
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
  };
}

/** "SHORT 2" / "OK" — the Check column (Qt). */
export function checkText(line: InvoiceLine): string {
  if (!line.calc) {
    return "";
  }
  return line.calc.shortQty > 0 ? `SHORT ${qtyText(line.calc.shortQty)}` : "OK";
}

function allocDto(row: PurchaseAllocRow): PurchaseAllocDto {
  const dto: PurchaseAllocDto = { qty: num(row.piaQty) };
  const put = <K extends keyof PurchaseAllocDto>(key: K, value: PurchaseAllocDto[K] | null | undefined | "") => {
    if (value !== null && value !== undefined && value !== "") {
      dto[key] = value;
    }
  };
  put("godownId", text(row.piaGodownId));
  const bucket = text(row.piaBucket).toUpperCase();
  put("bucket", bucket === "DAMAGED" ? "DAMAGED" : bucket === "SALEABLE" ? "SALEABLE" : undefined);
  put("batchNo", text(row.piaBatchNo));
  put("mfgDate", isoDay(row.piaMfgDate));
  put("expiryDate", isoDay(row.piaExpiryDate));
  put("mrp", num(row.piaMrp) > 0 ? num(row.piaMrp) : undefined);
  put("salePrice", num(row.piaSalePrice) > 0 ? num(row.piaSalePrice) : undefined);
  put("serialNo", text(row.piaSerialNo));
  put("warrantyTo", isoDay(row.piaWarrantyTo));
  put("sizeId", text(row.piaSizeId));
  put("colourId", text(row.piaColourId));
  put("model", text(row.piaModel));
  put("freeQty", num(row.piaFreeQty) > 0 ? num(row.piaFreeQty) : undefined);
  return dto;
}

function loadedLine(row: PurchaseInvoicePayload["lines"][number], key: string): InvoiceLine {
  const line = blankLine(key);
  const dmg = num(row.piiDamagedQty);
  const free = num(row.piiFreeQty);
  const disc = num(row.piiDiscPct);
  const mrp = num(row.piiMrp);
  const allocs = row.allocs ?? [];
  let batch = "";
  let expiry = "";
  let keptAllocs: PurchaseAllocDto[] | null = null;
  const simple =
    allocs.length === 1 || (allocs.length === 2 && text(allocs[1].piaBucket).toUpperCase() === "DAMAGED");
  if (simple) {
    batch = text(allocs[0].piaBatchNo);
    expiry = displayDate(allocs[0].piaExpiryDate);
  } else if (allocs.length > 1) {
    keptAllocs = allocs.map(allocDto);
    batch = `${allocs.length} batches`;
  }
  return {
    ...line,
    itemId: text(row.piiItemId),
    uomId: text(row.piiUomId),
    lineId: text(row.piiId),
    billed: qtyText(num(row.piiBilledQty)),
    recd: qtyText(num(row.piiReceivedQty)),
    dmg: dmg > 0 ? qtyText(dmg) : "",
    free: free > 0 ? qtyText(free) : "",
    rate: rateText(row.piiRate),
    discPct: disc > 0 ? qtyText(disc) : "",
    mrp: mrp > 0 ? qtyText(mrp) : "",
    gstPct: qtyText(num(row.piiGstPct)),
    batch,
    expiry,
    keptAllocs,
    calc: {
      taxable: num(row.piiTaxableAmt),
      gstPct: num(row.piiGstPct),
      tax: num(row.piiCgstAmt) + num(row.piiSgstAmt) + num(row.piiIgstAmt) + num(row.piiCessAmt),
      total: num(row.piiTotalAmt),
      costWot: num(row.piiLandedCostWot),
      shortQty: num(row.piiShortQty),
    },
  };
}

/** Qt `applyLoaded`: the stored document. Item and unit names follow from the lookup. */
export function draftFromPayload(payload: PurchaseInvoicePayload, viewMode: "browse" | "entry"): InvoiceDraft {
  const h = payload.header;
  const lines = (payload.lines ?? []).map((row, index) => loadedLine(row, `l${index + 1}`));
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
  Pick<InvoiceDraft, "supplierInvNo" | "supplierInvDate" | "docDate" | "invoiceAmount" | "remarks">
>;

export type InvoiceAction =
  | { type: "reset"; scope: InvoiceScope; today: string }
  | { type: "loaded"; payload: PurchaseInvoicePayload; viewMode: "browse" | "entry" }
  | { type: "header"; patch: HeaderPatch }
  | { type: "supplier"; id: string; name: string }
  | { type: "godown"; id: string; name: string }
  | { type: "editCell"; key: string; column: number; raw: string }
  /** An item lookup landed. `quiet` = the names of a loaded line, not an edit. */
  | { type: "applyItem"; key: string; item: PurchaseItemLookup; name?: string; quiet?: boolean }
  | { type: "removeLine"; key: string }
  | { type: "addLine" }
  | { type: "calc"; sentKeys: readonly string[]; answer: PurchaseCalcAnswer }
  | { type: "hint"; hint: string }
  | { type: "beginEdit" };

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

const NUMBER_FIELDS: Readonly<Partial<Record<number, keyof InvoiceLine>>> = {
  [COL.Billed]: "billed",
  [COL.Recd]: "recd",
  [COL.Dmg]: "dmg",
  [COL.Free]: "free",
  [COL.Rate]: "rate",
  [COL.DiscPct]: "discPct",
  [COL.Mrp]: "mrp",
};

function editCell(draft: InvoiceDraft, key: string, column: number, raw: string): InvoiceDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !isEditable(draft) || whyNotEditable(line, column) !== "") {
    return draft;
  }
  const field = NUMBER_FIELDS[column];
  if (field) {
    const value = raw.replace(/,/g, "").trim();
    if (line[field] === value) {
      return draft;
    }
    return { ...patchLine(draft, key, (current) => ({ ...current, [field]: value })), dirty: true };
  }
  if (column === COL.Batch) {
    const value = raw.trim().toUpperCase();
    return line.batch === value ? draft : { ...patchLine(draft, key, (current) => ({ ...current, batch: value })), dirty: true };
  }
  if (column === COL.Expiry) {
    const value = raw.trim();
    if (line.expiry === value) {
      return draft;
    }
    const next = { ...patchLine(draft, key, (current) => ({ ...current, expiry: value })), dirty: true };
    if (value && !isoFromTyped(value)) {
      const lineNo = draft.lines.indexOf(line) + 1;
      return { ...next, hint: `Line ${lineNo}: expiry must be dd/MM/yyyy.` };
    }
    return next;
  }
  return draft;
}

function applyItem(draft: InvoiceDraft, key: string, item: PurchaseItemLookup, name: string | undefined, quiet: boolean): InvoiceDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !item.itemId) {
    return draft;
  }
  // A loaded line's names: only if the line still holds that item.
  if (quiet && line.itemId !== item.itemId) {
    return draft;
  }
  const mrp = num(item.mrp);
  const fresh = line.itemId !== item.itemId || line.uomId !== text(item.uomId);
  const next = patchLine(draft, key, (current) => ({
    ...current,
    itemId: item.itemId,
    itemCode: text(item.itemCode),
    itemName: name?.trim() || text(item.itemName),
    uomId: text(item.uomId),
    unitName: text(item.unitName),
    factor: num(item.toBaseFactor, 1) || 1,
    signature: text(item.trackSignature),
    // The stored GST % stays on a loaded line; a keyed one starts from the item's.
    gstPct: quiet ? current.gstPct : qtyText(num(item.taxPerc)),
    mrp: !quiet && mrp > 0 ? qtyText(mrp) : current.mrp,
    // A different item: the old figures are not this line's any more.
    calc: !quiet && fresh ? null : current.calc,
  }));
  const withHint = quiet ? next : { ...next, dirty: true, hint: "" };
  return isEditable(withHint) ? ensureTrailingBlank(withHint) : withHint;
}

function applyCalc(draft: InvoiceDraft, sentKeys: readonly string[], answer: PurchaseCalcAnswer): InvoiceDraft {
  const byKey = new Map<string, LineCalc>();
  const out = answer.lines ?? [];
  sentKeys.forEach((key, index) => {
    const row = out[index];
    if (row) {
      byKey.set(key, calcOf(row));
    }
  });
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      const calc = byKey.get(line.key);
      return calc && rowHasItem(line) ? { ...line, calc, gstPct: qtyText(calc.gstPct) } : line;
    }),
    totals: totalsFromCalc(answer),
    hint: "",
  };
}

export function invoiceReducer(draft: InvoiceDraft, action: InvoiceAction): InvoiceDraft {
  switch (action.type) {
    case "reset":
      return createDraft(action.scope, action.today);
    case "loaded":
      return draftFromPayload(action.payload, action.viewMode);
    case "header":
      return isEditable(draft) ? { ...draft, ...action.patch, dirty: true } : draft;
    case "supplier":
      if (!isEditable(draft) || draft.supplierId === action.id) {
        return draft;
      }
      return { ...draft, supplierId: action.id, supplierName: action.name, dirty: true };
    case "godown":
      if (!isEditable(draft) || draft.godownId === action.id) {
        return draft;
      }
      return { ...draft, godownId: action.id, godownName: action.name, dirty: true };
    case "editCell":
      return editCell(draft, action.key, action.column, action.raw);
    case "applyItem":
      return applyItem(draft, action.key, action.item, action.name, Boolean(action.quiet));
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
    default:
      return draft;
  }
}

/** The changes that alter the figures — what schedules a recalculation. */
export function changesFigures(action: InvoiceAction): boolean {
  switch (action.type) {
    case "supplier":
    // Qt waits for the next edit; the godown only opens the gate, so ask now.
    case "godown":
    case "removeLine":
      return true;
    case "applyItem":
      return !action.quiet;
    case "header":
      return action.patch.invoiceAmount !== undefined;
    case "editCell":
      return action.column !== COL.Batch && action.column !== COL.Expiry && action.column !== COL.Barcode;
    default:
      return false;
  }
}
