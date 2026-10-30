/**
 * Shortage Receipt — every rule of the Qt `ShortageReceiptEntry` (NexERP
 * src/modules/purchase/shortage/shortage_receipt_entry.cpp, 2026-10-29 rebuild),
 * as pure transitions over the screen's draft. No React, no network.
 *
 *  - A NEW receipt is the supplier's open shortages, one row each, in the item's
 *    BASE unit. Tick a row (Space / click) = it came: the open qty is received;
 *    typing Receive now ticks it, clearing it unticks. Reloading the list keeps
 *    what was ticked / typed on the rows still open (Qt `fillOpen`).
 *  - F12 = the line's batches / serials; one plain row (no serial, the header's
 *    godown, no mfg) folds back onto the line as Batch / Expiry, anything more
 *    stays the line's split ("2 batches (F12)").
 *  - Save sends only the ticked rows with a qty; a saved receipt keeps its own
 *    lines (Date / Age / Recd / Closed / GST held merged from /open?all=true).
 *  - The strip is a preview: Receive now × the original cost, the parked GST
 *    released per base unit, the rows still open after this receipt.
 */
import { formatLocalDateTime, isoToDisplayDate } from "@/lib/date-format";
import type { PurchaseAllocEntry } from "../shared/purchase-dialogs.types";
import type { PurchaseIssue } from "../shared/purchase-parts";
import { isoFromTyped, money, num, qtyText, shortRef, text } from "../shared/purchase.format";
import { REASON_TEXT, SOURCE_TYPE_TEXT } from "./shortage.constants";
import type {
  DocStatus,
  OpenShortageRow,
  SaveShortageReceiptDto,
  ShortageAllocDto,
  ShortageDraft,
  ShortageLine,
  ShortageReceiptAllocRow,
  ShortageReceiptPayload,
  ShortageScope,
} from "./shortage.types";

const EPS = 0.0000005;

// ---------------------------------------------------------------- reading

export function reasonWords(code: string): string {
  return REASON_TEXT[code] ?? code;
}


/** The mockup's From: "PUR/…/00012 · line 2" (no line no = the refno alone). */
export function fromText(refno: string, lineNo: number | null | undefined): string {
  const ref = shortRef(refno);
  return lineNo === null || lineNo === undefined || !Number.isFinite(Number(lineNo)) ? ref : `${ref} · line ${Number(lineNo)}`;
}

function fromTip(refno: string, docType: string): string {
  return docType ? `${refno} (${SOURCE_TYPE_TEXT[docType] ?? docType})` : refno;
}

/** ISO (or an ISO timestamp) → dd/MM/yyyy; "" when there is none. */
export function displayDate(value: unknown): string {
  const raw = text(value);
  return raw ? isoToDisplayDate(raw.slice(0, 10)) : "";
}

function statusOf(value: unknown): DocStatus {
  const status = text(value).toUpperCase();
  return status === "POSTED" || status === "CANCELLED" ? status : "DRAFT";
}

function numOrNull(value: unknown): number | null {
  return value === null || value === undefined || value === "" ? null : num(value);
}

