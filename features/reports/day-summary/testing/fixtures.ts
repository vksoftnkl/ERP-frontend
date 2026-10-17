/**
 * Server stand-ins, in the WIRE shape (`{ success, data }`, amounts as
 * strings), built from the mockup's worked example: Acme Foods Pvt Ltd ·
 * Main Store · Friday 09-10-2026. Every figure reconciles:
 *
 *   Σ type amount = Σ group Dr = Σ group Cr = 4,95,270.00
 *   type grid cash in / out = the cash ledger's in / out (1,10,300.00 / 88,700.00)
 *   type grid bank in / out = bank + clearing in / out (2,30,020.00 / 1,58,400.00)
 *   the tender day book's groups (`TENDER_SPECS`) = each money ledger's in / out
 *
 * This module plays the SERVER, so it may add money up (in integer paise).
 * The client may not; that is the point of the tests that use it.
 *
 * The SHAPES are the server's (`day-summary.types.ts` and the service's
 * check facts, read 2026-10-12): `{ items }` voucher types, `code` on type
 * rows, `{ cashOpening, bankOpening, days }`, `{ ledgers, totals }` group
 * ledgers, a `draftsOnly` flag on voucher pages, `branchId` and leg `rowNo`
 * on rows, `{ summary, vouchers, totalRows }` export, and null balances
 * under a voucher-type filter.
 *
 * Used by the Vitest suites, and by the headless browser check, which
 * fulfils `/api/v1/reports/day-summary/*` with these.
 */

export const FY = { accYear: "2026-2027", begin: "2026-04-01", end: "2027-03-31" };
export const DAY = "2026-10-09";
export const COMPANY_ID = "a1a1a1a1-1111-4111-8111-111111111111";
export const BRANCH_MAIN = "b2b2b2b2-2222-4222-8222-222222222222";
export const LEDGER_CASH = "c3c3c3c3-3333-4333-8333-333333333331";
export const LEDGER_HDFC = "c3c3c3c3-3333-4333-8333-333333333332";
export const LEDGER_CARD = "c3c3c3c3-3333-4333-8333-333333333333";
export const LEDGER_UPI = "c3c3c3c3-3333-4333-8333-333333333334";
export const GROUP_DEBTORS = "d4d4d4d4-4444-4444-8444-444444444444";

type Side = "DR" | "CR";

