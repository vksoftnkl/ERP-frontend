import { describe, expect, it } from "vitest";
import { batchDetailItemText, lotsByBatchParams } from "./batch-detail";

describe("batchDetailItemText", () => {
  it("rides the size, colour and model after the item name", () => {
    expect(
      batchDetailItemText({ itemName: "Shirt", sizeName: "XL", colourName: "Maroon", model: "Slim fit" }),
    ).toBe("Shirt · XL · Maroon · Slim fit");
  });

  it("skips blank and missing parts", () => {
    expect(batchDetailItemText({ itemName: "Shirt", sizeName: " ", colourName: null, model: "Slim" })).toBe(
      "Shirt · Slim",
    );
    expect(batchDetailItemText({ itemName: "Shirt" })).toBe("Shirt");
  });
});

describe("lotsByBatchParams", () => {
  it("sends only the keys asked for", () => {
    expect(lotsByBatchParams({ companyId: "c", branchId: "b", batchNo: " CBE26-00002 " })).toEqual({
      companyId: "c",
      branchId: "b",
      batchNo: "CBE26-00002",
    });
  });

  it("names every bucket and the godown for a count", () => {
    expect(
      lotsByBatchParams({
        companyId: "c",
        branchId: "b",
        batchNo: "x",
        includeEmpty: true,
        bucket: "ALL",
        godownId: "g",
      }),
    ).toEqual({ companyId: "c", branchId: "b", batchNo: "x", includeEmpty: "true", bucket: "ALL", godownId: "g" });
  });
});
