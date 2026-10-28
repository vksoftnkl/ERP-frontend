/**
 * Purchase Return — every rule of the screen, pure (the Qt
 * `PurchaseReturnEntry`, NexERP 8ca6ff3). The view and the hook only wire
 * these up; `purchaseReturnReducer` is the one way the draft changes.
 *
 * A row is one source line of the bill / GRN with ONE outcome. + on a row
 * copies its source line into a second row for another outcome. Value / Tax /
 * Total are previews (qty × the bill's per-unit figures) until the server's
 * come back with the saved return.
 */
import { toDateInput } from "@/features/sales/quotation/quotation.utils";
import { isoToDisplayDate } from "@/lib/date-format";
import { money, num, qtyText, text } from "../shared/purchase.format";
import {
  BUCKET_SALEABLE,
  CLAIM_PARTIES,
  OUTCOMES,
  type ClaimParty,
  type OutcomeText,
  type ReturnKind,
} from "./return.constants";
import type {
  ClaimRow,
  DraftScope,
  OpenClaimWire,
  ReturnDraft,
  ReturnPayload,
  ReturnRow,
  ReturnSourceLine,
  ReturnSourceRow,
  SaveReturnBody,
  SaveReturnLine,
  ServerTotals,
  SourceOption,
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

/** "CLAIM SENT" → CLAIM_SENT. */
export function outcomeCode(shown: string): string {
  return shown.replace(/ /g, "_");
}

/** CLAIM_SENT → "CLAIM SENT"; anything unknown reads as RETURN. */
export function outcomeText(code: string): OutcomeText {
  const shown = code.replace(/_/g, " ").trim().toUpperCase();
  return (OUTCOMES as readonly string[]).includes(shown) ? (shown as OutcomeText) : "RETURN";
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

/** Outcome choices: a return against a GRN (not yet billed) is RETURN only. */
export function outcomeChoices(draft: ReturnDraft): readonly OutcomeText[] {
  return draft.kind === "AGAINST_GRN" ? ["RETURN"] : OUTCOMES;
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

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

/** Value / Tax / Total from qty × the per-unit figures (Qt `recalcRow`). */
export function recalcRow(row: ReturnRow): ReturnRow {
  const qty = rowQty(row);
  if (!(qty > 0)) {
    return { ...row, value: null, tax: null, total: null };
  }
  const value = qty * row.rate;
  const tax = qty * row.unitTax;
  return { ...row, value, tax, total: value + tax };
}

/** The lot of the source line in the row's bucket (the first one) → lotId + batch (Qt `pickLot`). */
export function pickLot(srcLines: ReturnDraft["srcLines"], row: ReturnRow): ReturnRow {
  for (const lot of srcLines[row.srcItemId]?.lots ?? []) {
    if (text(lot.bucket) !== row.bucket) {
      continue;
    }
    return { ...row, lotId: text(lot.lotId), batchNo: text(lot.batchNo) };
  }
  return { ...row, lotId: "" };
}

/** A fresh row off a source line: qty blank, RETURN, SALEABLE unless the line brought none (Qt `fillRow`). */
export function rowFromSource(srcLines: ReturnDraft["srcLines"], line: ReturnSourceLine, key = newRowKey()): ReturnRow {
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
    bucket,
    lotId: "",
    returnable: num(line.returnableQty),
    qty: "",
    outcome: "RETURN",
    claimOn: "",
    rate: round(unitTaxable, 2),
    gstPct: num(line.gstPct),
    unitTax: round(num(line.unitTotal) - unitTaxable, 6),
    lineId: "",
    value: null,
    tax: null,
    total: null,
  };
  return pickLot(srcLines, row);
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export const START_HINT = "Pick the supplier, then the bill the goods came on.";
export const LINES_HINT = "Type the qty going back and pick the outcome. + on a row splits that line into another outcome.";
export const NOTHING_LEFT_HINT = "Everything on that document has already gone back.";

export function createDraft(scope: DraftScope, docDate: string): ReturnDraft {
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
    supplierCnNo: "",
    supplierCnDate: "",
    vehicleNo: "",
    remarks: "",
    claimPartyId: "",
    claimPartyName: "",
    rows: [],
    serverTotals: null,
    hint: START_HINT,
    viewMode: "entry",
    dirty: false,
  };
}

/** "PUR/2026-2027/D14/00297 · INV-55 · 05/10/2026 · 2,360.00" — the Qt combo text. */
export function sourceLabel(row: ReturnSourceRow): string {
  const date = isoToDisplayDate(toDateInput(row.docDate));
  return [text(row.refno), text(row.supplierRef), date, money(num(row.amount))].join(" · ");
}

export function sourceOptions(rows: readonly ReturnSourceRow[]): SourceOption[] {
  return rows.map((row) => ({ srcDocId: row.srcDocId, srcAccYear: text(row.srcAccYear), label: sourceLabel(row) }));
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
    const outcome = outcomeText(text(line.priOutcome));
    return {
      key: newRowKey(),
      srcItemId: text(line.priSrcItemId),
      srcLineNo: text(line.priSrcDocLineNo),
      itemName: text(line.itemName),
      unitName: text(line.unitName),
      batchNo: text(line.batchNo),
      bucket: text(line.bucket),
      lotId: text(line.lotId),
      returnable: null,
      qty: qtyText(qty + num(line.priFreeQty)),
      outcome,
      claimOn: isClaim(outcome) ? asParty(line.priClaimAgainst) || "SUPPLIER" : "",
      rate: qty > 0 ? round(num(line.priTaxableAmt) / qty, 2) : 0,
      gstPct: num(line.priGstPct),
      unitTax: qty > 0 ? round(tax / qty, 6) : 0,
      lineId: text(line.priId),
      value: num(line.priTaxableAmt),
      tax,
      total: num(line.priTotalAmt),
    };
  });
  // The claim party picked for the return: the one a non-supplier claim row is on.
  const partyRow = (payload.lines ?? []).find(
    (line) => isClaim(outcomeText(text(line.priOutcome))) && asParty(line.priClaimAgainst) !== "SUPPLIER" && text(line.priClaimPartyId),
  );
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
    sources: srcDocId ? [{ srcDocId, srcAccYear, label: text(h.prOurRef) || srcDocId }] : [],
    sourcesState: "ready",
    supplierCnNo: text(h.prSupplierCnNo),
    supplierCnDate: toDateInput(h.prSupplierCnDate),
    vehicleNo: text(h.prVehicleNo),
    remarks: text(h.prRemarks),
    claimPartyId: partyRow ? text(partyRow.priClaimPartyId) : "",
    claimPartyName: "",
    rows,
    serverTotals: {
      returnValue: num(h.prReturnValue),
      claimValue: num(h.prClaimValue),
      itcReversed: num(h.prItcReversed),
    },
    hint: "",
    viewMode: status === "DRAFT" ? viewMode : "browse",
    dirty: false,
  };
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export type HeaderPatch = Partial<Pick<ReturnDraft, "docDate" | "supplierCnNo" | "supplierCnDate" | "vehicleNo" | "remarks">>;

