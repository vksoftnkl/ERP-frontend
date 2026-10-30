/**
 * Purchase Return — the wire shapes of `/purchase/returns/*` (ERP server
 * src/modules/purchase/return/purchase-return.ts) and the screen's own draft.
 * pg NUMERIC arrives as a STRING (Prisma Decimal `toJSON`), so every money /
 * qty field is read with `num()`.
 */
import type { PurchaseTransportBand } from "../shared/purchase-parts";
import type { ClaimParty, OutcomeCode, ReturnKind, ReturnSettlement } from "./return.constants";

type Wire = string | number | null | undefined;

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** GET /purchase/returns/sources — a supplier's posted bills (or GRNs), newest first, 60. */
export type ReturnSourceRow = {
  srcDocId: string;
  srcAccYear: string;
  refno: string;
  /** The supplier's invoice no (a bill) or the challan no (a GRN). */
  supplierRef: string | null;
  docDate: string | null;
  amount: Wire;
};

export type ReturnSourceLot = {
  lotId: string;
  bucket: string;
  godownId: string;
  batchNo: string | null;
  expiryDate: string | null;
  mrp: Wire;
  qty: Wire;
};

/** GET /purchase/returns/source-lines — one line of the bill / GRN. */
export type ReturnSourceLine = {
  srcItemId: string;
  lineNo: number | string;
  itemId: string;
  uomId: string;
  itemName?: string;
  unitName?: string;
  inQty: Wire;
  returnedQty: Wire;
  returnableQty: Wire;
  rate: Wire;
  gstPct: Wire;
  /** Taxable per billed unit, 4 places. */
  unitTaxable: Wire;
  /** Taxable + GST per billed unit, rounded per head. */
  unitTotal: Wire;
  lots: ReturnSourceLot[];
};

export type ReturnSourceLinesView = {
  source: {
    id: string;
    accYear: string;
    refno: string;
    supplierId: string;
    supplierName: string | null;
    status: string;
    posStcd?: string | null;
    supplierInvNo?: string | null;
  };
  lines: ReturnSourceLine[];
};

/** The OUTWARD transport band (txn_transport_detail) — the shared popup's band, no crew on a return. */
export type ReturnTransport = PurchaseTransportBand;

/** `pur_return` as Prisma names it, plus the names /get adds. */
export type ReturnHeaderWire = {
  prId: string;
  prCompanyId: string;
  prBranchId: string;
  prAccYear: string;
  prRefno: string;
  prDocDate: string | null;
  prKind: string;
  prSrcDocId: string;
  prSrcAccYear: string;
  prSupplierId: string;
  supplierName: string | null;
  prGodownId?: string | null;
  godownName?: string | null;
  prPosStcd?: string | null;
  placeOfSupply?: string | null;
  /** The source bill's refno (server-filled). */
  prOurRef: string | null;
  srcRefno?: string | null;
  /** The free-text "Our ref" typed on the return (header.ourRef on save). */
  prMemoRef?: string | null;
  prSupplierCnNo: string | null;
  prSupplierCnDate: string | null;
  prEwbNo?: string | null;
  prEwbDate?: string | null;
  prVehicleNo: string | null;
  prDriverName?: string | null;
  prRemarks: string | null;
  prSettlement?: string | null;
  prStatus: string;
  prReturnValue: Wire;
  prClaimValue: Wire;
  prItcReversed: Wire;
  /** The transporter / insurer of the first claim row that is not on the supplier. */
  claimPartyId?: string | null;
  claimPartyName?: string | null;
  transport?: ReturnTransport | null;
};

/** One leg of a row's posting, in words ("Dr Supplier (debit note) 236.00"). */
export type ReturnWrite = { drCr: string; head: string; amount: string | null };
export type ReturnCreditTo = { kind: string; name: string | null };

