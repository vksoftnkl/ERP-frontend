/**
 * Raw JSON → the typed shapes in `types.ts` (plan §4.4).
 *
 * Optional fields are treated as optional. A missing REQUIRED field throws a
 * `LedgerParseError` naming the route and the path, which the screen shows as
 * "the server's answer was not understood". It never defaults a missing amount
 * to `"0.00"`: a silent zero in a ledger is worse than an error.
 *
 * Written against the server's types file before the routes existed. When they
 * land, read one real response per route and correct this file (plan §15,
 * phase 4).
 */
import { isAmountString } from "./money";
import type {
  Bal,
  DailyPayload,
  DailyRow,
  ExportPayload,
  HeaderPayload,
  LedgerFacts,
  LedgerPickItem,
  LedgerPickPayload,
  MonthlyPayload,
  MonthlyRow,
  PeriodSummary,
  RowKind,
  Side,
  VoucherLeg,
  VoucherLegsPayload,
  VoucherPage,
  VoucherRow,
  VoucherSrc,
} from "./types";

export class LedgerParseError extends Error {
  readonly route: string;
  readonly path: string;
  constructor(route: string, path: string, problem: string) {
    super(`${route}: ${path} ${problem}`);
    this.name = "LedgerParseError";
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
    private readonly route: string,
    private readonly path: string,
    private readonly obj: Obj,
  ) {}

