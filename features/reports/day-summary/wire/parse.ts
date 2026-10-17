/**
 * Raw JSON → the typed shapes in `types.ts` (plan §4).
 *
 * Optional fields are treated as optional. A missing REQUIRED field throws a
 * `DaySummaryParseError` naming the route and the path, which the screen
 * shows as "the server's answer was not understood". It never defaults a
 * missing amount to `"0.00"`: a silent zero in a day book is worse than an
 * error, because the day would look as if it balanced.
 *
 * Unknown tile codes, check codes and natures pass through untouched. The
 * enumerations the screen BRANCHES on (row kind, money kind, check level,
 * business-day status, tender groupBy) are checked, and an unknown value is
 * a parse failure.
 *
 * Written against the server's types file (2026-10-12; no live response read
 * yet). The bare-list shapes of the backend plan still parse, so either
 * answer works. When the routes are up, read one response per route. The
 * two tender-day-book routes were read live (2026-10-17).
 */
import { isAmountString, isZeroAmount } from "@/features/reports/shared/wire/money";
import {
  BUSINESS_DAY_STATUSES,
  CHECK_LEVELS,
  MONEY_KINDS,
  ROW_KINDS,
  TENDER_GROUP_BYS,
  type Bal,
  type BusinessDay,
  type Check,
  type CheckDetailPayload,
  type DailyPayload,
  type DailyRow,
  type DailyTotals,
  type ExportPayload,
  type GroupLedgerRow,
  type GroupLedgersPayload,
  type GroupRow,
  type Leg,
  type MoneyKind,
  type MoneyRow,
  type MoneyTotal,
  type NoTenderPayload,
  type PageInfo,
  type Scope,
  type Side,
  type Src,
  type SummaryPayload,
  type TenderDayBookPayload,
  type TenderGroup,
  type TenderLedger,
  type TenderLine,
  type Tile,
  type TypeRow,
  type TypeTotals,
  type VoucherPage,
  type VoucherRow,
  type VoucherTypeOption,
} from "./types";

export class DaySummaryParseError extends Error {
  readonly route: string;
  readonly path: string;
  constructor(route: string, path: string, problem: string) {
    super(`${route}: ${path} ${problem}`);
    this.name = "DaySummaryParseError";
    this.route = route;
    this.path = path;
  }
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads fields off one object, and says where it was when something is missing. */
class Reader {
  constructor(
    readonly route: string,
    readonly path: string,
    private readonly obj: Obj,
  ) {}

  raw(): Obj {
    return this.obj;
  }

  has(key: string): boolean {
    return this.obj[key] !== undefined && this.obj[key] !== null;
  }

  fail(key: string, problem: string): never {
    throw new DaySummaryParseError(this.route, `${this.path}.${key}`, problem);
  }

  at(key: string): Reader {
    const value = this.obj[key];
    if (!isObj(value)) this.fail(key, "is missing or not an object");
    return new Reader(this.route, `${this.path}.${key}`, value);
  }

  optAt(key: string): Reader | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    if (!isObj(value)) this.fail(key, "is not an object");
    return new Reader(this.route, `${this.path}.${key}`, value);
  }

  list<T>(key: string, each: (item: Reader) => T): T[] {
    const value = this.obj[key];
    if (!Array.isArray(value)) this.fail(key, "is missing or not a list");
    return value.map((item, index) => {
      if (!isObj(item)) this.fail(`${key}[${index}]`, "is not an object");
      return each(new Reader(this.route, `${this.path}.${key}[${index}]`, item));
    });
  }

  optList<T>(key: string, each: (item: Reader) => T): T[] | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    return this.list(key, each);
  }

  str(key: string): string {
    const value = this.obj[key];
    if (typeof value !== "string") this.fail(key, "is missing or not text");
    return value;
  }

  optStr(key: string): string | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") this.fail(key, "is not text");
    return value;
  }

  /** An amount: a decimal STRING. A number is refused, a missing one is fatal. */
  amount(key: string): string {
    const value = this.obj[key];
    if (typeof value !== "string" || !isAmountString(value.trim())) {
      this.fail(key, `is not an amount string (got ${JSON.stringify(value)})`);
    }
    return value.trim();
  }

  optAmount(key: string): string | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    return this.amount(key);
  }

  int(key: string): number {
    const value = this.obj[key];
    if (typeof value !== "number" || !Number.isInteger(value)) this.fail(key, "is not a whole number");
    return value;
  }

  optInt(key: string): number | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    return this.int(key);
  }

  /** Text, or a number sent where text was expected (`zNo`): read as text. */
  optText(key: string): string | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value !== "string") this.fail(key, "is not text or a number");
    return value;
  }

  /** Optional flag: absent reads as false. */
  flag(key: string): boolean {
    const value = this.obj[key];
    if (value === undefined || value === null) return false;
    if (typeof value !== "boolean") this.fail(key, "is not true/false");
    return value;
  }

  side(key: string): Side {
    const value = this.obj[key];
    if (value === "DR" || value === "CR") return value;
    return this.fail(key, `is not DR or CR (got ${JSON.stringify(value)})`);
  }

  optSide(key: string): Side | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    return this.side(key);
  }

  oneOf<T extends string>(key: string, values: readonly T[]): T {
    const value = this.obj[key];
    if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
    return this.fail(key, `is not one of ${values.join(", ")} (got ${JSON.stringify(value)})`);
  }

  optOneOf<T extends string>(key: string, values: readonly T[]): T | null {
    const value = this.obj[key];
    if (value === undefined || value === null) return null;
    return this.oneOf(key, values);
  }
}

