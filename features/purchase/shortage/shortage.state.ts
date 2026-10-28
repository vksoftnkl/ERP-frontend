/**
 * Shortage Receipt — every rule of the Qt `ShortageReceiptEntry`, as pure
 * transitions over the screen's draft. No React, no network.
 *
 *  - A NEW receipt is the supplier's open shortages, one row each, in the
 *    item's BASE unit; Received is what came now (blank = not this time).
 *    Reloading the list keeps what was typed on the rows still open
 *    (Qt `reloadOpen`: Received, Batch, Expiry).
 *  - Save sends only the rows with something received, so a saved draft is
 *    just those rows; it keeps its lines and does not fetch the open list again.
 *  - Value is a preview — Received × the shortage's own cost; the server values
 *    the line itself (and the piece that empties a shortage takes the remainder).
 */
import { REASON_TEXT, COL, DEFAULT_FOCUS_STOPS, FALLBACK_COLUMNS, type ColumnNo } from "./shortage.constants";
import { isoFromTyped, money, num, qtyText, text } from "../shared/purchase.format";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import type {
  DocStatus,
  OpenShortageRow,
  SaveShortageReceiptDto,
  ShortageDraft,
  ShortageLine,
  ShortageReceiptPayload,
  ShortageScope,
} from "./shortage.types";

// ---------------------------------------------------------------- reading

export function reasonText(code: string): string {
  return REASON_TEXT[code] ?? code;
}

/** ISO (or an ISO timestamp) → dd/MM/yyyy; "" when there is none. */
export function displayDate(value: unknown): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : "";
}

function statusOf(value: unknown): DocStatus {
  const status = text(value).toUpperCase();
  return status === "POSTED" || status === "CANCELLED" ? status : "DRAFT";
}

/** An MRP worth showing: above zero, else blank. */
function mrpText(value: unknown): string {
  const mrp = num(value);
  return mrp > 0 ? qtyText(mrp) : "";
}

// ---------------------------------------------------------------- building

export function createDraft(scope: ShortageScope, today: string): ShortageDraft {
  return {
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear,
    deviceId: scope.deviceId,
    psrId: "",
    refno: "",
    status: "DRAFT",
    mode: "entry",
    supplierId: "",
    supplierName: "",
    godownId: "",
    godownName: "",
    docDate: today,
    challanNo: "",
    remarks: "",
    receivedBy: [],
    lines: [],
    activeKey: "",
    dirty: false,
  };
}

/**
 * The supplier's open shortages → one row each. What was typed on a row that is
 * still open is kept; a row that has gone (closed, received elsewhere) goes.
 */
export function linesFromOpen(rows: readonly OpenShortageRow[], previous: readonly ShortageLine[]): ShortageLine[] {
  const typed = new Map(previous.map((line) => [line.shortageId, line]));
  return rows.map((row) => {
    const shortageId = text(row.shortageId);
    const line: ShortageLine = {
      key: shortageId,
      shortageId,
      shortageYear: text(row.accYear),
      lineId: "",
      source: text(row.srcRefno),
      reason: text(row.reason),
      itemName: text(row.itemName),
      unitName: text(row.unitName),
      shortQty: num(row.openQty),
      received: "",
      batch: text(row.batchNo),
      expiry: displayDate(row.expiryDate),
      mrp: mrpText(row.mrp),
      cost: num(row.costRate),
    };
    const before = typed.get(shortageId);
    if (before) {
      if (before.received) line.received = before.received;
      if (before.batch) line.batch = before.batch;
      if (before.expiry) line.expiry = before.expiry;
    }
    return line;
  });
}

/** The supplier's list landed on a new receipt. */
export function applyOpenRows(draft: ShortageDraft, rows: readonly OpenShortageRow[]): ShortageDraft {
  const lines = linesFromOpen(rows, draft.lines);
  const activeKey = lines.some((line) => line.key === draft.activeKey) ? draft.activeKey : (lines[0]?.key ?? "");
  return { ...draft, lines, activeKey };
}

