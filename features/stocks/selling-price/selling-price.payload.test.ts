/**
 * The save and its answers — Qt `buildPayload`, `postSave`'s needs-confirm
 * and saved paths, `showServerRefusal` — and the strip under the grid
 * (`refreshValidation`).
 */
import { describe, expect, it } from "vitest";
import {
  belowCostLines,
  belowCostSummary,
  buildSavePayload,
  describeApiError,
  filterNotAvailableMessage,
  refusedFilterKey,
  refusedLineNumbers,
  savedMessage,
} from "./selling-price.payload";
import { applyCellEdit, rowFromServer, setLevelPrice, type PriceGridRow } from "./selling-price.state";
import { validateRows } from "./selling-price.validate";
import type { SellingPriceRow, SellingPriceSaveResult } from "./selling-price.types";

const NAMES = ["Wholesale", "Retail", "Dealer", "Special"];

function serverRow(overrides: Partial<SellingPriceRow> = {}): SellingPriceRow {
  return {
    lineNo: 1,
    itemId: "item-1",
    itemCode: "SALT",
    barcode: null,
    itemName: "Salt 1 Kg",
    uomId: "iuc-1",
    unitName: "PCS",
    stockQty: 5,
    mrp: 120,
    salePrice: null,
    maxPrice: 120,
    priceSource: "BUCKET",
    priceScope: "BRANCH",
    bucketId: "ipm-1",
    costRate: 90,
    costWot: 76.27,
    costBasis: "MRP",
    minPrice: 80,
    roundOff: 0.5,
    taxPerc: 18,
    inclTax: true,
    hasCess: false,
    levels: [110, 105, 100, 95].map((price, index) => ({
      level: index + 1,
      price,
      priceWot: 0,
      markupPerc: 0,
      marginPerc: 0,
    })),
    ...overrides,
  };
}

function row(overrides: Partial<SellingPriceRow> = {}): PriceGridRow {
  return rowFromServer(serverRow(overrides));
}

function result(overrides: Partial<SellingPriceSaveResult> = {}): SellingPriceSaveResult {
  return {
    saved: 0,
    masterRowsSaved: 0,
    noStock: [],
    needsConfirm: false,
    problems: [],
    belowCostPolicy: "warning",
    ...overrides,
  };
}

describe("buildSavePayload", () => {
  it("sends the CHANGED rows only, each as the grid line it is", () => {
    const untouched = row();
    const edited = setLevelPrice(row({ itemId: "item-2", bucketId: "ipm-2" }), 1, 107.25);
    const built = buildSavePayload([untouched, edited], "co", "br", "BRANCH", false);
    expect(built.payload).toMatchObject({ companyId: "co", branchId: "br", scope: "BRANCH", confirmed: false });
    expect(built.payload.rows).toHaveLength(1);
    const [sent] = built.payload.rows;
    expect(sent.lineNo).toBe(2);
    expect(sent.itemId).toBe("item-2");
    expect(sent.uomId).toBe("iuc-1");
    expect(sent.bucketId).toBe("ipm-2");
    expect(sent.priceScope).toBe("BRANCH");
    expect(sent.mrp).toBe(120);
    expect(sent.salePrice).toBeNull();
    expect(sent.minPrice).toBe(80);
    expect(sent.roundOff).toBe(0.5);
    expect(sent.levels.map((level) => level.price)).toEqual([110, 107.25, 100, 95]);
    expect(sent.levels[1].level).toBe(2);
    expect(sent.levels[1].priceWot).toBeCloseTo(107.25 / 1.18, 10);
    expect(sent.levels[1].markupPerc).toBeCloseTo(((107.25 - 90) / 90) * 100, 10);
    expect(built.rowKeyByLine.get(2)).toBe(edited.key);
    expect(built.itemIds).toEqual(["item-2"]);
  });

  it("echoes the loaded scope unchanged — and leaves it out when there was none", () => {
    const fresh = setLevelPrice(row({ priceSource: "MASTER", priceScope: null, bucketId: null }), 0, 1);
    const [sent] = buildSavePayload([fresh], "co", "br", "CHAIN", true).payload.rows;
    expect("priceScope" in sent).toBe(false);
    expect(sent.bucketId).toBeNull();
  });

  it("sends a NEW row's bucket as typed", () => {
    const added: PriceGridRow = { ...row({ mrp: null, maxPrice: 0 }), state: "ADDED" };
    const priced = applyCellEdit(added, "mrpShown", 45);
    const [sent] = buildSavePayload([priced], "co", "br", "BRANCH", false).payload.rows;
    expect(sent.mrp).toBe(45);
  });

  it("names each saved item once", () => {
    const a = setLevelPrice(row(), 0, 111);
    const b = setLevelPrice(row({ uomId: "iuc-2" }), 0, 111);
    expect(buildSavePayload([a, b], "co", "br", "BRANCH", false).itemIds).toEqual(["item-1"]);
  });
});

