/**
 * Textile Tags — the wire shapes of the server's step B-1 routes (notes 136),
 * as the Qt screen sends and reads them. None of the `/textile-tags/*` routes
 * is on the box yet; these are the contract the screen was built against,
 * with the reserve and suggest-price answers faked in the tests.
 */

/** One line of POST /textile-tags/reserve — blank keys are never sent. */
export type ReserveLineDto = {
  lineNo: number;
  itemId: string;
  salePrice: number;
  qty: number;
  brandId?: string;
  sizeId?: string;
  colourId?: string;
  fabricId?: string;
  seasonId?: string;
  model?: string;
  supplierArticle?: string;
  attrNote?: string;
  mrp?: number;
  /** Print-only label cost (G2); stock is valued from the lot. */
  labelCost?: number;
};

export type ReserveBodyDto = {
  companyId: string;
  branchId: string;
  deviceId: string;
  lines: ReserveLineDto[];
  seasonId?: string;
  supplierId?: string;
};

/** One tag of the reserve answer's `data.tags[]`. */
export type ReservedTag = {
  lineNo: number;
  tagId: string;
  barcode: string;
  lotId: string;
  labelQty: number | string;
};

export type ReserveAnswer = {
  tags: ReservedTag[];
};

export type MarkupRule = {
  id: string;
  sets: string;
  pct: number | string;
  round: string;
};

/** GET /textile-tags/suggest-price → `data`: `{ rule | null, mrp?, salePrice? }`. */
export type SuggestPriceAnswer = {
  rule?: MarkupRule | null;
  mrp?: number | string | null;
  salePrice?: number | string | null;
};

/** POST /textile-tags/lists/<kind>/save. */
export type ListSaveBody = {
  companyId: string;
  name: string;
  /** Size only; FREE when the size belongs to no seed set. */
  sizeSet?: string;
};

/** What the item lookup (`/stock/opening/item-lookup`) answers that this screen reads. */
export type TagItemLookupAnswer = {
  trackSignature?: string | null;
  uomId?: string | null;
};

/** A failed write's `errors[]` entry: `{ field, message }`. */
export type ApiFieldError = { field?: string; message?: string };

/** A popup grid's row (grids 71 / 91), keyed by its SELECT's own column names. */
export type PickerRow = Record<string, unknown>;
