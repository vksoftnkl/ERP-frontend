import { describe, expect, it, vi } from "vitest";
import { runAllPages } from "./run-all-pages";

const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ grid_id: from + i }));
const envelope = (items: unknown[], total: number) => ({ success: true, data: { items, meta: { total } } });

describe("runAllPages", () => {
  it("reads past the runner's 100-row page until the list is whole", async () => {
    const baseQuery = vi.fn(async (arg: { params?: Record<string, unknown> }) => {
      const page = Number(arg.params?.page);
      return { data: envelope(page === 1 ? rows(1, 100) : rows(101, 9), 109) };
    });
    const result = await runAllPages(34, baseQuery);
    expect(result.data).toHaveLength(109);
    expect(baseQuery).toHaveBeenCalledTimes(2);
    expect(baseQuery.mock.calls[1][0]).toMatchObject({
      url: "/configured-grid-sql/run",
      params: { grid_id: 34, page: 2, limit: 100 },
    });
  });

  it("stops after one page when it is short", async () => {
    const baseQuery = vi.fn(async () => ({ data: envelope(rows(1, 40), 40) }));
    const result = await runAllPages(38, baseQuery);
    expect(result.data).toHaveLength(40);
    expect(baseQuery).toHaveBeenCalledTimes(1);
  });

  it("stops on the total even when the last page is exactly full", async () => {
    const baseQuery = vi.fn(async () => ({ data: envelope(rows(1, 100), 100) }));
    expect((await runAllPages(34, baseQuery)).data).toHaveLength(100);
    expect(baseQuery).toHaveBeenCalledTimes(1);
  });

  it("is the error when the first page fails", async () => {
    const baseQuery = vi.fn(async () => ({ error: { status: 500 } }));
    expect(await runAllPages(34, baseQuery)).toEqual({ error: { status: 500 } });
  });

  it("keeps what it read when a later page fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const baseQuery = vi.fn(async (arg: { params?: Record<string, unknown> }) =>
      Number(arg.params?.page) === 1 ? { data: envelope(rows(1, 100), 150) } : { error: { status: 502 } },
    );
    expect((await runAllPages(34, baseQuery)).data).toHaveLength(100);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reads a bare array answer too", async () => {
    const baseQuery = vi.fn(async () => ({ data: { data: rows(1, 3) } }));
    expect((await runAllPages(34, baseQuery)).data).toHaveLength(3);
  });
});