/** The house envelope is `{ success, message, data }`; a bare payload is taken as is. */
function unwrapEnvelope(raw: unknown): unknown {
  return isObj(raw) && "data" in raw && (isObj(raw.data) || Array.isArray(raw.data)) ? raw.data : raw;
}

function root(route: string, raw: unknown): Reader {
  const body = unwrapEnvelope(raw);
  if (!isObj(body)) throw new DaySummaryParseError(route, "$", "is not an object");
  return new Reader(route, "$", body);
}

/**
 * A payload that is a list: either a bare array, or an object carrying it
 * under one of `keys`. The backend plan shows bare arrays for two routes and
 * the react plan expects totals beside them, so both shapes parse.
 */
function listRoot(route: string, raw: unknown, keys: readonly string[]): { list: Reader; key: string } {
  const body = unwrapEnvelope(raw);
  if (Array.isArray(body)) return { list: new Reader(route, "$", { rows: body }), key: "rows" };
  if (!isObj(body)) throw new DaySummaryParseError(route, "$", "is not an object or a list");
  const reader = new Reader(route, "$", body);
  const key = keys.find((k) => Array.isArray(body[k]));
  if (!key) throw new DaySummaryParseError(route, "$", `has no ${keys.join(" / ")} list`);
  return { list: reader, key };
}

function bal(r: Reader): Bal {
  return { amount: r.amount("amount"), side: r.optSide("side") };
}

function optBal(r: Reader, key: string): Bal | null {
  const at = r.optAt(key);
  return at ? bal(at) : null;
}

/* ------------------------------------------------------------ /voucher-types */

export function parseVoucherTypes(raw: unknown): VoucherTypeOption[] {
  const { list, key } = listRoot("voucher-types", raw, ["items", "types", "rows"]);
  return list.list(key, (r) => ({
    voucherTypeId: r.int("voucherTypeId"),
    code: r.optStr("code") ?? r.str("short"),
    short: r.optStr("short") ?? r.optStr("code") ?? r.str("name"),
    name: r.str("name"),
    nature: r.str("nature"),
    category: r.optStr("category"),
    sortOrder: r.optInt("sortOrder"),
  }));
}

/* ------------------------------------------------------------------ /summary */

function scope(r: Reader): Scope {
  return {
    companyId: r.optStr("companyId"),
    companyName: r.optStr("companyName") ?? "",
    branchId: r.optStr("branchId"),
    branchName: r.str("branchName"),
    accYear: r.optStr("accYear"),
    fromDate: r.str("fromDate"),
    toDate: r.str("toDate"),
    days: r.int("days"),
    asOf: r.optStr("asOf"),
  };
}

function businessDay(r: Reader | null): BusinessDay | null {
  if (!r) return null;
  const sessions = r.optAt("sessions");
  return {
    status: r.oneOf("status", BUSINESS_DAY_STATUSES),
    zNo: r.optText("zNo"),
    sessions: sessions ? { total: sessions.int("total"), closed: sessions.int("closed") } : null,
  };
}

function tile(r: Reader): Tile {
  return {
    code: r.str("code"),
    amount: r.optAmount("amount"),
    vouchers: r.optInt("vouchers"),
    drafts: r.optInt("drafts"),
    cancelledPairs: r.optInt("cancelledPairs"),
    opening: optBal(r, "opening"),
    net: optBal(r, "net"),
    closing: optBal(r, "closing"),
  };
}

