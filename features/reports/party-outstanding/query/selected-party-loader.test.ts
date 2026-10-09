import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPANY_ID, MOCKUP_PARTIES } from "../testing/fixtures";
import { fakeClient, flush } from "../testing/fake-client";
import { parseFilters, type Session } from "./params";
import { SelectedPartyLoader, type SelectedState } from "./selected-party-loader";

const session: Session = { companyId: COMPANY_ID, branchId: null, yearBegin: "2026-04-01", yearEnd: "2027-03-31" };
const filters = parseFilters(new URLSearchParams("branch=all"), { asOn: "2026-09-25", branchId: null });
const ids = MOCKUP_PARTIES.map((p) => p.id);

afterEach(() => {
  vi.useRealTimers();
});

describe("the focused party (race test)", () => {
  it("holding ↓ through the parties with answers in reverse ends on the last party, card and bills together", async () => {
    const { client, calls } = fakeClient({ gate: true });
    const seen: SelectedState[] = [];
    const loader = new SelectedPartyLoader(client, (s) => seen.push({ ...s }), 0);
    for (const partyId of ids) {
      loader.select({ session, filters, partyId });
      await flush(); // the debounce (0 here) fires, so every party really asks
    }
    expect(calls.filter((c) => c.route === "bills")).toHaveLength(ids.length);

    // /bills arrive newest-first, /party oldest-first.
    [...calls.filter((c) => c.route === "bills")].reverse().forEach((c) => c.release());
    calls.filter((c) => c.route === "party").forEach((c) => c.release());
    await flush();

    const final = loader.getState();
    const last = ids[ids.length - 1];
    expect(final.loading).toBe(false);
    expect(final.card?.party.partyId).toBe(last);
    expect(final.bills?.partyId).toBe(last);
    for (const state of seen) {
      if (state.card || state.bills) expect(state.card?.party.partyId).toBe(state.bills?.partyId);
    }
  });

  it("debounces: forty quick moves ask for one party", async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient();
    const loader = new SelectedPartyLoader(client, () => undefined, 150);
    for (let i = 0; i < 40; i += 1) {
      loader.select({ session, filters, partyId: ids[i % ids.length] });
      await vi.advanceTimersByTimeAsync(20);
    }
    await vi.advanceTimersByTimeAsync(200);
    expect(calls.map((c) => c.route)).toEqual(["party", "bills"]);
    expect(calls[0].query.partyId).toBe(ids[39 % ids.length]);
  });

  it("a new Show invalidates the selection; the same Show and party do not refetch", async () => {
    const { client, calls } = fakeClient();
    const loader = new SelectedPartyLoader(client, () => undefined, 0);
    loader.select({ session, filters, partyId: ids[0] });
    await flush();
    loader.select({ session, filters, partyId: ids[0] });
    await flush();
    expect(calls).toHaveLength(2);
    loader.select({ session, filters: { ...filters, deductPdc: true }, partyId: ids[0] });
    await flush();
    expect(calls).toHaveLength(4);
    expect(calls[3].query.deductPdc).toBe("true");
  });

  it("keeps the previous party up when the next one fails", async () => {
    const { client } = fakeClient({ fail: (route, q) => (route === "bills" && q.partyId === ids[1] ? { status: 500 } : null) });
    const loader = new SelectedPartyLoader(client, () => undefined, 0);
    loader.select({ session, filters, partyId: ids[0] });
    await flush();
    loader.select({ session, filters, partyId: ids[1] });
    await flush();
    const s = loader.getState();
    expect(s.card?.party.partyId).toBe(ids[0]);
    expect(s.bills?.partyId).toBe(ids[0]);
    expect(s.error).toMatchObject({ status: 500 });
  });
});
