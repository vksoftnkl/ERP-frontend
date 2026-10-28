/**
 * GRN (menu 196) — every rule of the Qt `GrnEntry`, as pure functions over the
 * draft. The hook (`use-grn-draft.ts`) only fetches and commits.
 *
 * What the client works out is the operator's arithmetic, never what posts:
 * Short = Challan − Received − Damaged (the server parks it on post), Value =
 * (Received + Damaged) × the provisional rate (the server's
 * grnProvisionalValue is the figure that posts).
 */
import { fromDisplayDate } from "@/features/sales/quotation/quotation.utils";
import { isoFromTyped, money, num, qtyText, text } from "../shared/purchase.format";
import { COL, ENTER_STOPS } from "./grn.constants";
import type {
  GrnDraft,
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
    pending: "",
    challan: "",
    recd: "",
    dmg: "",
    free: "",
    rate: "",
    batch: "",
    expiry: "",
    mrp: "",
  };
}

/** Qt `resetScreen`. */
export function createDraft(scope: GrnScope, today: string): GrnDraft {
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
    challanNo: "",
    challanDate: "",
    vehicleNo: "",
    remarks: "",
    loadmen: [],
    lines: [blankLine()],
    pendingLines: [],
    pendingFor: "",
    poChoice: "",
    coolie: 0,
    billed: false,
    viewMode: "entry",
    dirty: false,
    hint: "",
  };
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
    case COL.Challan:
    case COL.Recd:
    case COL.Dmg:
    case COL.Free:
    case COL.Rate:
    case COL.Batch:
    case COL.Expiry:
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

/** "dd/MM/yyyy", "dd-MM-yyyy", ISO or eight digits → ISO; "" when it is no date. */
export function expiryIso(typed: string): string {
  const value = typed.trim();
  if (!value) {
    return "";
  }
  return isoFromTyped(value) || fromDisplayDate(value) || "";
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

export type PoOption = { value: string; label: string };

/** The "Against PO" choices: one per PO, in the server's order, with its pending line count. */
export function poOptions(draft: GrnDraft, loading: boolean): PoOption[] {
  if (!draft.supplierId) {
    return [{ value: "", label: "— pick the supplier —" }];
  }
  if (loading && draft.pendingFor !== draft.supplierId) {
    return [{ value: "", label: "loading…" }];
  }
  const order: string[] = [];
  const count = new Map<string, number>();
  const label = new Map<string, string>();
  for (const row of draft.pendingLines) {
    if (!count.has(row.poId)) {
      order.push(row.poId);
      label.set(row.poId, `${row.refno} · ${slashDate(text(row.docDate))}`);
    }
    count.set(row.poId, (count.get(row.poId) ?? 0) + 1);
  }
  const head: PoOption = { value: "", label: order.length === 0 ? "— no open PO —" : "— without PO —" };
  return [
    head,
    ...order.map((id) => {
      const n = count.get(id) ?? 0;
      return { value: id, label: `${label.get(id)} (${n} line${n === 1 ? "" : "s"} pending)` };
    }),
  ];
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
  Pick<GrnDraft, "docDate" | "challanNo" | "challanDate" | "vehicleNo" | "remarks" | "loadmen">
>;

export function patchHeader(draft: GrnDraft, patch: HeaderPatch): GrnDraft {
  return { ...draft, ...patch, dirty: true };
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
      poRef: lastSegment(text(row.refno)),
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

/** Qt `fetchItem`: an item lands on a line — its unit and MRP; quantities stay. */
export function applyItem(
  draft: GrnDraft,
  key: string,
  item: { itemId: string; itemName: string; uomId: string; unitName: string; mrp: number; barcode?: string },
): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line) {
    return draft;
  }
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
          }
        : candidate,
    ),
    "",
  );
}

const NUMBER_FIELDS: Partial<Record<number, keyof GrnLine>> = {
  [COL.Challan]: "challan",
  [COL.Recd]: "recd",
  [COL.Dmg]: "dmg",
  [COL.Free]: "free",
  [COL.Rate]: "rate",
  [COL.Mrp]: "mrp",
};

