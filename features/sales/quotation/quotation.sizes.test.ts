import { describe, expect, it } from "vitest";
import { createDraftLine } from "./quotation.state";
import {
  applySizeEntry,
  createSizeEntryRow,
  findSizeGroup,
  openSizeEntry,
  sizeEntryTotals,
  sizeGroupKeyOf,
  sizeRowAmount,
  sizeRowQty,
  validateSizeEntry,
  type SizeEntryRow,
} from "./quotation.sizes";
import type { DraftLine } from "./quotation.types";
import { splitSizeFactors } from "./quotation.utils";

function line(overrides: Partial<DraftLine> = {}): DraftLine {
  return createDraftLine({ itemId: "item-1", itemName: "Teak plank", rate: 250, ...overrides });
}

/** A dialog row keyed with a size and nothing else — Qty follows the CFT. */
function sizeRow(size: string, overrides: Partial<SizeEntryRow> = {}): SizeEntryRow {
  return {
    ...createSizeEntryRow(250),
    factors: splitSizeFactors(size),
    ...overrides,
  };
}

/** Deterministic keys, so a replacement can be asserted on exactly. */
function keyMaker(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `new-${next}`;
  };
}

describe("sizeGroupKeyOf", () => {
  it("is null for a blank row, so the trailing row is never a group", () => {
    expect(sizeGroupKeyOf(createDraftLine())).toBeNull();
  });

  it("is null for an item row with no size", () => {
    expect(sizeGroupKeyOf(line({ itemSize: null }))).toBeNull();
    expect(sizeGroupKeyOf(line({ itemSize: "   " }))).toBeNull();
  });

  it("falls back to the item id for a loaded line that carries a size", () => {
    // `lineGroupKey` is not persisted, so this is the only thing that makes a
    // saved multi-size item re-open as one group.
    expect(sizeGroupKeyOf(line({ itemSize: "45*2*2*6" }))).toBe("item-1");
  });

  it("prefers the stamp the dialog wrote", () => {
    expect(sizeGroupKeyOf(line({ itemSize: null, lineGroupKey: "item-9" }))).toBe("item-9");
  });
});

describe("findSizeGroup", () => {
  it("returns nothing for a row that names no item", () => {
    const lines = [createDraftLine({ key: "blank" })];
    expect(findSizeGroup(lines, "blank")).toBeNull();
  });

  it("returns nothing for a row key that is not in the grid", () => {
    expect(findSizeGroup([line({ key: "a" })], "nope")).toBeNull();
  });

  it("is a group of one for an item row with no size", () => {
    const lines = [line({ key: "a" }), line({ key: "b", itemId: "item-2" })];
    expect(findSizeGroup(lines, "a")).toMatchObject({ start: 0, end: 0 });
  });

  it("spans the whole adjacent run, from any row inside it", () => {
    const lines = [
      line({ key: "other", itemId: "item-0", itemSize: "1*1*1*1" }),
      line({ key: "a", itemSize: "45*2*2*6" }),
      line({ key: "b", itemSize: "45*2*2*8" }),
      line({ key: "c", itemSize: "45*2*2*10" }),
      line({ key: "tail", itemId: "item-2", itemSize: "2*2*2*2" }),
    ];
    for (const anchor of ["a", "b", "c"]) {
      const group = findSizeGroup(lines, anchor);
      expect(group).toMatchObject({ start: 1, end: 3 });
      expect(group?.lines.map((row) => row.key)).toEqual(["a", "b", "c"]);
    }
  });

  it("stops at a row of the same item that carries no size", () => {
    // Two batches of one item, or an Alt+R copy, are not sizes of one line and
    // must not be swept into a dialog that would rewrite them.
    const lines = [
      line({ key: "a", itemSize: "45*2*2*6" }),
      line({ key: "plain", itemSize: null }),
      line({ key: "b", itemSize: "45*2*2*8" }),
    ];
    expect(findSizeGroup(lines, "a")).toMatchObject({ start: 0, end: 0 });
    expect(findSizeGroup(lines, "b")).toMatchObject({ start: 2, end: 2 });
  });

  it("does not join two runs of the same item that are not adjacent", () => {
    const lines = [
      line({ key: "a", itemSize: "45*2*2*6" }),
      line({ key: "gap", itemId: "item-2", itemSize: "1*1*1*1" }),
      line({ key: "b", itemSize: "45*2*2*8" }),
    ];
    expect(findSizeGroup(lines, "a")).toMatchObject({ start: 0, end: 0 });
  });
});

