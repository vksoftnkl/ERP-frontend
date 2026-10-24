import { describe, expect, it } from "vitest";
import { QT_ROWS } from "../testing/fixtures";
import {
  buildLines,
  changeLineIndex,
  dayHeaderText,
  dayLineIndex,
  firstChangeOfDay,
  stepChange,
  type DayLine,
} from "./grid-model";

const DAYS = [
  { day: "2026-10-23", changes: 2, priceChanges: 2, slabChanges: 0, items: 2, users: 1, saves: 2 },
  { day: "2026-10-22", changes: 4, priceChanges: 1, slabChanges: 3, items: 2, users: 2, saves: 4 },
];

describe("the grid lines (Qt PriceLogView::fill)", () => {
  it("opens each day with a header: 6 changes + 2 day headers", () => {
    const lines = buildLines(QT_ROWS, DAYS);
    expect(lines).toHaveLength(8);
    expect(dayLineIndex(lines, "2026-10-23")).toBe(0);
    expect(dayLineIndex(lines, "2026-10-22")).toBe(3);
    expect(dayLineIndex(lines, "2026-10-21")).toBe(-1);
    expect(lines[2].kind === "change" && lines[2].row.ipclId).toBe("a2");
  });

  it("takes the header counts from /days, else from the rows", () => {
    const withDays = buildLines(QT_ROWS, DAYS);
    expect(dayHeaderText(withDays[0] as DayLine)).toBe("Fri 23-10-2026 · 2 changes · 2 items · 1 user");
    const counted = buildLines(QT_ROWS, null);
    expect((counted[3] as DayLine).counts).toBe("4 changes · 2 items · 2 users");
  });

  it("moves over changes only, skipping the day headers", () => {
    const lines = buildLines(QT_ROWS, DAYS);
    expect(stepChange(lines, -1, 1)).toBe(1);
    expect(stepChange(lines, 2, 1)).toBe(4);
    expect(stepChange(lines, 4, -1)).toBe(2);
    expect(stepChange(lines, 1, -1)).toBe(1);
    expect(stepChange(lines, 7, 1)).toBe(7);
    expect(stepChange(lines, 1, 100)).toBe(7);
    expect(stepChange([], -1, 1)).toBe(-1);
    expect(changeLineIndex(lines, "a5")).toBe(4);
    expect(firstChangeOfDay(lines, "2026-10-22")).toBe(4);
  });
});