/** A Date → the local `yyyy-MM-ddTHH:mm` a DateTimeInput takes. */
export function localDateTimeOf(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The app date at the time of day now (Qt `resetScreen`). */
export function nowOn(dayIso: string, now: Date = new Date()): string {
  const time = localDateTimeOf(now).slice(10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dayIso) ? `${dayIso}${time}` : localDateTimeOf(now);
}

/** A saved `psrReceivedAt` (UTC instant) → local `yyyy-MM-ddTHH:mm`; else the doc date at midnight. */
export function receivedAtOf(receivedAt: unknown, docDate: unknown): string {
  const raw = text(receivedAt);
  if (raw) {
    const at = new Date(raw);
    if (!Number.isNaN(at.getTime())) {
      return localDateTimeOf(at);
    }
  }
  const day = text(docDate).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00` : "";
}

/** The local `yyyy-MM-ddTHH:mm` → an ISO instant for the server (Qt `toUTC().toString(ISODateWithMs)`). */
export function receivedAtWire(local: string): string {
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? "" : at.toISOString();
}

/** "29/10/2026 07:23 PM" — the box's text, for tests and the title tooltip. */
export function receivedAtText(local: string): string {
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? "" : formatLocalDateTime(at);
}

// ---------------------------------------------------------------- building

export function createDraft(scope: ShortageScope, today: string, now: Date = new Date()): ShortageDraft {
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
    receivedAt: nowOn(today, now),
    receivedTyped: false,
    challanNo: "",
    remarks: "",
    supervisorId: "",
    supervisorName: "",
    receivedBy: [],
    lines: [],
    activeKey: "",
    dirty: false,
  };
}

function gstHeldOf(row: OpenShortageRow): { gstHeld: number | null; gstPerUnit: number } {
  const pending = row.gstPending === true;
  const qtyBase = num(row.qtyBase);
  const openGst = num(row.openGst);
  return {
    gstHeld: pending && openGst > 0 ? openGst : null,
    gstPerUnit: pending && qtyBase > 0 ? num(row.gst) / qtyBase : 0,
  };
}

function closedTipOf(row: OpenShortageRow): string {
  return `CN ${qtyText(num(row.closedByCn))} · claim ${qtyText(num(row.closedByClaim))} · written off ${qtyText(num(row.writtenOffQty))}`;
}

/** One open shortage → one row (nothing ticked). */
export function lineFromOpen(row: OpenShortageRow): ShortageLine {
  const shortageId = text(row.shortageId);
  const refno = text(row.srcRefno);
  const reason = text(row.reason);
  return {
    key: shortageId,
    shortageId,
    shortageYear: text(row.accYear),
    lineId: "",
    refno,
    from: fromText(refno, row.srcLineNo),
    fromTip: fromTip(refno, text(row.srcDocType)),
    srcDate: displayDate(row.srcDocDate),
    ageDays: row.ageDays === null || row.ageDays === undefined ? null : Number(row.ageDays),
    itemId: text(row.itemId),
    uomId: text(row.uomId),
    itemName: text(row.itemName),
    unitName: text(row.unitName),
    reason,
    why: text(row.reasonText) || reasonWords(reason),
    status: text(row.status).toUpperCase(),
    shortQty: num(row.qtyBase),
    receivedSoFar: num(row.received),
    closedSoFar: num(row.closed),
    closedTip: closedTipOf(row),
    openQty: num(row.openQty),
    ticked: false,
    receive: "",
    batch: text(row.batchNo),
    expiry: displayDate(row.expiryDate),
    mrp: num(row.mrp) > 0 ? num(row.mrp) : 0,
    allocs: null,
    signature: "",
    cost: num(row.costRate),
    openValue: num(row.openValue),
    ...gstHeldOf(row),
    gstReleased: null,
  };
}

/**
 * The supplier's open shortages → one row each. What was ticked / typed on a
 * row still open is kept (tick, Receive now, the split, Batch, Expiry); its
 * signature too. A row that has gone (closed, received elsewhere) goes.
 */
export function linesFromOpen(rows: readonly OpenShortageRow[], previous: readonly ShortageLine[]): ShortageLine[] {
  const typed = new Map(previous.map((line) => [line.shortageId, line]));
  return rows.map((row) => {
    const line = lineFromOpen(row);
    const before = typed.get(line.shortageId);
    if (!before) {
      return line;
    }
    return {
      ...line,
      ticked: before.ticked,
      receive: before.receive,
      allocs: before.allocs,
      batch: before.batch || line.batch,
      expiry: (before.expiry || before.allocs) ? before.expiry : line.expiry,
      signature: before.signature,
    };
  });
}

/** The supplier's list landed on a new receipt. */
export function applyOpenRows(draft: ShortageDraft, rows: readonly OpenShortageRow[]): ShortageDraft {
  const lines = linesFromOpen(rows, draft.lines);
  const activeKey = lines.some((line) => line.key === draft.activeKey) ? draft.activeKey : (lines[0]?.key ?? "");
  return { ...draft, lines, activeKey };
}

/** A saved line's stock rows → F12 entries (dates as the DTO takes them). */
function allocEntriesOfSaved(rows: readonly ShortageReceiptAllocRow[] | null | undefined): PurchaseAllocEntry[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => num(a.rowNo) - num(b.rowNo))
    .map((row) => {
      const entry: PurchaseAllocEntry = { bucket: "SALEABLE", qty: num(row.qty) };
      if (text(row.godownId)) entry.godownId = text(row.godownId);
      if (text(row.batchNo)) entry.batchNo = text(row.batchNo);
      if (text(row.serialNo)) entry.serialNo = text(row.serialNo);
      if (text(row.mfgDate)) entry.mfgDate = text(row.mfgDate).slice(0, 10);
      if (text(row.expiryDate)) entry.expiryDate = text(row.expiryDate).slice(0, 10);
      if (text(row.warrantyTo)) entry.warrantyTo = text(row.warrantyTo).slice(0, 10);
      if (num(row.mrp) > 0) entry.mrp = num(row.mrp);
      return entry;
    });
}

/** A saved receipt, as the server returned it (get / save / cancel). */
export function draftFromPayload(payload: ShortageReceiptPayload, scope: ShortageScope, mode: "browse" | "entry"): ShortageDraft {
  const header = payload.header;
  const status = statusOf(header.psrStatus);
  const godownId = text(header.psrGodownId);
  const lines: ShortageLine[] = (payload.lines ?? []).map((row, index) => {
    const shortageId = text(row.psriShortageId);
    const refno = text(row.srcRefno);
    const reason = text(row.reason);
    const released = numOrNull(row.psriGstReleased);
    const line: ShortageLine = {
      key: shortageId || `line-${index}`,
      shortageId,
      shortageYear: text(row.psriShortageAccYear),
      lineId: text(row.psriId),
      refno,
      from: shortRef(refno),
      fromTip: refno,
      srcDate: "",
      ageDays: null,
      itemId: text(row.psriItemId),
      uomId: text(row.psriUomId),
      itemName: text(row.itemName),
      unitName: text(row.unitName),
      reason,
      why: reason ? reasonWords(reason) : "",
      status: "",
      shortQty: numOrNull(row.shortQty),
      receivedSoFar: null,
      closedSoFar: null,
      closedTip: "",
      openQty: numOrNull(row.openQty),
      ticked: true,
      receive: qtyText(num(row.psriQty)),
      batch: "",
      expiry: "",
      mrp: 0,
      allocs: null,
      signature: "",
      cost: num(row.psriCostRate),
      openValue: 0,
      gstHeld: status !== "DRAFT" && released !== null && released > 0 ? released : null,
      gstPerUnit: 0,
      gstReleased: released,
    };
    const saved = allocEntriesOfSaved(row.allocs);
    if (saved.length === 0) {
      return { ...line, batch: text(row.batchNo), expiry: displayDate(row.expiryDate), mrp: num(row.mrp) > 0 ? num(row.mrp) : 0 };
    }
    const folded = setLineAllocsOn(line, saved, godownId);
    return !folded.allocs && num(row.mrp) > 0 ? { ...folded, mrp: num(row.mrp) } : folded;
  });
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
    godownId,
    godownName: text(header.godownName),
    receivedAt: receivedAtOf(header.psrReceivedAt, header.psrDocDate),
    receivedTyped: false,
    challanNo: text(header.psrChallanNo),
    remarks: text(header.psrRemarks),
    supervisorId: text(header.psrSupervisorId),
    supervisorName: text(header.psrSupervisorId) ? text(header.supervisorName) : "",
    receivedBy:
      header.receivedBy && header.receivedBy.length > 0
        ? header.receivedBy.map((man) => ({ id: text(man.id), text: text(man.name) }))
        : (header.psrReceivedBy ?? []).map((id) => ({ id: String(id), text: "" })),
    lines,
    activeKey: lines[0]?.key ?? "",
    dirty: false,
  };
}

/**
 * A reopened receipt: Date / Age / Recd / Closed / Status (and on a draft the
 * GST held) from the shortages themselves (/open?all=true) — Qt `mergeFacts`.
 */
export function mergeFacts(draft: ShortageDraft, rows: readonly OpenShortageRow[]): ShortageDraft {
  const byId = new Map(rows.map((row) => [text(row.shortageId), row]));
  const isDraft = draft.status === "DRAFT";
  let changed = false;
  const lines = draft.lines.map((line) => {
    const row = byId.get(line.shortageId);
    if (!row) {
      return line;
    }
    changed = true;
    const refno = text(row.srcRefno) || line.refno;
    return {
      ...line,
      refno,
      from: fromText(refno, row.srcLineNo),
      fromTip: fromTip(refno, text(row.srcDocType)),
      srcDate: displayDate(row.srcDocDate),
      ageDays: row.ageDays === null || row.ageDays === undefined ? null : Number(row.ageDays),
      receivedSoFar: num(row.received),
      closedSoFar: num(row.closed),
      closedTip: closedTipOf(row),
      status: text(row.status).toUpperCase(),
      why: line.why || text(row.reasonText),
      itemId: text(row.itemId) || line.itemId,
      openValue: num(row.openValue),
      ...(isDraft ? gstHeldOf(row) : {}),
    };
  });
  return changed ? { ...draft, lines } : draft;
}

// ---------------------------------------------------------------- state

/** A saved-or-new DRAFT open for keying. */
export function isEditable(draft: ShortageDraft): boolean {
  return draft.status === "DRAFT" && draft.mode === "entry";
}

/** A new receipt: the supplier can change and Close row… acts on its open list. */
export function isFresh(draft: ShortageDraft): boolean {
  return draft.status === "DRAFT" && draft.psrId === "";
}

export type HeaderPatch = Partial<
  Pick<ShortageDraft, "godownId" | "godownName" | "challanNo" | "remarks" | "receivedBy" | "supervisorId" | "supervisorName">
>;

export function setHeader(draft: ShortageDraft, patch: HeaderPatch): ShortageDraft {
  return { ...draft, ...patch, dirty: true };
}

/** Received (date-time) as typed: sent on the next save. */
export function setReceivedAt(draft: ShortageDraft, receivedAt: string): ShortageDraft {
  return receivedAt === draft.receivedAt ? draft : { ...draft, receivedAt, receivedTyped: true, dirty: true };
}

/** A new supplier: its rows replace the last one's once the list lands. */
export function setSupplier(draft: ShortageDraft, supplierId: string, supplierName: string): ShortageDraft {
  if (supplierId === draft.supplierId) {
    return { ...draft, supplierName: supplierName || draft.supplierName };
  }
  return { ...draft, supplierId, supplierName, lines: [], activeKey: "", dirty: true };
}

function mapLine(draft: ShortageDraft, key: string, change: (line: ShortageLine) => ShortageLine): ShortageDraft {
  let changed = false;
  const lines = draft.lines.map((line) => {
    if (line.key !== key) {
      return line;
    }
    const next = change(line);
    if (next !== line) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...draft, lines, dirty: true } : draft;
}

/** A tick receives the row's open qty (unless a qty is typed); an untick drops what was typed. */
export function setTicked(draft: ShortageDraft, key: string, on: boolean): ShortageDraft {
  if (draft.status !== "DRAFT") {
    return draft;
  }
  return mapLine(draft, key, (line) => {
    if (!line.shortageId || line.ticked === on) {
      return line;
    }
    if (on) {
      return { ...line, ticked: true, receive: num(line.receive) > 0 ? line.receive : qtyText(line.openQty ?? 0) };
    }
    return { ...line, ticked: false, receive: "" };
  });
}

export function toggleTick(draft: ShortageDraft, key: string): ShortageDraft {
  const line = draft.lines.find((candidate) => candidate.key === key);
  return line ? setTicked(draft, key, !line.ticked) : draft;
}

/** Receive now typed: a qty ticks the row, 0 / blank unticks it (Qt `onCellEdited`). */
export function setReceive(draft: ShortageDraft, key: string, typed: string): ShortageDraft {
  return mapLine(draft, key, (line) => {
    const q = num(typed);
    if (q > 0) {
      return line.receive === typed && line.ticked ? line : { ...line, receive: typed, ticked: true };
    }
    return line.receive === "" && !line.ticked ? line : { ...line, receive: "", ticked: false };
  });
}

export type LinePatch = Partial<Pick<ShortageLine, "batch" | "expiry">>;

export function editLine(draft: ShortageDraft, key: string, patch: LinePatch): ShortageDraft {
  return mapLine(draft, key, (line) => {
    const next = { ...line, ...patch };
    return (Object.keys(patch) as (keyof LinePatch)[]).some((field) => next[field] !== line[field]) ? next : line;
  });
}

/** The item's tracking signature arrived (R = serials: Batch is F12's). */
export function setSignature(draft: ShortageDraft, key: string, signature: string): ShortageDraft {
  const lines = draft.lines.map((line) => (line.key === key && line.signature !== signature ? { ...line, signature } : line));
  return lines.some((line, index) => line !== draft.lines[index]) ? { ...draft, lines } : draft;
}

export function setActive(draft: ShortageDraft, key: string): ShortageDraft {
  return draft.activeKey === key ? draft : { ...draft, activeKey: key };
}

export function isSerial(line: ShortageLine): boolean {
  return line.signature.includes("R");
}

export function isSplit(line: ShortageLine): boolean {
  return line.allocs !== null && line.allocs.length > 0;
}

/**
 * F12's rows → the line (Qt `setLineAllocs`): one plain row (no serial, the
 * header's godown, no mfg) goes back as Batch / Expiry; anything more stays the
 * split, the row then reads "2 batches (F12)" / "3 serials (F12)".
 */
export function setLineAllocsOn(line: ShortageLine, allocs: readonly PurchaseAllocEntry[], headerGodownId: string): ShortageLine {
  let serial = false;
  let simple = allocs.length === 1;
  for (const a of allocs) {
    serial = serial || text(a.serialNo) !== "";
    if (text(a.mfgDate)) simple = false;
    if (text(a.godownId) && text(a.godownId) !== headerGodownId) simple = false;
  }
  simple = simple && !serial;
  if (simple) {
    const a = allocs[0];
    return {
      ...line,
      allocs: null,
      batch: text(a.batchNo),
      expiry: displayDate(a.expiryDate),
      mrp: a.mrp !== undefined && a.mrp > 0 ? a.mrp : line.mrp,
    };
  }
  if (allocs.length === 0) {
    return { ...line, allocs: null };
  }
  return { ...line, allocs: allocs.map((a) => ({ ...a, bucket: "SALEABLE" })), expiry: "" };
}

export function setLineAllocs(draft: ShortageDraft, key: string, allocs: readonly PurchaseAllocEntry[]): ShortageDraft {
  return mapLine(draft, key, (line) => setLineAllocsOn(line, allocs, draft.godownId));
}

/** What F12 opens with: the split, else the row's own Batch / Expiry / MRP as one row. */
export function allocSeed(line: ShortageLine): PurchaseAllocEntry[] {
  if (isSplit(line)) {
    return line.allocs ?? [];
  }
  if (isSerial(line) || (!line.batch && !line.expiry)) {
    return [];
  }
  const entry: PurchaseAllocEntry = { bucket: "SALEABLE", qty: num(line.receive) };
  if (line.batch) entry.batchNo = line.batch;
  const expiry = isoFromTyped(line.expiry);
  if (expiry) entry.expiryDate = expiry;
  if (line.mrp > 0) entry.mrp = line.mrp;
  return [entry];
}

/** The Batch / Serial cell's text. */
export function batchCellText(line: ShortageLine, isDraft: boolean): string {
  if (isSplit(line)) {
    const n = line.allocs?.length ?? 0;
    const serial = (line.allocs ?? []).some((a) => text(a.serialNo) !== "");
    return serial ? (n === 1 ? "1 serial (F12)" : `${n} serials (F12)`) : n === 1 ? "1 batch (F12)" : `${n} batches (F12)`;
  }
  if (isSerial(line) && isDraft) {
    return "serials — F12";
  }
  return line.batch;
}

/** Why F12 cannot open on this row now; "" = it can. */
export function allocBlocker(draft: ShortageDraft, line: ShortageLine | null, index: number): string {
  if (!line || !line.shortageId) {
    return "Put the cursor on a shortage row, then F12.";
  }
  if (draft.status === "DRAFT" && (!line.ticked || num(line.receive) <= 0)) {
    return `Line ${index + 1}: tick it (Space) or type Receive now first.`;
  }
  return "";
}

// ---------------------------------------------------------------- figures

export type ShortageTotals = { ticked: number; qty: number; unit: string; value: number; itc: number; stillOpen: number };

/** The strip (Qt `recalcTotals`). */
export function computeTotals(draft: ShortageDraft): ShortageTotals {
  let ticked = 0;
  let stillOpen = 0;
  let qty = 0;
  let value = 0;
  let itc = 0;
  const units = new Set<string>();
  const saved = draft.status !== "DRAFT";
  for (const line of draft.lines) {
    if (!line.shortageId) {
      continue;
    }
    const q = line.ticked ? num(line.receive) : 0;
    if (line.ticked && q > 0) {
      ticked += 1;
      qty += q;
      value += q * line.cost;
      itc += saved ? (line.gstReleased ?? 0) : q * line.gstPerUnit;
      units.add(line.unitName.toLowerCase());
    }
    // a posted receipt: Open is what is left now; a draft / new one: what this receipt leaves
    const left = saved ? (line.openQty ?? 0) : (line.openQty ?? 0) - q;
    if (left > EPS) {
      stillOpen += 1;
    }
  }
  return {
    ticked,
    qty,
    unit: units.size === 1 ? [...units][0] : "",
    value: Math.round(value * 100) / 100,
    itc: Math.round(itc * 100) / 100,
    stillOpen,
  };
}

export type StripCell = { key: string; caption: string; value: string; tone?: "good" | "warn"; strong?: boolean };

export function stripCells(totals: ShortageTotals): StripCell[] {
  return [
    { key: "ticked", caption: "Ticked rows", value: String(totals.ticked) },
    { key: "qty", caption: "Receive now (base)", value: `${qtyText(totals.qty)}${totals.unit ? ` ${totals.unit}` : ""}` },
    { key: "value", caption: "Stock in at original cost", value: money(totals.value) },
    { key: "itc", caption: "ITC released", value: money(totals.itc), ...(totals.itc > 0 ? { tone: "good" as const } : {}) },
    {
      key: "open",
      caption: "Still open after this",
      value: totals.stillOpen === 1 ? "1 row" : `${totals.stillOpen} rows`,
      tone: totals.stillOpen > 0 ? "warn" : "good",
      strong: true,
    },
  ];
}

/** "Ticked 2 · Receive 4 pcs · Stock in 300.00 · ITC 48.00 · Still open 1 row" (Qt `totalsText`). */
export function totalsText(totals: ShortageTotals): string {
  const cells = stripCells(totals);
  const v = (key: string) => cells.find((cell) => cell.key === key)?.value ?? "";
  return `Ticked ${v("ticked")} · Receive ${v("qty")} · Stock in ${v("value")} · ITC ${v("itc")} · Still open ${v("open")}`;
}

/** The pill: a new receipt = NEW / "N OPEN" / NOTHING OPEN; a saved one = its status. */
export function pillOf(draft: ShortageDraft): { label: string; tone: "neutral" | "warning" | "success" | "info" | "danger" } {
  if (isFresh(draft)) {
    if (!draft.supplierId) {
      return { label: "NEW", tone: "neutral" };
    }
    const open = draft.lines.filter((line) => (line.openQty ?? 0) > 0).length;
    return open > 0 ? { label: `${open} OPEN`, tone: "warning" } : { label: "NOTHING OPEN", tone: "success" };
  }
  return {
    label: draft.status,
    tone: draft.status === "POSTED" ? "success" : draft.status === "CANCELLED" ? "danger" : "warning",
  };
}

export function titleText(draft: ShortageDraft): string {
  return draft.supplierName ? `Shortage Receipt — ${draft.supplierName}` : "Shortage Receipt — pick the supplier";
}

/** The Outcome chips: Supplier sends (blue) / Replacement (green), PART when part received / closed. */
export function outcomeChips(line: ShortageLine): { text: string; tone: "info" | "success" | "warning" }[] {
  if (!line.shortageId) {
    return [];
  }
  const chips: { text: string; tone: "info" | "success" | "warning" }[] = [
    line.reason === "REPLACE" ? { text: "Replacement", tone: "success" } : { text: "Supplier sends", tone: "info" },
  ];
  if (line.status === "PART") {
    chips.push({ text: "PART", tone: "warning" });
  }
  return chips;
}

// ---------------------------------------------------------------- checks

export type LineProblem = { key: string; text: string };

/** Said on the hint line while typing (Qt `onCellEdited`); the server refuses them. */
export function lineProblems(draft: ShortageDraft): LineProblem[] {
  const problems: LineProblem[] = [];
  draft.lines.forEach((line, index) => {
    const label = `Line ${index + 1}`;
    if (!isSplit(line) && line.expiry.trim() && line.expiry.trim() !== "—" && !isoFromTyped(line.expiry)) {
      problems.push({ key: line.key, text: `${label}: expiry must be dd/MM/yyyy.` });
    }
    const q = num(line.receive);
    if (line.ticked && q > 0 && line.openQty !== null && q > line.openQty + 1e-9 && draft.status === "DRAFT") {
      problems.push({
        key: line.key,
        text: `${label}: ${qtyText(q)} is more than the ${qtyText(line.openQty)} still open — the server will refuse it.`,
      });
    }
  });
  return problems;
}

/** Why Save / Post cannot go yet (Qt `saveDocument`'s boxes) — the first reason, or null. */
export function saveBlocker(draft: ShortageDraft): { title: string; text: string } | null {
  if (draft.status !== "DRAFT") {
    return { title: "Not a draft", text: `${draft.refno || "This receipt"} is ${draft.status}.` };
  }
  if (!draft.supplierId || !draft.godownId) {
    return { title: "Header incomplete", text: "Pick the supplier and the godown." };
  }
  const index = draft.lines.findIndex((line) => line.ticked && isSerial(line) && !isSplit(line) && num(line.receive) > 0);
  if (index >= 0) {
    return {
      title: "Serials needed",
      text: `Line ${index + 1} (${draft.lines[index].itemName}) tracks serials — F12 and scan one per piece.`,
    };
  }
  if (!draft.lines.some((line) => line.ticked && num(line.receive) > 0)) {
    return { title: "Nothing received", text: "Tick the rows that came (Space), or type Receive now." };
  }
  return null;
}

// ---------------------------------------------------------------- payload

function allocWire(entry: PurchaseAllocEntry): ShortageAllocDto {
  const out: ShortageAllocDto = { bucket: "SALEABLE", qty: entry.qty };
  const put = (key: "godownId" | "batchNo" | "mfgDate" | "expiryDate" | "serialNo" | "warrantyTo", value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    if (trimmed) out[key] = trimmed;
  };
  put("godownId", entry.godownId);
  put("batchNo", entry.batchNo);
  put("mfgDate", entry.mfgDate);
  put("expiryDate", entry.expiryDate);
  put("serialNo", entry.serialNo);
  put("warrantyTo", entry.warrantyTo);
  if (entry.mrp !== undefined && entry.mrp > 0) out.mrp = entry.mrp;
  return out;
}

/** Qt `buildPayload` — only the ticked rows with a qty, numbered from 1. */
export function buildSavePayload(draft: ShortageDraft, post: boolean): SaveShortageReceiptDto {
  const challanNo = draft.challanNo.trim();
  const remarks = draft.remarks.trim();
  const lines: SaveShortageReceiptDto["lines"] = [];
  for (const line of draft.lines) {
    const qty = num(line.receive);
    if (!line.ticked || qty <= 0) {
      continue;
    }
    const base = { lineNo: lines.length + 1, shortageId: line.shortageId, shortageAccYear: line.shortageYear, qty };
    if (isSplit(line)) {
      lines.push({ ...base, allocs: (line.allocs ?? []).map(allocWire) });
      continue;
    }
    const batchNo = isSerial(line) ? "" : line.batch.trim();
    const expiryDate = isoFromTyped(line.expiry);
    lines.push({
      ...base,
      ...(batchNo ? { batchNo } : {}),
      ...(expiryDate ? { expiryDate } : {}),
      ...(line.mrp > 0 ? { mrp: line.mrp } : {}),
    });
  }
  const receivedAt = draft.receivedTyped || !draft.psrId ? receivedAtWire(draft.receivedAt) : "";
  return {
    header: {
      ...(draft.psrId ? { psrId: draft.psrId } : {}),
      companyId: draft.companyId,
      branchId: draft.branchId,
      accYear: draft.accYear,
      deviceId: draft.deviceId,
      supplierId: draft.supplierId,
      godownId: draft.godownId,
      docDate: draft.receivedAt.slice(0, 10),
      ...(receivedAt ? { receivedAt } : {}),
      ...(challanNo ? { challanNo } : {}),
      ...(remarks ? { remarks } : {}),
      receivedBy: draft.receivedBy.map((pick) => pick.id),
      // omitted = keep the saved one, null = clear it
      ...(draft.supervisorId ? { supervisorId: draft.supervisorId } : draft.psrId ? { supervisorId: null } : {}),
      post,
    },
    lines,
  };
}

// ---------------------------------------------------------------- Close row…

/** The ticked open rows, else the current one (Qt `closeTargets`). */
export function closeTargets(draft: ShortageDraft): ShortageLine[] {
  const ticked = draft.lines.filter((line) => line.ticked && (line.openQty ?? 0) > 0);
  if (ticked.length > 0) {
    return ticked;
  }
  const current = draft.lines.find((line) => line.key === draft.activeKey);
  return current && (current.openQty ?? 0) > 0 ? [current] : [];
}

/** After the closes: every tick and typed qty goes (Qt `closeRows`' end). */
export function clearTicks(draft: ShortageDraft): ShortageDraft {
  if (!draft.lines.some((line) => line.ticked || line.receive)) {
    return draft;
  }
  return { ...draft, lines: draft.lines.map((line) => (line.ticked || line.receive ? { ...line, ticked: false, receive: "" } : line)) };
}

export function closedNotice(count: number, kind: string): string {
  return (count === 1 ? "1 shortage closed." : `${count} shortages closed.`) + (kind === "CLAIM" ? " The claim is settled on Supplier dues." : "");
}

// ---------------------------------------------------------------- refusals

/** A refused save's `errors[]` → the WARN / REFUSE strip's rows (each one a refusal). */
export function refusalIssues(error: unknown): PurchaseIssue[] {
  const data = error && typeof error === "object" ? (error as { data?: unknown }).data : undefined;
  const errors = data && typeof data === "object" ? (data as { errors?: unknown }).errors : undefined;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      code: text(entry.code),
      message: text(entry.message),
      field: text(entry.field),
      level: "REFUSE",
      lineNo: typeof entry.lineNo === "number" ? entry.lineNo : null,
    }));
}

// ---------------------------------------------------------------------------
// The document keys (Qt `PurchaseDocNav`)
// ---------------------------------------------------------------------------

/**
 * Edit · F2: a saved draft opened read only opens for keying; anything else is
 * told why on the hint line.
 */
export function editAnswer(
  draft: Pick<ShortageDraft, "psrId" | "refno" | "status" | "mode">,
  mayEdit: boolean,
): { open: boolean; focusLines: boolean; notice: string } {
  if (!draft.psrId) {
    return { open: false, focusLines: false, notice: "A new shortage receipt — tick what came, then Save Draft (Ctrl+S) or Post receipt." };
  }
  if (draft.status === "DRAFT") {
    if (draft.mode === "browse") {
      return mayEdit
        ? { open: true, focusLines: true, notice: "" }
        : { open: false, focusLines: false, notice: `${draft.refno} is a draft, but you have no Edit right on Shortage Receipt.` };
    }
    return { open: false, focusLines: true, notice: `${draft.refno} is a draft — change it, then Save Draft (Ctrl+S) or Post receipt.` };
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
    return previous ? "There is no shortage receipt yet." : "A new shortage receipt is the newest — nothing comes after it.";
  }
  return previous ? "This is the oldest shortage receipt." : "This is the newest shortage receipt.";
}

/** The hint after a receipt is opened / saved (Qt `applyLoaded`). */
export function loadedHint(draft: ShortageDraft): string {
  if (draft.status === "DRAFT") {
    return `${draft.refno} — a draft: change Receive now / batches and Save Draft or Post receipt.`;
  }
  if (draft.status === "POSTED") {
    return `${draft.refno} is posted — the goods are in. Cancel (Alt+X) opens the shortage again.`;
  }
  return `${draft.refno} is cancelled.`;
}
