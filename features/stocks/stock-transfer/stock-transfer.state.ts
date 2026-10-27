/**
 * Godown Transfer / Branch Outward — every rule of the screen as a pure
 * function of the draft (the Qt `GodownTransferEntry`'s grid maths, gates and
 * status handling). No network, no DOM: `use-stock-transfer-draft.ts` does the
 * asking, the view draws the answers.
 *
 * Every line is a HOLDING picked from the From godown (item × lot × bucket),
 * so the lot is always known and the cost is never typed: the engine stamps
 * the OUT row and the IN row carries that figure.
 */
import { addDays } from "@/features/sales/quotation/quotation.utils";
import { batchDetailItemText } from "@/features/stocks/shared/batch-detail";
import { cellNumber, dateFromWire, qtyCell } from "@/features/stocks/stock-adjustment/stock-adjustment.format";
import { COL, MODE_INFO } from "./stock-transfer.constants";
import type {
  AuditStamps,
  DraftScope,
  Handling,
  TransferDraft,
  TransferHeaderPayload,
  TransferLine,
  TransferPickRow,
  TransitRow,
} from "./stock-transfer.types";
import type { TransferMode } from "./stock-transfer.constants";

const EPSILON = 0.0000005;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function two(value: number): string {
  return String(value).padStart(2, "0");
}

