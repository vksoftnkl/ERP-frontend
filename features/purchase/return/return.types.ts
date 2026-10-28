/**
 * Purchase Return — the wire shapes of `/purchase/returns/*` and
 * `/purchase/claims/*` (ERP server src/modules/purchase/return/purchase-return.ts)
 * and the screen's own draft. pg NUMERIC arrives as a STRING (Prisma Decimal
 * `toJSON`), so every money / qty field is read with `num()`.
 */
import type { ClaimParty, OutcomeText, ReturnKind } from "./return.constants";

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
  source: { id: string; accYear: string; refno: string; supplierId: string; supplierName: string | null; status: string };
  lines: ReturnSourceLine[];
};

/** `pur_return` as Prisma names it, plus the supplier's name. */
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
  prOurRef: string | null;
  prSupplierCnNo: string | null;
  prSupplierCnDate: string | null;
  prVehicleNo: string | null;
  prRemarks: string | null;
  prStatus: string;
  prReturnValue: Wire;
  prClaimValue: Wire;
  prItcReversed: Wire;
};

/** `pur_return_item` as Prisma names it, plus its unit / lot / claim figures. */
export type ReturnLineWire = {
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
  priClaimAgainst: string | null;
  priClaimPartyId: string | null;
  itemName?: string;
  unitName?: string;
  bucket: string | null;
  lotId: string | null;
  batchNo: string | null;
};

/** What save / get / cancel answer. */
export type ReturnPayload = {
  header: ReturnHeaderWire;
  lines: ReturnLineWire[];
};

export type SaveReturnLine = {
  lineNo: number;
  srcItemId: string;
  outcome: string;
  qty: number;
  bucket: string;
  lotId?: string;
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
    supplierCnNo?: string;
    supplierCnDate?: string;
    vehicleNo?: string;
    remarks?: string;
    post: boolean;
  };
  lines: SaveReturnLine[];
};

/** GET /purchase/claims/open — one claim row of a posted return. */
export type OpenClaimWire = {
  returnItemId: string;
  accYear: string;
  prId: string;
  refno: string;
  docDate: string | null;
  lineNo: number | string;
  itemName: string | null;
  outcome: string;
  claimAgainst: string | null;
  claimPartyId: string | null;
  partyName: string | null;
  supplierId: string;
  claimValue: Wire;
  settled: Wire;
  open: Wire;
  lastSettlementId: string | null;
};

export type SettleClaimBody = {
  returnItemId: string;
  accYear: string;
  deviceId: string;
  action: "CREDIT" | "SHORT_SETTLED" | "REJECTED";
  amount?: number;
  receivedAs?: "CN";
  cnNo?: string;
  reason?: string;
};

export type SettleUndoBody = { settlementId: string; accYear: string; reason: string };

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** One choice of the "Bill / GRN" box. */
export type SourceOption = { srcDocId: string; srcAccYear: string; label: string };

/** One row = one source line of the bill / GRN, one outcome. */
export type ReturnRow = {
  key: string;
  srcItemId: string;
  srcLineNo: string;
  itemName: string;
  unitName: string;
  batchNo: string;
  bucket: string;
  lotId: string;
  /** What can still go back of this source line; null when not known (a posted return). */
  returnable: number | null;
  /** As typed. */
  qty: string;
  outcome: OutcomeText;
  /** "" unless the outcome is a claim. */
  claimOn: ClaimParty | "";
  /** The bill's taxable per unit, 2 places (Qt shows and reads it so). */
  rate: number;
  gstPct: number;
  /** GST per unit, 6 places. */
  unitTax: number;
  /** The saved row's `priId`. */
  lineId: string;
  /** Previews until the server's come back with the saved return; null on a blank qty. */
  value: number | null;
  tax: number | null;
  total: number | null;
};

export type ServerTotals = { returnValue: number; claimValue: number; itcReversed: number };

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
  /** The "Bill / GRN" choices; a loaded return offers only its own. */
  sources: SourceOption[];
  /** "" = not asked yet, "loading", "ready". */
  sourcesState: "" | "loading" | "ready";
  /** srcItemId → the source line (with its lots): what Bucket offers and + copies. */
  srcLines: Record<string, ReturnSourceLine>;
  docDate: string;
  supplierCnNo: string;
  supplierCnDate: string;
  vehicleNo: string;
  remarks: string;
  claimPartyId: string;
  claimPartyName: string;
  rows: ReturnRow[];
  /** The saved return's own figures; dropped on the first edit (the preview takes over). */
  serverTotals: ServerTotals | null;
  hint: string;
  viewMode: "browse" | "entry";
  dirty: boolean;
};

export type DraftScope = { companyId: string; branchId: string; accYear: string; deviceId: string };

export type ClaimRow = {
  returnItemId: string;
  accYear: string;
  lastSettlementId: string;
  refno: string;
  /** dd/MM/yyyy. */
  date: string;
  lineNo: string;
  itemName: string;
  /** "Goods sent" / "Destroyed". */
  claim: string;
  /** "TRANSPORTER · Ravi Transport". */
  claimOn: string;
  value: number;
  settled: number;
  open: number;
};