  private fail(key: string, problem: string): never {
    throw new LedgerParseError(this.route, `${this.path}.${key}`, problem);
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

  bool(key: string): boolean {
    const value = this.obj[key];
    if (typeof value !== "boolean") this.fail(key, "is not true/false");
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

  strings(key: string): string[] {
    const value = this.obj[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      this.fail(key, "is not a list of text");
    }
    return value as string[];
  }

  oneOf<T extends string>(key: string, values: readonly T[]): T {
    const value = this.obj[key];
    if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
    return this.fail(key, `is not one of ${values.join(", ")} (got ${JSON.stringify(value)})`);
  }

  has(key: string): boolean {
    return this.obj[key] !== undefined && this.obj[key] !== null;
  }
}

/**
 * The house envelope is `{ success, data }`. A payload that is already bare is
 * taken as is, so a route that answers either way parses.
 */
function root(route: string, raw: unknown): Reader {
  const body = isObj(raw) && isObj(raw.data) ? raw.data : raw;
  if (!isObj(body)) throw new LedgerParseError(route, "$", "is not an object");
  return new Reader(route, "$", body);
}

function bal(r: Reader): Bal {
  return { amount: r.amount("amount"), side: r.optSide("side") };
}

const ROW_KINDS: readonly RowKind[] = ["NORMAL", "CANCELLED", "REVERSAL"];

function leg(r: Reader): VoucherLeg {
  return {
    rowNo: r.int("rowNo"),
    side: r.side("side"),
    ledgerId: r.str("ledgerId"),
    ledgerName: r.optStr("ledgerName"),
    amount: r.amount("amount"),
    role: r.optStr("role"),
    isThisLedger: r.flag("isThisLedger"),
    remarks: r.optStr("remarks"),
  };
}

function src(r: Reader | null): VoucherSrc | null {
  if (!r) return null;
  const value = { module: r.optStr("module"), docType: r.optStr("docType"), docId: r.optStr("docId") };
  return value.module || value.docType || value.docId ? value : null;
}

function voucherRow(r: Reader): VoucherRow {
  const row: VoucherRow = {
    voucherId: r.str("voucherId"),
    accYear: r.str("accYear"),
    branchId: r.optStr("branchId"),
    branchName: r.optStr("branchName"),
    date: r.str("date"),
    voucherTypeId: r.int("voucherTypeId"),
    voucherTypeName: r.optStr("voucherTypeName"),
    voucherTypeShort: r.optStr("voucherTypeShort"),
    voucherNo: r.optStr("voucherNo"),
    status: r.str("status"),
    rowKind: r.oneOf("rowKind", ROW_KINDS),
    pairOutsideRange: r.flag("pairOutsideRange"),
    particulars: r.optStr("particulars"),
    asPerDetails: r.flag("asPerDetails"),
    legCount: r.optInt("legCount") ?? 0,
    narration: r.optStr("narration"),
    billRefs: r.strings("billRefs"),
    debit: r.amount("debit"),
    credit: r.amount("credit"),
    balance: bal(r.at("balance")),
    createdBy: r.optStr("createdBy"),
    src: src(r.optAt("src")),
  };
  if (r.has("legs")) row.legs = r.list("legs", leg);
  return row;
}

function ledgerFacts(r: Reader): LedgerFacts {
  return {
    ledgerId: r.str("ledgerId"),
    name: r.str("name"),
    groupName: r.optStr("groupName"),
    nature: r.optStr("nature"),
    isBillByBill: r.flag("isBillByBill"),
    gstin: r.optStr("gstin"),
    mobile: r.optStr("mobile"),
    creditDays: r.optInt("creditDays"),
    creditLimit: r.optAmount("creditLimit"),
  };
}

function periodSummary(r: Reader): PeriodSummary {
  const debit = r.at("debit");
  const credit = r.at("credit");
  return {
    fromDate: r.str("fromDate"),
    toDate: r.str("toDate"),
    opening: bal(r.at("opening")),
    debit: { amount: debit.amount("amount"), vouchers: debit.optInt("vouchers") ?? 0 },
    credit: { amount: credit.amount("amount"), vouchers: credit.optInt("vouchers") ?? 0 },
    closing: bal(r.at("closing")),
    cancelledPairs: r.optInt("cancelledPairs") ?? 0,
    openingNote: r.optStr("openingNote"),
  };
}

export function parseLedgers(raw: unknown): LedgerPickPayload {
  const r = root("ledgers", raw);
  return {
    items: r.list("items", (item): LedgerPickItem => ({
      ledgerId: item.str("ledgerId"),
      name: item.str("name"),
      groupId: item.optStr("groupId"),
      groupName: item.optStr("groupName"),
      isBillByBill: item.flag("isBillByBill"),
      isShared: item.flag("isShared"),
    })),
  };
}

export function parseHeader(raw: unknown): HeaderPayload {
  const r = root("header", raw);
  return { ledger: ledgerFacts(r.at("ledger")), period: periodSummary(r.at("period")) };
}

export function parseVouchers(raw: unknown): VoucherPage {
  const r = root("vouchers", raw);
  const page = r.at("page");
  return {
    broughtForward: bal(r.at("broughtForward")),
    rows: r.list("rows", voucherRow),
    carriedForward: bal(r.at("carriedForward")),
    page: {
      page: page.int("page"),
      pageSize: page.int("pageSize"),
      totalRows: page.int("totalRows"),
    },
  };
}

export function parseVoucherLegs(raw: unknown): VoucherLegsPayload {
  const r = root("voucher-legs", raw);
  return {
    voucherId: r.str("voucherId"),
    accYear: r.str("accYear"),
    voucherNo: r.optStr("voucherNo"),
    date: r.str("date"),
    status: r.str("status"),
    legs: r.list("legs", leg),
  };
}

export function parseDaily(raw: unknown): DailyPayload {
  const r = root("daily", raw);
  return {
    opening: bal(r.at("opening")),
    days: r.list("days", (day): DailyRow => ({
      date: day.str("date"),
      debit: day.amount("debit"),
      credit: day.amount("credit"),
      vouchers: day.optInt("vouchers") ?? 0,
      closing: bal(day.at("closing")),
    })),
    closing: bal(r.at("closing")),
  };
}

export function parseMonthly(raw: unknown): MonthlyPayload {
  const r = root("monthly", raw);
  return {
    opening: bal(r.at("opening")),
    months: r.list("months", (month): MonthlyRow => ({
      month: month.str("month"),
      debit: month.amount("debit"),
      credit: month.amount("credit"),
      closing: bal(month.at("closing")),
      isFuture: month.flag("isFuture"),
    })),
    closing: bal(r.at("closing")),
  };
}

export function parseExport(raw: unknown): ExportPayload {
  const r = root("export", raw);
  return {
    ledger: ledgerFacts(r.at("ledger")),
    period: periodSummary(r.at("period")),
    broughtForward: bal(r.at("broughtForward")),
    rows: r.list("rows", voucherRow),
    carriedForward: bal(r.at("carriedForward")),
    totalRows: r.int("totalRows"),
  };
}
