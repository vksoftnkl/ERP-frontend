/**
 * The grid row rules — Qt `fillRow`, `isChanged`, `isNewRow`, `verdict`,
 * `whyNotEditable`, `onGridCellEdited`, `applyFourEdit`, `winningRows`,
 * `addNewBucketRow` and `refreshItemsAfterSave`.
 */
import { describe, expect, it } from "vitest";
import {
  acceptsTyping,
  applyCellEdit,
  applyFourEdit,
  branchCellText,
  bucketKey,
  changedCount,
  editorText,
  gridCounts,
  hereName,
  insertNewBucketRow,
  isChanged,
  isNewRow,
  isSameFigure,
  newBucketTemplateIndex,
  parseAcceptable,
  refreshItemRows,
  rowFromServer,
  setLevelPrice,
  srcOfRow,
  srcText,
  tracksOf,
  verdictOf,
  whyNotEditable,
  winningRows,
  type PriceGridRow,
} from "./selling-price.state";
import type { SellingPriceRow } from "./selling-price.types";

function serverRow(overrides: Partial<SellingPriceRow> = {}, prices = [110, 105, 100, 95]): SellingPriceRow {
  return {
    lineNo: 1,
    itemId: "item-1",
    itemCode: "SALT",
    barcode: "8901",
    itemName: "Salt 1 Kg",
    uomId: "iuc-1",
    unitName: "PCS",
    stockQty: 12,
    mrp: 120,
    salePrice: null,
    maxPrice: 120,
    priceSource: "BUCKET",
    priceScope: "BRANCH",
    bucketId: "ipm-1",
    costRate: 90,
    costWot: 76.27,
    costBasis: "MRP",
    minPrice: 0,
    roundOff: 0,
    taxPerc: 18,
    inclTax: true,
    hasCess: false,
    levels: prices.map((price, index) => ({
      level: index + 1,
      price,
      priceWot: 0,
      markupPerc: 0,
      marginPerc: 0,
    })),
    ...overrides,
  };
}

function row(overrides: Partial<SellingPriceRow> = {}, prices?: number[]): PriceGridRow {
  return rowFromServer(serverRow(overrides, prices));
}

describe("rowFromServer (fillRow)", () => {
  it("takes the levels by their level number, and the baseline with them", () => {
    const filled = rowFromServer(
      serverRow({
        levels: [
          { level: 3, price: 100, priceWot: 0, markupPerc: 0, marginPerc: 0 },
          { level: 1, price: 110.004, priceWot: 0, markupPerc: 0, marginPerc: 0 },
        ],
      }),
    );
    expect(filled.prices).toEqual([110, 0, 100, 0]);
    // The baseline keeps the server's figure (six places), the price is at two.
    expect(filled.base).toEqual([110.004, 0, 100, 0]);
    expect(isChanged(filled)).toBe(false);
  });

  it("derives the markup and the base rate from the price", () => {
    const filled = row({ costRate: 100, taxPerc: 18 }, [118, 0, 0, 0]);
    expect(filled.markups[0]).toBeCloseTo(18, 6);
    expect(filled.rates[0]).toBe(100);
  });

  it("shows the answering row's max price as the MRP, else the bucket's own", () => {
    expect(row({ maxPrice: 120, mrp: 45 }).mrp).toBe(120);
    expect(row({ maxPrice: 0, mrp: 45 }).mrp).toBe(45);
    expect(row({ maxPrice: 0, mrp: null }).mrp).toBeNull();
  });

  it("keeps the bucket dimensions apart from the shown MRP", () => {
    const headline = row({ maxPrice: 130, mrp: null, salePrice: null, priceSource: "MASTER" });
    expect(headline.mrp).toBe(130);
    expect(headline.bucketMrp).toBeNull();
    expect(headline.bucketSp).toBeNull();
  });

  it("derives cost before tax — the server's only for a cess item", () => {
    expect(row({ costRate: 118, taxPerc: 18, costWot: 99 }).costWot).toBe(100);
    expect(row({ costRate: 118, taxPerc: 18, costWot: 99, hasCess: true }).costWot).toBe(99);
  });

  it("keeps the key and the track signature of the row it refills", () => {
    const previous = { key: "k-1", trackSig: "BM" };
    const filled = rowFromServer(serverRow(), previous);
    expect(filled.key).toBe("k-1");
    expect(filled.trackSig).toBe("BM");
    expect(filled.state).toBe("");
  });
});

