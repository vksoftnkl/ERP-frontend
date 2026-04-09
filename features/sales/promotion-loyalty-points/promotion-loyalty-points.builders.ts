import type {
  LoyaltyGiftPayload,
  LoyaltyPartyPayload,
  LoyaltyPointPayload,
  LoyaltySchemePayload,
  SaveLoyaltyGiftRequest,
  SaveLoyaltyPartyRequest,
  SaveLoyaltyPointRequest,
  SaveLoyaltySchemeRequest,
} from "./promotion-loyalty-points.types";
import type {
  EditableGiftRow,
  EditablePartyRow,
  EditablePointRow,
  GiftFormState,
  PartyScopeType,
  PointFormState,
  SchemeFormState,
} from "./promotion-loyalty-points.local-types";
import {
  APPLY_ON_OPTIONS,
  BILL_TYPE_OPTIONS,
  AMOUNT_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  EXPIRY_OPTIONS,
  ITEM_TYPE_OPTIONS,
  ROUNDING_OPTIONS,
  SCHEME_STATUS_OPTIONS,
  SCHEME_TYPE_OPTIONS,
} from "./promotion-loyalty-points.constant";
import {
  isPartyScopeType,
  toDateInputValue,
  toNullableString,
  toOptionalInteger,
  toOptionalNumber,
  toTimeInputValue,
} from "./promotion-loyalty-points.utils";

export function buildEmptySchemeForm(companyId: string, branchId: string): SchemeFormState {
  return {
    ls_id: "",
    ls_code: "",
    ls_name: "",
    ls_type: SCHEME_TYPE_OPTIONS[0].value,
    ls_status: SCHEME_STATUS_OPTIONS[0].value,
    ls_auto_apply: true,
    ls_apply_on: APPLY_ON_OPTIONS[0].value,
    ls_calc_on_amount_type: AMOUNT_TYPE_OPTIONS[0].value,
    ls_bill_type: BILL_TYPE_OPTIONS[0].value,
    ls_cust_type: CUSTOMER_TYPE_OPTIONS[0].value,
    ls_item_type: ITEM_TYPE_OPTIONS[0].value,
    ls_start_date: "",
    ls_end_date: "",
    ls_valid_from_time: "",
    ls_valid_to_time: "",
    ls_valid_weekdays: "",
    ls_comp_id: companyId,
    ls_branch_id: branchId,
    ls_include_tax_for_points: false,
    ls_rounding_method: ROUNDING_OPTIONS[0].value,
    ls_recur_apl: true,
    ls_bal_apl: true,
    ls_allow_point_redeem: false,
    ls_allow_gift_redeem: false,
    ls_redeem_value_per_point: "0",
    ls_min_redeem_points: "0",
    ls_max_redeem_points_per_bill: "0",
    ls_max_redeem_percent_per_bill: "0",
    ls_redeem_min_bill_amount: "0",
    ls_points_valid_days: "0",
    ls_expiry_basis: EXPIRY_OPTIONS.find((option) => option.value === "NONE")?.value ?? EXPIRY_OPTIONS[0].value,
    ls_remarks: "",
    ls_is_active: true,
  };
}

