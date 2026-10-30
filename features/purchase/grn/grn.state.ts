/**
 * GRN (menu 196) — every rule of the Qt `GrnEntry`, as pure functions over the
 * draft. The hook (`use-grn-draft.ts`) only fetches and commits.
 *
 * What the client works out is the operator's arithmetic, never what posts:
 * Short = Challan − Received − Damaged (the server parks it on post), Value =
 * (Received + Damaged) × the provisional rate (the server's
 * grnProvisionalValue is the figure that posts).
 */
import { parseDisplayDate } from "@/lib/date-format";
import {
  allocDtoOf,
  type PurchaseAllocBucket,
  type PurchaseAllocEntry,
  type PurchaseAllocNeed,
} from "../shared/purchase-dialogs.types";
import { isoFromTyped, money, num, qtyText, text } from "../shared/purchase.format";
import type { PurchaseTransportBand } from "../shared/purchase-parts";
import { COL, ENTER_STOPS, EXCESS_COLUMNS, SELL_COLUMNS, TEXTILE_COLUMNS } from "./grn.constants";
import { chargesPayload, foldServerCharges, hasUnloadingRow } from "./grn-charges";
import type {
  GrnAllocDto,
  GrnAllocWire,
  GrnBillStatus,
  GrnDraft,
  GrnExcessAction,
  GrnLine,
  GrnLineDto,
  GrnPayload,
  GrnScope,
  GrnTotals,
  PendingPoLine,
  SaveGrnDto,
} from "./grn.types";

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `grn-line-${Date.now().toString(36)}-${keySeq}`;
}

export function blankLine(): GrnLine {
  return {
    key: nextKey(),
    lineId: "",
    barcode: "",
    itemId: "",
    itemName: "",
    uomId: "",
    unitName: "",
    poItemId: "",
    poItemAccYear: "",
    poRef: "",
    poLineNo: "",
    pending: "",
    challan: "",
    recd: "",
    dmg: "",
    damageReasonId: "",
    damageReasonName: "",
    free: "",
    rate: "",
    batch: "",
    expiry: "",
    mrp: "",
    signature: "",
    allocs: [],
    sizeId: "",
    colourId: "",
    model: "",
    sellA: "",
    sellB: "",
    sellC: "",
    sellD: "",
    excess: "",
    excessAction: "",
    serverValue: "",
    check: null,
    billRefno: "",
  };
}

/** The settings the screen follows — read once, held on the draft. */
export type GrnRules = { autoBatchNo: boolean; priceAtGrn: boolean };

/** Qt `resetScreen`. `receivedAt` = the app date with the time now (local `yyyy-MM-ddTHH:mm`). */
export function createDraft(
  scope: GrnScope,
  today: string,
  rules: GrnRules = { autoBatchNo: false, priceAtGrn: false },
  receivedAt = `${today}T00:00`,
): GrnDraft {
  return {
    grnId: "",
    refno: "",
    status: "DRAFT",
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear,
    deviceId: scope.deviceId,
    supplierId: "",
    supplierName: "",
    godownId: "",
    godownName: "",
    docDate: today,
    receivedAt,
    receivedTyped: false,
    challanNo: "",
    challanDate: "",
    vehicleNo: "",
    driverName: "",
    supervisorId: "",
    supervisorName: "",
    ewbNo: "",
    ewbDate: "",
    packagesSent: "",
    packagesReceived: "",
    transport: null,
    transportTouched: false,
    remarks: "",
    loadmen: [],
    charges: [],
    chargesTouched: false,
    coolieDropped: false,
    serverTotals: null,
    warnings: [],
    refusals: [],
    overrideTicked: false,
    lines: [blankLine()],
    pendingLines: [],
    pendingFor: "",
    poChoice: "",
    coolie: 0,
    billed: false,
    billStatus: "NOT_BILLED",
    autoBatchNo: rules.autoBatchNo,
    priceAtGrn: rules.priceAtGrn,
    viewMode: "entry",
    dirty: false,
    hint: "",
  };
}

/** The settings arrived (or changed): onto the draft, without making it dirty. */
export function setRules(draft: GrnDraft, rules: GrnRules): GrnDraft {
  if (draft.autoBatchNo === rules.autoBatchNo && draft.priceAtGrn === rules.priceAtGrn) {
    return draft;
  }
  return { ...draft, autoBatchNo: rules.autoBatchNo, priceAtGrn: rules.priceAtGrn };
}

// ---------------------------------------------------------------------------
// Reading the draft
// ---------------------------------------------------------------------------

export function rowHasItem(line: GrnLine): boolean {
  return line.itemId !== "";
}

export function isDraftStatus(draft: GrnDraft): boolean {
  return (draft.status || "DRAFT").toUpperCase() === "DRAFT";
}

/** Keyable: a DRAFT opened for entry. */
export function isEditable(draft: GrnDraft): boolean {
  return isDraftStatus(draft) && draft.viewMode === "entry";
}

/** What the screen keeps across a menu trip: unsaved work on a keyable draft. */
export function isWorthRemembering(draft: GrnDraft): boolean {
  return draft.dirty && isEditable(draft);
}

/** The line holds an F12 split (Qt `rowSplit`). */
export function isSplit(line: GrnLine): boolean {
  return line.allocs.length > 0;
}

/** The item tracks serials (signature R): an F12 row is one piece. */
export function isSerialLine(line: GrnLine): boolean {
  return line.signature.toUpperCase().includes("R");
}

/**
 * Qt `rowTextile`: with stock.auto_batch_no on, a batch-tracked line takes
 * Model · Size · Colour and leaves Batch blank — Post gives the batch number.
 */
export function isTextileLine(draft: GrnDraft, line: GrnLine): boolean {
  return draft.autoBatchNo && line.signature.toUpperCase().includes("B");
}

/** Size / Colour / Model open: a textile line, not split, no typed batch (Qt picker `setCanOpen`). */
function textileOpen(draft: GrnDraft, line: GrnLine): boolean {
  return rowHasItem(line) && isTextileLine(draft, line) && !isSplit(line) && line.batch.trim() === "";
}

/** A PO line is on the GRN. */
export function hasPoLine(draft: GrnDraft): boolean {
  return draft.lines.some((line) => line.poItemId !== "");
}