describe("row state", () => {
  it("is changed once a price moves half a paisa or more", () => {
    const loaded = row();
    expect(isChanged(setLevelPrice(loaded, 0, 110.004))).toBe(false);
    expect(isChanged(setLevelPrice(loaded, 0, 110.01))).toBe(true);
  });

  it("is changed when Min moves", () => {
    expect(isChanged(applyCellEdit(row(), "minPrice", 50))).toBe(true);
  });

  it("an ADDED row is always changed and always NEW", () => {
    const added = { ...row(), state: "ADDED" as const };
    expect(isChanged(added)).toBe(true);
    expect(isNewRow(added)).toBe(true);
  });

  it("a stock bucket the headline answers is NEW — Save inserts it", () => {
    expect(isNewRow(row({ priceSource: "MASTER", mrp: 45, priceScope: null }))).toBe(true);
    expect(isNewRow(row({ priceSource: "MASTER", mrp: null, salePrice: null }))).toBe(false);
    expect(isNewRow(row({ priceSource: "BUCKET" }))).toBe(false);
  });

  it("counts the changed rows", () => {
    expect(changedCount([row(), setLevelPrice(row(), 1, 1)])).toBe(1);
  });

  it("counts items and rows", () => {
    expect(gridCounts([row(), row({ uomId: "iuc-2" }), row({ itemId: "item-2" })])).toEqual({
      items: 2,
      rows: 3,
    });
  });
});

describe("the Src chip and the Branch cell", () => {
  it("names the row", () => {
    expect(srcText("BUCKET", "BRANCH", false)).toBe("BUCKET·BR");
    expect(srcText("BUCKET", "CHAIN", false)).toBe("BUCKET·CH");
    expect(srcText("MASTER", "CHAIN", false)).toBe("MASTER");
    expect(srcText("BUCKET", "CHAIN", true)).toBe("NEW");
    expect(srcOfRow(row({ priceSource: "MASTER", mrp: 40, priceScope: null }))).toBe("NEW");
  });

  it("a priced row says whose it is; a NEW one says where the switch puts it", () => {
    expect(branchCellText(row({ priceScope: "CHAIN" }), "BRANCH", "HO")).toBe("All branches");
    expect(branchCellText(row({ priceScope: "BRANCH" }), "CHAIN", "HO")).toBe("HO");
    const fresh = row({ priceSource: "MASTER", mrp: 40, priceScope: null });
    expect(branchCellText(fresh, "CHAIN", "HO")).toBe("All branches");
    expect(branchCellText(fresh, "BRANCH", "HO")).toBe("HO");
    expect(branchCellText(row({ priceScope: null, priceSource: "BUCKET" }), "CHAIN", "HO")).toBe(
      "All branches",
    );
  });

  it("uses the branch's short name, then its name, then the words", () => {
    expect(hereName("HO", "Head Office")).toBe("HO");
    expect(hereName("", "Head Office")).toBe("Head Office");
    expect(hereName(" ", "")).toBe("This branch");
  });
});

describe("verdicts", () => {
  const base = row({ mrp: 120, maxPrice: 120, costRate: 90, minPrice: 80 });

  it("judges only changed rows", () => {
    const untouched = row({ mrp: 100, maxPrice: 100 }, [150, 0, 0, 0]);
    expect(verdictOf(untouched, "priceA", "warning")).toBe("ok");
  });

  it("is red above the MRP and below Min", () => {
    expect(verdictOf(setLevelPrice(base, 0, 121), "priceA", "warning")).toBe("red");
    expect(verdictOf(setLevelPrice(base, 0, 79), "priceA", "warning")).toBe("red");
    expect(verdictOf(setLevelPrice(base, 0, 120), "priceA", "warning")).toBe("ok");
  });

  it("is amber below cost — red only when the setting restricts", () => {
    const below = setLevelPrice(base, 0, 85);
    expect(verdictOf(below, "priceA", "warning")).toBe("amber");
    expect(verdictOf(below, "priceA", "allow")).toBe("amber");
    expect(verdictOf(below, "priceA", "restrict")).toBe("red");
  });

  it("paints Min red when any level is under it", () => {
    const edited = applyCellEdit(base, "minPrice", 101);
    expect(verdictOf(edited, "minPrice", "warning")).toBe("red");
    expect(verdictOf(applyCellEdit(base, "minPrice", 90), "minPrice", "warning")).toBe("ok");
  });

  it("judges nothing but the prices and Min", () => {
    expect(verdictOf(setLevelPrice(base, 0, 500), "mkupA", "warning")).toBe("ok");
  });
});

