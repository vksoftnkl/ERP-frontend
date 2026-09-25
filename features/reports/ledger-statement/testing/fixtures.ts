/**
 * Server stand-ins, in the WIRE shape (`{ success, data }`, amounts as
 * strings), built from the plan's worked example: Sri Krishna Traders,
 * 01-08-2026 → 25-09-2026. 14 rows, one cancelled pair, two "as per details"
 * receipts and one receipt with both a debit and a credit (L3), opening
 * 1,85,200.00 Dr, closing 1,76,300.00 Dr.
 *
 * This module plays the SERVER, so it may add money up (in integer paise).
 * The client may not; that is the point of the tests that use it.
 *
 * Used by the Vitest suites, and by the headless browser check, which
 * fulfils `/api/v1/reports/ledger-statement/*` with these.
 */

export const FY = { accYear: "2026-2027", begin: "2026-04-01", end: "2027-03-31" };
export const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
export const BRANCH_MAIN = "22222222-2222-4222-8222-222222222222";
export const LEDGER_SKT = "33333333-3333-4333-8333-333333333333";
export const LEDGER_OTHERS = [
  "33333333-3333-4333-8333-333333333334",
  "33333333-3333-4333-8333-333333333335",
  "33333333-3333-4333-8333-333333333336",
  "33333333-3333-4333-8333-333333333337",
];
export const GROUP_DEBTORS = "44444444-4444-4444-8444-444444444444";
const CASH = "55555555-5555-4555-8555-555555555551";
const BANK = "55555555-5555-4555-8555-555555555552";
const SALES = "55555555-5555-4555-8555-555555555553";
const CHARGES = "55555555-5555-4555-8555-555555555554";
const DISCOUNT = "55555555-5555-4555-8555-555555555555";

type Side = "DR" | "CR";

