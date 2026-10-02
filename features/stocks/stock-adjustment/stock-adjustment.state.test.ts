/**
 * Stock Adjustment — the line rules of the Qt screen: the reason is the
 * direction, the sign follows it, outward lines are the engine's to value,
 * the re-lot pair, the move's buckets, and what the screen works out.
 */
import { describe, expect, it } from "vitest";
import { COL, kindCode, kindFromCode, saveType } from "./stock-adjustment.constants";
import {
  accountsCard,
  applyAvailability,
  applyItemDetail,
  applyKind,
  applyPickedHolding,
  applyReasonToLine,
  applyReasons,
  changeGodown,
  changeKind,
  changeRateSource,
  computeTotals,
  createDraft,
  defaultReasonOptions,
  directionOf,
  editCell,
  filterReasonsForKind,
  insertLineBefore,
  itemDetailFailed,
  kindSelectable,
  lineNumbers,
  nextDocument,
  normaliseQty,
  relotBalance,
  remarksRequiredKeys,
  removeLine,
  rowHint,
  startItemLine,
  whyNotEditable,
} from "./stock-adjustment.state";
import {
  ADJUSTMENT_REASONS,
  draftOf,
  holding,
  itemLine,
  MOVE_REASONS,
  SCOPE,
  withLines,
} from "./stock-adjustment.test-fixtures";

describe("the Type selector", () => {
  it("maps the six kinds to the four stored types and back", () => {
    expect(saveType("Relot")).toBe("ADJUSTMENT");
    expect(saveType("Move")).toBe("BUCKET_MOVE");
    expect(saveType("Expiry")).toBe("EXPIRY_WRITEOFF");
    expect(kindCode("Relot")).toBe("RELOT");
    expect(kindFromCode("BUCKET_MOVE")).toBe("Move");
    expect(kindFromCode("RELOT")).toBe("Relot");
    expect(kindFromCode("whatever")).toBe("Adjustment");
  });

  it("forces AVG_COST off a plain adjustment and refetches the reasons", () => {
    const draft = { ...draftOf("Adjustment"), rateSource: "MANUAL" };
    const issue = applyKind(draft, "Issue");
    expect(issue.rateSource).toBe("AVG_COST");
    expect(issue.reasonsLoaded).toBe(false);
    expect(applyKind(draft, "Adjustment").rateSource).toBe("MANUAL");
  });

  it("clears keyed lines when the kind changes, and marks the document changed", () => {
    const draft = withLines(draftOf("Adjustment"), [itemLine({ qty: "-2" })]);
    const changed = changeKind(draft, "Damage");
    expect(changed.kind).toBe("Damage");
    expect(changed.lines).toHaveLength(1);
    expect(changed.lines[0].itemId).toBe("");
    expect(changed.dirty).toBe(true);
  });

  it("keeps the kind of a saved document", () => {
    expect(kindSelectable(draftOf("Adjustment"))).toBe(true);
    expect(kindSelectable({ ...draftOf("Adjustment"), svhId: "svh-1" })).toBe(false);
    expect(kindSelectable({ ...draftOf("Adjustment"), mode: "browse" })).toBe(false);
  });
});

describe("reasons", () => {
  it("offers the re-lot pair only on the Re-lot type, and never there anything else", () => {
    expect(filterReasonsForKind(ADJUSTMENT_REASONS, "Adjustment").map((r) => r.code)).not.toContain("RELOT_OUT");
    expect(filterReasonsForKind(ADJUSTMENT_REASONS, "Relot").map((r) => r.code)).toEqual(["RELOT_OUT", "RELOT_IN"]);
    expect(filterReasonsForKind(ADJUSTMENT_REASONS, "Issue")).toHaveLength(ADJUSTMENT_REASONS.length);
  });

  it("keeps the default reason only when the new list carries it", () => {
    const base = createDraft(SCOPE, "2026-10-02");
    const kept = applyReasons({ ...base, defaultReasonId: "r-found" }, ADJUSTMENT_REASONS);
    expect(kept.defaultReasonId).toBe("r-found");
    const dropped = applyReasons({ ...base, defaultReasonId: "r-gone", extraReason: { id: "r-gone", name: "Gone" } }, ADJUSTMENT_REASONS);
    expect(dropped.defaultReasonId).toBe("");
    expect(dropped.extraReason).toBeNull();
  });

  it("offers '— per line —' first, then a loaded header reason the list does not carry yet", () => {
    const draft = { ...createDraft(SCOPE, "2026-10-02"), extraReason: { id: "r-x", name: "Old reason" } };
    expect(defaultReasonOptions(draft)).toEqual([
      { value: "", label: "— per line —" },
      { value: "r-x", label: "Old reason" },
    ]);
  });

  it("paints a loaded BOTH line with no sign as ±", () => {
    const base = createDraft(SCOPE, "2026-10-02");
    const line = itemLine({ reasonId: "r-count", qty: "" });
    const draft = applyReasons({ ...base, lines: [line] }, ADJUSTMENT_REASONS);
    expect(draft.lines[0].direction).toBe("BOTH");
  });
});