describe("sizeRowQty", () => {
  it("follows the size's CFT while the operator has not keyed one", () => {
    // 45 ft × 2 in × 2 in × 6 pieces / 144 = 7.5 CFT.
    expect(sizeRowQty(sizeRow("45*2*2*6"))).toBe(7.5);
  });

  it("uses the keyed quantity once it is touched, even against the size", () => {
    const row = sizeRow("45*2*2*6", { qty: "3", qtyTouched: true });
    expect(sizeRowQty(row)).toBe(3);
  });

  it("reads a blank or unparseable size as no quantity, never NaN", () => {
    expect(sizeRowQty(sizeRow(""))).toBe(0);
    expect(sizeRowQty(sizeRow("45*"))).toBe(45);
    expect(sizeRowQty({ ...sizeRow(""), qty: "abc", qtyTouched: true })).toBe(0);
  });
});

describe("sizeRowAmount / sizeEntryTotals", () => {
  it("is qty × rate, rounded to the money precision", () => {
    expect(sizeRowAmount(sizeRow("45*2*2*6"))).toBe(1875);
  });

  it("totals the rows the footer shows", () => {
    const rows = [sizeRow("45*2*2*6"), sizeRow("45*2*2*12")];
    expect(sizeEntryTotals(rows)).toEqual({ qty: 22.5, amount: 5625 });
  });
});

describe("validateSizeEntry", () => {
  it("blocks an empty grid with a dialog-level message", () => {
    const result = validateSizeEntry([]);
    expect(result.ok).toBe(false);
    expect(result.formError).toBe("Add at least one size.");
  });

  it("passes a well-keyed row", () => {
    expect(validateSizeEntry([sizeRow("45*2*2*6")]).ok).toBe(true);
  });

  it("requires a size", () => {
    const row = sizeRow("", { qty: "5", qtyTouched: true });
    expect(validateSizeEntry([row]).rows[row.key].size).toBeTruthy();
  });

  it("flags BOTH rows of a duplicated size, not just the later one", () => {
    const first = sizeRow("45*2*2*6");
    const second = sizeRow("45*2*2*6");
    const result = validateSizeEntry([first, second]);
    expect(result.ok).toBe(false);
    expect(result.rows[first.key].size).toMatch(/more than one row/);
    expect(result.rows[second.key].size).toMatch(/more than one row/);
  });

  it("does not call two different sizes a duplicate", () => {
    expect(validateSizeEntry([sizeRow("45*2*2*6"), sizeRow("45*2*2*8")]).ok).toBe(true);
  });

  it("rejects a zero or negative qty", () => {
    const zero = sizeRow("45*2*2*6", { qty: "0", qtyTouched: true });
    const negative = sizeRow("45*2*2*8", { qty: "-1", qtyTouched: true });
    const result = validateSizeEntry([zero, negative]);
    expect(result.rows[zero.key].qty).toBeTruthy();
    expect(result.rows[negative.key].qty).toBeTruthy();
  });

  it("blames the size, not the Qty cell, when an untouched row works out to nothing", () => {
    const row = sizeRow("");
    expect(validateSizeEntry([row]).rows[row.key].qty).toMatch(/works out to no quantity/);
  });

  it("allows a zero rate but not a negative one", () => {
    const free = sizeRow("45*2*2*6", { rate: "0" });
    const negative = sizeRow("45*2*2*8", { rate: "-5" });
    expect(validateSizeEntry([free]).ok).toBe(true);
    expect(validateSizeEntry([negative]).rows[negative.key].rate).toBeTruthy();
  });
});