/** Qt `onCellEdited`: a typed cell. Received follows the Challan until it is typed itself. */
export function editCell(draft: GrnDraft, key: string, column: number, raw: string): GrnDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !isCellEditable(draft, line, column)) {
    return draft;
  }
  const value = raw.trim();
  const field = NUMBER_FIELDS[column];
  if (field) {
    const patch: Partial<GrnLine> = { [field]: value };
    if (column === COL.Challan && line.recd.trim() === "") {
      patch.recd = value;
    }
    return patchLine(draft, key, patch);
  }
  if (column === COL.Batch) {
    return patchLine(draft, key, { batch: value });
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
export function buildSavePayload(draft: GrnDraft, post: boolean): SaveGrnDto {
  const header: SaveGrnDto["header"] = {
    ...(draft.grnId ? { grnId: draft.grnId } : {}),
    companyId: draft.companyId,
    branchId: draft.branchId,
    accYear: draft.accYear,
    deviceId: draft.deviceId,
    supplierId: draft.supplierId,
    godownId: draft.godownId,
    docDate: draft.docDate,
    ...(draft.challanNo.trim() ? { challanNo: draft.challanNo.trim() } : {}),
    ...(draft.challanDate ? { challanDate: draft.challanDate } : {}),
    ...(draft.vehicleNo.trim() ? { vehicleNo: draft.vehicleNo.trim() } : {}),
    ...(draft.remarks.trim() ? { remarks: draft.remarks.trim() } : {}),
    receivedBy: draft.loadmen.map((man) => man.id),
    post,
  };
  const lines: GrnLineDto[] = [];
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    const recd = num(line.recd);
    const dmg = num(line.dmg);
    const free = num(line.free);
    const mrp = num(line.mrp);
    const dto: GrnLineDto = {
      lineNo: lines.length + 1,
      itemId: line.itemId,
      uomId: line.uomId,
      ...(line.poItemId ? { poItemId: line.poItemId } : {}),
      ...(line.poItemId && line.poItemAccYear ? { poItemAccYear: line.poItemAccYear } : {}),
      ...(line.challan.trim() !== "" ? { challanQty: num(line.challan) } : {}),
      receivedQty: recd,
      ...(dmg > 0 ? { damagedQty: dmg } : {}),
      ...(free > 0 ? { freeQty: free } : {}),
      rate: num(line.rate),
      ...(mrp > 0 ? { mrp } : {}),
    };
    const batch = line.batch.trim();
    const expiry = expiryIso(line.expiry);
    if (batch || expiry) {
      const alloc = (bucket: "SALEABLE" | "DAMAGED", qty: number, freeQty: number) => ({
        bucket,
        ...(batch ? { batchNo: batch } : {}),
        ...(expiry ? { expiryDate: expiry } : {}),
        ...(mrp > 0 ? { mrp } : {}),
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
  return { header, lines };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function qtyOrBlank(value: unknown): string {
  const n = num(value);
  return n > 0 ? qtyText(n) : "";
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
  const lines: GrnLine[] = (payload.lines ?? []).map((wire) => {
    const first = wire.allocs?.[0];
    const expiry = text(first?.piaExpiryDate);
    return {
      ...blankLine(),
      lineId: wire.griId,
      itemId: wire.griItemId,
      itemName: text(wire.itemName),
      uomId: wire.griUomId,
      unitName: text(wire.unitName),
      poItemId: text(wire.griSrcItemId),
      poItemAccYear: text(wire.griSrcDocYear),
      poRef: lastSegment(text(wire.poRefno)),
      challan: qtyText(num(wire.griChallanQty)),
      recd: qtyText(num(wire.griReceivedQty)),
      dmg: qtyOrBlank(wire.griDamagedQty),
      free: qtyOrBlank(wire.griFreeQty),
      rate: text(wire.griProvisionalRate),
      mrp: qtyOrBlank(wire.griMrp),
      batch: text(first?.piaBatchNo),
      expiry: expiry ? slashDate(expiry) : "",
    };
  });
  const supplierId = text(h.grnSupplierId);
  const godownId = text(h.grnGodownId);
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
    godownName: godownId === previous.godownId ? previous.godownName : "",
    docDate: text(h.grnDocDate).slice(0, 10),
    challanNo: text(h.grnChallanNo),
    challanDate: text(h.grnChallanDate).slice(0, 10),
    vehicleNo: text(h.grnVehicleNo),
    remarks: text(h.grnRemarks),
    loadmen: (h.receivedBy ?? []).map((man) => ({ id: man.id, text: text(man.name) || man.id })),
    lines: status === "DRAFT" ? ensureTrailingBlank(lines) : lines,
    pendingLines: supplierId === previous.pendingFor ? previous.pendingLines : [],
    pendingFor: supplierId === previous.pendingFor ? previous.pendingFor : "",
    poChoice: "",
    coolie: num(h.grnOffbillCharges),
    billed: text(h.billStatus).toUpperCase() === "BILLED",
    viewMode: status === "DRAFT" ? opts.viewMode : "browse",
    dirty: false,
    hint: "",
  };
  return draft;
}

/** The status pill's words. */
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
  return "";
}
