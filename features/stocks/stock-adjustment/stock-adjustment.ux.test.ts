/**
 * Stock Adjustment — the 2026-10-24 rework "as on Opening Stock" (Qt 74b755c,
 * tests/stockadjust/test_adjust_ux.cpp A1–A11), the parts that are pure: where
 * keying starts, where Enter stops, which cells draw the list ▾, the item
 * picker's name, the audit lines, the textile batch-label scan and the item
 * text a batch's size / colour / model ride in.
 */
import { describe, expect, it } from "vitest";
import { COL, kindHint, LIST_CELL_PLACEHOLDER } from "./stock-adjustment.constants";
import { applySaveResult, draftFromPayload, lineFromPayload } from "./stock-adjustment.payload";
import {
  applyPickedHolding,
  auditLines,
  batchLabelBucket,
  batchLabelNotFound,
  batchLabelOutcome,
  blankLineEntryColumn,
  entryStartTarget,
  isEnterStop,
  listCellPlaceholder,
  pickedItemName,
  scopeLabel,
  showsListArrow,
  stampsFromHeader,
  whyNotEditable,
} from "./stock-adjustment.state";
import { draftOf, holding, itemLine, SCOPE, withLines } from "./stock-adjustment.test-fixtures";
import type {
  AdjustmentDraft,
  StockAdjustmentHeaderPayload,
  StockAdjustmentLinePayload,
} from "./stock-adjustment.types";
import { httpStatusOf } from "./stock-adjustment.validate";

const USER_ID = "01a14a14-a211-7f53-a5f4-668222f3dc44";

function header(extra: Partial<StockAdjustmentHeaderPayload> = {}): StockAdjustmentHeaderPayload {
  return {
    svhId: "svh-1",
    accYear: "2026-2027",
    companyId: "c-1",
    branchId: "b-1",
    deviceId: "dev-doc",
    voucherType: "ADJUSTMENT",
    slno: "12",
    refno: "ADJ/12",
    usrRefno: null,
    docDate: "2026-10-24",
    fromGodownId: "g-1",
    fromGodownName: "Main",
    godownId: null,
    godownName: null,
    status: "POSTED",
    lineCount: 1,
    totalQty: -3,
    totalValue: -90,
    totalValueWot: -90,
    postedOn: "2026-10-24T14:30:00",
    postedBy: USER_ID,
    postedByName: "Priya",
    cancelledOn: null,
    cancelReason: null,
    createdOn: "2026-10-24T09:05:00",
    createdBy: USER_ID,
    createdByName: "Ravi",
    rateSource: "AVG_COST",
    reasonId: null,
    reasonName: null,
    remarks: null,
    isDeleted: false,
    ...extra,
  };
}

function linePayload(extra: Partial<StockAdjustmentLinePayload> = {}): StockAdjustmentLinePayload {
  return {
    sviId: "svi-1",
    lineNo: 1,
    splitNo: 1,
    itemId: "item-1",
    itemCode: "SH1",
    itemName: "Shirt",
    unitName: "PCS",
    uomId: "iuc-1",
    baseUomId: "iuc-1",
    toBaseFactor: 1,
    godownId: "g-1",
    godownName: "Main",
    bucket: "SALEABLE",
    barcode: null,
    batchNo: "CBE26-00006",
    mfgDate: null,
    expiryDate: null,
    mrp: null,
    salePrice: null,
    serialNo: null,
    supplierId: null,
    supplierName: null,
    toBucket: null,
    qty: 3,
    baseQty: 3,
    costRate: 30,
    value: 90,
    lotId: "lot-1",
    reasonId: "r-short",
    reasonName: "Shortage",
    direction: -1,
    remarks: null,
    trackSignature: "B",
    ...extra,
  };
}

function browsing(draft: AdjustmentDraft): AdjustmentDraft {
  return { ...draft, svhId: "svh-1", mode: "browse" };
}