function typeRow(r: Reader): TypeRow {
  return {
    voucherTypeId: r.int("voucherTypeId"),
    code: r.optStr("code"),
    short: r.optStr("short") ?? r.optStr("code") ?? r.str("name"),
    name: r.str("name"),
    nature: r.str("nature"),
    category: r.optStr("category"),
    vouchers: r.int("vouchers"),
    drafts: r.int("drafts"),
    cancelledPairs: r.int("cancelledPairs"),
    loneHalves: r.optInt("loneHalves") ?? 0,
    amount: r.amount("amount"),
    cashIn: r.amount("cashIn"),
    cashOut: r.amount("cashOut"),
    bankIn: r.amount("bankIn"),
    bankOut: r.amount("bankOut"),
  };
}

function typeTotals(r: Reader): TypeTotals {
  return {
    vouchers: r.int("vouchers"),
    drafts: r.int("drafts"),
    cancelledPairs: r.int("cancelledPairs"),
    loneHalves: r.optInt("loneHalves"),
    amount: r.amount("amount"),
    cashIn: r.amount("cashIn"),
    cashOut: r.amount("cashOut"),
    bankIn: r.amount("bankIn"),
    bankOut: r.amount("bankOut"),
  };
}

/** Opening / closing are null under a voucher-type filter; in / out never are. */
function moneyTotal(r: Reader): MoneyTotal {
  return { opening: optBal(r, "opening"), in: r.amount("in"), out: r.amount("out"), closing: optBal(r, "closing") };
}

function moneyRow(r: Reader): MoneyRow {
  return {
    ledgerId: r.str("ledgerId"),
    ledgerName: r.str("ledgerName"),
    kind: r.oneOf("kind", MONEY_KINDS),
    opening: optBal(r, "opening"),
    in: r.amount("in"),
    out: r.amount("out"),
    closing: optBal(r, "closing"),
    openingNote: r.optStr("openingNote"),
  };
}

function moneyTotals(r: Reader): SummaryPayload["moneyTotals"] {
  const totals: Partial<Record<MoneyKind, MoneyTotal>> = {};
  for (const kind of MONEY_KINDS) {
    const at = r.optAt(kind);
    if (at) totals[kind] = moneyTotal(at);
  }
  return { ...totals, ALL: moneyTotal(r.at("ALL")) };
}

function groupRow(r: Reader): GroupRow {
  return {
    groupId: r.str("groupId"),
    groupName: r.str("groupName"),
    nature: r.optStr("nature"),
    debit: r.amount("debit"),
    credit: r.amount("credit"),
    net: bal(r.at("net")),
    hasChildren: r.flag("hasChildren"),
  };
}

function check(r: Reader): Check {
  const facts = r.optAt("facts");
  return { code: r.str("code"), level: r.oneOf("level", CHECK_LEVELS), facts: facts ? facts.raw() : {} };
}

function summaryOf(r: Reader): SummaryPayload {
  const totals = r.at("groupTotals");
  return {
    scope: scope(r.at("scope")),
    businessDay: businessDay(r.optAt("businessDay")),
    tiles: r.list("tiles", tile),
    types: r.list("types", typeRow),
    typeTotals: typeTotals(r.at("typeTotals")),
    moneyLedgers: r.list("moneyLedgers", moneyRow),
    moneyTotals: moneyTotals(r.at("moneyTotals")),
    groups: r.list("groups", groupRow),
    groupTotals: { debit: totals.amount("debit"), credit: totals.amount("credit"), net: optBal(totals, "net") },
    checks: r.list("checks", check),
  };
}

export function parseSummary(raw: unknown): SummaryPayload {
  return summaryOf(root("summary", raw));
}

/* ----------------------------------------------------------------- /vouchers */

function src(r: Reader | null): Src | null {
  if (!r) return null;
  const srcModule = r.optStr("module");
  const docType = r.optStr("docType");
  const docId = r.optStr("docId");
  return srcModule && docType && docId ? { module: srcModule, docType, docId } : null;
}

function leg(r: Reader): Leg {
  return {
    ledgerId: r.optStr("ledgerId"),
    ledgerName: r.optStr("ledgerName"),
    side: r.side("side"),
    amount: r.amount("amount"),
    role: r.optStr("role"),
  };
}

/**
 * One voucher row. A `draftsOnly` row (backend §5.3: `{ voucherId, date,
 * type, amount, createdBy, src }`) has no number, no legs and no kind, so
 * those are optional here and the row is marked `draft`.
 */