describe("openSizeEntry", () => {
  it("pre-fills one row per line of the group, with Qty already keyed", () => {
    const group = findSizeGroup(
      [
        line({ key: "a", itemSize: "45*2*2*6", billQty: 7.5, rate: 250 }),
        line({ key: "b", itemSize: "45*2*2*8", billQty: 4, rate: 260 }),
      ],
      "a",
    );
    const rows = openSizeEntry(group!);
    expect(rows).toHaveLength(2);
    expect(rows[0].factors).toEqual(["45", "2", "2", "6"]);
    expect(rows[0].qty).toBe("7.5");
    expect(rows[1].rate).toBe("260");
    // The stored Bill Qty was quoted; re-deriving it on open would overwrite a
    // quantity the operator had cut short.
    expect(rows.every((row) => row.qtyTouched)).toBe(true);
  });

  it("protects a stored quantity that disagrees with the size, until the size is edited", () => {
    // A board cut short: 45*2*2*6 is 7.5 CFT but only 6 was quoted. Opening the
    // dialog must show 6, not silently reset it.
    const group = findSizeGroup([line({ key: "a", itemSize: "45*2*2*6", billQty: 6 })], "a");
    const [row] = openSizeEntry(group!);
    expect(row.qtyTouched).toBe(true);
    expect(sizeRowQty(row)).toBe(6);
    // …but editing the dimensions re-derives it, the same as keying a size in
    // the grid's own Size cell does. That transition is the modal's (it clears
    // `qtyTouched` on a size edit); here it is the resulting row that matters.
    expect(sizeRowQty({ ...row, factors: splitSizeFactors("45*2*2*12"), qtyTouched: false })).toBe(15);
  });

  it("lets a line with no quantity yet follow its size", () => {
    // The commonest path into this dialog: pick an item, open it straight away.
    // Opening such a row as "touched" would leave Qty blank however the
    // dimensions are keyed, and the dialog would block its own save.
    const group = findSizeGroup([line({ key: "a", itemSize: null, billQty: 0 })], "a");
    const [row] = openSizeEntry(group!);
    expect(row.qtyTouched).toBe(false);
    expect(sizeRowQty({ ...row, factors: splitSizeFactors("45*2*2*6") })).toBe(7.5);
  });
});