/** A saved receipt, as the server returned it (get / save / cancel). */
export function draftFromPayload(
  payload: ShortageReceiptPayload,
  scope: ShortageScope,
  mode: "browse" | "entry",
  names: { godownName?: string; receivedBy?: ShortageDraft["receivedBy"] } = {},
): ShortageDraft {
  const header = payload.header;
  const lines: ShortageLine[] = (payload.lines ?? []).map((row, index) => {
    const shortageId = text(row.psriShortageId);
    return {
      key: shortageId || `line-${index}`,
      shortageId,
      shortageYear: text(row.psriShortageAccYear),
      lineId: text(row.psriId),
      source: text(row.srcRefno),
      reason: text(row.reason),
      itemName: text(row.itemName),
      unitName: text(row.unitName),
      shortQty: row.openQty === null || row.openQty === undefined ? null : num(row.openQty),
      received: qtyText(num(row.psriQty)),
      batch: text(row.batchNo),
      expiry: displayDate(row.expiryDate),
      mrp: mrpText(row.mrp),
      cost: num(row.psriCostRate),
    };
  });
  const status = statusOf(header.psrStatus);
  return {
    companyId: text(header.psrCompanyId) || scope.companyId,
    branchId: text(header.psrBranchId) || scope.branchId,
    accYear: text(header.psrAccYear) || scope.accYear,
    deviceId: scope.deviceId,
    psrId: text(header.psrId),
    refno: text(header.psrRefno),
    status,
    mode: status === "DRAFT" ? mode : "browse",
    supplierId: text(header.psrSupplierId),
    supplierName: text(header.supplierName),
    godownId: text(header.psrGodownId),
    godownName: names.godownName ?? "",
    docDate: text(header.psrDocDate).slice(0, 10),
    challanNo: text(header.psrChallanNo),
    remarks: text(header.psrRemarks),
    receivedBy:
      names.receivedBy ?? (header.psrReceivedBy ?? []).map((id) => ({ id: String(id), text: "" })),
    lines,
    activeKey: lines[0]?.key ?? "",
    dirty: false,
  };
}

// ---------------------------------------------------------------- state

/** A saved-or-new DRAFT open for keying. */
export function isEditable(draft: ShortageDraft): boolean {
  return draft.status === "DRAFT" && draft.mode === "entry";
}

/** A new receipt: the supplier can change and the closes act on its open list. */
export function isFresh(draft: ShortageDraft): boolean {
  return draft.status === "DRAFT" && draft.psrId === "";
}

export type HeaderPatch = Partial<
  Pick<ShortageDraft, "godownId" | "godownName" | "docDate" | "challanNo" | "remarks" | "receivedBy">
>;

export function setHeader(draft: ShortageDraft, patch: HeaderPatch): ShortageDraft {
  return { ...draft, ...patch, dirty: true };
}

/** A new supplier: its rows replace the last one's once the list lands. */
export function setSupplier(draft: ShortageDraft, supplierId: string, supplierName: string): ShortageDraft {
  if (supplierId === draft.supplierId) {
    return { ...draft, supplierName: supplierName || draft.supplierName };
  }
  return { ...draft, supplierId, supplierName, lines: [], activeKey: "", dirty: true };
}

export type LinePatch = Partial<Pick<ShortageLine, "received" | "batch" | "expiry" | "mrp">>;

export function editLine(draft: ShortageDraft, key: string, patch: LinePatch): ShortageDraft {
  let changed = false;
  const lines = draft.lines.map((line) => {
    if (line.key !== key) {
      return line;
    }
    const next = { ...line, ...patch };
    changed = (Object.keys(patch) as (keyof LinePatch)[]).some((field) => next[field] !== line[field]);
    return next;
  });
  return changed ? { ...draft, lines, dirty: true } : draft;
}

export function setActive(draft: ShortageDraft, key: string): ShortageDraft {
  return draft.activeKey === key ? draft : { ...draft, activeKey: key };
}

// ---------------------------------------------------------------- figures

export function receivedQty(line: ShortageLine): number {
  return num(line.received);
}

/** The preview value of a row: Received × cost, to the paisa; null when nothing came. */
export function lineValue(line: ShortageLine): number | null {
  const qty = receivedQty(line);
  return qty > 0 ? Math.round(qty * line.cost * 100) / 100 : null;
}

export type ShortageTotals = { rows: number; qty: number; value: number; lineCount: number };

export function computeTotals(draft: ShortageDraft): ShortageTotals {
  let rows = 0;
  let qty = 0;
  let value = 0;
  for (const line of draft.lines) {
    const received = receivedQty(line);
    if (received <= 0) {
      continue;
    }
    rows += 1;
    qty += received;
    value += lineValue(line) ?? 0;
  }
  return { rows, qty, value: Math.round(value * 100) / 100, lineCount: draft.lines.length };
}

// ---------------------------------------------------------------- checks

export type LineProblem = { key: string; text: string };

/**
 * What the server would refuse, said before it is sent: an expiry that is not a
 * date (Qt only hinted, then dropped it — the server would have used the
 * shortage's own), and more received than is short.
 */
export function lineProblems(draft: ShortageDraft): LineProblem[] {
  const problems: LineProblem[] = [];
  draft.lines.forEach((line, index) => {
    const label = `Line ${index + 1}`;
    if (line.expiry.trim() && !isoFromTyped(line.expiry)) {
      problems.push({ key: line.key, text: `${label}: expiry must be dd/MM/yyyy.` });
    }
    const qty = receivedQty(line);
    if (qty > 0 && line.shortQty !== null && qty > line.shortQty + 1e-9) {
      problems.push({
        key: line.key,
        text: `${label}: ${qtyText(qty)} received, only ${qtyText(line.shortQty)} is short.`,
      });
    }
  });
  return problems;
}

