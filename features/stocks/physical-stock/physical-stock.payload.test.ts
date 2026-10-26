import { describe, expect, it } from "vitest";
import {
  CANCEL_POSTED_CONFIRM,
  apiErrorText,
  bookBeforeSave,
  bookMovedLines,
  bookMovedText,
  buildLines,
  buildPayload,
  buildPostPayload,
  failingLines,
  lineProblemsMessage,
  postConfirmMessage,
  postedMessage,
  refusalLineProblems,
  savedDraftMessage,
  sheetRowsOf,
} from "./physical-stock.payload";
import { blankLine, computeTotals, createDraft, recalcLine } from "./physical-stock.state";
import type { CountLine, PhysicalStockDraft, PhysicalStockWireLine } from "./physical-stock.types";

function line(overrides: Partial<CountLine>): CountLine {
  return recalcLine({
    ...blankLine(overrides.key ?? "k"),
    lineNo: 3,
    splitNo: 1,
    itemId: "item-a",
    godownId: "g1",
    lotId: "lot-1",
    bucket: "SALEABLE",
    bookQty: 10,
    avgCostRate: 4,
    ...overrides,
  });
}

function draftWith(lines: CountLine[], overrides: Partial<PhysicalStockDraft> = {}): PhysicalStockDraft {
  return {
    ...createDraft({
      scope: { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" },
      today: "2026-10-02",
      now: "2026-10-02T09:00",
    }),
    godownId: "g1",
    godownName: "Coimbatore",
    lines,
    ...overrides,
  };
}

describe("buildLines — one typed number per line", () => {
  it("sends only the walked holdings, in the narrow count-line shape", () => {
    const lines = [
      line({ key: "a", countedText: "7" }),
      line({ key: "b", lotId: "lot-2", countedText: "" }),
      line({ key: "c", lotId: "lot-3", countedText: "0", reasonId: "r1", remarks: "  torn  " }),
      blankLine("blank"),
    ];
    expect(buildLines(lines)).toEqual([
      { lineNo: 3, splitNo: 1, itemId: "item-a", godownId: "g1", lotId: "lot-1", bucket: "SALEABLE", countedQty: 7 },
      {
        lineNo: 3,
        splitNo: 1,
        itemId: "item-a",
        godownId: "g1",
        lotId: "lot-3",
        bucket: "SALEABLE",
        countedQty: 0,
        reasonId: "r1",
        remarks: "torn",
      },
    ]);
  });

  it("never sends a split below 1", () => {
    expect(buildLines([line({ splitNo: null, countedText: "1" })])[0].splitNo).toBe(1);
  });

  it("a saved line sends its sviId, so the server updates that row; a new one sends none", () => {
    const [saved, fresh] = buildLines([
      line({ key: "a", sviId: "svi-7", countedText: "7" }),
      line({ key: "b", lotId: "lot-2", countedText: "8" }),
    ]);
    expect(saved.sviId).toBe("svi-7");
    expect("sviId" in fresh).toBe(false);
  });
});

describe("buildPayload", () => {
  it("carries the net variance as the header totals, and no freeze when it is off", () => {
    const lines = [line({ key: "a", countedText: "7" }), line({ key: "b", lotId: "lot-2", countedText: "12" })];
    const draft = draftWith(lines, { usrRefno: "  R-1 ", remarks: "", reasonId: "rs" });
    const payload = buildPayload(draft, computeTotals(lines));
    expect(payload.header).toEqual({
      accYear: "2026-2027",
      companyId: "c1",
      branchId: "b1",
      deviceId: "d1",
      docDate: "2026-10-02",
      toGodownId: "g1",
      rateSource: "AVG_COST",
      reasonId: "rs",
      freezeStock: false,
      lineCount: 2,
      totalQty: -1,
      totalValue: -4,
      totalValueWot: -4,
      usrRefno: "R-1",
    });
    expect(payload.lines).toHaveLength(2);
  });

  it("names the document on an update and sends the freeze window with its offset", () => {
    const lines = [line({ countedText: "10" })];
    const draft = draftWith(lines, {
      svhId: "svh-1",
      freezeStock: true,
      freezeFrom: "2026-10-02T09:00",
      freezeTo: "2026-10-02T12:00",
    });
    const header = buildPayload(draft, computeTotals(lines)).header;
    expect(header.svhId).toBe("svh-1");
    expect(header.freezeStock).toBe(true);
    expect(header.freezeFrom).toMatch(/^2026-10-02T09:00:00[+-]\d{2}:\d{2}$/);
    expect(header.freezeTo).toMatch(/^2026-10-02T12:00:00[+-]\d{2}:\d{2}$/);
    expect(header.lineCount).toBe(1);
    expect(header.totalQty).toBe(0);
  });
});

describe("Post — one save call that posts (notes 106)", () => {
  it("is the save payload with header.status POSTED, and changes nothing else", () => {
    const lines = [line({ key: "a", countedText: "7" })];
    const draft = draftWith(lines, { svhId: "svh-1" });
    const totals = computeTotals(lines);
    const saved = buildPayload(draft, totals);
    const posted = buildPostPayload(draft, totals);
    expect(saved.header.status).toBeUndefined();
    expect(posted).toEqual({ ...saved, header: { ...saved.header, status: "POSTED" } });
  });

  it("asks with the counted / variance / net summary", () => {
    expect(
      postConfirmMessage({ lines: 3, counted: 3, varianceLines: 1, netQty: -2, netValue: -8 }),
    ).toBe(
      "Posting writes the stock ledger for the lines that DISAGREE and freezes this sheet. " +
        "A line that matches writes nothing.\n\n3 / 3 counted · 1 with a variance · net -2.000",
    );
  });

  it("says so when holdings on screen are left off the document", () => {
    expect(
      postConfirmMessage({ lines: 5, counted: 3, varianceLines: 0, netQty: 0, netValue: 0 }),
    ).toMatch(/\n\n2 holdings on screen are not counted and are left off the document\.$/);
  });

  it("words the posted answer by rowsPosted — 0 is a success, absent says only 'posted'", () => {
    expect(postedMessage("PS-7", 3)).toBe("PS-7 posted — 3 variance rows written.");
    expect(postedMessage("PS-7", 0)).toBe(
      "PS-7 posted — every holding counted matched the book, so no ledger row was written. " +
        "Nothing was wrong.",
    );
    expect(postedMessage("PS-7", null)).toBe("PS-7 posted.");
    expect(postedMessage("PS-7", undefined)).toBe("PS-7 posted.");
    expect(postedMessage("PS-7", "3")).toBe("PS-7 posted.");
  });

  it("reads per-line problems off a refusal's data, and nothing off a plain one", () => {
    const refused = {
      status: 422,
      data: {
        success: false,
        message: "This physical stock count cannot be posted",
        data: [
          { sviId: "1", lineNo: 1, splitNo: 1, itemId: "a", itemCode: null, itemName: "MILK", problem: null },
          { sviId: "2", lineNo: 2, splitNo: 1, itemId: "b", itemCode: null, itemName: "CURD", problem: "lot gone" },
        ],
      },
    };
    expect(refusalLineProblems(refused).map((row) => row.lineNo)).toEqual([2]);
    expect(
      refusalLineProblems({
        status: 422,
        data: { message: "x", errors: [{ field: "lines.2", message: "Line 2 (CURD): lot gone" }] },
      }),
    ).toEqual([]);
    expect(refusalLineProblems({ status: 422, data: { data: [{ lineNo: 1, problem: null }] } })).toEqual([]);
    expect(refusalLineProblems(undefined)).toEqual([]);
  });
});

describe("the book moved since the lines were drawn (notes 150 #4)", () => {
  function saved(overrides: Partial<PhysicalStockWireLine>): PhysicalStockWireLine {
    return {
      sviId: "svi-1",
      lineNo: 1,
      splitNo: 1,
      itemId: "item-a",
      itemCode: null,
      itemName: "Shirt",
      unitName: null,
      baseUomId: "u1",
      godownId: "g1",
      godownName: null,
      bucket: "SALEABLE",
      batchNo: null,
      mfgDate: null,
      expiryDate: null,
      mrp: null,
      salePrice: null,
      serialNo: null,
      supplierId: null,
      supplierName: null,
      bookQty: 10,
      countedQty: 7,
      diffQty: -3,
      reasonId: null,
      reasonName: null,
      lotId: "lot-1",
      remarks: null,
      ...overrides,
    };
  }

  it("remembers the on-screen book of the COUNTED lines only, by lot and bucket", () => {
    const before = bookBeforeSave([
      line({ key: "a", countedText: "7", bookQty: 10 }),
      line({ key: "b", lotId: "lot-2", countedText: "", bookQty: 4 }),
      line({ key: "c", lotId: "lot-1", bucket: "DAMAGED", countedText: "0", bookQty: null }),
      blankLine("blank"),
    ]);
    expect([...before.entries()]).toEqual([
      ["lot-1|SALEABLE", 10],
      ["lot-1|DAMAGED", 0],
    ]);
  });

  it("lists a line the server re-based, from its previousBookQty, with the textile detail", () => {
    const moved = bookMovedLines(
      [
        saved({ lineNo: 3, bookChanged: true, previousBookQty: 2, bookQty: 3, sizeName: "XL", colourName: "Maroon" }),
        saved({ lineNo: 4, lotId: "lot-2", bookChanged: false, previousBookQty: null, bookQty: 5 }),
      ],
      new Map([["lot-2|SALEABLE", 5]]),
    );
    expect(moved).toEqual(["Line 3  Shirt · XL · Maroon — book 2 → 3"]);
  });

  it("on a first save, compares the book the screen drew with the one the save read", () => {
    const before = new Map([
      ["lot-1|SALEABLE", 10],
      ["lot-2|SALEABLE", 4],
    ]);
    const moved = bookMovedLines(
      [saved({ lineNo: 1, bookQty: 12.5 }), saved({ lineNo: 2, lotId: "lot-2", bookQty: "4.0004" })],
      before,
    );
    expect(moved).toEqual(["Line 1  Shirt — book 10 → 12.5"]);
  });

  it("appends to the Saved message only when something moved", () => {
    expect(bookMovedText([])).toBe("");
    expect(savedDraftMessage("PHY/1", 0, 2, [])).toBe("PHY/1 saved as a draft. No stock has moved.");
    expect(savedDraftMessage("PHY/1", 1, 3, ["Line 3  Shirt — book 2 → 3"])).toBe(
      "PHY/1 saved as a draft. No stock has moved.\n\n1 of 3 holdings on screen have not been " +
        "counted yet, so they are NOT on the saved document — count them and save again to add " +
        "them. A blank is not the same as counting zero.\n\nStock moved since these lines were " +
        "drawn, so their book quantity — and the difference — changed. Check the count is still " +
        "right:\nLine 3  Shirt — book 2 → 3",
    );
  });

  it("a posted sheet's cancel says a second count is usually the fix", () => {
    expect(CANCEL_POSTED_CONFIRM).toContain("a SECOND COUNT is usually the right fix, not a cancel");
    expect(CANCEL_POSTED_CONFIRM).toContain(
      "A cancel is refused once the stock has been sold, or once the holding has been counted again.",
    );
  });
});

describe("sheetRowsOf — whatever shape the envelope takes", () => {
  it("reads data.items, data.rows, data.data and a bare array", () => {
    const row = { lotId: "x" };
    expect(sheetRowsOf({ data: { items: [row], meta: {} } })).toEqual([row]);
    expect(sheetRowsOf({ data: { rows: [row] } })).toEqual([row]);
    expect(sheetRowsOf({ data: { data: [row] } })).toEqual([row]);
    expect(sheetRowsOf({ data: [row] })).toEqual([row]);
    expect(sheetRowsOf({ data: {} })).toEqual([]);
    expect(sheetRowsOf(null)).toEqual([]);
  });
});

describe("the validate answer", () => {
  const rows = [
    { sviId: "1", lineNo: 1, splitNo: 1, itemId: "a", itemCode: null, itemName: "MILK", problem: null },
    {
      sviId: "2",
      lineNo: 2,
      splitNo: 1,
      itemId: "b",
      itemCode: null,
      itemName: "CURD",
      problem: "the book quantity has changed since this sheet was generated",
    },
  ];

  it("keeps only the failing lines", () => {
    expect(failingLines(rows)).toHaveLength(1);
  });

  it("lists them the way the Qt screen does", () => {
    expect(lineProblemsMessage(rows)).toBe(
      "1 of the lines have to be fixed first:\n\nLine 2: CURD — the book quantity has changed since this sheet was generated",
    );
  });
});

describe("apiErrorText — the headline and every per-field reason", () => {
  it("shape C: message plus errors[]", () => {
    expect(
      apiErrorText({
        status: 422,
        data: {
          success: false,
          message: "This physical stock count cannot be saved",
          errors: [{ field: "lines.0", message: "Line 1 has not been counted yet." }],
        },
      }),
    ).toBe("This physical stock count cannot be saved\n• lines.0 — Line 1 has not been counted yet.");
  });

  it("shape A: a nested Nest message array", () => {
    expect(
      apiErrorText({ data: { message: { error: "Bad Request", message: ["a should not exist", "b"] } } }),
    ).toBe("a should not exist\nb");
  });

  it("shape B: a plain message, and the fallback for nothing at all", () => {
    expect(apiErrorText({ data: { message: "Gone" } })).toBe("Gone");
    expect(apiErrorText({ message: "Request failed." })).toBe("Request failed.");
    expect(apiErrorText(undefined)).toBe("An unexpected error occurred.");
  });
});
