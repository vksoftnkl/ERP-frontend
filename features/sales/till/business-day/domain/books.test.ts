import { describe, expect, it } from "vitest";

import type { LiveSession } from "../../shared/live-cash";
import {
  booksChecks,
  cashBooksOf,
  cashTenderOf,
  isTodaysDay,
  safeBooksOf,
  type BooksInput,
  type CashBooks,
  type SafeBook,
} from "./books";
import { checkLines } from "./day-reading";
import type { TillDay } from "./wire";

/** 16-10-2026, mid-afternoon: the day of the Qt commit. */
const NOW = new Date(2026, 9, 16, 15, 30);

const DAY: TillDay = {
  tbdId: "d1",
  tbdAccYear: "2026-2027",
  tbdCompanyId: "c1",
  tbdBranchId: "b1",
  tbdBusinessDate: "2026-10-16",
  tbdStatus: "OPEN",
  tbdOpenedOn: new Date(2026, 9, 16, 8, 58).toISOString(),
  tbdOpenedBy: "u1",
  tbdClosedOn: null,
  tbdClosedByName: "",
  tbdZNo: "",
  tbdReopenCount: 0,
  sessions: [],
  handoverReceipt: "NONE",
  awaitingReceipt: { thisDay: 0, earlierDays: 0, oldestOn: null },
  safe: null,
};

const PAST_DAY: TillDay = { ...DAY, tbdId: "d0", tbdBusinessDate: "2026-10-15" };

function live(tssId: string, cashPaise: number | null): LiveSession {
  return {
    key: { companyId: "c1", branchId: "b1", accYear: "2026-2027", tssId },
    sessionNo: tssId,
    counter: "C01",
    cashier: "RAVI K",
    status: "OPEN",
    businessDate: "2026-10-16",
    cashPaise,
  };
}

/** Cash In Hand, 12,450.00 Dr. */
const CASH: CashBooks = { ledgerName: "CASH IN HAND", paise: BigInt(1245000) };

/** Two drawers: 7,450.00 + 5,000.00 = 12,450.00. */
const DRAWERS = [live("C01-261016-01", 745000), live("C02-261016-01", 500000)];

const SAFE_OK: SafeBook = {
  name: "Main safe",
  bookBalance: BigInt(12050000),
  expected: BigInt(12050000),
  drift: BigInt(0),
};

function input(over: Partial<BooksInput> = {}): BooksInput {
  return { day: DAY, now: NOW, cash: CASH, live: DRAWERS, safes: [SAFE_OK], ...over };
}

describe("reading the books", () => {
  it("takes the first cash tender that names a ledger, in the server's order", () => {
    const raw = {
      success: true,
      data: {
        companyId: "c1",
        tenders: [
          { tenderId: "t-upi", name: "UPI", isCash: false, ledgerId: "l-upi", ledgerName: "UPI CLEARING" },
          { tenderId: "t-x", name: "CASH (old)", isCash: true, ledgerId: "", ledgerName: "" },
          { tenderId: "t-cash", name: "CASH", isCash: true, ledgerId: "l-cash", ledgerName: "CASH IN HAND" },
          { tenderId: "t-cash2", name: "CASH 2", isCash: true, ledgerId: "l-cash2", ledgerName: "PETTY CASH" },
        ],
      },
    };
    expect(cashTenderOf(raw)).toEqual({ ledgerId: "l-cash", ledgerName: "CASH IN HAND" });
    // The vouchers API hands over `data` already: the same answer.
    expect(cashTenderOf(raw.data)).toEqual({ ledgerId: "l-cash", ledgerName: "CASH IN HAND" });
  });

  it("finds no cash ledger when no cash tender names one", () => {
    expect(cashTenderOf({ data: { tenders: [{ isCash: true, ledgerId: "" }] } })).toBeNull();
    expect(cashTenderOf({ data: { tenders: [] } })).toBeNull();
    expect(cashTenderOf(null)).toBeNull();
  });

  it("reads a CR balance as a minus, to the paisa", () => {
    expect(cashBooksOf("CASH IN HAND", { ledgerId: "l", asOn: "2026-10-16", amount: 12450, side: "DR" })).toEqual({
      ledgerName: "CASH IN HAND",
      paise: BigInt(1245000),
    });
    expect(cashBooksOf("CASH IN HAND", { amount: "300.5", side: "CR" })?.paise).toBe(BigInt(-30050));
    expect(cashBooksOf("CASH IN HAND", { amount: null, side: "DR" })).toBeNull();
  });

  it("keeps each safe's name and its three figures; hidden ones stay null", () => {
    const raw = {
      success: true,
      data: {
        figuresVisible: false,
        safes: [
          { safeId: "s1", code: "S01", name: "Main safe", bookBalance: 120500, expected: "120400.00", drift: 100 },
          { safeId: "s2", code: "S02", name: "", bookBalance: null, expected: null, drift: null },
        ],
      },
    };
    expect(safeBooksOf(raw)).toEqual([
      { name: "Main safe", bookBalance: BigInt(12050000), expected: BigInt(12040000), drift: BigInt(10000) },
      { name: "S02", bookBalance: null, expected: null, drift: null },
    ]);
    expect(safeBooksOf({ data: {} })).toEqual([]);
  });

  it("calls a day today by the calendar date", () => {
    expect(isTodaysDay(DAY, NOW)).toBe(true);
    expect(isTodaysDay(PAST_DAY, NOW)).toBe(false);
    expect(isTodaysDay({ ...DAY, tbdBusinessDate: "" }, NOW)).toBe(true);
  });
});

