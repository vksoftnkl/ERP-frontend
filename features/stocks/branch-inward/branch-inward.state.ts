/**
 * Branch Inward — every rule of the receipt as a pure transition on the draft
 * (the Qt `BranchInwardEntry`: applyPrefill / applyReceipt / recalcTotals /
 * clientProblems / addDamagedLine / removeLine). No React, no network.
 *
 * A line is a TRANSIT ROW of the despatch — item × lot × destination godown —
 * opened at what is still owed, never at what was sent. One transit row may be
 * received as two lines: what came good in its own bucket, what came broken in
 * DAMAGED. What never arrived gets no line (Receiving now 0 is not sent).
 */
import { cellNumber, money, nearlyZero, qtyCell } from "../stock-adjustment/stock-adjustment.format";
import { accountingYearOf, todayIso } from "@/features/sales/quotation/quotation.utils";
import { DAMAGED_BUCKET, EPS } from "./branch-inward.constants";
import type {
  InboundRow,
  InwardDraft,
  InwardLine,
  Outcome,
  PrefillPayload,
  ReceiptHeader,
  ReceiptLine,
  Totals,
} from "./branch-inward.types";

export type DraftScope = { companyId: string; branchId: string; accYear: string; deviceId: string };

let lineSeq = 0;
function nextKey(): string {
  lineSeq += 1;
  return `bi-${lineSeq}`;
}

