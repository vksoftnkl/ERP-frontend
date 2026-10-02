import { describe, expect, it } from "vitest";
import { blankLine } from "./opening-stock.lines";
import {
  buildLines,
  buildPayload,
  describeError,
  fieldErrorsOf,
  headerFromPayload,
  lineFromPayload,
  lineProblemsOf,
  rateSourceOf,
  statusOf,
} from "./opening-stock.payload";
import { createDraft } from "./opening-stock.state";
import type { OpeningStockDraft, OpeningStockLine, OpeningStockLinePayload } from "./opening-stock.types";

function line(overrides: Partial<OpeningStockLine> = {}): OpeningStockLine {
  return {
    ...blankLine(),
    itemId: "item-1",
    itemName: "Item",
    uomId: "iuc-box",
    baseUomId: "iuc-pcs",
    toBaseFactor: 12,
    godownId: "gdl-1",
    bucket: "SALEABLE",
    splitNo: 1,
    qty: 10,
    baseQty: 120,
    costPerUnit: 240,
    costRate: 20,
    costRateWot: 20,
    value: 2400,
    valueWot: 2400,
    trackSignature: "N",
    ...overrides,
  };
}

function draftWith(lines: OpeningStockLine[]): OpeningStockDraft {
  const draft = createDraft(
    { companyId: "company-1", branchId: "branch-1", accYear: "2026-2027", deviceId: "device-1" },
    "2026-10-02",
  );
  return {
    ...draft,
    header: { ...draft.header, godownId: "gdl-1", godownName: "Main" },
    lines: [...lines, blankLine()],
  };
}

