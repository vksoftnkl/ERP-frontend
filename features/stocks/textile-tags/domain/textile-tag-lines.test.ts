/**
 * The New tags tab's behaviours, as tests/textiletag/test_textile_tags.cpp
 * drives them — with the reserve and suggest-price answers FAKED (the routes
 * are not on the box yet, notes 136) and fed through the reducer's own apply
 * actions. Nothing here touches a server.
 */
import { describe, expect, it } from "vitest";
import type { ReserveAnswer, SuggestPriceAnswer } from "../textile-tags.types";
import {
  canReserve,
  createTagEntryState,
  discardQuestion,
  labelCount,
  pendingLineCount,
  previewOf,
  problemRows,
  reservePayload,
  sentLinesOf,
  serverProblemKeysOf,
  sizeGridSummary,
  tagEntryReducer,
  unresolvedNames,
  validationOf,
  whyNotEditable,
  type TagEntryAction,
  type TagEntryState,
} from "./textile-tag-lines";

const ACME = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
const BRANCH = "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab";
const DEVICE = "c295cec3-5707-2fef-9eb1-6d855aa03b0b";
const SCOPE = { companyId: ACME, branchId: BRANCH, deviceId: DEVICE };
const TODAY = "2026-10-19";

const CHILLI = "019d43f8-eb4c-7699-9572-3a87b8cbedb6";
const CHILLI_UOM = "019d43fb-c68d-752a-8a39-cecf5bae540c";

function run(state: TagEntryState, ...actions: TagEntryAction[]): TagEntryState {
  return actions.reduce(tagEntryReducer, state);
}

function rule(id: string): SuggestPriceAnswer["rule"] {
  return { id, sets: "SALE", pct: 50, round: "END_99" };
}

/** Line 1 as the Qt test keys it: a real item, pretended to be a tag item. */
function lineOne(): TagEntryState {
  let state = createTagEntryState(TODAY);
  const key = state.lines[0].key;
  state = run(
    state,
    { type: "itemSet", key, itemId: CHILLI, itemName: "CHILLI POWDER", uomId: CHILLI_UOM },
    { type: "lookupAnswered", key, itemId: CHILLI, signature: "B", uomId: CHILLI_UOM },
    { type: "cellTyped", key, field: "price", text: "1999" },
    { type: "cellTyped", key, field: "mrp", text: "2450" },
    { type: "cellTyped", key, field: "cost", text: "1320" },
    { type: "brandSet", key, brandId: "019d0000-0000-7000-8000-000000000001", brandName: "Deepa Textiles" },
    { type: "cellTyped", key, field: "sizeName", text: "6.2 m" },
    { type: "cellTyped", key, field: "colourName", text: "Maroon" },
    { type: "cellTyped", key, field: "fabricName", text: "Pure silk" },
    { type: "cellTyped", key, field: "model", text: "Deepa Kanchi 402" },
    { type: "cellTyped", key, field: "supplierArticle", text: "DT-K402" },
  );
  return state;
}

/** Line 1 plus the size grid's three lines, priced "auto" by a faked rule. */
function fourLines(): TagEntryState {
  let state = lineOne();
  const keys = ["sg-s", "sg-m", "sg-l"];
  state = run(state, {
    type: "sizeGridAdded",
    add: {
      keys,
      itemId: CHILLI,
      itemName: "CHILLI POWDER",
      brandId: "019d0000-0000-7000-8000-000000000002",
      brandName: "Ramraj",
      sizeSet: "ALPHA",
      sizes: [
        { size: "S", qty: 2 },
        { size: "M", qty: 3 },
        { size: "L", qty: 3 },
      ],
      colour: "Black",
      fabric: "Poly-cotton",
      model: "Party Wear 5",
      cost: "1450",
    },
  });
  for (const key of keys) {
    state = run(
      state,
      { type: "lookupAnswered", key, itemId: CHILLI, signature: "B", uomId: CHILLI_UOM },
      { type: "suggestionAnswered", key, data: { rule: rule("r2"), salePrice: 2199 } },
    );
  }
  return run(state, { type: "cellTyped", key: "sg-s", field: "mrp", text: "2999" });
}