/** The facts /validate and /get both carry per row. */
export type ReturnRowFacts = {
  billedQty?: Wire;
  returnedQty?: Wire;
  returnableQty?: Wire;
  lotId?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  mrp?: Wire;
  reasonName?: string | null;
  creditTo?: ReturnCreditTo | null;
  writes?: ReturnWrite[];
};

/** `pur_return_item` as Prisma names it, plus its unit / lot / claim figures. */
export type ReturnLineWire = ReturnRowFacts & {
  priId: string;
  priLineNo: number;
  priSrcItemId: string;
  priSrcDocLineNo: number | string | null;
  priOutcome: string;
  priQty: Wire;
  priFreeQty: Wire;
  priTaxableAmt: Wire;
  priCgstAmt: Wire;
  priSgstAmt: Wire;
  priIgstAmt: Wire;
  priCessAmt: Wire;
  priTotalAmt: Wire;
  priGstPct: Wire;
  priReasonId?: string | null;
  priClaimAgainst: string | null;
  priClaimPartyId: string | null;
  outcomeText?: string | null;
  itemName?: string;
  unitName?: string;
  bucket: string | null;
};

/** The six cells of the strip (validate and get). Decimals as strings. */
export type ReturnTotalsWire = {
  rows: number;
  returnNow: Wire;
  claimsRaised: Wire;
  replaceQtyBase: Wire;
  itcReversed: Wire;
  itcOnDestroyed: Wire;
  itcPendingOnReplace: Wire;
  goodsValue: Wire;
  supplierBalance: Wire;
  supplierBalanceNow: Wire;
};

/** A WARN or REFUSE line of the strip. */
export type ReturnIssue = {
  code: string;
  message: string;
  level?: string;
  field?: string | null;
  lineNo?: number | null;
};

/** What save / get / cancel answer. */
export type ReturnPayload = {
  header: ReturnHeaderWire;
  lines: ReturnLineWire[];
  totals?: ReturnTotalsWire;
  warnings?: ReturnIssue[];
  refusals?: ReturnIssue[];
};

/** One /validate row — in the order the body sent them. */
export type ReturnValidateLine = ReturnRowFacts & {
  lineNo: number;
  srcItemId: string;
  srcLineNo?: number | string;
  outcome: string;
  outcomeText?: string;
  reasonId?: string | null;
  taxable: Wire;
  tax: Wire;
  total: Wire;
};

export type ReturnValidateAnswer = {
  header: { supplierId?: string; supplierName?: string | null; srcRefno?: string; godownId?: string | null; placeOfSupply?: string | null };
  lines: ReturnValidateLine[];
  totals: ReturnTotalsWire;
  warnings: ReturnIssue[];
  refusals: ReturnIssue[];
};

/** GET /stock/reasons/list — one reason (only the fields the screen reads). */
export type StockReasonWire = {
  srmId: string;
  code?: string;
  name: string;
  allowedTxnTypes?: string[];
  isActive?: boolean;
};

export type SaveReturnLine = {
  lineNo: number;
  srcItemId: string;
  outcome: OutcomeCode;
  qty: number;
  bucket: string;
  lotId?: string;
  reasonId?: string;
  claimAgainst?: ClaimParty;
  claimPartyId?: string;
};

export type SaveReturnBody = {
  header: {
    prId?: string;
    companyId: string;
    branchId: string;
    accYear: string;
    deviceId: string;
    kind: ReturnKind;
    srcDocId: string;
    srcAccYear: string;
    docDate: string;
    godownId?: string;
    supplierCnNo?: string;
    supplierCnDate?: string;
    vehicleNo?: string;
    driverName?: string;
    ewbNo?: string;
    ewbDate?: string;
    remarks?: string;
    /** Always sent: blank / null clears it (pr_memo_ref). */
    ourRef: string | null;
    /** Sent only once the popup changed it: omitted keeps the saved band, null removes it. */
    transport?: ReturnTransport | null;
    settlement: ReturnSettlement;
    post: boolean;
  };
  lines: SaveReturnLine[];
};

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** One choice of the Bill field / the From bill picker. */
export type SourceOption = {
  srcDocId: string;
  srcAccYear: string;
  /** "PUR/… · INV-55" — the field's words. */
  label: string;
  /** "PUR/… · INV-55 · 05/10/2026 · 2,360.00" — the picker's words. */
  detail: string;
};