describe("the reason is the direction", () => {
  const reasons = filterReasonsForKind(ADJUSTMENT_REASONS, "Adjustment");
  const byId = (id: string) => reasons.find((reason) => reason.id === id) ?? null;

  it("an OUT reason makes the typed quantity negative", () => {
    const { line } = applyReasonToLine("Adjustment", reasons, itemLine({ qty: "3" }), byId("r-short"));
    expect(line.direction).toBe("OUT");
    expect(line.qty).toBe("-3");
    expect(line.value).toBe(0);
  });

  it("an IN reason makes it positive, drops a picked lot and asks for the availability again", () => {
    const outward = itemLine({ qty: "-3", direction: "OUT", lotId: "lot-1" });
    const { line, refresh } = applyReasonToLine("Adjustment", reasons, outward, byId("r-found"));
    expect(line.direction).toBe("IN");
    expect(line.qty).toBe("3");
    expect(line.lotId).toBe("");
    expect(refresh).toBe(true);
  });

  it("a BOTH reason takes the typed sign, ± until one is typed", () => {
    expect(applyReasonToLine("Adjustment", reasons, itemLine({ qty: "-2" }), byId("r-count")).line.direction).toBe("OUT");
    expect(applyReasonToLine("Adjustment", reasons, itemLine({ qty: "2" }), byId("r-count")).line.direction).toBe("IN");
    expect(applyReasonToLine("Adjustment", reasons, itemLine({ qty: "" }), byId("r-count")).line.direction).toBe("BOTH");
  });

  it("no reason clears the reason and the chip (MOVE on a move)", () => {
    expect(applyReasonToLine("Adjustment", reasons, itemLine({ reasonId: "r-short" }), null).line).toMatchObject({
      reasonId: "",
      direction: "",
    });
    expect(applyReasonToLine("Move", [], itemLine(), null).line.direction).toBe("MOVE");
  });

  it("a move reason suggests its to-bucket", () => {
    const moveReasons = filterReasonsForKind(MOVE_REASONS, "Move");
    const { line } = applyReasonToLine("Move", moveReasons, itemLine({ bucket: "SALEABLE" }), moveReasons[0]);
    expect(line.direction).toBe("MOVE");
    expect(line.toBucket).toBe("DAMAGED");
  });

  it("normaliseQty: a move is a magnitude, an empty cell stays empty", () => {
    expect(normaliseQty("Move", [], itemLine({ qty: "-4" })).qty).toBe("4");
    expect(normaliseQty("Adjustment", [], itemLine({ qty: "" })).qty).toBe("");
    expect(normaliseQty("Adjustment", [], itemLine({ qty: "1.50000", direction: "OUT" })).qty).toBe("-1.5");
  });

  it("directionOf: a move is always out; otherwise the chip, then the sign", () => {
    expect(directionOf("Move", itemLine({ qty: "5" }))).toBe(-1);
    expect(directionOf("Adjustment", itemLine({ direction: "IN", qty: "-1" }))).toBe(1);
    expect(directionOf("Adjustment", itemLine({ qty: "-1" }))).toBe(-1);
    expect(directionOf("Adjustment", itemLine({ qty: "" }))).toBe(0);
  });
});