describe("where keying starts (focusEntryStart)", () => {
  it("the godown while there is none", () => {
    const draft = { ...draftOf("Adjustment"), godownId: "", godownName: "" };
    expect(entryStartTarget(draft)).toEqual({ target: "godown" });
  });

  it("else the first line still without an item, on its Barcode", () => {
    const blank = itemLine({ itemId: "" });
    const draft = withLines(draftOf("Adjustment"), [itemLine(), blank, itemLine()]);
    expect(entryStartTarget(draft)).toEqual({ target: "cell", key: blank.key, column: COL.Barcode });
  });

  it("the trailing blank when every line has its item", () => {
    const draft = withLines(draftOf("Issue"), [itemLine(), itemLine()]);
    const trailing = draft.lines[draft.lines.length - 1];
    expect(entryStartTarget(draft)).toEqual({ target: "cell", key: trailing.key, column: COL.Barcode });
  });

  it("a move starts from the lot — its Item, since it has no Barcode", () => {
    const draft = draftOf("Move");
    expect(entryStartTarget(draft)).toEqual({ target: "cell", key: draft.lines[0].key, column: COL.Description });
    expect(blankLineEntryColumn("Move")).toBe(COL.Description);
    expect(blankLineEntryColumn("Relot")).toBe(COL.Barcode);
  });

  it("a read-only or posted document takes the grid", () => {
    expect(entryStartTarget(browsing(draftOf("Adjustment")))).toEqual({ target: "grid" });
    expect(entryStartTarget({ ...draftOf("Adjustment"), status: "POSTED" })).toEqual({ target: "grid" });
  });
});

describe("where Enter stops (setFocusStops + setFocusCellFilter)", () => {
  const draft = draftOf("Adjustment");
  const blank = itemLine({ itemId: "" });
  const out = itemLine({ reasonId: "r-short", direction: "OUT", qty: "-2" });
  const found = itemLine({ reasonId: "r-found", direction: "IN", qty: "2", trackSignature: "BME" });

  it("a blank line: Barcode and Item, nothing else", () => {
    expect(isEnterStop(draft, blank, COL.Barcode)).toBe(true);
    expect(isEnterStop(draft, blank, COL.Description)).toBe(true);
    expect(isEnterStop(draft, blank, COL.Qty)).toBe(false);
    expect(isEnterStop(draft, blank, COL.ReasonName)).toBe(false);
  });

  it("a line with its item: never Barcode / Item again, always Qty", () => {
    expect(isEnterStop(draft, out, COL.Barcode)).toBe(false);
    expect(isEnterStop(draft, out, COL.Description)).toBe(false);
    expect(isEnterStop(draft, out, COL.Qty)).toBe(true);
  });

  it("only the cells the line can take: an outward line's lot is picked, its cost the engine's", () => {
    expect(isEnterStop(draft, out, COL.BatchNo)).toBe(false);
    expect(isEnterStop(draft, out, COL.CostRate)).toBe(false);
    expect(isEnterStop(draft, found, COL.BatchNo)).toBe(true);
    expect(isEnterStop(draft, found, COL.ExpiryDate)).toBe(true);
    expect(isEnterStop(draft, found, COL.Mrp)).toBe(true);
    expect(isEnterStop(draft, found, COL.CostRate)).toBe(false);
    expect(isEnterStop({ ...draft, rateSource: "MANUAL" }, found, COL.CostRate)).toBe(true);
  });

  it("Reason and Remarks stay click-editable, off the walk", () => {
    expect(isEnterStop(draft, out, COL.ReasonName)).toBe(false);
    expect(isEnterStop(draft, out, COL.Remarks)).toBe(false);
  });

  it("the To bucket is a stop on a move only", () => {
    const move = draftOf("Move");
    const moving = itemLine({ reasonId: "r-md", direction: "MOVE", qty: "1", lotId: "lot-1", toBucket: "DAMAGED" });
    expect(isEnterStop(move, moving, COL.ToBucket)).toBe(true);
    expect(isEnterStop(draft, out, COL.ToBucket)).toBe(false);
  });
});