/** Qt `anyExcess`: a line came over its PO (the server's figure) or says what to do with it — Excess shows. */
export function anyExcess(draft: GrnDraft): boolean {
  return draft.lines.some((line) => rowHasItem(line) && (num(line.excess) > 0 || line.excessAction !== ""));
}

/** The columns the screen's rule hides right now (Qt `applyTextileColumns`). */
export function hiddenColumns(draft: GrnDraft): Set<number> {
  const hidden = new Set<number>();
  if (!draft.priceAtGrn) {
    SELL_COLUMNS.forEach((no) => hidden.add(no));
  }
  if (!anyExcess(draft)) {
    EXCESS_COLUMNS.forEach((no) => hidden.add(no));
  }
  if (!draft.autoBatchNo) {
    TEXTILE_COLUMNS.forEach((no) => hidden.add(no));
  }
  return hidden;
}

/** Qt `delegate edit predicate`: the Barcode only on a blank line; the rest only on a line with an item. */
export function isCellEditable(draft: GrnDraft, line: GrnLine, column: number): boolean {
  if (!isEditable(draft)) {
    return false;
  }
  const has = rowHasItem(line);
  switch (column) {
    case COL.Barcode:
      return !has;
    case COL.Item:
      // A PO row receives the PO's item; another item would not be that PO line.
      return !has || line.poItemId === "";
    case COL.Batch:
    case COL.Expiry:
      // F12 owns them on a split line.
      return has && !isSplit(line);
    case COL.Model:
    case COL.Size:
    case COL.Colour:
      return textileOpen(draft, line);
    case COL.DmgReason:
      // Qt reasonPicker->setCanOpen: a damaged qty names its reason.
      return has && num(line.dmg) > 0;
    case COL.ExcessAct:
      return has && line.poItemId !== "";
    case COL.Excess:
      // What went back at the gate.
      return has && line.excessAction === "RETURN";
    case COL.SellA:
    case COL.SellB:
    case COL.SellC:
    case COL.SellD:
      return has && draft.priceAtGrn;
    case COL.Challan:
    case COL.Recd:
    case COL.Dmg:
    case COL.Free:
    case COL.Rate:
    case COL.Mrp:
      return has;
    default:
      return false;
  }
}

/** Qt `setFocusStops`, on the cells that are open on this line. */
export function isEnterStop(draft: GrnDraft, line: GrnLine, column: number): boolean {
  return ENTER_STOPS.has(column) && isCellEditable(draft, line, column);
}

/** Short = Challan − Received − Damaged; a blank Challan is Received + Damaged (no short). */
export function lineShort(line: GrnLine): number {
  const recd = num(line.recd);
  const dmg = num(line.dmg);
  const challan = line.challan.trim() === "" ? recd + dmg : num(line.challan);
  const short = challan - recd - dmg;
  return short > 0.0005 ? short : 0;
}

/** (Received + Damaged) × the provisional rate. */
export function lineValue(line: GrnLine): number {
  return (num(line.recd) + num(line.dmg)) * num(line.rate);
}

/** Qt `recalcTotals`. */
export function computeTotals(draft: GrnDraft): GrnTotals {
  let lines = 0;
  let qty = 0;
  let value = 0;
  let short = 0;
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    lines += 1;
    qty += num(line.recd) + num(line.dmg) + num(line.free);
    value += lineValue(line);
    short += lineShort(line);
  }
  return { lines, qty, value, short };
}

/** "dd/MM/yyyy" (or with - . separators), ISO or eight digits → ISO; "" when it is no date. */
export function expiryIso(typed: string): string {
  const value = typed.trim();
  if (!value) {
    return "";
  }
  return isoFromTyped(value) || parseDisplayDate(value) || "";
}

/** ISO (or a timestamp) → dd/MM/yyyy, the way the Qt grid shows an expiry. */
export function slashDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** "PO/2026-2027/D14/00106" → "00106" (Qt `section('/', -1)`). */
export function lastSegment(refno: string): string {
  const parts = refno.split("/");
  return parts[parts.length - 1] ?? "";
}

