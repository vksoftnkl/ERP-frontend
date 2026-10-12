/**
 * Wire → screen. Defensive on purpose: a field the server leaves out reads as
 * blank / zero rather than throwing over a screen someone is working in, and
 * amounts are brought to paise here so nothing downstream sees a float.
 */
import { paiseOf } from "./money";
import {
  MATCH_STATUSES,
  type FormatPayload,
  type FormatTestResult,
  type GridRow,
  type Leg,
  type MatchStatus,
  type Payout,
  type PostedPayout,
  type ResolveResult,
  type SettlementLine,
  type StatementFormat,
  type TenderRowInfo,
  type TestLine,
  type WriteOffResult,
} from "./types";

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function obj(value: unknown): Obj {
  return isObj(value) ? value : {};
}

/** Text of a field; numbers and booleans as their text, null / missing as "". */
export function text(source: unknown, key: string): string {
  const value = obj(source)[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

function int(source: unknown, key: string): number {
  const value = obj(source)[key];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function list(source: unknown, key: string): unknown[] {
  const value = obj(source)[key];
  return Array.isArray(value) ? value : [];
}

/** `{ success, message, data }` → data (or the payload itself when it is not an envelope). */
export function unwrapData(payload: unknown): unknown {
  return isObj(payload) && "data" in payload ? payload.data : payload;
}

export function parseTenderRow(raw: unknown): TenderRowInfo | null {
  if (!isObj(raw) || !text(raw, "tdId")) return null;
  return {
    tdId: text(raw, "tdId"),
    tdAccYear: text(raw, "tdAccYear"),
    srcDocType: text(raw, "srcDocType"),
    srcDocId: text(raw, "srcDocId"),
    docRefno: text(raw, "docRefno"),
    docDate: text(raw, "docDate"),
    amount: paiseOf(raw.amount),
    refNo: text(raw, "refNo"),
    authCode: text(raw, "authCode"),
    cardLast4: text(raw, "cardLast4"),
    settleStatus: text(raw, "settleStatus"),
    sessionId: text(raw, "sessionId"),
    createdOn: text(raw, "createdOn"),
  };
}

export function parseLine(raw: unknown): SettlementLine {
  const o = obj(raw);
  return {
    aslId: text(o, "aslId"),
    rowNo: int(o, "rowNo"),
    kind: text(o, "kind"),
    txnOn: text(o, "txnOn"),
    terminalId: text(o, "terminalId"),
    vpa: text(o, "vpa"),
    tenderId: text(o, "tenderId"),
    refNo: text(o, "refNo"),
    authCode: text(o, "authCode"),
    cardLast4: text(o, "cardLast4"),
    payer: text(o, "payer"),
    gross: paiseOf(o.gross),
    fee: paiseOf(o.fee),
    tax: paiseOf(o.tax),
    net: paiseOf(o.net),
    matchStatus: text(o, "matchStatus"),
    matchRule: text(o, "matchRule"),
    amountDiff: paiseOf(o.amountDiff),
    tenderRow: parseTenderRow(o.tenderRow),
    resolution: text(o, "resolution"),
    reasonId: text(o, "reasonId"),
    resolutionVoucherId: text(o, "resolutionVoucherId"),
    notes: text(o, "notes"),
  };
}

function parseCounts(raw: unknown): Record<MatchStatus, number> {
  const counts = {} as Record<MatchStatus, number>;
  for (const status of MATCH_STATUSES) counts[status] = int(raw, status);
  return counts;
}

/** A payout (GET get, match, confirm, unlink, ignore, void — they all answer one). */
export function parsePayout(raw: unknown): Payout | null {
  const o = obj(raw);
  if (!text(o, "asiId")) return null;
  return {
    asiId: text(o, "asiId"),
    accYear: text(o, "accYear"),
    companyId: text(o, "companyId"),
    branchId: text(o, "branchId"),
    source: text(o, "source"),
    provider: text(o, "provider"),
    tenderId: text(o, "tenderId"),
    fileName: text(o, "fileName"),
    payoutRef: text(o, "payoutRef"),
    payoutDate: text(o, "payoutDate"),
    periodFrom: text(o, "periodFrom"),
    periodTo: text(o, "periodTo"),
    lineCount: int(o, "lineCount"),
    totalGross: paiseOf(o.totalGross),
    totalFee: paiseOf(o.totalFee),
    totalTax: paiseOf(o.totalTax),
    totalNet: paiseOf(o.totalNet),
    status: text(o, "status"),
    bankLedgerId: text(o, "bankLedgerId"),
    bankLedgerName: text(o, "bankLedgerName"),
    voucherId: text(o, "voucherId"),
    voucherRefno: text(o, "voucherRefno"),
    importedOn: text(o, "importedOn"),
    postedOn: text(o, "postedOn"),
    voidReason: text(o, "voidReason"),
    notes: text(o, "notes"),
    counts: parseCounts(o.counts),
    lines: list(o, "lines").map(parseLine),
  };
}

export function parseLegs(raw: unknown): Leg[] {
  return (Array.isArray(raw) ? raw : []).map((leg) => ({
    drCr: text(leg, "drCr").toUpperCase() === "CR" ? "CR" : "DR",
    ledgerId: text(leg, "ledgerId"),
    ledgerName: text(leg, "ledgerName"),
    role: text(leg, "role"),
    amount: paiseOf(obj(leg).amount),
  }));
}

/** POST post: the payout, plus the legs the TSet wrote (GET get carries none). */
export function parsePostedPayout(raw: unknown): PostedPayout | null {
  const payout = parsePayout(raw);
  return payout ? { payout, legs: parseLegs(obj(raw).legs) } : null;
}

/** POST import: one payout per payout the file carried. */
export function parseImportResult(raw: unknown): Payout[] {
  return list(raw, "imports")
    .map(parsePayout)
    .filter((payout): payout is Payout => payout !== null);
}

function parseStatementFormat(raw: unknown): StatementFormat | null {
  if (!isObj(raw)) return null;
  const columns: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj(raw.columns))) {
    if (typeof value === "string") columns[key] = value;
  }
  const kindMap: Record<string, string[]> = {};
  for (const [kind, words] of Object.entries(obj(raw.kindMap))) {
    if (Array.isArray(words)) kindMap[kind] = words.filter((w): w is string => typeof w === "string");
  }
  return {
    version: 1,
    source: text(raw, "source"),
    provider: text(raw, "provider"),
    columns,
    ...(isObj(raw.kindMap) ? { kindMap } : {}),
    ...(typeof raw.dateFormat === "string" ? { dateFormat: raw.dateFormat } : {}),
    ...(typeof raw.negativeIsRefund === "boolean" ? { negativeIsRefund: raw.negativeIsRefund } : {}),
  };
}

export function parseFormatPayload(raw: unknown): FormatPayload {
  const o = obj(raw);
  return {
    tenderId: text(o, "tenderId"),
    tenderName: text(o, "tenderName"),
    terminalId: text(o, "terminalId"),
    upiVpa: text(o, "upiVpa"),
    settlementLedgerId: text(o, "settlementLedgerId"),
    settlementDays: int(o, "settlementDays"),
    format: parseStatementFormat(o.format),
  };
}

function parseTestLine(raw: unknown): TestLine {
  const o = obj(raw);
  return {
    lineNo: int(o, "lineNo"),
    kind: text(o, "kind"),
    txnOn: text(o, "txnOn"),
    terminalId: text(o, "terminalId"),
    refNo: text(o, "refNo"),
    authCode: text(o, "authCode"),
    cardLast4: text(o, "cardLast4"),
    gross: paiseOf(o.gross),
    fee: paiseOf(o.fee),
    tax: paiseOf(o.tax),
    net: paiseOf(o.net),
    payoutRef: text(o, "payoutRef"),
    payoutDate: text(o, "payoutDate"),
  };
}

export function parseFormatTest(raw: unknown): FormatTestResult {
  return {
    lines: list(raw, "lines").map(parseTestLine),
    problems: list(raw, "problems").map((p) => ({ lineNo: int(p, "lineNo"), message: text(p, "message") })),
    payouts: list(raw, "payouts").map((p) => ({
      payoutRef: text(p, "payoutRef"),
      payoutDate: text(p, "payoutDate"),
      lines: int(p, "lines"),
      net: paiseOf(obj(p).net),
    })),
  };
}

export function parseResolveResult(raw: unknown): ResolveResult {
  const o = obj(raw);
  return {
    line: isObj(o.line) ? parseLine(o.line) : null,
    voucherId: text(o, "voucherId"),
    voucherRefno: text(o, "voucherRefno"),
    legs: parseLegs(o.legs),
  };
}

export function parseWriteOffResult(raw: unknown): WriteOffResult {
  const o = obj(raw);
  return {
    tdId: text(o, "tdId"),
    tdAccYear: text(o, "tdAccYear"),
    treatment: text(o, "treatment"),
    amount: paiseOf(o.amount),
    voucherId: text(o, "voucherId"),
    voucherRefno: text(o, "voucherRefno"),
    voucherAccYear: text(o, "voucherAccYear"),
    sessionId: text(o, "sessionId"),
  };
}

/** `/configured-grid-sql/run` → `{ items, total }` (total sits at data.meta.total). */
export function parseGridPage(payload: unknown): { items: GridRow[]; total: number | null } {
  const data = obj(unwrapData(payload));
  const items = (Array.isArray(data.items) ? data.items : []).filter(isObj);
  const meta = obj(data.meta);
  const total = Number(meta.total);
  return { items, total: Number.isFinite(total) ? total : null };
}
