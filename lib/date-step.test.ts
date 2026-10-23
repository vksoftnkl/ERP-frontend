import { describe, expect, it } from "vitest";
import { dateStepOf, stepIsoDate } from "./date-step";

const press = (key: string, mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("dateStepOf", () => {
  it("↑ is the next day, ↓ the day before", () => {
    expect(dateStepOf(press("ArrowUp"))).toBe(1);
    expect(dateStepOf(press("ArrowDown"))).toBe(-1);
  });

  it("ignores chords and other keys", () => {
    expect(dateStepOf(press("ArrowUp", { ctrlKey: true }))).toBe(0);
    expect(dateStepOf(press("ArrowDown", { shiftKey: true }))).toBe(0);
    expect(dateStepOf(press("ArrowLeft"))).toBe(0);
    expect(dateStepOf(press("Enter"))).toBe(0);
  });
});

describe("stepIsoDate", () => {
  const today = new Date(2026, 9, 23);

  it("steps across a month and a year", () => {
    expect(stepIsoDate("2026-10-31", 1, today)).toBe("2026-11-01");
    expect(stepIsoDate("2026-11-01", -1, today)).toBe("2026-10-31");
    expect(stepIsoDate("2026-12-31", 1, today)).toBe("2027-01-01");
    expect(stepIsoDate("2028-02-28", 1, today)).toBe("2028-02-29");
  });

  it("an empty or unreadable box starts from today", () => {
    expect(stepIsoDate("", 1, today)).toBe("2026-10-23");
    expect(stepIsoDate(null, -1, today)).toBe("2026-10-23");
    expect(stepIsoDate("2026-02-30", 1, today)).toBe("2026-10-23");
    expect(stepIsoDate("31-10-2026", 1, today)).toBe("2026-10-23");
  });
});
