/**
 * The Enter walk, driven against a hand-built cell list.
 *
 * No jsdom in this repo (the vitest env is `node`), and the walker needs none:
 * it only ever calls `querySelectorAll`, `getAttribute`, `hasAttribute` and
 * `focus`, so a stub `document` returning the cells in DOM order is the whole
 * fixture. What is worth pinning here is the row hop — a layout whose flagged
 * columns are all disabled on the trailing blank row used to leave Enter dead on
 * the last line with data.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { focusNextRowAfterRender, moveCellFocus } from "./grid-focus";

type Cell = {
  row: string;
  field: string;
  disabled: boolean;
  flagged: boolean;
  lookup?: boolean;
  focused?: boolean;
};

let cells: Cell[] = [];
let focused: Cell | null = null;

function makeElement(cell: Cell) {
  const element = {
    disabled: cell.disabled,
    getAttribute(name: string) {
      return name === "data-quotation-row" ? cell.row : name === "data-quotation-field" ? cell.field : null;
    },
    hasAttribute(name: string) {
      if (name === "data-quotation-focus-stop") return cell.flagged;
      if (name === "data-quotation-lookup") return Boolean(cell.lookup);
      return false;
    },
    focus() {
      focused = cell;
    },
    select() {},
    cell,
  };
  return element as unknown as HTMLInputElement & { cell: Cell };
}

let elements: (HTMLInputElement & { cell: Cell })[] = [];

beforeEach(() => {
  focused = null;
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => elements,
  };
});

function build(list: Cell[]) {
  cells = list;
  elements = cells.map(makeElement);
}

function elementFor(row: string, field: string) {
  return elements.find((element) => element.cell.row === row && element.cell.field === field)!;
}

/** Grid 23 shape: a priced row, then the blank trailing row. */
function gridWithBlankTail(flagLookup: boolean) {
  build([
    { row: "r1", field: "barcode", disabled: false, flagged: false },
    { row: "r1", field: "itemName", disabled: false, flagged: flagLookup, lookup: true },
    { row: "r1", field: "qty", disabled: false, flagged: true },
    { row: "r1", field: "rate", disabled: false, flagged: true },
    { row: "r1", field: "total", disabled: true, flagged: false },
    { row: "r2", field: "barcode", disabled: false, flagged: false },
    { row: "r2", field: "itemName", disabled: false, flagged: flagLookup, lookup: true },
    { row: "r2", field: "qty", disabled: true, flagged: true },
    { row: "r2", field: "rate", disabled: true, flagged: true },
  ]);
}

describe("moveCellFocus", () => {
  it("walks the flagged chain inside a row", () => {
    gridWithBlankTail(true);
    expect(moveCellFocus("items", elementFor("r1", "qty"), 1)).toBe(true);
    expect(focused!.field).toBe("rate");
    expect(focused!.row).toBe("r1");
  });

  it("steps off the last stop into the next row's lookup (the reported bug)", () => {
    gridWithBlankTail(false); // layout flags only Qty and Rate
    expect(moveCellFocus("items", elementFor("r1", "rate"), 1)).toBe(true);
    expect(focused!.row).toBe("r2");
    expect(focused!.field).toBe("itemName");
  });

  it("lands on the next row's first flagged cell when it has one", () => {
    build([
      { row: "r1", field: "itemName", disabled: false, flagged: true, lookup: true },
      { row: "r1", field: "rate", disabled: false, flagged: true },
      { row: "r2", field: "itemName", disabled: false, flagged: true, lookup: true },
      { row: "r2", field: "rate", disabled: false, flagged: true },
    ]);
    expect(moveCellFocus("items", elementFor("r1", "rate"), 1)).toBe(true);
    expect(focused!.row).toBe("r2");
    expect(focused!.field).toBe("itemName");
  });

  it("joins the chain from an unflagged cell", () => {
    gridWithBlankTail(true);
    expect(moveCellFocus("items", elementFor("r1", "barcode"), 1)).toBe(true);
    expect(focused!.field).toBe("itemName");
  });

  it("stops at every editable cell when nothing is flagged", () => {
    build([
      { row: "r1", field: "itemName", disabled: false, flagged: false, lookup: true },
      { row: "r1", field: "qty", disabled: false, flagged: false },
      { row: "r2", field: "itemName", disabled: false, flagged: false, lookup: true },
    ]);
    expect(moveCellFocus("items", elementFor("r1", "itemName"), 1)).toBe(true);
    expect(focused!.field).toBe("qty");
    expect(moveCellFocus("items", elementFor("r1", "qty"), 1)).toBe(true);
    expect(focused!.row).toBe("r2");
  });

  it("walks backwards into the previous row", () => {
    gridWithBlankTail(false);
    // The blank row flags nothing, so it falls back to its own editable cells.
    expect(moveCellFocus("items", elementFor("r2", "itemName"), -1)).toBe(true);
    expect(focused!.row).toBe("r2");
    expect(focused!.field).toBe("barcode");
    expect(moveCellFocus("items", elementFor("r2", "barcode"), -1)).toBe(true);
    expect(focused!.row).toBe("r1");
    expect(focused!.field).toBe("rate");
  });

  it("declines at the very end of the grid", () => {
    gridWithBlankTail(false);
    expect(moveCellFocus("items", elementFor("r2", "itemName"), 1)).toBe(false);
  });
});

/**
 * Alt+R's landing spot. The copy does not exist when the shortcut fires, so the
 * helper is told the row it was copied FROM and takes the one after it; the
 * frame it waits for is run straight through here.
 */
describe("focusNextRowAfterRender", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      requestAnimationFrame: (callback: () => void) => {
        callback();
        return 0;
      },
    };
  });

  it("lands on the same column of the row beneath", () => {
    gridWithBlankTail(true);
    focusNextRowAfterRender("items", "r1", "barcode");
    expect(focused!.row).toBe("r2");
    expect(focused!.field).toBe("barcode");
  });

  it("falls back to the next row's entry stop when that column is disabled there", () => {
    // The trailing blank row has Qty shut until it names an item.
    gridWithBlankTail(true);
    focusNextRowAfterRender("items", "r1", "qty");
    expect(focused!.row).toBe("r2");
    expect(focused!.field).toBe("itemName");
  });

  it("falls back to the entry stop when no column is named at all", () => {
    gridWithBlankTail(false);
    focusNextRowAfterRender("items", "r1", null);
    expect(focused!.row).toBe("r2");
    expect(focused!.field).toBe("itemName");
  });

  it("does nothing when the named row is the last one", () => {
    gridWithBlankTail(true);
    focusNextRowAfterRender("items", "r2", "barcode");
    expect(focused).toBeNull();
  });

  it("does nothing when the named row is not in the grid", () => {
    gridWithBlankTail(true);
    focusNextRowAfterRender("items", "gone", "barcode");
    expect(focused).toBeNull();
  });
});
