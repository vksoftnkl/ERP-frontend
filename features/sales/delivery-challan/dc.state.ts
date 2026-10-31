/**
 * Delivery Challan — the draft, its factories and its transitions. Pure.
 *
 * The line rules are the Qt screen's (`DeliveryChallanEntry`): the item-price
 * fill keeps an ORDER line's rate, a quantity may not pass the order line's
 * open quantity, a rate may not drop under the minimum, keying one discount
 * clears the other two, and the grid always keeps one blank row waiting.
 * Pricing itself is the shared engine's (`domain/pricing`) with no charges.
 */
import { defaultPolicy, type VoucherPolicy } from "@/domain/pricing";
import {
  applyItemPrice,
  clampPriceLevel,
  createDraftLine,
  emptyCustomer,
} from "@/features/sales/quotation/quotation.state";
import {
  DEFAULT_POS_STATE_CODE,
  DEFAULT_POS_STATE_NAME,
} from "@/features/sales/quotation/quotation.constants";
import type { CustomerSnapshot, ItemPriceLookupPayload } from "@/features/sales/quotation/quotation.types";
import { nextRowKey } from "@/features/sales/quotation/quotation.utils";
import type { OpenSourcePick } from "@/features/sales/testbill/domain/import";
import { emptyTransportBand } from "@/features/sales/testbill/state/factories";
import type { TransportBand } from "@/features/sales/testbill/types";
import {
  DC_DEFAULT_BUCKET,
  DC_DEFAULT_PURPOSE,
  DC_ORDER_CAP_TOLERANCE,
  purposeLabel,
} from "./dc.constants";
import type { DcDraft, DcDraftLine, DcHeader, DcMode } from "./dc.types";

/**
 * The item-price lookup as the challan reads it: the shared payload plus the
 * keys Qt reads that the shared type does not name (`hsn_code`, added to the
 * lookup 2026-09-24, and the batch the stock engine proposes).
 */
export type DcPriceLookup = ItemPriceLookupPayload & {
  hsn_code?: string | null;
  batch_no?: string | null;
  batch_date?: string | null;
  expiry_date?: string | null;
};

export function createDcLine(overrides: Partial<DcDraftLine> = {}): DcDraftLine {
  return {
    ...createDraftLine(),
    sdiId: null,
    srcDocType: null,
    srcLineId: null,
    srcDocYear: null,
    srcDocRefno: null,
    lotId: null,
    bucket: "",
    serialNo: null,
    openQty: 0,
    billedQty: 0,
    returnedQty: 0,
    lineStatus: null,
    ...overrides,
  };
}

/** One blank row always waits at the bottom — the grid's invariant, kept here. */
export function withTrailingBlank(lines: DcDraftLine[]): DcDraftLine[] {
  const last = lines[lines.length - 1];
  if (last && !last.itemId) {
    return lines;
  }
  return [...lines, createDcLine()];
}

/** The lines that name an item — what is saved, counted and validated. */
export function itemLines(lines: readonly DcDraftLine[]): DcDraftLine[] {
  return lines.filter((line) => Boolean(line.itemId));
}

export type DcHeaderDefaults = {
  priceLevel?: number;
  posStateCode?: string;
  posStateName?: string;
  /** Carried over a Clear unless `sales.clear_delivery_on_clear` says otherwise. */
  crew?: Pick<
    DcHeader,
    "salesmanId" | "salesmanName" | "driverId" | "driverName" | "loadmanId" | "loadmanName" | "vehicleNo"
  >;
};

export function emptyDcHeader(dcDate: string, defaults: DcHeaderDefaults = {}): DcHeader {
  return {
    dcDate,
    purpose: DC_DEFAULT_PURPOSE,
    purposeLabel: purposeLabel(DC_DEFAULT_PURPOSE),
    usrRefno: "",
    usrRefdate: "",
    remarks: "",
    priceLevel: clampPriceLevel(defaults.priceLevel ?? 1),
    posStateCode: (defaults.posStateCode ?? "").trim() || DEFAULT_POS_STATE_CODE,
    posStateName: (defaults.posStateName ?? "").trim() || DEFAULT_POS_STATE_NAME,
    salesmanId: defaults.crew?.salesmanId ?? null,
    salesmanName: defaults.crew?.salesmanName ?? "",
    driverId: defaults.crew?.driverId ?? null,
    driverName: defaults.crew?.driverName ?? "",
    loadmanId: defaults.crew?.loadmanId ?? null,
    loadmanName: defaults.crew?.loadmanName ?? "",
    vehicleNo: defaults.crew?.vehicleNo ?? "",
    vehicleId: null,
  };
}

