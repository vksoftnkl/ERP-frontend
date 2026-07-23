import type {
  ItemQtyPriceMode,
  ItemQtyPricePayload,
  SaveItemQtyPriceDto,
} from "@/store/api/itemQtyPriceApi";
import type { ItemQtyPriceRow } from "./item-qty-price.types";

let localIdCounter = 0;

export function createLocalId(): string {
  localIdCounter += 1;
  return `new-${localIdCounter}`;
}

// Every row belongs to the item the page is scoped to, so a blank row is
// seeded with it — the grid never mixes items.
export function createBlankRow(item?: { id: string; label: string } | null): ItemQtyPriceRow {
  return {
    localId: createLocalId(),
    iqpId: null,
    itemId: item?.id ?? "",
    itemLabel: item?.label ?? "",
    itemUnitId: "",
    unitLabel: "",
    companyId: "",
    branchId: "",
    partyId: "",
    priceLevel: "",
    fromQty: "0",
    toQty: "",
    priceMode: "P",
    discPct: "",
    flatOff: "",
    price: "",
    isTaxIncl: false,
    effectiveFrom: toDateInputValue(new Date().toISOString()),
    effectiveTo: "",
    isActive: true,
    isDirty: false,
    isNew: true,
  };
}

export function toDateInputValue(isoValue: string | null | undefined): string {
  if (!isoValue) return "";
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function mapPayloadToRow(payload: ItemQtyPricePayload): ItemQtyPriceRow {
  return {
    localId: payload.iqp_id,
    iqpId: payload.iqp_id,
    itemId: payload.iqp_item_id,
    itemLabel: payload.iqp_item_name ?? "",
    itemUnitId: payload.iqp_item_unit_id,
    unitLabel: payload.iqp_unit_name ?? "",
    companyId: payload.iqp_company_id ?? "",
    branchId: payload.iqp_branch_id ?? "",
    partyId: payload.iqp_party_id ?? "",
    priceLevel:
      payload.iqp_price_level === null || payload.iqp_price_level === undefined
        ? ""
        : String(payload.iqp_price_level),
    fromQty: String(payload.iqp_from_qty ?? 0),
    toQty: payload.iqp_to_qty === null || payload.iqp_to_qty === undefined ? "" : String(payload.iqp_to_qty),
    priceMode: payload.iqp_price_mode,
    discPct: payload.iqp_disc_pct === null || payload.iqp_disc_pct === undefined ? "" : String(payload.iqp_disc_pct),
    flatOff: payload.iqp_flat_off === null || payload.iqp_flat_off === undefined ? "" : String(payload.iqp_flat_off),
    price: payload.iqp_price === null || payload.iqp_price === undefined ? "" : String(payload.iqp_price),
    isTaxIncl: Boolean(payload.iqp_is_tax_incl),
    effectiveFrom: toDateInputValue(payload.iqp_effective_from),
    effectiveTo: toDateInputValue(payload.iqp_effective_to),
    isActive: Boolean(payload.iqp_is_active),
    isDirty: false,
    isNew: false,
  };
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// A row counts as "real" (and so must pass validation and take part in the
// duplicate check) once the operator has put anything of substance into it —
// a pristine trailing row that only carries the page's item is not one.
export function isFilledRow(row: ItemQtyPriceRow): boolean {
  return Boolean(
    row.iqpId ||
      row.itemUnitId ||
      row.companyId ||
      row.branchId ||
      row.partyId ||
      row.priceLevel ||
      row.toQty.trim() ||
      row.discPct.trim() ||
      row.flatOff.trim() ||
      row.price.trim(),
  );
}
// Two rows are the same pricing rule when their whole scope + band matches:
// company, branch, customer, price level, unit, from qty and to qty.
export function buildRowUniquenessKey(row: ItemQtyPriceRow): string {
  return [
    row.companyId,
    row.branchId,
    row.partyId,
    row.priceLevel,
    row.itemUnitId,
    String(toNumberOrNull(row.fromQty) ?? 0),
    row.toQty.trim() ? String(toNumberOrNull(row.toQty)) : "",
  ].join("|");
}
export function describeRowScope(row: ItemQtyPriceRow): string {
  const band = row.toQty.trim() ? `${row.fromQty}–${row.toQty}` : `${row.fromQty} & above`;
  return `${row.unitLabel || "unit"} · qty ${band}`;
}
export function validateRow(row: ItemQtyPriceRow): string | null {
  if (!row.itemId) return "Item is required.";
  if (!row.itemUnitId) return "Unit is required.";
  if (!row.fromQty.trim()) return "From Qty is required.";
  if (!row.effectiveFrom) return "Effective From date is required.";
  const fromQty = toNumberOrNull(row.fromQty) ?? 0;
  const toQty = toNumberOrNull(row.toQty);
  if (toQty !== null && toQty <= fromQty) {
    return "To Qty must be greater than From Qty.";
  }
  if (row.effectiveTo && row.effectiveTo < row.effectiveFrom) {
    return "Effective To must be on or after Effective From.";
  }
  if (row.priceMode === "P" && !row.discPct.trim()) {
    return "Discount % is required for the % Discount mode.";
  }
  if (row.priceMode === "R" && !row.flatOff.trim()) {
    return "Flat Off is required for the Flat Off mode.";
  }
  if (row.priceMode === "F" && !row.price.trim()) {
    return "Price is required for the Fixed Price mode.";
  }
  return null;
}

// Exactly one of Disc % / Disc Rs / Price drives a row's price. Switching
// Mode wipes the two it just locked, so a value the operator can no longer
// see or edit never rides along into the payload.
export function applyPriceModeChange(
  row: ItemQtyPriceRow,
  priceMode: ItemQtyPriceMode,
): Partial<ItemQtyPriceRow> {
  return {
    priceMode,
    discPct: priceMode === "P" ? row.discPct : "",
    flatOff: priceMode === "R" ? row.flatOff : "",
    price: priceMode === "F" ? row.price : "",
  };
}
// The list endpoint returns `data` as an array, but tolerate a single object
// too — one sampled response shape came back that way.
export function normalizeListPayload(data: unknown): ItemQtyPricePayload[] {
  if (Array.isArray(data)) return data as ItemQtyPricePayload[];
  if (data && typeof data === "object") return [data as ItemQtyPricePayload];
  return [];
}
// The server reads iqp_created_by only when inserting and iqp_modified_by only
// when updating, so stamp the logged-in user's name onto whichever applies for
// this row. Omitted entirely when no name is available — the server then falls
// back to the JWT user id.
export function buildSavePayload(
  row: ItemQtyPriceRow,
  actorName?: string | null,
): SaveItemQtyPriceDto {
  const actor = actorName?.trim() ? actorName.trim() : null;
  const actorFields: Partial<SaveItemQtyPriceDto> = actor
    ? row.iqpId
      ? { iqp_modified_by: actor }
      : { iqp_created_by: actor }
    : {};
  return {
    ...(row.iqpId ? { iqp_id: row.iqpId } : {}),
    ...actorFields,
    iqp_item_id: row.itemId,
    iqp_item_unit_id: row.itemUnitId,
    iqp_company_id: row.companyId || null,
    iqp_branch_id: row.branchId || null,
    iqp_party_id: row.partyId || null,
    iqp_price_level: toNumberOrNull(row.priceLevel),
    iqp_from_qty: toNumberOrNull(row.fromQty) ?? 0,
    iqp_to_qty: toNumberOrNull(row.toQty),
    iqp_price_mode: row.priceMode,
    iqp_disc_pct: toNumberOrNull(row.discPct),
    iqp_flat_off: toNumberOrNull(row.flatOff),
    iqp_price: toNumberOrNull(row.price),
    iqp_is_tax_incl: row.isTaxIncl,
    iqp_effective_from: row.effectiveFrom,
    iqp_effective_to: row.effectiveTo || null,
    iqp_is_active: row.isActive,
  };
}
