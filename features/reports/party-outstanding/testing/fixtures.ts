/**
 * Server stand-ins, in the WIRE shape (`{ success, message, data }`, amounts
 * as strings), transcribed from `party_outstanding_ui_mockup.png`: Receivable,
 * all branches, as on 25-09-2026, nine parties, Sri Krishna Traders selected
 * with its nine open items (1,76,300.00 Dr, which ties to the Ledger
 * Statement mockup's closing).
 *
 * This module plays the SERVER, so it may add money up (in integer paise).
 * The client may not; that is the point of the tests that use it.
 *
 * Used by the Vitest suites, and by the headless browser check, which
 * fulfils `/api/v1/reports/party-outstanding/*` with these.
 */

export const AS_ON = "2026-09-25";
export const FY = { accYear: "2026-2027", begin: "2026-04-01", end: "2027-03-31" };
export const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
export const BRANCH_MAIN = "22222222-2222-4222-8222-222222222222";
export const BRANCH_KARUR = "22222222-2222-4222-8222-222222222223";
export const GROUP_DEBTORS = "44444444-4444-4444-8444-444444444444";
export const GROUP_TRICHY = "44444444-4444-4444-8444-444444444445";
export const GROUP_CREDITORS = "44444444-4444-4444-8444-444444444446";
export const AREA_TRICHY = "66666666-6666-4666-8666-666666666661";
export const AREA_KARUR = "66666666-6666-4666-8666-666666666662";
export const SALESMAN_RAVI = "77777777-7777-4777-8777-777777777771";

const LABELS = ["0–30", "31–60", "61–90", "91–180", "> 180"];

type Side = "DR" | "CR";
type Q = Record<string, string>;

