/**
 * Raw JSON → the typed shapes in `types.ts`.
 *
 * Optional fields are treated as optional. A missing REQUIRED field throws an
 * `OutstandingParseError` naming the route and the path, which the screen
 * shows as "the server's answer was not understood". It never defaults a
 * missing amount to `"0.00"`: a silent zero in an outstanding list is worse
 * than an error.
 *
 * One check matters more than the rest: every row's `buckets` must be as long
 * as `bucketLabels`. A short array would shift every amount one column left
 * and still look plausible, the most dangerous mis-render this screen has.
 *
 * Written against the server's types file on the day the routes were built.
 * Plan phase 4: read one real response per route and correct this file.
 */
import { isAmountString } from "@/features/reports/shared/wire/money";
import {
  COLLECTION_DAYS,
  type Bal,
  type BillHistoryPayload,
  type BillHistoryRow,
  type BillRow,
  type BillsPayload,
  type BillTotals,
  type BillWisePayload,
  type BillWiseRow,
  type DueCalendarPayload,
  type ExportPayload,
  type LastSettlement,
  type OptionsPayload,
  type OutstandingSide,
  type PageInfo,
  type PartiesPayload,
  type PartyCardPayload,
  type PartyFacts,
  type PartyFlag,
  type PartyRow,
  type PartyTiles,
  type PartyTotals,
  type PdcItem,
  type ReportHead,
  type Side,
  type SummaryGroupBy,
  type SummaryPayload,
  type SummaryRow,
} from "./types";

