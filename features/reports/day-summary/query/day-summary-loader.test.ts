import { describe, expect, it } from "vitest";
import { BRANCH_MAIN, COMPANY_ID, FY } from "../testing/fixtures";
import { fakeClient, flush } from "../testing/fake-client";
import { rowAt } from "./pages";
import { noTenderKey, parseFilters, summaryKey, tenderKey, vouchersKey, type Filters, type Session } from "./params";
import { DaySummaryLoader, type LoaderState } from "./day-summary-loader";

const session: Session = {
  companyId: COMPANY_ID,
  accYear: FY.accYear,
  yearBegin: FY.begin,
  yearEnd: FY.end,
  branchId: BRANCH_MAIN,
};

function filters(qs: string): Filters {
  return parseFilters(new URLSearchParams(qs), { date: "2026-10-09", branchId: BRANCH_MAIN });
}

describe("one generation at a time (race test)", () => {
  it("◀ ×5 with answers arriving in reverse order ends on the last day, and only its figures commit", async () => {
    const { client, calls } = fakeClient({ gate: true });
    const seen: LoaderState[] = [];
    const loader = new DaySummaryLoader(client, (s) => seen.push(s));

    const days = ["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05", "2026-10-04"];
    for (const day of days) loader.load({ session, filters: filters(`date=${day}&to=${day}`) });
    // The Summary tab is ONE request per day.
    expect(calls).toHaveLength(days.length);
    expect(calls.every((c) => c.route === "summary")).toBe(true);

    [...calls].reverse().forEach((call) => call.release());
    await flush();

    const final = loader.getState();
    expect(final.loading).toBe(false);
    expect(final.summary?.key).toBe(summaryKey(session, filters("date=2026-10-04&to=2026-10-04")));
    expect(final.summary?.data.scope.fromDate).toBe("2026-10-04");
    // No superseded day was ever committed.
    for (const state of seen) {
      if (state.summary) expect(state.summary.data.scope.fromDate).toBe("2026-10-04");
    }
    expect(calls.filter((c) => c.aborted)).toHaveLength(days.length - 1);
  });

  it("fetches only the tab on screen, and a tab switch keeps what is held", async () => {
    const { client, calls } = fakeClient();
    const loader = new DaySummaryLoader(client, () => undefined);

    loader.load({ session, filters: filters("tab=summary") });
    await flush();
    expect(calls.map((c) => c.route)).toEqual(["summary"]);

    loader.load({ session, filters: filters("tab=vouchers") });
    await flush();
    expect(calls.map((c) => c.route)).toEqual(["summary", "vouchers"]);
    expect(calls[1].query).toMatchObject({ page: "1", pageSize: "200", withLegs: "false" });

    // Back to Summary: held for this URL, nothing asked.
    loader.load({ session, filters: filters("tab=summary") });
    await flush();
    expect(calls).toHaveLength(2);

    // A display-only switch moves nothing.
    loader.load({ session, filters: filters("tab=summary&drafts=0") });
    await flush();
    expect(calls).toHaveLength(2);

    // The group level refetches the summary at once.
    loader.load({ session, filters: filters("tab=summary&group=PRIMARY") });
    await flush();
    expect(calls.map((c) => c.route)).toEqual(["summary", "vouchers", "summary"]);
    expect(calls[2].query.groupLevel).toBe("PRIMARY");
  });

  it("does not fetch Day-wise for one day", async () => {
    const { client, calls } = fakeClient();
    const loader = new DaySummaryLoader(client, () => undefined);
    loader.load({ session, filters: filters("tab=daily") });
    await flush();
    expect(calls).toHaveLength(0);
    loader.load({ session, filters: filters("tab=daily&date=2026-10-07&to=2026-10-09") });
    await flush();
    expect(calls.map((c) => c.route)).toEqual(["daily"]);
    expect(loader.getState().daily?.data.rows).toHaveLength(3);
  });

  it("loads further voucher pages on demand, under the same list only", async () => {
    const { client, calls } = fakeClient();
    const loader = new DaySummaryLoader(client, () => undefined);
    const f = filters("tab=vouchers");
    loader.load({ session, filters: f });
    await flush();
    const pages = loader.getState().vouchers;
    expect(pages?.key).toBe(vouchersKey(session, f));
    expect(pages?.totalRows).toBe(65);
    expect(rowAt(pages!, 64)?.voucherNo).toBe("jrl00018");
    // Everything fits in page 1: nothing more to ask.
    loader.ensureRows(0, 64);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it("keeps the failure with the key and route it was for, and Retry asks again", async () => {
    let fail = true;
    const { client, calls } = fakeClient({ fail: () => (fail ? { status: 500, data: {} } : null) });
    const loader = new DaySummaryLoader(client, () => undefined);
    const f = filters("tab=summary");
    loader.load({ session, filters: f });
    await flush();
    expect(loader.getState().error).toMatchObject({ key: summaryKey(session, f), route: "summary" });
    expect(loader.getState().summary).toBeNull();
    fail = false;
    loader.reload();
    await flush();
    expect(calls).toHaveLength(2);
    expect(loader.getState().error).toBeNull();
    expect(loader.getState().summary?.data.typeTotals.amount).toBe("495270.00");
  });
});

describe("By tender and No tender (notes 126 §4)", () => {
  it("By tender asks both lists, as the Qt screen does; the No tender tab then asks nothing", async () => {
    const { client, calls } = fakeClient();
    const loader = new DaySummaryLoader(client, () => undefined);
    const f = filters("tab=tender&type=3");
    loader.load({ session, filters: f });
    await flush();
    expect(calls.map((c) => c.route).sort()).toEqual(["no-tender", "tender"]);
    const tender = calls.find((c) => c.route === "tender")!;
    expect(tender.query).toEqual({
      companyId: COMPANY_ID,
      accYear: FY.accYear,
      branchId: BRANCH_MAIN,
      fromDate: "2026-10-09",
      toDate: "2026-10-09",
      groupBy: "TENDER",
      withRows: "false",
      limit: "1",
    });
    expect(calls.find((c) => c.route === "no-tender")!.query).toMatchObject({ limit: "500" });
    const state = loader.getState();
    expect(state.tender?.key).toBe(tenderKey(session, f));
    expect(state.tender?.data.groups).toHaveLength(7);
    expect(state.noTender?.key).toBe(noTenderKey(session, f));
    expect(state.noTender?.data.count).toBe(2);

    loader.load({ session, filters: filters("tab=no-tender&type=3") });
    await flush();
    expect(calls).toHaveLength(2);
    expect(loader.getState()).toMatchObject({ loading: false, error: null });
  });

  it("the group-by asks By tender again, never the No tender list", async () => {
    const { client, calls } = fakeClient();
    const loader = new DaySummaryLoader(client, () => undefined);
    loader.load({ session, filters: filters("tab=tender") });
    await flush();
    loader.load({ session, filters: filters("tab=tender&by=TYPE") });
    await flush();
    expect(calls.map((c) => c.route).slice(2)).toEqual(["tender"]);
    expect(calls[2].query.groupBy).toBe("TYPE");
    expect(loader.getState().tender?.data.groupBy).toBe("TYPE");
  });

  it("a switch to No tender while both are asked keeps its request and waits for it", async () => {
    const { client, calls } = fakeClient({ gate: true });
    const loader = new DaySummaryLoader(client, () => undefined);
    loader.load({ session, filters: filters("tab=tender") });
    loader.load({ session, filters: filters("tab=no-tender") });
    expect(calls.map((c) => [c.route, c.aborted])).toEqual([
      ["no-tender", false],
      ["tender", true],
    ]);
    expect(loader.getState().loading).toBe(true);
    calls[0].release();
    await flush();
    expect(loader.getState()).toMatchObject({ loading: false, error: null });
    expect(loader.getState().noTender?.data.count).toBe(2);
  });

  it("a failed No tender list only leaves the count off under By tender; on its own tab it fails, and Retry asks again", async () => {
    let fail = true;
    const { client, calls } = fakeClient({
      fail: (route) => (fail && route === "no-tender" ? { status: 500, data: {} } : null),
    });
    const loader = new DaySummaryLoader(client, () => undefined);
    loader.load({ session, filters: filters("tab=tender") });
    await flush();
    expect(loader.getState()).toMatchObject({ loading: false, error: null, noTender: null });
    expect(loader.getState().tender).not.toBeNull();

    const f = filters("tab=no-tender");
    loader.load({ session, filters: f });
    await flush();
    expect(calls.map((c) => c.route)).toEqual(["no-tender", "tender", "no-tender"]);
    expect(loader.getState().error).toMatchObject({ key: noTenderKey(session, f), route: "no-tender" });

    fail = false;
    loader.reload();
    await flush();
    expect(calls).toHaveLength(4);
    expect(loader.getState()).toMatchObject({ loading: false, error: null });
    expect(loader.getState().noTender?.data.amount).toBe("2500.00");
  });

  it("Show on the same URL (reload) asks both again; the other tabs never ask either", async () => {
    const { client, calls } = fakeClient();
    const loader = new DaySummaryLoader(client, () => undefined);
    loader.load({ session, filters: filters("tab=summary") });
    await flush();
    expect(calls.map((c) => c.route)).toEqual(["summary"]);
    loader.load({ session, filters: filters("tab=tender") });
    await flush();
    loader.reload();
    await flush();
    expect(calls.map((c) => c.route).slice(1).sort()).toEqual(["no-tender", "no-tender", "tender", "tender"]);
  });
});
