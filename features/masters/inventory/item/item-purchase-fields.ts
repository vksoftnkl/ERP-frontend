/**
 * MST-03 — the item card's purchase fields (Qt NexERP 4c09536 `ItemEntry`,
 * server `save-item.dto.ts`): the unit a purchase line opens in, the minimum
 * shelf life left at receipt, the input-tax-credit class and the normal
 * (transit) shortage %.
 *
 * Pure: the item page renders the fields, this decides what they hold and send.
 */

export const ITEM_PURCHASE_FIELD_NAMES = [
  "item_purchase_uom_id",
  "item_min_shelf_life_pct",
  "item_itc_class",
  "item_shortage_pct",
] as const;

export type ItemPurchaseFieldName = (typeof ITEM_PURCHASE_FIELD_NAMES)[number];

export const ITEM_PURCHASE_INITIAL_VALUES: Record<ItemPurchaseFieldName, string> = {
  item_purchase_uom_id: "",
  item_min_shelf_life_pct: "",
  item_itc_class: "",
  item_shortage_pct: "",
};

/** Qt `cboItcClass`: blank = eligible (the server's default), stored as null. */
export const ITEM_ITC_CLASS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Eligible (default)" },
  { value: "INELIGIBLE", label: "Ineligible" },
  { value: "BLOCKED_17_5", label: "Blocked — sec 17(5)" },
];

export const ITEM_PERCENT_MAX = 100;

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** A stored percent as the form shows it: "" for none / 0 (Qt's "default"), else the number. */
function percentText(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

/** The four values out of an `/items/get` item (snake_case). */
export function itemPurchaseValuesFromSource(source: Record<string, unknown>): Record<ItemPurchaseFieldName, string> {
  const itc = text(source.item_itc_class).toUpperCase();
  return {
    item_purchase_uom_id: text(source.item_purchase_uom_id),
    item_min_shelf_life_pct: percentText(source.item_min_shelf_life_pct),
    // ELIGIBLE is the default — shown (and saved back) as the blank choice.
    item_itc_class: ITEM_ITC_CLASS_OPTIONS.some((option) => option.value === itc) ? itc : "",
    item_shortage_pct: percentText(source.item_shortage_pct),
  };
}

/** Empty when the text is a valid 0–100 percent (blank = default). */
export function validateItemPercent(raw: string | undefined, label: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > ITEM_PERCENT_MAX) {
    return `${label} is a percent between 0 and ${ITEM_PERCENT_MAX}.`;
  }
  return null;
}

function percentOrNull(raw: string | undefined): number | null {
  const n = Number((raw ?? "").trim());
  // Qt: 0 % = "default" (the company setting) → null.
  return (raw ?? "").trim() && Number.isFinite(n) && n > 0 ? Math.min(n, ITEM_PERCENT_MAX) : null;
}

export type PurchaseUnitChoice = { value: string; label: string };

/**
 * Qt `refreshPurchaseUnitChoices`: the purchase unit is one of the item's
 * SAVED unit rows — a row added in this sitting has no conversion id yet.
 */
export function purchaseUnitChoices(
  unitRows: ReadonlyArray<Record<string, unknown>>,
  unitLabel: (unitId: string) => string,
): PurchaseUnitChoice[] {
  const seen = new Set<string>();
  const out: PurchaseUnitChoice[] = [];
  for (const row of unitRows) {
    const iucId = text(row.iuc_id);
    if (!iucId || seen.has(iucId)) continue;
    seen.add(iucId);
    const unitId = text(row.iuc_unit_id);
    out.push({ value: iucId, label: (unitId && unitLabel(unitId)) || unitId || iucId });
  }
  return out;
}

/**
 * The four keys of the save body. Every key is sent — the server writes a key
 * that is present (null clears it). A purchase unit whose row is gone from the
 * unit grid goes back to the default.
 */
export function itemPurchasePayload(
  values: Record<string, string | undefined>,
  savedUnitIds: ReadonlySet<string>,
): Record<ItemPurchaseFieldName, string | number | null> {
  const uom = (values.item_purchase_uom_id ?? "").trim();
  const itc = (values.item_itc_class ?? "").trim().toUpperCase();
  return {
    item_purchase_uom_id: uom && savedUnitIds.has(uom) ? uom : null,
    item_min_shelf_life_pct: percentOrNull(values.item_min_shelf_life_pct),
    item_itc_class: itc && itc !== "ELIGIBLE" ? itc : null,
    item_shortage_pct: percentOrNull(values.item_shortage_pct),
  };
}
