import { describe, expect, it } from "vitest";
import { COL } from "./stock-transfer.constants";
import {
  applyAvailability,
  applyHolding,
  changeFromGodown,
  changeToBranch,
  checkBeforeSave,
  clientProblems,
  computeTotals,
  createDraft,
  editCell,
  entryStartTarget,
  isEnterStop,
  localTextFromWire,
  nextDocument,
  patchHandling,
  postConfirm,
  postNote,
  recallable,
  removeLine,
  requireGodowns,
  rowHasItem,
  settleShortOpen,
  shortRefno,
  shortTotals,
  whyNotEditable,
  wireFromLocalText,
} from "./stock-transfer.state";
import { SCOPE, holding, keyed, withLine } from "./stock-transfer.test-fixtures";

describe("applyHolding", () => {
  it("takes a holding onto the blank line, with the unit's labour rates, and leaves a new blank line", () => {
    const draft = keyed();
    const { draft: next } = applyHolding(draft, draft.lines[0].key, holding());
    const line = next.lines[0];
    expect(line).toMatchObject({
      itemId: "item-1",
      lotId: "lot-1",
      bucket: "SALEABLE",
      batchNo: "B-2604",
      expiryDate: "30-06-2026",
      available: 20,
      costRate: 473.5,
      toBaseFactor: 1,
      loadRate: "3.5",
      unloadRate: "1.25",
    });
    expect(next.lines).toHaveLength(2);
    expect(rowHasItem(next.lines[1])).toBe(false);
    expect(next.dirty).toBe(true);
  });

  it("sends a second pick of the same holding to the line it is on", () => {
    const draft = withLine();
    const blank = draft.lines[1].key;
    const result = applyHolding(draft, blank, holding());
    expect(result.existingKey).toBe(draft.lines[0].key);
    expect(result.draft.hint).toContain("already line 1");
    expect(result.draft.lines).toHaveLength(2);
  });

  it("re-picking on a line keeps its quantity and rates", () => {
    const draft = withLine("godown", "7");
    const next = applyHolding(draft, draft.lines[0].key, holding({ lotId: "lot-2", batchNo: "B-9", loadRate: 9 })).draft;
    expect(next.lines[0]).toMatchObject({ lotId: "lot-2", batchNo: "B-9", qty: "7", loadRate: "3.5" });
  });

  it("carries the textile detail onto the item text", () => {
    const draft = keyed();
    const next = applyHolding(draft, draft.lines[0].key, holding({ sizeName: "XL", colourName: "Maroon" })).draft;
    expect(next.lines[0].itemName).toBe("Shirt · XL · Maroon");
  });
});

describe("cells", () => {
  it("opens Qty, and Free only where the holding has free stock", () => {
    const draft = withLine();
    const line = draft.lines[0];
    expect(whyNotEditable(draft, line, COL.Qty)).toBe("");
    expect(whyNotEditable(draft, line, COL.FreeQty)).toBe("No free stock in this holding.");
    const free = withLine("godown", "5", holding({ freeAvailableQty: 4 }));
    expect(whyNotEditable(free, free.lines[0], COL.FreeQty)).toBe("");
  });

  it("opens the rate cells only while their box is ticked, and never the cost", () => {
    const draft = withLine();
    const line = draft.lines[0];
    expect(whyNotEditable(draft, line, COL.LoadRate)).toMatch(/Tick Loading/);
    const ticked = patchHandling(draft, { loadEnabled: true });
    expect(whyNotEditable(ticked, ticked.lines[0], COL.LoadRate)).toBe("");
    expect(whyNotEditable(ticked, ticked.lines[0], COL.CostRate)).toMatch(/never takes a typed cost/);
  });

  it("stops Enter on a blank line's Barcode / Item and a line's Qty", () => {
    const draft = withLine();
    expect(isEnterStop(draft, draft.lines[1], COL.Barcode)).toBe(true);
    expect(isEnterStop(draft, draft.lines[1], COL.Qty)).toBe(false);
    expect(isEnterStop(draft, draft.lines[0], COL.Qty)).toBe(true);
    expect(isEnterStop(draft, draft.lines[0], COL.Barcode)).toBe(false);
  });

  it("editCell writes Qty and clears the line's server problem", () => {
    const draft = { ...withLine(), serverProblems: { [withLine().lines[0].key]: "x" } };
    const key = draft.lines[0].key;
    const next = editCell({ ...draft, serverProblems: { [key]: "refused" } }, key, COL.Qty, " 8 ");
    expect(next.lines[0].qty).toBe("8");
    expect(next.serverProblems).toEqual({});
  });

  it("refuses an edit on a draft that is not open for keying", () => {
    const draft = { ...withLine(), viewMode: "browse" as const };
    expect(editCell(draft, draft.lines[0].key, COL.Qty, "9")).toBe(draft);
  });

  it("removes a line and keeps the trailing blank", () => {
    const draft = withLine();
    const next = removeLine(draft, draft.lines[0].key);
    expect(next.lines).toHaveLength(1);
    expect(rowHasItem(next.lines[0])).toBe(false);
  });

  it("names the pair a post writes", () => {
    const draft = withLine();
    expect(postNote(draft, draft.lines[0])).toBe("OUT −5 Main Warehouse   +   IN +5 Cold Room");
    const branch = withLine("branch");
    expect(postNote(branch, branch.lines[0])).toBe("OUT −5 Main Warehouse   +   a transit row");
  });
});