export type ReturnAction =
  | { type: "reset"; scope: DraftScope; docDate: string }
  | { type: "loaded"; scope: DraftScope; payload: ReturnPayload; viewMode: "browse" | "entry" }
  | { type: "setSupplier"; id: string; name: string }
  | { type: "setKind"; kind: ReturnKind }
  | { type: "sourcesLoading" }
  | { type: "sourcesLoaded"; supplierId: string; kind: ReturnKind; rows: readonly ReturnSourceRow[] }
  | { type: "sourceLinesLoaded"; srcDocId: string; srcAccYear: string; lines: readonly ReturnSourceLine[] }
  | { type: "setHeader"; patch: HeaderPatch }
  | { type: "setClaimParty"; id: string; name: string }
  | { type: "editQty"; key: string; raw: string }
  | { type: "editOutcome"; key: string; outcome: OutcomeText }
  | { type: "editBucket"; key: string; bucket: string }
  | { type: "editClaimOn"; key: string; claimOn: ClaimParty }
  | { type: "splitRow"; key: string; newKey?: string }
  | { type: "removeRow"; key: string }
  | { type: "beginEdit" }
  | { type: "setHint"; hint: string };

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
  return changed ? { ...draft, rows, serverTotals: null, dirty: true } : draft;
}

/** The source changes: the rows and the source go, the supplier stays. */
function clearSource(draft: ReturnDraft): ReturnDraft {
  return { ...draft, srcDocId: "", srcAccYear: "", srcLines: {}, rows: [], serverTotals: null };
}

