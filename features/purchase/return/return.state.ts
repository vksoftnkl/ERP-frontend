/**
 * Purchase Return — every rule of the screen, pure (the Qt
 * `PurchaseReturnEntry`, NexERP 2026-10-29 rebuild to
 * purchase_return_ui_mockup.png). The view and the hook only wire these up;
 * `purchaseReturnReducer` is the one way the draft changes.
 *
 * A row is one source line of the bill / GRN with ONE outcome. + on a row
 * copies its source line into a second row for another outcome. Every figure is
 * the server's: `/purchase/returns/validate` while keying (debounced), `/get`
 * after. qty × the bill's per-unit figures is only a preview until it answers.
 */
import { toDateInput } from "@/features/sales/quotation/quotation.utils";
import { isoToDisplayDate } from "@/lib/date-format";
import type { PurchaseStripCell } from "../shared/components/purchase-parts";
import { money, num, qtyText, text } from "../shared/purchase.format";
import {
  BUCKET_SALEABLE,
  CLAIM_PARTIES,
  CLAIM_PARTY_TEXT,
  EWB_NEEDED_CODE,
  OUTCOME_CODES,
  OUTCOME_TEXT,
  type ClaimParty,
  type OutcomeCode,
  type ReturnKind,
  type ReturnSettlement,
} from "./return.constants";
import type {
  DraftScope,
  ReasonOption,
  ReturnDraft,
  ReturnIssue,
  ReturnPayload,
  ReturnRow,
  ReturnRowFacts,
  ReturnSourceLine,
  ReturnSourceRow,
  ReturnTotals,
  ReturnTotalsWire,
  ReturnTransport,
  ReturnValidateAnswer,
  ReturnWrite,
  SaveReturnBody,
  SaveReturnLine,
  SourceOption,
  StockReasonWire,
} from "./return.types";

// ---------------------------------------------------------------------------
// Small rules
// ---------------------------------------------------------------------------

let keySeq = 0;
/** A row key unique for the tab's life. */
export function newRowKey(): string {
  keySeq += 1;
  return `pr-${Date.now().toString(36)}-${keySeq}`;
}

/** Any spelling of an outcome → its code: CLAIM_SENT, "CLAIM SENT", "Claim — goods sent". Unknown → RETURN. */
export function outcomeCodeOf(value: string): OutcomeCode {
  const raw = text(value);
  for (const code of OUTCOME_CODES) {
    if (raw === OUTCOME_TEXT[code]) {
      return code;
    }
  }
  const upper = raw.toUpperCase().replace(/ /g, "_");
  return (OUTCOME_CODES as readonly string[]).includes(upper) ? (upper as OutcomeCode) : "RETURN";
}

export function isClaim(outcome: string): boolean {
  return outcome.startsWith("CLAIM");
}

