/**
 * F1 walks the bill's panels.
 *
 * The walker is the quotation's `moveSectionFocus`, shared rather than copied.
 * What is worth pinning here is the SHAPE of this screen — Header → Items →
 * Charges → Terms, with the Adjust panel standing in for Terms while it is open
 * — and the three cases where a naive cycle would strand the operator.
 *
 * No jsdom (the vitest env is `node`) and the walker needs none: it calls
 * `document.querySelectorAll`, `section.contains`, `element.hasAttribute`,
 * reads `disabled` / `readOnly`, and calls `focus()` / `select()`. Stub panels
 * returning their fields in DOM order are the whole fixture — the same fixture
 * `grid-focus.test.ts` established.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { moveSectionFocus } from "@/features/sales/quotation/components/section-focus";

const GRID_FOCUS_STOP_ATTR = "data-quotation-focus-stop";

type Field = {
  id: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Flagged as a stop on this grid's own Enter chain. */
  gridStop?: boolean;
};

type Panel = { name: string; fields: Field[] };

/** One stub field, as the panels below hold them. */
type StubField = ReturnType<typeof makeField>;

let focused: string | null = null;
/** The element focus is currently sitting on, for `section.contains`. */
let active: object | null = null;
let panels: { name: string; element: HTMLElement; fields: StubField[] }[] = [];

/**
 * The walker asks `document.activeElement instanceof Node` before it looks for
 * the panel holding it — a real guard against a stale or foreign value — so a
 * plain object would be read as "focus is outside every panel" and every walk
 * would restart at the first one. The stub fields are therefore instances of a
 * stub `Node`, which is installed on `globalThis` below.
 */
class StubNode {}
Object.defineProperty(globalThis, "Node", { configurable: true, value: StubNode });

function makeField(field: Field) {
  const element = Object.assign(new StubNode(), {
    id: field.id,
    disabled: Boolean(field.disabled),
    readOnly: Boolean(field.readOnly),
    hasAttribute: (name: string) => name === GRID_FOCUS_STOP_ATTR && Boolean(field.gridStop),
    focus() {
      focused = field.id;
      active = element;
    },
    select() {},
  });
  return element;
}

function build(list: Panel[]) {
  panels = list.map((panel) => {
    const fields = panel.fields.map(makeField);
    const element = {
      querySelectorAll: () => fields,
      contains: (node: unknown) => fields.includes(node as StubField),
    } as unknown as HTMLElement;
    return { name: panel.name, element, fields };
  });
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => panels.map((panel) => panel.element),
    // A getter, not a snapshot: `focus()` moves it mid-walk and the next call
    // has to see where the last one landed.
    get activeElement() {
      return active;
    },
  };
}

/** Put focus where the walk should start from. */
function focusOn(panelName: string, fieldId: string) {
  const panel = panels.find((candidate) => candidate.name === panelName)!;
  active = panel.fields.find((field) => field.id === fieldId)!;
}

beforeEach(() => {
  focused = null;
  active = null;
  panels = [];
});

/**
 * The bill as it renders: four panels, and the two grids flag their own Enter
 * chain (grid 22 flags Description, Bill Qty and Rate).
 */
function billScreen() {
  build([
    {
      name: "Header",
      fields: [
        { id: "sale-bill-refno", readOnly: true },
        { id: "sale-bill-customer" },
        { id: "sale-bill-customer-name" },
      ],
    },
    {
      name: "Items",
      fields: [
        { id: "item-barcode" },
        { id: "item-description", gridStop: true },
        { id: "item-qty", gridStop: true },
      ],
    },
    {
      name: "Charges",
      fields: [{ id: "charge-name", gridStop: true }, { id: "charge-rate" }],
    },
    { name: "Terms", fields: [{ id: "bill-remarks" }] },
  ]);
}

describe("F1 cycles the panels", () => {
  it("steps Header → Items → Charges → Terms and round again", () => {
    billScreen();
    focusOn("Header", "sale-bill-customer");

    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("item-description");

    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("charge-name");

    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("bill-remarks");

    // Round again rather than stopping: a cycle has no end to be trapped at.
    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("sale-bill-customer");
  });

  it("Shift+F1 goes the other way", () => {
    billScreen();
    focusOn("Charges", "charge-name");
    expect(moveSectionFocus(-1)).toBe(true);
    expect(focused).toBe("item-description");
  });
});

describe("where F1 lands inside a panel", () => {
  it("lands on a grid's own Enter-chain stop, not its first control", () => {
    // The first control of an item row is the Barcode box — a scanner's target,
    // not something an operator arrives meaning to key. Description is the first
    // flagged stop, and it is where the Qt screen leaves them.
    billScreen();
    focusOn("Header", "sale-bill-customer");
    moveSectionFocus(1);
    expect(focused).toBe("item-description");
  });

  it("skips a READ-ONLY field when the panel flags no stop", () => {
    // The header's first box is the bill number, which the server assigns.
    // Landing there would waste the keypress.
    billScreen();
    focusOn("Terms", "bill-remarks");
    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("sale-bill-customer");
  });
});

describe("the panels F1 steps over", () => {
  it("steps over a panel with nothing keyable, rather than swallowing the key", () => {
    // Browse mode disables a panel whole. A cycle that stopped there would leave
    // the operator pressing F1 at a dead panel.
    build([
      { name: "Header", fields: [{ id: "h1" }] },
      { name: "Items", fields: [{ id: "i1", disabled: true }, { id: "i2", disabled: true }] },
      { name: "Charges", fields: [{ id: "c1" }] },
    ]);
    focusOn("Header", "h1");
    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("c1");
  });

  it("declines when no panel has anything to key", () => {
    // The whole screen is read-only. F1 does nothing rather than trapping focus.
    build([
      { name: "Header", fields: [{ id: "h1", disabled: true }] },
      { name: "Items", fields: [{ id: "i1", disabled: true }] },
    ]);
    focusOn("Header", "h1");
    expect(moveSectionFocus(1)).toBe(false);
    expect(focused).toBeNull();
  });

  it("has nothing to say about a panel that is not rendered", () => {
    // Terms disappears when Visible Settings hides every one of its rows, and
    // the Adjust panel replaces it when open. Neither needs handling: a panel
    // that is not in the DOM is not in the walk.
    build([
      { name: "Header", fields: [{ id: "h1" }] },
      { name: "Items", fields: [{ id: "i1", gridStop: true }] },
      { name: "Adjust", fields: [{ id: "adj-1" }] },
    ]);
    focusOn("Items", "i1");
    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("adj-1");
  });
});

describe("starting from outside every panel", () => {
  it("enters at the first panel when focus is on the toolbar", () => {
    // Focus sits outside every panel after a dialog closes, or on a toolbar
    // button. F1 should start the cycle rather than decline.
    billScreen();
    active = Object.assign(new StubNode(), { id: "somewhere-else" });
    expect(moveSectionFocus(1)).toBe(true);
    expect(focused).toBe("sale-bill-customer");
  });
});
