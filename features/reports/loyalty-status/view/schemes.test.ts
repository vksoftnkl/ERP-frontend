import { describe, expect, it } from "vitest";
import { deletedScheme, scheme, schemesSummary, steelFlask } from "../testing/fixtures";
import { giftCells, giftsNote, monthlyBars, monthlyTotals, schemeCells, schemeRowName, schemesNote, schemeTotals } from "./schemes";

describe("a scheme row (Qt fillSchemes + delegate)", () => {
  it("reads the live row", () => {
    const cells = schemeCells(scheme, "scheme");
    expect(cells.map((c) => c.text)).toEqual([
      "Loyalty concurrency test",
      "APPROVED",
      "01/04/2026 → 31/03/2027",
      "3",
      "38",
      "—",
      "51",
      "—",
      "—",
      "—",
      "—",
      "51",
      "51.00",
      "0.0 %",
    ]);
    expect(cells[1].chip).toBe("green");
    expect(cells[2].tone).toBe("grey");
    expect(cells[5].tone).toBe("muted");
    expect(cells[11]).toMatchObject({ tone: "brand", bold: true });
  });

  it("shows a deleted scheme's points-valid date, its adjust in violet, no Used %", () => {
    const cells = schemeCells(deletedScheme, "scheme");
    expect(cells[1].chip).toBe("red");
    expect(cells[2].text).toBe("points valid till 31/03/2027");
    expect(cells[3].text).toBe("—");
    expect(cells[10]).toMatchObject({ text: "+50", tone: "violet" });
    expect(cells[13].text).toBe("—");
  });

  it("names the split", () => {
    expect(schemeRowName({ ...scheme, branchName: "Coimbatore" }, "scheme_branch")).toBe("Loyalty concurrency test · Coimbatore");
    expect(schemeRowName({ ...scheme, month: "2026-10" }, "scheme_month")).toBe("Loyalty concurrency test · Oct 2026");
    expect(schemeRowName({ ...scheme, month: "2026-10" }, "scheme")).toBe("Loyalty concurrency test");
  });

  it("totals from the summary; Used % = (Redeemed + Gift) ÷ Earned", () => {
    const totals = schemeTotals(schemesSummary).map((c) => c.text);
    expect(totals).toEqual(["Total", "", "", "", "38", "0", "51", "10", "5", "0", "0", "51", "51.00", "29.4 %"]);
    expect(schemesNote(0)).toBe("No scheme holds points or moved in this period.");
  });
});

describe("month-wise and gifts (Qt fillMonthly / fillGifts)", () => {
  const months = [
    { month: "2026-09", earned: 0, redeemedPlusGift: 0, expired: 0, adjusted: 0, partial: false },
    { month: "2026-10", earned: 51, redeemedPlusGift: 15, expired: 2, adjusted: 0, partial: true },
  ];

  it("bars three series a month and stars a month to date", () => {
    const bars = monthlyBars(months);
    expect(bars.map((b) => [b.label, b.values])).toEqual([
      ["Sep", [0, 0, 0]],
      ["Oct*", [51, 15, 2]],
    ]);
    expect(monthlyTotals(months)).toBe("Earned 51  ·  Redeemed + gift 15  ·  Expired 2     * month to date");
    expect(monthlyTotals(months.slice(0, 1))).toBe("Earned 0  ·  Redeemed + gift 0  ·  Expired 0");
  });

  it("reads a gift, LOW when the stock is below the eligible members", () => {
    const cells = giftCells(steelFlask);
    expect(cells.map((c) => c.text)).toEqual(["Steel flask", "400", "yes", "612", "24", "40"]);
    expect(cells[3]).toMatchObject({ tone: "teal", bold: true });
    expect(cells[5].badge).toEqual({ text: "LOW", tone: "red" });
    const untracked = giftCells({ ...steelFlask, inStock: null, issuedInPeriod: 0, repeat: false });
    expect(untracked.map((c) => c.text).slice(2)).toEqual(["no", "612", "—", "not tracked"]);
    expect(untracked[5].badge).toBeNull();
    expect(giftsNote(0)).toBe("This scheme has no gifts.");
  });
});
