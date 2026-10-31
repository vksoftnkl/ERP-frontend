/**
 * The `/delivery-challans/create` body (Qt `buildSavePayload` /
 * `buildSaveItemPayload`) and its reverse, a `/get` answer → draft (Qt
 * `applyLoadedHeader` / `fillLoadedItemRow` / `applyLoadedTotals`). Pure.
 *
 * `forbidNonWhitelisted`: only keys the DTO names. Server-owned and never sent
 * (beyond Qt's echo of the refno): numbering, fulfilment, status, the posted
 * voucher, the revision. A challan charges nothing — `charges` goes empty so a
 * re-save never leaves a stray row — and carries no tender.
 */
import { Decimal, dec, money, sum, type DocumentPricing, type PricedLine, type VoucherPolicy } from "@/domain/pricing";
import { emptyCustomer } from "@/features/sales/quotation/quotation.state";
import { actorLabel, type SaveActor } from "@/features/sales/quotation/quotation.payload";
import { nextRowKey } from "@/features/sales/quotation/quotation.utils";
import { transportBandDto, transportBandIsEmpty } from "@/features/sales/testbill/domain/shipping";
import { emptyTransportBand } from "@/features/sales/testbill/state/factories";
import type { TransportBand, TransportEnd } from "@/features/sales/testbill/types";
import {
  DC_DEFAULT_BUCKET,
  DC_DEFAULT_PURPOSE,
  DC_DEFAULT_SRC_DOC_TYPE,
  DC_DOC_TYPE,
  DC_STATUSES,
  purposeLabel,
  type DcStatus,
} from "./dc.constants";
import { postingStateOf } from "./dc.lifecycle";
import { createDcLine, emptyDcHeader, itemLines, withTrailingBlank } from "./dc.state";
import type { DcDocKey, DcDraft, DcDraftLine, DcPayload } from "./dc.types";

type Json = Record<string, unknown>;

const orNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
};
const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const bool = (value: unknown): boolean => value === true || value === "true";
/** The server answers dates as `2026-10-31T00:00:00.000Z`; the draft keeps the date literally. */
const isoDateOf = (value: unknown): string => {
  const raw = text(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
};
const firstOf = (value: unknown): string => (Array.isArray(value) ? text(value[0]) : text(value));
const pad = (n: number) => String(n).padStart(2, "0");

/** Qt `QDateTime(dcDate, QTime::currentTime()).toString(Qt::ISODate)` — local, no zone. */
export function dcDateTime(dcDate: string, now: Date = new Date()): string {
  return `${dcDate}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function dcKeyOf(draft: Pick<DcDraft, "docId" | "companyId" | "branchId" | "accYear">): DcDocKey | null {
  if (!draft.docId) {
    return null;
  }
  return {
    sdcId: draft.docId,
    sdcCompanyId: draft.companyId,
    sdcBranchId: draft.branchId,
    sdcAccYear: draft.accYear,
  };
}

function itemDto(line: DcDraftLine, priced: PricedLine | undefined, index: number, draft: DcDraft, actor: SaveActor): Json {
  const p = priced ?? ({} as PricedLine);
  const fromSource = Boolean(line.srcDocId);
  const isFree = line.isFree;
  const dto: Json = {};
  if (line.sdiId) dto.sdiId = line.sdiId;
  Object.assign(dto, {
    sdiCompanyId: draft.companyId,
    sdiBranchId: draft.branchId,
    sdiAccYear: draft.accYear,
    sdiLineNo: index + 1,
    // Per-line trail: the order AND the order line (what SALES_DC_LINE_OVER_ORDER settles against).
    sdiSrcDocType: fromSource ? line.srcDocType || DC_DEFAULT_SRC_DOC_TYPE : null,
    sdiSrcDocId: fromSource ? line.srcDocId : null,
    sdiSrcDocAccYear: fromSource ? orNull(line.srcDocYear) : null,
    sdiSrcDocRefno: fromSource ? orNull(draft.sourceRefnos[line.srcDocId ?? ""] ?? line.srcDocRefno) : null,
    sdiSrcLineNo: null,
    sdiSrcItemId: fromSource ? orNull(line.srcLineId) : null,
    sdiItemId: line.itemId,
    sdiItemUnitId: line.itemUnitId,
    sdiToBaseFactor: line.toBaseFactor > 0 ? line.toBaseFactor : 1,
    sdiHsnCode: orNull(line.hsnCode),
    sdiTaxId: null,
    sdiPriceLevel: line.priceLevel,
    sdiEanCode: orNull(line.barcode),
    sdiSize: null,
    sdiSizeUom: null,
    // Stock: godown + a lot PROPOSAL + bucket — the engine resolves the lot (FIFO) at post.
    sdiGodownId: orNull(line.godownId),
    sdiLotId: orNull(line.lotId),
    sdiBucket: (line.bucket || DC_DEFAULT_BUCKET).toUpperCase(),
    sdiBatchNo: orNull(line.batchNo),
    sdiBatchDate: orNull(line.batchDate),
    sdiExpiryDate: orNull(line.expiryDate),
    sdiSerialNo: orNull(line.serialNo),
    sdiIsFree: isFree,
    sdiFreeType: null,
    sdiIsService: line.isService,
    sdiCaseQty: line.caseQty,
    sdiDcQty: line.billQty,
    sdiFreeQty: isFree ? line.billQty : 0,
    sdiNetQty: p.netQty ?? 0,
    sdiWeightQty: line.weight,
    sdiRate: line.rate,
    sdiRatePreTax: p.rateBeforeTax ?? 0,
    // No MRP is null, never 0 (Qt notes 93).
    sdiMaxPrice: line.mrp > 0 ? line.mrp : null,
    sdiCostPrice: line.costPrice,
    sdiIsTaxIncl: line.isInclusiveTax,
    sdiDiscPerc: line.discPerc,
    sdiDiscAmt: (p.discAmt ?? 0) + (p.splDiscAmt ?? 0) + (p.schAmt ?? 0),
    sdiGrossAmt: p.grossAmt ?? 0,
    sdiTaxableAmt: p.taxableAmt ?? 0,
    sdiTaxPerc: line.gstPerc,
    sdiCgstPerc: line.cgstPerc,
    sdiCgstAmt: p.cgstAmt ?? 0,
    sdiSgstPerc: line.sgstPerc,
    sdiSgstAmt: p.sgstAmt ?? 0,
    sdiIgstPerc: line.igstPerc,
    sdiIgstAmt: p.igstAmt ?? 0,
    sdiCessPerc: line.cessPerc,
    sdiCessAmt: p.cessAmt ?? 0,
    sdiTaxAmt: p.gstAmt ?? 0,
    sdiNetAmt: p.total ?? 0,
    sdiIsPromo: line.schemeFlag,
    sdiActPrice: line.actualPrice,
    sdiMinPrice: line.minPrice,
    sdiItemDiscPerc: line.discPerc,
    sdiItemDiscAmt: p.discAmt ?? 0,
    sdiSplDiscPerc: line.splDiscPerc,
    sdiSplDiscAmt: p.splDiscAmt ?? 0,
    sdiSchDiscPerc: line.schPerc,
    sdiSchDiscAmt: p.schAmt ?? 0,
    sdiChrgBeforeTax: 0,
    sdiChrgAfterTax: 0,
    sdiCessPerUnit: line.cessPerUnit,
    sdiSalesmanId: orNull(line.salesmanId),
    sdiSchemeId: orNull(line.schemeId),
    sdiSchemeName: orNull(line.schemeName),
    sdiRemarks: orNull(line.remarks),
  });
  if (draft.docId) dto.sdiModifiedBy = actorLabel(actor);
  else dto.sdiCreatedBy = actorLabel(actor);
  return dto;
}

export type DcSaveActor = SaveActor & { deviceType?: string | null };

/** Places `sdc_tot_weight` keeps — the column is numeric(15,3). */
const WEIGHT_DP = 3;

/**
 * Qt `recalcDocumentTotals`' weight: Σ per-unit weight × bill qty over the item
 * lines, unrounded in Qt and sent as is. Summed in Decimal here and kept to the
 * column's three places — the engine's `totals.totWeight` is a 2-place money
 * figure, which would lose the third.
 */
export function dcTotalWeight(lines: readonly Pick<DcDraftLine, "itemId" | "weight" | "billQty">[]): number {
  const total = sum(lines.filter((line) => line.itemId).map((line) => dec(line.weight).times(dec(line.billQty))));
  const rounded = total.toDecimalPlaces(WEIGHT_DP, Decimal.ROUND_HALF_UP).toNumber();
  return rounded === 0 ? 0 : rounded;
}

/** The whole `/create` (and `/validate`, `/amend`) body for the challan on screen. */
export function buildDcPayload(
  draft: DcDraft,
  pricing: DocumentPricing,
  actor: DcSaveActor,
  now: Date = new Date(),
): Json {
  const t = pricing.totals;
  const h = draft.header;
  const c = draft.customer;
  const device = actor.deviceMasterId || actor.deviceId || "";
  const idArray = (id: string | null) => (id ? [id] : []);
  const body: Json = {};
  if (draft.docId) body.sdcId = draft.docId;
  Object.assign(body, {
    sdcCompanyId: draft.companyId,
    sdcBranchId: draft.branchId,
    sdcAccYear: draft.accYear,
    sdcSessionId: actor.sessionId,
    sdcDeviceType: actor.deviceType || "WEB",
    sdcDeviceId: device,
    // sdc_counter_id is NOT NULL with no counter master: the counter IS the device (Qt).
    sdcCounterId: device,
    sdcUserId: actor.userId,
    sdcDocType: DC_DOC_TYPE,
    sdcPurpose: (h.purpose || DC_DEFAULT_PURPOSE).toUpperCase(),
    sdcDcRefno: orNull(draft.refno),
    sdcUsrRefno: orNull(h.usrRefno),
    sdcUsrRefdate: orNull(h.usrRefdate),
    sdcDcDate: h.dcDate,
    sdcDcDatetime: dcDateTime(h.dcDate, now),
    sdcPriceLevel: h.priceLevel,
    // The header trail names the FIRST order; every line carries its own.
    sdcSrcDocType: orNull(draft.source?.docType),
    sdcSrcDocId: orNull(draft.source?.docId),
    sdcSrcDocAccYear: draft.source?.docId ? orNull(draft.source.accYear) : null,
    sdcSrcDocRefno: orNull(draft.source?.refno),
    sdcSrcDocDate: orNull(draft.source?.date ? draft.source.date.slice(0, 10) : null),
    sdcCustId: c.custId ?? "",
    sdcCustName: c.name.trim() || c.masterName,
    sdcCustAddr: orNull(c.address),
    sdcCustPlace: orNull(c.place),
    sdcCustPin: orNull(c.pin ?? null),
    sdcCustPhone: orNull(c.phone),
    sdcCustGstin: orNull((c.gstin ?? "").toUpperCase()),
    sdcCustGstType: orNull(c.gstType),
    sdcCustStcd: orNull(c.stateCode),
    sdcPosStcd: orNull(h.posStateCode),
    sdcStateName: orNull(h.posStateName),
    sdcDriverId: h.driverId || null,
    sdcSupervisorId: null,
    sdcLoadmanId: idArray(h.loadmanId),
    sdcVehicleId: h.vehicleId || null,
    sdcVehicleNo: orNull(h.vehicleNo.toUpperCase()),
    sdcSalesmanId: idArray(h.salesmanId),
    sdcAgentId: null,
    sdcPackedId: [],
    sdcTotItems: t.totItems,
    sdcTotWeight: dcTotalWeight(draft.lines),
    sdcTotBags: t.totQty,
    sdcGrossAmt: t.grossAmt,
    // Decimal sums: three money figures added as doubles can land a cent off.
    sdcDiscAmt: money(dec(t.itemDisc).plus(dec(t.splDisc)).plus(dec(t.schDisc))),
    sdcTaxableAmt: t.lineTaxable,
    sdcCgstAmt: t.lineCgst,
    sdcSgstAmt: t.lineSgst,
    sdcIgstAmt: t.lineIgst,
    sdcCessAmt: t.lineCess,
    sdcTaxAmt: t.lineTax,
    sdcOtherAmt: 0,
    sdcRoundOff: t.roundOff,
    sdcDcAmt: t.bill,
    sdcTotalCost: t.totalCost,
    sdcHasLoad: false,
    sdcHasUnload: false,
    sdcHasFreight: false,
    sdcHasPromo: false,
    sdcItemDisc: t.itemDisc,
    sdcSplDisc: t.splDisc,
    sdcSchDisc: t.schDisc,
    sdcFreightAmt: 0,
    sdcLoadAmt: 0,
    sdcUnloadAmt: 0,
    sdcFreightCalcType: orNull(draft.policy.freightCalcType),
    sdcLoadingCalcType: orNull(draft.policy.loadingCalcType),
    sdcDiscAlterBase: draft.policy.discountAlterBaseRate,
    sdcRoundOffStep: draft.policy.roundOffStep,
    sdcPaymentTerms: null,
    sdcDeliveryTerms: null,
    sdcRemarks: orNull(h.remarks.replace(/\s+/g, " ")),
  });
  if (draft.docId) body.sdcModifiedBy = actorLabel(actor);
  else body.sdcCreatedBy = actorLabel(actor);

  const items: Json[] = [];
  draft.lines.forEach((line, index) => {
    if (line.itemId) {
      items.push(itemDto(line, pricing.lines[index], items.length, draft, actor));
    }
  });
  body.items = items;
  body.charges = [];
  // The band rides nested — the challan stores it on txn_transport_detail.
  if (!transportBandIsEmpty(draft.transport)) {
    body.transport = transportBandDto(draft.transport);
  }
  return body;
}

// ── Load ───────────────────────────────────────────────────────────────────

function endOf(value: unknown): TransportEnd {
  const e = value && typeof value === "object" ? (value as Json) : {};
  const s = (key: string) => orNull(text(e[key]));
  return {
    godownId: s("godownId"),
    branchId: s("branchId"),
    addrId: s("addrId"),
    name: s("name"),
    addr: s("addr"),
    place: s("place"),
    pin: s("pin"),
    phone: s("phone"),
    stcd: s("stcd"),
    gstin: s("gstin"),
  };
}

/** `/get` echoes the band as ONE nested `transport` object (Qt `readNested`). */
export function bandFromNested(value: unknown): TransportBand {
  if (!value || typeof value !== "object") {
    return emptyTransportBand();
  }
  const t = value as Json;
  const distance = t.distanceKm === null || t.distanceKm === undefined ? null : num(t.distanceKm);
  return {
    from: endOf(t.from),
    to: endOf(t.to),
    mode: text(t.mode ?? t.transportMode).toUpperCase(),
    transporterId: orNull(text(t.transporterId)),
    transporterName: orNull(text(t.transporterName)),
    transporterGstin: orNull(text(t.transporterGstin)),
    lrNo: orNull(text(t.lrNo)),
    lrDate: isoDateOf(t.lrDate) || null,
    distanceKm: distance,
  };
}

export function lineFromPayload(item: Json, sourceRefnos: Record<string, string>): DcDraftLine {
  const srcDocId = orNull(text(item.sdiSrcDocId));
  const srcRefno = orNull(text(item.sdiSrcDocRefno));
  if (srcDocId && srcRefno) sourceRefnos[srcDocId] = srcRefno;
  const factor = num(item.sdiToBaseFactor);
  return createDcLine({
    key: nextRowKey("line"),
    sdiId: orNull(text(item.sdiId)),
    itemId: text(item.sdiItemId),
    // A hold carries the names; /get does not — they are looked up display-only.
    itemName: text(item.sdiItemName),
    itemUnitId: text(item.sdiItemUnitId),
    unitName: text(item.sdiUnitName),
    godownName: orNull(text(item.sdiGodownName)),
    hsnCode: orNull(text(item.sdiHsnCode)),
    barcode: orNull(text(item.sdiEanCode)),
    priceLevel: num(item.sdiPriceLevel) || 1,
    remarks: orNull(text(item.sdiRemarks)),
    salesmanId: orNull(text(item.sdiSalesmanId)),
    schemeId: orNull(text(item.sdiSchemeId)),
    schemeName: orNull(text(item.sdiSchemeName)),
    srcDocType: orNull(text(item.sdiSrcDocType)),
    srcDocId,
    srcDocYear: orNull(text(item.sdiSrcDocAccYear)),
    srcDocRefno: srcRefno,
    srcLineId: orNull(text(item.sdiSrcItemId)),
    godownId: orNull(text(item.sdiGodownId)),
    lotId: orNull(text(item.sdiLotId)),
    bucket: text(item.sdiBucket),
    batchNo: orNull(text(item.sdiBatchNo)),
    batchDate: isoDateOf(item.sdiBatchDate) || null,
    expiryDate: isoDateOf(item.sdiExpiryDate) || null,
    serialNo: orNull(text(item.sdiSerialNo)),
    billedQty: num(item.sdiBilledQty),
    returnedQty: num(item.sdiReturnedQty),
    openQty: num(item.sdiOpenQty),
    lineStatus: orNull(text(item.sdiLineStatus)),
    isInclusiveTax: bool(item.sdiIsTaxIncl),
    schemeFlag: bool(item.sdiIsPromo),
    isFree: bool(item.sdiIsFree),
    isService: bool(item.sdiIsService),
    allowNegative: true,
    caseQty: num(item.sdiCaseQty),
    billQty: num(item.sdiDcQty),
    weight: num(item.sdiWeightQty),
    toBaseFactor: factor > 0 ? factor : 1,
    rate: num(item.sdiRate),
    actualPrice: num(item.sdiActPrice),
    mrp: num(item.sdiMaxPrice),
    minPrice: num(item.sdiMinPrice),
    costPrice: num(item.sdiCostPrice),
    discPerc: num(item.sdiItemDiscPerc),
    discAmt: num(item.sdiItemDiscAmt),
    splDiscPerc: num(item.sdiSplDiscPerc),
    splDiscAmt: num(item.sdiSplDiscAmt),
    schPerc: num(item.sdiSchDiscPerc),
    schAmt: num(item.sdiSchDiscAmt),
    gstPerc: num(item.sdiTaxPerc),
    cgstPerc: num(item.sdiCgstPerc),
    sgstPerc: num(item.sdiSgstPerc),
    igstPerc: num(item.sdiIgstPerc),
    cessPerc: num(item.sdiCessPerc),
    cessPerUnit: num(item.sdiCessPerUnit),
  });
}

/** Qt `deriveLoadedLocalSale`: the stored tax says which it was; else the place of supply. */
export function loadedLocalSale(h: Json, companyStateCode: string): boolean {
  const local = num(h.sdcCgstAmt) + num(h.sdcSgstAmt);
  const inter = num(h.sdcIgstAmt);
  if (local > 0 || inter > 0) {
    return local >= inter;
  }
  return text(h.sdcPosStcd) === companyStateCode;
}

export type LoadContext = {
  companyStateCode: string;
  /** The session's policy, for a header that stored none. */
  policy: VoucherPolicy;
  /** Opened from the list's Edit (Qt `openForEdit`). */
  openForEdit: boolean;
};

const statusOf = (value: unknown): DcStatus => {
  const upper = text(value).toUpperCase();
  return (DC_STATUSES as readonly string[]).includes(upper) ? (upper as DcStatus) : "DRAFT";
};

/** A `/get` (or `/create`) answer → the draft on screen. */
export function draftFromPayload(data: DcPayload, context: LoadContext): DcDraft {
  const h = data as Json;
  const sourceRefnos: Record<string, string> = {};
  const lines = (Array.isArray(data.items) ? data.items : [])
    .filter((item) => !bool(item.sdiIsDeleted))
    .map((item) => lineFromPayload(item, sourceRefnos));
  const srcDocId = orNull(text(h.sdcSrcDocId));
  if (srcDocId) sourceRefnos[srcDocId] = text(h.sdcSrcDocRefno);
  const posting = postingStateOf(h, lines);
  const purpose = text(h.sdcPurpose).toUpperCase() || DC_DEFAULT_PURPOSE;
  const header = emptyDcHeader(isoDateOf(h.sdcDcDate), {
    priceLevel: num(h.sdcPriceLevel) || 1,
    posStateCode: text(h.sdcPosStcd),
    posStateName: text(h.sdcStateName),
  });
  const discAlter = h.sdcDiscAlterBase;
  const roundStep = num(h.sdcRoundOffStep);
  const stateCode = text(h.sdcCustStcd) || text(h.sdcPosStcd);
  return {
    docId: orNull(text(h.sdcId)),
    companyId: text(h.sdcCompanyId),
    branchId: text(h.sdcBranchId),
    accYear: text(h.sdcAccYear),
    status: statusOf(h.sdcStatus),
    refno: text(h.sdcDcRefno),
    revisionNo: num(h.sdcRevisionNo),
    fulfilStatus: text(h.sdcFulfilStatus).toUpperCase(),
    mode: posting.documentEditable && context.openForEdit ? "entry" : "browse",
    amending: false,
    isDirty: false,
    header: {
      ...header,
      purpose,
      purposeLabel: purposeLabel(purpose),
      usrRefno: text(h.sdcUsrRefno),
      usrRefdate: isoDateOf(h.sdcUsrRefdate),
      remarks: text(h.sdcRemarks),
      // People: arrays on the wire (element 1 = primary), single pickers here.
      salesmanId: orNull(firstOf(h.sdcSalesmanId)),
      salesmanName: text(h.sdcSalesmanName),
      driverId: orNull(text(h.sdcDriverId)),
      driverName: text(h.sdcDriverName),
      loadmanId: orNull(firstOf(h.sdcLoadmanId)),
      loadmanName: text(h.sdcLoadmanName),
      vehicleNo: text(h.sdcVehicleNo),
      vehicleId: orNull(text(h.sdcVehicleId)),
    },
    customer: {
      ...emptyCustomer(),
      custId: orNull(text(h.sdcCustId)),
      name: text(h.sdcCustName),
      masterName: text(h.sdcCustName),
      address: orNull(text(h.sdcCustAddr)),
      place: orNull(text(h.sdcCustPlace)),
      pin: orNull(text(h.sdcCustPin)),
      phone: orNull(text(h.sdcCustPhone)),
      gstin: orNull(text(h.sdcCustGstin)),
      gstType: orNull(text(h.sdcCustGstType)),
      stateCode: orNull(stateCode),
      stateName: orNull(text(h.sdcStateName)),
    },
    billToUnlocked: false,
    isLocalSale: loadedLocalSale(h, context.companyStateCode),
    policy: {
      freightCalcType: text(h.sdcFreightCalcType) || context.policy.freightCalcType,
      loadingCalcType: text(h.sdcLoadingCalcType) || context.policy.loadingCalcType,
      discountAlterBaseRate: typeof discAlter === "boolean" ? discAlter : context.policy.discountAlterBaseRate,
      roundOffStep: roundStep > 0 ? roundStep : context.policy.roundOffStep,
    },
    source: srcDocId
      ? {
          docType: text(h.sdcSrcDocType) || DC_DEFAULT_SRC_DOC_TYPE,
          docId: srcDocId,
          accYear: orNull(text(h.sdcSrcDocAccYear)),
          refno: orNull(text(h.sdcSrcDocRefno)),
          date: isoDateOf(h.sdcSrcDocDate) || null,
        }
      : null,
    sourceRefnos,
    lines: withTrailingBlank(lines),
    transport: bandFromNested(data.transport),
    posting,
    storedTotals: {
      totItems: num(h.sdcTotItems),
      totQty: num(h.sdcTotBags),
      totWeight: num(h.sdcTotWeight),
      taxable: num(h.sdcTaxableAmt),
      tax: num(h.sdcTaxAmt),
      total: num(h.sdcDcAmt),
    },
    audit: {
      createdBy: orNull(text(h.sdcCreatedBy)),
      createdOn: orNull(text(h.sdcCreatedOn)),
      modifiedBy: orNull(text(h.sdcModifiedBy)),
      modifiedOn: orNull(text(h.sdcModifiedOn)),
    },
  };
}

/** Lines still waiting for their names — Qt's one display-only lookup per line on load. */
export function linesNeedingNames(draft: DcDraft): DcDraftLine[] {
  return itemLines(draft.lines).filter((line) => !line.itemName);
}
