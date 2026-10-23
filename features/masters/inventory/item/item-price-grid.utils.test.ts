import { describe, expect, it } from "vitest";
import {
  ITEM_PRICE_SUBMISSION_FIELD_NAMES,
  ITEM_PRICE_SYNC_FIELD_NAMES,
} from "./item-master-page.constants";
import {
  buildLinkedRecordBandCells,
  type LinkedRecordRow,
} from "./item-linked-records-editor.shared";
import {
  ITEM_PRICE_STORED_FIELDS,
  applyItemPriceProfitPercentInput,
  applyItemPriceRoundOffChange,
  applyItemPriceWotInput,
  buildItemPriceLevelBands,
  buildItemPriceProfitSummary,
  buildItemPriceRowStoredFields,
  buildItemPriceTierColumns,
  describeScheduledItemPrice,
  detachItemPriceRowsFromStored,
  parseItemPriceDefaultLevel,
  refreshItemPriceRowProfit,
  resolveItemPriceChangeMark,
  resolveItemPriceLevels,
  resolveItemPriceLockReason,
  settleItemPriceProfitPercent,
} from "./item-price-grid.utils";

const GST_18 = { gstPerc: 18, cessPerc: 0, cessQty: 0 };
const NO_TAX = { gstPerc: 0, cessPerc: 0, cessQty: 0 };

function row(values: Partial<LinkedRecordRow>): LinkedRecordRow {
  return {
    ipm_id: "",
    ipm_unit_id: "u-pcs",
    ipm_company_id: "c1",
    ipm_branch_id: "b1",
    ipm_cost_wot: "",
    ipm_cost_price: "",
    ipm_round_off: "0.01",
    ipm_max_price: "",
    ipm_sales_price_a: "",
    ipm_sales_price_b: "",
    ipm_sales_price_c: "",
    ipm_sales_price_d: "",
    ipm_price_a_wot: "",
    ipm_price_b_wot: "",
    ipm_price_c_wot: "",
    ipm_price_d_wot: "",
    ipm_price_a_markup_perc: "",
    ipm_price_b_markup_perc: "",
    ipm_price_c_markup_perc: "",
    ipm_price_d_markup_perc: "",
    ...values,
  } as LinkedRecordRow;
}

const LEVEL_RECORDS = [
  { priceLvlId: 1, priceLvlName: "Whole Sale", priceLvlShort: "WS", priceLvlIsActive: true },
  { priceLvlId: 2, priceLvlName: "Retail", priceLvlShort: "RET", priceLvlIsActive: true },
  { priceLvlId: 3, priceLvlName: "Card", priceLvlShort: "CRD", priceLvlIsActive: false },
  { priceLvlId: 4, priceLvlName: "Hotel", priceLvlShort: "HOT", priceLvlIsActive: true },
];