describe("opening", () => {
  it("one spare line, nothing to reserve", () => {
    const state = createTagEntryState(TODAY);
    expect(state.lines).toHaveLength(1);
    expect(pendingLineCount(state)).toBe(0);
    expect(canReserve(state, true)).toBe(false);
    expect(validationOf(state)).toMatchObject({
      text: "Pick an item on the first line, or fill the size grid.",
      tone: "idle",
    });
    expect(state.header.source).toBe("OPENING");
  });

  it("refuses every cell but Item on a row with no item", () => {
    const state = createTagEntryState(TODAY);
    expect(whyNotEditable(state.lines[0], 0, "price")).toBe("Pick the item first.");
    expect(whyNotEditable(state.lines[0], 0, "itemName")).toBe("");
  });
});

describe("line 1: a real item", () => {
  it("item picked: spare line added, qty 1, label 1", () => {
    let state = createTagEntryState(TODAY);
    const key = state.lines[0].key;
    state = run(state, { type: "itemSet", key, itemId: CHILLI, itemName: "CHILLI POWDER", uomId: CHILLI_UOM });
    expect(state.lines).toHaveLength(2);
    expect(state.lines[0]).toMatchObject({ qty: "1", labels: "1", itemId: CHILLI, signature: "" });
  });

  it("the lookup fills the signature — only for the item it was asked about", () => {
    let state = createTagEntryState(TODAY);
    const key = state.lines[0].key;
    state = run(state, { type: "itemSet", key, itemId: CHILLI, itemName: "CHILLI POWDER", uomId: "" });
    const stale = tagEntryReducer(state, { type: "lookupAnswered", key, itemId: "other", signature: "N", uomId: "u" });
    expect(stale.lines[0].signature).toBe("");
    state = tagEntryReducer(state, { type: "lookupAnswered", key, itemId: CHILLI, signature: "BME", uomId: CHILLI_UOM });
    expect(state.lines[0].signature).toBe("BME");
    expect(state.lines[0].uomId).toBe(CHILLI_UOM);
  });

  it("a non-tag item is refused before the server, and Reserve stays off", () => {
    let state = createTagEntryState(TODAY);
    const key = state.lines[0].key;
    state = run(
      state,
      { type: "itemSet", key, itemId: CHILLI, itemName: "CHILLI POWDER", uomId: CHILLI_UOM },
      { type: "lookupAnswered", key, itemId: CHILLI, signature: "N", uomId: CHILLI_UOM },
      { type: "cellTyped", key, field: "price", text: "1999" },
    );
    const validation = validationOf(state);
    expect(validation.tone).toBe("error");
    expect(validation.text).toContain("not set up for tags");
    expect(validation.text).toContain("CHILLI POWDER");
    expect(canReserve(state, true)).toBe(false);
  });

  it("a typed price shows 'typed' and the line is ready", () => {
    const state = lineOne();
    expect(state.lines[0].priceSrc).toBe("typed");
    expect(validationOf(state).text).toMatch(/^✓/);
    expect(validationOf(state).text).toBe("✓ 1 line(s) → 1 label(s) · ready to reserve");
    expect(canReserve(state, true)).toBe(true);
    expect(canReserve(state, false)).toBe(false);
  });

  it("a rule's suggestion never overwrites a typed price", () => {
    const state = tagEntryReducer(lineOne(), {
      type: "suggestionAnswered",
      key: lineOne().lines[0].key,
      data: { rule: rule("r1"), salePrice: 1999.5 },
    });
    expect(state.lines[0].price).toBe("1999");
    expect(state.lines[0].priceSrc).toBe("typed");
  });

  it("clearing a typed price makes the line the rule's again", () => {
    let state = lineOne();
    const key = state.lines[0].key;
    state = run(state, { type: "cellTyped", key, field: "price", text: "" });
    expect(state.lines[0].priceSrc).toBe("");
    expect(validationOf(state).text).toContain("no price");
    state = run(state, { type: "suggestionAnswered", key, data: { rule: rule("r1"), salePrice: 1999.5 } });
    expect(state.lines[0]).toMatchObject({ price: "1999.5", priceSrc: "auto", rule: "Markup rule: +50% on cost, end in 99" });
  });

  it("a stale suggestion (another cost) is dropped", () => {
    let state = lineOne();
    const key = state.lines[0].key;
    state = run(state, { type: "cellTyped", key, field: "price", text: "" });
    state = run(state, { type: "suggestionAnswered", key, itemId: CHILLI, cost: 999, data: { rule: rule("r1"), salePrice: 1 } });
    expect(state.lines[0].price).toBe("");
    state = run(state, { type: "suggestionAnswered", key, itemId: CHILLI, cost: 1320, data: { rule: rule("r1"), salePrice: 1979 } });
    expect(state.lines[0].price).toBe("1979");
  });

  it("a rule with no answer leaves the price alone and clears the rule text", () => {
    let state = lineOne();
    const key = state.lines[0].key;
    state = run(state, { type: "cellTyped", key, field: "price", text: "" });
    state = run(state, { type: "suggestionAnswered", key, data: { rule: null } });
    expect(state.lines[0]).toMatchObject({ price: "", priceSrc: "", rule: "" });
  });

  it("a rule's MRP fills the cell only when the operator left it blank", () => {
    let state = createTagEntryState(TODAY);
    const key = state.lines[0].key;
    state = run(
      state,
      { type: "itemSet", key, itemId: CHILLI, itemName: "CHILLI POWDER", uomId: "" },
      { type: "suggestionAnswered", key, data: { rule: rule("r1"), salePrice: 999, mrp: "1299.00" } },
    );
    expect(state.lines[0].mrp).toBe("1299");
    state = run(state, { type: "cellTyped", key, field: "mrp", text: "1500" }, { type: "cellTyped", key, field: "price", text: "" });
    state = run(state, { type: "suggestionAnswered", key, data: { rule: rule("r1"), salePrice: 999, mrp: 1299 } });
    expect(state.lines[0].mrp).toBe("1500");
  });

  it("a price above MRP is refused", () => {
    let state = lineOne();
    const key = state.lines[0].key;
    state = run(state, { type: "cellTyped", key, field: "price", text: "2500" });
    expect(validationOf(state).text).toContain("price is above MRP");
    expect(problemRows(state)).toEqual([{ key, index: 0, why: "price is above MRP" }]);
    state = run(state, { type: "cellTyped", key, field: "price", text: "1999" });
    expect(problemRows(state)).toEqual([]);
  });

  it("a typed list name clears its id until the list (or the reserve) resolves it", () => {
    const state = lineOne();
    expect(state.lines[0]).toMatchObject({ sizeName: "6.2 m", sizeId: "", colourName: "Maroon", colourId: "" });
  });
});

