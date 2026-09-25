import { describe, expect, it } from "vitest";
import { headerFixture, vouchersFixture } from "../testing/fixtures";
import { firstPages } from "../query/pages";
import { formatAmount, formatBal } from "../wire/money";
import { parseHeader, parseVouchers } from "../wire/parse";
import { buildGridModel, contraLegs, indexSpan, pairOf } from "./grid-model";

const header = parseHeader(headerFixture());
const page = parseVouchers(vouchersFixture({ withLegs: "true" }));
const pages = firstPages("k", page);

describe("the worked example's synthetic rows", () => {
  const model = buildGridModel({ period: header.period, pages, expanded: new Set(), legsOf: () => undefined });

  it("draws Opening, 14 rows, Total and Closing, in that order", () => {
    expect(model.rows.map((r) => r.kind)).toEqual([
      "opening",
      ...new Array(14).fill("voucher"),
      "total",
      "closing",
    ]);
    expect(model.pendingRows).toBe(0);
  });

  it("takes Opening, Total and Closing from header.period, to the character", () => {
    const [opening, total, closing] = [model.rows[0], model.rows.at(-2), model.rows.at(-1)];
    if (opening.kind !== "opening" || total?.kind !== "total" || closing?.kind !== "closing") {
      throw new Error("synthetic rows out of place");
    }
    expect(formatBal(opening.bal)).toBe("1,85,200.00 Dr");
    expect(opening.asOf).toBe("2026-07-31");
    expect(formatBal(closing.bal)).toBe("1,76,300.00 Dr");
    expect(formatAmount(total.debit)).toBe(formatAmount(header.period.debit.amount));
    expect(total.credit).toBe(header.period.credit.amount);
  });

  it("matches page 1's b/f and the last row's balance (the dev consistency check)", () => {
    expect(page.broughtForward).toEqual(header.period.opening);
    expect(page.rows.at(-1)!.balance).toEqual(header.period.closing);
  });
});

describe("legs under an expanded row", () => {
  const asPer = page.rows.find((r) => r.asPerDetails)!;

  it("shows the contra legs only, and keeps them out of the index maths", () => {
    const model = buildGridModel({
      period: header.period,
      pages,
      expanded: new Set([asPer.voucherId]),
      legsOf: (row) => ({ status: "ready", legs: row.legs ?? [] }),
    });
    const legs = model.rows.filter((r) => r.kind === "leg");
    expect(legs).toHaveLength(contraLegs(asPer.legs!).length);
    expect(legs.every((r) => r.kind === "leg" && !r.leg.isThisLedger)).toBe(true);
    // A span over only leg rows maps to no report index.
    const firstLeg = model.rows.findIndex((r) => r.kind === "leg");
    expect(indexSpan(model.rows, firstLeg, firstLeg)).toBeNull();
    expect(indexSpan(model.rows, 0, model.rows.length - 1)).toEqual([0, 13]);
  });

  it("shows a loading line until the legs arrive", () => {
    const model = buildGridModel({
      period: header.period,
      pages,
      expanded: new Set([asPer.voucherId]),
      legsOf: () => ({ status: "loading" }),
    });
    expect(model.rows.some((r) => r.kind === "legs-status")).toBe(true);
  });
});

describe("cancelled pairs", () => {
  it("finds the other half through the narration", () => {
    const cancelled = page.rows.find((r) => r.rowKind === "CANCELLED")!;
    const reversal = page.rows.find((r) => r.rowKind === "REVERSAL")!;
    expect(pairOf(cancelled, page.rows)?.voucherId).toBe(reversal.voucherId);
    expect(pairOf(reversal, page.rows)?.voucherId).toBe(cancelled.voucherId);
    expect(pairOf(page.rows[0], page.rows)).toBeUndefined();
  });
});

describe("an empty period", () => {
  it("still draws Opening, Total and Closing around an empty line", () => {
    const empty = firstPages("k", { ...page, rows: [], page: { page: 1, pageSize: 200, totalRows: 0 } });
    const model = buildGridModel({ period: header.period, pages: empty, expanded: new Set(), legsOf: () => undefined });
    expect(model.rows.map((r) => r.kind)).toEqual(["opening", "empty", "total", "closing"]);
  });
});
