import { describe, expect, it } from "vitest";
import {
  apiErrorText,
  buildLines,
  buildPayload,
  failingLines,
  lineProblemsMessage,
  sheetRowsOf,
} from "./physical-stock.payload";
import { blankLine, computeTotals, createDraft, recalcLine } from "./physical-stock.state";
import type { CountLine, PhysicalStockDraft } from "./physical-stock.types";

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