describe("the size grid", () => {
  it("3 sizes → 3 lines + the spare, carrying size, colour, model, qty and cost", () => {
    const state = fourLines();
    expect(state.lines).toHaveLength(5);
    expect(state.lines[1]).toMatchObject({ sizeName: "S", colourName: "Black", qty: "2", labels: "2", cost: "1450", brandName: "Ramraj" });
    expect(state.lines[2]).toMatchObject({ sizeName: "M", model: "Party Wear 5", itemId: CHILLI, qty: "3" });
    expect(state.lines[3]).toMatchObject({ sizeName: "L", qty: "3", fabricName: "Poly-cotton" });
    expect(state.lines[4].itemId).toBe("");
  });

  it("the markup answer prices the size lines 'auto'", () => {
    const state = fourLines();
    expect(state.lines[1].priceSrc).toBe("auto");
    expect(state.lines[3].price).toBe("2199");
  });

  it("4 lines → 9 labels, and the strip says ready", () => {
    const state = fourLines();
    expect(pendingLineCount(state)).toBe(4);
    expect(labelCount(state)).toBe(9);
    expect(validationOf(state).text).toContain("9 label");
  });

  it("a cut length is ONE label (G4)", () => {
    let state = fourLines();
    state = run(state, { type: "cellTyped", key: "sg-l", field: "qty", text: "2.25" });
    expect(state.lines[3].labels).toBe("1");
    expect(labelCount(state)).toBe(7);
    state = run(state, { type: "cellTyped", key: "sg-l", field: "qty", text: "3" });
    expect(state.lines[3].labels).toBe("3");
  });

  it("summarises the boxes as lines and pieces", () => {
    expect(sizeGridSummary([2, 3, 0, 3])).toMatchObject({
      lines: 3,
      pieces: 8,
      summary: "→ 3 line(s), 8 pc(s). Price comes from the Markup rule per line.",
      button: "Add 3 line(s)",
    });
    expect(sizeGridSummary([0, 0])).toMatchObject({ summary: "", button: "Add lines" });
  });
});