/** A rate as the Qt grid writes it after a PO fill: two places. */
function rateText(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

/** The PO's net rate — after its discount and scheme (the GRN's provisional rate). */
export function poNetRate(row: PendingPoLine): number {
  return num(row.rate) * (1 - num(row.discPct) / 100) * (1 - num(row.schPct) / 100);
}

/** Qt `refsText`: "PO/2026-2027/D1/00004, 00005" — the first ref whole, the rest by their last part. */
export function refsText(refs: readonly string[]): string {
  return refs.map((ref, index) => (index === 0 ? ref : lastSegment(ref))).join(", ");
}

/** The POs the lines receive, in line order (Qt `refreshPoChoice`). */
export function poRefsOnLines(draft: GrnDraft): string[] {
  const refs: string[] = [];
  for (const line of draft.lines) {
    if (rowHasItem(line) && line.poRef && !refs.includes(line.poRef)) {
      refs.push(line.poRef);
    }
  }
  return refs;
}

type PoGroup = { poId: string; label: string; count: number; left: number };

/** The supplier's open POs, in the server's order: label, lines pending, lines not yet on this GRN. */
export function pendingPoGroups(draft: GrnDraft): PoGroup[] {
  const have = new Set(draft.lines.map((line) => line.poItemId).filter(Boolean));
  const groups = new Map<string, PoGroup>();
  for (const row of draft.pendingLines) {
    let group = groups.get(row.poId);
    if (!group) {
      group = { poId: row.poId, label: `${text(row.refno)} · ${slashDate(text(row.docDate))}`, count: 0, left: 0 };
      groups.set(row.poId, group);
    }
    group.count += 1;
    if (!have.has(row.poiId)) {
      group.left += 1;
    }
  }
  return [...groups.values()];
}

/**
 * What From PO shows (Qt `refreshPoChoice` item 0): the POs on this GRN, else
 * "— without PO —   (2 open · Ctrl+L)" / "— no open PO —"; blank without a supplier.
 */
export function poFieldText(draft: GrnDraft, loading: boolean): string {
  const refs = poRefsOnLines(draft);
  if (refs.length > 0) {
    return refsText(refs);
  }
  if (!draft.supplierId) {
    return "";
  }
  if (loading && draft.pendingFor !== draft.supplierId) {
    return "loading…";
  }
  const open = pendingPoGroups(draft).length;
  return open === 0 ? "— no open PO —" : `— without PO —   (${open} open · Ctrl+L)`;
}

/** The From PO picker's rows (Qt `openPoPicker`): one per PO; a PO whose lines are all here is shown, not pickable. */
export function poPickerChoices(draft: GrnDraft): { kind: string; id: string; text: string; done: boolean }[] {
  return pendingPoGroups(draft).map((group) => ({
    kind: "PO",
    id: group.poId,
    text: `${group.label}  (${group.count} line${group.count === 1 ? "" : "s"} pending)`,
    done: group.left === 0,
  }));
}

/** Why From PO cannot open ("" = it can). */
export function poPickerRefusal(draft: GrnDraft): string {
  if (!isEditable(draft)) {
    return "PO lines come into a draft GRN — start a new one (Alt+N).";
  }
  if (!draft.supplierId) {
    return "Pick the supplier first — From PO lists its pending POs.";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Changing the draft
// ---------------------------------------------------------------------------

/** Qt `ensureTrailingBlankRow`: exactly one blank line waits at the bottom. */
export function ensureTrailingBlank(lines: GrnLine[]): GrnLine[] {
  const last = lines[lines.length - 1];
  return last && !rowHasItem(last) ? lines : [...lines, blankLine()];
}

function withLines(draft: GrnDraft, lines: GrnLine[], hint?: string): GrnDraft {
  return {
    ...draft,
    lines: isDraftStatus(draft) ? ensureTrailingBlank(lines) : lines,
    dirty: true,
    ...(hint !== undefined ? { hint } : {}),
  };
}

function patchLine(draft: GrnDraft, key: string, patch: Partial<GrnLine>): GrnDraft {
  return withLines(
    draft,
    draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
  );
}

export function setSupplier(draft: GrnDraft, id: string, name: string): GrnDraft {
  if (id === draft.supplierId) {
    return { ...draft, supplierName: name || draft.supplierName };
  }
  return { ...draft, supplierId: id, supplierName: name, pendingLines: [], pendingFor: "", poChoice: "", dirty: true };
}

export function setGodown(draft: GrnDraft, id: string, name: string): GrnDraft {
  return { ...draft, godownId: id, godownName: name, dirty: draft.dirty || id !== draft.godownId };
}

export type HeaderPatch = Partial<
  Pick<
    GrnDraft,
    | "challanNo"
    | "challanDate"
    | "vehicleNo"
    | "driverName"
    | "ewbNo"
    | "ewbDate"
    | "packagesSent"
    | "packagesReceived"
    | "remarks"
    | "loadmen"
  >
>;

export function patchHeader(draft: GrnDraft, patch: HeaderPatch): GrnDraft {
  return { ...draft, ...patch, dirty: true };
}

/** Received typed (Qt `m_dtReceived` editingFinished): the date part is the GRN date; sent on save. */
export function setReceivedAt(draft: GrnDraft, local: string): GrnDraft {
  const value = local.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || value === draft.receivedAt) {
    return draft;
  }
  return { ...draft, receivedAt: value.slice(0, 16), docDate: value.slice(0, 10), receivedTyped: true, dirty: true };
}

/** Qt `setSupervisor` → `syncReceivedBy`: one field, shown in both places. */
export function setSupervisor(draft: GrnDraft, id: string, name: string): GrnDraft {
  if (id === draft.supervisorId) {
    return draft;
  }
  return { ...draft, supervisorId: id, supervisorName: id ? name : "", dirty: true };
}

/** "Bala (supervisor)" — the Received by field (Qt `syncReceivedBy`). */
export function receivedByText(draft: GrnDraft): string {
  return draft.supervisorName ? `${draft.supervisorName} (supervisor)` : "";
}

/** The transport popup's OK (Qt `openTransport`): the band is sent on the next save. */
export function setTransport(draft: GrnDraft, band: PurchaseTransportBand | null): GrnDraft {
  return { ...draft, transport: band, transportTouched: true, dirty: true };
}

/** The supplier's pending PO lines arrived. A stale answer (another supplier since) is dropped. */
export function applyPendingLines(draft: GrnDraft, supplierId: string, rows: PendingPoLine[]): GrnDraft {
  if (supplierId !== draft.supplierId) {
    return draft;
  }
  return { ...draft, pendingLines: rows, pendingFor: supplierId };
}

/**
 * Qt `fillFromPo`: every pending line of the PO → a row (Challan = Received =
 * pending, at the PO's net rate); a PO line already on the grid is not added
 * twice. The rows go above the blank line.
 */
export function fillFromPo(draft: GrnDraft, poId: string): { draft: GrnDraft; added: number } {
  if (!isEditable(draft) || !poId) {
    return { draft, added: 0 };
  }
  const have = new Set(draft.lines.map((line) => line.poItemId).filter(Boolean));
  const kept = draft.lines.filter(rowHasItem);
  const added: GrnLine[] = [];
  for (const row of draft.pendingLines) {
    if (row.poId !== poId || have.has(row.poiId)) {
      continue;
    }
    const pending = qtyText(num(row.pendingQty));
    const mrp = num(row.mrp);
    added.push({
      ...blankLine(),
      itemId: row.itemId,
      itemName: text(row.itemName),
      uomId: row.uomId,
      unitName: text(row.unitName),
      poItemId: row.poiId,
      poItemAccYear: text(row.accYear),
      poRef: text(row.refno),
      poLineNo: row.lineNo !== undefined && row.lineNo !== null ? String(row.lineNo) : "",
      pending,
      challan: pending,
      recd: pending,
      rate: rateText(poNetRate(row)),
      mrp: mrp > 0 ? qtyText(mrp) : "",
    });
  }
  const hint =
    added.length > 0
      ? `${added.length} line${added.length === 1 ? "" : "s"} from the PO — change Received to what actually came.`
      : "Every line of that PO is already on this GRN.";
  if (added.length === 0) {
    return { draft: { ...draft, poChoice: poId, hint }, added: 0 };
  }
  return { draft: { ...withLines(draft, [...kept, ...added], hint), poChoice: poId }, added: added.length };
}

/** Qt `fillFromPos`: several POs of one supplier, one after the other; the hint sums them. */
export function fillFromPos(draft: GrnDraft, poIds: readonly string[]): { draft: GrnDraft; added: number } {
  let next = draft;
  let added = 0;
  for (const id of poIds) {
    const result = fillFromPo(next, id);
    next = result.draft;
    added += result.added;
  }
  if (poIds.length > 1) {
    next = {
      ...next,
      hint:
        added > 0
          ? `${added} line${added === 1 ? "" : "s"} from the PO — change Received to what actually came.`
          : "Every line of that PO is already on this GRN.",
    };
  }
  return { draft: next, added };
}

/** Qt `fetchItem`: an item lands on a line — its unit and MRP; quantities stay. */
export function applyItem(
  draft: GrnDraft,
  key: string,
  item: {
    itemId: string;
    itemName: string;
    uomId: string;
    unitName: string;
    mrp: number;
    barcode?: string;
    signature?: string;
  },
): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line) {
    return draft;
  }
  // Another item: the split and the textile cells were the old item's.
  const other = line.itemId !== "" && line.itemId !== item.itemId;
  return withLines(
    draft,
    draft.lines.map((candidate) =>
      candidate.key === key
        ? {
            ...candidate,
            itemId: item.itemId,
            itemName: item.itemName,
            uomId: item.uomId,
            unitName: item.unitName,
            mrp: item.mrp > 0 ? qtyText(item.mrp) : candidate.mrp,
            barcode: item.barcode ?? candidate.barcode,
            signature: text(item.signature).toUpperCase(),
            ...(other
              ? { allocs: [], sizeId: "", colourId: "", model: "", check: null, serverValue: "", damageReasonId: "", damageReasonName: "" }
              : {}),
          }
        : candidate,
    ),
    "",
  );
}

