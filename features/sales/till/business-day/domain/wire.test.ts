import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  businessDateAt,
  checkOfDay,
  clockOf,
  cockpitHref,
  compactDate,
  dayKeyOf,
  dayPickOf,
  dayQuery,
  daysGridParams,
  displayDate,
  errorStatus,
  firstErrorOf,
  listOf,
  parseCloseCheck,
  parseCloseResult,
  parseDay,
  parseGridPage,
  parseReopenResult,
  parseSupervisors,
  safesGridParams,
  sessionGridParams,
  sessionKeysOf,
  tillDayErrorText,
} from "./wire";

const PAYLOAD = {
  success: true,
  message: "Business day 2026-10-07 is OPEN",
  data: {
    tbdId: "019c-day",
    tbdAccYear: "2026-2027",
    tbdCompanyId: "c1",
    tbdBranchId: "b1",
    tbdBusinessDate: "2026-10-07",
    tbdStatus: "OPEN",
    tbdOpenedOn: "2026-10-07T03:28:00.000Z",
    tbdOpenedBy: "u1",
    tbdClosedOn: null,
    tbdZNo: null,
    tbdReopenCount: 0,
    sessions: [
      { status: "CLOSED", count: 4 },
      { status: "PENDING_APPROVAL", count: 1 },
    ],
  },
};

describe("parseDay", () => {
  it("reads TillDayPayload out of the success body", () => {
    const day = parseDay(PAYLOAD);
    expect(day).not.toBeNull();
    expect(day?.tbdId).toBe("019c-day");
    expect(day?.tbdBusinessDate).toBe("2026-10-07");
    expect(day?.tbdZNo).toBe("");
    expect(day?.tbdClosedOn).toBeNull();
    expect(day?.tbdClosedByName).toBe("");
    expect(day?.sessions).toEqual([
      { status: "CLOSED", count: 4 },
      { status: "PENDING_APPROVAL", count: 1 },
    ]);
    // A server before notes 113: no receipt, nothing waiting.
    expect(day?.handoverReceipt).toBe("");
    expect(day?.awaitingReceipt).toEqual({ thisDay: 0, earlierDays: 0, oldestOn: null });
    // A server before notes 118: no safe figures.
    expect(day?.safe).toBeNull();
  });

  it("reads the day's safe figures in paise (notes 118)", () => {
    const safe = (block: unknown) => parseDay({ data: { ...PAYLOAD.data, safe: block } })?.safe;
    expect(
      safe({
        opening: 95000,
        expected: 120500.5,
        counted: null,
        remitted: 50000,
        belowZero: false,
        awaitingOpening: 0,
        awaiting: 0,
      }),
    ).toEqual({ opening: BigInt(9500000), expected: BigInt(12050050), counted: null, remitted: BigInt(5000000) });
    expect(safe({ opening: 0, expected: 1200, counted: 1199.99, remitted: 0 })?.counted).toBe(BigInt(119999));
    // Counted zero is a count, not "not yet".
    expect(safe({ expected: 0, counted: 0 })?.counted).toBe(BigInt(0));
    expect(safe({})).toBeNull();
    expect(safe(null)).toBeNull();
  });

  it("reads who closed the day and the cash waiting for approval (notes 113 / 117)", () => {
    const day = parseDay({
      data: {
        ...PAYLOAD.data,
        tbdStatus: "CLOSED",
        tbdClosedOn: "2026-10-07T17:12:00.000Z",
        tbdClosedByName: "MEENA T",
        tbdZNo: 3,
        handoverReceipt: "required",
        awaitingReceipt: { thisDay: 2, earlierDays: "1", oldestOn: "2026-10-06T12:47:09.276Z" },
      },
    });
    expect(day?.tbdClosedByName).toBe("MEENA T");
    expect(day?.tbdZNo).toBe("3");
    expect(day?.handoverReceipt).toBe("REQUIRED");
    expect(day?.awaitingReceipt).toEqual({ thisDay: 2, earlierDays: 1, oldestOn: "2026-10-06T12:47:09.276Z" });
  });

  it("keeps a Z number as text", () => {
    expect(parseDay({ data: { ...PAYLOAD.data, tbdZNo: 12 } })?.tbdZNo).toBe("12");
  });

  it("refuses what is not a day", () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay({ success: true, data: { tbdId: "" } })).toBeNull();
    expect(parseDay({ success: true, data: { tbdId: "x", tbdBusinessDate: "07-10-2026" } })).toBeNull();
  });
});