describe("the payload", () => {
  it("carries scope + device and the 4 lines numbered 1..4", () => {
    const body = reservePayload(fourLines(), SCOPE);
    expect(body).toMatchObject({ companyId: ACME, branchId: BRANCH, deviceId: DEVICE });
    expect(body.lines).toHaveLength(4);
    expect(body.lines[3].lineNo).toBe(4);
    expect(body).not.toHaveProperty("seasonId");
    expect(body).not.toHaveProperty("supplierId");
  });

  it("line 1: price, mrp, labelCost, qty, model, article", () => {
    const [line1] = reservePayload(fourLines(), SCOPE).lines;
    expect(line1).toMatchObject({
      itemId: CHILLI,
      salePrice: 1999,
      mrp: 2450,
      labelCost: 1320,
      qty: 1,
      model: "Deepa Kanchi 402",
      supplierArticle: "DT-K402",
      brandId: "019d0000-0000-7000-8000-000000000001",
    });
  });

  it("no list id before resolve, no blank keys", () => {
    const { lines } = reservePayload(fourLines(), SCOPE);
    expect(lines[0]).not.toHaveProperty("colourId");
    expect(lines[0]).not.toHaveProperty("sizeId");
    expect(lines[0]).not.toHaveProperty("attrNote");
    expect(lines[2]).not.toHaveProperty("mrp");
    expect(lines[1].mrp).toBe(2999);
  });

  it("sends the header season and supplier when set", () => {
    let state = fourLines();
    state = run(state, { type: "headerChanged", patch: { supplierId: "sup-1", supplierName: "Deepa" } }, { type: "seasonPicked", id: "w26", name: "Winter 26" });
    const body = reservePayload(state, SCOPE);
    expect(body.supplierId).toBe("sup-1");
    expect(body.seasonId).toBe("w26");
  });

  it("lists every typed name without an id once, sizes under their seed set", () => {
    let state = fourLines();
    state = run(state, { type: "seasonTyped", text: "Diwali 26" });
    const names = unresolvedNames(state);
    expect(names).toEqual([
      { kind: "size", name: "6.2 m", sizeSet: "FREE" },
      { kind: "colour", name: "Maroon", sizeSet: "" },
      { kind: "fabric", name: "Pure silk", sizeSet: "" },
      { kind: "size", name: "S", sizeSet: "ALPHA" },
      { kind: "colour", name: "Black", sizeSet: "" },
      { kind: "fabric", name: "Poly-cotton", sizeSet: "" },
      { kind: "size", name: "M", sizeSet: "ALPHA" },
      { kind: "size", name: "L", sizeSet: "ALPHA" },
      { kind: "season", name: "Diwali 26", sizeSet: "" },
    ]);
  });

  it("a resolved name's id is written onto every pending row (and the header) that typed it", () => {
    let state = fourLines();
    state = run(
      state,
      { type: "seasonTyped", text: "Diwali 26" },
      { type: "nameResolved", kind: "colour", name: "black", sizeSet: "", id: "c-black" },
      { type: "nameResolved", kind: "season", name: "Diwali 26", sizeSet: "", id: "sn-d26" },
    );
    expect(state.lines[1].colourId).toBe("c-black");
    expect(state.lines[3].colourId).toBe("c-black");
    expect(state.lines[0].colourId).toBe("");
    expect(state.header.seasonId).toBe("sn-d26");
    expect(unresolvedNames(state).map((name) => name.name)).not.toContain("Black");
    expect(reservePayload(state, SCOPE).lines[1].colourId).toBe("c-black");
    expect(reservePayload(state, SCOPE).seasonId).toBe("sn-d26");
  });
});