describe("whyNotEditable", () => {
  const loaded = row();

  it("opens the price, base rate, markup and Min cells of a costed row", () => {
    for (const column of ["priceA", "rateB", "mkupC", "minPrice"] as const) {
      expect(whyNotEditable(loaded, column, false)).toBe("");
    }
  });

  it("refuses a markup when there is no cost", () => {
    expect(whyNotEditable(row({ costRate: 0 }), "mkupA", false)).toBe(
      "This row has no cost, so a markup has nothing to work from — type the price.",
    );
  });

  it("refuses the MRP and sale price of a loaded row: they are its identity", () => {
    expect(whyNotEditable(loaded, "mrpShown", false)).toContain("The MRP is this row's identity");
    expect(whyNotEditable(loaded, "salePx", false)).toContain(
      "The sale price is this row's identity",
    );
  });

  it("opens a NEW row's MRP / sale price only as far as its policy tracks them", () => {
    const added = { ...loaded, state: "ADDED" as const, trackSig: "BM" };
    expect(whyNotEditable(added, "mrpShown", false)).toBe("");
    expect(whyNotEditable(added, "salePx", false)).toBe(
      "This item's tracking policy (BM) does not track sale price, so it is not part of its price row.",
    );
  });

  it("sends the barcode to the blank line, and everything else on it to the item", () => {
    expect(whyNotEditable(loaded, "barcodeText", false)).toBe(
      "A barcode adds an item: scan it on the blank last line.",
    );
    expect(whyNotEditable(null, "barcodeText", false)).toBe("");
    expect(whyNotEditable(null, "priceA", false)).toBe(
      "Pick the item first — scan its barcode, type in the Item cell, or load with F8.",
    );
  });

  it("shuts everything while saving, and the read-outs always", () => {
    expect(whyNotEditable(loaded, "priceA", true)).toBe("Saving…");
    expect(whyNotEditable(loaded, "costRate", false)).toBe("Shown, not edited here.");
  });
});

describe("cell edits (onGridCellEdited)", () => {
  const costed = row({ costRate: 100, taxPerc: 18, roundOff: 1 }, [118, 0, 0, 0]);

  it("a typed price is the price — no round-off — and the markup follows", () => {
    const edited = applyCellEdit(costed, "priceA", 117.63);
    expect(edited.prices[0]).toBe(117.63);
    expect(edited.markups[0]).toBeCloseTo(17.63, 6);
    expect(edited.rates[0]).toBe(99.69);
  });

  it("a base rate is taxed up and rounded off; the base rate re-shows that net", () => {
    const edited = applyCellEdit(costed, "rateA", 99.5);
    // 99.5 × 1.18 = 117.41 → nearest 1 → 117; its base is 117 ÷ 1.18 = 99.15.
    expect(edited.prices[0]).toBe(117);
    expect(edited.rates[0]).toBe(99.15);
  });

  it("a markup prices from the cost with the round-off; the markup shown is the true one", () => {
    const edited = applyCellEdit(costed, "mkupA", 12.4);
    expect(edited.prices[0]).toBe(112);
    expect(edited.markups[0]).toBeCloseTo(12, 6);
  });

  it("a NEW row's MRP sets the bucket too; 0 clears both", () => {
    const added = { ...costed, state: "ADDED" as const, mrp: null, bucketMrp: null };
    const priced = applyCellEdit(added, "mrpShown", 45);
    expect(priced.mrp).toBe(45);
    expect(priced.bucketMrp).toBe(45);
    const cleared = applyCellEdit(priced, "mrpShown", 0);
    expect(cleared.mrp).toBeNull();
    expect(cleared.bucketMrp).toBeNull();
    expect(applyCellEdit(added, "salePx", 40).bucketSp).toBe(40);
  });

  it("Min is just the minimum", () => {
    expect(applyCellEdit(costed, "minPrice", 50).min).toBe(50);
  });
});