describe("profit % on cost, without tax (test_item_profit)", () => {
  const costed = row({ ipm_cost_wot: "100", ipm_cost_price: "118" });

  it("a typed % sets the price that earns it; the typed cell stays as typed", () => {
    const typed = applyItemPriceProfitPercentInput(
      { ...costed, ipm_price_a_markup_perc: "50" },
      GST_18,
      "ipm_price_a_markup_perc",
    );
    expect(typed.ipm_sales_price_a).toBe("177");
    expect(typed.ipm_price_a_wot).toBe("150");
    expect(typed.ipm_price_a_markup_perc).toBe("50");
  });

  it("a typed price sets its wot and %", () => {
    const priced = refreshItemPriceRowProfit({ ...costed, ipm_sales_price_b: "200" }, GST_18, {
      splitPrices: true,
    });
    expect(priced.ipm_price_b_wot).toBe("169.492");
    expect(priced.ipm_price_b_markup_perc).toBe("69.49");
  });

  it("round off 1: 33 % → 156.94 → 157, and the cell settles on 33.05 % when left", () => {
    const typed = applyItemPriceProfitPercentInput(
      { ...costed, ipm_round_off: "1.00", ipm_price_c_markup_perc: "33" },
      GST_18,
      "ipm_price_c_markup_perc",
    );
    expect(typed.ipm_sales_price_c).toBe("157");
    // Still what was typed while the cell is being edited…
    expect(typed.ipm_price_c_markup_perc).toBe("33");
    // …re-worked from the rounded price once it is left.
    const settled = settleItemPriceProfitPercent(typed, "ipm_price_c_markup_perc");
    expect(settled.ipm_price_c_markup_perc).toBe("33.05");
    // Settling again is a no-op (same object), and re-running the edit with
    // the settled % does not nudge the price.
    expect(settleItemPriceProfitPercent(settled, "ipm_price_c_markup_perc")).toBe(settled);
    const rerun = applyItemPriceProfitPercentInput(settled, GST_18, "ipm_price_c_markup_perc");
    expect(rerun.ipm_sales_price_c).toBe("157");
  });

  it("a cost change keeps the prices; only the % follows", () => {
    const priced = refreshItemPriceRowProfit(
      { ...costed, ipm_sales_price_a: "177", ipm_sales_price_b: "200" },
      GST_18,
      { splitPrices: true },
    );
    const recosted = refreshItemPriceRowProfit(
      { ...priced, ipm_cost_wot: "120", ipm_cost_price: "141.6" },
      GST_18,
      { splitPrices: true },
    );
    expect(recosted.ipm_sales_price_a).toBe("177");
    expect(recosted.ipm_sales_price_b).toBe("200");
    expect(recosted.ipm_price_a_markup_perc).toBe("25");
  });

  it("a price below cost reads as a negative %; a negative % types a price below cost", () => {
    const below = refreshItemPriceRowProfit(
      row({ ipm_cost_wot: "120", ipm_sales_price_d: "118" }),
      GST_18,
      { splitPrices: true },
    );
    expect(Number(below.ipm_price_d_markup_perc)).toBeLessThan(0);
    const typed = applyItemPriceProfitPercentInput(
      { ...costed, ipm_price_a_markup_perc: "-10" },
      GST_18,
      "ipm_price_a_markup_perc",
    );
    expect(typed.ipm_sales_price_a).toBe("106.2");
  });

  it("no cost: a typed % prices nothing and settles blank", () => {
    const typed = applyItemPriceProfitPercentInput(
      row({ ipm_price_a_markup_perc: "20" }),
      GST_18,
      "ipm_price_a_markup_perc",
    );
    expect(typed.ipm_sales_price_a).toBe("");
    expect(settleItemPriceProfitPercent(typed, "ipm_price_a_markup_perc").ipm_price_a_markup_perc).toBe("");
  });

  it("opening a stored row never re-prices it: the % comes from the STORED wot", () => {
    const stored = row({
      ipm_cost_wot: "100",
      ipm_sales_price_a: "105",
      ipm_price_a_wot: "105",
      // Old data: a price with no stored wot says nothing true.
      ipm_sales_price_b: "130",
      ipm_price_b_wot: "0",
      ipm_price_a_markup_perc: "99",
    });
    const opened = refreshItemPriceRowProfit(stored, GST_18, { splitPrices: false });
    expect(opened.ipm_sales_price_a).toBe("105");
    expect(opened.ipm_price_a_wot).toBe("105");
    expect(opened.ipm_price_a_markup_perc).toBe("5");
    expect(opened.ipm_price_b_markup_perc).toBe("");
  });

  it("a typed wot sets the price (plus tax, unrounded) and stands", () => {
    const typed = applyItemPriceWotInput(
      { ...costed, ipm_price_a_wot: "150.5" },
      GST_18,
      "ipm_price_a_wot",
    );
    expect(typed.ipm_sales_price_a).toBe("177.59");
    expect(typed.ipm_price_a_wot).toBe("150.5");
    expect(typed.ipm_price_a_markup_perc).toBe("50.5");
  });

  it("a Round Off change re-rounds the prices — not a sale-price bucket's own price", () => {
    const stored = row({
      ipm_id: "p1",
      ipm_cost_wot: "100",
      ipm_round_off: "1.00",
      ipm_sales_price_a: "176.4",
      ipm_sales_price_b: "199.6",
      [ITEM_PRICE_STORED_FIELDS.bucketSp]: "176.4",
    });
    const rounded = applyItemPriceRoundOffChange(stored, GST_18);
    expect(rounded.ipm_sales_price_a).toBe("176.4");
    expect(rounded.ipm_sales_price_b).toBe("200");
    expect(rounded.ipm_price_b_markup_perc).toBe("69.49");
  });
});