function asParty(value: unknown): ClaimParty | "" {
  const party = text(value).toUpperCase();
  return (CLAIM_PARTIES as readonly string[]).includes(party) ? (party as ClaimParty) : "";
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** The typed qty as a number; blank / junk is 0. */
export function rowQty(row: ReturnRow): number {
  return num(row.qty);
}

export function isEditable(draft: ReturnDraft): boolean {
  return draft.status === "DRAFT" && draft.viewMode === "entry";
}

/** A new return still picks its supplier and source; a saved draft keeps them (Qt `applyStatus`). */
export function isFresh(draft: ReturnDraft): boolean {
  return isEditable(draft) && !draft.prId;
}

/** Outcome choices: a return against a GRN (not billed yet) is Return only. */
export function outcomeChoices(kind: ReturnKind): readonly OutcomeCode[] {
  return kind === "AGAINST_GRN" ? ["RETURN"] : OUTCOME_CODES;
}

/** The holdings the source line brought goods into — what the row may leave from. */
export function bucketChoices(draft: ReturnDraft, row: ReturnRow): string[] {
  const buckets: string[] = [];
  for (const lot of draft.srcLines[row.srcItemId]?.lots ?? []) {
    const bucket = text(lot.bucket);
    if (bucket && !buckets.includes(bucket)) {
      buckets.push(bucket);
    }
  }
  if (row.bucket && !buckets.includes(row.bucket)) {
    buckets.unshift(row.bucket);
  }
  return buckets;
}

/** "SX1025 · 15/02/27" / "— · —" — the Batch · Exp cell (Qt `display`). */
export function batchExpText(row: Pick<ReturnRow, "batchNo" | "expiryDate">): string {
  const iso = toDateInput(row.expiryDate);
  let exp = "—";
  if (iso) {
    const [year, month, day] = iso.split("-");
    exp = `${day}/${month}/${year.slice(2)}`;
  }
  return `${row.batchNo || "—"} · ${exp}`;
}

/** "Dr Supplier (debit note) 236.00\nCr Stock (lot cost)\n…" — the server's writes[] in words. */
export function writesTipOf(writes: readonly ReturnWrite[] | undefined): string {
  return (writes ?? [])
    .map((w) => {
      const dc = text(w.drCr) === "DR" ? "Dr" : "Cr";
      return w.amount === null || w.amount === undefined ? `${dc} ${text(w.head)}` : `${dc} ${text(w.head)} ${money(num(w.amount))}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

/** Value / Tax / Total from qty × the per-unit figures — a preview until the server's come. */
export function recalcRow(row: ReturnRow): ReturnRow {
  const qty = rowQty(row);
  if (!(qty > 0)) {
    return { ...row, value: null, tax: null, total: null };
  }
  const value = qty * row.rate;
  const tax = qty * row.unitTax;
  return { ...row, value, tax, total: value + tax };
}

/**
 * The first lot of the source line in the row's bucket — in the header
 * godown when one is picked, else the first anywhere (Qt `pickLot`).
 */
export function pickLot(srcLines: ReturnDraft["srcLines"], row: ReturnRow, godownId: string): ReturnRow {
  let first: ReturnSourceLine["lots"][number] | null = null;
  for (const lot of srcLines[row.srcItemId]?.lots ?? []) {
    if (text(lot.bucket) !== row.bucket) {
      continue;
    }
    if (godownId && text(lot.godownId) !== godownId) {
      first ??= lot;
      continue;
    }
    first = lot;
    break;
  }
  return {
    ...row,
    lotId: text(first?.lotId),
    batchNo: text(first?.batchNo),
    expiryDate: text(first?.expiryDate),
    mrp: text(first?.mrp),
  };
}

/** Batches · F12 — the picked lot becomes the row's (its bucket, batch, expiry, MRP). */
export function setRowLot(srcLines: ReturnDraft["srcLines"], row: ReturnRow, lotId: string): ReturnRow {
  const lot = (srcLines[row.srcItemId]?.lots ?? []).find((candidate) => text(candidate.lotId) === lotId);
  if (!lot) {
    return row;
  }
  return {
    ...row,
    bucket: text(lot.bucket),
    lotId,
    batchNo: text(lot.batchNo),
    expiryDate: text(lot.expiryDate),
    mrp: text(lot.mrp),
  };
}

/** A fresh row off a source line: qty blank, Return, SALEABLE unless the line brought none (Qt `fillRow`). */
export function rowFromSource(
  srcLines: ReturnDraft["srcLines"],
  line: ReturnSourceLine,
  godownId: string,
  billed = "",
  key = newRowKey(),
): ReturnRow {
  const lots = line.lots ?? [];
  let bucket = BUCKET_SALEABLE;
  if (!lots.some((lot) => text(lot.bucket) === BUCKET_SALEABLE) && lots.length > 0) {
    bucket = text(lots[0].bucket);
  }
  const unitTaxable = num(line.unitTaxable);
  const row: ReturnRow = {
    key,
    srcItemId: line.srcItemId,
    srcLineNo: text(line.lineNo),
    itemName: text(line.itemName),
    unitName: text(line.unitName),
    batchNo: "",
    expiryDate: "",
    mrp: "",
    bucket,
    lotId: "",
    billed,
    returned: num(line.returnedQty),
    returnable: num(line.returnableQty),
    qty: "",
    outcome: "RETURN",
    claimOn: "",
    reasonId: "",
    reasonName: "",
    rate: round(unitTaxable, 2),
    gstPct: num(line.gstPct),
    unitTax: round(num(line.unitTotal) - unitTaxable, 6),
    lineId: "",
    value: null,
    tax: null,
    total: null,
    creditName: "",
    writesTip: "",
  };
  return pickLot(srcLines, row, godownId);
}

/** The server's facts on a row (validate or get): billed / returned / lot / money / words. */
function withFacts(row: ReturnRow, facts: ReturnRowFacts & { taxable?: unknown; tax?: unknown; total?: unknown }): ReturnRow {
  const next = { ...row };
  if (facts.billedQty !== undefined && facts.billedQty !== null) {
    next.billed = qtyText(num(facts.billedQty));
  }
  if (facts.returnedQty !== undefined && facts.returnedQty !== null) {
    next.returned = num(facts.returnedQty);
  }
  if (facts.returnableQty !== undefined && facts.returnableQty !== null) {
    next.returnable = num(facts.returnableQty);
  }
  if (facts.taxable !== undefined) {
    next.value = num(facts.taxable);
    next.tax = num(facts.tax);
    next.total = num(facts.total);
  }
  if (facts.lotId !== undefined) {
    next.lotId = text(facts.lotId);
    next.batchNo = text(facts.batchNo);
    next.expiryDate = text(facts.expiryDate);
    next.mrp = text(facts.mrp);
  }
  if (facts.creditTo) {
    next.creditName = text(facts.creditTo.name);
  }
  if (facts.writes) {
    next.writesTip = writesTipOf(facts.writes);
  }
  return next;
}

/**
 * Credit to / Writes in the mockup's words, from the outcome (Qt
 * `refreshConsequence`); the server's own words are the tooltips. The tones:
 * a claim's Credit to amber, Replace's blue; destroyed's Writes red.
 */
export function consequenceOf(
  kind: ReturnKind,
  row: ReturnRow,
): { creditTo: string; writes: string; creditTone: "" | "warn" | "info"; writesTone: "bad" | "muted" } {
  const o = row.outcome;
  if (kind === "AGAINST_GRN") {
    return { creditTo: "GRN clearing (no bill yet)", writes: "Dr GRNI / Cr Stk", creditTone: "", writesTone: "muted" };
  }
  if (o === "CLAIM_SENT" || o === "CLAIM_DESTROYED") {
    return {
      creditTo: CLAIM_PARTY_TEXT[row.claimOn || "SUPPLIER"],
      writes: o === "CLAIM_SENT" ? "Dr Claim / Cr Stk" : "ITC reversed",
      creditTone: "warn",
      writesTone: o === "CLAIM_DESTROYED" ? "bad" : "muted",
    };
  }
  if (o === "REPLACE") {
    const q = rowQty(row);
    return { creditTo: "— (shortage row)", writes: q > 0 ? `Replace due ${qtyText(q)}` : "Replace due", creditTone: "info", writesTone: "muted" };
  }
  return { creditTo: "Supplier now", writes: "Dr Sup / Cr Stk", creditTone: "", writesTone: "muted" };
}

/** Credit to choices on a claim row (it picks who the claim is on). */
export const CLAIM_CREDIT_CHOICES: readonly { value: ClaimParty; label: string }[] = CLAIM_PARTIES.map((party) => ({
  value: party,
  label: CLAIM_PARTY_TEXT[party],
}));

/** Claim on (not a mockup field): shown while a claim row is on a transporter / insurer, or a party is named. */
export function claimOnNeeded(draft: ReturnDraft): boolean {
  return (
    Boolean(draft.claimPartyId) ||
    draft.rows.some((row) => row.srcItemId && isClaim(row.outcome) && row.claimOn !== "" && row.claimOn !== "SUPPLIER")
  );
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export const START_HINT = "Pick the supplier, then the bill the goods came on (Ctrl+L).";
export const LINES_HINT = "Type the qty going back and pick the outcome. + on a row splits that line into another outcome.";
export const NOTHING_LEFT_HINT = "Everything on that document has already gone back.";

/** ADVANCE stays ADVANCE; anything else (ADJUST, CASH, blank) is set off — the server's default. */
export function settlementOf(value: unknown): ReturnSettlement {
  return text(value).toUpperCase() === "ADVANCE" ? "ADVANCE" : "ADJUST";
}

/** What a NEW return starts with: purchase.return_settlement_default, CASH read as ADJUST. */
export function settlementDefaultOf(setting: string | null | undefined): ReturnSettlement {
  return settlementOf(setting);
}

export function createDraft(scope: DraftScope, docDate: string, settlement: ReturnSettlement = "ADJUST"): ReturnDraft {
  return {
    prId: "",
    refno: "",
    status: "DRAFT",
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear,
    deviceId: scope.deviceId,
    supplierId: "",
    supplierName: "",
    kind: "AGAINST_INVOICE",
    srcDocId: "",
    srcAccYear: "",
    sources: [],
    sourcesState: "",
    srcLines: {},
    docDate,
    godownId: "",
    godownName: "",
    posStcd: "",
    ourRef: "",
    supplierCnNo: "",
    supplierCnDate: "",
    ewbNo: "",
    ewbDate: "",
    vehicleNo: "",
    driverName: "",
    remarks: "",
    transport: null,
    transportTouched: false,
    claimPartyId: "",
    claimPartyName: "",
    settlement,
    settlementChosen: false,
    rows: [],
    totals: null,
    warnings: [],
    refusals: [],
    calcSeq: 0,
    hint: START_HINT,
    viewMode: "entry",
    dirty: false,
  };
}

/** One source row → the Bill field's words and the picker's (Qt "refno · supplierRef · dd/MM/yyyy · amount"). */
export function sourceOptionOf(row: ReturnSourceRow): SourceOption {
  const date = isoToDisplayDate(toDateInput(row.docDate));
  const label = [text(row.refno), text(row.supplierRef)].filter(Boolean).join(" · ");
  return {
    srcDocId: row.srcDocId,
    srcAccYear: text(row.srcAccYear),
    label,
    detail: [text(row.refno), text(row.supplierRef), date, money(num(row.amount))].join(" · "),
  };
}

export function totalsOf(wire: ReturnTotalsWire | null | undefined): ReturnTotals | null {
  if (!wire) {
    return null;
  }
  return {
    rows: Number(wire.rows) || 0,
    returnNow: num(wire.returnNow),
    claimsRaised: num(wire.claimsRaised),
    replaceQtyBase: num(wire.replaceQtyBase),
    itcReversed: num(wire.itcReversed),
    itcOnDestroyed: num(wire.itcOnDestroyed),
    itcPendingOnReplace: num(wire.itcPendingOnReplace),
    goodsValue: num(wire.goodsValue),
    supplierBalance: num(wire.supplierBalance),
    supplierBalanceNow: num(wire.supplierBalanceNow),
  };
}

/** Read a saved return onto the screen (Qt `applyLoaded`). */
export function draftFromPayload(scope: DraftScope, payload: ReturnPayload, viewMode: "browse" | "entry"): ReturnDraft {
  const h = payload.header;
  const srcDocId = text(h.prSrcDocId);
  const srcAccYear = text(h.prSrcAccYear);
  const status = text(h.prStatus).toUpperCase() || "DRAFT";
  const rows: ReturnRow[] = (payload.lines ?? []).map((line) => {
    const qty = num(line.priQty);
    const tax = num(line.priCgstAmt) + num(line.priSgstAmt) + num(line.priIgstAmt) + num(line.priCessAmt);
    const outcome = outcomeCodeOf(text(line.priOutcome));
    const base: ReturnRow = {
      key: newRowKey(),
      srcItemId: text(line.priSrcItemId),
      srcLineNo: text(line.priSrcDocLineNo),
      itemName: text(line.itemName),
      unitName: text(line.unitName),
      batchNo: "",
      expiryDate: "",
      mrp: "",
      bucket: text(line.bucket),
      lotId: "",
      billed: "",
      returned: null,
      returnable: null,
      qty: qtyText(qty + num(line.priFreeQty)),
      outcome,
      claimOn: isClaim(outcome) ? asParty(line.priClaimAgainst) || "SUPPLIER" : "",
      reasonId: text(line.priReasonId),
      reasonName: text(line.reasonName),
      rate: qty > 0 ? round(num(line.priTaxableAmt) / qty, 2) : 0,
      gstPct: num(line.priGstPct),
      unitTax: qty > 0 ? round(tax / qty, 6) : 0,
      lineId: text(line.priId),
      value: null,
      tax: null,
      total: null,
      creditName: "",
      writesTip: "",
    };
    return withFacts(base, { ...line, taxable: line.priTaxableAmt, tax, total: line.priTotalAmt });
  });
  const srcRef = text(h.srcRefno) || text(h.prOurRef);
  return {
    ...createDraft(
      {
        companyId: text(h.prCompanyId) || scope.companyId,
        branchId: text(h.prBranchId) || scope.branchId,
        accYear: text(h.prAccYear) || scope.accYear,
        deviceId: scope.deviceId,
      },
      toDateInput(h.prDocDate),
    ),
    prId: text(h.prId),
    refno: text(h.prRefno),
    status,
    supplierId: text(h.prSupplierId),
    supplierName: text(h.supplierName),
    kind: text(h.prKind) === "AGAINST_GRN" ? "AGAINST_GRN" : "AGAINST_INVOICE",
    srcDocId,
    srcAccYear,
    sources: srcDocId ? [{ srcDocId, srcAccYear, label: srcRef || srcDocId, detail: srcRef || srcDocId }] : [],
    sourcesState: "ready",
    godownId: text(h.prGodownId),
    godownName: text(h.godownName),
    posStcd: text(h.placeOfSupply) || text(h.prPosStcd),
    ourRef: text(h.prMemoRef),
    supplierCnNo: text(h.prSupplierCnNo),
    supplierCnDate: toDateInput(h.prSupplierCnDate),
    ewbNo: text(h.prEwbNo),
    ewbDate: toDateInput(h.prEwbDate),
    vehicleNo: text(h.prVehicleNo),
    driverName: text(h.prDriverName),
    remarks: text(h.prRemarks),
    transport: h.transport ?? null,
    transportTouched: false,
    claimPartyId: text(h.claimPartyId),
    claimPartyName: text(h.claimPartyName),
    settlement: settlementOf(h.prSettlement),
    settlementChosen: true,
    rows,
    totals: totalsOf(payload.totals),
    warnings: payload.warnings ?? [],
    refusals: payload.refusals ?? [],
    hint:
      status === "DRAFT"
        ? `Draft ${text(h.prRefno)} — change the rows and Save, or Post (Ctrl+Enter).`
        : status === "POSTED"
          ? `${text(h.prRefno)} is posted. Claims on it are settled on Supplier dues.`
          : `${text(h.prRefno)} is cancelled.`,
    viewMode: status === "DRAFT" ? viewMode : "browse",
    dirty: false,
  };
}

/** GET /stock/reasons/list → the PURCHASE_RETURN set, active only (Qt `loadReasons`). */
export function returnReasonsOf(rows: readonly StockReasonWire[]): ReasonOption[] {
  return rows
    .filter((row) => row.isActive !== false && (row.allowedTxnTypes ?? []).includes("PURCHASE_RETURN"))
    .map((row) => ({ id: text(row.srmId), name: text(row.name) }));
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export type HeaderPatch = Partial<
  Pick<
    ReturnDraft,
    "docDate" | "ourRef" | "supplierCnNo" | "supplierCnDate" | "ewbNo" | "ewbDate" | "vehicleNo" | "driverName" | "remarks" | "settlement"
  >
>;

export type ReturnAction =
  | { type: "reset"; scope: DraftScope; docDate: string; settlement?: ReturnSettlement }
  | { type: "loaded"; scope: DraftScope; payload: ReturnPayload; viewMode: "browse" | "entry" }
  | { type: "setSupplier"; id: string; name: string }
  | { type: "setKind"; kind: ReturnKind }
  | { type: "sourcesLoaded"; supplierId: string; kind: ReturnKind; rows: readonly ReturnSourceRow[] }
  | {
      type: "sourceLinesLoaded";
      srcDocId: string;
      srcAccYear: string;
      lines: readonly ReturnSourceLine[];
      /** The document's own words ("PUR/… · INV-55"), offered when the supplier's list does not carry it. */
      label?: string;
      posStcd?: string;
    }
  /** purchase.return_settlement_default arrived: a new return the operator has not set follows it. */
  | { type: "settlementDefault"; settlement: ReturnSettlement }
  | { type: "setHeader"; patch: HeaderPatch }
  | { type: "setGodown"; id: string; name: string }
  /** The name of the godown the server picked (it answers an id only). */
  | { type: "godownNamed"; id: string; name: string }
  | { type: "setTransport"; band: ReturnTransport | null }
  | { type: "setClaimParty"; id: string; name: string }
  | { type: "editQty"; key: string; raw: string }
  | { type: "editOutcome"; key: string; outcome: OutcomeCode }
  | { type: "editBucket"; key: string; bucket: string }
  | { type: "editClaimOn"; key: string; claimOn: ClaimParty }
  | { type: "editReason"; key: string; reasonId: string; reasonName: string }
  | { type: "setLot"; key: string; lotId: string }
  | { type: "splitRow"; key: string; newKey?: string }
  | { type: "removeRow"; key: string }
  /** The quiet /validate before anything is typed: srcItemId → billedQty (Qt `primeBilled`). */
  | { type: "billedPrimed"; srcDocId: string; billed: Readonly<Record<string, string>> }
  /** /validate answered the body of `seq`; `sentKeys` are the rows it carried, in order. */
  | { type: "validated"; seq: number; sentKeys: readonly string[]; answer: ReturnValidateAnswer }
  /** /validate refused (a 4xx): its errors on the strip, the last warnings kept. */
  | { type: "validateRefused"; seq: number; errors: readonly ReturnIssue[]; hint: string }
  /** Nothing to ask /validate (no qty typed): the strip and the totals clear. */
  | { type: "calcCleared" }
  /** A refused save / post: its errors join the strip. */
  | { type: "refused"; errors: readonly ReturnIssue[]; hint: string }
  | { type: "beginEdit" }
  | { type: "setHint"; hint: string };

/** An edit /validate must see: dirty, the server's word on the rows is stale. */
function touched(draft: ReturnDraft, patch: Partial<ReturnDraft>): ReturnDraft {
  return { ...draft, ...patch, dirty: true, calcSeq: draft.calcSeq + 1 };
}

function editRow(draft: ReturnDraft, key: string, change: (row: ReturnRow) => ReturnRow): ReturnDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  let changed = false;
  const rows = draft.rows.map((row) => {
    if (row.key !== key || !row.srcItemId) {
      return row;
    }
    changed = true;
    return change(row);
  });
  return changed ? touched(draft, { rows }) : draft;
}

/** The picked source stays a choice of the box, whatever list came back. */
function keepPicked(draft: ReturnDraft, sources: SourceOption[], label?: string): SourceOption[] {
  if (!draft.srcDocId || sources.some((option) => option.srcDocId === draft.srcDocId && option.srcAccYear === draft.srcAccYear)) {
    return sources;
  }
  const known = draft.sources.find((option) => option.srcDocId === draft.srcDocId && option.srcAccYear === draft.srcAccYear);
  const words = label || draft.srcDocId;
  const picked = known ?? { srcDocId: draft.srcDocId, srcAccYear: draft.srcAccYear, label: words, detail: words };
  return [picked, ...sources];
}

/** The source changes: the rows and the source go, the supplier stays. */
function clearSource(draft: ReturnDraft): ReturnDraft {
  return {
    ...draft,
    srcDocId: "",
    srcAccYear: "",
    srcLines: {},
    rows: [],
    totals: null,
    warnings: [],
    refusals: [],
    posStcd: "",
    calcSeq: draft.calcSeq + 1,
  };
}

export function purchaseReturnReducer(draft: ReturnDraft, action: ReturnAction): ReturnDraft {
  switch (action.type) {
    case "reset":
      return { ...createDraft(action.scope, action.docDate, action.settlement), calcSeq: draft.calcSeq + 1 };
    case "loaded":
      return { ...draftFromPayload(action.scope, action.payload, action.viewMode), calcSeq: draft.calcSeq + 1 };
    case "setSupplier": {
      if (!isFresh(draft) || action.id === draft.supplierId) {
        return draft;
      }
      return {
        ...clearSource(draft),
        supplierId: action.id,
        supplierName: action.name,
        sources: [],
        sourcesState: action.id ? "loading" : "",
        hint: START_HINT,
        dirty: true,
      };
    }
    case "setKind": {
      if (!isFresh(draft) || action.kind === draft.kind) {
        return draft;
      }
      return { ...clearSource(draft), kind: action.kind, sources: [], sourcesState: draft.supplierId ? "loading" : "", dirty: true };
    }
    case "sourcesLoaded":
      // An answer for a supplier / kind the screen has since left is dropped.
      if (action.supplierId !== draft.supplierId || action.kind !== draft.kind || !isFresh(draft)) {
        return draft;
      }
      return { ...draft, sources: keepPicked(draft, action.rows.map(sourceOptionOf)), sourcesState: "ready" };
    case "sourceLinesLoaded": {
      if (draft.status !== "DRAFT") {
        return draft;
      }
      const srcLines: ReturnDraft["srcLines"] = {};
      for (const line of action.lines) {
        srcLines[line.srcItemId] = line;
      }
      // A reopened draft keeps its own rows; only Returned / Can return are refreshed (net of this draft).
      const keepRows = Boolean(draft.prId) && action.srcDocId === draft.srcDocId;
      // The godown the goods leave from: the one the bill brought them into (changeable).
      let godownId = draft.godownId;
      let godownName = draft.godownName;
      if (!keepRows && !godownId) {
        const firstLot = action.lines.find((line) => num(line.returnableQty) > 0 && (line.lots ?? []).length > 0)?.lots[0];
        if (firstLot) {
          godownId = text(firstLot.godownId);
          godownName = "";
        }
      }
      const rows = keepRows
        ? draft.rows.map((row) => {
            const line = srcLines[row.srcItemId];
            return line ? { ...row, returnable: num(line.returnableQty), returned: num(line.returnedQty) } : row;
          })
        : action.lines.filter((line) => num(line.returnableQty) > 0).map((line) => rowFromSource(srcLines, line, godownId));
      const picked = { ...draft, srcDocId: action.srcDocId, srcAccYear: action.srcAccYear };
      return {
        ...picked,
        sources: keepPicked(picked, draft.sources, action.label),
        srcLines,
        rows,
        godownId,
        godownName,
        posStcd: action.posStcd !== undefined && action.posStcd !== "" ? action.posStcd : draft.posStcd,
        totals: keepRows ? draft.totals : null,
        hint: keepRows ? draft.hint : rows.length > 0 ? LINES_HINT : NOTHING_LEFT_HINT,
        dirty: keepRows ? draft.dirty : true,
        calcSeq: draft.calcSeq + 1,
      };
    }
    case "setHeader": {
      if (!isEditable(draft)) {
        return draft;
      }
      const next = touched(draft, action.patch);
      return { ...next, settlementChosen: draft.settlementChosen || action.patch.settlement !== undefined };
    }
    case "settlementDefault":
      if (draft.prId || draft.settlementChosen || draft.status !== "DRAFT" || draft.settlement === action.settlement) {
        return draft;
      }
      return { ...draft, settlement: action.settlement };
    case "setGodown": {
      if (!isEditable(draft)) {
        return draft;
      }
      // Each row's lot is taken in the new godown (Qt: the server re-picks on /validate; the preview follows).
      const rows = draft.rows.map((row) => (row.srcItemId ? pickLot(draft.srcLines, row, action.id) : row));
      return touched(draft, { godownId: action.id, godownName: action.name, rows });
    }
    case "godownNamed":
      return draft.godownId === action.id && !draft.godownName ? { ...draft, godownName: action.name } : draft;
    case "setTransport":
      if (!isEditable(draft)) {
        return draft;
      }
      return { ...draft, transport: action.band, transportTouched: true, dirty: true };
    case "setClaimParty":
      if (!isEditable(draft)) {
        return draft;
      }
      return touched(draft, { claimPartyId: action.id, claimPartyName: action.name });
    case "editQty":
      return editRow(draft, action.key, (row) => recalcRow({ ...row, qty: action.raw.trim() }));
    case "editOutcome": {
      if (!outcomeChoices(draft.kind).includes(action.outcome)) {
        return draft;
      }
      return editRow(draft, action.key, (row) => {
        const claim = isClaim(action.outcome);
        const claimOn: ReturnRow["claimOn"] = claim ? row.claimOn || "SUPPLIER" : "";
        return { ...row, outcome: action.outcome, claimOn, creditName: "", writesTip: "" };
      });
    }
    case "editBucket":
      return editRow(draft, action.key, (row) => pickLot(draft.srcLines, { ...row, bucket: action.bucket }, draft.godownId));
    case "editClaimOn":
      if (draft.kind === "AGAINST_GRN") {
        return draft;
      }
      return editRow(draft, action.key, (row) => (isClaim(row.outcome) ? { ...row, claimOn: action.claimOn, creditName: "" } : row));
    case "editReason":
      return editRow(draft, action.key, (row) => ({ ...row, reasonId: action.reasonId, reasonName: action.reasonName }));
    case "setLot":
      return editRow(draft, action.key, (row) => setRowLot(draft.srcLines, row, action.lotId));
    case "splitRow": {
      if (!isEditable(draft)) {
        return draft;
      }
      const index = draft.rows.findIndex((row) => row.key === action.key);
      const source = index >= 0 ? draft.srcLines[draft.rows[index].srcItemId] : undefined;
      if (!source) {
        return draft;
      }
      const copy = rowFromSource(draft.srcLines, source, draft.godownId, draft.rows[index].billed, action.newKey);
      const rows = [...draft.rows.slice(0, index + 1), copy, ...draft.rows.slice(index + 1)];
      return { ...draft, rows, dirty: true };
    }
    case "removeRow": {
      if (!isEditable(draft) || !draft.rows.some((row) => row.key === action.key)) {
        return draft;
      }
      return touched(draft, { rows: draft.rows.filter((row) => row.key !== action.key) });
    }
    case "billedPrimed": {
      if (draft.srcDocId !== action.srcDocId) {
        return draft;
      }
      const rows = draft.rows.map((row) => (row.billed || !action.billed[row.srcItemId] ? row : { ...row, billed: action.billed[row.srcItemId] }));
      return { ...draft, rows };
    }
    case "validated": {
      if (action.seq !== draft.calcSeq || draft.status !== "DRAFT") {
        return draft; // a newer edit is on its way
      }
      const out = action.answer.lines ?? [];
      const byKey = new Map<string, (typeof out)[number]>();
      action.sentKeys.forEach((key, index) => {
        if (out[index]) {
          byKey.set(key, out[index]);
        }
      });
      const rows = draft.rows.map((row) => {
        const line = byKey.get(row.key);
        return line && row.srcItemId ? withFacts(row, line) : row;
      });
      const h = action.answer.header ?? {};
      const godownId = draft.godownId || text(h.godownId);
      return {
        ...draft,
        rows,
        totals: totalsOf(action.answer.totals),
        warnings: action.answer.warnings ?? [],
        refusals: action.answer.refusals ?? [],
        posStcd: text(h.placeOfSupply) || draft.posStcd,
        godownId,
        godownName: godownId === draft.godownId ? draft.godownName : "",
        hint: "",
      };
    }
    case "validateRefused":
      if (action.seq !== draft.calcSeq) {
        return draft;
      }
      return { ...draft, refusals: [...action.errors], hint: action.hint };
    case "calcCleared":
      return { ...draft, totals: null, warnings: [], refusals: [] };
    case "refused":
      return action.errors.length > 0 ? { ...draft, refusals: [...action.errors], hint: action.hint } : { ...draft, hint: action.hint };
    case "beginEdit":
      return draft.status === "DRAFT" ? { ...draft, viewMode: "entry" } : draft;
    case "setHint":
      return { ...draft, hint: action.hint };
    default:
      return draft;
  }
}

// ---------------------------------------------------------------------------
// The totals strip
// ---------------------------------------------------------------------------

/**
 * The six cells of the mockup's strip (Qt `paintTotals`): Rows · Return now
 * (debit note) · Claims raised · Replace qty due · ITC reversed · Supplier
 * balance now. Replace qty due reads in the rows' unit when they share one.
 */
export function totalsCells(draft: ReturnDraft): PurchaseStripCell[] {
  const t = draft.totals;
  const have = t !== null;
  const units = new Set<string>();
  for (const row of draft.rows) {
    if (row.srcItemId && row.outcome === "REPLACE" && rowQty(row) > 0) {
      units.add(row.unitName.toLowerCase());
    }
  }
  const replace = t?.replaceQtyBase ?? 0;
  const replaceText = !have
    ? ""
    : replace <= 0
      ? "none"
      : units.size === 1
        ? `${qtyText(replace)} ${[...units][0]}`
        : `${qtyText(replace)} (base)`;
  return [
    { key: "rows", caption: "Rows", value: have ? String(t.rows) : "" },
    { key: "returnNow", caption: "Return now (debit note)", value: have ? money(t.returnNow) : "" },
    { key: "claims", caption: "Claims raised", value: have ? money(t.claimsRaised) : "", tone: "warn" },
    { key: "replace", caption: "Replace qty due", value: replaceText, tone: replace > 0 ? "info" : "muted" },
    { key: "itc", caption: "ITC reversed", value: have ? money(t.itcReversed) : "", tone: "bad" },
    { key: "balance", caption: "Supplier balance now", value: have ? money(t.supplierBalanceNow) : "", strong: true },
  ];
}

/** The ITC cell's tooltip: destroyed / Replace parts. */
export function itcTip(draft: ReturnDraft): string {
  const t = draft.totals;
  return t
    ? `Every outcome's GST taken out of input now: destroyed goods ${money(t.itcOnDestroyed)}, Replace ${money(t.itcPendingOnReplace)} (re-claimed when the replacement comes)`
    : "";
}

/** The balance cell's tooltip. */
export function balanceTip(draft: ReturnDraft): string {
  const t = draft.totals;
  return t
    ? `What we owe ${draft.supplierName}: ${money(t.supplierBalance)} before this return, ${money(t.supplierBalanceNow)} once it posts`
    : "";
}

/** The e-way bill field's placeholder (callout 7): the server's PUR_RETURN_EWB_NEEDED from the company's limit. */
export function ewbPlaceholder(draft: ReturnDraft): string {
  if (draft.status !== "DRAFT") {
    return "none";
  }
  if (!draft.totals) {
    return "needed above the e-way bill limit";
  }
  const goods = money(draft.totals.goodsValue);
  return draft.warnings.some((w) => text(w.code) === EWB_NEEDED_CODE) ? `needed — goods ${goods} above the limit` : `not needed (${goods})`;
}

/** "Tamil Nadu (33) · local — as the bill" / "State 29 · inter-state — as the bill". */
export function placeOfSupplyText(code: string, companyStateCode: string, companyStateName: string): string {
  if (!code) {
    return "";
  }
  if (companyStateCode && code === companyStateCode) {
    return `${companyStateName || "State"} (${code}) · local — as the bill`;
  }
  return `State ${code} · inter-state — as the bill`;
}

// ---------------------------------------------------------------------------
// Save / validate bodies
// ---------------------------------------------------------------------------

export type Refusal = { title: string; message: string; focus?: "supplier" | "source" | "grid" | "claimParty" };

/** What Save / Post refuse before asking the server (Qt `saveDocument`'s guards). */
export function saveRefusal(draft: ReturnDraft): Refusal | null {
  if (draft.status !== "DRAFT") {
    return { title: "Not a draft", message: `${draft.refno} is ${draft.status}.` };
  }
  if (!draft.supplierId || !draft.srcDocId) {
    return {
      title: "Header incomplete",
      message: "Pick the supplier and the bill (or GRN) the goods came on — Ctrl+L.",
      focus: draft.supplierId ? "source" : "supplier",
    };
  }
  if (returnLines(draft).length === 0) {
    return { title: "Nothing going back", message: "Type the qty on at least one row.", focus: "grid" };
  }
  return null;
}

/** The rows going back, as the wire takes them (Qt `buildPayload`), with their row keys. */
export function returnLinesWithKeys(draft: ReturnDraft): { lines: SaveReturnLine[]; keys: string[] } {
  const lines: SaveReturnLine[] = [];
  const keys: string[] = [];
  for (const row of draft.rows) {
    const qty = rowQty(row);
    if (!(qty > 0) || !row.srcItemId) {
      continue;
    }
    const line: SaveReturnLine = {
      lineNo: lines.length + 1,
      srcItemId: row.srcItemId,
      outcome: row.outcome,
      qty,
      bucket: row.bucket || BUCKET_SALEABLE,
    };
    if (row.lotId) {
      line.lotId = row.lotId;
    }
    if (row.reasonId) {
      line.reasonId = row.reasonId;
    }
    if (isClaim(row.outcome)) {
      const on: ClaimParty = row.claimOn || "SUPPLIER";
      line.claimAgainst = on;
      if (on !== "SUPPLIER" && draft.claimPartyId) {
        line.claimPartyId = draft.claimPartyId;
      }
    }
    lines.push(line);
    keys.push(row.key);
  }
  return { lines, keys };
}

export function returnLines(draft: ReturnDraft): SaveReturnLine[] {
  return returnLinesWithKeys(draft).lines;
}

function headerOf(draft: ReturnDraft, post: boolean, today: string): SaveReturnBody["header"] {
  const header: SaveReturnBody["header"] = {
    companyId: draft.companyId,
    branchId: draft.branchId,
    accYear: draft.accYear,
    deviceId: draft.deviceId,
    kind: draft.kind,
    srcDocId: draft.srcDocId,
    srcAccYear: draft.srcAccYear,
    docDate: draft.docDate || today,
    // Our ref (pr_memo_ref): always sent — blank clears it
    ourRef: draft.ourRef.trim() || null,
    settlement: draft.settlement ?? "ADJUST",
    post,
  };
  if (draft.prId) {
    header.prId = draft.prId;
  }
  if (draft.godownId) {
    header.godownId = draft.godownId;
  }
  const put = (key: "supplierCnNo" | "vehicleNo" | "driverName" | "ewbNo" | "remarks", value: string) => {
    if (value.trim()) {
      header[key] = value.trim();
    }
  };
  put("supplierCnNo", draft.supplierCnNo);
  put("vehicleNo", draft.vehicleNo);
  put("driverName", draft.driverName);
  put("ewbNo", draft.ewbNo);
  put("remarks", draft.remarks);
  if (draft.supplierCnDate) {
    header.supplierCnDate = draft.supplierCnDate;
  }
  if (draft.ewbDate) {
    header.ewbDate = draft.ewbDate;
  }
  if (draft.transportTouched) {
    header.transport = draft.transport ?? null;
  }
  return header;
}

export function buildSaveBody(draft: ReturnDraft, post: boolean, today: string): SaveReturnBody {
  return { header: headerOf(draft, post, today), lines: returnLines(draft) };
}

/** The /validate body and the rows it carries, or null when there is nothing to ask (Qt `recalcNow`). */
export function buildValidateBody(draft: ReturnDraft, today: string): { body: SaveReturnBody; keys: string[] } | null {
  if (draft.status !== "DRAFT" || !draft.supplierId || !draft.srcDocId) {
    return null;
  }
  const { lines, keys } = returnLinesWithKeys(draft);
  if (lines.length === 0) {
    return null;
  }
  return { body: { header: headerOf(draft, false, today), lines }, keys };
}

/**
 * The quiet /validate that fills Billed before anything is typed (Qt
 * `primeBilled`): a token qty (≤ 1) per returnable line, outcome Return, no
 * header godown (so no lot is refused for it).
 */
export function buildPrimeBody(draft: ReturnDraft, today: string): SaveReturnBody | null {
  if (!draft.supplierId || !draft.srcDocId) {
    return null;
  }
  const lines: SaveReturnLine[] = [];
  for (const line of Object.values(draft.srcLines)) {
    const left = num(line.returnableQty);
    if (left <= 0) {
      continue;
    }
    lines.push({
      lineNo: lines.length + 1,
      srcItemId: line.srcItemId,
      outcome: "RETURN",
      qty: Math.min(1, left),
      bucket: line.lots?.[0] ? text(line.lots[0].bucket) : BUCKET_SALEABLE,
    });
  }
  if (lines.length === 0) {
    return null;
  }
  const header = headerOf(draft, false, today);
  delete header.godownId;
  return { header, lines };
}

/** srcItemId → billedQty from a prime answer. */
export function billedOf(answer: ReturnValidateAnswer | null | undefined): Record<string, string> {
  const billed: Record<string, string> = {};
  for (const line of answer?.lines ?? []) {
    if (line.billedQty !== undefined && line.billedQty !== null) {
      billed[text(line.srcItemId)] = qtyText(num(line.billedQty));
    }
  }
  return billed;
}

/** A 4xx's `errors[]` as strip rows (no level: a refusal). */
export function issuesOfError(error: unknown): ReturnIssue[] {
  const errors = (error as { data?: { errors?: unknown } } | null)?.data?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .filter((entry): entry is { code?: unknown; message?: unknown; field?: unknown } => typeof entry === "object" && entry !== null)
    .map((entry) => ({ code: text(entry.code), message: text(entry.message), field: text(entry.field), level: "REFUSE" }));
}

/** A draft remembered before Settlement / the rebuild existed reads with today's defaults. */
export function withRecalledDefaults(draft: ReturnDraft): ReturnDraft {
  const base = createDraft(draft, draft.docDate, "ADJUST");
  const rows = (draft.rows ?? []).map((row) => ({
    ...row,
    outcome: outcomeCodeOf(String(row.outcome ?? "")),
    expiryDate: row.expiryDate ?? "",
    mrp: row.mrp ?? "",
    billed: row.billed ?? "",
    returned: row.returned ?? null,
    reasonId: row.reasonId ?? "",
    reasonName: row.reasonName ?? "",
    creditName: row.creditName ?? "",
    writesTip: row.writesTip ?? "",
  }));
  return {
    ...base,
    ...draft,
    rows,
    sources: (draft.sources ?? []).map((source) => ({ ...source, detail: source.detail ?? source.label })),
    settlement: draft.settlement ?? "ADJUST",
    settlementChosen: draft.settlement ? draft.settlementChosen : true,
    warnings: draft.warnings ?? [],
    refusals: draft.refusals ?? [],
    calcSeq: (draft.calcSeq ?? 0) + 1,
  };
}

/** Unsaved work worth bringing back after a menu trip. */
export function isWorthRemembering(draft: ReturnDraft): boolean {
  return draft.dirty && draft.status === "DRAFT" && Boolean(draft.supplierId);
}

// ---------------------------------------------------------------------------
// The document keys (Qt `PurchaseDocNav`)
// ---------------------------------------------------------------------------

/**
 * Edit · F2: what it does with the return on screen. A saved draft opened read
 * only opens for keying; anything else is told why (the server edits drafts
 * only) — the hint line carries it, as Qt's lblHint does.
 */
export function editAnswer(
  draft: Pick<ReturnDraft, "prId" | "refno" | "status" | "viewMode">,
  mayEdit: boolean,
): { open: boolean; focusLines: boolean; notice: string } {
  if (!draft.prId) {
    return { open: false, focusLines: false, notice: "A new purchase return — key it and Save Draft (Ctrl+S) or Post." };
  }
  if (draft.status === "DRAFT") {
    if (draft.viewMode === "browse") {
      return mayEdit
        ? { open: true, focusLines: true, notice: "" }
        : { open: false, focusLines: false, notice: `${draft.refno} is a draft, but you have no Edit right on Purchase Return.` };
    }
    return { open: false, focusLines: true, notice: `${draft.refno} is a draft — change it, then Save Draft (Ctrl+S) or Post.` };
  }
  if (draft.status === "CANCELLED") {
    return { open: false, focusLines: false, notice: `${draft.refno} is cancelled — it cannot be changed. Enter a new one (Alt+N).` };
  }
  return {
    open: false,
    focusLines: false,
    notice: `${draft.refno} is posted — only a draft can be changed. Cancel it (Alt+X) and enter it again.`,
  };
}

/** Previous / Next when `/txn/adjacent` answers no document. */
export function stepEndNotice(fromNew: boolean, previous: boolean): string {
  if (fromNew) {
    return previous ? "There is no purchase return yet." : "A new purchase return is the newest — nothing comes after it.";
  }
  return previous ? "This is the oldest purchase return." : "This is the newest purchase return.";
}

/** "Purchase Return — new" / "Purchase Return — PRN/…". */
export function titleLine(draft: ReturnDraft): string {
  return draft.refno ? `Purchase Return — ${draft.refno}` : "Purchase Return — new";
}

/** Supplier dues (menu 297), filtered to this supplier (Qt `PurchaseUi::openSupplierDues`). */
export function supplierDuesHref(route: string, supplierId: string, supplierName: string): string {
  const query = new URLSearchParams({ supplierId, supplierName });
  return `${route}?${query.toString()}`;
}
