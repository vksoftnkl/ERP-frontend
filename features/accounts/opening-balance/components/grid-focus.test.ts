/**
 * The keyboard walk, driven against a hand-built cell list.
 *
 * No jsdom in this repo (the vitest env is `node`), and the walker needs none:
 * it only ever calls `querySelectorAll`, `getAttribute`, `hasAttribute` and
 * `focus`, so a stub `document` returning the cells in DOM order is the whole
 * fixture — the same one the quotation grid's walker is tested against.
 *
 * What is worth pinning here is the ROW hop. Selecting a row is what opens or
 * closes a bill-wise breakup, so a row the walk steps over is a breakup only the
 * mouse can reach — and a bill-wise row's every other cell is disabled, which is
 * exactly how that happened once already.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  FIELD_ATTR,
  FOCUS_STOP_ATTR,
  GRID_ATTR,
  LOOKUP_ATTR,
  ROW_ATTR,
  focusGrid,
  focusedRowKey,
  moveCellFocus,
  moveRowFocus,
} from "./grid-focus";

type Cell = {
  grid: string;
  row: string;
  field: string;
  disabled?: boolean;
  flagged?: boolean;
  /** The picker cell: read-only, and its value decides whether Enter lands. */
  lookup?: boolean;
  value?: string;
};

let focused: Cell | null = null;
let elements: (HTMLInputElement & { cell: Cell })[] = [];