/** One row = one source line of the bill / GRN, one outcome. */
export type ReturnRow = {
  key: string;
  srcItemId: string;
  srcLineNo: string;
  itemName: string;
  unitName: string;
  batchNo: string;
  /** ISO date or "". */
  expiryDate: string;
  mrp: string;
  bucket: string;
  lotId: string;
  /** The source line's billed qty (the server's billedQty); "" until it is known. */
  billed: string;
  /** What earlier returns took of this source line; null when not known. */
  returned: number | null;
  /** What can still go back of this source line; null when not known. */
  returnable: number | null;
  /** As typed. */
  qty: string;
  outcome: OutcomeCode;
  /** "" unless the outcome is a claim. */
  claimOn: ClaimParty | "";
  reasonId: string;
  reasonName: string;
  /** The bill's taxable per unit, 2 places. */
  rate: number;
  gstPct: number;
  /** GST per unit, 6 places. */
  unitTax: number;
  /** The saved row's `priId`. */
  lineId: string;
  /** Previews until the server's figures come; null on a blank qty. */
  value: number | null;
  tax: number | null;
  total: number | null;
  /** The server's words: who is credited (tooltip) and the legs (tooltip). */
  creditName: string;
  writesTip: string;
};

export type ReturnTotals = {
  rows: number;
  returnNow: number;
  claimsRaised: number;
  replaceQtyBase: number;
  itcReversed: number;
  itcOnDestroyed: number;
  itcPendingOnReplace: number;
  goodsValue: number;
  supplierBalance: number;
  supplierBalanceNow: number;
};

export type ReturnDraft = {
  prId: string;
  refno: string;
  status: string;
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  supplierId: string;
  supplierName: string;
  kind: ReturnKind;
  srcDocId: string;
  srcAccYear: string;
  /** The Bill field's choices; a loaded return offers only its own. */
  sources: SourceOption[];
  /** "" = not asked yet, "loading", "ready". */
  sourcesState: "" | "loading" | "ready";
  /** srcItemId → the source line (with its lots): what Bucket / F12 offer and + copies. */
  srcLines: Record<string, ReturnSourceLine>;
  docDate: string;
  godownId: string;
  godownName: string;
  /** The bill's state code (place of supply). */
  posStcd: string;
  ourRef: string;
  supplierCnNo: string;
  supplierCnDate: string;
  ewbNo: string;
  ewbDate: string;
  vehicleNo: string;
  driverName: string;
  remarks: string;
  /** The OUTWARD band as the popup edits it; null = none. */
  transport: ReturnTransport | null;
  /** Send `transport` (omitted = the saved band is kept). */
  transportTouched: boolean;
  claimPartyId: string;
  claimPartyName: string;
  settlement: ReturnSettlement;
  /** The operator (or the saved return) set it; the branch default no longer moves it. */
  settlementChosen: boolean;
  rows: ReturnRow[];
  /** The server's six totals (validate while keying, get after); null = nothing to show. */
  totals: ReturnTotals | null;
  warnings: ReturnIssue[];
  refusals: ReturnIssue[];
  /** Bumped on every edit that /validate must see; an answer to an older one is dropped. */
  calcSeq: number;
  hint: string;
  viewMode: "browse" | "entry";
  dirty: boolean;
};

export type DraftScope = { companyId: string; branchId: string; accYear: string; deviceId: string };

/** One Reason choice (the PURCHASE_RETURN set). */
export type ReasonOption = { id: string; name: string };
