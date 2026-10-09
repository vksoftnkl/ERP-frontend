import { describe, expect, it } from "vitest";
import { COMPANY_ID, manyParties } from "../testing/fixtures";
import { fakeClient, flush } from "../testing/fake-client";
import { partiesQuery, parseFilters, type Filters, type Session } from "./params";
import { pageCount, rowAt } from "./pages";
import { fullKey, OutstandingLoader, partOf, type OutstandingState } from "./outstanding-loader";

const session: Session = { companyId: COMPANY_ID, branchId: null, yearBegin: "2026-04-01", yearEnd: "2027-03-31" };

function filtersFor(query: string): Filters {
  return parseFilters(new URLSearchParams(`branch=all&${query}`), { asOn: "2026-09-25", branchId: null });
}

describe("one generation per Show (race test)", () => {
  it("Show ×3 with answers arriving in reverse ends on the last Show", async () => {
    const { client, calls } = fakeClient({ gate: true });
    const seen: OutstandingState[] = [];
    const loader = new OutstandingLoader(client, (s) => seen.push(s));

    const shows = [filtersFor("asOn=2026-09-01"), filtersFor("asOn=2026-09-10"), filtersFor("asOn=2026-09-25&oo=1")];
    for (const filters of shows) loader.load({ session, filters });
    expect(calls.map((c) => c.route)).toEqual(["parties", "parties", "parties"]);

    [...calls].reverse().forEach((call) => call.release());
    await flush();

    const final = loader.getState();
    expect(final.loading).toBe(false);
    expect(final.viewKey).toBe(fullKey(session, shows[2]));
    expect(final.parties?.meta.head.asOn).toBe("2026-09-25");
    expect(partOf(final.viewKey, final.parties?.key)).toBe(true);
    // Nothing from a superseded Show was ever committed.
    for (const state of seen) {
      if (state.viewKey) expect(state.viewKey).toBe(fullKey(session, shows[2]));
    }
    expect(calls.filter((c) => c.aborted)).toHaveLength(2);
  });

  it("commits the tab's data together with the tiles", async () => {
    const { client, calls } = fakeClient({ gate: true });
    const seen: OutstandingState[] = [];
    const loader = new OutstandingLoader(client, (s) => seen.push(s));
    loader.load({ session, filters: filtersFor("tab=summary&gb=AREA") });
    expect(calls.map((c) => c.route)).toEqual(["parties", "summary"]);
    calls[0].release();
    await flush();
    expect(loader.getState().parties).toBeNull(); // not until summary is in too
    calls[1].release();
    await flush();
    const s = loader.getState();
    expect(partOf(s.viewKey, s.parties?.key) && partOf(s.viewKey, s.summary?.key)).toBe(true);
    for (const state of seen) if (state.parties) expect(state.summary).not.toBeNull();
  });

  it("a tab switch fetches only what the report does not hold", async () => {
    const { client, calls } = fakeClient();
    const loader = new OutstandingLoader(client, () => undefined);
    loader.load({ session, filters: filtersFor("tab=parties") });
    await flush();
    loader.load({ session, filters: filtersFor("tab=bills") });
    await flush();
    loader.load({ session, filters: filtersFor("tab=parties") });
    await flush();
    expect(calls.map((c) => c.route)).toEqual(["parties", "bill-wise"]);
  });

  it("keeps the previous report on a failure, marked as behind", async () => {
    let failing = false;
    const { client } = fakeClient({ fail: () => (failing ? { status: 500, data: {} } : null) });
    const loader = new OutstandingLoader(client, () => undefined);
    loader.load({ session, filters: filtersFor("asOn=2026-09-25") });
    await flush();
    const before = loader.getState().parties;
    failing = true;
    loader.load({ session, filters: filtersFor("asOn=2026-09-20") });
    await flush();
    const s = loader.getState();
    expect(s.behind).toBe(true);
    expect(s.parties).toBe(before);
    expect(s.error).toMatchObject({ status: 500 });
  });
});

describe("server paging (1,200 parties)", () => {
  it("never changes the totals while pages load, and never sorts on the client", async () => {
    const parties = manyParties(1200);
    const { client, calls } = fakeClient({ parties: { parties } });
    const totals: string[] = [];
    const loader = new OutstandingLoader(client, (s) => {
      if (s.parties) totals.push(JSON.stringify(s.parties.meta.totals));
    });
    const filters = filtersFor("sort=net&dir=desc");
    loader.load({ session, filters });
    await flush();
    const list = loader.getState().parties!;
    expect(list.totalRows).toBe(1200);
    expect(pageCount(list)).toBe(6);

    // Scroll to the end, a screenful at a time.
    for (let first = 0; first < 1200; first += 40) {
      loader.ensureRows("parties", first, first + 39);
      await flush();
    }
    const loaded = loader.getState().parties!;
    expect([...loaded.pages.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(totals).size).toBe(1);
    expect(calls.filter((c) => c.route === "parties").map((c) => c.query.page)).toEqual(["1", "2", "3", "4", "5", "6"]);

    // A header click is a new URL: page 1, sorted BY THE SERVER.
    const byName = filtersFor("sort=name&dir=asc");
    loader.load({ session, filters: byName });
    await flush();
    const last = calls[calls.length - 1];
    expect(last.query).toMatchObject({ sort: "name", dir: "asc", page: "1" });
    const sorted = loader.getState().parties!;
    expect(rowAt(sorted, 0)?.name).toBe("Party 0001");
    expect(rowAt(sorted, 199)?.name).toBe("Party 0200");
    expect(sorted.pages.size).toBe(1);
    // The request is exactly what params.ts builds: no client-side reshuffle.
    expect(last.query.pageSize).toBe(String(partiesQuery(session, byName, 1).pageSize));
  });

  it("does not add a page from an older sort to the new list", async () => {
    const parties = manyParties(450);
    const { client, calls } = fakeClient({ gate: true, parties: { parties } });
    const loader = new OutstandingLoader(client, () => undefined);
    loader.load({ session, filters: filtersFor("sort=net") });
    calls[0].release();
    await flush();
    loader.ensureRows("parties", 200, 260); // page 2, held
    loader.load({ session, filters: filtersFor("sort=name") });
    calls.slice(1).forEach((call) => call.release());
    await flush();
    const list = loader.getState().parties!;
    expect(list.key).toContain("name");
    expect([...list.pages.keys()]).toEqual([1]);
  });
});