export type DcDraftContext = {
  companyId: string;
  branchId: string;
  accYear: string;
  dcDate: string;
  companyStateCode: string;
  policy?: Partial<VoucherPolicy>;
  header?: DcHeaderDefaults;
};

export function createDcDraft(context: DcDraftContext): DcDraft {
  const header = emptyDcHeader(context.dcDate, context.header);
  return {
    docId: null,
    companyId: context.companyId,
    branchId: context.branchId,
    accYear: context.accYear,
    status: "DRAFT",
    refno: "",
    revisionNo: 0,
    fulfilStatus: "",
    mode: "entry",
    amending: false,
    isDirty: false,
    header,
    customer: emptyCustomer(),
    billToUnlocked: false,
    isLocalSale: !context.companyStateCode || header.posStateCode === context.companyStateCode,
    policy: defaultPolicy(context.policy ?? {}),
    source: null,
    sourceRefnos: {},
    lines: [createDcLine()],
    transport: emptyTransportBand(),
    posting: null,
    storedTotals: null,
    audit: { createdBy: null, createdOn: null, modifiedBy: null, modifiedOn: null },
  };
}

/**
 * Qt `fetchItemPrice` (full fill). A line drawn from an order keeps the
 * ORDER's rate and discount — the customer agreed it; a hand-keyed line takes
 * the price list. The bucket defaults to SALEABLE; Auto Pop Qty puts 1.
 */
export function applyDcItemPrice(
  line: DcDraftLine,
  lookup: DcPriceLookup,
  options: { autoPopQty: boolean; priceLevel: number },
): DcDraftLine {
  const priced = applyItemPrice(line, lookup) as DcDraftLine;
  const fromOrder = Boolean(line.srcLineId);
  const echoed = Number(lookup.price_level) > 0 ? lookup.price_level : options.priceLevel;
  const next: DcDraftLine = {
    ...priced,
    hsnCode: lookup.hsn_code ?? line.hsnCode,
    bucket: line.bucket || DC_DEFAULT_BUCKET,
    priceLevel: clampPriceLevel(echoed),
    batchNo: lookup.batch_no ?? line.batchNo,
    batchDate: lookup.batch_date ?? line.batchDate,
    expiryDate: lookup.expiry_date ?? line.expiryDate,
    // An order line's godown came with the order.
    godownId: fromOrder && line.godownId ? line.godownId : priced.godownId,
    godownName: line.godownName && fromOrder ? line.godownName : priced.godownName,
    rate: fromOrder ? line.rate : priced.rate,
    discPerc: fromOrder ? line.discPerc : priced.discPerc,
    discPerQty: fromOrder ? line.discPerQty : priced.discPerQty,
    billQty: options.autoPopQty && line.billQty === 0 ? 1 : line.billQty,
    // Source lines carry the order's quantity; a hand line's quantity stays.
    caseQty: line.caseQty,
    lengthQty: line.lengthQty,
  };
  if (next.isFree) {
    return { ...next, rate: 0, discPerc: 0, discPerQty: 0 };
  }
  return next;
}

/**
 * Qt `fetchItemPrice(displayOnly)` — a loaded challan's line learns the names
 * `/get` does not carry (item, unit, godown, stock, decimals) and keeps every
 * stored figure: it must show what it stored, not today's price.
 */
export function applyDcItemNames(line: DcDraftLine, lookup: DcPriceLookup): DcDraftLine {
  return {
    ...line,
    itemName: lookup.item_name || line.itemName,
    unitName: lookup.unit_name || line.unitName,
    itemCode: lookup.item_code ?? line.itemCode,
    decimalCount: lookup.decimal_count ?? line.decimalCount,
    batchConfig: lookup.batch_config ?? line.batchConfig,
    stockQty: lookup.stock ?? line.stockQty,
    groupId: lookup.item_group_id ?? line.groupId,
    categoryId: lookup.item_category_id ?? line.categoryId,
    brandId: lookup.item_brand_id ?? line.brandId,
    sectionId: lookup.item_section_id ?? line.sectionId,
    godownName: line.godownName || lookup.godown_name || null,
  };
}

export type LineEdit = { line: DcDraftLine; warning: string | null };

/** Qt `recalcAfterQtyChange`: an order line may not pass the order's open quantity. */
export function setLineQty(line: DcDraftLine, qty: number): LineEdit {
  const cap = line.orderQty;
  if (cap > 0 && qty > cap + DC_ORDER_CAP_TOLERANCE) {
    return {
      line: { ...line, billQty: cap },
      warning: `The order has only ${cap.toFixed(3)} open on this line.`,
    };
  }
  return { line: { ...line, billQty: qty }, warning: null };
}