describe("the list ▾ on Reason, Bucket and To", () => {
  const draft = draftOf("Adjustment");
  const line = itemLine({ reasonId: "r-short", direction: "OUT", qty: "-2" });

  it("on an editable list cell of a line with its item", () => {
    expect(showsListArrow(draft, line, COL.ReasonName)).toBe(true);
    expect(showsListArrow(draft, line, COL.Bucket)).toBe(true);
  });

  it("never on a locked cell — the arrow would promise a list that refuses to open", () => {
    expect(showsListArrow(draft, itemLine({ itemId: "" }), COL.ReasonName)).toBe(false);
    expect(showsListArrow(browsing(draft), line, COL.ReasonName)).toBe(false);
    expect(showsListArrow({ ...draft, reasonsLoaded: false, reasons: [] }, line, COL.ReasonName)).toBe(false);
    expect(showsListArrow(draft, { ...line, lotId: "lot-1" }, COL.Bucket)).toBe(false);
    expect(showsListArrow(draft, line, COL.ToBucket)).toBe(false);
    expect(showsListArrow(draftOf("Expiry"), line, COL.Bucket)).toBe(false);
  });

  it("only on the list columns", () => {
    expect(showsListArrow(draft, line, COL.Qty)).toBe(false);
    expect(showsListArrow(draft, line, COL.Remarks)).toBe(false);
  });

  it("a move's From is its lot's; its To opens", () => {
    const move = draftOf("Move");
    const moving = itemLine({ reasonId: "r-md", direction: "MOVE", lotId: "lot-1", toBucket: "DAMAGED" });
    expect(showsListArrow(move, moving, COL.Bucket)).toBe(false);
    expect(showsListArrow(move, moving, COL.ToBucket)).toBe(true);
  });

  it("a blank list cell reads as muted Select…", () => {
    expect(listCellPlaceholder(COL.ReasonName)).toBe("Select reason");
    expect(listCellPlaceholder(COL.Bucket)).toBe("Select");
    expect(listCellPlaceholder(COL.ToBucket)).toBe("Select");
    expect(listCellPlaceholder(COL.Qty)).toBe("");
    expect(Object.keys(LIST_CELL_PLACEHOLDER).map(Number).sort((a, b) => a - b)).toEqual([
      COL.Bucket,
      COL.ToBucket,
      COL.ReasonName,
    ]);
  });
});

describe("the item picker's name", () => {
  it("grid 71's item_name_en first — reading item_name alone left the cell blank", () => {
    expect(pickedItemName({ item_name_en: "Rice 1kg", item_name: "rice" })).toBe("Rice 1kg");
    expect(pickedItemName({ item_name_en: undefined, item_name: "Rice 1kg" })).toBe("Rice 1kg");
    expect(pickedItemName({})).toBe("");
  });
});

describe("Pick from stock is F12 now (F2 is Edit everywhere)", () => {
  it("every message that named the key names F12", () => {
    const draft = draftOf("Adjustment");
    const out = itemLine({ reasonId: "r-short", direction: "OUT", qty: "-2" });
    expect(whyNotEditable(draft, itemLine({ itemId: "" }), COL.Qty)).toContain("F12");
    expect(whyNotEditable(draft, out, COL.BatchNo)).toContain("F12");
    expect(whyNotEditable(draft, { ...out, lotId: "lot-1" }, COL.Bucket)).toContain("(F12)");
    expect(whyNotEditable(draftOf("Expiry"), out, COL.Bucket)).toBe("Pick the lot first (F12) — its bucket comes with it.");
    expect(kindHint("Expiry")).toBe("An EXPIRED lot written off — pick the lot (F12).");
  });
});