/** `datetime-local` text for an instant, in the browser's own clock. */
export function localTextOf(at: Date): string {
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}T${two(at.getHours())}:${two(at.getMinutes())}`;
}

export function nowLocalText(now: Date = new Date()): string {
  return localTextOf(now);
}

/** A wire timestamp as `datetime-local` text; the current time when it is not there. */
export function localTextFromWire(iso: string | null | undefined, now: Date = new Date()): string {
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) ? localTextOf(at) : localTextOf(now);
}

/** `datetime-local` text to the UTC instant the server takes; "" when it is not a time. */
export function wireFromLocalText(text: string): string {
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? "" : at.toISOString();
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

let lineSeq = 0;
export function newLineKey(): string {
  lineSeq += 1;
  return `tl-${Date.now().toString(36)}-${lineSeq}`;
}

export function blankLine(): TransferLine {
  return {
    key: newLineKey(),
    id: null,
    barcode: "",
    itemId: "",
    itemCode: "",
    itemName: "",
    lotId: "",
    bucket: "",
    batchNo: "",
    expiryDate: "",
    mrp: null,
    uomId: "",
    uomName: "",
    baseUomId: "",
    toBaseFactor: 1,
    available: null,
    freeAvailableBase: null,
    qty: "",
    freeQty: "",
    costRate: null,
    loadRate: "",
    unloadRate: "",
  };
}

export function rowHasItem(line: TransferLine): boolean {
  return line.itemId !== "";
}

/** A number as the rate cells hold it: blank for none. */
export function rateText(value: number | null | undefined): string {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : "";
}

/** A quantity as the Qty / Free cells hold it: blank for none. */
function qtyText(value: number | null | undefined): string {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? qtyCell(number) : "";
}

/** The Qt `lineFromPayload` — one stored line as the grid holds it. */
export function lineFromPayload(line: import("./stock-transfer.types").TransferLinePayload): TransferLine {
  const factor = Number(line.toBaseFactor) > 0 ? Number(line.toBaseFactor) : 1;
  const mrp = Number(line.mrp);
  return {
    key: newLineKey(),
    id: line.sviId || null,
    barcode: line.barcode ?? "",
    itemId: line.itemId,
    itemCode: line.itemCode ?? "",
    itemName: batchDetailItemText(line),
    lotId: line.lotId ?? "",
    bucket: line.bucket ?? "",
    batchNo: line.batchNo ?? "",
    expiryDate: dateFromWire(line.expiryDate),
    mrp: mrp > 0 ? mrp : null,
    uomId: line.uomId,
    uomName: line.unitName ?? "",
    baseUomId: line.baseUomId,
    toBaseFactor: factor,
    available: null,
    freeAvailableBase: null,
    qty: qtyText(line.qty),
    freeQty: qtyText(line.freeQty),
    // A posted line carries the cost the engine stamped (per base unit).
    costRate: (Number(line.costRate) || 0) * factor,
    loadRate: rateText(line.loadRate),
    unloadRate: rateText(line.unloadRate),
  };
}

/** What the line moves: its quantity plus its free quantity. */
export function lineMoved(line: TransferLine): number {
  return cellNumber(line.qty) + cellNumber(line.freeQty);
}

/** The line's value at the cost the stock leaves at. */
export function lineValue(line: TransferLine): number {
  return lineMoved(line) * (line.costRate ?? 0);
}

/** The holding's free stock in the LINE's unit (notes 160 A). */
export function freeAvailable(line: TransferLine): number {
  return (line.freeAvailableBase ?? 0) / Math.max(0.000001, line.toBaseFactor);
}

/** "B-2604 · 30-06-2026", "B-2604", "— · 30-06-2026", or "" for a plain lot. */
export function batchExpiryText(line: Pick<TransferLine, "batchNo" | "expiryDate">): string {
  if (!line.batchNo && !line.expiryDate) {
    return "";
  }
  if (!line.expiryDate) {
    return line.batchNo;
  }
  return `${line.batchNo || "—"} · ${line.expiryDate}`;
}

/** Row numbers run over the lines that hold an item. */
export function lineNumbers(draft: TransferDraft): Map<string, number> {
  const numbers = new Map<string, number>();
  let n = 0;
  for (const line of draft.lines) {
    if (rowHasItem(line)) {
      n += 1;
      numbers.set(line.key, n);
    }
  }
  return numbers;
}

export function hasLines(draft: TransferDraft): boolean {
  return draft.lines.some(rowHasItem);
}

/** The grid always ends on one blank line — the "add new item" row. */
export function ensureTrailingBlank(lines: TransferLine[]): TransferLine[] {
  const last = lines[lines.length - 1];
  return !last || rowHasItem(last) ? [...lines, blankLine()] : lines;
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export function blankHandling(now: Date = new Date()): Handling {
  const at = nowLocalText(now);
  return {
    loadEnabled: false,
    loadAt: at,
    loadmen: [],
    driver: null,
    supervisor: null,
    vehicleNo: "",
    unloadEnabled: false,
    unloadAt: at,
    unloadmen: [],
    unloadSupervisor: null,
  };
}

export function createDraft(scope: DraftScope, mode: TransferMode, today: string): TransferDraft {
  return {
    ...scope,
    mode,
    svhId: "",
    refno: "",
    status: "DRAFT",
    viewMode: "entry",
    docDate: today,
    fromGodownId: "",
    fromGodownName: "",
    toGodownId: "",
    toGodownName: "",
    toBranchId: "",
    toBranchName: "",
    expectedOn: addDays(today, 1) || today,
    lrNo: "",
    reasonId: "",
    extraReason: null,
    remarks: "",
    handling: blankHandling(),
    lines: [blankLine()],
    transit: [],
    serverProblems: {},
    headerProblems: {},
    sentKeys: [],
    hint: "",
    stamps: null,
    notice: "New — not saved yet",
    dirty: false,
  };
}

/**
 * After a post / cancel / delete: a blank transfer with the run carried over —
 * both godowns, the branch and the date — because the next one is usually more
 * of the same (Qt `startNextDocument`).
 */
export function nextDocument(current: TransferDraft, scope: DraftScope, today: string): TransferDraft {
  const fresh = createDraft(scope, current.mode, today);
  return {
    ...fresh,
    docDate: current.docDate || fresh.docDate,
    fromGodownId: current.fromGodownId,
    fromGodownName: current.fromGodownName,
    toGodownId: current.toGodownId,
    toGodownName: current.toGodownName,
    toBranchId: current.toBranchId,
    toBranchName: current.toBranchName,
    notice: "",
  };
}

export function isDraftStatus(draft: TransferDraft): boolean {
  return draft.status === "DRAFT";
}

/** A DRAFT open for keying — the only state a line may change in. */
export function isEditable(draft: TransferDraft): boolean {
  return draft.status === "DRAFT" && draft.viewMode === "entry";
}

export function isBranch(draft: Pick<TransferDraft, "mode">): boolean {
  return draft.mode === "branch";
}

/** A draft worth bringing back from another screen. */
export function isTransferWorthRemembering(draft: TransferDraft): boolean {
  return draft.dirty && isEditable(draft);
}

/** A despatch nobody has received yet — every transit row untouched (Qt `recallable`). */
export function recallable(draft: TransferDraft): boolean {
  if (draft.status !== "IN_TRANSIT" || draft.transit.length === 0) {
    return false;
  }
  return draft.transit.every(
    (row) => row.status === "IN_TRANSIT" && !(row.receivedQty > 0) && !(row.damageQty > 0),
  );
}

/** Settle short only once every row has been received at least in part (the server's own rule). */
export function settleShortOpen(draft: TransferDraft): boolean {
  if (draft.status !== "IN_TRANSIT" || draft.transit.length === 0) {
    return false;
  }
  const open = draft.transit.some((row) => row.status === "IN_TRANSIT" || row.status === "PARTIAL");
  const touched = draft.transit.every((row) => row.status !== "IN_TRANSIT");
  return open && touched;
}

/** What a settle-short writes off: Σ remaining and Σ remaining × cost. */
export function shortTotals(transit: readonly TransitRow[]): { qty: number; value: number } {
  let qty = 0;
  let value = 0;
  for (const row of transit) {
    qty += row.remainingQty;
    value += row.remainingQty * row.costRate;
  }
  return { qty, value };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type TransferTotals = {
  lines: number;
  /** Base-unit quantity. */
  qty: number;
  value: number;
  loadCharge: number;
  unloadCharge: number;
};

export function computeTotals(draft: TransferDraft): TransferTotals {
  let lines = 0;
  let qty = 0;
  let value = 0;
  let load = 0;
  let unload = 0;
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    lines += 1;
    const moved = lineMoved(line);
    qty += moved * Math.max(0.000001, line.toBaseFactor);
    value += moved * (line.costRate ?? 0);
    load += moved * cellNumber(line.loadRate);
    unload += moved * cellNumber(line.unloadRate);
  }
  return {
    lines,
    qty,
    value,
    loadCharge: draft.handling.loadEnabled ? load : 0,
    unloadCharge: !isBranch(draft) && draft.handling.unloadEnabled ? unload : 0,
  };
}

/** The mockup's last column: the pair the post will write. */
export function postNote(draft: TransferDraft, line: TransferLine): string {
  const moved = lineMoved(line);
  if (!rowHasItem(line) || moved <= 0) {
    return "";
  }
  const from = draft.fromGodownName || "From";
  const to = draft.toGodownName || "To";
  return isBranch(draft)
    ? `OUT −${qtyCell(moved)} ${from}   +   a transit row`
    : `OUT −${qtyCell(moved)} ${from}   +   IN +${qtyCell(moved)} ${to}`;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** Which cells open (Qt `whyNotEditable`): "" = open, otherwise why not. */
export function whyNotEditable(draft: TransferDraft, line: TransferLine, column: number): string {
  const hasItem = rowHasItem(line);
  if (column === COL.Barcode) {
    return hasItem ? "This line already has its holding." : "";
  }
  if (!hasItem) {
    return "Pick the holding first — F12, scan a barcode, or type a name in Barcode and press ↓.";
  }
  switch (column) {
    case COL.Qty:
      return "";
    case COL.FreeQty:
      // Free goes out of the holding's FREE stock (sbl_free_in − free_out); a
      // holding with none takes no free qty. A loaded line that has some stays
      // editable so it can be cleared.
      return freeAvailable(line) <= 0 && cellNumber(line.freeQty) <= 0 ? "No free stock in this holding." : "";
    case COL.LoadRate:
      return draft.handling.loadEnabled ? "" : "Tick Loading to key a loading rate.";
    case COL.UnloadRate:
      return draft.handling.unloadEnabled ? "" : "Tick Unloading to key an unloading rate.";
    case COL.CostRate:
    case COL.Value:
      return "A transfer never takes a typed cost — the stock leaves at what it cost and arrives at exactly that figure.";
    case COL.BatchExpiry:
    case COL.Bucket:
      return "The batch and bucket are the picked holding's — F12 picks another.";
    default:
      return "Worked out by the screen.";
  }
}

/** The cells Enter stops on: a blank line's Barcode and Item; a line's Qty, Free and the open rates. */
export function isEnterStop(draft: TransferDraft, line: TransferLine, column: number): boolean {
  if (column === COL.Barcode || column === COL.Description) {
    return !rowHasItem(line);
  }
  if (column !== COL.Qty && column !== COL.FreeQty && column !== COL.LoadRate && column !== COL.UnloadRate) {
    return false;
  }
  return rowHasItem(line) && whyNotEditable(draft, line, column) === "";
}

function mapLine(draft: TransferDraft, key: string, change: (line: TransferLine) => TransferLine): TransferDraft {
  return { ...draft, lines: draft.lines.map((line) => (line.key === key ? change(line) : line)) };
}

function withoutProblem(draft: TransferDraft, key: string): Record<string, string> {
  if (!(key in draft.serverProblems)) {
    return draft.serverProblems;
  }
  const next = { ...draft.serverProblems };
  delete next[key];
  return next;
}

/** A typed cell committed: Qty, Free or a rate. */
export function editCell(draft: TransferDraft, key: string, column: number, raw: string): TransferDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  const text = raw.trim();
  const edited = mapLine(draft, key, (line) => {
    switch (column) {
      case COL.Qty:
        return { ...line, qty: text };
      case COL.FreeQty:
        return { ...line, freeQty: text };
      case COL.LoadRate:
        return { ...line, loadRate: text };
      case COL.UnloadRate:
        return { ...line, unloadRate: text };
      default:
        return line;
    }
  });
  return { ...edited, hint: "", serverProblems: withoutProblem(edited, key), dirty: true };
}

/** F12 / a scan / the item list gave the line its holding. */
export function applyHolding(
  draft: TransferDraft,
  key: string,
  row: TransferPickRow,
): { draft: TransferDraft; existingKey: string | null } {
  const target = draft.lines.find((line) => line.key === key) ?? draft.lines[draft.lines.length - 1];
  if (!target) {
    return { draft, existingKey: null };
  }
  // One holding, one line: a second pick of it goes to the line it is on.
  const existing = draft.lines.find(
    (line) => line.key !== target.key && rowHasItem(line) && line.lotId === row.lotId && line.bucket === row.bucket,
  );
  if (existing) {
    const number = lineNumbers(draft).get(existing.key) ?? 0;
    return {
      draft: { ...draft, hint: `That holding is already line ${number} — change its quantity there.` },
      existingKey: existing.key,
    };
  }
  const isNew = !rowHasItem(target);
  const mrp = Number(row.mrp);
  const picked = mapLine(draft, target.key, (line) => ({
    ...line,
    itemId: row.itemId,
    itemCode: row.itemCode ?? "",
    itemName: batchDetailItemText(row),
    lotId: row.lotId,
    bucket: row.bucket,
    batchNo: row.batchNo ?? "",
    expiryDate: dateFromWire(row.expiryDate),
    mrp: mrp > 0 ? mrp : null,
    // A holding is in BASE units; so is the line picked from it.
    uomId: row.baseUomId,
    baseUomId: row.baseUomId,
    uomName: row.unitName ?? "",
    toBaseFactor: 1,
    available: Number(row.availableQty) || 0,
    freeAvailableBase: Number(row.freeAvailableQty) || 0,
    costRate: Number(row.avgCostRate) || 0,
    ...(isNew
      ? { id: null, loadRate: rateText(row.loadRate), unloadRate: rateText(row.unloadRate) }
      : {}),
  }));
  return {
    draft: {
      ...picked,
      lines: ensureTrailingBlank(picked.lines),
      hint: "",
      serverProblems: withoutProblem(picked, target.key),
      dirty: true,
    },
    existingKey: null,
  };
}

/** What the holding has available now — on Edit of a draft, where the loaded line carries no figure. */
export function applyAvailability(draft: TransferDraft, key: string, rows: readonly TransferPickRow[]): TransferDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !rowHasItem(line)) {
    return draft;
  }
  const holding = rows.find((row) => row.lotId === line.lotId && row.bucket === (line.bucket || row.bucket));
  if (!holding) {
    return draft;
  }
  const factor = Math.max(0.000001, line.toBaseFactor);
  return mapLine(draft, key, (current) => {
    const next: TransferLine = {
      ...current,
      available: (Number(holding.availableQty) || 0) / factor,
      freeAvailableBase: Number(holding.freeAvailableQty) || 0,
      costRate: (current.costRate ?? 0) > 0 ? current.costRate : (Number(holding.avgCostRate) || 0) * factor,
    };
    // The loaded line had none: fill the batch from the holding.
    if (!batchExpiryText(current)) {
      next.batchNo = holding.batchNo ?? "";
      next.expiryDate = dateFromWire(holding.expiryDate);
    }
    return next;
  });
}

export function insertLineBefore(draft: TransferDraft, key: string): TransferDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  const at = draft.lines.findIndex((line) => line.key === key);
  if (at < 0) {
    return draft;
  }
  const lines = [...draft.lines];
  lines.splice(at, 0, blankLine());
  return { ...draft, lines, dirty: true };
}

export function removeLine(draft: TransferDraft, key: string): TransferDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  const lines = ensureTrailingBlank(draft.lines.filter((line) => line.key !== key));
  return { ...draft, lines, serverProblems: {}, dirty: true };
}

export function clearLines(draft: TransferDraft): TransferDraft {
  return { ...draft, lines: [blankLine()], serverProblems: {}, sentKeys: [] };
}

// ---------------------------------------------------------------------------
// Header changes
// ---------------------------------------------------------------------------

/** Every line is a holding OF the From godown — another godown means other holdings. */
export function changeFromGodown(draft: TransferDraft, id: string, name: string): TransferDraft {
  return { ...clearLines(draft), fromGodownId: id, fromGodownName: name, dirty: true };
}

export function changeToGodown(draft: TransferDraft, id: string, name: string): TransferDraft {
  return { ...draft, toGodownId: id, toGodownName: name, dirty: true };
}

/** The To godown belongs to the receiving branch: a new branch, a new choice. */
export function changeToBranch(draft: TransferDraft, id: string, name: string): TransferDraft {
  return { ...draft, toBranchId: id, toBranchName: name, toGodownId: "", toGodownName: "", dirty: true };
}

export function patchHandling(draft: TransferDraft, patch: Partial<Handling>): TransferDraft {
  return { ...draft, handling: { ...draft.handling, ...patch }, dirty: true };
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/** The Qt `clientProblems`: line key -> "Line 2 — …". */
export function clientProblems(draft: TransferDraft): Map<string, string> {
  const out = new Map<string, string>();
  const numbers = lineNumbers(draft);
  const items = draft.lines.filter(rowHasItem);
  const say = (line: TransferLine, message: string) => {
    if (!out.has(line.key)) {
      out.set(line.key, `Line ${numbers.get(line.key)} — ${message}`);
    }
  };
  for (const line of items) {
    const name = line.itemName;
    const qty = cellNumber(line.qty);
    const free = cellNumber(line.freeQty);
    if (!line.lotId) {
      say(line, `${name} names no lot — pick it from stock (F12).`);
    } else if (qty + free <= 0) {
      say(line, `${name} has no quantity.`);
    } else if (line.available !== null && qty + free > line.available + EPSILON) {
      say(line, `${name} moves ${qtyCell(qty + free)} but ${draft.fromGodownName} has ${qtyCell(line.available)}.`);
    } else if (free > freeAvailable(line) + EPSILON) {
      say(
        line,
        freeAvailable(line) > 0
          ? `${name} moves ${qtyCell(free)} free but has only ${qtyCell(freeAvailable(line))} free stock.`
          : `${name} has no free stock — move it as Qty, not Free.`,
      );
    }
    // The receiving branch matches a transit row by item + lot + godown,
    // without the bucket: two buckets of one lot cannot be received.
    if (isBranch(draft)) {
      const before = items.slice(0, items.indexOf(line));
      if (before.some((other) => other.lotId === line.lotId && other.bucket !== line.bucket)) {
        say(
          line,
          `${name} sends one lot from two buckets — a despatch carries one bucket per lot (send the other bucket on its own transfer).`,
        );
      }
    }
  }
  return out;
}

export type Refusal = {
  level: "warn" | "info";
  title: string;
  message: string;
  focus?: "fromGodown" | "toGodown" | "toBranch" | "date" | { lineKey: string };
};

export const GODOWNS_FIRST = {
  from: {
    level: "warn",
    title: "Godowns first",
    message: "Choose the From godown before keying lines — the stock is picked from it.",
    focus: "fromGodown",
  },
  to: {
    level: "warn",
    title: "Godowns first",
    message: "Choose the To godown before keying lines — it is where the stock goes.",
    focus: "toGodown",
  },
  branch: {
    level: "warn",
    title: "To branch first",
    message: "Choose the branch the stock is going to before keying lines.",
    focus: "toBranch",
  },
} as const satisfies Record<string, Refusal>;

/** Qt `requireGodowns`: the header a line cannot be keyed without. */
export function requireGodowns(draft: TransferDraft): Refusal | null {
  if (isBranch(draft) && draft.fromGodownId && !draft.toBranchId) {
    return GODOWNS_FIRST.branch;
  }
  if (draft.fromGodownId && draft.toGodownId) {
    return null;
  }
  return draft.fromGodownId ? GODOWNS_FIRST.to : GODOWNS_FIRST.from;
}

/** Qt `saveDocument`'s gates, in its order. Null = the save may go ahead. */
export function checkBeforeSave(draft: TransferDraft): Refusal | null {
  const godowns = requireGodowns(draft);
  if (godowns) {
    return godowns;
  }
  if (isBranch(draft) && !draft.toBranchId) {
    return GODOWNS_FIRST.branch;
  }
  if (!draft.docDate) {
    return { level: "warn", title: "Date required", message: "Enter the transfer date.", focus: "date" };
  }
  if (!draft.deviceId) {
    return {
      level: "warn",
      title: "No device",
      message:
        "This session has no device id, and the device is what numbers the document. Log in from a registered device.",
    };
  }
  const items = draft.lines.filter(rowHasItem);
  if (items.length === 0) {
    return { level: "warn", title: "No lines", message: "Pick at least one holding to move." };
  }
  const problems = clientProblems(draft);
  if (problems.size > 0) {
    const first = items.find((line) => problems.has(line.key));
    return {
      level: "warn",
      title: "This transfer cannot be saved yet",
      message: `${problems.size} line(s) have to be fixed first:\n\n${[...problems.values()].join("\n")}`,
      focus: first ? { lineKey: first.key } : undefined,
    };
  }
  return null;
}

/** The confirmation Post asks (Qt `saveDocument`). */
export function postConfirm(draft: TransferDraft): { title: string; message: string } {
  const totals = computeTotals(draft);
  const value = totals.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines = `${totals.lines} line${totals.lines === 1 ? "" : "s"}`;
  if (isBranch(draft)) {
    return {
      title: "Despatch the transfer?",
      message:
        `${draft.fromGodownName} to ${draft.toBranchName} (${draft.toGodownName}): ${lines}, ${value} worth of stock. ` +
        `It leaves now and stays in transit until ${draft.toBranchName} receives it — a despatch cannot be cancelled.`,
    };
  }
  return {
    title: "Post the transfer?",
    message:
      `${draft.fromGodownName} to ${draft.toGodownName}: ${lines}, ${value} worth of stock. ` +
      "It moves now, in one step, and the document can only be cancelled afterwards.",
  };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** "Godown Transfer — new" / "Godown Transfer — TRF/…" (Qt `refreshTitle`). */
export function titleLine(draft: TransferDraft): string {
  const name = MODE_INFO[draft.mode].documentName;
  return draft.refno ? `${name} — ${draft.refno}` : `${name} — new`;
}

/** "Acme Foods · Coimbatore → Counter2" — no year: the voucher number has it. */
export function scopeLabel(draft: TransferDraft, companyName: string, branchName: string): string {
  let place = branchName;
  if (isBranch(draft) && draft.toBranchName) {
    place = `${branchName || "this branch"} → ${draft.toBranchName}`;
  }
  return [companyName, place].filter(Boolean).join(" · ");
}

/** "Created 26-10-2026 09:14 AM by ravi", "Posted …", "Cancelled …", "Reason: …". */
export function auditLines(draft: TransferDraft): string[] {
  const stamps: AuditStamps | null = draft.stamps;
  if (!stamps) {
    return [];
  }
  const line = (verb: string, on: string, by: string) => {
    if (!on && !by) {
      return "";
    }
    return `${verb}${on ? ` ${on}` : ""}${by ? ` by ${by}` : ""}`;
  };
  const lines = [
    line("Created", stamps.createdOn, stamps.createdBy),
    line("Posted", stamps.postedOn, stamps.postedBy),
    line("Cancelled", stamps.cancelledOn, ""),
  ].filter(Boolean);
  if (stamps.cancelReason) {
    lines.push(`Reason: ${stamps.cancelReason}`);
  }
  return lines;
}

/** dd-MM-yyyy hh:mm AM/PM, local — the house format for a shown time. */
export function stampText(iso: string | null | undefined): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return "";
  }
  const hours = at.getHours();
  const hh = two(hours % 12 === 0 ? 12 : hours % 12);
  return `${two(at.getDate())}-${two(at.getMonth() + 1)}-${at.getFullYear()} ${hh}:${two(at.getMinutes())} ${hours < 12 ? "AM" : "PM"}`;
}

export function stampsOf(header: TransferHeaderPayload): AuditStamps {
  return {
    createdOn: stampText(header.createdOn),
    createdBy: (header.createdByName || header.createdBy || "").trim(),
    postedOn: stampText(header.postedOn),
    postedBy: (header.postedByName || "").trim(),
    cancelledOn: stampText(header.cancelledOn),
    cancelReason: (header.cancelReason ?? "").trim(),
  };
}

/** The status shown: "IN_TRANSIT" reads "IN TRANSIT". */
export function statusText(status: string): string {
  return status.replace(/_/g, " ");
}

/** Where keying starts (Qt `focusEntryStart`): From, To branch, To godown, then the first blank line. */
export type EntryStart =
  | { target: "fromGodown" | "toBranch" | "toGodown" | "grid" }
  | { target: "cell"; key: string; column: number };

export function entryStartTarget(draft: TransferDraft): EntryStart {
  if (!isEditable(draft)) {
    return { target: "grid" };
  }
  if (!draft.fromGodownId) {
    return { target: "fromGodown" };
  }
  if (isBranch(draft) && !draft.toBranchId) {
    return { target: "toBranch" };
  }
  if (!draft.toGodownId) {
    return { target: "toGodown" };
  }
  const line = draft.lines.find((candidate) => !rowHasItem(candidate)) ?? draft.lines[draft.lines.length - 1];
  return line ? { target: "cell", key: line.key, column: COL.Barcode } : { target: "grid" };
}