/**
 * Qt `fetchSignature`: a PO-filled or reopened line learns its tracking
 * signature. Only while the line still holds that item; never makes the draft dirty.
 */
export function setSignature(draft: GrnDraft, key: string, itemId: string, signature: string): GrnDraft {
  const sig = signature.trim().toUpperCase();
  let changed = false;
  const lines = draft.lines.map((line) => {
    if (line.key !== key || line.itemId !== itemId || line.signature === sig) {
      return line;
    }
    changed = true;
    return { ...line, signature: sig };
  });
  return changed ? { ...draft, lines } : draft;
}

type NumberField = "challan" | "recd" | "dmg" | "free" | "rate" | "mrp" | "sellA" | "sellB" | "sellC" | "sellD" | "excess";

const NUMBER_FIELDS: Partial<Record<number, NumberField>> = {
  [COL.Challan]: "challan",
  [COL.Recd]: "recd",
  [COL.Dmg]: "dmg",
  [COL.Free]: "free",
  [COL.Rate]: "rate",
  [COL.Mrp]: "mrp",
  [COL.SellA]: "sellA",
  [COL.SellB]: "sellB",
  [COL.SellC]: "sellC",
  [COL.SellD]: "sellD",
  [COL.Excess]: "excess",
};

const QTY_COLUMNS: ReadonlySet<number> = new Set([COL.Challan, COL.Recd, COL.Dmg, COL.Free]);

function lineNoOf(draft: GrnDraft, key: string): number {
  return draft.lines.findIndex((candidate) => candidate.key === key) + 1;
}

/** Qt `onCellEdited`: a typed cell. Received follows the Challan until it is typed itself. */
export function editCell(draft: GrnDraft, key: string, column: number, raw: string): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !isCellEditable(draft, line, column)) {
    return draft;
  }
  const value = raw.trim();
  const field = NUMBER_FIELDS[column];
  if (field) {
    // The estimate shows until /validate prices the line again (Qt `recalcRow`).
    const patch: Partial<GrnLine> = { [field]: value, serverValue: "" };
    if (column === COL.Challan && line.recd.trim() === "") {
      patch.recd = value;
    }
    // A damaged qty gone: its reason goes too.
    if (column === COL.Dmg && num(value) <= 0) {
      patch.damageReasonId = "";
      patch.damageReasonName = "";
    }
    const next = patchLine(draft, key, patch);
    if (isSplit(line) && QTY_COLUMNS.has(column)) {
      return { ...next, hint: `Line ${lineNoOf(draft, key)}: the qty changed — open F12 and make the batches add up again.` };
    }
    return next;
  }
  if (column === COL.Batch) {
    if (value && isTextileLine(draft, line) && (line.sizeId || line.colourId || line.model)) {
      return {
        ...patchLine(draft, key, { batch: value, sizeId: "", colourId: "", model: "" }),
        hint: `Line ${lineNoOf(draft, key)}: a typed batch carries no size / colour / model — leave Batch blank to have one given on Post.`,
      };
    }
    return patchLine(draft, key, { batch: value });
  }
  if (column === COL.Model) {
    return patchLine(draft, key, { model: raw.replace(/\s+/g, " ").trim() });
  }
  if (column === COL.Expiry) {
    const iso = expiryIso(value);
    const next = patchLine(draft, key, { expiry: iso ? slashDate(iso) : value });
    if (value && !iso) {
      const index = draft.lines.findIndex((candidate) => candidate.key === key);
      return { ...next, hint: `Line ${index + 1}: expiry must be dd/MM/yyyy.` };
    }
    return next;
  }
  return draft;
}

/** Size / Colour picked from the list (or emptied: id ""). */
export function setTextileChoice(draft: GrnDraft, key: string, field: "sizeId" | "colourId", id: string): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !isCellEditable(draft, line, field === "sizeId" ? COL.Size : COL.Colour) || line[field] === id) {
    return draft;
  }
  return patchLine(draft, key, { [field]: id });
}

/** Callout 3: the damage reason picked (or emptied: id ""). Only a damaged line has one. */
export function setDamageReason(draft: GrnDraft, key: string, id: string, name: string): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !isCellEditable(draft, line, COL.DmgReason) || line.damageReasonId === id) {
    return draft;
  }
  return patchLine(draft, key, { damageReasonId: id, damageReasonName: id ? name : "" });
}

/** The Excess action picked (Qt `cols.choices`). Only a PO line has one. */
export function setExcessAction(draft: GrnDraft, key: string, action: GrnExcessAction): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !isCellEditable(draft, line, COL.ExcessAct) || line.excessAction === action) {
    return draft;
  }
  const next = patchLine(draft, key, { excessAction: action });
  if (action === "RETURN") {
    return {
      ...next,
      hint: `Line ${lineNoOf(draft, key)}: key what went back at the gate in Excess — it is not in Received.`,
    };
  }
  return next;
}

