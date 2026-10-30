import { describe, expect, it } from "vitest";
import {
  ALLOC_COL,
  allocEntriesOf,
  allocProblem,
  allocRowHas,
  applyRatioPack,
  blankAllocRow,
  editAllocRow,
  initialAllocRows,
  nameAllocRows,
  ratioOf,
  ratioPackSummary,
  resolveAllocColumns,
  withTrailingBlank,
  type AllocRow,
} from "./purchase-alloc";
import { allocDtoOf, type PurchaseAllocNeed } from "./purchase-dialogs.types";

function keys() {
  let n = 0;
  return () => `k${(n += 1)}`;
}

const NEED: PurchaseAllocNeed = {
  received: 10,
  damaged: 2,
  free: 1,
  serial: false,
  textile: false,
  godownId: "g-main",
  godownName: "MAIN",
};

function row(patch: Partial<AllocRow>): AllocRow {
  return { ...blankAllocRow("r"), godownId: "g-main", godownName: "MAIN", ...patch };
}

describe("initialAllocRows", () => {
  it("opens a plain line as one SALEABLE row and one DAMAGED row", () => {
    const rows = initialAllocRows(NEED, [], keys());
    expect(rows.map((r) => [r.bucket, r.qty, r.free, r.godownName])).toEqual([
      ["SALEABLE", "10", "1", "MAIN"],
      ["DAMAGED", "2", "", "MAIN"],
    ]);
  });

  it("opens a serial line as one row per piece: received, then free, then damaged", () => {
    const rows = initialAllocRows({ ...NEED, serial: true, received: 2, free: 1, damaged: 1 }, [], keys());
    expect(rows.map((r) => [r.bucket, r.qty, r.free])).toEqual([
      ["SALEABLE", "1", ""],
      ["SALEABLE", "1", ""],
      ["SALEABLE", "", "1"],
      ["DAMAGED", "1", ""],
    ]);
  });

  it("keeps the given split, names from the lists, another godown by id", () => {
    const rows = initialAllocRows(
      { ...NEED, textile: true },
      [
        { bucket: "SALEABLE", qty: 4, sizeId: "s1", colourId: "c1", model: "M1", godownId: "g-2", expiryDate: "2027-03-31" },
        { bucket: "DAMAGED", qty: 2 },
      ],
      keys(),
      { sizes: [{ id: "s1", name: "M" }], colours: [{ id: "c1", name: "RED" }], godowns: [{ id: "g-2", name: "BACK" }] },
    );
    expect(rows[0]).toMatchObject({ sizeName: "M", colourName: "RED", godownId: "g-2", godownName: "BACK", qty: "4", expiryDate: "2027-03-31" });
    expect(rows[1]).toMatchObject({ bucket: "DAMAGED", godownId: "g-main", godownName: "MAIN" });
  });
});

describe("allocProblem", () => {
  it("is empty when the rows add up", () => {
    expect(allocProblem(initialAllocRows(NEED, [], keys()), NEED)).toBe("");
  });

  it("names the totals when they do not", () => {
    const rows = [row({ qty: "9", free: "1" }), row({ bucket: "DAMAGED", qty: "2" })];
    expect(allocProblem(rows, NEED)).toBe("The rows hold 9 received + 2 damaged + 1 free; the line says 10 + 2 + 1.");
  });

  it("refuses a row with no qty, free on a DAMAGED row, a batch beside a size", () => {
    expect(allocProblem([row({ batchNo: "B1" })], NEED)).toBe("Row 1: no qty.");
    expect(allocProblem([row({ qty: "10" }), row({ bucket: "DAMAGED", qty: "2", free: "1" })], NEED)).toBe(
      "Row 2: free goods are not damaged — put them in a SALEABLE row.",
    );
    expect(allocProblem([row({ qty: "10", free: "1", batchNo: "B1", sizeId: "s1" })], { ...NEED, textile: true })).toMatch(
      /^Row 1: size, colour and model ride on the batch number/,
    );
  });

  it("skips blank rows but numbers rows as shown", () => {
    const rows = [blankAllocRow("a"), row({ qty: "-1" })];
    expect(allocProblem(rows, NEED)).toBe("Row 2: no qty.");
  });

  it("checks serial rows: a number, one piece, no repeats (case-blind)", () => {
    const need = { ...NEED, serial: true, received: 2, damaged: 0, free: 0 };
    expect(allocProblem([row({ qty: "1" }), row({ qty: "1", serialNo: "B" })], need)).toBe("Row 1: no serial number.");
    expect(allocProblem([row({ qty: "2", serialNo: "A" })], need)).toBe("Row 1: a serial row is one piece.");
    expect(allocProblem([row({ qty: "1", serialNo: "ab1" }), row({ qty: "1", serialNo: "AB1" })], need)).toBe(
      "Row 2: serial AB1 is entered twice.",
    );
    expect(allocProblem([row({ qty: "1", serialNo: "A" }), row({ qty: "1", serialNo: "B" })], need)).toBe("");
  });
});