export function purchaseReturnReducer(draft: ReturnDraft, action: ReturnAction): ReturnDraft {
  switch (action.type) {
    case "reset":
      return createDraft(action.scope, action.docDate);
    case "loaded":
      return draftFromPayload(action.scope, action.payload, action.viewMode);
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
      return {
        ...clearSource(draft),
        kind: action.kind,
        sources: [],
        sourcesState: draft.supplierId ? "loading" : "",
        dirty: true,
      };
    }
    case "sourcesLoading":
      return { ...draft, sources: [], sourcesState: "loading" };
    case "sourcesLoaded":
      // An answer for a supplier / kind the screen has since left is dropped.
      if (action.supplierId !== draft.supplierId || action.kind !== draft.kind || !isFresh(draft)) {
        return draft;
      }
      return { ...draft, sources: sourceOptions(action.rows), sourcesState: "ready" };
    case "sourceLinesLoaded": {
      if (draft.status !== "DRAFT") {
        return draft;
      }
      const srcLines: ReturnDraft["srcLines"] = {};
      for (const line of action.lines) {
        srcLines[line.srcItemId] = line;
      }
      // A reopened draft keeps its own rows; only Can Return is refreshed (net of this draft).
      const keepRows = Boolean(draft.prId) && action.srcDocId === draft.srcDocId;
      const rows = keepRows
        ? draft.rows.map((row) => {
            const line = srcLines[row.srcItemId];
            return { ...row, returnable: line ? num(line.returnableQty) : row.returnable };
          })
        : action.lines.filter((line) => num(line.returnableQty) > 0).map((line) => rowFromSource(srcLines, line));
      return {
        ...draft,
        srcDocId: action.srcDocId,
        srcAccYear: action.srcAccYear,
        srcLines,
        rows,
        serverTotals: keepRows ? draft.serverTotals : null,
        hint: rows.length > 0 ? LINES_HINT : NOTHING_LEFT_HINT,
        dirty: keepRows ? draft.dirty : true,
      };
    }
    case "setHeader":
      if (!isEditable(draft)) {
        return draft;
      }
      return { ...draft, ...action.patch, dirty: true };
    case "setClaimParty":
      if (!isEditable(draft)) {
        return draft;
      }
      return { ...draft, claimPartyId: action.id, claimPartyName: action.name, dirty: true };
    case "editQty":
      return editRow(draft, action.key, (row) => recalcRow({ ...row, qty: action.raw.trim() }));
    case "editOutcome": {
      if (!outcomeChoices(draft).includes(action.outcome)) {
        return draft;
      }
      return editRow(draft, action.key, (row) => {
        const claim = isClaim(action.outcome);
        const claimOn: ReturnRow["claimOn"] = claim ? row.claimOn || "SUPPLIER" : "";
        return recalcRow({ ...row, outcome: action.outcome, claimOn });
      });
    }
    case "editBucket":
      return editRow(draft, action.key, (row) => recalcRow(pickLot(draft.srcLines, { ...row, bucket: action.bucket })));
    case "editClaimOn":
      return editRow(draft, action.key, (row) => (isClaim(row.outcome) ? { ...row, claimOn: action.claimOn } : row));
    case "splitRow": {
      if (!isEditable(draft)) {
        return draft;
      }
      const index = draft.rows.findIndex((row) => row.key === action.key);
      const source = index >= 0 ? draft.srcLines[draft.rows[index].srcItemId] : undefined;
      if (!source) {
        return draft;
      }
      const copy = rowFromSource(draft.srcLines, source, action.newKey);
      const rows = [...draft.rows.slice(0, index + 1), copy, ...draft.rows.slice(index + 1)];
      return { ...draft, rows, dirty: true };
    }
    case "removeRow": {
      if (!isEditable(draft) || !draft.rows.some((row) => row.key === action.key)) {
        return draft;
      }
      return { ...draft, rows: draft.rows.filter((row) => row.key !== action.key), serverTotals: null, dirty: true };
    }
    case "beginEdit":
      return draft.status === "DRAFT" ? { ...draft, viewMode: "entry" } : draft;
    case "setHint":
      return { ...draft, hint: action.hint };
    default:
      return draft;
  }
}

