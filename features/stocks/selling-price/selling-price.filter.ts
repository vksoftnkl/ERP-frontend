/**
 * The F8 filter — which items Load brings — and the query the grid route is
 * asked with (Qt `SellingPriceFilterDialog::State` and
 * `ApiEndpoints::SellingPriceBulk::grid`).
 *
 * Every field is optional; Active items only is on by default. The display
 * text of each picked dropdown travels with its id so reopening the dialog,
 * and the strip on the screen, show what is in force.
 */
import type { FilterFieldKey } from "./selling-price.constants";
import type { SellingPriceGridQuery } from "./selling-price.types";

export type SellingPriceFilters = {
  search: string;
  groupId: string;
  categoryId: string;
  brandId: string;
  sectionId: string;
  supplierId: string;
  trackPresetId: string;
  taxId: string;
  /** One item's rows (the Add item path) — never set by the dialog. */
  itemId: string;
  activeOnly: boolean;
};

export type FilterState = {
  filters: SellingPriceFilters;
  /** Field key → the dropdown's display text. */
  texts: Partial<Record<FilterFieldKey, string>>;
};

export function emptyFilters(): SellingPriceFilters {
  return {
    search: "",
    groupId: "",
    categoryId: "",
    brandId: "",
    sectionId: "",
    supplierId: "",
    trackPresetId: "",
    taxId: "",
    itemId: "",
    activeOnly: true,
  };
}

export function emptyFilterState(): FilterState {
  return { filters: emptyFilters(), texts: {} };
}

/** The id a dialog field writes. */
export const FILTER_ID_FIELD: Record<FilterFieldKey, keyof SellingPriceFilters> = {
  group: "groupId",
  category: "categoryId",
  brand: "brandId",
  section: "sectionId",
  supplier: "supplierId",
  preset: "trackPresetId",
  tax: "taxId",
};

const SUMMARY_ORDER: ReadonlyArray<{ key: FilterFieldKey; caption: string }> = [
  { key: "group", caption: "Group" },
  { key: "category", caption: "Category" },
  { key: "brand", caption: "Brand" },
  { key: "section", caption: "Section" },
  { key: "supplier", caption: "Supplier" },
  { key: "preset", caption: "Tracked as" },
  { key: "tax", caption: "Tax" },
];

/** "Group: Snacks · Tax: GST 18% · Active only" — the strip on the screen. */
export function filterSummary(state: FilterState): string {
  const parts: string[] = [];
  const search = state.filters.search.trim();
  if (search) {
    parts.push(`Contains “${search}”`);
  }
  for (const { key, caption } of SUMMARY_ORDER) {
    const text = state.texts[key];
    if (text) {
      parts.push(`${caption}: ${text}`);
    }
  }
  parts.push(state.filters.activeOnly ? "Active items only" : "Active + inactive items");
  return parts.join("  ·  ");
}

export function isFilterEmpty(state: FilterState): boolean {
  const f = state.filters;
  return (
    !f.search.trim() &&
    !f.groupId &&
    !f.brandId &&
    !f.sectionId &&
    !f.supplierId &&
    !f.categoryId &&
    !f.trackPresetId &&
    !f.taxId &&
    f.activeOnly
  );
}

/**
 * The grid route's query. Only what is set is sent — `forbidNonWhitelisted`
 * 400s an unknown key, so a filter the server does not know stays off the
 * wire unless it is in force — and `activeOnly` only as "false" (the server's
 * default is true).
 */
export function gridQuery(
  companyId: string,
  branchId: string,
  filters: SellingPriceFilters,
  limit: number,
  offset: number,
): SellingPriceGridQuery {
  const query: SellingPriceGridQuery = { companyId, branchId, limit, offset };
  if (filters.groupId) query.itemGroupId = filters.groupId;
  if (filters.brandId) query.itemBrandId = filters.brandId;
  if (filters.sectionId) query.itemSectionId = filters.sectionId;
  if (filters.supplierId) query.supplierId = filters.supplierId;
  if (filters.itemId) query.itemId = filters.itemId;
  if (filters.search.trim()) query.search = filters.search.trim();
  if (filters.categoryId) query.itemCategoryId = filters.categoryId;
  if (filters.trackPresetId) query.trackPresetId = filters.trackPresetId;
  if (filters.taxId) query.taxId = filters.taxId;
  if (!filters.activeOnly) query.activeOnly = "false";
  return query;
}

export type FilterPick = { id: string; text: string };

/**
 * What Apply & Load hands back: the typed search (trimmed), active-only, and
 * each picked dropdown's id with its display text.
 */
export function filterStateFrom(
  search: string,
  activeOnly: boolean,
  picks: Partial<Record<FilterFieldKey, FilterPick>>,
): FilterState {
  const filters: SellingPriceFilters = { ...emptyFilters(), search: search.trim(), activeOnly };
  const texts: FilterState["texts"] = {};
  for (const key of Object.keys(FILTER_ID_FIELD) as FilterFieldKey[]) {
    const pick = picks[key];
    if (!pick?.id) {
      continue;
    }
    texts[key] = pick.text;
    switch (FILTER_ID_FIELD[key]) {
      case "groupId":
        filters.groupId = pick.id;
        break;
      case "categoryId":
        filters.categoryId = pick.id;
        break;
      case "brandId":
        filters.brandId = pick.id;
        break;
      case "sectionId":
        filters.sectionId = pick.id;
        break;
      case "supplierId":
        filters.supplierId = pick.id;
        break;
      case "trackPresetId":
        filters.trackPresetId = pick.id;
        break;
      case "taxId":
        filters.taxId = pick.id;
        break;
      default:
        break;
    }
  }
  return { filters, texts };
}

/** The dialog's picks for the filter in force — reopening shows what is set. */
export function picksOf(state: FilterState): Partial<Record<FilterFieldKey, FilterPick>> {
  const picks: Partial<Record<FilterFieldKey, FilterPick>> = {};
  for (const key of Object.keys(FILTER_ID_FIELD) as FilterFieldKey[]) {
    const id = String(state.filters[FILTER_ID_FIELD[key]] ?? "");
    if (id) {
      picks[key] = { id, text: state.texts[key] ?? "" };
    }
  }
  return picks;
}

/** The filters the Add-item path loads one item's rows with — the item alone. */
export function itemOnlyFilters(itemId: string): SellingPriceFilters {
  return { ...emptyFilters(), itemId };
}