function voucherRow(r: Reader, draftsOnly: boolean): VoucherRow {
  // The draft row names its type under `type`, either as an id or as the
  // regular row's fields in an object. Both are read.
  const rawType = r.raw().type;
  const typeObj = isObj(rawType) ? r.at("type") : null;
  const typeId = r.has("voucherTypeId")
    ? r.int("voucherTypeId")
    : typeObj
      ? typeObj.optInt("voucherTypeId")
      : typeof rawType === "number"
        ? r.int("type")
        : null;
  const draft = draftsOnly || r.optStr("status") === "DRAFT";
  return {
    voucherId: r.str("voucherId"),
    accYear: r.optStr("accYear"),
    date: r.str("date"),
    voucherTypeId: typeId,
    short: r.optStr("short") ?? typeObj?.optStr("short") ?? null,
    name: r.optStr("name") ?? typeObj?.optStr("name") ?? null,
    nature: r.optStr("nature") ?? typeObj?.optStr("nature") ?? null,
    voucherNo: r.optStr("voucherNo"),
    branchId: r.optStr("branchId"),
    branchName: r.optStr("branchName"),
    party: r.optStr("party"),
    particulars: r.optStr("particulars"),
    asPerDetails: r.flag("asPerDetails"),
    legCount: r.optInt("legCount"),
    narration: r.optStr("narration"),
    amount: r.amount("amount"),
    status: r.optStr("status"),
    rowKind: draft ? (r.optOneOf("rowKind", ROW_KINDS) ?? "NORMAL") : r.oneOf("rowKind", ROW_KINDS),
    pairInRange: r.flag("pairInRange"),
    createdBy: r.optStr("createdBy"),
    src: src(r.optAt("src")),
    legs: r.optList("legs", leg),
    draft,
  };
}

function pageInfo(r: Reader): PageInfo {
  return { page: r.int("page"), pageSize: r.int("pageSize"), totalRows: r.int("totalRows") };
}

/**
 * The payload says which shape it is (`draftsOnly`, a union on the server);
 * `asked` is what the page was asked for, in case the flag is absent.
 */
export function parseVouchers(raw: unknown, asked = false): VoucherPage {
  const r = root("vouchers", raw);
  const draftsOnly = r.flag("draftsOnly") || asked;
  const totals = r.at("totals");
  return {
    page: pageInfo(r.at("page")),
    totals: { amount: totals.amount("amount"), cancelledPairs: totals.optInt("cancelledPairs") },
    rows: r.list("rows", (row) => voucherRow(row, draftsOnly)),
  };
}

/* -------------------------------------------------------------------- /daily */

function dailyRow(r: Reader): DailyRow {
  return {
    date: r.str("date"),
    vouchers: r.int("vouchers"),
    drafts: r.int("drafts"),
    cancelledPairs: r.int("cancelledPairs"),
    amount: r.amount("amount"),
    cashIn: r.amount("cashIn"),
    cashOut: r.amount("cashOut"),
    cashClosing: optBal(r, "cashClosing"),
    bankIn: r.amount("bankIn"),
    bankOut: r.amount("bankOut"),
    bankClosing: optBal(r, "bankClosing"),
    businessDay: r.optOneOf("businessDay", BUSINESS_DAY_STATUSES),
  };
}

function dailyTotals(r: Reader | null): DailyTotals | null {
  if (!r) return null;
  return {
    vouchers: r.int("vouchers"),
    drafts: r.int("drafts"),
    cancelledPairs: r.int("cancelledPairs"),
    amount: r.amount("amount"),
    cashIn: r.amount("cashIn"),
    cashOut: r.amount("cashOut"),
    bankIn: r.amount("bankIn"),
    bankOut: r.amount("bankOut"),
  };
}

export function parseDaily(raw: unknown): DailyPayload {
  const { list, key } = listRoot("daily", raw, ["days", "rows"]);
  return {
    cashOpening: optBal(list, "cashOpening"),
    bankOpening: optBal(list, "bankOpening"),
    rows: list.list(key, dailyRow),
    totals: dailyTotals(list.optAt("totals")),
  };
}

/* ------------------------------------------------------------- /group-ledgers */

function groupLedgerRow(r: Reader): GroupLedgerRow {
  return {
    ledgerId: r.str("ledgerId"),
    ledgerName: r.str("ledgerName"),
    groupName: r.optStr("groupName"),
    debit: r.amount("debit"),
    credit: r.amount("credit"),
    net: bal(r.at("net")),
  };
}

export function parseGroupLedgers(raw: unknown): GroupLedgersPayload {
  const { list, key } = listRoot("group-ledgers", raw, ["ledgers", "rows"]);
  const totals = list.optAt("totals");
  return {
    rows: list.list(key, groupLedgerRow),
    totals: totals
      ? { debit: totals.amount("debit"), credit: totals.amount("credit"), net: optBal(totals, "net") }
      : null,
  };
}

/* ------------------------------------------------------------- /checks/detail */