describe("buildLines", () => {
  it("numbers lines by split: a split of 1 opens a line, a higher one belongs to the line above", () => {
    const lines = buildLines([
      line({ splitNo: 1, batchNo: "B1", trackSignature: "B" }),
      line({ splitNo: 2, batchNo: "B2", trackSignature: "B" }),
      line({ splitNo: 0 }),
      blankLine(),
    ]);
    expect(lines.map((dto) => [dto.lineNo, dto.splitNo])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it("sends the base quantity, the per-BASE-unit cost and never the typed per-unit cost", () => {
    const [dto] = buildLines([line()]);
    expect(dto.qty).toBe(10);
    expect(dto.baseQty).toBe(120);
    expect(dto.toBaseFactor).toBe(12);
    expect(dto.costRate).toBe(20);
    expect(dto).not.toHaveProperty("costPerUnit");
    expect(dto).not.toHaveProperty("value");
  });

  it("sends identity columns only when the item tracks them", () => {
    const untracked = buildLines([
      line({ batchNo: "B1", mfgDate: "01-01-2026", expiryDate: "31-12-2027", serialNo: "S1", mrp: 30, supplierId: "sup-1" }),
    ])[0];
    expect(untracked.batchNo).toBeUndefined();
    expect(untracked.expiryDate).toBeUndefined();
    expect(untracked.serialNo).toBeUndefined();
    expect(untracked.mrp).toBeUndefined();
    expect(untracked.supplierId).toBeUndefined();

    const tracked = buildLines([
      line({
        trackSignature: "BMSERP",
        batchNo: " B1 ",
        mfgDate: "01-01-2026",
        expiryDate: "31-12-2027",
        serialNo: "S1",
        mrp: 30,
        salePrice: 28,
        supplierId: "sup-1",
      }),
    ])[0];
    expect(tracked.batchNo).toBe("B1");
    // Keyed dd-mm-yyyy, sent ISO.
    expect(tracked.mfgDate).toBe("2026-01-01");
    expect(tracked.expiryDate).toBe("2027-12-31");
    expect(tracked.serialNo).toBe("S1");
    expect(tracked.mrp).toBe(30);
    expect(tracked.salePrice).toBe(28);
    expect(tracked.supplierId).toBe("sup-1");
  });

  it("sends MRP as 0 on an MRP-tracked line keyed without one", () => {
    expect(buildLines([line({ trackSignature: "M", mrp: 0 })])[0].mrp).toBe(0);
  });

  it("omits blank barcode, remarks and an unparsable date", () => {
    const dto = buildLines([line({ trackSignature: "E", expiryDate: "31-03-20" })])[0];
    expect(dto.expiryDate).toBeUndefined();
    expect(dto.barcode).toBeUndefined();
    expect(dto.remarks).toBeUndefined();
  });
});

describe("buildPayload", () => {
  it("creates when there is no svhId, and carries the screen's own totals", () => {
    const payload = buildPayload(
      draftWith([line(), line({ splitNo: 2, trackSignature: "B", baseQty: 12, freeBaseQty: 12, value: 480, valueWot: 400 })]),
    );
    expect(payload.header.svhId).toBeUndefined();
    expect(payload.header.toGodownId).toBe("gdl-1");
    expect(payload.header.docDate).toBe("2026-10-02");
    expect(payload.header.rateSource).toBe("MANUAL");
    expect(payload.header.lineCount).toBe(1);
    expect(payload.header.totalQty).toBe(144);
    expect(payload.header.totalValue).toBe(2880);
    expect(payload.header.totalValueWot).toBe(2800);
    expect(payload.header.status).toBeUndefined();
    expect(payload.header.usrRefno).toBeUndefined();
    expect(payload.lines).toHaveLength(2);
  });

  it("updates by svhId, and Save & Post asks for POSTED", () => {
    const draft = { ...draftWith([line()]), svhId: "svh-1" };
    draft.header = { ...draft.header, usrRefno: " REF-9 ", remarks: "go-live" };
    const payload = buildPayload(draft, { post: true });
    expect(payload.header.svhId).toBe("svh-1");
    expect(payload.header.status).toBe("POSTED");
    expect(payload.header.usrRefno).toBe("REF-9");
    expect(payload.header.remarks).toBe("go-live");
  });
});

describe("reading the stored document", () => {
  const stored: OpeningStockLinePayload = {
    sviId: "svi-1",
    lineNo: 1,
    splitNo: "1",
    itemId: "item-1",
    itemCode: "P1",
    itemName: "Item",
    unitName: "BOX",
    uomId: "iuc-box",
    baseUomId: "iuc-pcs",
    toBaseFactor: "12.000000",
    godownId: "gdl-1",
    godownName: "Main",
    bucket: "SALEABLE",
    barcode: null,
    batchNo: "B1",
    mfgDate: null,
    expiryDate: "2027-03-31T00:00:00.000Z",
    mrp: null,
    salePrice: null,
    serialNo: null,
    supplierId: null,
    supplierName: null,
    qty: "10",
    baseQty: "120",
    freeQty: 0,
    freeBaseQty: 0,
    weightQty: 0,
    costRate: "20.000000",
    costRateWot: "17.857143",
    landedRate: 0,
    taxPerc: "12",
    value: "2400.00",
    valueWot: "2142.86",
    lotId: null,
    remarks: null,
    trackSignature: null,
  };

  it("paints what was saved — the per-unit cost re-derived, dates as keyed, N for no signature", () => {
    const row = lineFromPayload(stored);
    expect(row.costPerUnit).toBe(240);
    expect(row.costRate).toBe(20);
    expect(row.value).toBe(2400);
    expect(row.expiryDate).toBe("31-03-2027");
    expect(row.trackSignature).toBe("N");
    expect(row.splitNo).toBe(1);
  });

  it("reads the header and falls back on unknown values", () => {
    expect(statusOf("posted")).toBe("POSTED");
    expect(statusOf(null)).toBe("DRAFT");
    expect(rateSourceOf("avg_cost")).toBe("AVG_COST");
    expect(rateSourceOf("bogus")).toBe("MANUAL");
    const header = headerFromPayload({
      svhId: "s",
      accYear: "2026-2027",
      companyId: "c",
      branchId: "b",
      deviceId: "d",
      refno: "OPN0001",
      usrRefno: null,
      docDate: "2026-04-01T00:00:00.000Z",
      godownId: "g",
      godownName: "Main",
      status: "DRAFT",
      lineCount: 0,
      totalQty: 0,
      totalValue: 0,
      totalValueWot: 0,
      rateSource: null,
      remarks: null,
    });
    expect(header.docDate).toBe("2026-04-01");
    expect(header.rateSource).toBe("MANUAL");
    expect(header.usrRefno).toBe("");
  });
});

describe("errors", () => {
  it("locates each refused line by the line number it was sent under", () => {
    const problems = lineProblemsOf([
      { field: "lines.1", message: "Line 1 (Item): this holding already has an opening in this year" },
      { field: "lines.3", message: "Line 3 split 2 (Other): batch is blank" },
      { field: "header", message: "" },
    ]);
    expect(problems).toEqual([
      { lineNo: 1, splitNo: 1, message: "Line 1 (Item): this holding already has an opening in this year" },
      { lineNo: 3, splitNo: 2, message: "Line 3 split 2 (Other): batch is blank" },
    ]);
  });

  it("reads errors[] out of a failed body, and words the failure the server's way", () => {
    const data = {
      success: false,
      message: "This opening stock cannot be saved",
      errors: [{ field: "toGodownId", message: "toGodownId must be a UUID" }],
    };
    expect(fieldErrorsOf(data)).toEqual([{ field: "toGodownId", message: "toGodownId must be a UUID" }]);
    expect(describeError({ status: 400, data, message: "x" })).toBe(
      "This opening stock cannot be saved\n\ntoGodownId must be a UUID",
    );
    expect(describeError(undefined, "Fallback")).toBe("Fallback");
  });
});