// ---------------------------------------------------------------------------
// F12 — batches / serials (Qt `openAllocs` / `setLineAllocs`)
// ---------------------------------------------------------------------------

/** What the line's F12 rows must add up to. */
export function allocNeedOf(draft: GrnDraft, line: GrnLine): PurchaseAllocNeed {
  return {
    received: num(line.recd),
    damaged: num(line.dmg),
    free: num(line.free),
    serial: isSerialLine(line),
    textile: isTextileLine(draft, line),
    godownId: draft.godownId,
    godownName: draft.godownName || "(GRN's godown)",
  };
}

/** Why F12 cannot open on this line ("" = it can). */
export function allocRefusal(draft: GrnDraft, line: GrnLine | undefined): string {
  if (!line || !rowHasItem(line)) {
    return "Put the cursor on an item line, then F12.";
  }
  const need = allocNeedOf(draft, line);
  if (need.received + need.damaged + need.free <= 0) {
    return `Line ${lineNoOf(draft, line.key)}: key the qty first.`;
  }
  return "";
}

export type ChoiceNames = { size: (id: string) => string; colour: (id: string) => string };

/**
 * The rows F12 opens with: the line's split, else what is typed on the row (one
 * SALEABLE row, + its DAMAGED twin), else none. Godown left blank = the GRN's.
 */
export function seedAllocs(draft: GrnDraft, line: GrnLine, names: ChoiceNames): PurchaseAllocEntry[] {
  if (isSplit(line)) {
    return line.allocs.map((row) => ({ ...row }));
  }
  const expiry = expiryIso(line.expiry);
  const typed = line.batch.trim() || expiry || line.sizeId || line.colourId || line.model;
  if (!typed) {
    return [];
  }
  const need = allocNeedOf(draft, line);
  const mrp = num(line.mrp);
  const base: Omit<PurchaseAllocEntry, "bucket" | "qty"> = {
    ...(line.sizeId ? { sizeId: line.sizeId, sizeName: names.size(line.sizeId) } : {}),
    ...(line.colourId ? { colourId: line.colourId, colourName: names.colour(line.colourId) } : {}),
    ...(line.model ? { model: line.model } : {}),
    ...(line.batch.trim() ? { batchNo: line.batch.trim() } : {}),
    ...(expiry ? { expiryDate: expiry } : {}),
    ...(mrp > 0 ? { mrp } : {}),
  };
  const rows: PurchaseAllocEntry[] = [];
  if (need.received + need.free > 0) {
    rows.push({ ...base, bucket: "SALEABLE", qty: need.received, ...(need.free > 0 ? { freeQty: need.free } : {}) });
  }
  if (need.damaged > 0) {
    rows.push({ ...base, bucket: "DAMAGED", qty: need.damaged });
  }
  return rows;
}

const SAME_KEYS = ["batchNo", "expiryDate", "mrp", "sizeId", "colourId", "model", "godownId"] as const;

function same(a: PurchaseAllocEntry, b: PurchaseAllocEntry): boolean {
  return SAME_KEYS.every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

/**
 * Qt `setLineAllocs`: one SALEABLE row (+ its DAMAGED twin) without serials or
 * a mfg date goes back onto the row as Batch / Expiry / textile; anything more
 * stays the line's split ("3 batches (F12)"). A row sent to ANOTHER godown also
 * stays a split — folded, its godown would be lost (the row's cells have none).
 */
export function foldAllocs(
  draft: GrnDraft,
  line: GrnLine,
  rows: readonly PurchaseAllocEntry[],
): Pick<GrnLine, "allocs" | "batch" | "expiry" | "mrp" | "sizeId" | "colourId" | "model"> {
  const first = rows[0];
  const otherGodown = rows.some((row) => (row.godownId ?? "") !== "" && row.godownId !== draft.godownId);
  const simple =
    first !== undefined &&
    rows.length <= 2 &&
    first.bucket === "SALEABLE" &&
    !otherGodown &&
    rows.every((row) => !(row.serialNo ?? "").trim() && !(row.mfgDate ?? "").trim() && !(row.warrantyTo ?? "").trim()) &&
    (rows.length === 1 || (rows[1].bucket === "DAMAGED" && same(first, rows[1])));
  if (simple) {
    const expiry = text(first.expiryDate).slice(0, 10);
    return {
      allocs: [],
      batch: text(first.batchNo),
      expiry: expiry ? slashDate(expiry) : "",
      mrp: first.mrp !== undefined && first.mrp > 0 ? qtyText(first.mrp) : line.mrp,
      sizeId: text(first.sizeId),
      colourId: text(first.colourId),
      model: text(first.model),
    };
  }
  return { allocs: rows.map((row) => ({ ...row })), batch: "", expiry: "", mrp: line.mrp, sizeId: "", colourId: "", model: "" };
}

/** F12 accepted: the rows onto the line. */
export function setLineAllocs(draft: GrnDraft, key: string, rows: readonly PurchaseAllocEntry[]): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !rowHasItem(line) || !isEditable(draft)) {
    return draft;
  }
  return { ...patchLine(draft, key, foldAllocs(draft, line, rows)), hint: "" };
}

/** "3 batches (F12)" / "1 serial (F12)" — the Batch cell of a split line. */
export function splitLabel(line: GrnLine): string {
  const n = line.allocs.length;
  const serial = line.allocs.some((row) => (row.serialNo ?? "").trim() !== "");
  if (serial) {
    return n === 1 ? "1 serial (F12)" : `${n} serials (F12)`;
  }
  return n === 1 ? "1 batch (F12)" : `${n} batches (F12)`;
}

/** Qt `lineRemoveRequested`: drop the line; one blank line stays at the bottom. */
export function removeLine(draft: GrnDraft, key: string): GrnDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  return withLines(
    draft,
    draft.lines.filter((line) => line.key !== key),
  );
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export type SaveRefusal = { title: string; message: string; focus?: "supplier" | "godown" | "lines" };

