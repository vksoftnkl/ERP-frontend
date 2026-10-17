import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";

/**
 * Bringing back an unsaved Item popup (`modalDraftKey`, lib/form-drafts).
 *
 * Everything the popup holds is a form value — the four row grids included,
 * as serialized JSON — so the draft restores the whole entry by itself, and
 * the save payload is built from those values alone. What a draft cannot bring
 * back is the page's state beside the form: each LAZY dropdown holds only the
 * option it was seeded with until it is opened, so a value the draft put back
 * would show as a bare id, and "Save as Default Template" would store it with
 * no name. These rules decide what each one is seeded with instead.
 */

/** The lazy dropdowns of the form, by the field each one backs. */
export const ITEM_LAZY_DROPDOWN_FIELDS = [
  "item_company_id",
  "item_group_id",
  "item_category_id",
  "item_brand_id",
  "item_section_id",
  "item_cust_group",
  "item_supplier_id",
  "item_default_tax_id",
] as const;

export type ItemLazyDropdownField = (typeof ITEM_LAZY_DROPDOWN_FIELDS)[number];

/** One dropdown's selection with its display name; blank id = cleared. */
export type ItemDropdownSeed = { id: string; label: string };

export type ItemDropdownSeeds = Record<ItemLazyDropdownField, ItemDropdownSeed>;

const BLANK_SEED: ItemDropdownSeed = { id: "", label: "" };

/** Seeds for every lazy dropdown, read field by field (missing = cleared). */
export function buildItemDropdownSeeds(
  readSeed: (fieldName: ItemLazyDropdownField) => Partial<ItemDropdownSeed> | undefined,
): ItemDropdownSeeds {
  const seeds = {} as ItemDropdownSeeds;
  for (const fieldName of ITEM_LAZY_DROPDOWN_FIELDS) {
    const seed = readSeed(fieldName);
    seeds[fieldName] = {
      id: (seed?.id ?? "").trim(),
      label: (seed?.label ?? "").trim(),
    };
  }
  return seeds;
}

export type ResolveItemDraftDropdownSeedsArgs = {
  /** The whole form as the draft (or its Discard) left it. */
  values: Record<string, string>;
  /** Option names the draft saved, by field then by value. */
  labels: Record<string, Record<string, string>>;
  /** What each dropdown held when the popup opened — the template or the record. */
  openingSeeds: Partial<ItemDropdownSeeds>;
  /** The options each dropdown last showed (any name it ever loaded still holds). */
  optionsByField: Partial<Record<ItemLazyDropdownField, readonly ERPDynamicSelectOption[]>>;
  /** A last source of names, for a list the page already has (the tax rates). */
  fallbackLabel?: (fieldName: ItemLazyDropdownField, value: string) => string;
};

/**
 * The seed each lazy dropdown needs to show the restored value by name. The
 * name comes from, in order: the opening seed when the value is still the one
 * the popup opened on (Discard lands here for every field), the options the
 * dropdown last loaded, the name the draft saved, the page's own list, and
 * finally the id itself — a value is never dropped for want of a name.
 */
export function resolveItemDraftDropdownSeeds({
  values,
  labels,
  openingSeeds,
  optionsByField,
  fallbackLabel,
}: ResolveItemDraftDropdownSeedsArgs): ItemDropdownSeeds {
  return buildItemDropdownSeeds((fieldName) => {
    const id = (values[fieldName] ?? "").trim();
    if (!id) {
      return BLANK_SEED;
    }
    const named = (label: string | undefined) => {
      const trimmed = (label ?? "").trim();
      return trimmed && trimmed !== id ? trimmed : "";
    };
    const opening = openingSeeds[fieldName];
    const label =
      (opening?.id === id ? named(opening.label) : "") ||
      named(optionsByField[fieldName]?.find((option) => option.value === id)?.label) ||
      named(labels[fieldName]?.[id]) ||
      named(fallbackLabel?.(fieldName, id)) ||
      id;
    return { id, label };
  });
}