/** Paise → "12345.00". */
export function rupees(paise: number): string {
  const abs = Math.abs(paise);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Signed paise (Dr positive) → the wire's `{ amount, side }`. */
export function sided(paise: number): { amount: string; side: Side } {
  return { amount: rupees(paise), side: paise < 0 ? "CR" : "DR" };
}

const envelope = <T>(data: T) => ({ success: true, data });

type Spec = {
  date: string;
  type: [number, string, string];
  no: string;
  kind?: "NORMAL" | "CANCELLED" | "REVERSAL";
  dr?: number;
  cr?: number;
  particulars?: string | null;
  narration?: string | null;
  refs?: string[];
  legs?: Array<[Side, string, string, number, string | null]>;
  src?: [string, string] | null;
};

const SALE: [number, string, string] = [3, "Sales Bill", "Bil"];
const RCT: [number, string, string] = [12, "Receipt", "Rct"];
const SRT: [number, string, string] = [18, "Sales Return", "SRt"];
const BNC: [number, string, string] = [14, "Cheque Bounce", "ChqBnc"];

// Amounts in whole rupees; ×100 below.
const SPECS: Spec[] = [
  { date: "2026-08-03", type: SALE, no: "bil00341", dr: 42500, particulars: "Sales", src: ["SALES", "SALE_BILL"] },
  {
    date: "2026-08-05",
    type: RCT,
    no: "rct00120",
    cr: 60000,
    particulars: null,
    narration: "Aug collection",
    legs: [
      ["DR", CASH, "Cash", 15000, null],
      ["DR", BANK, "HDFC Bank", 45000, null],
    ],
    src: ["ACCOUNTS", "RECEIPT"],
  },
  { date: "2026-08-09", type: SALE, no: "bil00348", dr: 18400, particulars: "Sales", src: ["SALES", "SALE_BILL"] },
  { date: "2026-08-12", type: SALE, no: "bil00355", dr: 25600, particulars: "Sales", src: ["SALES", "SALE_BILL"] },
  { date: "2026-08-16", type: SRT, no: "srt00031", cr: 3200, particulars: "Sales Return", src: ["SALES", "SALE_RETURN"] },
  {
    date: "2026-08-21",
    type: SALE,
    no: "bil00361",
    kind: "CANCELLED",
    dr: 31000,
    particulars: "Sales",
    src: ["SALES", "SALE_BILL"],
  },
  {
    date: "2026-08-21",
    type: SALE,
    no: "bil00362",
    kind: "REVERSAL",
    cr: 31000,
    particulars: "Sales",
    narration: "Reversal of bil00361",
    src: null,
  },
  {
    date: "2026-08-27",
    type: RCT,
    no: "rct00134",
    cr: 40000,
    particulars: "HDFC Bank",
    refs: ["bil00355", "bil00348"],
    narration: "Sept route",
    src: ["ACCOUNTS", "RECEIPT"],
  },
  { date: "2026-09-02", type: SALE, no: "bil00372", dr: 27800, particulars: "Sales", src: ["SALES", "SALE_BILL"] },
  { date: "2026-09-08", type: BNC, no: "chqbnc0004", dr: 20000, particulars: "HDFC Bank", narration: "Cheque 004512 returned" },
  {
    date: "2026-09-11",
    type: RCT,
    no: "rct00151",
    cr: 50000,
    particulars: null,
    legs: [
      ["DR", BANK, "HDFC Bank", 48500, null],
      ["DR", CHARGES, "Bank Charges", 1500, "BANK_CHARGES"],
    ],
    src: ["ACCOUNTS", "RECEIPT"],
  },
  { date: "2026-09-15", type: SALE, no: "bil00380", dr: 12300, particulars: "Sales", src: ["SALES", "SALE_BILL"] },
  {
    date: "2026-09-19",
    type: RCT,
    no: "rct00163",
    dr: 500,
    cr: 15500,
    particulars: "Cash",
    refs: ["bil00372"],
    narration: "Discount on settlement",
    src: ["ACCOUNTS", "RECEIPT"],
  },
  { date: "2026-09-24", type: SALE, no: "bil00391", dr: 12700, particulars: "Sales", src: ["SALES", "SALE_BILL"] },
];

export const OPENING_PAISE = 18520000;

function voucherId(n: number): string {
  return `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`;
}

export type WireRow = Record<string, unknown>;

/** The server's rows, with running balances, for `count` rows (cycled from SPECS past 14). */
export function buildRows(opts: { count?: number; withLegs?: boolean; withBillRefs?: boolean } = {}): {
  rows: WireRow[];
  balances: number[];
  debit: number;
  credit: number;
  drVouchers: number;
  crVouchers: number;
} {
  const count = opts.count ?? SPECS.length;
  let balance = OPENING_PAISE;
  let debit = 0;
  let credit = 0;
  let drVouchers = 0;
  let crVouchers = 0;
  const rows: WireRow[] = [];
  const balances: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const spec = SPECS[i % SPECS.length];
    const dr = (spec.dr ?? 0) * 100;
    const cr = (spec.cr ?? 0) * 100;
    balance += dr - cr;
    debit += dr;
    credit += cr;
    if (dr) drVouchers += 1;
    if (cr) crVouchers += 1;
    balances.push(balance);
    const id = voucherId(i + 1);
    const legs = spec.legs
      ? [
          ...spec.legs.map(([side, ledgerId, ledgerName, amount, role], k) => ({
            rowNo: k + 1,
            side,
            ledgerId,
            ledgerName,
            amount: rupees(amount * 100),
            role,
            isThisLedger: false,
            remarks: null,
          })),
          {
            rowNo: spec.legs.length + 1,
            side: "CR",
            ledgerId: LEDGER_SKT,
            ledgerName: "Sri Krishna Traders",
            amount: rupees(cr),
            role: null,
            isThisLedger: true,
            remarks: null,
          },
        ]
      : [
          {
            rowNo: 1,
            side: dr ? "DR" : "CR",
            ledgerId: LEDGER_SKT,
            ledgerName: "Sri Krishna Traders",
            amount: rupees(dr || cr),
            role: null,
            isThisLedger: true,
            remarks: null,
          },
          {
            rowNo: 2,
            side: dr ? "CR" : "DR",
            ledgerId: spec.type[0] === RCT[0] ? CASH : spec.dr && spec.cr ? DISCOUNT : SALES,
            ledgerName: spec.particulars ?? "Sales",
            amount: rupees(dr || cr),
            role: null,
            isThisLedger: false,
            remarks: null,
          },
        ];
    const row: WireRow = {
      voucherId: id,
      accYear: FY.accYear,
      branchId: BRANCH_MAIN,
      branchName: "Main",
      date: spec.date,
      voucherTypeId: spec.type[0],
      voucherTypeName: spec.type[1],
      voucherTypeShort: spec.type[2],
      voucherNo: count > SPECS.length ? `${spec.no}-${i + 1}` : spec.no,
      status: spec.kind === "CANCELLED" ? "CANCELLED" : "POSTED",
      rowKind: spec.kind ?? "NORMAL",
      pairOutsideRange: false,
      particulars: spec.particulars === undefined ? null : spec.particulars,
      asPerDetails: Boolean(spec.legs),
      legCount: legs.length,
      narration: spec.narration ?? null,
      billRefs: opts.withBillRefs === false ? [] : (spec.refs ?? []),
      debit: rupees(dr),
      credit: rupees(cr),
      balance: sided(balance),
      createdBy: "PRATHAP",
      src: spec.src
        ? { module: spec.src[0], docType: spec.src[1], docId: id }
        : { module: null, docType: null, docId: null },
    };
    if (opts.withLegs) row.legs = legs;
    rows.push(row);
    LEGS.set(id, { voucherNo: row.voucherNo, date: spec.date, status: row.status, legs });
  }
  return { rows, balances, debit, credit, drVouchers, crVouchers };
}

