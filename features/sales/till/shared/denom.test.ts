import { describe, expect, it } from "vitest";
import {
  EMPTY_COUNT,
  countLines,
  countedPaise,
  layoutDenominations,
  parseQty,
  toDenominations,
  withQty,
  type DenomCountValue,
} from "./denom";

const ROWS = [
  { tdnId: "c10", tdnLabel: "₹10 coin", tdnKind: "COIN", tdnValue: 10 },
  { tdnId: "n500", tdnLabel: "₹500", tdnKind: "NOTE", tdnValue: 500 },
  { tdnId: "n100", tdnLabel: "₹100", tdnKind: "NOTE", tdnValue: "100.00" },
  { tdnId: "c1", tdnLabel: "₹1", tdnKind: "COIN", tdnValue: 1 },
  { tdnId: "", tdnLabel: "broken", tdnKind: "NOTE", tdnValue: 5 },
];

describe("toDenominations / layoutDenominations", () => {
  it("drops rows with no id and prices in paise", () => {
    const list = toDenominations(ROWS);
    expect(list.map((d) => d.id)).toEqual(["c10", "n500", "n100", "c1"]);
    expect(list[2].valuePaise).toBe(10000);
  });

  it("puts the notes left and the coins right, keeping the server's order in each", () => {
    const layout = layoutDenominations(toDenominations(ROWS));
    expect(layout.left.map((d) => d.id)).toEqual(["n500", "n100"]);
    expect(layout.right.map((d) => d.id)).toEqual(["c10", "c1"]);
    expect(layout.ordered.map((d) => d.id)).toEqual(["n500", "n100", "c10", "c1"]);
  });

  it("splits half and half when there are no kinds", () => {
    const list = toDenominations([
      { tdnId: "a", tdnLabel: "A", tdnKind: "", tdnValue: 1 },
      { tdnId: "b", tdnLabel: "B", tdnKind: "", tdnValue: 2 },
      { tdnId: "c", tdnLabel: "C", tdnKind: "", tdnValue: 3 },
    ]);
    const layout = layoutDenominations(list);
    expect(layout.left.map((d) => d.id)).toEqual(["a", "b"]);
    expect(layout.right.map((d) => d.id)).toEqual(["c"]);
  });
});

describe("the count", () => {
  const list = toDenominations(ROWS);

  it("totals qty × face value plus the loose figure, in paise", () => {
    let value: DenomCountValue = EMPTY_COUNT;
    value = withQty(value, "n500", 4);
    value = withQty(value, "c10", 3);
    value = { ...value, loose: "2.50" };
    expect(countedPaise(list, value)).toBe(200000 + 3000 + 250);
  });

  it("posts qty > 0 lines in screen order, then the loose figure as enteredAmount", () => {
    let value: DenomCountValue = EMPTY_COUNT;
    value = withQty(value, "c1", 7);
    value = withQty(value, "n500", 4);
    value = withQty(value, "n100", 0);
    value = { ...value, loose: "12.5" };
    expect(countLines(list, value)).toEqual([
      { tenderTypeId: 1, denominationId: "n500", qty: 4 },
      { tenderTypeId: 1, denominationId: "c1", qty: 7 },
      { tenderTypeId: 1, enteredAmount: 12.5 },
    ]);
  });

  it("posts nothing for an empty drawer", () => {
    expect(countLines(list, EMPTY_COUNT)).toEqual([]);
    expect(countedPaise(list, EMPTY_COUNT)).toBe(0);
  });

  it("reads a typed qty as digits only", () => {
    expect(parseQty("")).toBe(0);
    expect(parseQty("12")).toBe(12);
    expect(parseQty("1.5")).toBeNull();
    expect(parseQty("1234567")).toBe(99999);
  });
});