export function parseCheckDetail(raw: unknown, code: string): CheckDetailPayload {
  const { list, key } = listRoot("checks/detail", raw, ["rows", "items"]);
  return {
    code: list.optStr("code") ?? code,
    rows: list.list(key, (row) => row.raw()),
    totalRows: list.optInt("totalRows"),
    truncated: list.flag("truncated"),
  };
}

/* ------------------------------------------- /reports/tender-day-book (§4) */

/**
 * A SIGNED amount (Dr +, Cr −: `"-2000.00"` is 2,000.00 Cr) → a balance,
 * read off the sign. No arithmetic: the digits are the server's.
 */
export function signedBal(amount: string): Bal {
  const unsigned = amount.replace(/^-/, "");
  if (isZeroAmount(amount)) return { amount: unsigned, side: null };
  return { amount: unsigned, side: amount.startsWith("-") ? "CR" : "DR" };
}

function signed(r: Reader, key: string): Bal {
  return signedBal(r.amount(key));
}

function tenderGroup(r: Reader): TenderGroup {
  return {
    key: r.str("key"),
    tenderId: r.optStr("tenderId"),
    tenderName: r.optStr("tenderName"),
    tenderTypeId: r.optInt("tenderTypeId"),
    tenderTypeName: r.optStr("tenderTypeName"),
    ledgerId: r.str("ledgerId"),
    ledgerName: r.str("ledgerName"),
    ledgerType: r.optStr("ledgerType") ?? "",
    opening: signed(r, "opening"),
    debit: r.amount("debit"),
    credit: r.amount("credit"),
    closing: signed(r, "closing"),
  };
}

function tenderLedger(r: Reader): TenderLedger {
  return {
    ledgerId: r.str("ledgerId"),
    ledgerName: r.str("ledgerName"),
    ledgerType: r.optStr("ledgerType") ?? "",
    openingSet: signed(r, "openingSet"),
    opening: signed(r, "opening"),
    debit: r.amount("debit"),
    credit: r.amount("credit"),
    closing: signed(r, "closing"),
    noTender: r.amount("noTender"),
  };
}

export function parseTenderDayBook(raw: unknown): TenderDayBookPayload {
  const r = root("tender-day-book", raw);
  return {
    branchId: r.optStr("branchId"),
    fromDate: r.str("fromDate"),
    toDate: r.str("toDate"),
    groupBy: r.oneOf("groupBy", TENDER_GROUP_BYS),
    groups: r.list("groups", tenderGroup),
    ledgers: r.list("ledgers", tenderLedger),
  };
}

function tenderLine(r: Reader): TenderLine {
  return {
    voucherDate: r.str("voucherDate"),
    voucherId: r.str("voucherId"),
    accYear: r.optStr("accYear"),
    voucherNo: r.optStr("voucherNo"),
    voucherTypeId: r.optInt("voucherTypeId"),
    voucherTypeCode: r.optStr("voucherTypeCode"),
    branchId: r.optStr("branchId"),
    partyName: r.optStr("partyName"),
    ledgerId: r.str("ledgerId"),
    ledgerName: r.str("ledgerName"),
    isMirror: r.flag("isMirror"),
    debit: r.amount("debit"),
    credit: r.amount("credit"),
  };
}

export function parseNoTender(raw: unknown): NoTenderPayload {
  const r = root("tender-day-book/no-tender", raw);
  return {
    branchId: r.optStr("branchId"),
    fromDate: r.str("fromDate"),
    toDate: r.str("toDate"),
    count: r.int("count"),
    amount: r.amount("amount"),
    byVoucherType: r.list("byVoucherType", (t) => ({
      voucherTypeCode: t.optStr("voucherTypeCode"),
      count: t.int("count"),
      amount: t.amount("amount"),
    })),
    rows: r.list("rows", tenderLine),
    rowsTruncated: r.flag("rowsTruncated"),
  };
}

/* ------------------------------------------------------------------- /export */

export function parseExport(raw: unknown): ExportPayload {
  const r = root("export", raw);
  const vouchersRaw = r.raw().vouchers;
  let vouchers: VoucherRow[];
  let totals: ExportPayload["totals"] = null;
  if (Array.isArray(vouchersRaw)) {
    vouchers = r.list("vouchers", (row) => voucherRow(row, false));
  } else {
    const block = r.at("vouchers");
    vouchers = block.list("rows", (row) => voucherRow(row, false));
    const t = block.optAt("totals");
    totals = t ? { amount: t.amount("amount") } : null;
  }
  return { summary: summaryOf(r.at("summary")), vouchers, totals, totalRows: r.optInt("totalRows") };
}
