import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  businessDateAt,
  clockOf,
  cockpitHref,
  dayPickOf,
  dayQuery,
  daysGridParams,
  displayDate,
  errorStatus,
  parseDay,
  parseGridPage,
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
    expect(day?.sessions).toEqual([
      { status: "CLOSED", count: 4 },
      { status: "PENDING_APPROVAL", count: 1 },
    ]);
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

  it("reads a clock in local time", () => {
    const at = new Date(2026, 9, 7, 8, 58);
    expect(clockOf(at.toISOString())).toBe("08:58");
    expect(clockOf("")).toBe("");
    expect(clockOf("not a time")).toBe("");
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