/** Qt `recalcAfterRateChange`: a rate under the minimum is refused and the cell emptied. */
export function setLineRate(line: DcDraftLine, rate: number): LineEdit {
  if (line.minPrice > 0 && !line.isFree && rate < line.minPrice) {
    return { line: { ...line, rate: 0 }, warning: "Rate < minimum selling price." };
  }
  return { line: { ...line, rate }, warning: null };
}

/** Qt `clearAlternateDiscountInputs`: keying Disc % clears the per-qty and the amount. */
export function setLineDiscPerc(line: DcDraftLine, perc: number): DcDraftLine {
  return { ...line, discPerc: perc, discPerQty: 0, discAmt: 0 };
}

/** Qt `applyDiscountToAll` (Alt+D): every priced, non-free line gets the percent. */
export function discountAll(lines: DcDraftLine[], perc: number): DcDraftLine[] {
  return lines.map((line) => (line.itemId && !line.isFree ? setLineDiscPerc(line, perc) : line));
}

/** A line a bill or a return has drawn on stays on the challan (Qt `removeItemRow`). */
export function lineIsFulfilled(line: Pick<DcDraftLine, "billedQty" | "returnedQty">): boolean {
  return line.billedQty > 0 || line.returnedQty > 0;
}

/**
 * Qt `appendPickedSourceLines` — APPENDS, never replaces. A source line already
 * on the challan is topped up to its open quantity; a new one carries the
 * order's item, unit, godown, batch, lot, rate and tax, `orderQty` = the open
 * quantity (the cap) and `billQty` = what was ticked. The header trail names
 * the FIRST order. Returns the keys of the new lines, still to be priced.
 */
export function appendSourceLines(
  draft: DcDraft,
  picks: readonly OpenSourcePick[],
): { draft: DcDraft; newLineKeys: string[] } {
  const lines = draft.lines.filter((line) => line.itemId);
  const newLineKeys: string[] = [];
  const sourceRefnos = { ...draft.sourceRefnos };
  let source = draft.source;
  for (const pick of picks) {
    if (pick.takeQty <= 0) continue;
    const existing = lines.findIndex((line) => line.srcLineId === pick.line.lineId && line.srcLineId);
    if (existing >= 0) {
      const have = lines[existing];
      lines[existing] = { ...have, billQty: Math.min(have.billQty + pick.takeQty, have.orderQty) };
      continue;
    }
    sourceRefnos[pick.doc.docId] = pick.doc.refno ?? "";
    if (!source?.docId) {
      source = {
        docType: "SALES_ORDER",
        docId: pick.doc.docId,
        accYear: pick.doc.accYear,
        refno: pick.doc.refno,
        date: pick.doc.date,
      };
    }
    const line = createDcLine({
      key: nextRowKey("line"),
      itemId: pick.line.itemId,
      itemName: pick.line.itemName ?? "",
      itemUnitId: pick.line.unitId ?? "",
      unitName: pick.line.unitName ?? "",
      hsnCode: pick.line.hsnCode,
      godownId: pick.line.godownId,
      batchNo: pick.line.batchNo,
      lotId: pick.line.lotId,
      srcDocId: pick.doc.docId,
      srcLineId: pick.line.lineId,
      srcDocType: "SALES_ORDER",
      srcDocYear: pick.doc.accYear,
      srcDocRefno: pick.doc.refno,
      orderQty: pick.line.openQty,
      billQty: pick.takeQty,
      toBaseFactor: 1,
      rate: pick.line.rate,
      gstPerc: pick.line.taxPerc,
      allowNegative: true,
      priceLevel: draft.header.priceLevel,
    });
    lines.push(line);
    newLineKeys.push(line.key);
  }
  return {
    draft: { ...draft, lines: withTrailingBlank(lines), source, sourceRefnos, isDirty: true, storedTotals: null },
    newLineKeys,
  };
}

/**
 * Qt `copyAsNew` (Alt+Y): same customer, same lines, no identity, no source
 * trail (the order's pending quantity was consumed by THIS challan) and no
 * fulfilment. The date resets to today.
 */
export function copyDcAsNew(draft: DcDraft, today: string): DcDraft {
  return {
    ...draft,
    docId: null,
    status: "DRAFT",
    refno: "",
    revisionNo: 0,
    fulfilStatus: "",
    mode: "entry",
    amending: false,
    isDirty: true,
    header: { ...draft.header, dcDate: today },
    source: null,
    sourceRefnos: {},
    posting: null,
    storedTotals: null,
    audit: { createdBy: null, createdOn: null, modifiedBy: null, modifiedOn: null },
    lines: draft.lines.map((line) => ({
      ...line,
      sdiId: null,
      srcDocId: null,
      srcLineId: null,
      srcDocType: null,
      srcDocYear: null,
      srcDocRefno: null,
      lotId: null,
      lineStatus: null,
      orderQty: 0,
      billedQty: 0,
      returnedQty: 0,
      openQty: 0,
    })),
  };
}

