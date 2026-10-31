import { describe, expect, it } from "vitest";
import { expiringRow, expiringSummary, TODAY, weeks } from "../testing/fixtures";
import { calendarBars, daysLeftCell, expiringCells, expiringNote, expiringTiles, expiringTotals, rowsOfWeek } from "./expiring";

describe("an expiring row (Qt applyWeekFilter + delegate)", () => {
  it("reads the live row", () => {
    const cells = expiringCells(expiringRow);
    expect(cells.map((c) => c.text)).toEqual([
      "21/10/2027",
      "355 DAYS",
      "Customer",
      "",
      "—",
      "Loyalty concurrency test",
      "7",
      "7.00",
      "7",
      "0",
      "21/10/2026",
    ]);
    expect(cells[1].chip).toBe("grey");
    expect(cells[6]).toMatchObject({ tone: "amber", bold: true });
    expect(cells[9]).toMatchObject({ tone: "red", bold: true });
  });

  it("chips the days left, and greys a member who is not active", () => {
    expect(daysLeftCell(1)).toEqual({ text: "1 DAY", chip: "red" });
    expect(daysLeftCell(7).chip).toBe("red");
    expect(daysLeftCell(15).chip).toBe("amber");
    expect(daysLeftCell(16).chip).toBe("grey");
    const dim = expiringCells({ ...expiringRow, status: "SUSPENDED", balanceAfter: 3 });
    expect(dim[2].tone).toBe("grey");
    expect(dim[6].tone).toBe("grey");
    expect(dim[9].tone).toBe("grey");
  });

  it("narrows to one week, Monday to Sunday", () => {
    const rows = [
      { ...expiringRow, expiresOn: "2026-11-08" },
      { ...expiringRow, expiresOn: "2026-11-09" },
      { ...expiringRow, expiresOn: "2026-11-15" },
      { ...expiringRow, expiresOn: "2026-11-16" },
    ];
    expect(rowsOfWeek(rows, "2026-11-09").map((r) => r.expiresOn)).toEqual(["2026-11-09", "2026-11-15"]);
    expect(rowsOfWeek(rows, null)).toHaveLength(4);
  });
});

describe("tiles, Total and note", () => {
  it("cuts the buckets the server sent", () => {
    expect(expiringTiles(expiringSummary).map((t) => [t.caption, t.value, t.sub])).toEqual([
      ["EXPIRING ≤ 7 DAYS", "0", "0 members"],
      ["8 – 15 DAYS", "0", "0 members"],
      ["16 – 365 DAYS", "51", "3 members"],
      ["VALUE AT RISK", "₹ 51.00", "51 pts · 3 members"],
    ]);
    expect(expiringTiles(null)[0]).toMatchObject({ caption: "EXPIRING ≤ 7 DAYS", value: "—" });
  });

  it("totals from the summary and says what the grid shows", () => {
    const totals = expiringTotals(3, expiringSummary, 3).map((c) => c.text);
    expect([totals[2], totals[6], totals[7]]).toEqual(["Total  (3)", "51", "51.00"]);
    expect(expiringNote(0, null)).toBe("Nothing lapses in this window.");
    expect(expiringNote(3, "2026-11-09")).toBe("Week of 09/11/2026 only — click the bar again to show every week.");
  });
});

describe("the expiry calendar (Qt fillCalendar)", () => {
  it("tints the near weeks and greys the others while one is picked", () => {
    const bars = calendarBars(weeks, TODAY, "30", -1);
    expect(bars.map((b) => [b.label, b.values[0], b.tones[0]])).toEqual([
      ["26/10", 6410, "red"],
      ["09/11", 3100, "amber"],
      ["23/11", 0, "brand"],
      ["04/01", 1800, "faint"],
    ]);
    expect(calendarBars(weeks, TODAY, "30", 1).map((b) => b.tones[0])).toEqual(["off", "amber", "off", "off"]);
  });
});
