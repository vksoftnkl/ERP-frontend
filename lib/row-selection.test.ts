import { describe, expect, it } from "vitest";

import {
  allVisibleChecked,
  orderedSelection,
  someVisibleChecked,
  toggleRowIn,
  toggleVisibleIn,
  type SelectionMap,
} from "./row-selection";

type Row = { id: string; label: string };
const keyOf = (row: Row) => row.id;

const row = (id: string): Row => ({ id, label: `row ${id}` });
const page1 = [row("a"), row("b"), row("c")];
const page2 = [row("d"), row("e")];

const mapOf = (...rows: Row[]): SelectionMap<Row> =>
  new Map(rows.map((one) => [one.id, one]));

describe("toggleRowIn", () => {
  it("ticks a row that was not ticked", () => {
    const next = toggleRowIn(mapOf(), "a", row("a"));
    expect([...next.keys()]).toEqual(["a"]);
  });

  it("unticks a row that was", () => {
    const next = toggleRowIn(mapOf(row("a"), row("b")), "a", row("a"));
    expect([...next.keys()]).toEqual(["b"]);
  });

  it("never mutates what it was given", () => {
    // The Map is React state; mutating it in place would skip the re-render.
    const current = mapOf(row("a"));
    const next = toggleRowIn(current, "b", row("b"));
    expect(current.size).toBe(1);
    expect(next.size).toBe(2);
  });
});

describe("toggleVisibleIn", () => {
  it("ticks the whole page when none of it is ticked", () => {
    const next = toggleVisibleIn(mapOf(), page1, keyOf);
    expect([...next.keys()]).toEqual(["a", "b", "c"]);
  });

  it("ticks the rest of the page when only some of it is", () => {
    const next = toggleVisibleIn(mapOf(row("b")), page1, keyOf);
    expect([...next.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("unticks the page when all of it is already ticked", () => {
    const next = toggleVisibleIn(mapOf(...page1), page1, keyOf);
    expect(next.size).toBe(0);
  });

  it("clears only THIS page, never ticks made on another", () => {
    // The operator cannot see the other page's rows to put them back, so the
    // header box must not be able to throw them away.
    const current = mapOf(...page1, ...page2);
    const next = toggleVisibleIn(current, page1, keyOf);
    expect([...next.keys()]).toEqual(["d", "e"]);
  });

  it("does nothing useful on an empty page rather than claiming all-on", () => {
    const next = toggleVisibleIn(mapOf(row("d")), [], keyOf);
    expect([...next.keys()]).toEqual(["d"]);
  });
});

describe("allVisibleChecked / someVisibleChecked", () => {
  it("reads all, some and none", () => {
    expect(allVisibleChecked(mapOf(...page1), page1, keyOf)).toBe(true);
    expect(someVisibleChecked(mapOf(...page1), page1, keyOf)).toBe(false);

    expect(allVisibleChecked(mapOf(row("a")), page1, keyOf)).toBe(false);
    expect(someVisibleChecked(mapOf(row("a")), page1, keyOf)).toBe(true);

    expect(allVisibleChecked(mapOf(), page1, keyOf)).toBe(false);
    expect(someVisibleChecked(mapOf(), page1, keyOf)).toBe(false);
  });

  it("an empty page is not 'all checked'", () => {
    // `[].every()` is true, which would tick the header box on an empty list.
    expect(allVisibleChecked(mapOf(), [], keyOf)).toBe(false);
  });

  it("ignores rows ticked on another page", () => {
    // The header box describes THIS page; a tick on page 2 must not light it.
    expect(allVisibleChecked(mapOf(...page1, ...page2), page1, keyOf)).toBe(true);
    expect(someVisibleChecked(mapOf(...page2), page1, keyOf)).toBe(false);
  });
});

describe("orderedSelection", () => {
  it("is empty when nothing is ticked", () => {
    expect(orderedSelection(mapOf(), page1, keyOf)).toEqual([]);
  });

  it("returns this page's rows in LIST order, not click order", () => {
    // Ticked c, then a, then b — the paper must still come out a, b, c.
    const clicked = new Map([
      ["c", row("c")],
      ["a", row("a")],
      ["b", row("b")],
    ]);
    expect(orderedSelection(clicked, page1, keyOf).map(keyOf)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("puts rows ticked on another page after the visible ones", () => {
    const current = new Map([
      ["e", row("e")],
      ["b", row("b")],
      ["a", row("a")],
    ]);
    expect(orderedSelection(current, page1, keyOf).map(keyOf)).toEqual([
      "a",
      "b",
      "e",
    ]);
  });

  it("never repeats a row that is both ticked and visible", () => {
    const current = mapOf(...page1);
    expect(orderedSelection(current, page1, keyOf)).toHaveLength(3);
  });

  it("hands back every ticked row when none of them is on this page", () => {
    const current = mapOf(...page2);
    expect(orderedSelection(current, page1, keyOf).map(keyOf)).toEqual([
      "d",
      "e",
    ]);
  });
});