describe("what opens", () => {
  it("refuses everything on a line with no item", () => {
    const draft = draftOf("Adjustment");
    expect(whyNotEditable(draft, draft.lines[0], COL.Qty)).toMatch(/^Pick the item first/);
  });

  it("an outward line's batch is picked, and its cost is the branch average", () => {
    const draft = draftOf("Adjustment");
    const line = itemLine({ direction: "OUT", qty: "-1" });
    expect(whyNotEditable(draft, line, COL.BatchNo)).toMatch(/^An outward line takes its batch from the holding/);
    expect(whyNotEditable(draft, line, COL.CostRate)).toBe("An outward line is always valued at the branch average.");
    expect(whyNotEditable(draft, line, COL.Qty)).toBe("");
  });

  it("an inward line keys only the facets its item tracks, and a cost only under MANUAL", () => {
    const draft = draftOf("Adjustment");
    const line = itemLine({ direction: "IN", qty: "1", trackSignature: "BE" });
    expect(whyNotEditable(draft, line, COL.BatchNo)).toBe("");
    expect(whyNotEditable(draft, line, COL.ExpiryDate)).toBe("");
    expect(whyNotEditable(draft, line, COL.Mrp)).toBe(
      "This item is not tracked by MRP, so it is not part of what identifies its stock.",
    );
    expect(whyNotEditable(draft, line, COL.CostRate)).toBe(
      "The rate source (Average cost) values inward lines. Choose MANUAL to key a cost.",
    );
    expect(whyNotEditable({ ...draft, rateSource: "MANUAL" }, line, COL.CostRate)).toBe("");
  });

  it("a picked holding's bucket is fixed; a move and an expiry pick theirs; To is Move stock's", () => {
    const adjustment = draftOf("Adjustment");
    expect(whyNotEditable(adjustment, itemLine({ lotId: "lot-1" }), COL.Bucket)).toMatch(/picked holding's/);
    expect(whyNotEditable(adjustment, itemLine(), COL.Bucket)).toBe("");
    expect(whyNotEditable(draftOf("Expiry"), itemLine(), COL.Bucket)).toBe(
      "Pick the lot first (F2) — its bucket comes with it.",
    );
    expect(whyNotEditable(adjustment, itemLine(), COL.ToBucket)).toBe("Only Move stock has a To bucket.");
    expect(whyNotEditable(draftOf("Move"), itemLine(), COL.ToBucket)).toBe("");
  });

  it("the reason cell waits for the kind's reasons", () => {
    const loading = { ...draftOf("Adjustment"), reasonsLoaded: false };
    expect(whyNotEditable(loading, itemLine(), COL.ReasonName)).toBe("The reasons for this type are still loading.");
  });
});

describe("keying a line", () => {
  it("starts an item line under the default reason and asks for its unit and holding", () => {
    const draft = { ...draftOf("Adjustment"), defaultReasonId: "r-short" };
    const key = draft.lines[0].key;
    const { draft: next, effects } = startItemLine(draft, key, { itemId: "item-1", itemName: "Rice", unitId: "iuc-1" });
    expect(next.lines[0]).toMatchObject({ itemId: "item-1", bucket: "SALEABLE", reasonId: "r-short", direction: "OUT" });
    expect(next.lines).toHaveLength(2);
    expect(next.dirty).toBe(true);
    expect(effects).toContainEqual({ type: "itemDetail", key, itemId: "item-1", unitId: "iuc-1", keepUnit: false });
    expect(effects).toContainEqual({ type: "focus", key, column: COL.Qty });
  });

  it("a move, an expiry and a re-lot go straight to the item's holdings", () => {
    for (const kind of ["Move", "Expiry", "Relot"] as const) {
      const draft = draftOf(kind);
      const key = draft.lines[0].key;
      const { effects } = startItemLine(draft, key, { itemId: "item-1", itemName: "Rice", unitId: "" });
      expect(effects).toContainEqual({ type: "pick", key });
    }
  });

  it("takes the unit from the item lookup and the signature onto every line of the item", () => {
    const first = itemLine({ uomId: "", trackSignature: "N" });
    const second = itemLine({ trackSignature: "N" });
    const draft = withLines(draftOf("Adjustment"), [first, second]);
    const { draft: next, effects } = applyItemDetail(
      draft,
      first.key,
      "item-1",
      {
        itemId: "item-1",
        itemCode: "IT1",
        itemName: "Rice",
        barcode: null,
        uomId: "iuc-box",
        unitName: "BOX",
        toBaseFactor: 12,
        baseUomId: "iuc-1",
        taxPerc: 5,
        cessPerc: 0,
        cessUnit: 0,
        trackSignature: "BE",
        mrp: 0,
        salePrice: 0,
        alreadyOpened: false,
      },
      false,
    );
    expect(next.lines[0]).toMatchObject({ uomId: "iuc-box", uomName: "BOX", toBaseFactor: 12, trackSignature: "BE" });
    expect(next.lines[1].trackSignature).toBe("BE");
    expect(effects).toEqual([{ type: "availability", key: first.key }]);
  });

  it("ignores a lookup for an item the line no longer holds, and empties the line on a refusal", () => {
    const line = itemLine();
    const draft = withLines(draftOf("Adjustment"), [line]);
    expect(itemDetailFailed(draft, line.key, "other-item")).toBe(draft);
    expect(itemDetailFailed(draft, line.key, "item-1").lines[0].itemId).toBe("");
  });

  it("availability: the holding's own when picked, the bucket's when not, in the line's unit", () => {
    const line = itemLine({ toBaseFactor: 2, qty: "-1", direction: "OUT" });
    const draft = withLines(draftOf("Adjustment"), [line]);
    const rows = [holding({ lotId: "lot-1", availableQty: 10, avgCostRate: 5 }), holding({ lotId: "lot-2", availableQty: 4, avgCostRate: 6 })];
    const lotless = applyAvailability(draft, line.key, "item-1", rows).lines[0];
    expect(lotless.available).toBe(7);
    expect(lotless.costRate).toBe(10);
    const picked = withLines(draftOf("Adjustment"), [{ ...line, lotId: "lot-2" }]);
    expect(applyAvailability(picked, line.key, "item-1", rows).lines[0].available).toBe(2);
  });

  it("availability keeps a cost keyed under MANUAL on an inward line", () => {
    const line = itemLine({ direction: "IN", qty: "2", costRate: 99 });
    const draft = { ...withLines(draftOf("Adjustment"), [line]), rateSource: "MANUAL" };
    expect(applyAvailability(draft, line.key, "item-1", [holding({ avgCostRate: 5 })]).lines[0].costRate).toBe(99);
    const average = withLines(draftOf("Adjustment"), [line]);
    expect(applyAvailability(average, line.key, "item-1", [holding({ avgCostRate: 5 })]).lines[0].costRate).toBe(5);
  });
});

describe("picking a holding", () => {
  it("names the lot, its identity, its bucket and the average, in base units", () => {
    const draft = { ...draftOf("Damage"), defaultReasonId: "r-short" };
    const key = draft.lines[0].key;
    const { draft: next, effects } = applyPickedHolding(draft, key, holding());
    expect(next.lines[0]).toMatchObject({
      itemId: "item-1",
      lotId: "lot-1",
      batchNo: "B-0917",
      expiryDate: "30-09-2026",
      supplierName: "Acme Foods",
      bucket: "SALEABLE",
      toBaseFactor: 1,
      available: 42,
      costRate: 40.5,
      reasonId: "r-short",
    });
    expect(effects).toContainEqual({ type: "itemDetail", key, itemId: "item-1", unitId: "iuc-1", keepUnit: true });
  });

  it("an inward line takes the identity but not the lot id", () => {
    const line = itemLine({ direction: "IN", qty: "2", reasonId: "r-found" });
    const draft = withLines(draftOf("Adjustment"), [line]);
    const { draft: next } = applyPickedHolding(draft, line.key, holding());
    expect(next.lines[0].lotId).toBe("");
    expect(next.lines[0].batchNo).toBe("B-0917");
  });

  it("a move picks the move reason that fits where the stock sits, and the other bucket", () => {
    const draft = draftOf("Move");
    const key = draft.lines[0].key;
    const fromSaleable = applyPickedHolding(draft, key, holding({ bucket: "SALEABLE" })).draft.lines[0];
    expect(fromSaleable).toMatchObject({ reasonId: "r-md", toBucket: "DAMAGED", direction: "MOVE" });
    const fromDamaged = applyPickedHolding(draft, key, holding({ bucket: "DAMAGED" })).draft.lines[0];
    expect(fromDamaged).toMatchObject({ reasonId: "r-ms", toBucket: "SALEABLE" });
  });

  it("a re-lot OUT keeps its IN partner right below it, same item, quantity and cost", () => {
    const draft = draftOf("Relot");
    const key = draft.lines[0].key;
    const picked = applyPickedHolding(draft, key, holding()).draft;
    expect(picked.lines[0]).toMatchObject({ reasonId: "r-rout", direction: "OUT", lotId: "lot-1" });
    expect(picked.lines[1]).toMatchObject({ itemId: "item-1", reasonId: "r-rin", direction: "IN", qty: "", costRate: 40.5 });
    const keyed = editCell(picked, key, COL.Qty, "3").draft;
    expect(keyed.lines[0].qty).toBe("-3");
    expect(keyed.lines[1].qty).toBe("3");
    expect(keyed.lines).toHaveLength(3);
  });
});

describe("edits", () => {
  it("an edited line is no longer the one the server refused", () => {
    const line = itemLine({ direction: "OUT" });
    const draft = { ...withLines(draftOf("Adjustment"), [line]), serverProblems: { [line.key]: "bad" } };
    const { draft: next } = editCell(draft, line.key, COL.Qty, "2");
    expect(next.serverProblems).toEqual({});
    expect(next.lines[0].qty).toBe("-2");
    expect(next.lines[0].baseQty).toBe(-2);
  });

  it("a date is shown dd-MM-yyyy, and a non-date says so", () => {
    const line = itemLine({ direction: "IN" });
    const draft = withLines(draftOf("Adjustment"), [line]);
    expect(editCell(draft, line.key, COL.ExpiryDate, "2027-03-31").draft.lines[0].expiryDate).toBe("31-03-2027");
    const bad = editCell(draft, line.key, COL.ExpiryDate, "31/02/2027").draft;
    expect(bad.hint).toBe('Line 1: "31/02/2027" is not a date — key dd-MM-yyyy.');
  });

  it("a move into the bucket it is in is pointed out", () => {
    const line = itemLine({ bucket: "DAMAGED" });
    const draft = withLines(draftOf("Move"), [line]);
    expect(editCell(draft, line.key, COL.ToBucket, "DAMAGED").draft.hint).toBe(
      "Line 1 moves stock into the bucket it is already in — pick a different To bucket.",
    );
  });

  it("a bucket change reads the availability again", () => {
    const line = itemLine();
    const draft = withLines(draftOf("Adjustment"), [line]);
    expect(editCell(draft, line.key, COL.Bucket, "DAMAGED").effects).toEqual([{ type: "availability", key: line.key }]);
  });

  it("adds a line above, removes one (never the spare row) and keeps a spare", () => {
    const line = itemLine();
    const draft = withLines(draftOf("Adjustment"), [line]);
    const inserted = insertLineBefore(draft, line.key).draft;
    expect(inserted.lines).toHaveLength(3);
    expect(inserted.lines[1].key).toBe(line.key);
    const removed = removeLine(draft, line.key).draft;
    expect(removed.lines).toHaveLength(1);
    expect(removeLine(draft, draft.lines[1].key).draft).toBe(draft);
  });

  it("a new godown clears the lines; a rate source change re-reads the inward ones", () => {
    const outward = itemLine({ direction: "OUT" });
    const inward = itemLine({ direction: "IN" });
    const draft = withLines(draftOf("Adjustment"), [outward, inward]);
    expect(changeGodown(draft, "g-2", "Back store").lines).toHaveLength(1);
    expect(changeGodown(draft, "g-1", "Main")).toBe(draft);
    expect(changeRateSource(draft, "MANUAL").effects).toEqual([{ type: "availability", key: inward.key }]);
  });

  it("the next document carries the godown, the date and the type", () => {
    const draft = { ...draftOf("Damage"), svhId: "x", refno: "DMG/1", docDate: "2026-09-01" };
    const next = nextDocument(draft, SCOPE);
    expect(next).toMatchObject({ kind: "Damage", godownId: "g-1", docDate: "2026-09-01", svhId: "", refno: "" });
  });
});

describe("what the screen works out", () => {
  it("numbers the lines that name an item", () => {
    const a = itemLine();
    const b = itemLine();
    const draft = withLines(draftOf("Adjustment"), [a, b]);
    const numbers = lineNumbers(draft);
    expect(numbers.get(a.key)).toBe(1);
    expect(numbers.get(b.key)).toBe(2);
    expect(numbers.size).toBe(2);
  });

  it("totals out, in and the net, in the lines' own unit", () => {
    const draft = withLines(draftOf("Adjustment"), [
      itemLine({ qty: "-3", costRate: 100, direction: "OUT" }),
      itemLine({ qty: "2", costRate: 50, direction: "IN" }),
    ]);
    const totals = computeTotals(draft);
    expect(totals).toMatchObject({ lineCount: 2, outQty: 3, outValue: 300, inQty: 2, inValue: 100, unit: "pcs" });
    expect(totals.outText).toBe("Out  1 line · 3 pcs · ₹ 300.00");
    expect(totals.netText).toBe("Net  −₹ 200.00  (the voucher header's totals are the NET)");
  });

  it("a move counts what it moves as out", () => {
    const draft = withLines(draftOf("Move"), [itemLine({ qty: "4", costRate: 10 })]);
    expect(computeTotals(draft)).toMatchObject({ outLines: 1, outQty: 4, outValue: 40 });
  });

  it("the row note: remarks required, then the lot it goes into, then the stock it leaves", () => {
    const draft = draftOf("Adjustment");
    expect(rowHint(draft, itemLine({ reasonId: "r-theft", qty: "-1" }))).toBe("⚠ remarks required");
    expect(rowHint({ ...draft, remarks: "audit" }, itemLine({ reasonId: "r-theft", qty: "-1", available: 5 }))).toBe(
      "stock 5 → 4",
    );
    expect(rowHint(draft, itemLine({ direction: "IN", qty: "2", batchNo: "B-1" }))).toBe("into lot B-1");
    expect(remarksRequiredKeys(withLines(draft, [itemLine({ reasonId: "r-theft" })])).size).toBe(1);
  });

  it("the accounts card nets per ledger: the reason's own, else the shortage / excess role", () => {
    const draft = withLines(draftOf("Adjustment"), [
      itemLine({ qty: "-1", costRate: 10, reasonId: "r-short", direction: "OUT" }),
      itemLine({ qty: "-2", costRate: 10, reasonId: "r-short", direction: "OUT" }),
      itemLine({ qty: "-1", costRate: 5, reasonId: "r-theft", direction: "OUT" }),
      itemLine({ qty: "1", costRate: 7, reasonId: "r-found", direction: "IN" }),
    ]);
    const lines = accountsCard(draft, { INVENTORY: "Stock-in-Hand" }) ?? [];
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^DR {2}Stock Shortage\s+30\.00 {6}CR {2}Stock-in-Hand\s+30\.00$/);
    expect(lines[1]).toMatch(/^DR {2}Theft Loss/);
    expect(lines[2]).toMatch(/^DR {2}Stock-in-Hand\s+7\.00 {6}CR {2}Stock Excess/);
    expect(accountsCard(draftOf("Adjustment"), {})).toEqual(["(nothing to post yet)"]);
    expect(accountsCard(draftOf("Move"), {})).toBeNull();
  });

  it("the re-lot strip says whether each pair balances", () => {
    const out = itemLine({ qty: "-3", costRate: 12, direction: "OUT" });
    const balanced = withLines(draftOf("Relot"), [out, itemLine({ qty: "3", direction: "IN" })]);
    expect(relotBalance(balanced)).toEqual({
      lines: ["✓ pair balances: Rice 1kg  −3 / +3 (base units) · value carried at 12.00"],
      good: true,
    });
    const short = withLines(draftOf("Relot"), [out, itemLine({ qty: "2", direction: "IN" })]);
    expect(relotBalance(short)?.good).toBe(false);
    expect(relotBalance(draftOf("Relot"))?.lines[0]).toBe("Pick the wrong lot (F2) — its pair is added below it.");
    expect(relotBalance(draftOf("Adjustment"))).toBeNull();
  });
});
