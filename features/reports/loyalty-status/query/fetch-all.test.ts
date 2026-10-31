import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./fetch-all";

function pager(total: number, limit: number) {
  const asked: number[] = [];
  const fetchPage = async (page: number) => {
    asked.push(page);
    const start = (page - 1) * limit;
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => start + i);
    return { items, total, summary: { page } };
  };
  return { asked, fetchPage };
}

describe("walking the pages (Qt fetchAll)", () => {
  it("reads every page and keeps the first page's summary", async () => {
    const { asked, fetchPage } = pager(450, 200);
    const all = await fetchAllPages(fetchPage, { limit: 200 });
    expect(asked).toEqual([1, 2, 3]);
    expect(all.items).toHaveLength(450);
    expect(all.total).toBe(450);
    expect(all.summary).toEqual({ page: 1 });
  });

  it("stops at the cap", async () => {
    const { asked, fetchPage } = pager(1000, 200);
    const all = await fetchAllPages(fetchPage, { limit: 200, maxRows: 400 });
    expect(asked).toEqual([1, 2]);
    expect(all.items).toHaveLength(400);
    expect(all.total).toBe(1000);
  });

  it("stops on a short page and when no longer wanted", async () => {
    const short = pager(150, 200);
    expect((await fetchAllPages(short.fetchPage, { limit: 200 })).items).toHaveLength(150);
    const dropped = pager(1000, 200);
    await fetchAllPages(dropped.fetchPage, { limit: 200, stillWanted: () => false });
    expect(dropped.asked).toEqual([1]);
  });
});