describe("the violet card (applyFourEdit)", () => {
  const costed = row({ costRate: 94.4, taxPerc: 18, roundOff: 0 }, [0, 0, 0, 0]);

  it("price is the price", () => {
    const result = applyFourEdit(costed, 1, "price", 120);
    expect("row" in result && result.row.prices[1]).toBe(120);
  });

  it("price wot is taxed up", () => {
    const result = applyFourEdit(costed, 0, "wot", 100);
    expect("row" in result && result.row.prices[0]).toBe(118);
  });

  it("markup and margin price from the cost", () => {
    const fromMarkup = applyFourEdit(costed, 2, "markup", 25);
    expect("row" in fromMarkup && fromMarkup.row.prices[2]).toBe(118);
    const fromMargin = applyFourEdit(costed, 3, "margin", 20);
    expect("row" in fromMargin && fromMargin.row.prices[3]).toBe(118);
  });

  it("says why when there is no cost, or the margin has no price", () => {
    expect(applyFourEdit(row({ costRate: 0 }), 0, "markup", 10)).toEqual({
      hint: "This row has no cost, so markup and margin have nothing to work from — type the price or the price wot.",
    });
    expect(applyFourEdit(costed, 0, "margin", 100)).toEqual({
      hint: "A margin of 100% or more has no price.",
    });
  });

  it("still takes a price or wot when there is no cost", () => {
    const result = applyFourEdit(row({ costRate: 0 }), 0, "wot", 10);
    expect("row" in result).toBe(true);
  });
});

describe("cell input — the validators", () => {
  it("money: positive, two places", () => {
    expect(acceptsTyping("money", "12.34")).toBe(true);
    expect(acceptsTyping("money", "12.345")).toBe(false);
    expect(acceptsTyping("money", "-1")).toBe(false);
    expect(acceptsTyping("money", "1,250.5")).toBe(true);
    expect(acceptsTyping("money", "12a")).toBe(false);
  });

  it("markup: may be negative, three places", () => {
    expect(acceptsTyping("markup", "-12.345")).toBe(true);
    expect(acceptsTyping("markup", "-")).toBe(true);
    expect(acceptsTyping("markup", "1.2345")).toBe(false);
  });

  it("commits only an acceptable figure", () => {
    expect(parseAcceptable("money", "")).toBeNull();
    expect(parseAcceptable("money", ".")).toBeNull();
    expect(parseAcceptable("markup", "-")).toBeNull();
    expect(parseAcceptable("markup", "-150")).toBeNull();
    expect(parseAcceptable("markup", "-50")).toBe(-50);
    expect(parseAcceptable("money", "1000000000")).toBeNull();
    expect(parseAcceptable("money", " 99.5 ")).toBe(99.5);
  });

  it("an unchanged commit is not an edit", () => {
    expect(isSameFigure(12.3456, 12.3456)).toBe(true);
    expect(isSameFigure(12.3456, 12.3)).toBe(false);
    expect(isSameFigure(null, 0)).toBe(false);
  });

  it("opens a markup at one place and money at two", () => {
    const loaded = row({ costRate: 90 }, [110, 0, 0, 0]);
    expect(editorText(loaded, "mkupA")).toBe("22.2");
    expect(editorText(loaded, "priceA")).toBe("110.00");
    expect(editorText({ ...loaded, mrp: null }, "mrpShown")).toBe("");
  });
});

describe("winningRows", () => {
  it("keeps this branch's row over the chain's for one bucket", () => {
    const chain = serverRow({ priceScope: "CHAIN", bucketId: "c" });
    const branch = serverRow({ priceScope: "BRANCH", bucketId: "b" });
    const other = serverRow({ mrp: 140, bucketId: "o" });
    expect(winningRows([chain, other, branch]).map((o) => o.bucketId)).toEqual(["b", "o"]);
  });

  it("keeps the first of two chain rows", () => {
    const first = serverRow({ priceScope: "CHAIN", bucketId: "1" });
    const second = serverRow({ priceScope: "CHAIN", bucketId: "2" });
    expect(winningRows([first, second]).map((o) => o.bucketId)).toEqual(["1"]);
  });
});

