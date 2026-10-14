import { describe, expect, it } from "vitest";
import {
  LIVE_LINE_READING,
  LIVE_STATUSES,
  cashExpectedOf,
  liveCashByTss,
  liveCashFigure,
  liveGridParams,
  liveLine,
  liveSessionsOf,
  liveTotalPaise,
  readLiveCash,
  type LiveCashReader,
  type LiveSession,
} from "./live-cash";
import type { GridRow, TillSessionKey, TillSessionPayload, TillSessionTender } from "./wire/types";

const SCOPE = { companyId: "co", branchId: "br" };

function row(over: GridRow): GridRow {
  return {
    tss_id: "t1",
    tss_company_id: "co",
    tss_branch_id: "br",
    tss_acc_year: "2026-2027",
    tss_session_no: "C01-261014-01",
    counter_code: "C01",
    cashier: "RAVI K",
    tss_status: "OPEN",
    ...over,
  };
}

function live(over: Partial<LiveSession> & { tssId?: string }): LiveSession {
  const { tssId = "t1", ...rest } = over;
  return {
    key: { companyId: "co", branchId: "br", accYear: "2026-2027", tssId },
    sessionNo: "C01-261014-01",
    counter: "C01",
    cashier: "RAVI K",
    status: "OPEN",
    businessDate: "2026-10-14",
    cashPaise: 745000,
    ...rest,
  };
}

function payload(tenders: Partial<TillSessionTender>[]): TillSessionPayload {
  return { tenders } as unknown as TillSessionPayload;
}

describe("the grid read", () => {
  it("sends every token, the dates blank, once per live status", () => {
    expect(LIVE_STATUSES).toEqual(["OPEN", "SUSPENDED", "COUNTING", "PENDING_APPROVAL"]);
    expect(liveGridParams(SCOPE, "COUNTING")).toEqual({
      icompany_id: "co",
      ibranch_id: "br",
      ifrom_date: "",
      ito_date: "",
      istatus: "COUNTING",
      ivariance: "",
    });
  });

  it("reads grid 144's rows on their own year, once per session", () => {
    const sessions = liveSessionsOf(
      [
        row({ tss_acc_year: "2025-2026", tss_company_id: null, tss_branch_id: "", business_date: "31-03-2026" }),
        row({ tss_status: "SUSPENDED" }), // moved status between the reads: the same drawer
        row({ tss_id: "" }),
        row({ tss_id: "t2", tss_session_no: "C02-261013-01", cashier: "MEENA T", tss_status: "PENDING_APPROVAL" }),
      ],
      SCOPE,
    );
    expect(sessions).toEqual([
      {
        key: { companyId: "co", branchId: "br", accYear: "2025-2026", tssId: "t1" },
        sessionNo: "C01-261014-01",
        counter: "C01",
        cashier: "RAVI K",
        status: "OPEN",
        businessDate: "2026-03-31",
        cashPaise: null,
      },
      {
        key: { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "t2" },
        sessionNo: "C02-261013-01",
        counter: "C01",
        cashier: "MEENA T",
        status: "PENDING_APPROVAL",
        businessDate: "",
        cashPaise: null,
      },
    ]);
  });
});

describe("the cash", () => {
  it("is the CASH tender's expected, by type or by name", () => {
    expect(cashExpectedOf(payload([{ tenderTypeId: 2, expected: 99 }, { tenderTypeId: 1, expected: 7450.5 }]))).toBe(
      745050,
    );
    expect(cashExpectedOf(payload([{ tenderTypeId: 9, tenderTypeName: "CASH", expected: 100 }]))).toBe(10000);
  });

  it("is hidden when the server leaves it out, or there is no cash line", () => {
    expect(cashExpectedOf(payload([{ tenderTypeId: 1, expected: null }]))).toBeNull();
    expect(cashExpectedOf(payload([{ tenderTypeId: 2, tenderTypeName: "CARD", expected: 50 }]))).toBeNull();
    expect(cashExpectedOf(payload([]))).toBeNull();
    expect(cashExpectedOf(null)).toBeNull();
  });

  it("adds up the known ones only, and maps them by session", () => {
    const sessions = [live({}), live({ tssId: "t2", cashPaise: null }), live({ tssId: "t3", cashPaise: 50 })];
    expect(liveTotalPaise(sessions)).toBe(745050);
    expect([...liveCashByTss(sessions)]).toEqual([
      ["t1", 745000],
      ["t3", 50],
    ]);
    expect(liveCashFigure(sessions[0])).toBe("₹ 7,450.00");
    expect(liveCashFigure(sessions[1])).toBe("cash hidden");
  });
});