describe("applySizeEntry", () => {
  const base = () => [
    line({ key: "before", itemId: "item-0", itemName: "Cement" }),
    line({ key: "target", itemSize: null, discPerc: 5, splDiscPerc: 2, gstPerc: 18, sqiId: "sq-1" }),
    line({ key: "after", itemId: "item-2", itemName: "Nails" }),
  ];

  /** The real flow: open on a row, keep its dialog row, add more sizes. */
  function reSize(lines: DraftLine[], anchor: string, sizes: string[]): DraftLine[] {
    const opened = openSizeEntry(findSizeGroup(lines, anchor)!);
    const rows = sizes.map((size, index) =>
      index < opened.length
        ? { ...opened[index], factors: splitSizeFactors(size), qty: "", qtyTouched: false }
        : sizeRow(size),
    );
    return applySizeEntry(lines, anchor, rows, keyMaker());
  }

  it("replaces the clicked row with one row per size, at the same index", () => {
    const next = reSize(base(), "target", ["45*2*2*6", "45*2*2*12"]);
    expect(next.map((row) => row.key)).toEqual(["before", "target", "new-1", "after"]);
    expect(next[1].itemSize).toBe("45*2*2*6");
    expect(next[2].itemSize).toBe("45*2*2*12");
    expect(next[1].billQty).toBe(7.5);
    expect(next[2].billQty).toBe(15);
  });

  it("inserts every row as new when the operator replaced the original outright", () => {
    // No dialog row carries a source: the operator deleted the opened row and
    // added two of their own, so there is nothing to update and both insert.
    const next = applySizeEntry(
      base(),
      "target",
      [sizeRow("45*2*2*6"), sizeRow("45*2*2*12")],
      keyMaker(),
    );
    expect(next.map((row) => row.key)).toEqual(["before", "new-1", "new-2", "after"]);
    expect(next.slice(1, 3).every((row) => row.sqiId === null)).toBe(true);
  });

  it("leaves every line outside the group untouched, by identity", () => {
    const lines = base();
    const next = applySizeEntry(lines, "target", [sizeRow("45*2*2*6")], keyMaker());
    expect(next[0]).toBe(lines[0]);
    expect(next[next.length - 1]).toBe(lines[2]);
  });

  it("copies the discount and tax block onto every new row", () => {
    const next = applySizeEntry(
      base(),
      "target",
      [sizeRow("45*2*2*6"), sizeRow("45*2*2*12")],
      keyMaker(),
    );
    for (const row of next.slice(1, 3)) {
      expect(row).toMatchObject({
        itemId: "item-1",
        itemName: "Teak plank",
        discPerc: 5,
        splDiscPerc: 2,
        gstPerc: 18,
      });
    }
  });

  it("keeps an existing row's own identity and clears it on a new one", () => {
    const lines = base();
    const rows = openSizeEntry(findSizeGroup(lines, "target")!);
    const next = applySizeEntry(
      lines,
      "target",
      [rows[0], sizeRow("45*2*2*12")],
      keyMaker(),
    );
    // The existing line is UPDATEd on the next save, not inserted a second time.
    expect(next[1].key).toBe("target");
    expect(next[1].sqiId).toBe("sq-1");
    // The added one has never existed server-side.
    expect(next[2].key).toBe("new-1");
    expect(next[2].sqiId).toBeNull();
    expect(next[2].srcDocId).toBeNull();
  });

  it("stamps the group key on every row it writes", () => {
    const next = applySizeEntry(base(), "target", [sizeRow("45*2*2*6")], keyMaker());
    expect(next[1].lineGroupKey).toBe("item-1");
  });

  it("re-opens and saves a stamped group as a no-op on the identities", () => {
    const first = reSize(base(), "target", ["45*2*2*6", "45*2*2*12"]);
    const group = findSizeGroup(first, "target");
    expect(group).toMatchObject({ start: 1, end: 2 });
    const again = applySizeEntry(first, "target", openSizeEntry(group!), keyMaker());
    expect(again.map((row) => row.key)).toEqual(first.map((row) => row.key));
    expect(again.map((row) => row.itemSize)).toEqual(first.map((row) => row.itemSize));
    expect(again.map((row) => row.billQty)).toEqual(first.map((row) => row.billQty));
  });

  it("collapses a group back to one row, keeping that row's own identity", () => {
    const three = reSize(base(), "target", ["45*2*2*6", "45*2*2*8", "45*2*2*12"]);
    const rows = openSizeEntry(findSizeGroup(three, "target")!);
    const next = applySizeEntry(three, "target", [rows[1]], keyMaker());
    expect(next.map((row) => row.key)).toEqual(["before", three[2].key, "after"]);
    expect(next[1].itemSize).toBe("45*2*2*8");
  });

  it("writes a blank size as null, not an empty string", () => {
    // `sqi_size` is nullable and the payload builder trims to null; a row that
    // reaches here with no size (the caller bypassed validation) must match.
    const next = applySizeEntry(
      base(),
      "target",
      [{ ...sizeRow(""), qty: "3", qtyTouched: true }],
      keyMaker(),
    );
    expect(next[1].itemSize).toBeNull();
  });

  it("declines an empty row set rather than deleting the line", () => {
    const lines = base();
    expect(applySizeEntry(lines, "target", [], keyMaker())).toBe(lines);
  });

  it("declines a row key that is not in the grid", () => {
    const lines = base();
    expect(applySizeEntry(lines, "nope", [sizeRow("45*2*2*6")], keyMaker())).toBe(lines);
  });

  it("never emits two rows claiming one source line", () => {
    const lines = base();
    const [row] = openSizeEntry(findSizeGroup(lines, "target")!);
    const next = applySizeEntry(
      lines,
      "target",
      [row, { ...row, key: "clone", factors: splitSizeFactors("45*2*2*12") }],
      keyMaker(),
    );
    expect(next[1].key).toBe("target");
    expect(next[1].sqiId).toBe("sq-1");
    // The second claim is treated as a new row: one sqiId, one line.
    expect(next[2].key).toBe("new-1");
    expect(next[2].sqiId).toBeNull();
    expect(new Set(next.map((line) => line.key)).size).toBe(next.length);
  });
});