// ── Reducer ────────────────────────────────────────────────────────────────

export type DcAction =
  | { type: "replace"; draft: DcDraft }
  | { type: "header"; patch: Partial<DcHeader> }
  | { type: "customer"; customer: CustomerSnapshot; isLocalSale: boolean; posStateCode?: string; posStateName?: string; priceLevel?: number }
  | { type: "customerField"; field: keyof CustomerSnapshot; value: string }
  | { type: "billToUnlocked"; value: boolean }
  | { type: "pos"; code: string; name: string; isLocalSale: boolean }
  | { type: "lineReplace"; rowKey: string; line: DcDraftLine }
  | { type: "linePatch"; rowKey: string; patch: Partial<DcDraftLine> }
  /** Names a loaded line learns display-only — not an edit: the draft stays clean, the stored totals stand. */
  | { type: "lineDisplay"; rowKey: string; patch: Partial<DcDraftLine> }
  | { type: "lineRemoved"; rowKey: string }
  | { type: "lineInserted"; rowKey: string }
  | { type: "lines"; lines: DcDraftLine[] }
  | { type: "transport"; band: TransportBand; vehicleNo: string; vehicleId: string | null }
  | { type: "mode"; mode: DcMode; amending?: boolean }
  | { type: "clean" };

function mapLine(lines: DcDraftLine[], rowKey: string, fn: (line: DcDraftLine) => DcDraftLine): DcDraftLine[] {
  return lines.map((line) => (line.key === rowKey ? fn(line) : line));
}

/** An edit that changes what the lines price to drops the stored totals. */
const edited = (draft: DcDraft, patch: Partial<DcDraft>): DcDraft => ({
  ...draft,
  ...patch,
  isDirty: true,
  storedTotals: patch.lines ? null : draft.storedTotals,
});

export function dcReducer(draft: DcDraft, action: DcAction): DcDraft {
  switch (action.type) {
    case "replace":
      return action.draft;
    case "header":
      return edited(draft, { header: { ...draft.header, ...action.patch } });
    case "customer":
      return edited(draft, {
        customer: action.customer,
        isLocalSale: action.isLocalSale,
        billToUnlocked: false,
        header: {
          ...draft.header,
          posStateCode: action.posStateCode ?? draft.header.posStateCode,
          posStateName: action.posStateName ?? draft.header.posStateName,
          priceLevel: action.priceLevel ? clampPriceLevel(action.priceLevel) : draft.header.priceLevel,
        },
        lines: draft.lines,
      });
    case "customerField":
      return edited(draft, { customer: { ...draft.customer, [action.field]: action.value } });
    case "billToUnlocked":
      return { ...draft, billToUnlocked: action.value };
    case "pos":
      return edited(draft, {
        header: { ...draft.header, posStateCode: action.code, posStateName: action.name },
        isLocalSale: action.isLocalSale,
        lines: draft.lines,
      });
    case "lineReplace":
      return edited(draft, {
        lines: withTrailingBlank(mapLine(draft.lines, action.rowKey, () => action.line)),
      });
    case "linePatch":
      return edited(draft, {
        lines: withTrailingBlank(mapLine(draft.lines, action.rowKey, (line) => ({ ...line, ...action.patch }))),
      });
    case "lineDisplay":
      return { ...draft, lines: mapLine(draft.lines, action.rowKey, (line) => ({ ...line, ...action.patch })) };
    case "lineRemoved": {
      const index = draft.lines.findIndex((line) => line.key === action.rowKey);
      if (index < 0 || index === draft.lines.length - 1) {
        return draft;
      }
      return edited(draft, { lines: withTrailingBlank(draft.lines.filter((line) => line.key !== action.rowKey)) });
    }
    case "lineInserted": {
      const index = draft.lines.findIndex((line) => line.key === action.rowKey);
      if (index < 0) {
        return draft;
      }
      const lines = draft.lines.slice();
      lines.splice(index, 0, createDcLine());
      return { ...draft, lines, isDirty: true };
    }
    case "lines":
      return edited(draft, { lines: withTrailingBlank(action.lines) });
    case "transport":
      return edited(draft, {
        transport: action.band,
        header: { ...draft.header, vehicleNo: action.vehicleNo, vehicleId: action.vehicleId },
      });
    case "mode":
      return { ...draft, mode: action.mode, amending: action.amending ?? draft.amending };
    case "clean":
      return { ...draft, isDirty: false };
    default:
      return draft;
  }
}