describe("the reserve answer (faked): line 1 one tag, line 2 per-piece", () => {
  const TAGS: ReserveAnswer = {
    tags: [
      { lineNo: 1, tagId: "t1", barcode: "T1004127", lotId: "l1", labelQty: 1 },
      { lineNo: 2, tagId: "t2", barcode: "T1004128", lotId: "l2", labelQty: 1 },
      { lineNo: 2, tagId: "t3", barcode: "T1004129", lotId: "l3", labelQty: 1 },
      { lineNo: 3, tagId: "t4", barcode: "T1004130", lotId: "l4", labelQty: 3 },
      { lineNo: 4, tagId: "t5", barcode: "T1004131", lotId: "l5", labelQty: 3 },
    ],
  };

  function reserved(): TagEntryState {
    let state = fourLines();
    state = run(state, { type: "reserveStarted" }, { type: "reserveSent", sent: sentLinesOf(state) });
    expect(state.reserving).toBe(true);
    return run(state, { type: "reserved", data: TAGS });
  }

  it("line 1 reserved with its barcode", () => {
    const state = reserved();
    expect(state.lines[0]).toMatchObject({ state: "RESERVED", barcode: "T1004127", tagIds: "t1", lotIds: "l1" });
    expect(state.reserving).toBe(false);
  });

  it("the per-piece line shows the run + 2 tag ids", () => {
    const state = reserved();
    expect(state.lines[1].barcode).toBe("T1004128…129");
    expect(state.lines[1].tagIds).toBe("t2,t3");
    expect(state.lines[1].lotIds).toBe("l2,l3");
  });

  it("labels come from the answer (3 pcs on one tag = 3)", () => {
    expect(reserved().lines[2].labels).toBe("3");
  });

  it("nothing left to reserve, Reserve off, the strip says so", () => {
    const state = reserved();
    expect(pendingLineCount(state)).toBe(0);
    expect(canReserve(state, true)).toBe(false);
    expect(validationOf(state).text).toBe("✓ Every line is reserved. Add more lines, or Clear for a new batch.");
  });

  it("learns the series code and notes the range + next step", () => {
    const state = reserved();
    expect(state.seriesCode).toBe("T1");
    expect(state.footNote).toBe(
      "Reserved 5 tag(s): T1004127 – T1004131 · next: post the Opening Stock with batch = barcode for each line",
    );
  });

  it("'Tags only' drops the Opening next step", () => {
    let state = fourLines();
    state = run(
      state,
      { type: "headerChanged", patch: { source: "" } },
      { type: "reserveSent", sent: sentLinesOf(state) },
      { type: "reserved", data: TAGS },
    );
    expect(state.footNote).toBe("Reserved 5 tag(s): T1004127 – T1004131");
  });

  it("a reserved line is read-only; removing it keeps its barcodes", () => {
    const state = reserved();
    expect(whyNotEditable(state.lines[0], 0, "price")).toBe(
      "Line 1 is reserved: its tags exist. Change a tag's details from the Register.",
    );
    const after = run(state, { type: "lineRemoved", key: state.lines[0].key });
    expect(after.lines).toHaveLength(5);
    expect(after.hint).toBe("A reserved line keeps its barcodes. Void a tag from the Register.");
    // An edit on a reserved line is ignored, as is a late suggestion.
    const typed = run(state, { type: "itemSet", key: state.lines[0].key, itemId: "x", itemName: "X", uomId: "" });
    expect(typed.lines[0].itemId).toBe(CHILLI);
  });

  it("maps the answer by the lines SENT, not by row position", () => {
    let state = fourLines();
    // Reserve line 1 alone first, then the rest: the second answer's lineNo
    // 2..4 must land on rows 2..4 through the sent map, the way Qt keeps it.
    const sent = sentLinesOf(state);
    state = run(state, { type: "reserveSent", sent: [sent[0]] }, { type: "reserved", data: { tags: [TAGS.tags[0]] } });
    expect(state.lines[0].state).toBe("RESERVED");
    expect(state.lines[1].state).toBe("");
    state = run(state, { type: "reserveSent", sent: sentLinesOf(state) }, { type: "reserved", data: { tags: TAGS.tags.slice(1) } });
    expect(state.lines[1].barcode).toBe("T1004128…129");
    expect(state.lines[3].barcode).toBe("T1004131");
  });
});

describe("a 422 naming lines.<i>", () => {
  it("marks the i-th SENT line as a server problem", () => {
    let state = fourLines();
    // Line 1 reserved already: the next reserve sends rows 2..4 as lines 0..2.
    state = run(
      state,
      { type: "reserveSent", sent: [sentLinesOf(state)[0]] },
      { type: "reserved", data: { tags: [{ lineNo: 1, tagId: "t1", barcode: "T1004127", lotId: "l1", labelQty: 1 }] } },
    );
    const sent = sentLinesOf(state);
    expect(sent.map((line) => line.lineNo)).toEqual([2, 3, 4]);
    expect(serverProblemKeysOf([{ field: "lines.1", message: "This counter cannot print tags yet." }], sent)).toEqual(["sg-m"]);
    expect(serverProblemKeysOf([{ field: "lines.9" }, { field: "deviceId" }], sent)).toEqual([]);

    state = run(state, { type: "reserveStarted" }, { type: "reserveSent", sent }, {
      type: "reserveRefused",
      errors: [{ field: "lines.1", message: "refused" }],
    });
    expect(state.reserving).toBe(false);
    expect(state.serverProblemKeys).toEqual(["sg-m"]);
    expect(validationOf(state).text).toBe("⚠ line 3: refused by the server — see the message");
    expect(canReserve(state, true)).toBe(false);

    // Editing the refused line clears its mark.
    state = run(state, { type: "cellTyped", key: "sg-m", field: "qty", text: "4" });
    expect(state.serverProblemKeys).toEqual([]);
  });

  it("lists the first three problems and counts the rest", () => {
    let state = fourLines();
    for (const key of [state.lines[0].key, "sg-s", "sg-m", "sg-l"]) {
      state = run(state, { type: "cellTyped", key, field: "price", text: "" });
    }
    const text = validationOf(state).text;
    expect(text).toBe("⚠ line 1: no price · line 2: no price · line 3: no price · and 1 more");
  });
});