/** Qt `saveDocument`'s checks, plus an expiry that is no date (Qt would drop it silently). */
export function saveRefusal(draft: GrnDraft): SaveRefusal | null {
  if (!isDraftStatus(draft)) {
    return { title: "Not a draft", message: `${draft.refno || "This GRN"} is ${draft.status}.` };
  }
  if (!draft.supplierId || !draft.godownId) {
    return {
      title: "Header incomplete",
      message: "Pick the supplier and the godown.",
      focus: draft.supplierId ? "godown" : "supplier",
    };
  }
  const lines = draft.lines.filter(rowHasItem);
  if (lines.length === 0) {
    return { title: "No lines", message: "Add at least one item, or pick a PO.", focus: "lines" };
  }
  const index = draft.lines.findIndex((line) => rowHasItem(line) && line.expiry.trim() !== "" && !expiryIso(line.expiry));
  if (index >= 0) {
    return { title: "Expiry", message: `Line ${index + 1}: expiry must be dd/MM/yyyy.`, focus: "lines" };
  }
  return null;
}

/** Qt `buildPayload`. */
/** Local `yyyy-MM-ddTHH:mm` → an ISO instant with zone ("" when it is none). */
export function receivedAtIso(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!match) {
    return "";
  }
  const at = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  return Number.isNaN(at.getTime()) ? "" : at.toISOString();
}