describe("bucket lock (test_item_bucket_lock)", () => {
  const mrpRow = row({ ipm_id: "p1", [ITEM_PRICE_STORED_FIELDS.bucketMrp]: "300" });
  const spRow = row({ ipm_id: "p2", [ITEM_PRICE_STORED_FIELDS.bucketSp]: "99" });

  it("an MRP-bucket row keeps its MRP, says why, and leaves the rest editable", () => {
    expect(resolveItemPriceLockReason(mrpRow, "ipm_max_price", 1)).toContain("MRP 300.00");
    expect(resolveItemPriceLockReason(mrpRow, "ipm_sales_price_a", 1)).toBe("");
    expect(resolveItemPriceLockReason(mrpRow, "ipm_min_price", 1)).toBe("");
  });

  it("a sale-price-bucket row keeps the default level's price, wot and %", () => {
    for (const field of ["ipm_sales_price_a", "ipm_price_a_wot", "ipm_price_a_markup_perc"]) {
      expect(resolveItemPriceLockReason(spRow, field, 1)).toContain("sold at 99.00");
    }
    expect(resolveItemPriceLockReason(spRow, "ipm_sales_price_b", 1)).toBe("");
    expect(resolveItemPriceLockReason(spRow, "ipm_max_price", 1)).toBe("");
    expect(resolveItemPriceLockReason(spRow, "ipm_sales_price_b", 2)).not.toBe("");
    expect(resolveItemPriceLockReason(spRow, "ipm_sales_price_a", 2)).toBe("");
  });

  it("a headline row, and a copied (detached) row, lock nothing", () => {
    expect(resolveItemPriceLockReason(row({ ipm_id: "p3" }), "ipm_max_price", 1)).toBe("");
    const [copied] = detachItemPriceRowsFromStored([mrpRow]);
    expect(copied.ipm_id).toBe("");
    expect(resolveItemPriceLockReason(copied, "ipm_max_price", 1)).toBe("");
  });

  it("reads the default level from sales.default_price_level (1 when unset or out of range)", () => {
    const setting = (value: string | null) =>
      [{ asdKey: "sales.default_price_level", value, asdDefaultValue: "1" }] as never;
    expect(parseItemPriceDefaultLevel(undefined)).toBe(1);
    expect(parseItemPriceDefaultLevel(setting("3"))).toBe(3);
    expect(parseItemPriceDefaultLevel(setting("7"))).toBe(1);
    expect(parseItemPriceDefaultLevel(setting(null))).toBe(1);
  });
});

describe("price levels and bands (test_item_price_bands)", () => {
  const levels = resolveItemPriceLevels(LEVEL_RECORDS);

  it("an inactive (or deleted) level is not shown; missing activity reads as on", () => {
    expect(levels.known).toBe(true);
    expect(levels.levels.map((level) => level.active)).toEqual([true, true, false, true]);
    const keys = buildItemPriceTierColumns(levels).map((column) => column.key);
    expect(keys).not.toContain("ipm_sales_price_c");
    expect(keys.slice(0, 3)).toEqual([
      "ipm_price_a_markup_perc",
      "ipm_price_a_wot",
      "ipm_sales_price_a",
    ]);
    expect(resolveItemPriceLevels([{ priceLvlId: 2 }]).levels[1]?.active).toBe(true);
    // Known levels: a tier the company has no record of is not shown either.
    expect(resolveItemPriceLevels([{ priceLvlId: 2 }]).levels[0]?.active).toBe(false);
    expect(
      resolveItemPriceLevels([{ priceLvlId: 2, priceLvlIsDeleted: true }]).levels[1]?.active,
    ).toBe(false);
  });

  it("one band per active level over its Profit % | Wot | Price; headings stay short", () => {
    const bands = buildItemPriceLevelBands(levels);
    expect(bands.map((band) => band.text)).toEqual(["WHOLE SALE  (WS)", "RETAIL  (RET)", "HOTEL  (HOT)"]);
    expect(bands[0]?.columnKeys).toEqual([
      "ipm_price_a_markup_perc",
      "ipm_price_a_wot",
      "ipm_sales_price_a",
    ]);
    expect(bands[0]?.fg).toBe("#1d4ed8");
    expect(buildItemPriceTierColumns(levels)[0]?.label).toBe("Profit %");
  });

  it("one active level: no band; levels unknown: every level, labelled by letter", () => {
    const one = resolveItemPriceLevels([
      { priceLvlId: 1, priceLvlName: "Retail", priceLvlIsActive: true },
      { priceLvlId: 2, priceLvlIsActive: false },
    ]);
    expect(buildItemPriceLevelBands(one)).toEqual([]);
    const unknown = resolveItemPriceLevels([]);
    expect(unknown.known).toBe(false);
    expect(buildItemPriceLevelBands(unknown)).toEqual([]);
    const columns = buildItemPriceTierColumns(unknown);
    expect(columns).toHaveLength(12);
    expect(columns[0]?.label).toBe("A Profit %");
    expect(columns[2]?.label).toBe("Sale A");
  });
});