describe("parseGridPage", () => {
  it("reads items and the total two levels down", () => {
    const page = parseGridPage({
      success: true,
      data: { items: [{ a: 1 }, "junk"], meta: { page: 1, limit: 100, total: "41" } },
    });
    expect(page.items).toEqual([{ a: 1 }]);
    expect(page.total).toBe(41);
  });

  it("tolerates a missing meta", () => {
    expect(parseGridPage({ data: { items: [] } })).toEqual({ items: [], total: null });
    expect(parseGridPage(undefined)).toEqual({ items: [], total: null });
  });
});

describe("grid tokens", () => {
  const scope = { companyId: "c1", branchId: "b1" };

  it("sends every token of TILL DAY SESSIONS, blank for any", () => {
    expect(sessionGridParams(scope, "2026-10-07")).toEqual({
      icompany_id: "c1",
      ibranch_id: "b1",
      ifrom_date: "2026-10-07",
      ito_date: "2026-10-07",
      istatus: "",
      ivariance: "",
    });
  });

  it("lists the last 90 days", () => {
    expect(daysGridParams(scope, "2026-10-10")).toEqual({
      icompany_id: "c1",
      ibranch_id: "b1",
      ifrom_date: "2026-07-12",
      ito_date: "2026-10-10",
    });
  });

  it("reads the branch's safes", () => {
    expect(safesGridParams(scope)).toEqual({ icompany_id: "c1", ibranch_id: "b1" });
  });

  it("asks for today with no id, and for a day with its year", () => {
    expect(dayQuery(scope)).toEqual({ companyId: "c1", branchId: "b1" });
    expect(dayQuery(scope, null)).toEqual({ companyId: "c1", branchId: "b1" });
    expect(dayQuery(scope, { tbdId: "d1", accYear: "2026-2027 " })).toEqual({
      companyId: "c1",
      branchId: "b1",
      tbdId: "d1",
      accYear: "2026-2027",
    });
  });
});

describe("rows", () => {
  it("opens a session's cockpit by its own keys, each encoded", () => {
    const keys = sessionKeysOf({
      tss_id: "s/1",
      tss_company_id: "c1",
      tss_branch_id: "b1",
      tss_acc_year: "2026-2027 ",
    });
    expect(keys).toEqual({ companyId: "c1", branchId: "b1", accYear: "2026-2027", tssId: "s/1" });
    expect(cockpitHref(keys!)).toBe("/sales/till/sessions/c1/b1/2026-2027/s%2F1");
  });

  it("has no cockpit for a row without its keys", () => {
    expect(sessionKeysOf({ tss_id: "s1" })).toBeNull();
    expect(sessionKeysOf(null)).toBeNull();
  });

  it("opens a day from the List tab by id and year", () => {
    expect(dayPickOf({ tbd_id: "d1", tbd_acc_year: "2026-2027" })).toEqual({ tbdId: "d1", accYear: "2026-2027" });
    expect(dayPickOf({ tbd_id: "d1" })).toBeNull();
  });
});