/** Why Save / Post cannot go yet — the first reason, or null. */
export function saveBlocker(draft: ShortageDraft): { title: string; text: string } | null {
  if (draft.status !== "DRAFT") {
    return { title: "Not a draft", text: `${draft.refno || "This receipt"} is ${draft.status}.` };
  }
  if (!draft.supplierId || !draft.godownId) {
    return { title: "Header incomplete", text: "Pick the supplier and the godown." };
  }
  if (!draft.lines.some((line) => receivedQty(line) > 0)) {
    return { title: "Nothing received", text: "Type the qty that came on at least one row." };
  }
  const problems = lineProblems(draft);
  if (problems.length > 0) {
    return { title: "Check the lines", text: problems.map((problem) => problem.text).join("\n") };
  }
  return null;
}

// ---------------------------------------------------------------- payload

/** Qt `buildPayload` — only the rows something came for, numbered from 1. */
export function buildSavePayload(draft: ShortageDraft, post: boolean): SaveShortageReceiptDto {
  const challanNo = draft.challanNo.trim();
  const remarks = draft.remarks.trim();
  const lines: SaveShortageReceiptDto["lines"] = [];
  for (const line of draft.lines) {
    const qty = receivedQty(line);
    if (qty <= 0) {
      continue;
    }
    const batchNo = line.batch.trim();
    const expiryDate = isoFromTyped(line.expiry);
    const mrp = num(line.mrp);
    lines.push({
      lineNo: lines.length + 1,
      shortageId: line.shortageId,
      shortageAccYear: line.shortageYear,
      qty,
      ...(batchNo ? { batchNo } : {}),
      ...(expiryDate ? { expiryDate } : {}),
      ...(mrp > 0 ? { mrp } : {}),
    });
  }
  return {
    header: {
      ...(draft.psrId ? { psrId: draft.psrId } : {}),
      companyId: draft.companyId,
      branchId: draft.branchId,
      accYear: draft.accYear,
      deviceId: draft.deviceId,
      supplierId: draft.supplierId,
      godownId: draft.godownId,
      docDate: draft.docDate,
      ...(challanNo ? { challanNo } : {}),
      receivedBy: draft.receivedBy.map((pick) => pick.id),
      ...(remarks ? { remarks } : {}),
      post,
    },
    lines,
  };
}

// ---------------------------------------------------------------- columns

export type LineColumn = {
  no: ColumnNo;
  header: string;
  /** Share of the grid's width, in percent; the visible columns sum to 100. */
  widthPct: number;
  /** Enter stops here. */
  focus: boolean;
};

const ORDER = Object.values(COL) as ColumnNo[];

/**
 * ui_table 61's layout over the screen's own columns: titles, width shares,
 * order and visibility come from the layout; the hidden id columns (11–13) are
 * never drawn. Enter stops on the layout's Focus columns, or — when it flags
 * none — on Received and Batch (Qt `setFocusStops`). A width is a share of the
 * Qt grid, never a CSS percent (it is normalised here).
 */
export function resolveColumns(rows: readonly UiTableColumnRow[] | undefined): LineColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed = ORDER.filter((no) => byNumber.get(no)?.uiTblClmColumnVisibility !== false).map((no) => {
    const row = byNumber.get(no);
    const fallback = FALLBACK_COLUMNS[no];
    const width =
      row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0
        ? row.uiTblClmColumnWidth
        : fallback.width;
    return {
      no,
      header: (row?.uiTblClmName ?? "").trim() || fallback.title,
      width,
      position: row && Number.isFinite(Number(row.uiTblClmColumnPosition)) ? Number(row.uiTblClmColumnPosition) : no,
      flagged: row?.uiTblClmColumnFocus === true,
    };
  });
  placed.sort((a, b) => a.position - b.position || a.no - b.no);
  const anyFlagged = placed.some((column) => column.flagged);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({
    no: column.no,
    header: column.header,
    widthPct: (column.width / total) * 100,
    focus: anyFlagged ? column.flagged : DEFAULT_FOCUS_STOPS.has(column.no),
  }));
}

// ---------------------------------------------------------------- words

export function titleLine(draft: ShortageDraft): string {
  return draft.refno ? `Shortage Receipt — ${draft.refno}` : "Shortage Receipt — new";
}

/** The line under the grid (Qt `recalcTotals` / `applyLoaded`). */
export function totalsText(draft: ShortageDraft, totals: ShortageTotals): string {
  const rows = `${totals.rows} row${totals.rows === 1 ? "" : "s"}`;
  if (isFresh(draft)) {
    return `${rows} received · Qty ${qtyText(totals.qty)} · Value ${money(totals.value)} (of ${totals.lineCount} short row${totals.lineCount === 1 ? "" : "s"})`;
  }
  return `${rows} · Qty ${qtyText(totals.qty)} · Value ${money(totals.value)}`;
}

/** What a standing close is, for the Undo question. */
export function closeDescription(close: { kind: string; qty: unknown; amount: unknown; cnNo: string | null }): string {
  const what = close.kind === "SUPPLIER_CN" ? `supplier CN${close.cnNo ? ` ${close.cnNo}` : ""}` : "write-off";
  return `the ${what} of ${qtyText(num(close.qty))} (${money(num(close.amount))})`;
}