export function mapSchemeToForm(scheme: LoyaltySchemePayload): SchemeFormState {
  return {
    ls_id: scheme.ls_id,
    ls_code: scheme.ls_code ?? "",
    ls_name: scheme.ls_name,
    ls_type: scheme.ls_type,
    ls_status: scheme.ls_status,
    ls_auto_apply: scheme.ls_auto_apply,
    ls_apply_on: scheme.ls_apply_on,
    ls_calc_on_amount_type: scheme.ls_calc_on_amount_type,
    ls_bill_type: scheme.ls_bill_type,
    ls_cust_type: scheme.ls_cust_type,
    ls_item_type: scheme.ls_item_type,
    ls_start_date: toDateInputValue(scheme.ls_start_date),
    ls_end_date: toDateInputValue(scheme.ls_end_date),
    ls_valid_from_time: toTimeInputValue(scheme.ls_valid_from_time),
    ls_valid_to_time: toTimeInputValue(scheme.ls_valid_to_time),
    ls_valid_weekdays: scheme.ls_valid_weekdays ?? "",
    ls_comp_id: scheme.ls_comp_id,
    ls_branch_id: scheme.ls_branch_id ?? "",
    ls_include_tax_for_points: scheme.ls_include_tax_for_points,
    ls_rounding_method: scheme.ls_rounding_method,
    ls_recur_apl: scheme.ls_recur_apl,
    ls_bal_apl: scheme.ls_bal_apl,
    ls_allow_point_redeem: scheme.ls_allow_point_redeem,
    ls_allow_gift_redeem: scheme.ls_allow_gift_redeem,
    ls_redeem_value_per_point: String(scheme.ls_redeem_value_per_point),
    ls_min_redeem_points: String(scheme.ls_min_redeem_points),
    ls_max_redeem_points_per_bill: String(scheme.ls_max_redeem_points_per_bill),
    ls_max_redeem_percent_per_bill: String(scheme.ls_max_redeem_percent_per_bill),
    ls_redeem_min_bill_amount: String(scheme.ls_redeem_min_bill_amount),
    ls_points_valid_days: String(scheme.ls_points_valid_days),
    ls_expiry_basis: scheme.ls_expiry_basis,
    ls_remarks: scheme.ls_remarks ?? "",
    ls_is_active: scheme.ls_is_active,
  };
}

export function buildSchemeRequest(
  form: SchemeFormState,
  partyRows: EditablePartyRow[],
): SaveLoyaltySchemeRequest {
  const schemePartyScopeType = isPartyScopeType(form.ls_cust_type) ? form.ls_cust_type : undefined;
  return {
    ...(form.ls_id ? { ls_id: form.ls_id } : {}),
    ls_code: toNullableString(form.ls_code),
    ls_name: form.ls_name.trim(),
    ls_type: form.ls_type,
    ls_status: form.ls_status,
    ls_auto_apply: form.ls_auto_apply,
    ls_apply_on: form.ls_apply_on,
    ls_calc_on_amount_type: form.ls_calc_on_amount_type,
    ls_bill_type: form.ls_bill_type,
    ls_cust_type: form.ls_cust_type,
    ls_item_type: form.ls_item_type,
    ls_start_date: form.ls_start_date,
    ls_end_date: form.ls_end_date,
    ...(form.ls_valid_from_time.trim() ? { ls_valid_from_time: form.ls_valid_from_time } : {}),
    ...(form.ls_valid_to_time.trim() ? { ls_valid_to_time: form.ls_valid_to_time } : {}),
    ls_valid_weekdays: toNullableString(form.ls_valid_weekdays),
    ls_comp_id: form.ls_comp_id,
    ls_branch_id: form.ls_branch_id.trim() || null,
    ls_include_tax_for_points: form.ls_include_tax_for_points,
    ls_rounding_method: form.ls_rounding_method,
    ls_recur_apl: form.ls_recur_apl,
    ls_bal_apl: form.ls_bal_apl,
    ls_allow_point_redeem: form.ls_allow_point_redeem,
    ls_allow_gift_redeem: form.ls_allow_gift_redeem,
    ls_redeem_value_per_point: toOptionalNumber(form.ls_redeem_value_per_point) ?? 0,
    ls_min_redeem_points: toOptionalNumber(form.ls_min_redeem_points) ?? 0,
    ls_max_redeem_points_per_bill: toOptionalNumber(form.ls_max_redeem_points_per_bill) ?? 0,
    ls_max_redeem_percent_per_bill: toOptionalNumber(form.ls_max_redeem_percent_per_bill) ?? 0,
    ls_redeem_min_bill_amount: toOptionalNumber(form.ls_redeem_min_bill_amount) ?? 0,
    ls_points_valid_days: toOptionalInteger(form.ls_points_valid_days) ?? 0,
    ls_expiry_basis: form.ls_expiry_basis,
    ls_remarks: toNullableString(form.ls_remarks),
    ls_is_active: form.ls_is_active,
    parties: partyRows
      .filter(shouldPersistPartyRow)
      .map((row) => buildPartyRequest(row, undefined, schemePartyScopeType)),
  };
}