describe("the below-cost question", () => {
  it("reads each problem's bucket, price and cost off the grid line it names", () => {
    const line = setLevelPrice(row({ mrp: 45, salePrice: 40 }), 1, 85);
    const lines = belowCostLines(
      result({
        needsConfirm: true,
        problems: [
          {
            lineNo: 3,
            itemId: "item-1",
            itemCode: "SALT",
            itemName: "Salt 1 Kg",
            uomId: "iuc-1",
            bucketId: "ipm-1",
            level: 2,
            verdict: "BELOW_COST",
            message: "Retail 85.00 is below the cost of 90.00.",
          },
        ],
      }),
      (lineNo) => (lineNo === 3 ? line : null),
      NAMES,
    );
    expect(lines).toEqual([
      { row: 3, item: "Salt 1 Kg", bucket: "MRP 45 · SP 40", level: "Retail", price: 85, cost: 90 },
    ]);
  });

  it("calls a row with no dimension the headline", () => {
    const headline = row({ mrp: null, salePrice: null });
    const [line] = belowCostLines(
      result({
        problems: [
          {
            lineNo: 1,
            itemId: "item-1",
            itemCode: null,
            itemName: "Salt",
            uomId: "iuc-1",
            bucketId: null,
            level: 1,
            verdict: "BELOW_COST",
            message: "",
          },
        ],
      }),
      () => headline,
      NAMES,
    );
    expect(line.bucket).toBe("headline");
  });

  it("says how many rows and which setting", () => {
    expect(belowCostSummary(1, "warning")).toBe(
      "1 row is priced below its cost. inventory.below_cost_price = warning.",
    );
    expect(belowCostSummary(3, "warning")).toBe(
      "3 rows are priced below their cost. inventory.below_cost_price = warning.",
    );
  });
});

describe("the saved toast", () => {
  it("counts the rows", () => {
    expect(savedMessage(result({ saved: 1 }), false)).toBe("1 row saved");
    expect(savedMessage(result({ saved: 4 }), false)).toBe("4 rows saved");
  });

  it("NAMES the rows priced with no stock on hand — never a plain Saved", () => {
    const message = savedMessage(
      result({
        saved: 2,
        noStock: [
          {
            bucketId: "a",
            itemId: "i",
            itemCode: null,
            itemName: "Salt 1 Kg",
            uomId: "u",
            unitName: null,
            mrp: 45,
            salePrice: null,
          },
        ],
      }),
      false,
    );
    expect(message).toBe(
      "2 rows saved · 1 has no stock on hand — the price applies when stock arrives:\nSalt 1 Kg (MRP 45.00)",
    );
  });

  it("says a below-cost price was confirmed, or allowed by the setting", () => {
    const problems = [
      {
        lineNo: 1,
        itemId: "i",
        itemCode: null,
        itemName: "x",
        uomId: "u",
        bucketId: null,
        level: 1,
        verdict: "BELOW_COST",
        message: "",
      },
    ];
    expect(savedMessage(result({ saved: 1, problems }), true)).toBe(
      "1 row saved\n1 price(s) saved below cost, as confirmed.",
    );
    expect(savedMessage(result({ saved: 1, problems }), false)).toBe(
      "1 row saved\n1 price(s) are below cost (allowed by the setting).",
    );
  });
});

