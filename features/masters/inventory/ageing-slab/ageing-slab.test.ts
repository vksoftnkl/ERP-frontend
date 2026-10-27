import { describe, expect, it } from "vitest";
import {
  addSlab,
  buildSavePayload,
  coverageLayout,
  coversText,
  ladderFault,
  removeSlab,
  rowsFromLadder,
  slabsOf,
  type ServerSlab,
} from "./ageing-slab";

const DEFAULT: ServerSlab[] = [
  { slabNo: 1, label: "0-30 days", fromDays: 0, toDays: 30 },
  { slabNo: 2, label: "31-60 days", fromDays: 31, toDays: 60 },
  { slabNo: 3, label: "Over 60 days", fromDays: 61, toDays: null },
];

describe("ageing slab ladder", () => {
  it("works every From out of the previous To", () => {
    const rows = rowsFromLadder(DEFAULT);
    rows[0].to = "45";
    expect(slabsOf(rows).map((s) => s.from)).toEqual([0, 46, 61]);
  });

  it("accepts the default ladder and names the first fault otherwise", () => {
    const rows = rowsFromLadder(DEFAULT);
    expect(ladderFault(slabsOf(rows))).toBe("");
    rows[1].label = " 0-30 DAYS ";
    expect(ladderFault(slabsOf(rows))).toBe('Two slabs are both called "0-30 DAYS".');
    rows[1].label = "";
    expect(ladderFault(slabsOf(rows))).toBe("Slab 2 has no label.");
    rows[1].label = "x";
    rows[1].to = "";
    expect(ladderFault(slabsOf(rows))).toMatch(/^Slab 2 has no To day/);
    rows[1].to = "20";
    expect(ladderFault(slabsOf(rows))).toBe("Slab 2 ends (day 20) before it starts (day 31).");
    rows[1].to = "60";
    rows[2].to = "90";
    expect(ladderFault(slabsOf(rows))).toMatch(/^The last slab must be open ended/);
    expect(ladderFault([])).toBe("The ladder needs at least one slab.");
  });

  it("adds a 30-day slab before the open-ended one", () => {
    const { rows, at } = addSlab(rowsFromLadder(DEFAULT));
    expect(at).toBe(2);
    expect(rows.map((r) => r.label)).toEqual(["0-30 days", "31-60 days", "61-90 days", "Over 60 days"]);
    const slabs = slabsOf(rows);
    expect(slabs[3].from).toBe(91);
    expect(ladderFault(slabs)).toBe("");
  });

  it("removes the chosen slab and keeps the last open", () => {
    const rows = removeSlab(rowsFromLadder(DEFAULT), 2);
    expect(rows).toHaveLength(2);
    expect(rows[1].to).toBe("");
    expect(slabsOf(rows)[1].from).toBe(31);
    expect(removeSlab(rows.slice(0, 1), 0)).toHaveLength(1);
  });

  it("sends slabNo 1..n and a null open end", () => {
    const body = buildSavePayload("c1", slabsOf(rowsFromLadder(DEFAULT)));
    expect(body.slabs.map((s) => s.slabNo)).toEqual([1, 2, 3]);
    expect(body.slabs[2]).toEqual({ slabNo: 3, label: "Over 60 days", fromDays: 61, toDays: null });
  });

  it("says what a slab covers", () => {
    const slabs = slabsOf(rowsFromLadder(DEFAULT));
    expect(coversText(slabs[0], false)).toBe("31 days");
    expect(coversText(slabs[2], true)).toBe("open ended");
    expect(coversText({ label: "a", from: 5, to: 5 }, false)).toBe("1 day");
  });

  it("lays the ladder across the axis, the open end running to the edge", () => {
    const { bands, ticks } = coverageLayout(slabsOf(rowsFromLadder(DEFAULT)));
    expect(bands[0].left).toBe(0);
    expect(bands[2].left + bands[2].width).toBeCloseTo(100);
    expect(bands[2].open).toBe(true);
    expect(ticks[0]).toEqual({ day: 0, left: 0 });
  });
});