// ── Points ────────────────────────────────────────────────────────────────────

export function buildEmptyPointForm(): PointFormState {
  return {
    lspt_id: "",
    lspt_slno: "",
    lspt_item_id: "",
    lspt_unit_id: "",
    lspt_exceeds: "0",
    lspt_each: "1",
    lspt_factor: "1",
    lspt_points: "0",
    lspt_notes: "",
    lspt_is_active: true,
  };
}

export function mapPointToForm(point: LoyaltyPointPayload): PointFormState {
  return {
    lspt_id: point.lspt_id,
    lspt_slno: String(point.lspt_slno),
    lspt_item_id: point.lspt_item_id ?? "",
    lspt_unit_id: point.lspt_unit_id ?? "",
    lspt_exceeds: String(point.lspt_exceeds),
    lspt_each: String(point.lspt_each),
    lspt_factor: String(point.lspt_factor),
    lspt_points: String(point.lspt_points),
    lspt_notes: point.lspt_notes ?? "",
    lspt_is_active: point.lspt_is_active,
  };
}

export function buildPointRequest(schemeId: string, form: PointFormState): SaveLoyaltyPointRequest {
  return {
    ...(form.lspt_id ? { lspt_id: form.lspt_id } : {}),
    lspt_ls_id: schemeId,
    ...(form.lspt_slno.trim() ? { lspt_slno: toOptionalInteger(form.lspt_slno) } : {}),
    lspt_item_id: form.lspt_item_id.trim() || null,
    lspt_unit_id: form.lspt_unit_id.trim() || null,
    lspt_exceeds: toOptionalNumber(form.lspt_exceeds) ?? 0,
    lspt_each: toOptionalNumber(form.lspt_each) ?? 1,
    lspt_factor: toOptionalNumber(form.lspt_factor) ?? 1,
    lspt_points: toOptionalNumber(form.lspt_points) ?? 0,
    lspt_notes: toNullableString(form.lspt_notes),
    lspt_is_active: form.lspt_is_active,
  };
}