describe("the band row over the header", () => {
  const bands = buildItemPriceLevelBands(resolveItemPriceLevels(LEVEL_RECORDS));

  it("spans each level's visible run; other columns get blank gaps", () => {
    const cells = buildLinkedRecordBandCells(
      [
        "ipm_unit_id",
        "ipm_cost_wot",
        "ipm_price_a_markup_perc",
        "ipm_price_a_wot",
        "ipm_sales_price_a",
        // Level B's Wot hidden by the operator: its band spans what is left.
        "ipm_price_b_markup_perc",
        "ipm_sales_price_b",
        "ipm_max_price",
      ],
      bands,
    );
    expect(cells?.map((cell) => [cell.band?.text ?? "", cell.span])).toEqual([
      ["", 2],
      ["WHOLE SALE  (WS)", 3],
      ["RETAIL  (RET)", 2],
      ["", 1],
    ]);
  });

  it("no row at all when no visible column is under a band", () => {
    expect(buildLinkedRecordBandCells(["ipm_unit_id", "ipm_cost_wot"], bands)).toBeNull();
  });
});

describe("the line under the grid", () => {
  const levels = resolveItemPriceLevels(LEVEL_RECORDS);

  it("says what each price earns, red with a minus for a loss", () => {
    const priced = refreshItemPriceRowProfit(
      row({ ipm_cost_wot: "120", ipm_sales_price_a: "177", ipm_sales_price_d: "118" }),
      GST_18,
      { splitPrices: true },
    );
    const summary = buildItemPriceProfitSummary(priced, { unitName: "PCS", levels });
    expect(summary.kind).toBe("parts");
    if (summary.kind !== "parts") return;
    expect(summary.heading).toBe("Profit per PCS (no tax):");
    expect(summary.parts.map((part) => `${part.label} ${part.amount}`)).toEqual([
      "WS ₹30.00 (25.0%)",
      "HOT -₹20.00 (-16.7%)",
    ]);
    expect(summary.parts[1]?.loss).toBe(true);
    expect(summary.tooltip).toContain("HOT: price ₹118.00, profit -₹20.00 (-16.7%)");
  });

  it("hints until there is a unit, a cost and a price", () => {
    expect(buildItemPriceProfitSummary(null, { unitName: "PCS", levels }).kind).toBe("hint");
    expect(
      buildItemPriceProfitSummary(row({ ipm_cost_wot: "10" }), { unitName: "PCS", levels }),
    ).toEqual({ kind: "hint", text: "No price yet." });
  });

  it("↑ / ↓ against what was loaded (BILL ITEM, no tax)", () => {
    const source = {
      ipm_id: "p1",
      ipm_cost_wot: 100,
      ipm_sales_price_a: 105,
      ipm_price_a_wot: 105,
    };
    const loaded = refreshItemPriceRowProfit(
      { ...row({ ipm_id: "p1", ipm_cost_wot: "100", ipm_sales_price_a: "105", ipm_price_a_wot: "105" }), ...buildItemPriceRowStoredFields(source, []) },
      NO_TAX,
      { splitPrices: false },
    );
    const opened = buildItemPriceProfitSummary(loaded, { unitName: "BOX", levels });
    expect(opened.kind === "parts" && opened.parts[0]).toMatchObject({
      amount: "₹5.00 (5.0%)",
      arrow: null,
    });
    expect(resolveItemPriceChangeMark(loaded, "ipm_sales_price_a")).toBeNull();

    const repriced = refreshItemPriceRowProfit({ ...loaded, ipm_sales_price_a: "110" }, NO_TAX, {
      splitPrices: true,
    });
    const up = buildItemPriceProfitSummary(repriced, { unitName: "BOX", levels });
    expect(up.kind === "parts" && up.parts[0]).toMatchObject({ amount: "₹10.00 (10.0%)", arrow: "up" });
    expect(up.kind === "parts" && up.tooltip).toContain("was ₹5.00");
    expect(resolveItemPriceChangeMark(repriced, "ipm_sales_price_a")?.direction).toBe("up");

    const recosted = refreshItemPriceRowProfit({ ...repriced, ipm_cost_wot: "112" }, NO_TAX, {
      splitPrices: true,
    });
    const down = buildItemPriceProfitSummary(recosted, { unitName: "BOX", levels });
    expect(down.kind === "parts" && down.parts[0]).toMatchObject({
      amount: "-₹2.00 (-1.8%)",
      loss: true,
      arrow: "down",
    });
    expect(resolveItemPriceChangeMark(recosted, "ipm_price_a_markup_perc")?.direction).toBe("down");
  });
});