describe("applyAvailability", () => {
  it("reads what the loaded line's holding has now, and fills a missing batch", () => {
    const base = withLine();
    const loaded = {
      ...base,
      lines: base.lines.map((line, index) =>
        index === 0 ? { ...line, available: null, batchNo: "", expiryDate: "", freeAvailableBase: null } : line,
      ),
    };
    const next = applyAvailability(loaded, loaded.lines[0].key, [holding({ availableQty: 12, freeAvailableQty: 2 })]);
    expect(next.lines[0]).toMatchObject({ available: 12, freeAvailableBase: 2, batchNo: "B-2604", expiryDate: "30-06-2026" });
  });
});

describe("totals", () => {
  it("counts qty + free, and charges only the ticked boxes", () => {
    let draft = withLine("godown", "10", holding({ freeAvailableQty: 5 }));
    draft = editCell(draft, draft.lines[0].key, COL.FreeQty, "2");
    expect(computeTotals(draft)).toMatchObject({ lines: 1, qty: 12, loadCharge: 0, unloadCharge: 0 });
    expect(computeTotals(draft).value).toBeCloseTo(12 * 473.5);
    draft = patchHandling(draft, { loadEnabled: true, unloadEnabled: true });
    const totals = computeTotals(draft);
    expect(totals.loadCharge).toBeCloseTo(12 * 3.5);
    expect(totals.unloadCharge).toBeCloseTo(12 * 1.25);
  });

  it("Branch Outward has no unloading charge", () => {
    const draft = patchHandling(withLine("branch"), { loadEnabled: true, unloadEnabled: true });
    expect(computeTotals(draft).unloadCharge).toBe(0);
  });
});

describe("clientProblems", () => {
  it("is clean for a holding with a quantity inside what is available", () => {
    expect(clientProblems(withLine()).size).toBe(0);
  });

  it("refuses no quantity, more than available, and free beyond free stock", () => {
    const none = withLine("godown", "");
    expect([...clientProblems(none).values()][0]).toContain("has no quantity");
    const over = withLine("godown", "25");
    expect([...clientProblems(over).values()][0]).toContain("moves 25 but Main Warehouse has 20");
    let free = withLine("godown", "5", holding({ freeAvailableQty: 1 }));
    free = editCell(free, free.lines[0].key, COL.FreeQty, "3");
    expect([...clientProblems(free).values()][0]).toContain("only 1 free stock");
    let noFree = withLine();
    noFree = editCell(noFree, noFree.lines[0].key, COL.FreeQty, "1");
    expect([...clientProblems(noFree).values()][0]).toContain("no free stock");
  });

  it("a despatch carries one bucket per lot", () => {
    let draft = withLine("branch");
    const blank = draft.lines[1].key;
    draft = applyHolding(draft, blank, holding({ sblId: "sbl-2", bucket: "DAMAGED" })).draft;
    draft = editCell(draft, draft.lines[1].key, COL.Qty, "1");
    const problems = [...clientProblems(draft).values()];
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("one lot from two buckets");
    // …but a godown transfer may.
    let godown = withLine("godown");
    godown = applyHolding(godown, godown.lines[1].key, holding({ sblId: "sbl-2", bucket: "DAMAGED" })).draft;
    godown = editCell(godown, godown.lines[1].key, COL.Qty, "1");
    expect(clientProblems(godown).size).toBe(0);
  });
});

describe("gates", () => {
  it("wants both godowns before a line is keyed, From first", () => {
    const blank = createDraft(SCOPE, "godown", "2026-10-27");
    expect(requireGodowns(blank)?.focus).toBe("fromGodown");
    expect(requireGodowns({ ...blank, fromGodownId: "a" })?.focus).toBe("toGodown");
    expect(requireGodowns(keyed())).toBeNull();
    const branch = { ...createDraft(SCOPE, "branch", "2026-10-27"), fromGodownId: "a" };
    expect(requireGodowns(branch)?.focus).toBe("toBranch");
  });

  it("checkBeforeSave goes godowns, date, device, lines, then the line problems", () => {
    expect(checkBeforeSave(createDraft(SCOPE, "godown", "2026-10-27"))?.title).toBe("Godowns first");
    expect(checkBeforeSave({ ...keyed(), docDate: "" })?.title).toBe("Date required");
    expect(checkBeforeSave({ ...keyed(), deviceId: "" })?.title).toBe("No device");
    expect(checkBeforeSave(keyed())?.title).toBe("No lines");
    const noQty = withLine("godown", "");
    const bad = checkBeforeSave(noQty);
    expect(bad?.title).toBe("This transfer cannot be saved yet");
    expect(bad?.focus).toEqual({ lineKey: noQty.lines[0].key });
    expect(checkBeforeSave(withLine())).toBeNull();
  });

  it("asks the Qt questions on Post", () => {
    expect(postConfirm(withLine()).title).toBe("Post the transfer?");
    const branch = postConfirm(withLine("branch"));
    expect(branch.title).toBe("Despatch the transfer?");
    expect(branch.message).toContain("a despatch cannot be cancelled");
  });
});