// ---------------------------------------------------------------------------
// What the rows add up to
// ---------------------------------------------------------------------------

export type PreviewTotals = { rows: number; debit: number; claim: number; replace: number };

/** Qt `recalcTotals`: RETURN → the debit note, a claim on goods sent its total, destroyed its value. */
export function previewTotals(draft: ReturnDraft): PreviewTotals {
  const totals: PreviewTotals = { rows: 0, debit: 0, claim: 0, replace: 0 };
  for (const row of draft.rows) {
    const qty = rowQty(row);
    if (!(qty > 0)) {
      continue;
    }
    totals.rows += 1;
    if (row.outcome === "RETURN") {
      totals.debit += row.total ?? 0;
    } else if (row.outcome === "CLAIM SENT") {
      totals.claim += row.total ?? 0;
    } else if (row.outcome === "CLAIM DESTROYED") {
      totals.claim += row.value ?? 0;
    } else if (row.outcome === "REPLACE") {
      totals.replace += qty;
    }
  }
  return totals;
}

/** The totals line: the saved return's own figures, else the preview. */
export function totalsParts(draft: ReturnDraft): { label: string; value: string; strong?: boolean }[] {
  const saved: ServerTotals | null = draft.serverTotals;
  if (saved) {
    return [
      { label: "Debit note", value: money(saved.returnValue), strong: true },
      { label: "Claims", value: money(saved.claimValue) },
      { label: "GST reversed on destroyed goods", value: money(saved.itcReversed) },
    ];
  }
  if (draft.rows.length === 0) {
    return [];
  }
  const totals = previewTotals(draft);
  const parts: { label: string; value: string; strong?: boolean }[] = [
    { label: totals.rows === 1 ? "row going back" : "rows going back", value: String(totals.rows) },
    { label: "Debit note", value: money(totals.debit), strong: true },
    { label: "Claims", value: money(totals.claim) },
  ];
  if (totals.replace > 0) {
    parts.push({ label: "Replacement due", value: qtyText(totals.replace) });
  }
  return parts;
}

/** Rows whose source line is asked for more than can still go back (the server refuses it). */
export function overReturned(draft: ReturnDraft): Set<string> {
  const asked = new Map<string, number>();
  for (const row of draft.rows) {
    asked.set(row.srcItemId, (asked.get(row.srcItemId) ?? 0) + Math.max(0, rowQty(row)));
  }
  const keys = new Set<string>();
  for (const row of draft.rows) {
    if (row.returnable === null) {
      continue;
    }
    if ((asked.get(row.srcItemId) ?? 0) > row.returnable + 1e-9 && rowQty(row) > 0) {
      keys.add(row.key);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Save
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
      message: "Pick the supplier and the bill (or GRN) the goods came on.",
      focus: draft.supplierId ? "source" : "supplier",
    };
  }
  if (returnLines(draft).length === 0) {
    return { title: "Nothing going back", message: "Type the qty on at least one row.", focus: "grid" };
  }
  const otherParty = draft.rows.some(
    (row) => rowQty(row) > 0 && isClaim(row.outcome) && row.claimOn !== "" && row.claimOn !== "SUPPLIER",
  );
  if (otherParty && !draft.claimPartyId) {
    return {
      title: "Claim on whom?",
      message: "A TRANSPORTER or INSURER claim row needs its ledger — pick it under Claim on (other).",
      focus: "claimParty",
    };
  }
  return null;
}