describe("errors", () => {
  it("reads the till filter's flat body", () => {
    const error = {
      status: 409,
      data: {
        success: false,
        message: "2026-2027 has no till / voucher partitions.",
        errors: [
          {
            field: "businessDate",
            code: "TILL_YEAR_NOT_SET_UP",
            message: "2026-2027 has no till / voucher partitions.",
          },
        ],
      },
    };
    expect(errorStatus(error)).toBe(409);
    expect(tillDayErrorText(error, "x")).toBe("2026-2027 has no till / voucher partitions.");
  });

  it("reads the global filter's nested body", () => {
    const error = {
      status: 403,
      data: {
        statusCode: 403,
        message: { message: "Forbidden", errors: [{ field: "menu", message: "No CREATE on 274" }] },
      },
    };
    expect(tillDayErrorText(error, "x")).toBe("Forbidden\nNo CREATE on 274");
  });

  it("falls back when there is nothing to say", () => {
    expect(tillDayErrorText({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" }, "x")).toBe(
      "TypeError: Failed to fetch",
    );
    expect(tillDayErrorText(null, "The business day could not be read.")).toBe("The business day could not be read.");
    expect(errorStatus({ status: "FETCH_ERROR" })).toBeNull();
  });
});

describe("dates", () => {
  it("shows and shifts calendar dates", () => {
    expect(displayDate("2026-10-07")).toBe("07-10-2026");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("reads a clock in local time, 12-hour (Qt hh:mm AP)", () => {
    expect(clockOf(new Date(2026, 9, 7, 8, 58).toISOString())).toBe("08:58 AM");
    expect(clockOf(new Date(2026, 9, 7, 0, 30).toISOString())).toBe("12:30 AM");
    expect(clockOf(new Date(2026, 9, 7, 14, 5).toISOString())).toBe("02:05 PM");
    expect(clockOf("")).toBe("");
    expect(clockOf(null)).toBe("");
    expect(clockOf("not a time")).toBe("");
  });

  it("packs a date for a file name", () => {
    expect(compactDate("2026-10-07")).toBe("20261007");
    expect(compactDate("")).toBe("");
  });

  it("puts the small hours on yesterday's business date", () => {
    expect(businessDateAt(new Date(2026, 9, 8, 0, 40), "04:00")).toBe("2026-10-07");
    expect(businessDateAt(new Date(2026, 9, 8, 4, 0), "04:00")).toBe("2026-10-08");
    expect(businessDateAt(new Date(2026, 9, 8, 5, 10), "05:30")).toBe("2026-10-07");
    // Unread or malformed: the server's default 04:00.
    expect(businessDateAt(new Date(2026, 9, 8, 3, 59), null)).toBe("2026-10-07");
    expect(businessDateAt(new Date(2026, 9, 8, 12, 0), "noon")).toBe("2026-10-08");
  });
});

describe("the close (notes 117)", () => {
  const DAY = parseDay(PAYLOAD)!;
  const CHECK = {
    success: true,
    message: "Business day 2026-10-07 has items open",
    data: {
      tbdId: "019c-day",
      tbdAccYear: "2026-2027",
      tbdBusinessDate: "2026-10-07",
      tbdStatus: "OPEN",
      items: [
        { code: "SESSIONS_LIVE", tone: "RED", count: 1, detail: "1 session(s) still open", sessionIds: ["s1"] },
        { code: "HELD_BILLS", tone: "amber", count: "2", detail: "2 held bills", sessionIds: null },
        { code: "SLIP_GAPS", tone: "GREEN", count: 0, detail: "No slip gap is open", sessionIds: [] },
      ],
      canClose: false,
      canCloseWithException: true,
    },
  };

  it("keys the day by its own company, branch and year", () => {
    expect(dayKeyOf(DAY, { companyId: "header-c", branchId: "header-b" })).toEqual({
      companyId: "c1",
      branchId: "b1",
      accYear: "2026-2027",
      tbdId: "019c-day",
    });
    expect(dayKeyOf({ ...DAY, tbdCompanyId: "", tbdBranchId: "" }, { companyId: "hc", branchId: "hb" })).toEqual({
      companyId: "hc",
      branchId: "hb",
      accYear: "2026-2027",
      tbdId: "019c-day",
    });
  });

  it("reads the close-check", () => {
    const check = parseCloseCheck(CHECK);
    expect(check?.tbdId).toBe("019c-day");
    expect(check?.canClose).toBe(false);
    expect(check?.canCloseWithException).toBe(true);
    expect(check?.items).toEqual([
      { code: "SESSIONS_LIVE", tone: "RED", count: 1, detail: "1 session(s) still open", sessionIds: ["s1"] },
      { code: "HELD_BILLS", tone: "AMBER", count: 2, detail: "2 held bills", sessionIds: [] },
      { code: "SLIP_GAPS", tone: "GREEN", count: 0, detail: "No slip gap is open", sessionIds: [] },
    ]);
    expect(parseCloseCheck({ data: { tbdId: "x" } })).toBeNull();
    expect(parseCloseCheck(null)).toBeNull();
  });

  it("lets a check speak only for its own day", () => {
    const check = parseCloseCheck(CHECK);
    expect(checkOfDay(check, DAY)).toBe(check);
    expect(checkOfDay(check, { ...DAY, tbdId: "other" })).toBeNull();
    expect(checkOfDay(check, null)).toBeNull();
    expect(checkOfDay(null, DAY)).toBeNull();
  });

  it("reads the close's store Z and force-closed sessions", () => {
    const closed = parseCloseResult({
      success: true,
      data: {
        day: { ...PAYLOAD.data, tbdStatus: "CLOSED", tbdZNo: 7 },
        zNo: 7,
        tapId: "tap",
        closedOver: [],
        forceClosed: [{ tssId: "s1", tssAccYear: "2026-2027", sessionNo: "C01" }],
      },
    });
    expect(closed.zNo).toBe("7");
    expect(closed.day?.tbdStatus).toBe("CLOSED");
    expect(closed.forcedCount).toBe(1);
    // A bare day (what Qt read) still yields its Z.
    expect(parseCloseResult({ data: { ...PAYLOAD.data, tbdZNo: 9 } })).toMatchObject({ zNo: "9", forcedCount: null });
    expect(parseCloseResult(undefined)).toEqual({ day: null, zNo: "", forcedCount: null });
  });

  it("takes the Z from the answer's zNo, else the day's tbdZNo (Qt bec3f98)", () => {
    const day = { ...PAYLOAD.data, tbdStatus: "CLOSED", tbdZNo: 8 };
    expect(parseCloseResult({ data: { day, zNo: 11, forceClosed: [] } }).zNo).toBe("11");
    expect(parseCloseResult({ data: { day, zNo: null, forceClosed: [] } }).zNo).toBe("8");
    expect(parseCloseResult({ data: { day: { ...day, tbdZNo: null }, forceClosed: [] } })).toMatchObject({
      zNo: "",
      forcedCount: 0,
    });
  });

  it("reads the reopened day", () => {
    expect(parseReopenResult({ data: { day: PAYLOAD.data, tapId: "t" } })?.tbdId).toBe("019c-day");
    expect(parseReopenResult({ data: null })).toBeNull();
  });

  it("reads the approvers and a list body", () => {
    expect(
      parseSupervisors({
        data: [
          { userId: "u1", loginName: "VKPOS", fullName: "VK POS", hasPin: true },
          { userId: "u2", loginName: "ZT", fullName: null, hasPin: false },
          { loginName: "no id" },
        ],
      }),
    ).toEqual([
      { userId: "u1", loginName: "VKPOS", fullName: "VK POS", hasPin: true },
      { userId: "u2", loginName: "ZT", fullName: "", hasPin: false },
    ]);
    expect(listOf({ data: { items: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
    expect(listOf({ data: "nope" })).toEqual([]);
  });

  it("reads a refusal's first error, flat or nested", () => {
    const blocked = {
      status: 409,
      data: {
        success: false,
        message: "The business day cannot be closed",
        errors: [{ field: "tbdId", code: "TILL_DAY_CLOSE_BLOCKED", message: "1 session is still open" }],
      },
    };
    expect(firstErrorOf(blocked, "fallback")).toEqual({
      status: 409,
      code: "TILL_DAY_CLOSE_BLOCKED",
      field: "tbdId",
      message: "1 session is still open",
    });
    const nested = { status: 403, data: { statusCode: 403, message: { message: "Forbidden", errors: [] } } };
    expect(firstErrorOf(nested, "fallback")).toEqual({ status: 403, code: "", field: "", message: "Forbidden" });
    expect(firstErrorOf({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" }, "fallback").message).toBe(
      "TypeError: Failed to fetch",
    );
    expect(firstErrorOf(undefined, "fallback")).toEqual({ status: null, code: "", field: "", message: "fallback" });
  });
});