export const num = cellNumber;

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** `datetime-local` text for "now" (the Qt `QDateTime::currentDateTime()`). */
export function nowLocal(): string {
  const now = new Date();
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** An ISO instant (UTC) as the local `datetime-local` text; now when it is not one. */
export function isoToLocal(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return nowLocal();
  }
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The local `datetime-local` text as the UTC instant the server stores. */
export function localToIso(local: string): string {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/** A blank screen: nothing picked, so the worklist shows. */
export function createDraft(scope: DraftScope): InwardDraft {
  return {
    svhId: "",
    refno: "",
    status: "DRAFT",
    mode: "entry",
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear || accountingYearOf(todayIso()),
    deviceId: scope.deviceId,
    docDate: todayIso(),
    remarks: "",
    outId: "",
    outAccYear: "",
    outRefno: "",
    fromBranchName: "",
    fromGodownId: "",
    toGodownId: "",
    toGodownName: "",
    lines: [],
    unloadEnabled: false,
    unloadAt: nowLocal(),
    unloadmen: [],
    unloadSupervisor: null,
    postedUnloadCharge: null,
    createdByName: "",
    postedByName: "",
    problems: {},
    dirty: false,
    asKeyed: false,
    notice: "",
  };
}

export function isDraftStatus(draft: InwardDraft): boolean {
  return draft.status === "DRAFT" || draft.status === "";
}

/** A DRAFT open for keying — the only state a cell may change. */
export function isEditable(draft: InwardDraft): boolean {
  return draft.mode === "entry" && isDraftStatus(draft);
}

export function hasDespatch(draft: InwardDraft): boolean {
  return draft.outId !== "";
}

/** Worth asking about before a screen change: unsaved keying on a picked despatch. */
export function isWorthKeeping(draft: InwardDraft): boolean {
  return draft.dirty;
}

// ── Opening a despatch ───────────────────────────────────────────────────

/** One prefill: the despatch's transit rows at the REMAINDER, "it all came". */
export function applyPrefill(
  draft: InwardDraft,
  prefill: PrefillPayload,
  worklistRow?: InboundRow | null,
): InwardDraft {
  const out = prefill.outVoucher;
  const lines: InwardLine[] = prefill.rows.map((row) => {
    const remaining = num(row.remainingQty);
    return {
      key: nextKey(),
      sttId: row.sttId,
      sviId: "",
      itemId: row.itemId,
      itemName: text(row.itemName),
      batchNo: text(row.batchNo),
      unitName: text(row.unitName),
      lotId: row.lotId,
      baseUomId: row.baseUomId,
      toGodownId: row.toGodownId,
      transitBucket: row.bucket,
      sentQty: num(row.sentQty),
      receivedQty: num(row.receivedQty) + num(row.damageQty),
      remainingQty: remaining,
      qty: qtyCell(remaining),
      bucket: row.bucket,
      unloadRate: "0",
    };
  });
  const toGodownName =
    text(out.toGodownName) || text(prefill.rows[0]?.toGodownName) || text(worklistRow?.to_godown) || draft.toGodownName;
  return {
    ...draft,
    outId: out.svhId,
    outAccYear: out.accYear,
    outRefno: out.refno,
    fromGodownId: text(out.fromGodownId),
    toGodownId: text(out.toGodownId),
    fromBranchName: text(out.fromBranchName) || text(worklistRow?.from_branch) || draft.fromBranchName,
    toGodownName,
    lines,
    problems: {},
    asKeyed: false,
    dirty: true,
    notice: "",
  };
}

/**
 * A reopened draft: its own figures over today's remainder — the line's own
 * bucket on the transit row's line, a DAMAGED line as a split of it.
 */
export function overlaySavedLines(draft: InwardDraft, saved: readonly ReceiptLine[]): InwardDraft {
  const lines = draft.lines.map((line) => ({ ...line, qty: "0" }));
  const used = new Set<string>();
  for (const l of saved) {
    const lot = text(l.lotId);
    const godown = text(l.godownId);
    const bucket = text(l.bucket);
    const siblings = lines.filter((line) => line.lotId === lot && line.toGodownId === godown);
    if (siblings.length === 0) {
      continue;
    }
    const exact = siblings.find((line) => line.transitBucket === bucket && !used.has(line.key));
    if (exact) {
      used.add(exact.key);
      exact.qty = qtyCell(num(l.qty));
      exact.unloadRate = qtyCell(num(l.unloadRate));
      exact.sviId = text(l.sviId);
      continue;
    }
    // A different bucket than any transit row of that lot: a split of the first one.
    const base = siblings[0];
    const at = lines.indexOf(base) + 1;
    const split: InwardLine = {
      ...base,
      key: nextKey(),
      sviId: text(l.sviId),
      bucket,
      qty: qtyCell(num(l.qty)),
      unloadRate: qtyCell(num(l.unloadRate)),
    };
    lines.splice(at, 0, split);
  }
  return { ...draft, lines, dirty: false };
}

/** A saved receipt's header laid on a blank draft (no lines yet). */
export function draftFromHeader(scope: DraftScope, header: ReceiptHeader): InwardDraft {
  const base = createDraft(scope);
  const docDate = text(header.docDate).slice(0, 10);
  const status = text(header.status) || "DRAFT";
  return {
    ...base,
    svhId: text(header.svhId),
    refno: text(header.refno),
    status,
    accYear: text(header.accYear) || base.accYear,
    companyId: text(header.companyId) || base.companyId,
    branchId: text(header.branchId) || base.branchId,
    docDate: docDate || base.docDate,
    remarks: text(header.remarks),
    outId: text(header.linkSrcDocId),
    outAccYear: text(header.linkSrcAccYear),
    outRefno: text(header.linkSrcRefno),
    fromBranchName: text(header.fromBranchName),
    fromGodownId: text(header.fromGodownId),
    toGodownId: text(header.godownId),
    toGodownName: text(header.godownName),
    unloadEnabled: header.unloadEnabled === true,
    unloadAt: isoToLocal(header.unloadDatetime),
    unloadmen: (header.unloadmanIds ?? []).map((id, index) => ({ id, text: header.unloadmanNames?.[index] ?? "" })),
    unloadSupervisor: header.unloadSupervisorId
      ? { id: header.unloadSupervisorId, text: text(header.unloadSupervisorName) }
      : null,
    postedUnloadCharge: header.unloadingCharge === null || header.unloadingCharge === undefined ? null : num(header.unloadingCharge),
    createdByName: text(header.createdByName),
    postedByName: text(header.postedByName),
  };
}

/** A saved receipt shown as keyed: what came in, into which bucket. Read-only. */
export function draftAsKeyed(base: InwardDraft, saved: readonly ReceiptLine[]): InwardDraft {
  const lines: InwardLine[] = saved.map((l) => ({
    key: nextKey(),
    sttId: text(l.sviId) || nextKey(),
    sviId: text(l.sviId),
    itemId: l.itemId,
    itemName: text(l.itemName),
    batchNo: text(l.batchNo),
    unitName: text(l.unitName),
    lotId: l.lotId,
    baseUomId: "",
    toGodownId: text(l.godownId),
    transitBucket: text(l.bucket),
    sentQty: 0,
    receivedQty: 0,
    remainingQty: num(l.qty),
    qty: qtyCell(num(l.qty)),
    bucket: text(l.bucket),
    unloadRate: qtyCell(num(l.unloadRate)),
  }));
  return { ...base, lines, mode: "browse", asKeyed: true, dirty: false, problems: {} };
}

// ── Editing ──────────────────────────────────────────────────────────────

function touch(draft: InwardDraft, lines: InwardLine[], clearKey?: string): InwardDraft {
  let problems = draft.problems;
  if (clearKey && problems[clearKey]) {
    problems = { ...problems };
    delete problems[clearKey];
  }
  return { ...draft, lines, problems, dirty: true };
}

export function setHeader(draft: InwardDraft, patch: Partial<Pick<InwardDraft, "docDate" | "remarks">>): InwardDraft {
  return isEditable(draft) ? { ...draft, ...patch, dirty: true } : draft;
}

export function setUnloading(draft: InwardDraft, patch: Partial<Pick<InwardDraft, "unloadEnabled" | "unloadAt" | "unloadmen" | "unloadSupervisor">>): InwardDraft {
  return isEditable(draft) ? { ...draft, ...patch, dirty: true } : draft;
}

export function editLine(draft: InwardDraft, key: string, patch: Partial<Pick<InwardLine, "qty" | "bucket" | "unloadRate">>): InwardDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  return touch(
    draft,
    draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    key,
  );
}

export type LineChange = { draft: InwardDraft; hint: string; focusKey: string | null };

/** + : what came broken — a second line for the same transit row, in DAMAGED. */
export function addDamagedLine(draft: InwardDraft, key: string): LineChange {
  const unchanged = { draft, hint: "", focusKey: null };
  if (!isEditable(draft)) {
    return unchanged;
  }
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0) {
    return unchanged;
  }
  const row = draft.lines[index];
  const existing = draft.lines.findIndex((line) => line.sttId === row.sttId && line.bucket === DAMAGED_BUCKET);
  if (existing >= 0) {
    return {
      draft,
      hint: `${row.itemName} already has a Damaged line (${existing + 1}).`,
      focusKey: draft.lines[existing].key,
    };
  }
  const split: InwardLine = { ...row, key: nextKey(), sviId: "", bucket: DAMAGED_BUCKET, qty: "0" };
  const lines = [...draft.lines];
  lines.splice(index + 1, 0, split);
  return { draft: touch(draft, lines), hint: "", focusKey: split.key };
}