/** The rows going back, as the wire takes them (Qt `buildPayload`). */
export function returnLines(draft: ReturnDraft): SaveReturnLine[] {
  const lines: SaveReturnLine[] = [];
  for (const row of draft.rows) {
    const qty = rowQty(row);
    if (!(qty > 0) || !row.srcItemId) {
      continue;
    }
    const line: SaveReturnLine = {
      lineNo: lines.length + 1,
      srcItemId: row.srcItemId,
      outcome: outcomeCode(row.outcome),
      qty,
      bucket: row.bucket || BUCKET_SALEABLE,
    };
    if (row.lotId) {
      line.lotId = row.lotId;
    }
    if (isClaim(row.outcome)) {
      const on: ClaimParty = row.claimOn || "SUPPLIER";
      line.claimAgainst = on;
      if (on !== "SUPPLIER" && draft.claimPartyId) {
        line.claimPartyId = draft.claimPartyId;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function buildSaveBody(draft: ReturnDraft, post: boolean, today: string): SaveReturnBody {
  const header: SaveReturnBody["header"] = {
    companyId: draft.companyId,
    branchId: draft.branchId,
    accYear: draft.accYear,
    deviceId: draft.deviceId,
    kind: draft.kind,
    srcDocId: draft.srcDocId,
    srcAccYear: draft.srcAccYear,
    docDate: draft.docDate || today,
    post,
  };
  if (draft.prId) {
    header.prId = draft.prId;
  }
  if (draft.supplierCnNo.trim()) {
    header.supplierCnNo = draft.supplierCnNo.trim();
  }
  if (draft.supplierCnDate) {
    header.supplierCnDate = draft.supplierCnDate;
  }
  if (draft.vehicleNo.trim()) {
    header.vehicleNo = draft.vehicleNo.trim();
  }
  if (draft.remarks.trim()) {
    header.remarks = draft.remarks.trim();
  }
  return { header, lines: returnLines(draft) };
}

/** Unsaved work worth bringing back after a menu trip. */
export function isWorthRemembering(draft: ReturnDraft): boolean {
  return draft.dirty && draft.status === "DRAFT" && Boolean(draft.supplierId);
}

/** "Purchase Return — new" / "Purchase Return — PRN/…". */
export function titleLine(draft: ReturnDraft): string {
  return draft.refno ? `Purchase Return — ${draft.refno}` : "Purchase Return — new";
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export function claimRowsOf(rows: readonly OpenClaimWire[]): ClaimRow[] {
  return rows.map((row) => {
    const party = text(row.partyName);
    return {
      returnItemId: text(row.returnItemId),
      accYear: text(row.accYear),
      lastSettlementId: text(row.lastSettlementId),
      refno: text(row.refno),
      date: isoToDisplayDate(toDateInput(row.docDate)),
      lineNo: text(row.lineNo),
      itemName: text(row.itemName),
      claim: text(row.outcome) === "CLAIM_SENT" ? "Goods sent" : "Destroyed",
      claimOn: [text(row.claimAgainst), party].filter(Boolean).join(" · "),
      value: num(row.claimValue),
      settled: num(row.settled),
      open: num(row.open),
    };
  });
}

/** Why a settle action cannot run on this row, or "". */
export function settleRefusal(row: ClaimRow | null): string {
  if (!row) {
    return "Select the claim row first.";
  }
  return row.open <= 0.004 ? "This claim is fully settled — Undo last to reopen it." : "";
}

/** Why Undo last cannot run on this row, or "". */
export function undoRefusal(row: ClaimRow | null): string {
  if (!row) {
    return "Select the claim row first.";
  }
  return row.lastSettlementId ? "" : "This claim has no settlement standing.";
}

/** The credit amount as typed: a number above 0 and at most the open amount, else null. */
export function creditAmount(typed: string, open: number): number | null {
  const amount = num(typed, Number.NaN);
  if (!Number.isFinite(amount) || amount <= 0 || amount > open + 0.004) {
    return null;
  }
  return round(amount, 2);
}