describe("server refusals", () => {
  const refusal = {
    status: 422,
    message: "These prices cannot be saved",
    data: {
      success: false,
      message: "These prices cannot be saved",
      errors: [
        { field: "rows.3", message: "Line 3: Retail 130.00 is above the MRP of 120.00." },
        { field: "rows.12", message: "Line 12: below min." },
        { field: "scope", message: "nope" },
      ],
    },
  };

  it("names the lines a 422 refused", () => {
    expect(refusedLineNumbers(refusal)).toEqual([3, 12]);
    expect(refusedLineNumbers({ status: 500 })).toEqual([]);
  });

  it("reads the summary AND the per-field reasons", () => {
    expect(describeApiError(refusal)).toBe(
      "These prices cannot be saved\n" +
        "• rows.3 — Line 3: Retail 130.00 is above the MRP of 120.00.\n" +
        "• rows.12 — Line 12: below min.\n" +
        "• scope — nope",
    );
  });

  it("reads a Nest validation body (message is an object with a list)", () => {
    expect(
      describeApiError({
        status: 400,
        data: { message: { error: "Bad Request", message: ["property x should not exist", "y"] } },
      }),
    ).toBe("property x should not exist\ny");
  });

  it("falls back to the base query's message, then to words", () => {
    expect(describeApiError({ message: "Network down" })).toBe("Network down");
    expect(describeApiError(null)).toBe("An unexpected error occurred.");
  });

  it("recognises a filter key the server does not know yet", () => {
    expect(
      refusedFilterKey({
        status: 400,
        data: { message: ["property trackPresetId should not exist"] },
      }),
    ).toBe("trackPresetId");
    expect(refusedFilterKey({ status: 422, data: { message: "taxId" } })).toBeNull();
    expect(filterNotAvailableMessage("taxId")).toContain('does not filter by "taxId" yet');
  });
});

describe("the validation strip", () => {
  const loaded = row({ mrp: 120, maxPrice: 120, costRate: 90, minPrice: 80 });

  it("is empty while nothing is changed", () => {
    const strip = validateRows([loaded], NAMES, "warning", new Set());
    expect(strip.text).toBe("");
    expect(strip.blocked).toBe(false);
  });

  it("lists every red reason, and red keeps Save off", () => {
    const above = setLevelPrice(loaded, 0, 125);
    const below = setLevelPrice(loaded, 1, 79);
    const strip = validateRows([above, below], NAMES, "warning", new Set());
    expect(strip.red).toEqual([
      "Row 1 · Wholesale 125.00 is above the row's MRP 120.00.",
      "Row 2 · Retail 79.00 is below the row's minimum 80.00.",
    ]);
    expect(strip.text).toBe(strip.red.join("   "));
    expect(strip.tone).toBe("red");
    expect(strip.blocked).toBe(true);
  });

  it("is one amber line for below-cost levels, and Save still goes", () => {
    const one = setLevelPrice(setLevelPrice(loaded, 0, 85), 2, 86);
    const two = setLevelPrice(loaded, 2, 84);
    const strip = validateRows([one, loaded, two], NAMES, "warning", new Set());
    expect(strip.text).toBe(
      "Rows 1, 3 · Wholesale / Dealer below cost — amber, Save asks (below_cost_price = warning).",
    );
    expect(strip.tone).toBe("amber");
    expect(strip.blocked).toBe(false);
  });

  it("is red below cost when the setting restricts", () => {
    const strip = validateRows([setLevelPrice(loaded, 0, 85)], NAMES, "restrict", new Set());
    expect(strip.red).toEqual([
      "Row 1 · Wholesale 85.00 is below cost 90.00 (below_cost_price = restrict).",
    ]);
  });

  it("wants a NEW row's MRP or sale price", () => {
    const added: PriceGridRow = { ...row({ mrp: null, maxPrice: 0, minPrice: 0 }), state: "ADDED" };
    expect(validateRows([added], NAMES, "warning", new Set()).red).toEqual([
      "Row 1 · a NEW row needs its MRP or sale price — that is the bucket it prices.",
    ]);
  });

  it("keeps the rows the server refused red until they are edited", () => {
    const strip = validateRows([loaded, loaded], NAMES, "warning", new Set([1]));
    expect(strip.red).toEqual(["Row 2 · refused by the server — see the message."]);
    expect(strip.blocked).toBe(true);
  });

  it("does not repeat a row the strip already names", () => {
    const above = setLevelPrice(loaded, 0, 125);
    const strip = validateRows([above], NAMES, "warning", new Set([0]));
    expect(strip.red).toHaveLength(1);
  });
});