describe("Books = drawers", () => {
  it("is green when the cash ledger is what the drawers should hold", () => {
    expect(checkLines(booksChecks(input({ safes: null })))).toEqual([
      "GREEN Books = drawers — CASH IN HAND 12,450.00 = cash in the drawers",
    ]);
  });

  it("is amber, with the gap posted outside the till, when they differ", () => {
    const short = booksChecks(input({ cash: { ledgerName: "CASH IN HAND", paise: BigInt(1295000) }, safes: null }));
    expect(checkLines(short)).toEqual([
      "AMBER Books = drawers — CASH IN HAND says 12,950.00, the drawers should hold 12,450.00 — " +
        "500.00 posted outside the till",
    ]);
    expect(short[0].action).toBeUndefined();
    // A CR cash ledger (more paid out of the books than came in) reads with its minus.
    const credit = booksChecks(input({ cash: { ledgerName: "", paise: BigInt(-20000) }, live: [], safes: null }));
    expect(credit[0].detail).toBe(
      "Cash ledger says -200.00, the drawers should hold 0.00 — -200.00 posted outside the till",
    );
  });

  it("is grey when a drawer's cash is hidden from this user", () => {
    const hidden = booksChecks(input({ live: [...DRAWERS, live("C03-261016-01", null)], safes: null }));
    expect(checkLines(hidden)).toEqual([
      "LATER Books = drawers — CASH IN HAND 12,450.00 — a drawer's cash is hidden (needs the Till Sessions override)",
    ]);
  });

  it("waits, with no row, until the ledger and the live drawers are both read", () => {
    expect(booksChecks(input({ cash: null, safes: null }))).toEqual([]);
    expect(booksChecks(input({ live: null, safes: null }))).toEqual([]);
  });

  it("is checked on today's day only", () => {
    expect(checkLines(booksChecks(input({ day: PAST_DAY, safes: null })))).toEqual([
      "LATER Books = drawers — Checked on today's day only (the books are read as of now)",
    ]);
    // Even before anything is read: the answer would not be about that day.
    expect(booksChecks(input({ day: PAST_DAY, cash: null, live: null, safes: null }))).toHaveLength(1);
  });

  it("says nothing without a day", () => {
    expect(booksChecks(input({ day: null }))).toEqual([]);
  });
});

describe("Books = safe", () => {
  it("is green when every safe's ledger is its safe book", () => {
    expect(checkLines(booksChecks(input({ cash: null })))).toEqual([
      "GREEN Books = safe — Every safe's ledger = its safe book",
    ]);
  });

  it("names every safe that drifted, with the Cash Office's count", () => {
    const drifted: SafeBook[] = [
      { name: "Main safe", bookBalance: BigInt(12150000), expected: BigInt(12050000), drift: BigInt(100000) },
      SAFE_OK,
      { name: "Drop safe", bookBalance: BigInt(0), expected: BigInt(50000), drift: BigInt(-50000) },
    ];
    const [row] = booksChecks(input({ cash: null, safes: drifted }));
    expect(checkLines([row])).toEqual([
      "AMBER Books = safe — Main safe: ledger 1,21,500.00, safe book 1,20,500.00; " +
        "Drop safe: ledger 0.00, safe book 500.00",
    ]);
    expect(row.action).toEqual({ label: "Cash Office  →", session: null, href: "/sales/till/cash-office?tab=count" });
  });

  it("reads a drift under half a paisa as none", () => {
    // `toPaise` rounds the third decimal: 0.004 is no paisa, 0.005 is one (Qt `qAbs(drift) >= 0.005`).
    const tiny = safeBooksOf({ data: { safes: [{ name: "Main safe", bookBalance: 1, expected: 1, drift: 0.004 }] } });
    expect(booksChecks(input({ cash: null, safes: tiny }))[0].tone).toBe("green");
    const half = safeBooksOf({ data: { safes: [{ name: "Main safe", bookBalance: 1, expected: 1, drift: 0.005 }] } });
    expect(booksChecks(input({ cash: null, safes: half }))[0].tone).toBe("amber");
  });

  it("is grey, not a false green, when the figures are hidden (a blind count)", () => {
    const hidden: SafeBook[] = [{ name: "Main safe", bookBalance: null, expected: null, drift: null }];
    expect(checkLines(booksChecks(input({ cash: null, safes: hidden })))).toEqual([
      "LATER Books = safe — The safe's figures are hidden (a blind count: needs the Cash Office or Till Sessions override)",
    ]);
  });

  it("is checked on a past day too, and needs a safe to say anything", () => {
    expect(booksChecks(input({ day: PAST_DAY })).map((check) => check.title)).toEqual([
      "Books = drawers",
      "Books = safe",
    ]);
    expect(booksChecks(input({ cash: null, safes: [] }))).toEqual([]);
    expect(booksChecks(input({ cash: null, safes: null }))).toEqual([]);
  });
});