describe("the title block", () => {
  it("a new document says so", () => {
    expect(auditLines(draftOf("Adjustment"))).toEqual(["New — not saved yet"]);
  });

  it("a loaded one says who created and posted it, in the 12-hour house format", () => {
    const draft = draftFromPayload(SCOPE, { header: header(), lines: [], kind: "ADJUSTMENT" }, false, "2026-10-26");
    expect(auditLines(draft)).toEqual(["Created 24/10/2026 09:05 AM by Ravi", "Posted 24/10/2026 02:30 PM by Priya"]);
    expect(draft.notice).toBe("");
  });

  it("names the creator, never a bare user id; an import job's name is kept", () => {
    expect(stampsFromHeader(header({ createdByName: null })).createdBy).toBe("");
    expect(stampsFromHeader(header({ createdByName: null, createdBy: "Tally import" })).createdBy).toBe("Tally import");
    const cancelled = stampsFromHeader(header({ cancelledOn: "2026-10-25T18:00:00" }));
    expect(auditLines({ svhId: "svh-1", stamps: cancelled })).toContain("Cancelled 25/10/2026 06:00 PM");
  });

  it("a draft saved just now already says who created it", () => {
    const line = itemLine({ qty: "-1", direction: "OUT" });
    const draft = withLines(draftOf("Adjustment"), [line]);
    const saved = applySaveResult(
      draft,
      { header: header({ status: "DRAFT", postedOn: null, postedByName: null }), lines: [linePayload()], rowsPosted: null },
      [line.key],
    );
    expect(auditLines(saved)).toEqual(["Created 24/10/2026 09:05 AM by Ravi"]);
  });

  it("the scope line is the godown alone — the voucher number carries the year", () => {
    expect(scopeLabel({ godownName: "" })).toBe("");
    expect(scopeLabel({ godownName: "Main" })).toBe("Main");
  });
});

describe("the textile batch-label scan", () => {
  it("looks in every bucket — an expiry write-off keeps the line's own", () => {
    expect(batchLabelBucket("Adjustment", { bucket: "SALEABLE" })).toBe("");
    expect(batchLabelBucket("Move", { bucket: "DAMAGED" })).toBe("");
    expect(batchLabelBucket("Expiry", { bucket: "EXPIRED" })).toBe("EXPIRED");
    expect(batchLabelBucket("Expiry", { bucket: "" })).toBe("");
  });

  it("one holding is taken, several open the picker, none is not found", () => {
    expect(batchLabelOutcome([holding()])).toBe("take");
    expect(batchLabelOutcome([holding(), holding({ bucket: "DAMAGED" })])).toBe("choose");
    expect(batchLabelOutcome([])).toBe("none");
    expect(batchLabelNotFound("CBE26-00099", "Trichy")).toBe(
      "“CBE26-00099” is neither an item barcode nor a batch with stock in Trichy.",
    );
  });

  it("only a 404 from the barcode lookup is 'not an item barcode'", () => {
    expect(httpStatusOf({ status: 404, data: {} })).toBe(404);
    expect(httpStatusOf({ status: "FETCH_ERROR" })).toBe(0);
    expect(httpStatusOf(null)).toBe(0);
  });
});

describe("a batch's size, colour and model ride in the Item text", () => {
  it("on a picked holding", () => {
    const draft = draftOf("Adjustment");
    const key = draft.lines[0].key;
    const picked = applyPickedHolding(
      draft,
      key,
      holding({ itemName: "Shirt", sizeName: "XL", colourName: "Maroon", model: "Slim fit" }),
    ).draft;
    expect(picked.lines[0].itemName).toBe("Shirt · XL · Maroon · Slim fit");
    const plain = applyPickedHolding(draft, key, holding({ itemName: "Rice 1kg" })).draft;
    expect(plain.lines[0].itemName).toBe("Rice 1kg");
  });

  it("on a loaded line", () => {
    expect(lineFromPayload(linePayload({ sizeName: "M", colourName: null, model: "Regular" })).itemName).toBe(
      "Shirt · M · Regular",
    );
    expect(lineFromPayload(linePayload()).itemName).toBe("Shirt");
  });
});