describe("scheduled prices (notes 140 C)", () => {
  const levels = resolveItemPriceLevels(LEVEL_RECORDS);
  const today = {
    ipm_id: "p1",
    ipm_company_id: "c1",
    ipm_branch_id: "b1",
    ipm_unit_id: "u-pcs",
    ipm_bucket_mrp: null,
    ipm_bucket_sp: null,
    ipm_sales_price_a: 117,
    ipm_sales_price_b: 130,
  };
  const scheduled = [
    { ...today, ipm_id: "s2", ipm_effective_from: "2026-10-30", ipm_sales_price_a: 125, ipm_sales_price_b: 130 },
    { ...today, ipm_id: "s1", ipm_effective_from: "2026-10-23", ipm_sales_price_a: 120, ipm_sales_price_b: 130 },
    // Another unit's / another bucket's schedule is not this row's.
    { ...today, ipm_id: "s3", ipm_unit_id: "u-box", ipm_effective_from: "2026-10-22", ipm_sales_price_a: 1 },
    { ...today, ipm_id: "s4", ipm_bucket_mrp: 300, ipm_effective_from: "2026-10-22", ipm_sales_price_a: 2 },
  ];

  it("shows the row's NEXT scheduled change, the levels it changes only", () => {
    const loaded = {
      ...row({ ipm_id: "p1", ipm_sales_price_a: "117", ipm_sales_price_b: "130" }),
      ...buildItemPriceRowStoredFields(today, scheduled),
    };
    expect(describeScheduledItemPrice(loaded, levels)).toBe("From 23-10: WS ₹120.00");
  });

  it("says nothing once the row's key moved, or for a row that is not stored", () => {
    const loaded = {
      ...row({ ipm_id: "p1", ipm_sales_price_a: "117" }),
      ...buildItemPriceRowStoredFields(today, scheduled),
    };
    expect(describeScheduledItemPrice({ ...loaded, ipm_unit_id: "u-box" }, levels)).toBe("");
    const [detached] = detachItemPriceRowsFromStored([loaded]);
    expect(describeScheduledItemPrice(detached, levels)).toBe("");
  });

  it("the stored-row extras never reach the editable, synced or submitted fields", () => {
    const fields = new Set<string>([
      ...ITEM_PRICE_SYNC_FIELD_NAMES,
      ...ITEM_PRICE_SUBMISSION_FIELD_NAMES,
    ]);
    for (const stored of Object.values(ITEM_PRICE_STORED_FIELDS)) {
      expect(fields.has(stored)).toBe(false);
    }
  });
});