export function createPointRow(row?: LoyaltyPointPayload): EditablePointRow {
  const base = row ? mapPointToForm(row) : buildEmptyPointForm();
  return {
    ...base,
    _rowKey: row?.lspt_id || `new-point-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    _saving: false,
    _isNew: !row,
  };
}

export function shouldPersistPointRow(row: EditablePointRow): boolean {
  if (row.lspt_id) return true;
  return Boolean(
    row.lspt_slno.trim() ||
      row.lspt_item_id.trim() ||
      row.lspt_unit_id.trim() ||
      row.lspt_notes.trim() ||
      row.lspt_exceeds.trim() !== "0" ||
      row.lspt_each.trim() !== "1" ||
      row.lspt_factor.trim() !== "1" ||
      row.lspt_points.trim() !== "0" ||
      !row.lspt_is_active,
  );
}

// ── Gifts ─────────────────────────────────────────────────────────────────────

export function buildEmptyGiftForm(): GiftFormState {
  return {
    lsg_id: "",
    lsg_slno: "",
    lsg_item_id: "",
    lsg_unit_id: "",
    lsg_item_qty: "1",
    lsg_redeem_points: "0",
    lsg_repeat: false,
    lsg_notes: "",
    lsg_is_active: true,
  };
}

export function mapGiftToForm(gift: LoyaltyGiftPayload): GiftFormState {
  return {
    lsg_id: gift.lsg_id,
    lsg_slno: String(gift.lsg_slno),
    lsg_item_id: gift.lsg_item_id,
    lsg_unit_id: gift.lsg_unit_id,
    lsg_item_qty: String(gift.lsg_item_qty),
    lsg_redeem_points: String(gift.lsg_redeem_points),
    lsg_repeat: gift.lsg_repeat,
    lsg_notes: gift.lsg_notes ?? "",
    lsg_is_active: gift.lsg_is_active,
  };
}

export function buildGiftRequest(schemeId: string, form: GiftFormState): SaveLoyaltyGiftRequest {
  return {
    ...(form.lsg_id ? { lsg_id: form.lsg_id } : {}),
    lsg_ls_id: schemeId,
    ...(form.lsg_slno.trim() ? { lsg_slno: toOptionalInteger(form.lsg_slno) } : {}),
    lsg_item_id: form.lsg_item_id.trim(),
    lsg_unit_id: form.lsg_unit_id.trim(),
    lsg_item_qty: toOptionalNumber(form.lsg_item_qty) ?? 1,
    lsg_redeem_points: toOptionalNumber(form.lsg_redeem_points) ?? 0,
    lsg_repeat: form.lsg_repeat,
    lsg_notes: toNullableString(form.lsg_notes),
    lsg_is_active: form.lsg_is_active,
  };
}

export function createGiftRow(row?: LoyaltyGiftPayload): EditableGiftRow {
  const base = row ? mapGiftToForm(row) : buildEmptyGiftForm();
  return {
    ...base,
    _rowKey: row?.lsg_id || `new-gift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    _saving: false,
    _isNew: !row,
  };
}

export function shouldPersistGiftRow(row: EditableGiftRow): boolean {
  if (row.lsg_id) return true;
  return Boolean(
    row.lsg_slno.trim() ||
      row.lsg_item_id.trim() ||
      row.lsg_unit_id.trim() ||
      row.lsg_notes.trim() ||
      row.lsg_item_qty.trim() !== "1" ||
      row.lsg_redeem_points.trim() !== "0" ||
      row.lsg_repeat ||
      !row.lsg_is_active,
  );
}

// ── Party ─────────────────────────────────────────────────────────────────────

export function buildEmptyPartyRow(nextSlno = 1, scopeType: PartyScopeType = "CUSTOMER_GROUP"): EditablePartyRow {
  return {
    lps_id: "",
    lps_ls_id: "",
    lps_slno: nextSlno,
    lps_scope_type: scopeType,
    lps_scope_id: "",
    lps_is_exclude: false,
    lps_notes: "",
    lps_is_active: true,
    lps_is_deleted: false,
    lps_sync_date: null,
    lps_created_on: "",
    lps_created_by: null,
    lps_updated_on: null,
    lps_updated_by: null,
    _rowKey: `party-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function createPartyRow(row: LoyaltyPartyPayload): EditablePartyRow {
  return {
    ...row,
    _rowKey: row.lps_id || `party-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function buildPartyRequest(
  row: EditablePartyRow,
  schemeId?: string,
  scopeType?: PartyScopeType,
): SaveLoyaltyPartyRequest {
  return {
    ...(row.lps_id ? { lps_id: row.lps_id } : {}),
    ...(schemeId ? { lps_ls_id: schemeId } : {}),
    lps_slno: row.lps_slno,
    lps_scope_type: scopeType ?? row.lps_scope_type,
    lps_scope_id: row.lps_scope_id.trim(),
    lps_is_exclude: row.lps_is_exclude,
    lps_notes: row.lps_notes?.trim() ? row.lps_notes.trim() : null,
    lps_is_active: row.lps_is_active,
  };
}

export function shouldPersistPartyRow(row: EditablePartyRow): boolean {
  if (row.lps_id) return true;
  return Boolean(
    row.lps_scope_id.trim() ||
      row.lps_is_exclude ||
      (row.lps_notes?.trim() ?? "") ||
      !row.lps_is_active,
  );
}