function makeElement(cell: Cell) {
  const element = {
    disabled: Boolean(cell.disabled),
    value: cell.value ?? "",
    type: "text",
    getAttribute(name: string) {
      if (name === GRID_ATTR) return cell.grid;
      if (name === ROW_ATTR) return cell.row;
      if (name === FIELD_ATTR) return cell.field;
      return null;
    },
    hasAttribute(name: string) {
      if (name === FOCUS_STOP_ATTR) return Boolean(cell.flagged);
      if (name === LOOKUP_ATTR) return Boolean(cell.lookup);
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

function build(list: Cell[], activeIndex = -1) {
  elements = list.map(makeElement);
  const active = activeIndex >= 0 ? elements[activeIndex] : null;
  (globalThis as unknown as { document: unknown }).document = {
    // The walker's selector always narrows to one grid; the stub filters the
    // same way so a two-grid fixture behaves like the real DOM.
    querySelectorAll: (selector: string) => {
      const grid = /\[data-ob-grid="([^"]+)"\]/.exec(selector)?.[1];
      return elements.filter((element) => !grid || element.cell.grid === grid);
    },
    querySelector: () => null,
    activeElement: active,
  };
  return elements;
}

beforeEach(() => {
  focused = null;
  elements = [];
});

/**
 * The ledger grid as ui table 30 configures it: Ledger and Opening flagged.
 *
 * The flags no longer subset where Enter STOPS — every editable cell is a stop —
 * so Dr/Cr is in the chain here even though the layout does not flag it. What
 * the flags still decide is where the walk LANDS when it steps into a row.
 */
const LEDGER_SET: Cell[] = [
  { grid: "ledgers", row: "r1", field: "ledger", flagged: true, lookup: true, value: "Cash in hand" },
  { grid: "ledgers", row: "r1", field: "opening", flagged: true },
  { grid: "ledgers", row: "r1", field: "drcr" },
  { grid: "ledgers", row: "r1", field: "remarks" },
  // A bill-wise party: its figure belongs to the bills, so BOTH money cells are
  // disabled, and Remarks is hidden on this layout. Only the read-only Ledger
  // cell keeps it in the walk.
  { grid: "ledgers", row: "r2", field: "ledger", flagged: true, lookup: true, value: "Acme Traders" },
  { grid: "ledgers", row: "r2", field: "opening", flagged: true, disabled: true },
  { grid: "ledgers", row: "r2", field: "drcr", disabled: true },
  // The trailing blank row: nothing opens until a ledger is picked.
  { grid: "ledgers", row: "r3", field: "ledger", flagged: true, lookup: true, value: "" },
  { grid: "ledgers", row: "r3", field: "opening", flagged: true, disabled: true },
];

describe("moveCellFocus — Enter goes to the next field", () => {
  it("steps to the next editable cell, flagged or not", () => {
    const cells = build(LEDGER_SET);
    moveCellFocus("ledgers", cells[0], 1);
    expect(focused?.field).toBe("opening");
  });

  it("REACHES a column the layout did not flag", () => {
    // The regression this rule exists for. Table 30 flags Ledger and Opening
    // only, so subsetting the walk by the flags left Dr/Cr unreachable — and a
    // liability cannot be opened without it.
    const cells = build(LEDGER_SET);
    moveCellFocus("ledgers", cells[1], 1);
    expect(focused).toMatchObject({ row: "r1", field: "drcr" });
  });

  it("walks a bill row that flags ONE column right through", () => {
    // Table 31 flags Invoice no alone. Subsetting by the flags walked that one
    // column straight down the grid, and the date, the days, the side, the
    // amount and the narration could not be keyed at all.
    const cells = build([
      { grid: "bills", row: "b1", field: "invoiceno", flagged: true },
      { grid: "bills", row: "b1", field: "invoicedate" },
      { grid: "bills", row: "b1", field: "amount" },
    ]);
    moveCellFocus("bills", cells[0], 1);
    expect(focused?.field).toBe("invoicedate");
    moveCellFocus("bills", cells[1], 1);
    expect(focused?.field).toBe("amount");
  });

  it("steps into the next row off the last cell of this one", () => {
    const cells = build(LEDGER_SET);
    moveCellFocus("ledgers", cells[3], 1);
    expect(focused?.row).toBe("r2");
  });

  it("goes back on Shift+Enter", () => {
    const cells = build(LEDGER_SET);
    moveCellFocus("ledgers", cells[1], -1);
    expect(focused?.field).toBe("ledger");
  });

  it("steps back into the LAST cell of the row above", () => {
    const cells = build(LEDGER_SET);
    moveCellFocus("ledgers", cells[4], -1);
    expect(focused).toMatchObject({ row: "r1", field: "remarks" });
  });
});

describe("entering a row — what the layout's focus flag still decides", () => {
  it("lands on the flagged column rather than the leftmost one", () => {
    const cells = build([
      { grid: "bills", row: "b1", field: "invoiceno" },
      { grid: "bills", row: "b1", field: "amount" },
      { grid: "bills", row: "b2", field: "invoiceno" },
      { grid: "bills", row: "b2", field: "amount", flagged: true },
    ]);
    moveCellFocus("bills", cells[1], 1);
    expect(focused).toMatchObject({ row: "b2", field: "amount" });
  });

  it("steps PAST the picker cell on a row that already names a ledger", () => {
    // Read-only, and a settled row cannot be repointed: landing there is a cell
    // the operator cannot type in and an Enter they have to press twice.
    const cells = build(LEDGER_SET);
    moveCellFocus("ledgers", cells[3], 1);
    expect(focused).toMatchObject({ row: "r2", field: "ledger" });
    // r2 is the bill-wise party, whose only enabled cell IS the picker — so
    // there is nothing past it to step to, and it stays the landing.
    focused = null;
    moveCellFocus("ledgers", cells[4], 1);
    expect(focused).toMatchObject({ row: "r3", field: "ledger" });
  });

  it("LANDS on the picker cell of the trailing blank row", () => {
    // Empty, so it is exactly where the operator wants to be.
    build(LEDGER_SET);
    const cells = elements;
    moveCellFocus("ledgers", cells[4], 1);
    expect(focused).toMatchObject({ row: "r3", field: "ledger", value: "" });
  });
});

describe("moveRowFocus — the arrow walk that opens a breakup", () => {
  it("keeps the column when the row being stepped into has it open", () => {
    const cells = build([
      { grid: "ledgers", row: "r1", field: "ledger", flagged: true },
      { grid: "ledgers", row: "r1", field: "opening", flagged: true },
      { grid: "ledgers", row: "r2", field: "ledger", flagged: true },
      { grid: "ledgers", row: "r2", field: "opening", flagged: true },
    ]);
    moveRowFocus("ledgers", cells[1], 1);
    expect(focused).toMatchObject({ row: "r2", field: "opening" });
  });

  it("REACHES a bill-wise row, whose every other cell is disabled", () => {
    // The regression this file exists for: made a `<span>` or disabled for
    // correctness, the Ledger cell left the row with nothing focusable at all —
    // and the arrow walk stepped straight over the one kind of row the breakup
    // panel exists for.
    const cells = build(LEDGER_SET);
    moveRowFocus("ledgers", cells[1], 1);
    expect(focused).toMatchObject({ row: "r2", field: "ledger" });
  });

  it("falls back to the row's entry cell when its column is shut", () => {
    const cells = build(LEDGER_SET);
    // From row 1's Dr/Cr down into the party row, which has no Dr/Cr open at
    // all — its figure belongs to the bills.
    moveRowFocus("ledgers", cells[2], 1);
    expect(focused).toMatchObject({ row: "r2", field: "ledger" });
  });

  it("goes up as well as down, and stops at the ends", () => {
    const cells = build(LEDGER_SET);
    expect(moveRowFocus("ledgers", cells[4], -1)).toBe(true);
    expect(focused?.row).toBe("r1");
    focused = null;
    expect(moveRowFocus("ledgers", cells[0], -1)).toBe(false);
    expect(focused).toBeNull();
  });

  it("never crosses into the other grid", () => {
    const cells = build([
      { grid: "ledgers", row: "r1", field: "ledger", flagged: true },
      { grid: "bills", row: "b1", field: "invoiceno", flagged: true },
    ]);
    expect(moveRowFocus("ledgers", cells[0], 1)).toBe(false);
  });
});

describe("focusGrid — the F1 step between the two panels", () => {
  it("lands on the first cell of the grid the operator can type in", () => {
    // Row 1 already names a ledger, so F1 steps past its read-only picker cell
    // rather than parking the caret where nothing can be keyed.
    build(LEDGER_SET);
    expect(focusGrid("ledgers")).toBe(true);
    expect(focused).toMatchObject({ row: "r1", field: "opening" });
  });

  it("answers false for a panel that is not on screen", () => {
    build(LEDGER_SET);
    expect(focusGrid("bills")).toBe(false);
  });
});

describe("focusedRowKey", () => {
  it("names the row the caret is in", () => {
    build(LEDGER_SET, 4);
    expect(focusedRowKey("ledgers")).toBe("r2");
  });

  it("is null when the caret is in another grid", () => {
    build(LEDGER_SET, 0);
    expect(focusedRowKey("bills")).toBeNull();
  });
});