/**
 * − : drop a line. The last line of a transit row is zeroed instead — what
 * never came stays in transit, and the row stays on screen to say so.
 */
export function removeLine(draft: InwardDraft, key: string): InwardDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  const row = draft.lines.find((line) => line.key === key);
  if (!row) {
    return draft;
  }
  const siblings = draft.lines.filter((line) => line.sttId === row.sttId).length;
  const lines =
    siblings > 1
      ? draft.lines.filter((line) => line.key !== key)
      : draft.lines.map((line) => (line.key === key ? { ...line, qty: "0" } : line));
  return { ...touch(draft, lines), problems: {} };
}

/** The buckets a line may hold: the transit row's own, or DAMAGED — any other would launder broken goods clean. */
export function bucketOptions(line: InwardLine): string[] {
  return line.transitBucket === DAMAGED_BUCKET || !line.transitBucket
    ? [DAMAGED_BUCKET]
    : [line.transitBucket, DAMAGED_BUCKET];
}

// ── Maths ────────────────────────────────────────────────────────────────

export function lineQty(line: InwardLine): number {
  return num(line.qty);
}

/** Transit row -> received now, all buckets. */
function perTransitRow(draft: InwardDraft): Map<string, number> {
  const sums = new Map<string, number>();
  for (const line of draft.lines) {
    sums.set(line.sttId, (sums.get(line.sttId) ?? 0) + lineQty(line));
  }
  return sums;
}

export function computeTotals(draft: InwardDraft): Totals {
  let receiving = 0;
  let damaged = 0;
  let remaining = 0;
  let unload = 0;
  const counted = new Set<string>();
  for (const line of draft.lines) {
    const qty = lineQty(line);
    receiving += qty;
    if (line.bucket === DAMAGED_BUCKET) {
      damaged += qty;
    }
    unload += qty * num(line.unloadRate);
    if (!counted.has(line.sttId)) {
      counted.add(line.sttId);
      remaining += line.remainingQty;
    }
  }
  return {
    receiving,
    damaged,
    remaining,
    shortAfter: remaining - receiving,
    // Posts when the receipt posts, at this (the receiving) branch; the server prices it.
    unloadCharge: draft.unloadEnabled ? unload : 0,
  };
}

/** The "what Post writes" note of each line, by line key. */
export function lineNotes(draft: InwardDraft): Map<string, string> {
  const notes = new Map<string, string>();
  if (draft.asKeyed) {
    return notes;
  }
  const sums = perTransitRow(draft);
  const godown = draft.toGodownName || "the godown";
  for (const line of draft.lines) {
    const qty = lineQty(line);
    const broken = line.bucket === DAMAGED_BUCKET;
    const left = line.remainingQty - (sums.get(line.sttId) ?? 0);
    let note: string;
    if (qty <= EPS) {
      note = broken ? "" : "not received — stays in transit";
    } else if (broken) {
      note = `IN +${qtyCell(qty)} into the DAMAGED bucket`;
    } else {
      note =
        left <= EPS
          ? `IN +${qtyCell(qty)} ${godown} · transit → RECEIVED`
          : `IN +${qtyCell(qty)} ${godown} · ${qtyCell(left)} still to come`;
    }
    notes.set(line.key, note);
  }
  return notes;
}

