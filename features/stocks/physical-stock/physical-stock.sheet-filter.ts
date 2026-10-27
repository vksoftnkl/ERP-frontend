/**
 * What Load Sheet (F9) draws from the godown — Qt `PhysicalSheetFilterDialog`
 * (091bf5b / fc00b9e, notes 157).
 *
 * Brand / category / section / negative-only are filtered by the SERVER: each
 * is sent only when chosen, so leaving one alone never narrows the sheet.
 * Negative-only is ALSO re-checked on the rows that come back — the server
 * answers it, the screen does not trust it.
 */
import type { CountSheetQuery, CountSheetRow } from "./physical-stock.types";

export type SheetFilter = {
  groupId: string;
  groupName: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  sectionId: string;
  sectionName: string;
  /** Empty = every bucket. */
  bucket: string;
  /** Holdings the book says are empty. */
  includeZero: boolean;
  /** Only the holdings the book has below zero. */
  negativeOnly: boolean;
};

export const EMPTY_SHEET_FILTER: SheetFilter = {
  groupId: "",
  groupName: "",
  brandId: "",
  brandName: "",
  categoryId: "",
  categoryName: "",
  sectionId: "",
  sectionName: "",
  bucket: "",
  includeZero: false,
  negativeOnly: false,
};

/** Qt `Filter::summary()` — the notice while loading and in the empty answer. */
export function sheetFilterSummary(filter: SheetFilter): string {
  const parts: string[] = [filter.groupId ? `group ${filter.groupName}` : "every group"];
  if (filter.brandId) parts.push(`brand ${filter.brandName}`);
  if (filter.categoryId) parts.push(`category ${filter.categoryName}`);
  if (filter.sectionId) parts.push(`section ${filter.sectionName}`);
  if (filter.negativeOnly) parts.push("negative stock only");
  parts.push(filter.bucket ? filter.bucket : "every bucket");
  if (filter.includeZero) parts.push("with empty holdings");
  return parts.join(" · ");
}

/**
 * The query's filter keys. includeZero is always sent (the server's own
 * default is true, so leaving it out could never say "no"); a negative holding
 * is never empty, so the two never combine.
 */
export function sheetFilterQuery(
  filter: SheetFilter,
): Pick<
  CountSheetQuery,
  "bucket" | "itemGroupId" | "itemBrandId" | "itemCategoryId" | "itemSectionId" | "negativeOnly" | "includeZero"
> {
  return {
    ...(filter.bucket ? { bucket: filter.bucket } : {}),
    ...(filter.groupId ? { itemGroupId: filter.groupId } : {}),
    ...(filter.brandId ? { itemBrandId: filter.brandId } : {}),
    ...(filter.categoryId ? { itemCategoryId: filter.categoryId } : {}),
    ...(filter.sectionId ? { itemSectionId: filter.sectionId } : {}),
    ...(filter.negativeOnly ? { negativeOnly: true } : {}),
    includeZero: filter.includeZero && !filter.negativeOnly,
  };
}

/** Negative only: the book below zero, re-checked on what came back. */
export function applyNegativeOnly(rows: readonly CountSheetRow[], filter: SheetFilter): CountSheetRow[] {
  return filter.negativeOnly ? rows.filter((row) => Number(row.bookQty) < 0) : [...rows];
}

/** Qt's empty-answer wording — which empty this is, because the fix differs. */
export function emptySheetMessage(filter: SheetFilter): string {
  const summary = sheetFilterSummary(filter);
  if (filter.negativeOnly) {
    return `Nothing in this godown is below zero for ${summary} — the book has no negative stock to settle.`;
  }
  if (filter.includeZero && !filter.groupId && !filter.brandId && !filter.categoryId && !filter.sectionId && !filter.bucket) {
    return (
      "This godown has no holdings at all — nothing has ever been received into it. Stock found on " +
      "the shelf with no holding behind it is an adjustment, not a count."
    );
  }
  return `No holding in this godown matches ${summary}. Tick "Include holdings with no stock" to bring the empty ones too.`;
}