/** Paise → "12345.00". */
export function rupees(paise: number): string {
  const abs = Math.abs(paise);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Signed paise (Dr positive) → `{ amount, side }`; zero → side null. */
export function sided(paise: number): { amount: string; side: Side | null } {
  return { amount: rupees(paise), side: paise === 0 ? null : paise < 0 ? "CR" : "DR" };
}

const r = (rs: number) => rupees(rs * 100);
const envelope = <T>(data: T) => ({ success: true, message: "OK", data });

export type FixtureQuery = Record<string, string | undefined>;

/* ------------------------------------------------------------- the types */

type TypeSpec = {
  id: number;
  short: string;
  name: string;
  nature: string;
  category: string;
  vouchers: number;
  drafts: number;
  pairs: number;
  amount: number;
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
  prefix: string;
  first: number;
  party: string | null;
  drLedger: string;
  crLedger: string;
};

// Whole rupees; the mockup's voucher-type grid, row by row.
export const TYPE_SPECS: TypeSpec[] = [
  { id: 3, short: "Bil", name: "Sales Bill", nature: "SALES", category: "BOTH", vouchers: 41, drafts: 0, pairs: 1, amount: 186420, cashIn: 92300, cashOut: 0, bankIn: 71620, bankOut: 0, prefix: "bil", first: 1412, party: "Cash Sales", drLedger: "Cash in Hand", crLedger: "Sales Accounts" },
  { id: 18, short: "SRt", name: "Sales Return", nature: "CREDIT_NOTE", category: "BOTH", vouchers: 3, drafts: 0, pairs: 0, amount: 4860, cashIn: 0, cashOut: 2360, bankIn: 0, bankOut: 0, prefix: "srt", first: 88, party: "Cash Sales", drLedger: "Sales Accounts", crLedger: "Cash in Hand" },
  { id: 12, short: "Rct", name: "Receipt", nature: "RECEIPT", category: "ACCOUNTING", vouchers: 6, drafts: 0, pairs: 0, amount: 58000, cashIn: 18000, cashOut: 0, bankIn: 40000, bankOut: 0, prefix: "rct", first: 121, party: "Sri Krishna Traders", drLedger: "HDFC Bank CA", crLedger: "Sri Krishna Traders" },
  { id: 33, short: "Pmt", name: "Payment", nature: "PAYMENT", category: "ACCOUNTING", vouchers: 4, drafts: 1, pairs: 0, amount: 122500, cashIn: 0, cashOut: 2500, bankIn: 0, bankOut: 120000, prefix: "pmt", first: 84, party: "Annapoorna Mills", drLedger: "Annapoorna Mills", crLedger: "HDFC Bank CA" },
  { id: 40, short: "ExpV", name: "Expense Voucher", nature: "PAYMENT", category: "ACCOUNTING", vouchers: 5, drafts: 1, pairs: 0, amount: 3840, cashIn: 0, cashOut: 3840, bankIn: 0, bankOut: 0, prefix: "exv", first: 36, party: null, drLedger: "Staff Welfare", crLedger: "Cash in Hand" },
  { id: 25, short: "Con", name: "Contra", nature: "CONTRA", category: "ACCOUNTING", vouchers: 2, drafts: 0, pairs: 0, amount: 118400, cashIn: 0, cashOut: 80000, bankIn: 118400, bankOut: 38400, prefix: "con", first: 3, party: null, drLedger: "HDFC Bank CA", crLedger: "Cash in Hand" },
  { id: 24, short: "Jrl", name: "Journal", nature: "JOURNAL", category: "ACCOUNTING", vouchers: 2, drafts: 0, pairs: 0, amount: 1250, cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0, prefix: "jrl", first: 17, party: null, drLedger: "Indirect Expenses", crLedger: "Duties & Taxes" },
];

const TOUCHES_CASH = new Set([3, 18, 12, 33, 40, 25]);

/** A tile code → the type ids it covers (backend §6.4). */
const TILE_TYPES: Record<string, number[]> = {
  SALES: [3],
  SALE_RETURNS: [18],
  RECEIPTS: [12],
  PAYMENTS: [33],
  EXPENSES: [40],
};

function sum(pick: (t: TypeSpec) => number): number {
  return TYPE_SPECS.reduce((acc, t) => acc + pick(t), 0);
}

/* --------------------------------------------------------- voucher types */

export function voucherTypesFixture() {
  return envelope({ items: [
    { voucherTypeId: 24, code: "Jrl", short: "Jrl", name: "Journal", nature: "JOURNAL", category: "ACCOUNTING", sortOrder: 30 },
    { voucherTypeId: 25, code: "Con", short: "Con", name: "Contra", nature: "CONTRA", category: "ACCOUNTING", sortOrder: 31 },
    { voucherTypeId: 26, code: "DrN", short: "DrN", name: "Debit Note", nature: "DEBIT_NOTE", category: "ACCOUNTING", sortOrder: 32 },
    { voucherTypeId: 27, code: "CrN", short: "CrN", name: "Credit Note", nature: "CREDIT_NOTE", category: "ACCOUNTING", sortOrder: 33 },
    { voucherTypeId: 1, code: "OPENING", short: "OPN", name: "Opening Stock", nature: "STOCK_JOURNAL", category: "INVENTORY", sortOrder: 100 },
    { voucherTypeId: 12, code: "Rct", short: "Rct", name: "Receipt", nature: "RECEIPT", category: "ACCOUNTING", sortOrder: 200 },
    { voucherTypeId: 33, code: "Pmt", short: "Pmt", name: "Payment", nature: "PAYMENT", category: "ACCOUNTING", sortOrder: 201 },
    { voucherTypeId: 3, code: "Bil", short: "Bil", name: "Sales Bill", nature: "SALES", category: "BOTH", sortOrder: 300 },
    { voucherTypeId: 18, code: "SRt", short: "SRt", name: "Sales Return", nature: "CREDIT_NOTE", category: "BOTH", sortOrder: 320 },
    { voucherTypeId: 23, code: "Rev", short: "Rev", name: "Reversal", nature: "JOURNAL", category: "ACCOUNTING", sortOrder: 340 },
    { voucherTypeId: 40, code: "ExpV", short: "ExpV", name: "Expense Voucher", nature: "PAYMENT", category: "ACCOUNTING", sortOrder: 346 },
  ] });
}

/* ---------------------------------------------------------------- summary */

const MONEY = [
  { ledgerId: LEDGER_CASH, ledgerName: "Cash in Hand", kind: "CASH", opening: 48250, in: 110300, out: 88700 },
  { ledgerId: LEDGER_HDFC, ledgerName: "HDFC Bank CA", kind: "BANK", opening: 312400, in: 158400, out: 120000 },
  { ledgerId: LEDGER_CARD, ledgerName: "Card clearing", kind: "CLEARING", opening: 38400, in: 38400, out: 38400 },
  { ledgerId: LEDGER_UPI, ledgerName: "UPI clearing", kind: "CLEARING", opening: 0, in: 33220, out: 0 },
] as const;

export const GROUPS = [
  { groupId: "d4d4d4d4-4444-4444-8444-444444444441", groupName: "Cash-in-Hand", nature: "Asset", debit: 110300, credit: 88700 },
  { groupId: "d4d4d4d4-4444-4444-8444-444444444442", groupName: "Bank Accounts", nature: "Asset", debit: 158400, credit: 120000 },
  { groupId: "d4d4d4d4-4444-4444-8444-444444444443", groupName: "Card / UPI Clearing", nature: "Asset", debit: 71620, credit: 38400 },
  { groupId: GROUP_DEBTORS, groupName: "Sundry Debtors", nature: "Asset", debit: 22500, credit: 61750 },
  { groupId: "d4d4d4d4-4444-4444-8444-444444444445", groupName: "Sundry Creditors", nature: "Liability", debit: 122500, credit: 0 },
  { groupId: "d4d4d4d4-4444-4444-8444-444444444446", groupName: "Sales Accounts", nature: "Income", debit: 4480, credit: 171820 },
  { groupId: "d4d4d4d4-4444-4444-8444-444444444447", groupName: "Duties & Taxes  ·  GST", nature: "Liability", debit: 620, credit: 14600 },
  { groupId: "d4d4d4d4-4444-4444-8444-444444444448", groupName: "Indirect Expenses", nature: "Expense", debit: 4850, credit: 0 },
];

/** Balances are null under a voucher-type filter (a balance has no type). */
function moneyTotal(rows: ReadonlyArray<(typeof MONEY)[number]>, typed: boolean) {
  const opening = rows.reduce((a, m) => a + m.opening, 0);
  const inn = rows.reduce((a, m) => a + m.in, 0);
  const out = rows.reduce((a, m) => a + m.out, 0);
  return {
    opening: typed ? null : sided(opening * 100),
    in: r(inn),
    out: r(out),
    closing: typed ? null : sided((opening + inn - out) * 100),
  };
}

function typeWire(t: TypeSpec) {
  return {
    voucherTypeId: t.id,
    code: t.short,
    short: t.short,
    name: t.name,
    nature: t.nature,
    category: t.category,
    vouchers: t.vouchers,
    drafts: t.drafts,
    cancelledPairs: t.pairs,
    loneHalves: 0,
    amount: r(t.amount),
    cashIn: r(t.cashIn),
    cashOut: r(t.cashOut),
    bankIn: r(t.bankIn),
    bankOut: r(t.bankOut),
  };
}

function tile(code: string) {
  const types = TYPE_SPECS.filter((t) => TILE_TYPES[code].includes(t.id));
  return {
    code,
    amount: r(types.reduce((a, t) => a + t.amount, 0)),
    vouchers: types.reduce((a, t) => a + t.vouchers, 0),
    drafts: types.reduce((a, t) => a + t.drafts, 0),
    cancelledPairs: types.reduce((a, t) => a + t.pairs, 0),
  };
}

export type SummaryOverrides = { checks?: unknown[]; tiles?: unknown[]; moneyLedgers?: unknown[] };

export function summaryFixture(q: FixtureQuery = {}, overrides: SummaryOverrides = {}) {
  const from = q.fromDate ?? DAY;
  const to = q.toDate ?? from;
  const oneBranch = Boolean(q.branchId);
  const typed = Boolean(q.voucherTypeId);
  const cash = MONEY[0];
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const typeAmount = sum((t) => t.amount);
  const groupDr = GROUPS.reduce((a, g) => a + g.debit, 0);
  const groupCr = GROUPS.reduce((a, g) => a + g.credit, 0);
  if (typeAmount !== groupDr || groupDr !== groupCr) throw new Error("fixture does not reconcile");
  return envelope({
    scope: {
      companyId: q.companyId ?? COMPANY_ID,
      companyName: "Acme Foods Pvt Ltd",
      branchId: q.branchId ?? null,
      branchName: oneBranch ? "Main Store" : "All branches",
      accYear: q.accYear ?? FY.accYear,
      fromDate: from,
      toDate: to,
      days,
      voucherTypeId: q.voucherTypeId ? Number(q.voucherTypeId) : null,
      clearingAsBank: q.clearingAsBank !== "false",
      groupLevel: q.groupLevel ?? "REPORT",
      asOf: "2026-10-12T11:40:03+05:30",
    },
    businessDay:
      from !== to ? null : { status: oneBranch ? "OPEN" : "MIXED", zNo: null, sessions: { total: 3, closed: 2 } },
    tiles: overrides.tiles ?? [
      tile("SALES"),
      tile("SALE_RETURNS"),
      tile("RECEIPTS"),
      tile("PAYMENTS"),
      tile("EXPENSES"),
      {
        code: "CASH_IN_HAND",
        opening: typed ? null : sided(cash.opening * 100),
        closing: typed ? null : sided((cash.opening + cash.in - cash.out) * 100),
        net: sided((cash.in - cash.out) * 100),
      },
    ],
    types: TYPE_SPECS.filter((t) => !q.voucherTypeId || String(t.id) === q.voucherTypeId).map(typeWire),
    typeTotals: {
      vouchers: sum((t) => t.vouchers),
      drafts: sum((t) => t.drafts),
      cancelledPairs: sum((t) => t.pairs),
      amount: r(typeAmount),
      cashIn: r(sum((t) => t.cashIn)),
      cashOut: r(sum((t) => t.cashOut)),
      bankIn: r(sum((t) => t.bankIn)),
      bankOut: r(sum((t) => t.bankOut)),
    },
    moneyLedgers:
      overrides.moneyLedgers ??
      MONEY.map((m) => ({
        ledgerId: m.ledgerId,
        ledgerName: m.ledgerName,
        kind: m.kind,
        opening: typed ? null : sided(m.opening * 100),
        in: r(m.in),
        out: r(m.out),
        closing: typed ? null : sided((m.opening + m.in - m.out) * 100),
        openingNote: null,
      })),
    moneyTotals: {
      CASH: moneyTotal(MONEY.filter((m) => m.kind === "CASH"), typed),
      BANK: moneyTotal(MONEY.filter((m) => m.kind === "BANK"), typed),
      CLEARING: moneyTotal(MONEY.filter((m) => m.kind === "CLEARING"), typed),
      ALL: moneyTotal(MONEY, typed),
    },
    groups: GROUPS.map((g) => ({
      groupId: g.groupId,
      groupName: g.groupName,
      nature: g.nature,
      debit: r(g.debit),
      credit: r(g.credit),
      net: sided((g.debit - g.credit) * 100),
      hasChildren: true,
    })),
    groupTotals: { debit: r(groupDr), credit: r(groupCr) },
    // The service's checks, in its order, with its facts (FUTURE_DATED is left
    // out because the day is before today; CLEARING_PENDING under a type filter).
    checks: overrides.checks ?? [
      { code: "BALANCED", level: "OK", facts: { debit: r(groupDr), credit: r(groupCr), unbalancedVouchers: 0, voucherIds: [] } },
      {
        code: "AMOUNT_TIES",
        level: "OK",
        facts: { typeAmount: r(typeAmount), groupDebit: r(groupDr), groupCredit: r(groupCr), moneyChecked: !typed, moneyMismatches: [] },
      },
      { code: "LEGLESS", level: "OK", facts: { count: 0, voucherIds: [] } },
      { code: "DRAFTS", level: "WARN", facts: { count: 2, amount: r(15640) } },
      { code: "CANCELLED_PAIRS", level: "INFO", facts: { pairs: 1, loneHalves: 0 } },
      ...(typed
        ? []
        : [
            {
              code: "CLEARING_PENDING",
              level: "WARN",
              facts: {
                ledgers: [
                  { ledgerId: LEDGER_CARD, ledgerName: "Card clearing", closing: sided(38400 * 100) },
                  { ledgerId: LEDGER_UPI, ledgerName: "UPI clearing", closing: sided(33220 * 100) },
                ],
              },
            },
          ]),
      ...(from === to
        ? [{ code: "BUSINESS_DAY", level: "WARN", facts: { status: oneBranch ? "OPEN" : "MIXED", zNo: null, sessions: { total: 3, closed: 2 } } }]
        : []),
      { code: "NUMBER_GAPS", level: "OK", facts: { series: [] } },
    ],
  });
}

/* --------------------------------------------------------------- vouchers */

export type WireRow = Record<string, unknown>;

function uuid(n: number): string {
  return `e5e5e5e5-5555-4555-8555-${String(n).padStart(12, "0")}`;
}

/** Every row of the day, in the server's order: counted vouchers plus the in-range cancelled pair. */
export function buildRows(opts: { date?: string; withLegs?: boolean } = {}): WireRow[] {
  const date = opts.date ?? DAY;
  const rows: WireRow[] = [];
  let n = 0;
  for (const t of TYPE_SPECS) {
    const each = Math.floor((t.amount * 100) / t.vouchers);
    let number = t.first;
    for (let i = 0; i < t.vouchers; i += 1) {
      const paise = i === t.vouchers - 1 ? t.amount * 100 - each * (t.vouchers - 1) : each;
      const no = `${t.prefix}${String(number).padStart(5, "0")}`;
      rows.push(row(t, ++n, date, no, paise, "NORMAL", opts.withLegs));
      number += 1;
      // The in-range cancelled pair sits after bil01430 (backend §5.3 order),
      // holding the next two Bil numbers (a same-type mirror takes the next one).
      if (t.id === 3 && number === 1431) {
        rows.push(row(t, ++n, date, "bil01431", 450000, "CANCELLED", opts.withLegs));
        rows.push(row(t, ++n, date, "bil01432", 450000, "REVERSAL", opts.withLegs));
        number += 2;
      }
    }
  }
  return rows;
}

function row(t: TypeSpec, n: number, date: string, voucherNo: string, paise: number, kind: string, withLegs?: boolean): WireRow {
  const pair = kind !== "NORMAL";
  // A mirror posts the opposite legs.
  const [dr, cr] = kind === "REVERSAL" ? [t.crLedger, t.drLedger] : [t.drLedger, t.crLedger];
  return {
    voucherId: uuid(n),
    accYear: FY.accYear,
    date,
    voucherTypeId: t.id,
    short: t.short,
    name: t.name,
    nature: t.nature,
    voucherNo,
    branchId: BRANCH_MAIN,
    branchName: "Main Store",
    party: t.party,
    particulars: t.party ? null : cr,
    asPerDetails: false,
    legCount: 2,
    narration: pair ? (kind === "CANCELLED" ? "cancelled at the counter" : "cancel of bil01431") : null,
    amount: rupees(paise),
    status: kind === "CANCELLED" ? "CANCELLED" : "POSTED",
    rowKind: kind,
    pairInRange: pair,
    createdBy: n % 3 === 0 ? "RAVI" : "VIJAY",
    src: t.id === 3 ? { module: "SALES", docType: "SALE_BILL", docId: uuid(1000 + n) } : null,
    ...(withLegs
      ? {
          legs: [
            { rowNo: 1, ledgerId: uuid(5000 + n * 2), ledgerName: dr, side: "DR", amount: rupees(paise), role: null },
            { rowNo: 2, ledgerId: uuid(5001 + n * 2), ledgerName: cr, side: "CR", amount: rupees(paise), role: null },
          ],
        }
      : {}),
  };
}


export function filteredRows(q: FixtureQuery = {}): WireRow[] {
  return buildRows({ date: q.fromDate, withLegs: q.withLegs === "true" }).filter((row) => {
    if (q.voucherTypeId && String(row.voucherTypeId) !== q.voucherTypeId) return false;
    if (q.includeCancelledPairs === "false" && row.pairInRange) return false;
    // natureFilter is a vchr_nature (the server's DTO refuses anything else).
    if (q.natureFilter && row.nature !== q.natureFilter) return false;
    if (q.moneyKind === "CASH" && !TOUCHES_CASH.has(row.voucherTypeId as number)) return false;
    return true;
  });
}

/** The server's DraftRow: no number, no legs, no kind, no nature. */
const DRAFT_ROWS: WireRow[] = [
  { voucherId: uuid(9001), accYear: FY.accYear, date: DAY, voucherTypeId: 33, short: "Pmt", name: "Payment", amount: r(15000), createdBy: "VIJAY", src: null },
  { voucherId: uuid(9002), accYear: FY.accYear, date: DAY, voucherTypeId: 40, short: "ExpV", name: "Expense Voucher", amount: r(640), createdBy: "RAVI", src: null },
];

export function vouchersFixture(q: FixtureQuery = {}) {
  const page = Number(q.page ?? "1");
  const pageSize = Number(q.pageSize ?? "200");
  if (q.draftsOnly === "true") {
    return envelope({
      draftsOnly: true,
      page: { page: 1, pageSize, totalRows: DRAFT_ROWS.length },
      totals: { amount: r(15640) },
      rows: DRAFT_ROWS,
    });
  }
  const all = filteredRows(q);
  const counted = all.filter((row) => !row.pairInRange);
  const totalPaise = counted.reduce((a, row) => a + Math.round(Number(row.amount) * 100), 0);
  return envelope({
    draftsOnly: false,
    page: { page, pageSize, totalRows: all.length },
    totals: { amount: rupees(totalPaise) },
    rows: all.slice((page - 1) * pageSize, page * pageSize),
  });
}

/* ------------------------------------------------------------------ daily */

export function dailyFixture(q: FixtureQuery = {}) {
  const from = q.fromDate ?? "2026-10-07";
  const to = q.toDate ?? DAY;
  const rows: WireRow[] = [];
  const cashOpening = 30000 * 100;
  const bankOpening = 300000 * 100;
  let cash = cashOpening;
  let bank = bankOpening;
  for (let d = Date.parse(`${from}T00:00:00Z`), i = 0; d <= Date.parse(`${to}T00:00:00Z`); d += 86_400_000, i += 1) {
    const date = new Date(d).toISOString().slice(0, 10);
    const cashIn = (90000 + 4000 * i) * 100;
    const cashOut = (80000 + 1500 * i) * 100;
    const bankIn = (200000 + 10000 * i) * 100;
    const bankOut = (150000 + 2000 * i) * 100;
    cash += cashIn - cashOut;
    bank += bankIn - bankOut;
    rows.push({
      date,
      vouchers: 55 + i,
      drafts: i % 2,
      cancelledPairs: date === DAY ? 1 : 0,
      amount: r(440000 + 9000 * i),
      cashIn: rupees(cashIn),
      cashOut: rupees(cashOut),
      cashClosing: sided(cash),
      bankIn: rupees(bankIn),
      bankOut: rupees(bankOut),
      bankClosing: sided(bank),
      businessDay: date === DAY ? "OPEN" : "CLOSED",
    });
  }
  return envelope({ cashOpening: sided(cashOpening), bankOpening: sided(bankOpening), days: rows });
}

/* ---------------------------------------------------------- group ledgers */

export function groupLedgersFixture(q: FixtureQuery = {}) {
  const g = GROUPS.find((x) => x.groupId === q.groupId);
  if (!g) return null;
  const head = { groupId: g.groupId, groupName: g.groupName, groupLevel: q.groupLevel ?? "REPORT" };
  if (q.groupId === GROUP_DEBTORS) {
    return envelope({
      ...head,
      ledgers: [
        { ledgerId: "f6f6f6f6-6666-4666-8666-666666666661", ledgerName: "Sri Krishna Traders", groupId: g.groupId, groupName: "Sundry Debtors", debit: r(12500), credit: r(40000), net: sided(-27500 * 100) },
        { ledgerId: "f6f6f6f6-6666-4666-8666-666666666662", ledgerName: "Murugan Agencies", groupId: g.groupId, groupName: "Sundry Debtors", debit: r(10000), credit: r(0), net: sided(10000 * 100) },
        { ledgerId: "f6f6f6f6-6666-4666-8666-666666666663", ledgerName: "Kavery Distributors", groupId: g.groupId, groupName: "Trichy Area", debit: r(0), credit: r(21750), net: sided(-21750 * 100) },
      ],
      totals: { debit: r(22500), credit: r(61750) },
    });
  }
  return envelope({
    ...head,
    ledgers: [
      { ledgerId: "f6f6f6f6-6666-4666-8666-666666666669", ledgerName: g.groupName, groupId: g.groupId, groupName: g.groupName, debit: r(g.debit), credit: r(g.credit), net: sided((g.debit - g.credit) * 100) },
    ],
    totals: { debit: r(g.debit), credit: r(g.credit) },
  });
}

/* ----------------------------------------------------------- check detail */

export function checkDetailFixture(q: FixtureQuery = {}) {
  if (q.code === "DRAFTS") {
    return envelope({
      code: "DRAFTS",
      rows: [
        { voucherNo: "pmt00088", date: DAY, type: "Pmt", amount: r(15000), createdBy: "VIJAY" },
        { voucherNo: "exv00041", date: DAY, type: "ExpV", amount: r(640), createdBy: "RAVI" },
      ],
      truncated: false,
    });
  }
  return envelope({ code: q.code, rows: [], truncated: false });
}

/* ----------------------------------------------------------------- export */

export function exportFixture(q: FixtureQuery = {}) {
  const summary = summaryFixture(q).data;
  const rows = filteredRows({ ...q, withLegs: "true" });
  return envelope({ summary, vouchers: rows, totalRows: rows.length });
}

/* ----------------------------------------- tender day book (notes 126 §4) */

export const TENDER_CASH = "a7a7a7a7-7777-4777-8777-777777777771";
export const TENDER_HDFC_CARD = "a7a7a7a7-7777-4777-8777-777777777772";
export const TENDER_ICICI_CARD = "a7a7a7a7-7777-4777-8777-777777777773";
export const TENDER_UPI = "a7a7a7a7-7777-4777-8777-777777777774";
export const TENDER_NEFT = "a7a7a7a7-7777-4777-8777-777777777775";

type TenderSpec = {
  ledgerId: string;
  ledgerName: string;
  ledgerType: "CASH" | "BANK";
  tenderId: string | null;
  tenderName: string | null;
  typeId: number | null;
  typeName: string | null;
  /** Paise. Opening is signed (Dr +). */
  opening: number;
  debit: number;
  credit: number;
};

/**
 * The day's cash and bank ledgers of `MONEY`, split by tender: each ledger's
 * debit / credit add up to its in / out, and its group openings (plus the
 * opening set, Cash in Hand's 30,000.00) to its opening. Two lines on Cash in
 * Hand have no tender (2,500.00 Cr, the red row); HDFC's no-tender group is
 * history only (an opening, nothing in the range). The two card machines
 * carry paise, so a footer sum through a float would show.
 */
export const TENDER_SPECS: TenderSpec[] = [
  { ledgerId: LEDGER_CASH, ledgerName: "Cash in Hand", ledgerType: "CASH", tenderId: TENDER_CASH, tenderName: "CASH", typeId: 1, typeName: "CASH", opening: 1825000, debit: 11030000, credit: 8620000 },
  { ledgerId: LEDGER_CASH, ledgerName: "Cash in Hand", ledgerType: "CASH", tenderId: null, tenderName: null, typeId: null, typeName: null, opening: 0, debit: 0, credit: 250000 },
  { ledgerId: LEDGER_HDFC, ledgerName: "HDFC Bank CA", ledgerType: "BANK", tenderId: TENDER_NEFT, tenderName: "BANK TRANSFER", typeId: 4, typeName: "BANK", opening: 31360000, debit: 15840000, credit: 12000000 },
  { ledgerId: LEDGER_HDFC, ledgerName: "HDFC Bank CA", ledgerType: "BANK", tenderId: null, tenderName: null, typeId: null, typeName: null, opening: -120000, debit: 0, credit: 0 },
  { ledgerId: LEDGER_CARD, ledgerName: "Card clearing", ledgerType: "BANK", tenderId: TENDER_HDFC_CARD, tenderName: "CARD – HDFC machine 1", typeId: 2, typeName: "CARD", opening: 2640050, debit: 2640050, credit: 2640050 },
  { ledgerId: LEDGER_CARD, ledgerName: "Card clearing", ledgerType: "BANK", tenderId: TENDER_ICICI_CARD, tenderName: "CARD – ICICI machine 2", typeId: 2, typeName: "CARD", opening: 1199950, debit: 1199950, credit: 1199950 },
  { ledgerId: LEDGER_UPI, ledgerName: "UPI clearing", ledgerType: "BANK", tenderId: TENDER_UPI, tenderName: "UPI – PhonePe QR", typeId: 3, typeName: "UPI", opening: 0, debit: 3322000, credit: 0 },
];

const OPENING_SETS: Record<string, number> = { [LEDGER_CASH]: 3000000 };

/** Signed paise → "-1200.00" (the tender routes' opening / closing). */
export function signedRupees(paise: number): string {
  return `${paise < 0 ? "-" : ""}${rupees(paise)}`;
}

/** The lines no tender row labels, all on the Date: the red group's 2,500.00 Cr. */
const NO_TENDER_LINES: WireRow[] = [
  { voucherDate: DAY, voucherId: uuid(7001), accYear: FY.accYear, voucherNo: "tdr00007", voucherTypeId: 35, voucherTypeCode: "TDrp", branchId: BRANCH_MAIN, sessionId: uuid(7101), partyId: null, partyName: null, ledgerId: LEDGER_CASH, ledgerName: "Cash in Hand", ledgerType: "CASH", tenderId: null, tenderName: null, tenderTypeId: null, tenderTypeName: null, isMirror: false, debit: "0.00", credit: r(1500) },
  { voucherDate: DAY, voucherId: uuid(7002), accYear: FY.accYear, voucherNo: "rev00012", voucherTypeId: 23, voucherTypeCode: "Rev", branchId: BRANCH_MAIN, sessionId: null, partyId: uuid(7201), partyName: "Cash Sales", ledgerId: LEDGER_CASH, ledgerName: "Cash in Hand", ledgerType: "CASH", tenderId: null, tenderName: null, tenderTypeId: null, tenderTypeName: null, isMirror: true, debit: "0.00", credit: r(1000) },
];

/** GET /reports/tender-day-book, in the server's order: ledger name, tender type (nulls last), tender. */
export function tenderDayBookFixture(q: FixtureQuery = {}) {
  const byType = q.groupBy === "TYPE";
  const merged = new Map<string, TenderSpec>();
  for (const spec of TENDER_SPECS) {
    const key = `${spec.ledgerId}|${byType ? (spec.typeId ?? "NONE") : (spec.tenderId ?? "NONE")}`;
    const held = merged.get(key);
    merged.set(
      key,
      held
        ? { ...held, opening: held.opening + spec.opening, debit: held.debit + spec.debit, credit: held.credit + spec.credit }
        : { ...spec, tenderId: byType ? null : spec.tenderId, tenderName: byType ? null : spec.tenderName },
    );
  }
  const ordered = [...merged.entries()].sort(
    ([, a], [, b]) =>
      a.ledgerName.localeCompare(b.ledgerName) ||
      (a.typeId ?? Number.MAX_SAFE_INTEGER) - (b.typeId ?? Number.MAX_SAFE_INTEGER) ||
      (a.tenderId ?? "").localeCompare(b.tenderId ?? ""),
  );
  const groups = ordered.map(([key, g]) => ({
    key,
    tenderId: g.tenderId,
    tenderName: g.tenderName,
    tenderTypeId: g.typeId,
    tenderTypeName: g.typeName,
    ledgerId: g.ledgerId,
    ledgerName: g.ledgerName,
    ledgerType: g.ledgerType,
    opening: signedRupees(g.opening),
    debit: rupees(g.debit),
    credit: rupees(g.credit),
    closing: signedRupees(g.opening + g.debit - g.credit),
  }));
  const ledgers = [...new Set(ordered.map(([, g]) => g.ledgerId))].map((ledgerId) => {
    const own = TENDER_SPECS.filter((s) => s.ledgerId === ledgerId);
    const set = OPENING_SETS[ledgerId] ?? 0;
    const opening = set + own.reduce((a, s) => a + s.opening, 0);
    const debit = own.reduce((a, s) => a + s.debit, 0);
    const credit = own.reduce((a, s) => a + s.credit, 0);
    const noTender = own.filter((s) => s.typeId === null).reduce((a, s) => a + s.debit + s.credit, 0);
    return {
      ledgerId,
      ledgerName: own[0].ledgerName,
      ledgerType: own[0].ledgerType,
      openingSet: signedRupees(set),
      opening: signedRupees(opening),
      debit: rupees(debit),
      credit: rupees(credit),
      closing: signedRupees(opening + debit - credit),
      noTender: rupees(noTender),
    };
  });
  // The live server sends rows despite `withRows=false` (its DTO reads the coerced flag); `limit` caps them.
  const cap = Number(q.limit ?? "5000");
  return envelope({
    companyId: q.companyId ?? COMPANY_ID,
    accYear: q.accYear ?? FY.accYear,
    branchId: q.branchId ?? null,
    fromDate: q.fromDate ?? DAY,
    toDate: q.toDate ?? q.fromDate ?? DAY,
    groupBy: byType ? "TYPE" : "TENDER",
    groups,
    ledgers,
    rows: NO_TENDER_LINES.slice(0, cap),
    rowsTruncated: NO_TENDER_LINES.length > cap,
  });
}

/** GET /reports/tender-day-book/no-tender: the lines in the range, `limit` of them; count and amount are all of them. */
export function noTenderFixture(q: FixtureQuery = {}) {
  const from = q.fromDate ?? FY.begin;
  const to = q.toDate ?? DAY;
  const lines = NO_TENDER_LINES.filter((l) => String(l.voucherDate) >= from && String(l.voucherDate) <= to);
  const paise = (l: WireRow) => Math.round(Number(l.credit) * 100) + Math.round(Number(l.debit) * 100);
  const byCode = new Map<string, { count: number; paise: number }>();
  for (const l of lines) {
    const code = String(l.voucherTypeCode);
    const held = byCode.get(code) ?? { count: 0, paise: 0 };
    byCode.set(code, { count: held.count + 1, paise: held.paise + paise(l) });
  }
  const cap = Number(q.limit ?? "5000");
  return envelope({
    companyId: q.companyId ?? COMPANY_ID,
    accYear: q.accYear ?? FY.accYear,
    branchId: q.branchId ?? null,
    fromDate: from,
    toDate: to,
    count: lines.length,
    amount: rupees(lines.reduce((a, l) => a + paise(l), 0)),
    byVoucherType: [...byCode.entries()]
      .sort(([a, x], [b, y]) => y.count - x.count || a.localeCompare(b))
      .map(([voucherTypeCode, t]) => ({ voucherTypeCode, count: t.count, amount: rupees(t.paise) })),
    rows: lines.slice(0, cap),
    rowsTruncated: lines.length > cap,
  });
}