/** The Outcome card. */
export function outcomeOf(draft: InwardDraft, totals: Totals): Outcome {
  if (!hasDespatch(draft)) {
    return { tone: "", title: "Pick the despatch that arrived", text: "" };
  }
  if (draft.asKeyed) {
    return {
      tone: "good",
      title: draft.status === "POSTED" ? `Received against ${draft.outRefno}` : `Draft against ${draft.outRefno}`,
      text: `${qtyCell(totals.receiving)} came into ${draft.toGodownName} on this receipt.`,
    };
  }
  if (totals.shortAfter > EPS) {
    return {
      tone: "warn",
      title: `${draft.outRefno} stays IN TRANSIT`,
      text:
        `Receiving ${qtyCell(totals.receiving)} of ${qtyCell(totals.remaining)} still to come (${qtyCell(totals.damaged)} damaged). ` +
        `${qtyCell(totals.shortAfter)} stays on the lorry: the despatch closes only when nothing remains — a later receipt, ` +
        "or the sending branch settles it short.",
    };
  }
  return {
    tone: "good",
    title: `${draft.outRefno} closes`,
    text: `Receiving all ${qtyCell(totals.receiving)} still to come (${qtyCell(totals.damaged)} damaged). The despatch becomes RECEIVED.`,
  };
}

/** What the screen can refuse before asking the server, by line key ("" = the screen as a whole). */
export function clientProblems(draft: InwardDraft): Map<string, string> {
  const out = new Map<string, string>();
  if (draft.asKeyed) {
    return out;
  }
  const sums = perTransitRow(draft);
  const first = new Map<string, number>();
  draft.lines.forEach((line, index) => {
    if (!first.has(line.sttId)) {
      first.set(line.sttId, index);
    }
  });
  let total = 0;
  for (const [stt, sum] of sums) {
    total += sum;
    const index = first.get(stt) ?? 0;
    const line = draft.lines[index];
    if (sum > line.remainingQty + EPS) {
      out.set(
        line.key,
        `Line ${index + 1} — ${line.itemName}: receiving ${qtyCell(sum)} but only ${qtyCell(line.remainingQty)} is still in transit.`,
      );
    }
  }
  if (hasDespatch(draft) && total <= EPS && draft.lines.length > 0) {
    out.set(draft.lines[0].key, "Nothing is being received — key what arrived.");
  }
  return out;
}

/** The validation strip: the server's refusals first, then ours; "(+n more)". */
export function validationStrip(draft: InwardDraft): { text: string; keys: Set<string> } | null {
  const all = new Map<string, string>(Object.entries(draft.problems));
  for (const [key, message] of clientProblems(draft)) {
    if (!all.has(key)) {
      all.set(key, message);
    }
  }
  if (all.size === 0) {
    return null;
  }
  const first = all.values().next().value as string;
  const more = all.size > 1 ? `   (+${all.size - 1} more)` : "";
  return { text: `Validation · ${first}${more}`, keys: new Set(all.keys()) };
}

// ── Screen text ──────────────────────────────────────────────────────────

export function titleLine(draft: InwardDraft): string {
  return draft.refno ? `Transfer In — ${draft.refno}` : "Transfer In — receive";
}

export function scopeLabel(draft: InwardDraft, companyName: string): string {
  const parts = [companyName];
  if (draft.outRefno) {
    parts.push(`against ${draft.outRefno} from ${draft.fromBranchName}`);
  }
  return parts.filter(Boolean).join(" · ");
}

export function auditLines(draft: InwardDraft): string[] {
  const lines: string[] = [];
  if (draft.createdByName) {
    lines.push(`Created by ${draft.createdByName}`);
  }
  if (draft.postedByName) {
    lines.push(`Posted by ${draft.postedByName}`);
  }
  if (lines.length === 0 && !draft.svhId) {
    lines.push("New — not saved yet");
  }
  return lines;
}

/** The post question (Qt `showConfirm`): what comes in, where, against what. */
export function postConfirmMessage(draft: InwardDraft, totals: Totals, outcome: Outcome): string {
  return (
    `${qtyCell(totals.receiving)} comes into ${draft.toGodownName} against ${draft.outRefno} ` +
    `(${qtyCell(totals.damaged)} damaged). A posted receipt cannot be un-received.\n\n${outcome.text}`
  );
}

export function chargeText(draft: InwardDraft, totals: Totals): string {
  if (draft.postedUnloadCharge !== null && draft.asKeyed) {
    return money(draft.postedUnloadCharge);
  }
  return nearlyZero(totals.unloadCharge) ? money(0) : money(totals.unloadCharge);
}