/** An ISO instant → local `yyyy-MM-ddTHH:mm` ("" when it is none). */
export function localDateTimeOf(iso: string): string {
  const at = new Date(iso);
  if (!iso || Number.isNaN(at.getTime())) {
    return "";
  }
  const two = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}:${two(at.getMinutes())}`;
}

function wholeOrUndefined(value: string): number | undefined {
  const t = value.trim();
  return /^\d+$/.test(t) ? Number(t) : undefined;
}

export type GrnOverride = { reason: string };

/** Qt `buildPayload` (+ the override of `saveDocument`). */
export function buildSavePayload(draft: GrnDraft, post: boolean, override?: GrnOverride): SaveGrnDto {
  const receivedAt = draft.receivedTyped ? receivedAtIso(draft.receivedAt) : "";
  const sent = wholeOrUndefined(draft.packagesSent);
  const recdPk = wholeOrUndefined(draft.packagesReceived);
  const header: SaveGrnDto["header"] = {
    ...(draft.grnId ? { grnId: draft.grnId } : {}),
    companyId: draft.companyId,
    branchId: draft.branchId,
    accYear: draft.accYear,
    deviceId: draft.deviceId,
    supplierId: draft.supplierId,
    godownId: draft.godownId,
    docDate: draft.docDate,
    ...(receivedAt ? { receivedAt } : {}),
    ...(draft.challanNo.trim() ? { challanNo: draft.challanNo.trim() } : {}),
    ...(draft.challanDate ? { challanDate: draft.challanDate } : {}),
    ...(draft.vehicleNo.trim() ? { vehicleNo: draft.vehicleNo.trim() } : {}),
    ...(draft.driverName.trim() ? { driverName: draft.driverName.trim() } : {}),
    ...(draft.supervisorId ? { supervisorId: draft.supervisorId } : {}),
    ...(draft.ewbNo.trim() ? { ewbNo: draft.ewbNo.trim() } : {}),
    ...(draft.ewbDate ? { ewbDate: draft.ewbDate } : {}),
    ...(sent !== undefined ? { packagesSent: sent } : {}),
    ...(recdPk !== undefined ? { packagesReceived: recdPk } : {}),
    ...(draft.remarks.trim() ? { remarks: draft.remarks.trim() } : {}),
    receivedBy: draft.loadmen.map((man) => man.id),
    // omitted = the saved band is kept; null = removed (the popup cleared it)
    ...(draft.transportTouched ? { transport: draft.transport } : {}),
    post,
  };
  if (post && override) {
    header.overrideWarnings = true;
    header.overrideReason = override.reason.trim().slice(0, 250);
  }
  const lines: GrnLineDto[] = [];
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    const recd = num(line.recd);
    const dmg = num(line.dmg);
    const free = num(line.free);
    const mrp = num(line.mrp);
    const excess = num(line.excess);
    const dto: GrnLineDto = {
      lineNo: lines.length + 1,
      itemId: line.itemId,
      uomId: line.uomId,
      ...(line.poItemId ? { poItemId: line.poItemId } : {}),
      ...(line.poItemId && line.poItemAccYear ? { poItemAccYear: line.poItemAccYear } : {}),
      ...(line.challan.trim() !== "" ? { challanQty: num(line.challan) } : {}),
      receivedQty: recd,
      ...(dmg > 0 ? { damagedQty: dmg } : {}),
      ...(dmg > 0 && line.damageReasonId ? { damageReasonId: line.damageReasonId } : {}),
      ...(free > 0 ? { freeQty: free } : {}),
      ...(line.poItemId && line.excessAction ? { excessAction: line.excessAction } : {}),
      ...(line.poItemId && line.excessAction === "RETURN" && excess > 0 ? { excessQty: excess } : {}),
      rate: num(line.rate),
      ...(mrp > 0 ? { mrp } : {}),
    };
    if (draft.priceAtGrn) {
      for (const key of ["sellA", "sellB", "sellC", "sellD"] as const) {
        const price = num(line[key]);
        if (price > 0) {
          dto[key] = price;
        }
      }
    }
    if (isSplit(line)) {
      // The F12 rows, each in the GRN's godown unless it names another.
      dto.allocs = line.allocs.map((row) => {
        const wire = allocDtoOf(row) as GrnAllocDto;
        return wire.godownId ? wire : { ...wire, godownId: draft.godownId };
      });
      lines.push(dto);
      continue;
    }
    const batch = line.batch.trim();
    const expiry = expiryIso(line.expiry);
    if (batch || expiry || line.sizeId || line.colourId || line.model) {
      const alloc = (bucket: PurchaseAllocBucket, qty: number, freeQty: number): GrnAllocDto => ({
        bucket,
        ...(batch ? { batchNo: batch } : {}),
        ...(expiry ? { expiryDate: expiry } : {}),
        ...(mrp > 0 ? { mrp } : {}),
        ...(line.sizeId ? { sizeId: line.sizeId } : {}),
        ...(line.colourId ? { colourId: line.colourId } : {}),
        ...(line.model ? { model: line.model } : {}),
        qty,
        ...(freeQty > 0 ? { freeQty } : {}),
      });
      dto.allocs = [
        ...(recd + free > 0 ? [alloc("SALEABLE", recd, free)] : []),
        ...(dmg > 0 ? [alloc("DAMAGED", dmg, 0)] : []),
      ];
    }
    lines.push(dto);
  }
  const body: SaveGrnDto = { header, lines };
  // The operator's own set; else the server puts in the coolie for the loadmen.
  if (draft.chargesTouched) {
    const charges = chargesPayload(draft.charges);
    if (charges.length > 0) {
      body.charges = charges;
    }
    if (!hasUnloadingRow(draft.charges)) {
      header.payCoolie = false;
    }
  }
  return body;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function qtyOrBlank(value: unknown): string {
  const n = num(value);
  return n > 0 ? qtyText(n) : "";
}

/** A stored allocation row in the shape F12 edits and the save sends (Qt `applyLoaded`). */
export function allocFromWire(wire: GrnAllocWire): PurchaseAllocEntry {
  const put = (value: unknown, len?: number) => {
    const t = text(value);
    return len ? t.slice(0, len) : t;
  };
  const bucket: PurchaseAllocBucket = put(wire.piaBucket).toUpperCase() === "DAMAGED" ? "DAMAGED" : "SALEABLE";
  const row: PurchaseAllocEntry = { bucket, qty: num(wire.piaQty) };
  const set = <K extends keyof PurchaseAllocEntry>(key: K, value: PurchaseAllocEntry[K] | "") => {
    if (value !== "" && value !== undefined) {
      row[key] = value as PurchaseAllocEntry[K];
    }
  };
  set("godownId", put(wire.piaGodownId));
  set("batchNo", put(wire.piaBatchNo));
  set("mfgDate", put(wire.piaMfgDate, 10));
  set("expiryDate", put(wire.piaExpiryDate, 10));
  set("serialNo", put(wire.piaSerialNo));
  set("warrantyTo", put(wire.piaWarrantyTo, 10));
  set("sizeId", put(wire.piaSizeId));
  set("colourId", put(wire.piaColourId));
  set("model", put(wire.piaModel));
  if (num(wire.piaMrp) > 0) {
    row.mrp = num(wire.piaMrp);
  }
  if (num(wire.piaFreeQty) > 0) {
    row.freeQty = num(wire.piaFreeQty);
  }
  return row;
}

function excessActionOf(value: unknown): GrnExcessAction {
  const action = text(value).toUpperCase();
  return action === "HOLD_FOR_BILL" || action === "KEEP_FREE" || action === "RETURN" ? action : "";
}

/**
 * Qt `applyLoaded`: the server's document onto the screen. The session's
 * device stays the one a re-save is made from; a godown name the answer does
 * not carry is kept when the id is the one already shown.
 */
export function fromPayload(
  previous: GrnDraft,
  payload: GrnPayload,
  opts: { viewMode: "browse" | "entry"; deviceId: string },
): GrnDraft {
  const h = payload.header;
  const status = text(h.grnStatus).toUpperCase() || "DRAFT";
  const supplierId = text(h.grnSupplierId);
  const godownId = text(h.grnGodownId);
  // The fold compares a row's godown with the GRN's — the loaded one.
  const foldScope = { ...previous, godownId };
  const lines: GrnLine[] = (payload.lines ?? []).map((wire) => {
    const sameItem = previous.lines.find((old) => old.lineId === wire.griId && old.itemId === wire.griItemId);
    const base: GrnLine = {
      ...blankLine(),
      lineId: wire.griId,
      itemId: wire.griItemId,
      itemName: text(wire.itemName),
      uomId: wire.griUomId,
      unitName: text(wire.unitName),
      poItemId: text(wire.griSrcItemId),
      poItemAccYear: text(wire.griSrcDocYear),
      poRef: text(wire.poRefno),
      challan: qtyText(num(wire.griChallanQty)),
      recd: qtyText(num(wire.griReceivedQty)),
      dmg: qtyOrBlank(wire.griDamagedQty),
      damageReasonId: text(wire.griDamageReasonId),
      damageReasonName: text(wire.damageReasonName),
      serverValue: wire.griValue === undefined || wire.griValue === null ? "" : text(wire.griValue),
      check: wire.check ?? null,
      billRefno: wire.billed ? text(wire.billRefno) : "",
      free: qtyOrBlank(wire.griFreeQty),
      rate: text(wire.griProvisionalRate),
      mrp: qtyOrBlank(wire.griMrp),
      // A re-save of the same line keeps the signature already fetched.
      signature: sameItem?.signature ?? "",
      sellA: qtyOrBlank(wire.griSellA),
      sellB: qtyOrBlank(wire.griSellB),
      sellC: qtyOrBlank(wire.griSellC),
      sellD: qtyOrBlank(wire.griSellD),
      excess: qtyOrBlank(wire.griExcessQty),
      excessAction: excessActionOf(wire.griExcessAction),
    };
    const rows = (wire.allocs ?? []).map(allocFromWire);
    return rows.length > 0 ? { ...base, ...foldAllocs(foldScope, base, rows) } : base;
  });
  const loadmen = (h.receivedBy ?? []).map((man) => ({ id: man.id, text: text(man.name) || man.id }));
  const charges = foldServerCharges([], payload.charges ?? [], { touched: false, loadmen, masters: [] });
  const anyCharge = charges.length > 0;
  const receivedAt = localDateTimeOf(text(h.grnReceivedAt)) || `${text(h.grnDocDate).slice(0, 10)}T00:00`;
  const draft: GrnDraft = {
    ...previous,
    grnId: text(h.grnId),
    refno: text(h.grnRefno),
    status,
    companyId: text(h.grnCompanyId) || previous.companyId,
    branchId: text(h.grnBranchId) || previous.branchId,
    accYear: text(h.grnAccYear) || previous.accYear,
    deviceId: opts.deviceId || text(h.grnDeviceId) || previous.deviceId,
    supplierId,
    supplierName: text(h.supplierName),
    godownId,
    godownName: text(h.godownName) || (godownId === previous.godownId ? previous.godownName : ""),
    docDate: text(h.grnDocDate).slice(0, 10),
    receivedAt,
    // the saved time stands unless typed again
    receivedTyped: false,
    challanNo: text(h.grnChallanNo),
    challanDate: text(h.grnChallanDate).slice(0, 10),
    vehicleNo: text(h.grnVehicleNo),
    driverName: text(h.grnDriverName),
    supervisorId: text(h.grnSupervisorId),
    supervisorName: h.grnSupervisorId ? text(h.supervisorName) : "",
    ewbNo: text(h.grnEwbNo),
    ewbDate: text(h.grnEwbDate).slice(0, 10),
    packagesSent: typeof h.grnPackagesSent === "number" ? String(h.grnPackagesSent) : "",
    packagesReceived: typeof h.grnPackagesReceived === "number" ? String(h.grnPackagesReceived) : "",
    transport: h.transport ?? null,
    // omitted on the next save = the band is kept
    transportTouched: false,
    remarks: text(h.grnRemarks),
    loadmen,
    charges,
    // a saved set is re-sent as it is (a re-save would otherwise drop own-lorry freight)
    chargesTouched: anyCharge,
    // saved without the coolie: it was taken out
    coolieDropped: anyCharge && loadmen.length > 0 && !hasUnloadingRow(charges),
    serverTotals: payload.totals ?? null,
    warnings: [],
    refusals: [],
    overrideTicked: false,
    lines: status === "DRAFT" ? ensureTrailingBlank(lines) : lines,
    pendingLines: supplierId === previous.pendingFor ? previous.pendingLines : [],
    pendingFor: supplierId === previous.pendingFor ? previous.pendingFor : "",
    poChoice: "",
    coolie: num(h.grnOffbillCharges),
    billed: billStatusOf(h.billStatus) === "BILLED",
    billStatus: billStatusOf(h.billStatus),
    viewMode: status === "DRAFT" ? opts.viewMode : "browse",
    dirty: false,
    hint: "",
  };
  return draft;
}

function billStatusOf(value: unknown): GrnBillStatus {
  const status = text(value).toUpperCase();
  return status === "BILLED" || status === "PART" ? status : "NOT_BILLED";
}

/** The pill (Qt `applyStatus`): DRAFT / POSTED / CANCELLED, and BILLED / PART BILLED once a bill takes it. */
export function statusPill(draft: GrnDraft): { label: string; status: string } {
  const status = (draft.status || "DRAFT").toUpperCase();
  if (status === "POSTED" && draft.billStatus === "BILLED") {
    return { label: "BILLED", status: "BILLED" };
  }
  if (status === "POSTED" && draft.billStatus === "PART") {
    return { label: "PART BILLED", status: "PART_BILLED" };
  }
  return { label: status, status };
}

/** Qt `applyStatus`'s Bill status field: blank on a new GRN. */
export function billStatusText(draft: GrnDraft): string {
  if (!draft.grnId) {
    return "";
  }
  const bills: string[] = [];
  for (const line of draft.lines) {
    if (line.billRefno && !bills.includes(line.billRefno)) {
      bills.push(line.billRefno);
    }
  }
  if (draft.billStatus === "BILLED") {
    return `Billed — ${bills.join(", ")}`;
  }
  if (draft.billStatus === "PART") {
    return `Part billed — ${bills.join(", ")}`;
  }
  return "Not billed yet";
}

/** Make bill (Ctrl+B) is open: posted and not every line billed (Qt `applyStatus`). */
export function makeBillRefusal(draft: GrnDraft): string {
  if ((draft.status || "").toUpperCase() !== "POSTED") {
    return "Post the GRN first — a bill takes a posted GRN";
  }
  return draft.billStatus === "BILLED" ? "Every line of this GRN is billed" : "";
}

/** The title: "GRN — new" / "GRN — <no>". */
export function titleLine(draft: GrnDraft): string {
  return draft.refno ? `GRN — ${draft.refno}` : "GRN — new";
}

/**
 * Qt `recalcTotals` + `applyLoaded`'s tail: "3 lines · Qty 12" · "Value 1,520.00
 * (provisional — the bill decides)" · "Short on challan 2" · "Coolie 40.00" · "Billed".
 */
export function totalsParts(
  draft: GrnDraft,
  totals: GrnTotals,
): { lead: string; value: string; short: string; coolie: string; billed: boolean } {
  return {
    lead: `${totals.lines} line${totals.lines === 1 ? "" : "s"} · Qty ${qtyText(totals.qty)}`,
    value: money(totals.value),
    short: totals.short > 0 ? qtyText(totals.short) : "",
    coolie: draft.coolie > 0 ? money(draft.coolie) : "",
    billed: draft.billed,
  };
}

/** Is this column one the screen reads off a known line without editing it? */
export function cellReadOnlyWhy(draft: GrnDraft, line: GrnLine, column: number): string {
  if (!isEditable(draft) || !rowHasItem(line)) {
    return "";
  }
  if (column === COL.Item && line.poItemId) {
    return "A PO line receives the PO's item. Remove the line to key another.";
  }
  if (column === COL.Short) {
    return "Challan − Received − Damaged; the server parks it on post.";
  }
  if (column === COL.Value) {
    return "(Received + Damaged) × Rate — provisional; the bill decides.";
  }
  if (column === COL.Pending || column === COL.PoRef) {
    return "From the PO line this row receives.";
  }
  if (column === COL.Unit) {
    return "The unit comes with the item (or the PO line).";
  }
  if ((column === COL.Batch || column === COL.Expiry) && isSplit(line)) {
    return "Split in F12 — open Batches / serials (F12) to change it.";
  }
  if (column === COL.Size || column === COL.Colour || column === COL.Model) {
    if (isSplit(line)) {
      return "Split in F12 — open Batches / serials (F12) to change it.";
    }
    if (!isTextileLine(draft, line)) {
      return line.signature
        ? "This item does not track batches — no size / colour / model."
        : "Waiting for the item's tracking — a batch-tracked line takes size / colour / model.";
    }
    if (line.batch.trim()) {
      return "A typed batch carries no size / colour / model — clear Batch to have one given on Post.";
    }
  }
  if (column === COL.ExcessAct) {
    return "Only a PO line can come over the PO.";
  }
  if (column === COL.Excess) {
    return line.poItemId
      ? "Key Excess only for RETURN (sent back at the gate); held or kept-free excess is the server's figure."
      : "Only a PO line can come over the PO.";
  }
  return "";
}
