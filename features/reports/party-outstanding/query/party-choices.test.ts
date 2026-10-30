import { describe, expect, it } from "vitest";
import type { PartiesPayload } from "../wire/types";
import { DEFAULT_BUCKETS, parseFilters, reportFiltersOf, type PartiesQuery, type Session } from "./params";
import { CHOICE_MAX_PAGES, CHOICE_PAGE_SIZE, loadPartyChoices, partyChoiceFilters } from "./party-choices";

const session: Session = { companyId: "c0000000-0000-4000-8000-000000000001", branchId: null, yearBegin: null, yearEnd: null };
const applied = reportFiltersOf(parseFilters(new URLSearchParams("branch=all"), { asOn: "2026-10-29", branchId: null }));

/** `/parties` over `total` synthetic parties, answering each page as the server would. */
function stubClient(total: number) {
  const asked: PartiesQuery[] = [];
  const client = {
    getParties: async (q: PartiesQuery) => {
      asked.push(q);
      const start = (q.page - 1) * q.pageSize;
      const rows = Array.from({ length: Math.max(0, Math.min(q.pageSize, total - start)) }, (_, i) => ({
        partyId: `p${start + i}`,
        name: `Party ${start + i}`,
        area: null,
      }));
      return { rows, page: { page: q.page, pageSize: q.pageSize, totalRows: total } } as unknown as PartiesPayload;
    },
  };
  return { client, asked };
}

describe("the Party combo's list", () => {
  it("asks /parties A–Z with the draft's filters, minus the party, with default buckets", () => {
    const draft = { ...applied, partyId: "p9", onlyOverdue: true, asOn: "2026-10-2" };
    const f = partyChoiceFilters(draft, "2026-10-29");
    expect(f.partyId).toBeNull();
    expect(f.onlyOverdue).toBe(true);
    expect(f.buckets).toBe(DEFAULT_BUCKETS);
    // A half-typed As on falls back to the applied one.
    expect(f.asOn).toBe("2026-10-29");
  });

  it("drops a Due-days window the server would refuse", () => {
    const f = partyChoiceFilters({ ...applied, minDueDays: 90, maxDueDays: 30 }, "2026-10-29");
    expect([f.minDueDays, f.maxDueDays]).toEqual([null, null]);
  });

  it("reads every page until totalRows, sorted by name", async () => {
    const { client, asked } = stubClient(CHOICE_PAGE_SIZE + 7);
    const { choices, truncated } = await loadPartyChoices(client, session, applied);
    expect(choices).toHaveLength(CHOICE_PAGE_SIZE + 7);
    expect(truncated).toBe(false);
    expect(asked.map((q) => [q.page, q.pageSize, q.sort, q.dir])).toEqual([
      [1, CHOICE_PAGE_SIZE, "name", "asc"],
      [2, CHOICE_PAGE_SIZE, "name", "asc"],
    ]);
    expect(asked[0].partyId).toBeUndefined();
  });

  it("stops at the page cap and says so", async () => {
    const { client, asked } = stubClient(CHOICE_PAGE_SIZE * CHOICE_MAX_PAGES + 1);
    const { choices, truncated } = await loadPartyChoices(client, session, applied);
    expect(asked).toHaveLength(CHOICE_MAX_PAGES);
    expect(choices).toHaveLength(CHOICE_PAGE_SIZE * CHOICE_MAX_PAGES);
    expect(truncated).toBe(true);
  });

  it("an empty report is an empty list, one ask", async () => {
    const { client, asked } = stubClient(0);
    expect(await loadPartyChoices(client, session, applied)).toEqual({ choices: [], truncated: false });
    expect(asked).toHaveLength(1);
  });
});
