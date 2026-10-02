import { describe, expect, it } from "vitest";
import { blankLine } from "./opening-stock.lines";
import { createDraft } from "./opening-stock.state";
import { missingIdentityLines, notADraftMessage, validateBeforeSave } from "./opening-stock.validate";
import type { OpeningStockDraft, OpeningStockLine } from "./opening-stock.types";

function line(overrides: Partial<OpeningStockLine> = {}): OpeningStockLine {
  return {
    ...blankLine(overrides.key),
    itemId: "item-1",
    itemName: "Paracetamol",
    uomId: "iuc-box",
    baseUomId: "iuc-pcs",
    toBaseFactor: 1,
    godownId: "gdl-1",
    splitNo: 1,
    qty: 1,
    costPerUnit: 10,
    costRate: 10,
    trackSignature: "N",
    ...overrides,
  };
}

function draft(lines: OpeningStockLine[], overrides: Partial<OpeningStockDraft> = {}): OpeningStockDraft {
  const base = createDraft(
    { companyId: "c", branchId: "b", accYear: "2026-2027", deviceId: "device-1" },
    "2026-10-02",
  );
  return {
    ...base,
    header: { ...base.header, godownId: "gdl-1", godownName: "Main" },
    lines: [...lines, blankLine()],
    ...overrides,
  };
}

describe("validateBeforeSave", () => {
  it("passes a complete document", () => {
    expect(validateBeforeSave(draft([line()]))).toBeNull();
  });

  it("wants the header godown first — an opening is inward", () => {
    const base = draft([line()]);
    const violation = validateBeforeSave({ ...base, header: { ...base.header, godownId: "" } });
    expect(violation?.title).toBe("Godown required");
    expect(violation?.message).toBe("An opening is inward — it needs the godown the stock opens in.");
    expect(violation?.focus).toEqual({ kind: "godown" });
  });

  it("wants a real document date", () => {
    const base = draft([line()]);
    const violation = validateBeforeSave({ ...base, header: { ...base.header, docDate: "2026-02-30" } });
    expect(violation?.title).toBe("Date required");
  });

  it("refuses without a registered device — the device mints the number", () => {
    const violation = validateBeforeSave(draft([line()], { deviceId: "" }));
    expect(violation?.title).toBe("No device");
  });

  it("names the grid row with no quantity (free goods alone are a quantity)", () => {
    const violation = validateBeforeSave(draft([line(), line({ key: "two", qty: 0, freeQty: 0 })]));
    expect(violation?.message).toBe("Line 2 has no quantity.");
    expect(violation?.focus).toEqual({ kind: "cell", rowKey: "two", field: "qty" });
    expect(validateBeforeSave(draft([line({ qty: 0, freeQty: 2 })]))).toBeNull();
  });

  it("names a line with no godown", () => {
    const violation = validateBeforeSave(draft([line({ godownId: "" })]));
    expect(violation?.title).toBe("Godown missing");
    expect(violation?.message).toBe(
      "Line 1 has no godown. Choose the header godown, or re-pick the item on that line.",
    );
  });

  it("names a date it cannot read, in the keyed format", () => {
    const violation = validateBeforeSave(draft([line({ expiryDate: "31-03-20" })]));
    expect(violation?.title).toBe("Date not understood");
    expect(violation?.message).toBe(
      'Line 1 has "31-03-20" where a date belongs. Dates are keyed dd-MM-yyyy — 31-03-2027.',
    );
  });

  it("wants the unit and base unit the item lookup supplies", () => {
    expect(validateBeforeSave(draft([line({ baseUomId: "" })]))?.title).toBe("Unit missing");
  });

  it("wants a keyed cost only when the rate source derives nothing", () => {
    const manual = validateBeforeSave(draft([line({ costRate: 0 })]));
    expect(manual?.title).toBe("Cost required");
    expect(manual?.focus).toMatchObject({ field: "costPerUnit" });
    const derived = draft([line({ costRate: 0 })]);
    derived.header = { ...derived.header, rateSource: "AVG_COST" };
    expect(validateBeforeSave(derived)).toBeNull();
  });

  it("wants at least one item", () => {
    expect(validateBeforeSave(draft([]))?.message).toBe("Add at least one item.");
  });
});

describe("missingIdentityLines", () => {
  it("lists what each line's item is tracked by and lacks — the four the pre-post check refuses on", () => {
    const notices = missingIdentityLines([
      line({ itemName: "A", trackSignature: "BME" }),
      line({ itemName: "B", trackSignature: "BMEP", batchNo: "x", expiryDate: "31-03-2027", mrp: 10 }),
      line({ itemName: "C", trackSignature: "RS" }),
      blankLine(),
    ]);
    expect(notices).toEqual(["Line 1  A — batch, expiry, MRP", "Line 3  C — serial no"]);
  });
});

describe("notADraftMessage", () => {
  it("says what the document is", () => {
    expect(notADraftMessage({ refno: "OPN0001", status: "POSTED" })).toBe(
      "OPN0001 is POSTED and cannot be saved again.",
    );
  });
});
