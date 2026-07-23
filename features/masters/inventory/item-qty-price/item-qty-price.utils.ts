import type { ItemQtyPricePayload, SaveItemQtyPriceDto } from "@/store/api/itemQtyPriceApi";
import type { ItemQtyPriceRow } from "./item-qty-price.types";

let localIdCounter = 0;

export function createLocalId(): string {
  localIdCounter += 1;
  return `new-${localIdCounter}`;
}

export function createBlankRow(): ItemQtyPriceRow {
  return {
    localId: createLocalId(),
    iqpId: null,
    itemId: "",
    itemLabel: "",
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

export function validateRow(row: ItemQtyPriceRow): string | null {
  if (!row.itemId) return "Item is required.";
  if (!row.itemUnitId) return "Unit is required.";
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

export function buildSavePayload(row: ItemQtyPriceRow): SaveItemQtyPriceDto {
  return {
    ...(row.iqpId ? { iqp_id: row.iqpId } : {}),
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