describe("the line", () => {
  it("says it is reading before the first answer", () => {
    expect(liveLine(null)).toEqual({ text: LIVE_LINE_READING, title: "" });
  });

  it("says when no drawer is out", () => {
    expect(liveLine([])).toEqual({ text: "No live session", title: "No drawer is out at this branch." });
  });

  it("counts the sessions and the cash in Indian figures", () => {
    expect(liveLine([live({ cashPaise: 12345650 })]).text).toBe(
      "● 1 live session · cash in tills ₹ 1,23,456.50",
    );
  });

  it("says how many it may not show, and lists each one in the tooltip", () => {
    const line = liveLine([
      live({}),
      live({ tssId: "t2", sessionNo: "C02-261013-01", cashier: "MEENA T", status: "PENDING_APPROVAL", cashPaise: null }),
    ]);
    expect(line.text).toBe(
      "● 2 live sessions · cash in tills ₹ 7,450.00  (1 not shown — needs Till Sessions override)",
    );
    expect(line.title).toBe(
      "C01-261014-01 · RAVI K · OPEN · ₹ 7,450.00\nC02-261013-01 · MEENA T · PENDING APPROVAL · cash hidden",
    );
  });
});

describe("readLiveCash", () => {
  function reader(
    rows: Record<string, GridRow[] | Error>,
    expected: (key: TillSessionKey) => Promise<TillSessionPayload>,
  ): LiveCashReader & { grids: Record<string, string>[]; asked: TillSessionKey[] } {
    const grids: Record<string, string>[] = [];
    const asked: TillSessionKey[] = [];
    return {
      grids,
      asked,
      gridRows: async (grid, params) => {
        expect(grid).toBe("tillSessionList");
        grids.push(params);
        const answer = rows[params.istatus] ?? [];
        if (answer instanceof Error) throw answer;
        return answer;
      },
      expected: (key) => {
        asked.push(key);
        return expected(key);
      },
    };
  }

  it("reads each status, then each session's cash on its own year", async () => {
    const fake = reader(
      {
        OPEN: [row({})],
        COUNTING: [row({ tss_id: "t2", tss_acc_year: "2025-2026", tss_status: "COUNTING" })],
      },
      async (key) => payload([{ tenderTypeId: 1, expected: key.tssId === "t1" ? 1000 : 250.25 }]),
    );
    const found = await readLiveCash(fake, SCOPE);
    expect(fake.grids.map((params) => params.istatus)).toEqual([...LIVE_STATUSES]);
    expect(fake.asked).toEqual([
      { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "t1" },
      { companyId: "co", branchId: "br", accYear: "2025-2026", tssId: "t2" },
    ]);
    expect(found?.map((session) => [session.key.tssId, session.status, session.cashPaise])).toEqual([
      ["t1", "OPEN", 100000],
      ["t2", "COUNTING", 25025],
    ]);
  });

  it("keeps a refused cash hidden, and a failed status out, without throwing", async () => {
    const fake = reader(
      { OPEN: [row({}), row({ tss_id: "t2" })], SUSPENDED: new Error("500") },
      async (key) => {
        if (key.tssId === "t2") throw { status: 403, data: { message: "Forbidden" } };
        return payload([{ tenderTypeId: 1, expected: 10 }]);
      },
    );
    const found = await readLiveCash(fake, SCOPE);
    expect(found?.map((session) => session.cashPaise)).toEqual([1000, null]);
  });

  it("stops when the caller has moved on", async () => {
    let current = true;
    const fake = reader({ OPEN: [row({})] }, async () => payload([{ tenderTypeId: 1, expected: 10 }]));
    const pending = readLiveCash(fake, SCOPE, () => current);
    current = false;
    expect(await pending).toBeNull();
    expect(fake.asked).toEqual([]);
  });
});