describe("editing", () => {
  it("a serial typed on an empty row is one piece in the document's godown", () => {
    const need = { ...NEED, serial: true };
    const edited = editAllocRow(blankAllocRow("x"), { serialNo: "SN1" }, need);
    expect(edited).toMatchObject({ qty: "1", godownId: "g-main", godownName: "MAIN", bucket: "SALEABLE" });
  });

  it("keeps exactly one blank row at the foot", () => {
    const make = keys();
    const one = withTrailingBlank([row({ qty: "1" })], make);
    expect(one).toHaveLength(2);
    expect(allocRowHas(one[1])).toBe(false);
    expect(withTrailingBlank(one, make)).toHaveLength(2);
  });

  it("fills names a late list knows, same array when nothing changes", () => {
    const rows = [row({ godownId: "g-2", godownName: "", qty: "1" })];
    expect(nameAllocRows(rows, { godowns: [{ id: "g-2", name: "BACK" }] })[0].godownName).toBe("BACK");
    expect(nameAllocRows(rows, {})).toBe(rows);
  });
});

describe("allocEntriesOf", () => {
  it("drops blank rows, sends ISO dates, numbers, and the document's godown by default", () => {
    const entries = allocEntriesOf(
      [row({ godownId: "", godownName: "", batchNo: " B1 ", expiryDate: "2027-01-31", mrp: "120", qty: "10", free: "1" }), blankAllocRow("b")],
      NEED,
    );
    expect(entries).toEqual([
      { godownId: "g-main", godownName: "MAIN", bucket: "SALEABLE", batchNo: "B1", expiryDate: "2027-01-31", mrp: 120, qty: 10, freeQty: 1 },
    ]);
    expect(allocDtoOf(entries[0])).toEqual({ godownId: "g-main", bucket: "SALEABLE", batchNo: "B1", expiryDate: "2027-01-31", mrp: 120, qty: 10, freeQty: 1 });
  });
});

describe("ratio pack", () => {
  const need = { ...NEED, textile: true, received: 18, damaged: 2, free: 0 };
  const sizes = [
    { id: "s", name: "S", ratio: 1 },
    { id: "m", name: "M", ratio: 2 },
    { id: "l", name: "L", ratio: 2 },
    { id: "xl", name: "XL", ratio: 1 },
  ];

  it("1 : 2 : 2 : 1 × 3 packs = 3 / 6 / 6 / 3 per colour, replacing un-batched SALEABLE rows", () => {
    const rows = [row({ qty: "18" }), row({ bucket: "DAMAGED", qty: "2" }), row({ batchNo: "OLD", qty: "1" }), blankAllocRow("z")];
    const out = applyRatioPack(rows, { model: " M7 ", colours: [], sizes, packs: 3 }, need, keys());
    expect(out.map((r) => [r.bucket, r.batchNo, r.sizeName, r.qty, r.model])).toEqual([
      ["DAMAGED", "", "", "2", ""],
      ["SALEABLE", "OLD", "", "1", ""],
      ["SALEABLE", "", "S", "3", "M7"],
      ["SALEABLE", "", "M", "6", "M7"],
      ["SALEABLE", "", "L", "6", "M7"],
      ["SALEABLE", "", "XL", "3", "M7"],
    ]);
  });

  it("makes one set per ticked colour", () => {
    const colours = [
      { id: "r", name: "RED" },
      { id: "b", name: "BLUE" },
    ];
    const out = applyRatioPack([], { model: "", colours, sizes: sizes.slice(0, 2), packs: 2 }, need, keys());
    expect(out.map((r) => `${r.colourName}/${r.sizeName}=${r.qty}`)).toEqual(["RED/S=2", "RED/M=4", "BLUE/S=2", "BLUE/M=4"]);
    expect(ratioPackSummary({ model: "", colours, sizes: sizes.slice(0, 2), packs: 2 })).toEqual({ perPack: 3, colours: 2, pieces: 12, rows: 4 });
  });

  it("reads a typed ratio as whole pieces", () => {
    expect([ratioOf("2"), ratioOf(""), ratioOf("-1"), ratioOf("x")]).toEqual([2, 0, 0, 0]);
  });
});

describe("resolveAllocColumns", () => {
  it("draws the textile three only for a textile line, in the layout's order", () => {
    expect(resolveAllocColumns(undefined, { serial: false, textile: false }).map((c) => c.no)).not.toContain(ALLOC_COL.size);
    const textile = resolveAllocColumns(undefined, { serial: false, textile: true }).map((c) => c.no);
    expect(textile.slice(0, 6)).toEqual([ALLOC_COL.godown, ALLOC_COL.bucket, ALLOC_COL.batch, ALLOC_COL.model, ALLOC_COL.size, ALLOC_COL.colour]);
    const total = resolveAllocColumns(undefined, { serial: false, textile: true }).reduce((sum, c) => sum + c.widthPct, 0);
    expect(total).toBeCloseTo(100);
  });

  it("falls back to Qt's stops when the layout flags none", () => {
    const layout = Object.values(ALLOC_COL).map((no) => ({
      uiTblClmId: String(no),
      uiTblClmNo: String(no),
      uiTblClmName: null,
      uiTblClmColumnWidth: 5,
      uiTblClmColumnVisibility: true,
      uiTblClmColumnFocus: false,
      uiTblClmColumnPosition: no,
      uiTblClmColumnNecessity: false,
    }));
    const serial = resolveAllocColumns(layout, { serial: true, textile: false });
    expect(serial.filter((c) => c.focus).map((c) => c.no)).toEqual([ALLOC_COL.serial]);
  });
});