describe("header changes", () => {
  it("changing From clears the lines; a new To branch clears the To godown", () => {
    const next = changeFromGodown(withLine(), "gd-2", "Other");
    expect(next.lines).toHaveLength(1);
    expect(rowHasItem(next.lines[0])).toBe(false);
    expect(next.fromGodownName).toBe("Other");
    const branch = changeToBranch(keyed("branch"), "branch-3", "Counter3");
    expect(branch).toMatchObject({ toBranchId: "branch-3", toGodownId: "", toGodownName: "" });
  });

  it("carries the run into the next document", () => {
    const next = nextDocument({ ...withLine("branch"), docDate: "2026-10-20", refno: "TRF/1" }, SCOPE, "2026-10-27");
    expect(next).toMatchObject({
      docDate: "2026-10-20",
      fromGodownId: "gd-from",
      toGodownId: "gd-to",
      toBranchId: "branch-2",
      svhId: "",
      refno: "",
      dirty: false,
    });
    expect(next.lines).toHaveLength(1);
    expect(next.handling.loadEnabled).toBe(false);
  });

  it("starts keying where it is missing", () => {
    expect(entryStartTarget(createDraft(SCOPE, "godown", "2026-10-27")).target).toBe("fromGodown");
    expect(entryStartTarget({ ...keyed("branch"), toBranchId: "" }).target).toBe("toBranch");
    expect(entryStartTarget({ ...keyed(), toGodownId: "" }).target).toBe("toGodown");
    expect(entryStartTarget(keyed())).toMatchObject({ target: "cell", column: COL.Barcode });
    expect(entryStartTarget({ ...keyed(), status: "POSTED" }).target).toBe("grid");
  });
});

describe("branch despatch status", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    sttId: "t1",
    status: "IN_TRANSIT",
    itemName: "Shirt",
    batchNo: null,
    toGodownName: "Cold",
    sentQty: 5,
    receivedQty: 0,
    damageQty: 0,
    remainingQty: 5,
    costRate: 10,
    lrNo: null,
    vehicleNo: null,
    expectedOn: null,
    ...over,
  });
  const transit = (rows: ReturnType<typeof row>[], status = "IN_TRANSIT") => ({
    ...keyed("branch"),
    status,
    transit: rows,
  });

  it("recalls only a wholly untouched despatch", () => {
    expect(recallable(transit([row()]))).toBe(true);
    expect(recallable(transit([row(), row({ status: "PARTIAL", receivedQty: 2 })]))).toBe(false);
    expect(recallable(transit([row({ damageQty: 1 })]))).toBe(false);
    expect(recallable(transit([]))).toBe(false);
    expect(recallable(transit([row()], "RECEIVED"))).toBe(false);
  });

  it("settles short once every row has been touched and some stay open", () => {
    expect(settleShortOpen(transit([row()]))).toBe(false);
    expect(settleShortOpen(transit([row({ status: "PARTIAL", receivedQty: 3, remainingQty: 2 })]))).toBe(true);
    expect(settleShortOpen(transit([row({ status: "RECEIVED" })]))).toBe(false);
    expect(shortTotals([row({ remainingQty: 2, costRate: 10 }), row({ remainingQty: 1, costRate: 4 })])).toEqual({
      qty: 3,
      value: 24,
    });
  });
});

describe("local datetime", () => {
  it("round-trips an instant through the datetime-local text", () => {
    const iso = "2026-10-27T04:59:58.632Z";
    const text = localTextFromWire(iso);
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(wireFromLocalText(text)).getTime()).toBe(Math.floor(new Date(iso).getTime() / 60000) * 60000);
    expect(wireFromLocalText("")).toBe("");
  });
});

describe("shortRefno (Qt 3ce8487)", () => {
  it("keeps only the first block of a machine-uuid number", () => {
    expect(shortRefno("TRF/2026-2027/44c01ccc-a162-8314-34b0-1dbf2f5c7bab/17")).toBe("TRF/2026-2027/44c01ccc/17");
  });
  it("leaves a device-code number alone", () => {
    expect(shortRefno("TRF/2026-2027/D14/00059")).toBe("TRF/2026-2027/D14/00059");
    expect(shortRefno("")).toBe("");
  });
});
