/**
 * The `/units/create` body out of the unit form's values.
 *
 * Weight, conversion, loading, unloading and attach charge are CLEARABLE: a
 * cleared box goes as `null`, which the server stores as cleared. Leaving the
 * key out keeps the old value — the bug Qt's unit entry fixed in 4ae6575
 * (`blankAs(QJsonValue())`). A unit that is not a pack unit has no base unit
 * and no conversion, whatever the hidden boxes still hold: Qt clears both when
 * Pack Unit is unticked.
 */

export type UnitSavePayloadArgs = {
  values: Record<string, string | undefined>;
  shouldUpdate: boolean;
  editingItemId: string | number | null;
};

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** A clearable number box: blank is `null` (cleared), a number goes as one. */
export function toClearableNumber(value: string | undefined): string | number | null {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return normalized;
}

function toUpdateUnitId(editingItemId: string | number | null): string | number {
  if (typeof editingItemId === "number" && Number.isFinite(editingItemId)) {
    return editingItemId;
  }
  if (typeof editingItemId === "string") {
    return editingItemId.trim();
  }
  return 0;
}

export function buildUnitSavePayload({ values, shouldUpdate, editingItemId }: UnitSavePayloadArgs) {
  const unitName = (values.unitName ?? "").trim();
  const unitAlias = (values.unitAlias ?? "").trim();
  const unitCode = (values.unitCode ?? "").trim();
  const unitDescription = (values.unitDescription ?? "").trim();
  const unitDecimalCount = toInteger(values.unitDecimalCount ?? "0", 0);
  const unitIsPackUnit = (values.unitIsPackUnit ?? "false") === "true";
  const rawBaseUnitId = (values.unitBaseUnitId ?? "").trim();
  const unitBaseUnitId = unitIsPackUnit && rawBaseUnitId ? rawBaseUnitId : null;
  const unitIsActive = (values.unitIsActive ?? "true") !== "false";
  return {
    unit_id: shouldUpdate ? toUpdateUnitId(editingItemId) : "",
    unit_name: unitName,
    unit_alias: unitAlias || null,
    unit_code: unitCode || null,
    unit_description: unitDescription || null,
    unit_decimal_count: unitDecimalCount,
    unit_weight: toClearableNumber(values.unitWeight),
    unit_loading: toClearableNumber(values.unitLoading),
    unit_unloading: toClearableNumber(values.unitUnloading),
    unit_attach_charge: toClearableNumber(values.unitAttachCharge),
    unit_is_pack_unit: unitIsPackUnit,
    unit_base_unit_id: unitBaseUnitId,
    unit_conversion: unitIsPackUnit ? toClearableNumber(values.unitConversion) : null,
    unit_is_active: unitIsActive,
  };
}