/** Paise → "12345.00". */
export function rupees(paise: number): string {
  const abs = Math.abs(paise);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const r = (value: number) => rupees(Math.round(value * 100));

/** Signed paise (Dr positive) → the wire's `{ amount, side }`, null on zero. */
export function sided(paise: number): { amount: string; side: Side | null } {
  return { amount: rupees(paise), side: paise === 0 ? null : paise < 0 ? "CR" : "DR" };
}

const envelope = <T>(data: T) => ({ success: true, message: "OK", data });

function head(q: Q) {
  return {
    asOn: q.asOn ?? AS_ON,
    side: q.side === "PAYABLE" ? "PAYABLE" : "RECEIVABLE",
    isFuture: (q.asOn ?? AS_ON) > AS_ON,
    accYear: FY.accYear,
    bucketLabels: LABELS,
  };
}

/* ------------------------------------------------------------- parties */

type PartySpec = {
  id: string;
  name: string;
  area: string | null;
  phone: string;
  crDays: number;
  limit: number | null;
  bills: number;
  owed: number;
  onAcct: number;
  buckets: [number, number, number, number, number];
  overdue: number;
  oldest: number | null;
  pdc: number;
  flags: string[];
};

const pid = (n: number) => `33333333-3333-4333-8333-${String(333333333333 + n).padStart(12, "0")}`;

export const PARTY_SKT = pid(0);

/** The mockup's nine rows, in its order (Net outstanding, descending). */
export const MOCKUP_PARTIES: PartySpec[] = [
  { id: PARTY_SKT, name: "Sri Krishna Traders", area: "Trichy", phone: "98430 21177", crDays: 30, limit: 200000, bills: 8, owed: 180300, onAcct: 4000, buckets: [10150, 92650, 18500, 59000, 0], overdue: 170500, oldest: 178, pdc: 20000, flags: ["CHQ_BOUNCED"] },
  { id: pid(1), name: "Murugan Agencies", area: "Erode", phone: "98940 11223", crDays: 45, limit: null, bills: 11, owed: 168700, onAcct: 0, buckets: [62500, 48800, 36400, 21000, 0], overdue: 70200, oldest: 120, pdc: 40000, flags: [] },
  { id: pid(2), name: "Kavery Distributors", area: "Namakkal", phone: "94430 55110", crDays: 60, limit: null, bills: 9, owed: 158500, onAcct: 0, buckets: [55000, 61200, 42300, 0, 0], overdue: 42300, oldest: 84, pdc: 50000, flags: [] },
  { id: pid(3), name: "Lakshmi Stores", area: "Karur", phone: "90030 44556", crDays: 15, limit: null, bills: 5, owed: 59500, onAcct: 0, buckets: [41200, 18300, 0, 0, 0], overdue: 30700, oldest: 44, pdc: 0, flags: [] },
  { id: pid(4), name: "Selvam & Co", area: "Salem", phone: "98422 10101", crDays: 30, limit: null, bills: 3, owed: 48600, onAcct: 0, buckets: [0, 0, 0, 0, 48600], overdue: 48600, oldest: 245, pdc: 0, flags: ["OVER_180"] },
  { id: pid(5), name: "Vinayaga Hotels", area: "Karur", phone: "97890 12345", crDays: 30, limit: null, bills: 4, owed: 34700, onAcct: 0, buckets: [12000, 14500, 8200, 0, 0], overdue: 22700, oldest: 72, pdc: 0, flags: [] },
  { id: pid(6), name: "Balaji Provisions", area: "Dindigul", phone: "94860 98765", crDays: 21, limit: null, bills: 6, owed: 32000, onAcct: 2500, buckets: [22400, 9600, 0, 0, 0], overdue: 12700, oldest: 38, pdc: 0, flags: [] },
  { id: pid(7), name: "Ganesh Bakery", area: "Trichy", phone: "99440 33221", crDays: 7, limit: null, bills: 14, owed: 18750, onAcct: 0, buckets: [18750, 0, 0, 0, 0], overdue: 6250, oldest: 19, pdc: 0, flags: [] },
  { id: pid(8), name: "Anand Supermarket", area: "Trichy", phone: "98650 77889", crDays: 30, limit: null, bills: 0, owed: 0, onAcct: 15000, buckets: [0, 0, 0, 0, 0], overdue: 0, oldest: null, pdc: 0, flags: ["ADVANCE"] },
];

function partyRow(p: PartySpec) {
  return {
    partyId: p.id,
    name: p.name,
    area: p.area,
    phone: p.phone,
    creditDays: p.crDays,
    creditLimit: p.limit === null ? null : r(p.limit),
    bills: p.bills,
    owed: r(p.owed),
    onAccount: r(p.onAcct),
    net: sided(Math.round((p.owed - p.onAcct) * 100)),
    buckets: p.buckets.map(r),
    overdue: r(p.overdue),
    oldestDays: p.oldest,
    pdcInHand: r(p.pdc),
    flags: p.flags,
  };
}

function sum(specs: PartySpec[], pick: (p: PartySpec) => number): number {
  return specs.reduce((total, p) => total + Math.round(pick(p) * 100), 0);
}

function totalsOf(specs: PartySpec[]) {
  return {
    bills: specs.reduce((n, p) => n + p.bills, 0),
    owed: rupees(sum(specs, (p) => p.owed)),
    onAccount: rupees(sum(specs, (p) => p.onAcct)),
    net: sided(sum(specs, (p) => p.owed - p.onAcct)),
    buckets: LABELS.map((_, i) => rupees(sum(specs, (p) => p.buckets[i]))),
    overdue: rupees(sum(specs, (p) => p.overdue)),
    pdcInHand: rupees(sum(specs, (p) => p.pdc)),
  };
}

/** The mockup's six tiles. */
export const MOCKUP_TILES = {
  net: sided(sum(MOCKUP_PARTIES, (p) => p.owed - p.onAcct)),
  parties: 9,
  bills: 60,
  overdue: "403950.00",
  overduePctOfOwed: "57",
  aboveDays: { days: 90, amount: "128600.00", parties: 3 },
  onAccount: "21500.00",
  pdcInHand: { amount: "110000.00", cheques: 3 },
  dueNext: { days: 7, amount: "126450.00", from: "2026-09-26", to: "2026-10-02" },
};

/** `n` synthetic parties for the paging test, named so a name sort is checkable. */
export function manyParties(n: number): PartySpec[] {
  return Array.from({ length: n }, (_, i) => ({
    id: pid(1000 + i),
    name: `Party ${String(i + 1).padStart(4, "0")}`,
    area: "Trichy",
    phone: "",
    crDays: 30,
    limit: null,
    bills: 1,
    owed: 1000 + (n - i),
    onAcct: 0,
    buckets: [1000 + (n - i), 0, 0, 0, 0] as [number, number, number, number, number],
    overdue: 0,
    oldest: 10,
    pdc: 0,
    flags: [],
  }));
}

export type PartiesFixtureOpts = { parties?: PartySpec[]; bucketsShort?: boolean };

/**
 * `/parties`. Plays the server: it sorts by `sort`/`dir` (name or net; the
 * mockup's order is already net-descending), pages by `page`/`pageSize`, and
 * returns totals and tiles over ALL rows.
 */
export function partiesFixture(q: Q, opts: PartiesFixtureOpts = {}) {
  const specs = [...(opts.parties ?? MOCKUP_PARTIES)];
  const dir = q.dir === "asc" ? 1 : -1;
  if (q.sort === "name") specs.sort((a, b) => a.name.localeCompare(b.name) * dir);
  else if (opts.parties) specs.sort((a, b) => (a.owed - a.onAcct - (b.owed - b.onAcct)) * dir || a.name.localeCompare(b.name));
  const page = Number(q.page ?? 1);
  const pageSize = Number(q.pageSize ?? 200);
  const rows = specs.slice((page - 1) * pageSize, page * pageSize).map(partyRow);
  if (opts.bucketsShort && rows[0]) rows[0].buckets = rows[0].buckets.slice(0, 4);
  return envelope({
    ...head(q),
    tiles: opts.parties ? { ...MOCKUP_TILES, parties: specs.length, net: totalsOf(specs).net } : MOCKUP_TILES,
    rows,
    totals: totalsOf(specs),
    page: { page, pageSize, totalRows: specs.length },
  });
}

/* --------------------------------------------------------------- bills */

type BillSpec = {
  id: number;
  date: string;
  type: string;
  src: string | null;
  refno: string;
  branch: string;
  due: string | null;
  dueEff: string;
  amount: number;
  adjusted: number;
  side: "OWED" | "ON_ACCOUNT";
  age: number;
  overdue: number | null;
  remarks: string | null;
  tender?: boolean;
};

const billId = (n: number) => `88888888-8888-4888-8888-${String(888888888888 + n).padStart(12, "0")}`;

/** Sri Krishna Traders' nine open items on 25-09-2026. */
export const SKT_BILLS: BillSpec[] = [
  { id: 1, date: "2026-03-31", type: "OPENING", src: "OPENING_BALANCE", refno: "opn00028", branch: "Main Store", due: "2026-04-30", dueEff: "2026-04-30", amount: 60500, adjusted: 25000, side: "OWED", age: 178, overdue: 148, remarks: "part rct00002" },
  { id: 2, date: "2026-06-22", type: "SALES", src: "SALE_BILL", refno: "bil00361", branch: "Main Store", due: "2026-07-22", dueEff: "2026-07-22", amount: 38500, adjusted: 15000, side: "OWED", age: 95, overdue: 65, remarks: "part rct00002" },
  { id: 3, date: "2026-07-18", type: "SALES", src: "SALE_BILL", refno: "bil00377", branch: "Main Store", due: "2026-08-17", dueEff: "2026-08-17", amount: 18500, adjusted: 0, side: "OWED", age: 69, overdue: 39, remarks: "re-opened · chq bounced" },
  { id: 4, date: "2026-08-02", type: "SALES", src: "SALE_BILL", refno: "bil00398", branch: "Main Store", due: "2026-09-01", dueEff: "2026-09-01", amount: 32400, adjusted: 0, side: "OWED", age: 54, overdue: 24, remarks: "12 items" },
  { id: 5, date: "2026-08-11", type: "SALES", src: "SALE_BILL", refno: "bil00412", branch: "Main Store", due: "2026-09-10", dueEff: "2026-09-10", amount: 48600, adjusted: 500, side: "OWED", age: 45, overdue: 15, remarks: "disc jv00007" },
  { id: 6, date: "2026-08-24", type: "SALES", src: "SALE_BILL", refno: "bil00501", branch: "Karur", due: "2026-09-23", dueEff: "2026-09-23", amount: 12150, adjusted: 0, side: "OWED", age: 32, overdue: 2, remarks: null },
  { id: 7, date: "2026-08-28", type: "SALES_RETURN", src: "SALE_RETURN", refno: "crn00014", branch: "Main Store", due: null, dueEff: "2026-08-28", amount: 4000, adjusted: 0, side: "ON_ACCOUNT", age: 28, overdue: null, remarks: "on account" },
  { id: 8, date: "2026-09-02", type: "SALES", src: "SALE_BILL", refno: "bil00577", branch: "Main Store", due: "2026-10-02", dueEff: "2026-10-02", amount: 9800, adjusted: 0, side: "OWED", age: 23, overdue: null, remarks: null },
  { id: 9, date: "2026-09-09", type: "JOURNAL", src: "CHEQUE_BOUNCE_CHARGE", refno: "BNC/114402", branch: "Main Store", due: "2026-09-09", dueEff: "2026-09-09", amount: 350, adjusted: 0, side: "OWED", age: 16, overdue: 16, remarks: "bounce charge" },
];

function billRow(b: BillSpec) {
  return {
    billId: billId(b.id),
    accYear: b.date < FY.begin ? "2025-2026" : FY.accYear,
    branchName: b.branch,
    docDate: b.date,
    docRefno: b.refno,
    billType: b.type,
    srcDocType: b.src,
    srcDocId: billId(500 + b.id),
    srcAccYear: b.date < FY.begin ? "2025-2026" : FY.accYear,
    voucherId: billId(700 + b.id),
    side: b.side,
    dueDate: b.due,
    dueEff: b.dueEff,
    billAmount: r(b.amount),
    adjusted: r(b.adjusted),
    pending: r(b.amount - b.adjusted),
    ageDays: b.age,
    overdueDays: b.overdue,
    remarks: b.remarks,
    tenderDerived: b.tender === true,
  };
}

/** Signed net of a bill list, Dr positive on the Receivable side. */
function billsNet(bills: BillSpec[]): number {
  return bills.reduce(
    (total, b) => total + Math.round((b.amount - b.adjusted) * 100) * (b.side === "OWED" ? 1 : -1),
    0,
  );
}

function billTotals(bills: BillSpec[]) {
  const signed = (pick: (b: BillSpec) => number) =>
    bills.reduce((t, b) => t + Math.round(pick(b) * 100) * (b.side === "OWED" ? 1 : -1), 0);
  return {
    bills: bills.length,
    billAmount: rupees(signed((b) => b.amount)),
    adjusted: rupees(bills.reduce((t, b) => t + Math.round(b.adjusted * 100), 0)),
    net: sided(billsNet(bills)),
  };
}

/** One synthetic open bill for a party that is not Sri Krishna Traders. */
function genericBills(partyId: string): BillSpec[] {
  const spec = MOCKUP_PARTIES.find((p) => p.id === partyId);
  if (!spec) return [];
  const bills: BillSpec[] = [];
  if (spec.owed > 0) {
    bills.push({ id: 100 + MOCKUP_PARTIES.indexOf(spec), date: "2026-08-01", type: "SALES", src: "SALE_BILL", refno: `bil9${MOCKUP_PARTIES.indexOf(spec)}000`, branch: "Main Store", due: "2026-08-31", dueEff: "2026-08-31", amount: spec.owed, adjusted: 0, side: "OWED", age: 55, overdue: 25, remarks: null });
  }
  if (spec.onAcct > 0) {
    bills.push({ id: 200 + MOCKUP_PARTIES.indexOf(spec), date: "2026-09-01", type: "ADVANCE", src: "RECEIPT_ADVANCE", refno: `rct9${MOCKUP_PARTIES.indexOf(spec)}000`, branch: "Main Store", due: null, dueEff: "2026-09-01", amount: spec.onAcct, adjusted: 0, side: "ON_ACCOUNT", age: 24, overdue: null, remarks: "advance" });
  }
  return bills;
}

export type BillsFixtureOpts = { ledgerClosing?: { amount: string; side: Side | null } };

export function billsFixture(q: Q, opts: BillsFixtureOpts = {}) {
  const partyId = q.partyId;
  const bills = partyId === PARTY_SKT ? SKT_BILLS : genericBills(partyId);
  const totals = billTotals(bills);
  return envelope({
    ...head(q),
    partyId,
    rows: bills.map(billRow),
    totals,
    ledgerClosing: opts.ledgerClosing ?? totals.net,
  });
}

/* --------------------------------------------------------------- party */

export function partyFixture(q: Q) {
  const spec = MOCKUP_PARTIES.find((p) => p.id === q.partyId) ?? MOCKUP_PARTIES[0];
  const isSkt = spec.id === PARTY_SKT;
  const pdc = isSkt
    ? [{ pdcId: billId(900), accYear: FY.accYear, chequeNo: "114588", bank: "HDFC", chequeDate: "2026-09-30", amount: "20000.00", status: "HELD" }]
    : spec.pdc > 0
      ? [{ pdcId: billId(901), accYear: FY.accYear, chequeNo: "200100", bank: "SBI", chequeDate: "2026-10-05", amount: r(spec.pdc), status: "HELD" }]
      : [];
  const onAccountItems = isSkt
    ? [{ billId: billId(7), accYear: FY.accYear, docRefno: "crn00014", date: "2026-08-28", type: "SALES_RETURN", amount: "4000.00" }]
    : spec.onAcct > 0
      ? [{ billId: billId(200), accYear: FY.accYear, docRefno: "rct90000", date: "2026-09-01", type: "ADVANCE", amount: r(spec.onAcct) }]
      : [];
  return envelope({
    ...head(q),
    party: {
      partyId: spec.id,
      name: spec.name,
      ledgerGroup: isSkt ? "Sundry Debtors · Trichy route" : "Sundry Debtors",
      area: spec.area,
      phone: spec.phone,
      gstin: isSkt ? "33AAKFS4410M1ZQ" : null,
      creditDays: spec.crDays,
      creditLimit: spec.limit === null ? null : r(spec.limit),
      creditBillLimit: null,
      isDualRole: false,
    },
    ageing: { labels: LABELS, amounts: spec.buckets.map(r) },
    owed: r(spec.owed),
    onAccount: r(spec.onAcct),
    net: sided(Math.round((spec.owed - spec.onAcct) * 100)),
    onAccountItems,
    pdcInHand: pdc,
    pdcEffectiveUncleared: [],
    lastSettlement: isSkt
      ? { date: "2026-09-16", voucherId: billId(950), voucherAccYear: FY.accYear, voucherNo: "rct00017", voucherType: "Receipt", amount: "21200.00" }
      : null,
  });
}

/* ------------------------------------------------------- bill history */

export function billHistoryFixture(q: Q) {
  const spec = SKT_BILLS.find((b) => billId(b.id) === q.billId) ?? SKT_BILLS[0];
  return envelope({
    asOn: q.asOn ?? AS_ON,
    bill: {
      billId: billId(spec.id),
      accYear: q.accYear ?? FY.accYear,
      partyId: PARTY_SKT,
      docRefno: spec.refno,
      docDate: spec.date,
      billType: spec.type,
      side: spec.side === "OWED" ? "DR" : "CR",
      billAmount: r(spec.amount),
      pending: r(spec.amount - spec.adjusted),
    },
    rows: [
      { adjustmentId: billId(960), date: "2026-07-05", adjType: "ALLOCATION", voucherId: billId(961), voucherAccYear: FY.accYear, voucherNo: "rct00002", voucherType: "Receipt", againstDocRefno: null, amount: "18500.00", isReversal: false, reversalReason: null, isPostDated: false, chequeNo: "114402", effective: true },
      { adjustmentId: billId(962), date: "2026-07-05", adjType: "ALLOCATION", voucherId: billId(963), voucherAccYear: FY.accYear, voucherNo: "rct00002", voucherType: "Receipt", againstDocRefno: null, amount: "-18500.00", isReversal: true, reversalReason: "Cheque 114402 bounced: insufficient funds", isPostDated: false, chequeNo: "114402", effective: true },
      { adjustmentId: billId(964), date: "2026-09-30", adjType: "ALLOCATION", voucherId: billId(965), voucherAccYear: FY.accYear, voucherNo: "rct00021", voucherType: "Receipt", againstDocRefno: null, amount: "5000.00", isReversal: false, reversalReason: null, isPostDated: true, chequeNo: "114588", effective: false },
    ],
    tenderAtBill: spec.tender ? "500.00" : null,
  });
}

/* ------------------------------------------------------------ bill-wise */

export function billWiseFixture(q: Q) {
  const all = MOCKUP_PARTIES.flatMap((p) =>
    (p.id === PARTY_SKT ? SKT_BILLS : genericBills(p.id)).map((b) => ({ party: p, bill: b })),
  ).filter(({ bill }) => (q.dueOn ? bill.dueEff === q.dueOn && bill.side === "OWED" : true));
  const page = Number(q.page ?? 1);
  const pageSize = Number(q.pageSize ?? 200);
  const bills = all.map(({ bill }) => bill);
  return envelope({
    ...head(q),
    rows: all
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ party, bill }) => ({ ...billRow(bill), partyId: party.id, partyName: party.name, area: party.area })),
    totals: billTotals(bills),
    page: { page, pageSize, totalRows: all.length },
  });
}

