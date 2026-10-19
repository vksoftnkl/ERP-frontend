/**
 * The New tags grid's column layout and the small pure rules every part of the
 * screen shares — the port of Qt NexERP's `textile_tag_entity.h` (3b5069d).
 *
 * One grid row is one purchase line: one design of one generic item. Reserve
 * turns it into ONE tag — or, for an item group that labels every piece (G16),
 * qty tags of one piece each; the server decides which.
 *
 * ui_table 53 "TEXTILE TAGS - NEW TAG LINES" names these slots (registered
 * 2026-10-17). 0–14 are shown, 15–16 are offered by the column chooser, 17 on
 * are the ids and state the reserve sends or the answer fills.
 */

/** `ui_tbl_clm_no` of each slot — what the layout joins on. */
export const TAG_COL = {
  LineNo: 0,
  ItemName: 1,
  BrandName: 2,
  SizeName: 3,
  ColourName: 4,
  FabricName: 5,
  Model: 6,
  SupplierArticle: 7,
  Cost: 8,
  Mrp: 9,
  PriceSrc: 10,
  Price: 11,
  Qty: 12,
  Labels: 13,
  Barcode: 14,
  SeasonName: 15,
  AttrNote: 16,
  ItemId: 17,
  BrandId: 18,
  SizeId: 19,
  ColourId: 20,
  FabricId: 21,
  SeasonId: 22,
  UomId: 23,
  Signature: 24,
  TagIds: 25,
  LotIds: 26,
  Rule: 27,
  State: 28,
} as const;

export const TAG_COLUMN_COUNT = 29;

export type TagColumnNumber = (typeof TAG_COL)[keyof typeof TAG_COL];

/**
 * The line's fields, one per slot. Every cell keeps its RAW text, as the Qt
 * grid's cells do: money and qty are painted to two / three places, the cell
 * itself keeps the figure the operator typed or the server answered.
 */
export type TagLine = {
  key: string;
  itemName: string;
  brandName: string;
  sizeName: string;
  colourName: string;
  fabricName: string;
  model: string;
  supplierArticle: string;
  cost: string;
  mrp: string;
  /** "" · "auto" (a markup rule priced it) · "typed" (the operator's). */
  priceSrc: PriceSource;
  price: string;
  qty: string;
  labels: string;
  /** Filled by reserve: "T1004127" or "T1004127…131". */
  barcode: string;
  seasonName: string;
  attrNote: string;
  itemId: string;
  brandId: string;
  sizeId: string;
  colourId: string;
  fabricId: string;
  seasonId: string;
  /** The iuc_id the item lookup answered on. */
  uomId: string;
  /** stp_track_signature — a tag item is "B" (batch only). */
  signature: string;
  tagIds: string;
  lotIds: string;
  /** The markup rule that priced the line, for the tooltip. */
  rule: string;
  state: LineState;
};

export type PriceSource = "" | "auto" | "typed";
export type LineState = "" | "RESERVED";

export type TagLineField = Exclude<keyof TagLine, "key">;

/** Slot number → the field that slot shows. */
export const TAG_COLUMN_FIELDS: Readonly<Record<TagColumnNumber, TagLineField | "lineNo">> = {
  [TAG_COL.LineNo]: "lineNo",
  [TAG_COL.ItemName]: "itemName",
  [TAG_COL.BrandName]: "brandName",
  [TAG_COL.SizeName]: "sizeName",
  [TAG_COL.ColourName]: "colourName",
  [TAG_COL.FabricName]: "fabricName",
  [TAG_COL.Model]: "model",
  [TAG_COL.SupplierArticle]: "supplierArticle",
  [TAG_COL.Cost]: "cost",
  [TAG_COL.Mrp]: "mrp",
  [TAG_COL.PriceSrc]: "priceSrc",
  [TAG_COL.Price]: "price",
  [TAG_COL.Qty]: "qty",
  [TAG_COL.Labels]: "labels",
  [TAG_COL.Barcode]: "barcode",
  [TAG_COL.SeasonName]: "seasonName",
  [TAG_COL.AttrNote]: "attrNote",
  [TAG_COL.ItemId]: "itemId",
  [TAG_COL.BrandId]: "brandId",
  [TAG_COL.SizeId]: "sizeId",
  [TAG_COL.ColourId]: "colourId",
  [TAG_COL.FabricId]: "fabricId",
  [TAG_COL.SeasonId]: "seasonId",
  [TAG_COL.UomId]: "uomId",
  [TAG_COL.Signature]: "signature",
  [TAG_COL.TagIds]: "tagIds",
  [TAG_COL.LotIds]: "lotIds",
  [TAG_COL.Rule]: "rule",
  [TAG_COL.State]: "state",
};

export type TagAlign = "left" | "center" | "right";

/** `TextileTagNewCols::alignment()`. */
export function tagColumnAlign(column: number): TagAlign {
  switch (column) {
    case TAG_COL.LineNo:
    case TAG_COL.PriceSrc:
    case TAG_COL.Labels:
      return "center";
    case TAG_COL.Cost:
    case TAG_COL.Mrp:
    case TAG_COL.Price:
    case TAG_COL.Qty:
      return "right";
    default:
      return "left";
  }
}