const LEGS = new Map<string, { voucherNo: unknown; date: string; status: unknown; legs: unknown[] }>();

export type FixtureQuery = Record<string, string | undefined>;

/** `/header` for the worked example (or `count` generated rows). */
export function headerFixture(q: FixtureQuery = {}, count?: number) {
  const built = buildRows({ count });
  const closing = OPENING_PAISE + built.debit - built.credit;
  const ledgerIndex = LEDGER_OTHERS.indexOf(q.ledgerId ?? "");
  return envelope({
    ledger: {
      ledgerId: q.ledgerId ?? LEDGER_SKT,
      name: ledgerIndex >= 0 ? `Party ${ledgerIndex + 2}` : "Sri Krishna Traders",
      groupName: "Sundry Debtors",
      nature: "ASSETS",
      isBillByBill: true,
      gstin: "33AABCS1429B1Z5",
      mobile: "98430 12345",
      creditDays: 30,
      creditLimit: null,
    },
    period: {
      fromDate: q.fromDate ?? "2026-08-01",
      toDate: q.toDate ?? "2026-09-25",
      opening: sided(OPENING_PAISE),
      debit: { amount: rupees(built.debit), vouchers: built.drVouchers },
      credit: { amount: rupees(built.credit), vouchers: built.crVouchers },
      closing: sided(closing),
      cancelledPairs: 1,
      openingNote: null,
    },
  });
}

export function vouchersFixture(q: FixtureQuery = {}, count?: number) {
  const pageSize = Number(q.pageSize ?? 200);
  const page = Number(q.page ?? 1);
  const built = buildRows({
    count,
    withLegs: q.withLegs === "true",
    withBillRefs: q.withBillRefs !== "false",
  });
  const start = (page - 1) * pageSize;
  const slice = built.rows.slice(start, start + pageSize);
  const bf = start === 0 ? OPENING_PAISE : built.balances[start - 1];
  const cf = slice.length ? built.balances[start + slice.length - 1] : bf;
  return envelope({
    broughtForward: sided(bf),
    rows: slice,
    carriedForward: sided(cf),
    page: { page, pageSize, totalRows: built.rows.length },
  });
}

