/**
 * Enter walks the bill's header.
 *
 * The walker itself is the quotation's `moveHeaderFocus`, shared rather than
 * copied; what is worth pinning here is the SHAPE of this screen's header — four
 * columns laid out side by side, two of them carrying fields nobody can key —
 * and the two exclusions that keep the walk honest.
 *
 * No jsdom in this repo (the vitest env is `node`), and the walker needs none:
 * it only calls `container.querySelectorAll`, reads `disabled` / `readOnly`, and
 * calls `focus()` / `select()`. A stub container returning the fields in DOM
 * order is the whole fixture — the same fixture `grid-focus.test.ts` uses.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";

type Field = {
  id: string;
  disabled?: boolean;
  readOnly?: boolean;
};

let focused: string | null = null;
let elements: (HTMLInputElement & { id: string })[] = [];

function makeElement(field: Field) {
  const element = {
    id: field.id,
    disabled: Boolean(field.disabled),
    readOnly: Boolean(field.readOnly),
    focus() {
      focused = field.id;
    },
    select() {},
  };
  return element as unknown as HTMLInputElement & { id: string };
}

/** Stands in for the header row `<div>` the handler passes as its container. */
const container = {
  querySelectorAll: () => elements,
} as unknown as HTMLElement;

function build(fields: Field[]) {
  elements = fields.map(makeElement);
}

function elementFor(id: string) {
  return elements.find((element) => element.id === id)!;
}

/**
 * The header as the screen renders it, in DOM order: the customer column, then
 * the bill column, then the people column — and the credit column, whose five
 * figures are `<output>` elements and therefore carry no focus attribute and
 * never reach this list at all.
 *
 * Two read-only boxes sit in the middle of it: Bill No (the server assigns it)
 * and Customer State (the master's answer). Both are `readOnly` rather than
 * `disabled`, so they keep the white box of the fields around them.
 */
function billHeader() {
  build([
    // customer
    { id: "sale-bill-customer" },
    { id: "sale-bill-customer-name" },
    { id: "sale-bill-customer-address" },
    { id: "sale-bill-cust-state", readOnly: true },
    { id: "sale-bill-pos" },
    // the bill
    { id: "sale-bill-refno", readOnly: true },
    { id: "sale-bill-usr-refno" },
    { id: "sale-bill-date" },
    { id: "sale-bill-type" },
    { id: "sale-bill-price-level" },
    // people
    { id: "sale-bill-salesmanId" },
    { id: "sale-bill-has-loyalty" },
  ]);
}

beforeEach(() => {
  focused = null;
  elements = [];
});

describe("Enter walks the header", () => {
  it("moves to the next field", () => {
    billHeader();
    expect(moveHeaderFocus(container, elementFor("sale-bill-customer-name"), 1)).toBe(true);
    expect(focused).toBe("sale-bill-customer-address");
  });

  it("Shift+Enter walks back", () => {
    billHeader();
    expect(moveHeaderFocus(container, elementFor("sale-bill-customer-address"), -1)).toBe(true);
    expect(focused).toBe("sale-bill-customer-name");
  });

  it("crosses from one column into the next, because they are one walk", () => {
    // The header is a four-column grid laid out one column after another, so
    // document order already IS the order the eye follows: the last customer
    // field hands over to the first keyable field of the bill column.
    billHeader();
    expect(moveHeaderFocus(container, elementFor("sale-bill-pos"), 1)).toBe(true);
    // Not `sale-bill-refno` — the bill number is read-only; see below.
    expect(focused).toBe("sale-bill-usr-refno");
  });
});

describe("what the walk steps over", () => {
  it("skips a READ-ONLY field, because stopping there is a dead keypress", () => {
    // Bill No and Customer State are `readOnly` rather than `disabled` so they
    // keep the look of the fields around them. Landing on a value the operator
    // cannot change would swallow an Enter for nothing.
    billHeader();
    expect(moveHeaderFocus(container, elementFor("sale-bill-customer-address"), 1)).toBe(true);
    expect(focused).toBe("sale-bill-pos");
  });

  it("skips a DISABLED field", () => {
    build([
      { id: "a" },
      { id: "b", disabled: true },
      { id: "c" },
    ]);
    expect(moveHeaderFocus(container, elementFor("a"), 1)).toBe(true);
    expect(focused).toBe("c");
  });

  it("declines in browse mode, where every field is disabled", () => {
    // The whole header is shut, so there is nothing to walk to and the keypress
    // is left alone rather than being swallowed.
    build([
      { id: "a", disabled: true },
      { id: "b", disabled: true },
    ]);
    expect(moveHeaderFocus(container, elementFor("a"), 1)).toBe(false);
    expect(focused).toBeNull();
  });

  it("has nothing to say about a field Visible Settings has hidden", () => {
    // A hidden field is not RENDERED, so it is not in the DOM and cannot be in
    // the walk. That is why the walk reads the DOM rather than a list of ids —
    // there is no second list to keep in step with the config.
    build([{ id: "a" }, { id: "c" }]);
    expect(moveHeaderFocus(container, elementFor("a"), 1)).toBe(true);
    expect(focused).toBe("c");
  });
});

describe("the ends of the walk", () => {
  it("declines at the last field, which is what triggers the hand-off to the grid", () => {
    // The entry view reads this `false` as "the end of the header" and moves
    // into the first line's Description — the next thing keyed on a bill.
    billHeader();
    expect(moveHeaderFocus(container, elementFor("sale-bill-has-loyalty"), 1)).toBe(false);
    expect(focused).toBeNull();
  });

  it("declines going back from the first field, and stays put", () => {
    // Walking backwards OUT of the header would land in a grid the operator was
    // trying to leave, so the view does not hand off on Shift+Enter.
    billHeader();
    expect(moveHeaderFocus(container, elementFor("sale-bill-customer"), -1)).toBe(false);
    expect(focused).toBeNull();
  });

  it("declines for an element that is not part of the walk at all", () => {
    // A button inside the header, say. The view checks the focus attribute
    // before it gets here; this is the walker's own half of that guard, and
    // together they are what stops a stray Enter jumping into the grid.
    billHeader();
    const stranger = makeElement({ id: "not-in-the-walk" });
    expect(moveHeaderFocus(container, stranger, 1)).toBe(false);
    expect(focused).toBeNull();
  });
});