describe("the header", () => {
  it("re-picks the default season on a date change only while the operator has not picked one", () => {
    let state = createTagEntryState(TODAY);
    state = run(state, {
      type: "listsLoaded",
      kind: "season",
      rows: [
        { isn_id: "d26", isn_name: "Diwali 26", isn_from_date: "2026-10-15", isn_to_date: "2026-11-05" },
        { isn_id: "w26", isn_name: "Winter 26", isn_from_date: "2026-11-06", isn_to_date: "2027-01-31" },
      ],
    });
    expect(state.header).toMatchObject({ seasonText: "Diwali 26", seasonId: "d26", seasonPicked: false });
    state = run(state, { type: "dateChanged", docDate: "2026-12-01" });
    expect(state.header).toMatchObject({ seasonText: "Winter 26", seasonId: "w26" });
    state = run(state, { type: "seasonPicked", id: "d26", name: "Diwali 26" }, { type: "dateChanged", docDate: "2026-12-15" });
    expect(state.header).toMatchObject({ seasonText: "Diwali 26", seasonId: "d26", seasonPicked: true });
  });

  it("a typed season name takes a listed id, and no id otherwise", () => {
    let state = createTagEntryState(TODAY);
    state = run(state, {
      type: "listsLoaded",
      kind: "season",
      rows: [{ isn_id: "d26", isn_name: "Diwali 26", isn_from_date: "", isn_to_date: "" }],
    });
    state = run(state, { type: "seasonTyped", text: "diwali 26" });
    expect(state.header.seasonId).toBe("d26");
    state = run(state, { type: "seasonTyped", text: "Summer 27" });
    expect(state.header.seasonId).toBe("");
    // The header season is resolved at reserve like any typed name.
    expect(unresolvedNames(state)).toEqual([{ kind: "season", name: "Summer 27", sizeSet: "" }]);
  });
});

describe("the preview", () => {
  it("previews the active line, else the first with an item, else nothing", () => {
    expect(previewOf(createTagEntryState(TODAY), null, "10/2026")).toBeNull();
    const state = fourLines();
    const first = previewOf(state, null, "10/2026");
    expect(first?.index).toBe(0);
    expect(first?.label).toMatchObject({
      brand: "Deepa Textiles",
      itemName: "CHILLI POWDER",
      model: "Deepa Kanchi 402",
      size: "6.2 m",
      colour: "Maroon",
      fabric: "Pure silk",
      barcode: "",
      mrp: 2450,
      price: 1999,
      packed: "10/2026",
    });
    expect(first?.labels).toBe(1);
    const third = previewOf(state, "sg-m", "10/2026");
    expect(third?.index).toBe(2);
    expect(third?.labels).toBe(3);
    // The spare row has no item: the first line stands in.
    expect(previewOf(state, state.lines[4].key, "10/2026")?.index).toBe(0);
  });
});

describe("clearing and closing", () => {
  it("Clear starts a new batch", () => {
    const state = run(fourLines(), { type: "linesCleared" });
    expect(state.lines).toHaveLength(1);
    expect(state.footNote).toBe("");
    expect(pendingLineCount(state)).toBe(0);
  });

  it("words the discard question", () => {
    expect(discardQuestion(4)).toBe("4 line(s) are not reserved yet and will be lost. Continue?");
  });

  it("removing a pending line keeps the spare and renumbers", () => {
    const state = run(fourLines(), { type: "lineRemoved", key: "sg-s" });
    expect(state.lines.map((line) => line.sizeName)).toEqual(["6.2 m", "M", "L", ""]);
    expect(reservePayload(state, SCOPE).lines.map((line) => line.lineNo)).toEqual([1, 2, 3]);
  });
});