export class OutstandingParseError extends Error {
  readonly route: string;
  readonly path: string;
  constructor(route: string, path: string, problem: string) {
    super(`${route}: ${path} ${problem}`);
    this.name = "OutstandingParseError";
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

  fail(key: string, problem: string): never {
    throw new OutstandingParseError(this.route, `${this.path}.${key}`, problem);
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

  /** A list of amount strings; every element is checked. */
  amounts(key: string): string[] {
    const value = this.obj[key];
    if (!Array.isArray(value)) this.fail(key, "is missing or not a list");
    return value.map((item, index) => {
      if (typeof item !== "string" || !isAmountString(item.trim())) {
        this.fail(`${key}[${index}]`, `is not an amount string (got ${JSON.stringify(item)})`);
      }
      return item.trim();
    });
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

  /** A list of text; absent reads as empty. */
  strings(key: string): string[] {
    const value = this.obj[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      this.fail(key, "is not a list of text");
    }
    return value as string[];
  }

  /** A list of text that must be there (the bucket labels). */
  reqStrings(key: string): string[] {
    if (!Array.isArray(this.obj[key])) this.fail(key, "is missing or not a list");
    return this.strings(key);
  }

  oneOf<T extends string>(key: string, values: readonly T[]): T {
    const value = this.obj[key];
    if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
    return this.fail(key, `is not one of ${values.join(", ")} (got ${JSON.stringify(value)})`);
  }
}

/**
 * The house envelope is `{ success, message, data }`. A payload that is
 * already bare is taken as is, so a route that answers either way parses.
 */
function root(route: string, raw: unknown): Reader {
  const body = isObj(raw) && isObj(raw.data) ? raw.data : raw;
  if (!isObj(body)) throw new OutstandingParseError(route, "$", "is not an object");
  return new Reader(route, "$", body);
}

const SIDES: readonly OutstandingSide[] = ["RECEIVABLE", "PAYABLE"];
const GROUP_BYS: readonly SummaryGroupBy[] = ["AREA", "GROUP", "SALESMAN", "BRANCH"];

function bal(r: Reader): Bal {
  return { amount: r.amount("amount"), side: r.optSide("side") };
}

/** A bucket list that must line up with the labels, column for column. */
function buckets(r: Reader, labels: readonly string[], key = "buckets"): string[] {
  const values = r.amounts(key);
  if (values.length !== labels.length) {
    r.fail(key, `has ${values.length} amounts for ${labels.length} bucket labels`);
  }
  return values;
}

function head(r: Reader): ReportHead {
  return {
    asOn: r.str("asOn"),
    side: r.oneOf("side", SIDES),
    isFuture: r.flag("isFuture"),
    accYear: r.optStr("accYear") ?? "",
    bucketLabels: r.reqStrings("bucketLabels"),
  };
}

function page(r: Reader): PageInfo {
  return { page: r.int("page"), pageSize: r.int("pageSize"), totalRows: r.int("totalRows") };
}

/* ------------------------------------------------------------ /options */

export function parseOptions(raw: unknown): OptionsPayload {
  const r = root("options", raw);
  return {
    groups: r.list("groups", (g) => ({
      groupId: g.str("groupId"),
      name: g.str("name"),
      depth: g.optInt("depth") ?? 0,
      isDefault: g.flag("isDefault"),
    })),
    areas: r.list("areas", (a) => ({
      areaId: a.str("areaId"),
      name: a.str("name"),
      collectionDays: a.strings("collectionDays").filter((d) => (COLLECTION_DAYS as readonly string[]).includes(d)),
    })),
    salesmen: r.list("salesmen", (s) => ({ salesmanId: s.str("salesmanId"), name: s.str("name") })),
    branches: r.list("branches", (b) => ({ branchId: b.str("branchId"), name: b.str("name") })),
  };
}

/* ------------------------------------------------------------ /parties */

function partyRow(r: Reader, labels: readonly string[]): PartyRow {
  return {
    partyId: r.str("partyId"),
    name: r.str("name"),
    area: r.optStr("area"),
    phone: r.optStr("phone"),
    creditDays: r.optInt("creditDays"),
    creditLimit: r.optAmount("creditLimit"),
    bills: r.int("bills"),
    owed: r.amount("owed"),
    onAccount: r.amount("onAccount"),
    net: bal(r.at("net")),
    buckets: buckets(r, labels),
    overdue: r.amount("overdue"),
    oldestDays: r.optInt("oldestDays"),
    pdcInHand: r.amount("pdcInHand"),
    // An unknown flag is kept and shown as itself, never dropped.
    flags: r.strings("flags") as PartyFlag[],
  };
}

function partyTotals(r: Reader, labels: readonly string[]): PartyTotals {
  return {
    bills: r.int("bills"),
    owed: r.amount("owed"),
    onAccount: r.amount("onAccount"),
    net: bal(r.at("net")),
    buckets: buckets(r, labels),
    overdue: r.amount("overdue"),
    pdcInHand: r.amount("pdcInHand"),
  };
}

function tiles(r: Reader): PartyTiles {
  const above = r.at("aboveDays");
  const pdc = r.at("pdcInHand");
  const due = r.at("dueNext");
  return {
    net: bal(r.at("net")),
    parties: r.int("parties"),
    bills: r.int("bills"),
    overdue: r.amount("overdue"),
    overduePctOfOwed: r.str("overduePctOfOwed"),
    aboveDays: { days: above.int("days"), amount: above.amount("amount"), parties: above.int("parties") },
    onAccount: r.amount("onAccount"),
    pdcInHand: { amount: pdc.amount("amount"), cheques: pdc.int("cheques") },
    dueNext: { days: due.int("days"), amount: due.amount("amount"), from: due.str("from"), to: due.str("to") },
  };
}

export function parseParties(raw: unknown): PartiesPayload {
  const r = root("parties", raw);
  const h = head(r);
  return {
    ...h,
    tiles: tiles(r.at("tiles")),
    rows: r.list("rows", (row) => partyRow(row, h.bucketLabels)),
    totals: partyTotals(r.at("totals"), h.bucketLabels),
    page: page(r.at("page")),
  };
}

/* -------------------------------------------------------------- /party */

function partyFacts(r: Reader): PartyFacts {
  return {
    partyId: r.str("partyId"),
    name: r.str("name"),
    ledgerGroup: r.optStr("ledgerGroup"),
    area: r.optStr("area"),
    phone: r.optStr("phone"),
    gstin: r.optStr("gstin"),
    creditDays: r.optInt("creditDays"),
    creditLimit: r.optAmount("creditLimit"),
    creditBillLimit: r.optInt("creditBillLimit"),
    isDualRole: r.flag("isDualRole"),
  };
}

function pdcItem(r: Reader): PdcItem {
  return {
    pdcId: r.str("pdcId"),
    accYear: r.str("accYear"),
    chequeNo: r.optStr("chequeNo"),
    bank: r.optStr("bank"),
    chequeDate: r.str("chequeDate"),
    amount: r.amount("amount"),
    status: r.str("status"),
  };
}

function ageing(r: Reader): { labels: string[]; amounts: string[] } {
  const labels = r.reqStrings("labels");
  return { labels, amounts: buckets(r, labels, "amounts") };
}

function lastSettlement(r: Reader | null): LastSettlement | null {
  if (!r) return null;
  return {
    date: r.str("date"),
    voucherId: r.str("voucherId"),
    voucherAccYear: r.str("voucherAccYear"),
    voucherNo: r.optStr("voucherNo"),
    voucherType: r.optStr("voucherType"),
    voucherBranchId: r.optStr("voucherBranchId"),
    voucherTypeId: r.optInt("voucherTypeId"),
    amount: r.amount("amount"),
  };
}

export function parseParty(raw: unknown): PartyCardPayload {
  const r = root("party", raw);
  return {
    ...head(r),
    party: partyFacts(r.at("party")),
    ageing: ageing(r.at("ageing")),
    owed: r.amount("owed"),
    onAccount: r.amount("onAccount"),
    net: bal(r.at("net")),
    onAccountItems: r.list("onAccountItems", (item) => ({
      billId: item.str("billId"),
      accYear: item.str("accYear"),
      docRefno: item.optStr("docRefno"),
      date: item.str("date"),
      type: item.str("type"),
      amount: item.amount("amount"),
    })),
    pdcInHand: r.list("pdcInHand", pdcItem),
    pdcEffectiveUncleared: r.list("pdcEffectiveUncleared", pdcItem),
    lastSettlement: lastSettlement(r.optAt("lastSettlement")),
  };
}

/* ------------------------------------------------- /bills, /bill-wise */

const BILL_SIDES = ["OWED", "ON_ACCOUNT"] as const;

function billRow(r: Reader): BillRow {
  return {
    billId: r.str("billId"),
    accYear: r.str("accYear"),
    branchId: r.optStr("branchId"),
    branchName: r.optStr("branchName"),
    docDate: r.str("docDate"),
    docRefno: r.optStr("docRefno"),
    billType: r.str("billType"),
    srcDocType: r.optStr("srcDocType"),
    srcDocId: r.optStr("srcDocId"),
    srcAccYear: r.optStr("srcAccYear"),
    voucherId: r.optStr("voucherId"),
    voucherTypeId: r.optInt("voucherTypeId"),
    side: r.oneOf("side", BILL_SIDES),
    dueDate: r.optStr("dueDate"),
    dueEff: r.str("dueEff"),
    billAmount: r.amount("billAmount"),
    adjusted: r.amount("adjusted"),
    pending: r.amount("pending"),
    ageDays: r.int("ageDays"),
    overdueDays: r.optInt("overdueDays"),
    remarks: r.optStr("remarks"),
    tenderDerived: r.flag("tenderDerived"),
    dataWarning: r.optStr("dataWarning"),
  };
}

function billWiseRow(r: Reader): BillWiseRow {
  return { ...billRow(r), partyId: r.str("partyId"), partyName: r.str("partyName"), area: r.optStr("area") };
}

function billTotals(r: Reader): BillTotals {
  return {
    bills: r.optInt("bills") ?? 0,
    billAmount: r.amount("billAmount"),
    adjusted: r.amount("adjusted"),
    net: bal(r.at("net")),
  };
}

export function parseBills(raw: unknown): BillsPayload {
  const r = root("bills", raw);
  return {
    ...head(r),
    partyId: r.str("partyId"),
    rows: r.list("rows", billRow),
    totals: billTotals(r.at("totals")),
    ledgerClosing: bal(r.at("ledgerClosing")),
  };
}

export function parseBillWise(raw: unknown): BillWisePayload {
  const r = root("bill-wise", raw);
  return {
    ...head(r),
    rows: r.list("rows", billWiseRow),
    totals: billTotals(r.at("totals")),
    page: page(r.at("page")),
  };
}

/* ------------------------------------------------------- /bill-history */

function historyRow(r: Reader): BillHistoryRow {
  return {
    adjustmentId: r.str("adjustmentId"),
    date: r.str("date"),
    adjType: r.str("adjType"),
    voucherId: r.optStr("voucherId"),
    voucherAccYear: r.optStr("voucherAccYear"),
    voucherNo: r.optStr("voucherNo"),
    voucherType: r.optStr("voucherType"),
    voucherBranchId: r.optStr("voucherBranchId"),
    voucherTypeId: r.optInt("voucherTypeId"),
    againstDocRefno: r.optStr("againstDocRefno"),
    amount: r.amount("amount"),
    isReversal: r.flag("isReversal"),
    reversalReason: r.optStr("reversalReason"),
    isPostDated: r.flag("isPostDated"),
    chequeNo: r.optStr("chequeNo"),
    effective: r.bool("effective"),
  };
}

export function parseBillHistory(raw: unknown): BillHistoryPayload {
  const r = root("bill-history", raw);
  const bill = r.at("bill");
  return {
    asOn: r.str("asOn"),
    bill: {
      billId: bill.str("billId"),
      accYear: bill.str("accYear"),
      partyId: bill.str("partyId"),
      docRefno: bill.optStr("docRefno"),
      docDate: bill.str("docDate"),
      billType: bill.str("billType"),
      side: bill.side("side"),
      billAmount: bill.amount("billAmount"),
      pending: bill.amount("pending"),
    },
    rows: r.list("rows", historyRow),
    tenderAtBill: r.optAmount("tenderAtBill"),
    dataWarning: r.optStr("dataWarning"),
  };
}

/* ------------------------------------------------------------ /summary */

export function parseSummary(raw: unknown): SummaryPayload {
  const r = root("summary", raw);
  const h = head(r);
  const totals = r.at("totals");
  return {
    ...h,
    groupBy: r.oneOf("groupBy", GROUP_BYS),
    rows: r.list("rows", (row): SummaryRow => ({
      key: row.optStr("key"),
      name: row.str("name"),
      parties: row.int("parties"),
      owed: row.amount("owed"),
      onAccount: row.amount("onAccount"),
      net: bal(row.at("net")),
      buckets: buckets(row, h.bucketLabels),
      overdue: row.amount("overdue"),
    })),
    totals: {
      parties: totals.int("parties"),
      owed: totals.amount("owed"),
      onAccount: totals.amount("onAccount"),
      net: bal(totals.at("net")),
      buckets: buckets(totals, h.bucketLabels),
      overdue: totals.amount("overdue"),
    },
  };
}

/* ------------------------------------------------------- /due-calendar */

export function parseDueCalendar(raw: unknown): DueCalendarPayload {
  const r = root("due-calendar", raw);
  const before = r.at("overdueBefore");
  return {
    asOn: r.str("asOn"),
    side: r.oneOf("side", SIDES),
    from: r.str("from"),
    to: r.str("to"),
    days: r.list("days", (day) => ({
      date: day.str("date"),
      amount: day.amount("amount"),
      bills: day.int("bills"),
      parties: day.int("parties"),
    })),
    overdueBefore: { amount: before.amount("amount"), bills: before.int("bills") },
  };
}

/* ------------------------------------------------------------- /export */

export function parseExport(raw: unknown): ExportPayload {
  const r = root("export", raw);
  const h = head(r);
  const common = {
    ...h,
    printedAs: r.str("printedAs"),
    companyName: r.optStr("companyName"),
    branchName: r.optStr("branchName"),
    totalRows: r.int("totalRows"),
  };
  const shape = r.oneOf("shape", ["PARTIES", "BILLS", "PARTY_STATEMENT"] as const);
  switch (shape) {
    case "PARTIES":
      return {
        ...common,
        shape,
        rows: r.list("rows", (row) => partyRow(row, h.bucketLabels)),
        totals: partyTotals(r.at("totals"), h.bucketLabels),
        tiles: tiles(r.at("tiles")),
      };
    case "BILLS":
      return { ...common, shape, rows: r.list("rows", billWiseRow), totals: billTotals(r.at("totals")) };
    case "PARTY_STATEMENT":
      return {
        ...common,
        shape,
        party: partyFacts(r.at("party")),
        rows: r.list("rows", billRow),
        totals: billTotals(r.at("totals")),
        ageing: ageing(r.at("ageing")),
        owed: r.amount("owed"),
        onAccount: r.amount("onAccount"),
        net: bal(r.at("net")),
        pdcInHand: r.list("pdcInHand", pdcItem),
      };
  }
}