/* -------------------------------------------------------------- summary */

export function summaryFixture(q: Q) {
  const groupBy = q.groupBy ?? "AREA";
  const keyOf = (p: PartySpec) => (groupBy === "AREA" ? p.area : groupBy === "BRANCH" ? "Main Store" : "Sundry Debtors");
  const groups = new Map<string, PartySpec[]>();
  for (const p of MOCKUP_PARTIES) {
    const k = keyOf(p) ?? "(no area)";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const rowOf = (specs: PartySpec[]) => {
    const t = totalsOf(specs);
    return { parties: specs.length, owed: t.owed, onAccount: t.onAccount, net: t.net, buckets: t.buckets, overdue: t.overdue };
  };
  const rows = [...groups.entries()]
    .map(([name, specs]) => ({
      key: name === "Trichy" ? AREA_TRICHY : name === "Karur" ? AREA_KARUR : `99999999-9999-4999-8999-${String(name.length).padStart(12, "0")}`,
      name,
      ...rowOf(specs),
    }))
    .sort((a, b) => Number(b.net.amount) - Number(a.net.amount));
  return envelope({ ...head(q), groupBy, rows, totals: rowOf(MOCKUP_PARTIES) });
}

/* --------------------------------------------------------- due calendar */

export function dueCalendarFixture(q: Q) {
  return envelope({
    asOn: q.asOn ?? AS_ON,
    side: q.side ?? "RECEIVABLE",
    from: q.from,
    to: q.to,
    days: [
      { date: "2026-09-26", amount: "18200.00", bills: 3, parties: 2 },
      { date: "2026-09-28", amount: "42500.00", bills: 5, parties: 3 },
      { date: "2026-09-30", amount: "55950.00", bills: 6, parties: 4 },
      { date: "2026-10-02", amount: "9800.00", bills: 1, parties: 1 },
      { date: "2026-10-10", amount: "64000.00", bills: 7, parties: 5 },
      { date: "2026-10-18", amount: "12500.00", bills: 2, parties: 2 },
    ].filter((d) => (!q.from || d.date >= q.from) && (!q.to || d.date <= q.to)),
    overdueBefore: { amount: "403950.00", bills: 41 },
  });
}

/* --------------------------------------------------------------- export */

export function exportFixture(q: Q) {
  const common = {
    ...head(q),
    printedAs: "Receivable · all branches · as on 25-09-2026 · Sundry Debtors (+ sub-groups) · aged by bill date",
    companyName: "Acme Foods Pvt Ltd",
    branchName: null,
  };
  if (q.shape === "BILLS") {
    const data = billWiseFixture(q).data;
    return envelope({ ...common, shape: "BILLS", rows: data.rows, totals: data.totals, totalRows: data.page.totalRows });
  }
  if (q.shape === "PARTY_STATEMENT") {
    const card = partyFixture(q).data;
    const bills = billsFixture(q).data;
    return envelope({
      ...common,
      shape: "PARTY_STATEMENT",
      party: card.party,
      rows: bills.rows,
      totals: bills.totals,
      ageing: card.ageing,
      owed: card.owed,
      onAccount: card.onAccount,
      net: card.net,
      pdcInHand: card.pdcInHand,
      totalRows: bills.rows.length,
    });
  }
  const data = partiesFixture({ ...q, page: "1", pageSize: "20000" }).data;
  return envelope({ ...common, shape: "PARTIES", rows: data.rows, totals: data.totals, tiles: data.tiles, totalRows: data.page.totalRows });
}

/* -------------------------------------------------------------- options */

export function optionsFixture(q: Q) {
  const receivable = q.side !== "PAYABLE";
  return envelope({
    groups: receivable
      ? [
          { groupId: GROUP_DEBTORS, name: "Sundry Debtors", depth: 0, isDefault: true },
          { groupId: GROUP_TRICHY, name: "Trichy route", depth: 1, isDefault: false },
        ]
      : [{ groupId: GROUP_CREDITORS, name: "Sundry Creditors", depth: 0, isDefault: true }],
    areas: receivable
      ? [
          { areaId: AREA_TRICHY, name: "Trichy", collectionDays: ["MON", "THU"] },
          { areaId: AREA_KARUR, name: "Karur", collectionDays: ["WED"] },
        ]
      : [],
    salesmen: receivable ? [{ salesmanId: SALESMAN_RAVI, name: "Ravi" }] : [],
    branches: [
      { branchId: BRANCH_MAIN, name: "Main Store" },
      { branchId: BRANCH_KARUR, name: "Karur" },
    ],
  });
}

/** A 422 the way the server's global filter wraps it. */
export function refusal(code: string, field: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    status: 422,
    data: {
      success: false,
      statusCode: 422,
      message: { success: false, message: "Party-wise outstanding request refused", errors: [{ field, code, message, ...extra }] },
      path: "/api/v1/reports/party-outstanding/parties",
    },
  };
}