export function isMoneyColumn(column: number): boolean {
  return column === TAG_COL.Cost || column === TAG_COL.Mrp || column === TAG_COL.Price;
}

// ---------------------------------------------------------------------------
// List columns
// ---------------------------------------------------------------------------

export type ListKind = "size" | "colour" | "fabric" | "season";

export const LIST_KINDS: readonly ListKind[] = ["size", "colour", "fabric", "season"];

export type ListNameField = "sizeName" | "colourName" | "fabricName" | "seasonName";
export type ListIdField = "sizeId" | "colourId" | "fabricId" | "seasonId";

/** The name field and the id field of each list kind. */
export const LIST_FIELDS: Readonly<Record<ListKind, { name: ListNameField; id: ListIdField }>> = {
  size: { name: "sizeName", id: "sizeId" },
  colour: { name: "colourName", id: "colourId" },
  fabric: { name: "fabricName", id: "fabricId" },
  season: { name: "seasonName", id: "seasonId" },
};

/** Fields whose text names a list row. Typing a name clears the id; reserve resolves it. */
export function listKindOfField(field: TagLineField | string): ListKind | null {
  switch (field) {
    case "sizeName":
      return "size";
    case "colourName":
      return "colour";
    case "fabricName":
      return "fabric";
    case "seasonName":
      return "season";
    default:
      return null;
  }
}

/** `TextileTagNewCols::listKind()` — the lists route's kind for a list column, "" otherwise. */
export function listKindOfColumn(column: number): ListKind | "" {
  switch (column) {
    case TAG_COL.SizeName:
      return "size";
    case TAG_COL.ColourName:
      return "colour";
    case TAG_COL.FabricName:
      return "fabric";
    case TAG_COL.SeasonName:
      return "season";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** A cell's raw text as a number; blank, commas and junk read as 0. */
export function num(text: string | null | undefined): number {
  const value = Number.parseFloat(String(text ?? "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Labels a line prints before the server has answered: one per whole piece,
 * one for a cut length (a metre line is a single roll label). The reserve
 * answer replaces it with the tags' own labelQty.
 */
export function labelsFor(qty: number): number {
  if (!(qty > 0)) {
    return 0;
  }
  return Math.floor(qty) === qty ? qty : 1;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A figure for a cell, as the Qt screen writes an answered number back: up to
 * six places with the trailing zeros (and a bare point) trimmed — "1999.5",
 * "2199", never "2199.000000".
 */
export function rawNum(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

/** A JSON number — or a numeric string, as pg NUMERIC arrives — as cell text; "" for null. */
export function rawOf(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numeric) ? rawNum(numeric) : "";
}

// ---------------------------------------------------------------------------
// Barcodes
// ---------------------------------------------------------------------------

/**
 * "T1004127…131" for a run of barcodes: the first in full, then the last's
 * digits from where it differs. One barcode is itself.
 */
export function barcodeRun(codes: readonly string[]): string {
  if (codes.length === 0) {
    return "";
  }
  if (codes.length === 1) {
    return codes[0];
  }
  const a = codes[0];
  const b = codes[codes.length - 1];
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) {
    same += 1;
  }
  // Keep at least three trailing digits so "…131" reads as a number.
  same = Math.min(same, Math.max(0, b.length - 3));
  return `${a}…${b.slice(same)}`;
}

/** A run "T1004127…131" previews its first label. */
export function firstBarcodeOf(run: string): string {
  return run.split("…")[0] ?? "";
}

// ---------------------------------------------------------------------------
// Size sets (plan §1.3 seed)
// ---------------------------------------------------------------------------

export const SIZE_SETS = ["ALPHA", "WAIST", "KIDS", "FREE"] as const;
export type SizeSet = (typeof SIZE_SETS)[number];

export function sizeSets(): readonly string[] {
  return SIZE_SETS;
}

/**
 * The size list on the box is the truth once it is registered; this is the
 * order the size grid offers until then, and the order it falls back to for a
 * set the list does not yet know.
 */
export function seedSizes(set: string): string[] {
  switch (set.toUpperCase()) {
    case "ALPHA":
      return ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
    case "WAIST": {
      const out: string[] = [];
      for (let w = 26; w <= 44; w += 2) {
        out.push(String(w));
      }
      return out;
    }
    case "KIDS":
      return [
        "0-1Y", "1-2Y", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "6-7Y", "7-8Y",
        "8-9Y", "9-10Y", "10-11Y", "11-12Y", "12-13Y", "13-14Y",
      ];
    case "FREE":
      return ["FREE"];
    default:
      return [];
  }
}

/**
 * The set a typed size belongs to in the seed ("L" → ALPHA, "32" → WAIST),
 * FREE when no set has it — what a quick-add files a new size under.
 */
export function sizeSetOf(size: string): string {
  const wanted = size.trim().toUpperCase();
  for (const set of SIZE_SETS) {
    if (seedSizes(set).some((candidate) => candidate.toUpperCase() === wanted)) {
      return set;
    }
  }
  return "FREE";
}

/** The round rule of a markup rule, in words. */
export function roundRuleText(rule: string): string {
  switch (rule) {
    case "END_9":
      return "end in 9";
    case "END_99":
      return "end in 99";
    case "NEAREST_10":
      return "nearest 10";
    case "NEAREST_50":
      return "nearest 50";
    default:
      return "no rounding";
  }
}