describe("refreshItemRows (after a save)", () => {
  it("re-reads the saved item's rows by unit | MRP | sale price, keeping the loaded stock", () => {
    const saved = setLevelPrice(row({ stockQty: 7 }), 0, 115);
    const otherItem = setLevelPrice(row({ itemId: "item-2" }), 0, 99);
    const answer = serverRow({ stockQty: 0, bucketId: "ipm-9" }, [115, 105, 100, 95]);
    const [refreshed, untouched] = refreshItemRows([saved, otherItem], "item-1", [answer]);
    expect(refreshed.key).toBe(saved.key);
    expect(refreshed.bucketId).toBe("ipm-9");
    expect(refreshed.base[0]).toBe(115);
    expect(isChanged(refreshed)).toBe(false);
    expect(refreshed.stock).toBe(7);
    expect(untouched).toBe(otherItem);
  });

  it("turns a NEW row into the row that now prices its bucket", () => {
    const added: PriceGridRow = {
      ...row({ mrp: null, maxPrice: 0 }),
      state: "ADDED",
      mrp: 45,
      bucketMrp: 45,
      stock: 0,
    };
    const answer = serverRow({ mrp: 45, maxPrice: 45, priceScope: "CHAIN", bucketId: "new-ipm" });
    const [refreshed] = refreshItemRows([added], "item-1", [answer]);
    expect(refreshed.state).toBe("");
    expect(srcOfRow(refreshed)).toBe("BUCKET·CH");
    // The bucket list counts the stock the same way the grid does.
    expect(refreshed.stock).toBe(12);
  });

  it("leaves a row the answer does not price alone", () => {
    const loaded = row({ mrp: 77 });
    const [same] = refreshItemRows([loaded], "item-1", [serverRow({ mrp: 120 })]);
    expect(same).toBe(loaded);
  });

  it("keys a bucket the way the server writes its figures", () => {
    expect(bucketKey("u", 50, null)).toBe("u|50|");
    expect(bucketKey("u", null, 40.5)).toBe("u||40.5");
  });
});

describe("a NEW bucket row (addNewBucketRow)", () => {
  const bucket = row({ mrp: 120, uomId: "iuc-1" });
  const headline = row({ mrp: null, salePrice: null, maxPrice: 130, priceSource: "MASTER", uomId: "iuc-1" });
  const otherItem = row({ itemId: "item-2" });

  it("models it on the item's headline when there is one", () => {
    expect(newBucketTemplateIndex([bucket, headline, otherItem], "item-1")).toBe(1);
    expect(newBucketTemplateIndex([bucket, otherItem], "item-1")).toBe(0);
    expect(newBucketTemplateIndex([otherItem], "item-1")).toBe(-1);
  });

  it("reads the track signature", () => {
    expect(tracksOf("BME")).toEqual({ mrp: true, salePrice: false });
    expect(tracksOf("P")).toEqual({ mrp: false, salePrice: true });
    expect(tracksOf("")).toEqual({ mrp: false, salePrice: false });
  });

  it("puts it under the item's last row, NEW, with no bucket yet", () => {
    const result = insertNewBucketRow([bucket, headline, otherItem], "item-1", "iuc-1", "BM");
    expect(result).not.toBeNull();
    const { rows, index } = result!;
    expect(index).toBe(2);
    expect(rows.map((candidate) => candidate.itemId)).toEqual(["item-1", "item-1", "item-1", "item-2"]);
    const added = rows[index];
    expect(added.state).toBe("ADDED");
    expect(added.trackSig).toBe("BM");
    expect(added.priceSource).toBe("MASTER");
    expect(added.priceScope).toBe("");
    expect(added.bucketId).toBe("");
    expect(added.mrp).toBeNull();
    expect(added.bucketMrp).toBeNull();
    expect(added.stock).toBe(0);
    expect(added.prices).toEqual(headline.prices);
    expect(added.key).not.toBe(headline.key);
    expect(srcOfRow(added)).toBe("NEW");
  });

  it("finds nothing once the template has gone", () => {
    expect(insertNewBucketRow([otherItem], "item-1", "iuc-1", "M")).toBeNull();
  });
});