export function voucherLegsFixture(q: FixtureQuery = {}) {
  if (LEGS.size === 0) buildRows();
  const found = LEGS.get(q.voucherId ?? "");
  if (!found) return null;
  return envelope({ voucherId: q.voucherId, accYear: FY.accYear, ...found });
}

export function monthlyFixture() {
  const built = buildRows();
  const monthsBefore: Array<[string, number, number]> = [
    ["2026-04", 1000000, 0],
    ["2026-05", 1200000, 400000],
    ["2026-06", 1220000, 0],
    ["2026-07", 500000, 0],
  ];
  const fyOpening = OPENING_PAISE - monthsBefore.reduce((s, [, d, c]) => s + d - c, 0);
  let running = fyOpening;
  const months: WireRow[] = monthsBefore.map(([month, d, c]) => {
    running += d - c;
    return { month, debit: rupees(d), credit: rupees(c), closing: sided(running), isFuture: false };
  });
  for (const month of ["2026-08", "2026-09"]) {
    const inMonth = built.rows.filter((r) => String(r.date).startsWith(month));
    const d = inMonth.reduce((s, r) => s + Math.round(Number(r.debit) * 100), 0);
    const c = inMonth.reduce((s, r) => s + Math.round(Number(r.credit) * 100), 0);
    running += d - c;
    months.push({ month, debit: rupees(d), credit: rupees(c), closing: sided(running), isFuture: false });
  }
  for (const month of ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]) {
    months.push({ month, debit: "0.00", credit: "0.00", closing: sided(running), isFuture: true });
  }
  return envelope({ opening: sided(fyOpening), months, closing: sided(running) });
}

export function dailyFixture() {
  const built = buildRows();
  const byDay = new Map<string, { d: number; c: number; n: number; closing: number }>();
  built.rows.forEach((r, i) => {
    const day = String(r.date);
    const entry = byDay.get(day) ?? { d: 0, c: 0, n: 0, closing: 0 };
    entry.d += Math.round(Number(r.debit) * 100);
    entry.c += Math.round(Number(r.credit) * 100);
    entry.n += 1;
    entry.closing = built.balances[i];
    byDay.set(day, entry);
  });
  return envelope({
    opening: sided(OPENING_PAISE),
    days: [...byDay.entries()].map(([date, e]) => ({
      date,
      debit: rupees(e.d),
      credit: rupees(e.c),
      vouchers: e.n,
      closing: sided(e.closing),
    })),
    closing: sided(OPENING_PAISE + built.debit - built.credit),
  });
}

export function ledgersFixture(q: FixtureQuery = {}) {
  const all = [
    { ledgerId: LEDGER_SKT, name: "Sri Krishna Traders" },
    ...LEDGER_OTHERS.map((ledgerId, i) => ({ ledgerId, name: `Party ${i + 2}` })),
  ].map((item) => ({
    ...item,
    groupId: GROUP_DEBTORS,
    groupName: "Sundry Debtors",
    isBillByBill: true,
    isShared: false,
  }));
  const search = (q.search ?? "").toLowerCase();
  const items = all
    .filter((item) => !search || item.name.toLowerCase().includes(search))
    .filter((item) => !q.groupId || item.groupId === q.groupId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return envelope({ items });
}

export function exportFixture(q: FixtureQuery = {}) {
  const header = headerFixture(q).data;
  const built = buildRows({ withBillRefs: q.withBillRefs !== "false", withLegs: q.withLegs === "true" });
  return envelope({
    ...header,
    broughtForward: sided(OPENING_PAISE),
    rows: built.rows,
    carriedForward: sided(built.balances[built.balances.length - 1]),
    totalRows: built.rows.length,
  });
}
