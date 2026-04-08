"use client";
import { type FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiGift, FiPlus, FiRefreshCw, FiSave } from "react-icons/fi";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHead,
  CardTitle,
  Field,
  FieldHelp,
  Input,
  Label,
  Select,
  Textarea,
  type ERPDynamicSelectOption,
} from "@/components/library/ui";
import { useBusinessContext } from "@/components/layout/business-context";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import {
  DEFAULT_LOOKUP_ARRAY_KEYS,
  buildLookupOptions,
} from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse } from "@/utils/types";
import styles from "./page.module.scss";
import type {
  LoyaltyGiftPayload,
  LoyaltyPartyPayload,
  LoyaltyPointPayload,
  LoyaltySchemePayload,
  PromotionLoyaltyPointsListMeta,
  SaveLoyaltyGiftRequest,
  SaveLoyaltyPartyRequest,
  SaveLoyaltyPointRequest,
  SaveLoyaltySchemeRequest,
} from "./promotion-loyalty-points.types";
const LOYALTY_LIST_ENDPOINT = "/promotion-loyalty-points/list";
const LOYALTY_GET_ENDPOINT = "/promotion-loyalty-points/get";
const LOYALTY_SAVE_ENDPOINT = "/promotion-loyalty-points/create";
const LOYALTY_DELETE_ENDPOINT = "/promotion-loyalty-points/delete";
const LOYALTY_POINT_SAVE_ENDPOINT = "/promotion-loyalty-points/points/create";
const LOYALTY_POINT_DELETE_ENDPOINT = "/promotion-loyalty-points/points/delete";
const LOYALTY_GIFT_SAVE_ENDPOINT = "/promotion-loyalty-points/gifts/create";
const LOYALTY_GIFT_DELETE_ENDPOINT = "/promotion-loyalty-points/gifts/delete";
const MASTER_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const SCHEME_TYPE_OPTIONS = [
  { value: "REDEEM", label: "Redeem" },
  { value: "BOTH", label: "Both" },
  { value: "GIFT", label: "Gift" },
] as const;
const SCHEME_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "APPROVED", label: "Approved" },
  { value: "ACTIVE", label: "Active" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;
const APPLY_ON_OPTIONS = [
  { value: "BILL_AMOUNT", label: "Bill Amount" },
  { value: "ITEM_AMOUNT", label: "Item Amount" },
  { value: "BILL_QTY", label: "Bill Qty" },
  { value: "ITEM_QTY", label: "Item Qty" },
  { value: "MASTER_PV", label: "Master PV" },
] as const;
const AMOUNT_TYPE_OPTIONS = [
  { value: "NET_AMOUNT", label: "Net Amount" },
  { value: "GROSS_AMOUNT", label: "Gross Amount" },
  { value: "TAXABLE_AMOUNT", label: "Taxable Amount" },
] as const;
const BILL_TYPE_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "CASH", label: "Cash" },
  { value: "CREDIT", label: "Credit" },
] as const;
const CUSTOMER_TYPE_OPTIONS = [
  { value: "ALL", label: "All Customers" },
  { value: "CUSTOMER_GROUP", label: "Customer Group" },
  { value: "CUSTOMER", label: "Customer" },
] as const;
const ITEM_TYPE_OPTIONS = [
  { value: "ALL", label: "All Items" },
  { value: "ITEM_GROUP", label: "Item Group" },
  { value: "ITEM_BRAND", label: "Item Brand" },
  { value: "ITEM_CATEGORY", label: "Item Category" },
  { value: "ITEM_SECTION", label: "Item Section" },
  { value: "ITEM", label: "Item" },
] as const;
const ROUNDING_OPTIONS = [
  { value: "FLOOR", label: "Floor" },
  { value: "ROUND", label: "Round" },
  { value: "CEIL", label: "Ceil" },
] as const;
const EXPIRY_OPTIONS = [
  { value: "EARN_DATE", label: "Earn Date" },
  { value: "SCHEME_END_DATE", label: "Scheme End Date" },
  { value: "MONTH_END", label: "Month End" },
  { value: "YEAR_END", label: "Year End" },
  { value: "NONE", label: "None" },
] as const;
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "All Branches",
};
const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "All Items",
};
const DEFAULT_UNIT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Any Unit",
};
const DEFAULT_REQUIRED_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Item",
};
const DEFAULT_REQUIRED_UNIT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Unit",
};
type SchemeFormState = {
  ls_id: string;
  ls_code: string;
  ls_name: string;
  ls_type: string;
  ls_status: string;
  ls_auto_apply: boolean;
  ls_apply_on: string;
  ls_calc_on_amount_type: string;
  ls_bill_type: string;
  ls_cust_type: string;
  ls_item_type: string;
  ls_start_date: string;
  ls_end_date: string;
  ls_valid_from_time: string;
  ls_valid_to_time: string;
  ls_valid_weekdays: string;
  ls_comp_id: string;
  ls_branch_id: string;
  ls_include_tax_for_points: boolean;
  ls_rounding_method: string;
  ls_recur_apl: boolean;
  ls_bal_apl: boolean;
  ls_allow_point_redeem: boolean;
  ls_allow_gift_redeem: boolean;
  ls_redeem_value_per_point: string;
  ls_min_redeem_points: string;
  ls_max_redeem_points_per_bill: string;
  ls_max_redeem_percent_per_bill: string;
  ls_redeem_min_bill_amount: string;
  ls_points_valid_days: string;
  ls_expiry_basis: string;
  ls_remarks: string;
  ls_is_active: boolean;
};
type PointFormState = {
  lspt_id: string;
  lspt_slno: string;
  lspt_item_id: string;
  lspt_unit_id: string;
  lspt_exceeds: string;
  lspt_each: string;
  lspt_factor: string;
  lspt_points: string;
  lspt_notes: string;
  lspt_is_active: boolean;
};
type GiftFormState = {
  lsg_id: string;
  lsg_slno: string;
  lsg_item_id: string;
  lsg_unit_id: string;
  lsg_item_qty: string;
  lsg_redeem_points: string;
  lsg_repeat: boolean;
  lsg_notes: string;
  lsg_is_active: boolean;
};
type EditablePointRow = PointFormState & {
  _rowKey: string;
  _saving?: boolean;
  _isNew?: boolean;
};
type EditableGiftRow = GiftFormState & {
  _rowKey: string;
  _saving?: boolean;
  _isNew?: boolean;
};
type EditablePartyRow = LoyaltyPartyPayload & {
  _rowKey: string;
};
type DeleteDialogState =
  | { kind: "scheme"; id: string; label: string }
  | { kind: "point"; id: string; label: string }
  | { kind: "gift"; id: string; label: string }
  | null;
type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";
type EditorTab = "scheme" | "points" | "gifts" | "party";
type LookupConfig = {
  arrayKeys: readonly string[];
  idKeys: readonly string[];
  labelKeys: readonly string[];
};
const ITEM_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "items", "item_masters"],
  idKeys: ["item_id", "itemId", "id", "_id", "value"],
  labelKeys: ["item_name_en", "itemNameEn", "item_name", "name", "label"],
};

const UNIT_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "units", "itemUnits"],
  idKeys: ["unit_id", "unitId", "item_unit_id", "itemUnitId", "id", "_id", "value"],
  labelKeys: ["unit_name", "unitName", "item_unit_name", "name", "label"],
};
const CUSTOMER_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "customers"],
  idKeys: ["cusId", "cus_id", "customer_id", "customerId", "id", "_id", "value"],
  labelKeys: ["cusName", "cus_name", "customer_name", "customerName", "name", "label"],
};
const CUSTOMER_GROUP_LOOKUP_KEYS: LookupConfig = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "customerGroups", "customer_groups"],
  idKeys: ["cgrId", "cgr_id", "group_id", "groupId", "id", "_id", "value"],
  labelKeys: ["cgrName", "cgr_name", "group_name", "groupName", "name", "label"],
};
function stripEmptyOptions(options: ERPDynamicSelectOption[]): ERPDynamicSelectOption[] {
  return options.filter((option) => option.value.trim().length > 0);
}
function withDefaultOption(
  options: ERPDynamicSelectOption[],
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  return [defaultOption, ...stripEmptyOptions(options)];
}
function buildLookupChoices(payload: unknown, config: LookupConfig): ERPDynamicSelectOption[] {
  return stripEmptyOptions(
    buildLookupOptions(payload, { value: "", label: "" }, {
      arrayKeys: config.arrayKeys,
      idKeys: config.idKeys,
      labelKeys: config.labelKeys,
    }),
  );
}
function buildOptionLabelMap(options: ERPDynamicSelectOption[]): Map<string, string> {
  return new Map(
    options
      .filter((option) => option.value.trim().length > 0)
      .map((option) => [option.value, option.label]),
  );
}
function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}
function toTimeInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : "";
}
function toNullableString(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}
function toOptionalNumber(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function toOptionalInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}
function buildEmptySchemeForm(companyId: string, branchId: string): SchemeFormState {
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
    ls_recur_apl: false,
    ls_bal_apl: false,
    ls_allow_point_redeem: false,
    ls_allow_gift_redeem: false,
    ls_redeem_value_per_point: "0",
    ls_min_redeem_points: "0",
    ls_max_redeem_points_per_bill: "0",
    ls_max_redeem_percent_per_bill: "0",
    ls_redeem_min_bill_amount: "0",
    ls_points_valid_days: "0",
    ls_expiry_basis: EXPIRY_OPTIONS[0].value,
    ls_remarks: "",
    ls_is_active: true,
  };
}
function buildEmptyPartyRow(nextSlno = 1): EditablePartyRow {
  return {
    lps_id: "",
    lps_ls_id: "",
    lps_slno: nextSlno,
    lps_scope_type: "CUSTOMER_GROUP",
    lps_scope_id: "",
    lps_is_exclude: false,
    lps_notes: null,
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
function createPartyRow(row: LoyaltyPartyPayload): EditablePartyRow {
  return {
    ...row,
    _rowKey: row.lps_id || `party-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
function mapSchemeToForm(scheme: LoyaltySchemePayload): SchemeFormState {
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
function buildPartyRequest(
  row: EditablePartyRow,
  schemeId?: string,
): SaveLoyaltyPartyRequest {
  return {
    ...(row.lps_id ? { lps_id: row.lps_id } : {}),
    ...(schemeId ? { lps_ls_id: schemeId } : {}),
    lps_slno: row.lps_slno,
    lps_scope_type: row.lps_scope_type,
    lps_scope_id: row.lps_scope_id.trim(),
    lps_is_exclude: row.lps_is_exclude,
    lps_notes: row.lps_notes?.trim() ? row.lps_notes.trim() : null,
    lps_is_active: row.lps_is_active,
  };
}
function shouldPersistPointRow(row: EditablePointRow): boolean {
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
function shouldPersistGiftRow(row: EditableGiftRow): boolean {
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
function shouldPersistPartyRow(row: EditablePartyRow): boolean {
  if (row.lps_id) return true;
  return Boolean(
    row.lps_scope_id.trim() ||
      row.lps_is_exclude ||
      (row.lps_notes?.trim() ?? "") ||
      !row.lps_is_active,
  );
}
function buildSchemeRequest(
  form: SchemeFormState,
  partyRows: EditablePartyRow[],
): SaveLoyaltySchemeRequest {
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
    ls_max_redeem_percent_per_bill:
      toOptionalNumber(form.ls_max_redeem_percent_per_bill) ?? 0,
    ls_redeem_min_bill_amount: toOptionalNumber(form.ls_redeem_min_bill_amount) ?? 0,
    ls_points_valid_days: toOptionalInteger(form.ls_points_valid_days) ?? 0,
    ls_expiry_basis: form.ls_expiry_basis,
    ls_remarks: toNullableString(form.ls_remarks),
    ls_is_active: form.ls_is_active,
    parties: partyRows.filter(shouldPersistPartyRow).map((row) => buildPartyRequest(row)),
  };
}
function buildEmptyPointForm(): PointFormState {
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
function mapPointToForm(point: LoyaltyPointPayload): PointFormState {
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
function buildPointRequest(schemeId: string, form: PointFormState): SaveLoyaltyPointRequest {
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

function buildEmptyGiftForm(): GiftFormState {
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

function mapGiftToForm(gift: LoyaltyGiftPayload): GiftFormState {
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

function buildGiftRequest(schemeId: string, form: GiftFormState): SaveLoyaltyGiftRequest {
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
function createPointRow(row?: LoyaltyPointPayload): EditablePointRow {
  const base = row ? mapPointToForm(row) : buildEmptyPointForm();
  return {
    ...base,
    _rowKey:
      row?.lspt_id || `new-point-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    _saving: false,
    _isNew: !row,
  };
}
function createGiftRow(row?: LoyaltyGiftPayload): EditableGiftRow {
  const base = row ? mapGiftToForm(row) : buildEmptyGiftForm();
  return {
    ...base,
    _rowKey:
      row?.lsg_id || `new-gift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    _saving: false,
    _isNew: !row,
  };
}
function formatDateRange(startDate: string, endDate: string): string {
  const start = toDateInputValue(startDate);
  const end = toDateInputValue(endDate);
  if (!start && !end) return "No dates";
  if (!start) return end;
  if (!end) return start;
  return `${start} to ${end}`;
}
function resolveLabel(
  value: string | null | undefined,
  map: Map<string, string>,
  fallback = "Not set",
): string {
  if (!value) return fallback;
  return map.get(value) ?? value;
}
function getStatusVariant(status: string): BadgeVariant {
  if (status === "ACTIVE") return "success";
  if (status === "APPROVED") return "info";
  if (status === "CLOSED") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}
function getTypeVariant(type: string): BadgeVariant {
  if (type === "BOTH") return "info";
  if (type === "GIFT") return "warning";
  return "success";
}
function getPartyScopeLabel(
  party: LoyaltyPartyPayload,
  customerNameMap: Map<string, string>,
  customerGroupNameMap: Map<string, string>,
): string {
  if (party.lps_scope_type === "CUSTOMER_GROUP") {
    return resolveLabel(party.lps_scope_id, customerGroupNameMap, party.lps_scope_id);
  }
  if (party.lps_scope_type === "CUSTOMER") {
    return resolveLabel(party.lps_scope_id, customerNameMap, party.lps_scope_id);
  }
  return party.lps_scope_id;
}
export default function PromotionLoyaltyPointsPage() {
  const {
    activeCompany,
    branchOptions: businessBranchOptions,
    selectedBranchId,
    selectedCompanyId,
  } = useBusinessContext();
  const [schemeRows, setSchemeRows] = useState<LoyaltySchemePayload[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<LoyaltySchemePayload | null>(null);
  const [schemeForm, setSchemeForm] = useState<SchemeFormState>(
    buildEmptySchemeForm(selectedCompanyId, selectedBranchId),
  );
  const [pointRows, setPointRows] = useState<EditablePointRow[]>([]);
  const [giftRows, setGiftRows] = useState<EditableGiftRow[]>([]);
  const [partyRows, setPartyRows] = useState<EditablePartyRow[]>([]);
  const [schemeSearch, setSchemeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [listMeta, setListMeta] = useState<PromotionLoyaltyPointsListMeta | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [itemChoices, setItemChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [unitChoices, setUnitChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [customerChoices, setCustomerChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [customerGroupChoices, setCustomerGroupChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("scheme");
  const editorDialogRef = useRef<HTMLDivElement | null>(null);
  const deferredSchemeSearch = useDeferredValue(schemeSearch.trim());
  const branchOptions = useMemo(
    () =>
      withDefaultOption(
        businessBranchOptions.filter((option) => option.value.trim().length > 0),
        DEFAULT_BRANCH_OPTION,
      ),
    [businessBranchOptions],
  );
  const itemOptionsForPoint = useMemo(
    () => withDefaultOption(itemChoices, DEFAULT_ITEM_OPTION),
    [itemChoices],
  );
  const unitOptionsForPoint = useMemo(
    () => withDefaultOption(unitChoices, DEFAULT_UNIT_OPTION),
    [unitChoices],
  );
  const itemOptionsForGift = useMemo(
    () => withDefaultOption(itemChoices, DEFAULT_REQUIRED_ITEM_OPTION),
    [itemChoices],
  );
  const unitOptionsForGift = useMemo(
    () => withDefaultOption(unitChoices, DEFAULT_REQUIRED_UNIT_OPTION),
    [unitChoices],
  );
  const customerLabelMap = useMemo(() => buildOptionLabelMap(customerChoices), [customerChoices]);
  const customerGroupLabelMap = useMemo(
    () => buildOptionLabelMap(customerGroupChoices),
    [customerGroupChoices],
  );
  const branchLabelMap = useMemo(() => buildOptionLabelMap(branchOptions), [branchOptions]);

  const { getAll: listSchemes, loading: listLoading, error: listError } = useApi<
    ApiSuccessResponse<LoyaltySchemePayload[], PromotionLoyaltyPointsListMeta>
  >(LOYALTY_LIST_ENDPOINT, {
    toast: { success: false, error: true },
  });
  const { run: getSchemeById, loading: detailLoading, error: detailError } = useApi<
    ApiSuccessResponse<LoyaltySchemePayload>
  >(LOYALTY_GET_ENDPOINT, {
    toast: { success: false, error: true },
  });
  const { run: saveScheme, loading: schemeSaving } = useApi<
    ApiSuccessResponse<LoyaltySchemePayload>,
    SaveLoyaltySchemeRequest
  >(LOYALTY_SAVE_ENDPOINT, {
    method: "POST",
    toast: { success: true, error: true, successMessage: "Loyalty scheme saved." },
  });
  const { run: deleteScheme, loading: schemeDeleting } = useApi<
    ApiSuccessResponse<{ ls_id: string; deleted: true }>
  >(LOYALTY_DELETE_ENDPOINT, {
    method: "DELETE",
    toast: { success: true, error: true, successMessage: "Loyalty scheme deleted." },
  });
  const { run: savePoint } = useApi<
    ApiSuccessResponse<LoyaltyPointPayload>,
    SaveLoyaltyPointRequest
  >(LOYALTY_POINT_SAVE_ENDPOINT, {
    method: "POST",
    toast: { success: true, error: true, successMessage: "Point rule saved." },
  });
  const { run: savePointSilently } = useApi<
    ApiSuccessResponse<LoyaltyPointPayload>,
    SaveLoyaltyPointRequest
  >(LOYALTY_POINT_SAVE_ENDPOINT, {
    method: "POST",
    toast: { success: false, error: true },
  });
  const { run: deletePoint, loading: pointDeleting } = useApi<
    ApiSuccessResponse<{ lspt_id: string; deleted: true }>
  >(LOYALTY_POINT_DELETE_ENDPOINT, {
    method: "DELETE",
    toast: { success: true, error: true, successMessage: "Point rule deleted." },
  });
  const { run: saveGift } = useApi<
    ApiSuccessResponse<LoyaltyGiftPayload>,
    SaveLoyaltyGiftRequest
  >(LOYALTY_GIFT_SAVE_ENDPOINT, {
    method: "POST",
    toast: { success: true, error: true, successMessage: "Gift rule saved." },
  });
  const { run: saveGiftSilently } = useApi<
    ApiSuccessResponse<LoyaltyGiftPayload>,
    SaveLoyaltyGiftRequest
  >(LOYALTY_GIFT_SAVE_ENDPOINT, {
    method: "POST",
    toast: { success: false, error: true },
  });
  const { run: deleteGift, loading: giftDeleting } = useApi<
    ApiSuccessResponse<{ lsg_id: string; deleted: true }>
  >(LOYALTY_GIFT_DELETE_ENDPOINT, {
    method: "DELETE",
    toast: { success: true, error: true, successMessage: "Gift rule deleted." },
  });
  const { getAll: getItemLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, {
    toast: { success: false, error: false },
  });
  const { getAll: getUnitLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, {
    toast: { success: false, error: false },
  });
  const { getAll: getCustomerLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, {
    toast: { success: false, error: false },
  });
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, {
    toast: { success: false, error: false },
  });
  const resetSchemeEditor = (nextBranchId = selectedBranchId) => {
    setSelectedScheme(null);
    setSchemeForm(buildEmptySchemeForm(selectedCompanyId, nextBranchId));
    setPointRows([]);
    setGiftRows([]);
    setPartyRows([]);
  };
  const loadSchemeDetail = async (schemeId: string) => {
    const response = await getSchemeById({ query: { ls_id: schemeId } });
    if (!response?.data) return;
    setSelectedScheme(response.data);
    setSchemeForm(mapSchemeToForm(response.data));
    setPointRows((response.data.points ?? []).map((row) => createPointRow(row)));
    setGiftRows((response.data.gifts ?? []).map((row) => createGiftRow(row)));
    setPartyRows((response.data.parties ?? []).map((row) => createPartyRow(row)));
  };
  const reloadSchemes = async () => {
    if (!selectedCompanyId.trim()) {
      setSchemeRows([]);
      setListMeta(null);
      resetSchemeEditor("");
      return;
    }
    const query: Record<string, string> = {
      ls_comp_id: selectedCompanyId.trim(),
      page: "1",
      limit: "100",
    };
    if (branchFilter.trim()) query.ls_branch_id = branchFilter.trim();
    if (deferredSchemeSearch) query.search = deferredSchemeSearch;
    if (statusFilter.trim()) query.ls_status = statusFilter;
    if (typeFilter.trim()) query.ls_type = typeFilter;
    const response = await listSchemes(query);
    const nextRows = response?.data ?? [];
    setSchemeRows(nextRows);
    setListMeta(response?.meta ?? null);
    if (selectedScheme && !nextRows.some((row) => row.ls_id === selectedScheme.ls_id)) {
      resetSchemeEditor(selectedBranchId);
    }
  };
  useEffect(() => {
    if (!selectedCompanyId.trim()) {
      setSchemeRows([]);
      setListMeta(null);
      resetSchemeEditor("");
      return;
    }
    setSchemeForm((previous) => {
      const nextState: SchemeFormState = {
        ...previous,
        ls_comp_id: selectedCompanyId,
      };
      if (!selectedScheme) {
        nextState.ls_branch_id = previous.ls_branch_id || selectedBranchId;
      }
      return nextState;
    });
  }, [selectedCompanyId, selectedBranchId, selectedScheme]);
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [itemsPayload, unitsPayload, customersPayload, customerGroupsPayload] =
          await Promise.all([
            getItemLookup({ module: "items", limit: "100" }),
            getUnitLookup({ module: "units", limit: "100" }),
            getCustomerLookup({ module: "customers", limit: "100" }),
            getCustomerGroupLookup({ module: "customerGroups", limit: "100" }),
          ]);
        setItemChoices(buildLookupChoices(itemsPayload, ITEM_LOOKUP_KEYS));
        setUnitChoices(buildLookupChoices(unitsPayload, UNIT_LOOKUP_KEYS));
        setCustomerChoices(buildLookupChoices(customersPayload, CUSTOMER_LOOKUP_KEYS));
        setCustomerGroupChoices(
          buildLookupChoices(customerGroupsPayload, CUSTOMER_GROUP_LOOKUP_KEYS),
        );
      } catch {
        // handled by hook
      }
    };
    void loadLookups();
  }, [getCustomerGroupLookup, getCustomerLookup, getItemLookup, getUnitLookup]);
  useEffect(() => {
    void reloadSchemes();
  }, [selectedCompanyId, branchFilter, deferredSchemeSearch, statusFilter, typeFilter]);
  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsEditorOpen(false);
        setActiveTab("scheme");
      }
    };

    const html = document.documentElement;
    const body = document.body;
    const appContent = document.querySelector<HTMLElement>(".erp-app-content");
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousAppOverflow = appContent?.style.overflow ?? "";
    const previousAppOverscroll = appContent?.style.overscrollBehavior ?? "";

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    if (appContent) {
      appContent.style.overflow = "hidden";
      appContent.style.overscrollBehavior = "none";
    }

    window.addEventListener("keydown", onKeyDown);

    const focusFrame = window.requestAnimationFrame(() => {
      editorDialogRef.current?.focus();
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusFrame);
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      if (appContent) {
        appContent.style.overflow = previousAppOverflow;
        appContent.style.overscrollBehavior = previousAppOverscroll;
      }
    };
  }, [isEditorOpen]);
  const openCreateModal = () => {
    resetSchemeEditor(selectedBranchId);
    setActiveTab("scheme");
    setIsEditorOpen(true);
  };
  const openEditModal = async (schemeId: string, tab: EditorTab = "scheme") => {
    await loadSchemeDetail(schemeId);
    setActiveTab(tab);
    setIsEditorOpen(true);
  };
  const closeEditorModal = () => {
    setIsEditorOpen(false);
    setActiveTab("scheme");
  };
  const updatePointRow = (rowKey: string, patch: Partial<EditablePointRow>) => {
    setPointRows((previous) =>
      previous.map((row) => (row._rowKey === rowKey ? { ...row, ...patch } : row)),
    );
  };
  const updateGiftRow = (rowKey: string, patch: Partial<EditableGiftRow>) => {
    setGiftRows((previous) =>
      previous.map((row) => (row._rowKey === rowKey ? { ...row, ...patch } : row)),
    );
  };
  const updatePartyRow = (rowKey: string, patch: Partial<EditablePartyRow>) => {
    setPartyRows((previous) =>
      previous.map((row) => (row._rowKey === rowKey ? { ...row, ...patch } : row)),
    );
  };
  const addPointRow = () => {
    setPointRows((previous) => [...previous, createPointRow()]);
  };
  const addGiftRow = () => {
    setGiftRows((previous) => [...previous, createGiftRow()]);
  };
  const addPartyRow = () => {
    setPartyRows((previous) => {
      const nextSlno =
        previous.reduce((maxSlno, row) => Math.max(maxSlno, row.lps_slno || 0), 0) + 1;
      return [...previous, buildEmptyPartyRow(nextSlno)];
    });
  };
  const cancelPointRow = (rowKey: string) => {
    setPointRows((previous) => {
      const current = previous.find((item) => item._rowKey === rowKey);
      if (!current) return previous;
      if (current._isNew) {
        return previous.filter((item) => item._rowKey !== rowKey);
      }
      if (!current.lspt_id || !selectedScheme) {
        return previous;
      }
      const original = selectedScheme.points.find((item) => item.lspt_id === current.lspt_id);
      if (!original) return previous;
      return previous.map((item) =>
        item._rowKey === rowKey ? createPointRow(original) : item,
      );
    });
  };
  const cancelGiftRow = (rowKey: string) => {
    setGiftRows((previous) => {
      const current = previous.find((item) => item._rowKey === rowKey);
      if (!current) return previous;
      if (current._isNew) {
        return previous.filter((item) => item._rowKey !== rowKey);
      }
      if (!current.lsg_id || !selectedScheme) {
        return previous;
      }
      const original = selectedScheme.gifts.find((item) => item.lsg_id === current.lsg_id);
      if (!original) return previous;
      return previous.map((item) =>
        item._rowKey === rowKey ? createGiftRow(original) : item,
      );
    });
  };
  const savePointRow = async (rowKey: string) => {
    if (!selectedScheme) return;
    const row = pointRows.find((item) => item._rowKey === rowKey);
    if (!row) return;
    updatePointRow(rowKey, { _saving: true });
    const response = await savePoint({
      body: buildPointRequest(selectedScheme.ls_id, row),
    });
    updatePointRow(rowKey, { _saving: false });
    if (!response?.data) return;
    await reloadSchemes();
    await loadSchemeDetail(selectedScheme.ls_id);
    setActiveTab("points");
  };
  const saveGiftRow = async (rowKey: string) => {
    if (!selectedScheme) return;
    const row = giftRows.find((item) => item._rowKey === rowKey);
    if (!row) return;
    updateGiftRow(rowKey, { _saving: true });
    const response = await saveGift({
      body: buildGiftRequest(selectedScheme.ls_id, row),
    });
    updateGiftRow(rowKey, { _saving: false });
    if (!response?.data) return;
    await reloadSchemes();
    await loadSchemeDetail(selectedScheme.ls_id);
    setActiveTab("gifts");
  };
  const persistDraftRows = async (schemeId: string) => {
    for (const row of pointRows.filter(shouldPersistPointRow)) {
      updatePointRow(row._rowKey, { _saving: true });
      try {
        await savePointSilently({
          body: buildPointRequest(schemeId, row),
        });
      } finally {
        updatePointRow(row._rowKey, { _saving: false });
      }
    }

    for (const row of giftRows.filter(shouldPersistGiftRow)) {
      updateGiftRow(row._rowKey, { _saving: true });
      try {
        await saveGiftSilently({
          body: buildGiftRequest(schemeId, row),
        });
      } finally {
        updateGiftRow(row._rowKey, { _saving: false });
      }
    }
  };
  const handleSchemeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = buildSchemeRequest(schemeForm, partyRows);
    const response = await saveScheme({ body: payload });
    const savedScheme = response?.data;
    if (!savedScheme) return;

    try {
      await persistDraftRows(savedScheme.ls_id);
    } catch {
      await reloadSchemes();
      await loadSchemeDetail(savedScheme.ls_id);
      setIsEditorOpen(true);
      return;
    }

    await reloadSchemes();
    await loadSchemeDetail(savedScheme.ls_id);
    setIsEditorOpen(true);
    setActiveTab("scheme");
  };
  const confirmDelete = async () => {
    if (!deleteDialog) return;
    if (deleteDialog.kind === "scheme") {
      await deleteScheme({ query: { ls_id: deleteDialog.id } });
      setDeleteDialog(null);
      resetSchemeEditor(selectedBranchId);
      closeEditorModal();
      await reloadSchemes();
      return;
    }
    if (!selectedScheme) {
      setDeleteDialog(null);
      return;
    }
    if (deleteDialog.kind === "point") {
      await deletePoint({ query: { lspt_id: deleteDialog.id } });
    } else {
      await deleteGift({ query: { lsg_id: deleteDialog.id } });
    }
    setDeleteDialog(null);
    await reloadSchemes();
    await loadSchemeDetail(selectedScheme.ls_id);
  };
  const deleteLoading =
    (deleteDialog?.kind === "scheme" && schemeDeleting) ||
    (deleteDialog?.kind === "point" && pointDeleting) ||
    (deleteDialog?.kind === "gift" && giftDeleting) ||
    false;
  const canSaveChildRows = Boolean(selectedScheme?.ls_id || schemeForm.ls_id.trim());
  const schemeColumns: ReusableTableColumn<LoyaltySchemePayload>[] = [
    {
      key: "ls_code",
      header: "Code",
      render: (row) => row.ls_code || "Auto",
      width: "100px",
    },
    {
      key: "ls_name",
      header: "Scheme",
      render: (row) => (
        <div className={styles.tableTitleCell}>
          <strong>{row.ls_name}</strong>
          <span className={styles.tableSubtleText}>
            {resolveLabel(row.ls_branch_id, branchLabelMap, "All Branches")}
          </span>
        </div>
      ),
      width: "240px",
    },
    {
      key: "ls_type",
      header: "Type",
      render: (row) => <Badge variant={getTypeVariant(row.ls_type)}>{row.ls_type}</Badge>,
      width: "110px",
      align: "center",
    },
    {
      key: "ls_status",
      header: "Status",
      render: (row) => <Badge variant={getStatusVariant(row.ls_status)}>{row.ls_status}</Badge>,
      width: "120px",
      align: "center",
    },
    {
      key: "period",
      header: "Period",
      render: (row) => formatDateRange(row.ls_start_date, row.ls_end_date),
      width: "180px",
    },
    {
      key: "rules",
      header: "Rules",
      render: (row) =>
        `${row.points.length} points / ${row.gifts.length} gifts / ${row.parties.length} parties`,
      width: "220px",
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <Badge variant={row.ls_is_active ? "success" : "neutral"}>
          {row.ls_is_active ? "Yes" : "No"}
        </Badge>
      ),
      width: "90px",
      align: "center",
    },
  ];
  const partyColumns: ReusableTableColumn<EditablePartyRow>[] = [
    {
      key: "lps_slno",
      header: "Sl No",
      render: (row) => (
        <Input
          value={String(row.lps_slno)}
          onChange={(event) =>
            updatePartyRow(row._rowKey, {
              lps_slno: Number.parseInt(event.target.value || "0", 10) || 0,
            })
          }
          type="number"
          min="1"
          step="1"
        />
      ),
      width: "96px",
      align: "center",
    },
    {
      key: "lps_scope_type",
      header: "Scope Type",
      render: (row) => {
        return (
          <Select
            value={row.lps_scope_type}
            onChange={(event) =>
              updatePartyRow(row._rowKey, {
                lps_scope_type: event.target.value,
                lps_scope_id: "",
              })
            }
          >
            <option value="CUSTOMER_GROUP">Customer Group</option>
            <option value="CUSTOMER">Customer</option>
          </Select>
        );
      },
      width: "150px",
      align: "center",
    },
    {
      key: "lps_scope_id",
      header: "Scope",
      render: (row) => {
        const options =
          row.lps_scope_type === "CUSTOMER_GROUP"
            ? customerGroupChoices
            : row.lps_scope_type === "CUSTOMER"
              ? customerChoices
              : [];

        if (!options.length) {
          return (
            <Input
              value={row.lps_scope_id}
              onChange={(event) => updatePartyRow(row._rowKey, { lps_scope_id: event.target.value })}
              placeholder="Scope id"
            />
          );
        }
        const hasValue = options.some((option) => option.value === row.lps_scope_id);
        const fallbackLabel = getPartyScopeLabel(row, customerLabelMap, customerGroupLabelMap);
        return (
          <Select
            value={row.lps_scope_id}
            onChange={(event) => updatePartyRow(row._rowKey, { lps_scope_id: event.target.value })}
          >
            {!hasValue && row.lps_scope_id ? (
              <option value={row.lps_scope_id}>{fallbackLabel}</option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        );
      },
      width: "260px",
    },
    {
      key: "lps_is_exclude",
      header: "Exclude",
      render: (row) => {
        return (
          <label className={styles.tableCheck}>
            <input
              type="checkbox"
              checked={row.lps_is_exclude}
              onChange={(event) =>
                updatePartyRow(row._rowKey, { lps_is_exclude: event.target.checked })
              }
            />
            <span>{row.lps_is_exclude ? "Yes" : "No"}</span>
          </label>
        );
      },
      width: "100px",
      align: "center",
    },
    {
      key: "lps_is_active",
      header: "Active",
      render: (row) => {
        return (
          <label className={styles.tableCheck}>
            <input
              type="checkbox"
              checked={row.lps_is_active}
              onChange={(event) =>
                updatePartyRow(row._rowKey, { lps_is_active: event.target.checked })
              }
            />
            <span>{row.lps_is_active ? "Yes" : "No"}</span>
          </label>
        );
      },
      width: "100px",
      align: "center",
    },
  ];
  return (
    <main className={styles.page}>
      <div className={styles.layout}>    
          <Card as="section" className={styles.panelCard}>
            <CardHead className={styles.cardHead}>                    
              <div>
                 <div className={styles.headTitleWithIcon}>
                <FiGift aria-hidden="true" />
                </div>
                <CardTitle>Loyalty Schemes</CardTitle>
                <CardDescription>
                  Manage promotion loyalty rules for the active company context.
                </CardDescription>
              </div>
              <div className={styles.headActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void reloadSchemes();
                  }}
                  disabled={listLoading || !selectedCompanyId.trim()}
                >
                  <FiRefreshCw aria-hidden="true" />
                  Refresh
                </Button>
                <Button variant="primary" size="sm" onClick={openCreateModal}>
                  <FiPlus aria-hidden="true" />
                  New
                </Button>
              </div>
            </CardHead>
            <CardBody className={styles.cardBody}>
              {!selectedCompanyId.trim() ? (
                <Alert kind="warning" title="Select a company first">
                  Choose the active company from the header before opening loyalty schemes.
                </Alert>
              ) : null}
              <div className={styles.filters}>
                <Field>
                  <Label htmlFor="loyalty-search">Search</Label>
                  <Input
                    id="loyalty-search"
                    value={schemeSearch}
                    onChange={(event) => setSchemeSearch(event.target.value)}
                    placeholder="Search code or scheme name"
                  />
                </Field>
                <Field>
                  <Label htmlFor="loyalty-filter-type">Type</Label>
                  <Select
                    id="loyalty-filter-type"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                  >
                    <option value="">All</option>
                    {SCHEME_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="loyalty-filter-status">Status</Label>
                  <Select
                    id="loyalty-filter-status"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="">All</option>
                    {SCHEME_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="loyalty-filter-branch">Branch Filter</Label>
                  <Select
                    id="loyalty-filter-branch"
                    value={branchFilter}
                    onChange={(event) => setBranchFilter(event.target.value)}
                  >
                    {branchOptions.map((option) => (
                      <option key={option.value || "__all"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {listError ? (
                <Alert kind="danger" title="Unable to load loyalty schemes">
                  {listError}
                </Alert>
              ) : null}
              <div className={styles.tableResponsive}>
                <ReusableTable<LoyaltySchemePayload>
                  columns={schemeColumns}
                  rows={schemeRows}
                  rowKey="ls_id"
                  activeRowKey={selectedScheme?.ls_id ?? null}
                  onRowClick={(row) => {
                    void openEditModal(row.ls_id, "scheme");
                  }}
                  onEdit={(row) => {
                    void openEditModal(row.ls_id, "scheme");
                  }}
                  onDelete={(row) =>
                    setDeleteDialog({
                      kind: "scheme",
                      id: row.ls_id,
                      label: row.ls_name,
                    })
                  }
                  emptyText={
                    selectedCompanyId.trim()
                      ? "No loyalty schemes found for this filter."
                      : "Choose a company to load schemes."
                  }
                  //title={`Schemes${listMeta ? ` (${listMeta.total})` : ""}`}
                  stickyHeader
                  tableMaxHeight="calc(100dvh - 320px)"
                />
              </div>
            </CardBody>
          </Card>   
      </div>
      {isEditorOpen && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalOverlay} onClick={closeEditorModal}>
              <div
                ref={editorDialogRef}
                className={styles.modalDialog}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="loyalty-editor-title"
                tabIndex={-1}
              >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="loyalty-editor-title" className={styles.modalTitle}>
                  {selectedScheme ? `Edit Scheme: ${selectedScheme.ls_name}` : "Create Loyalty Scheme"}
                </h2>
                <p className={styles.modalSubTitle}>
                  Maintain scheme header, point rules, gift rules, and party scope in one place.
                </p>
              </div>
              <div className={styles.modalHeaderActions}>
                <Button variant="ghost" onClick={closeEditorModal}>
                  Close
                </Button>
              </div>
            </div>
            <div className={styles.modalTabs}>
              <button
                type="button"
                className={activeTab === "scheme" ? styles.modalTabActive : styles.modalTab}
                onClick={() => setActiveTab("scheme")}
              >
                Scheme
              </button>
              <button
                type="button"
                className={activeTab === "points" ? styles.modalTabActive : styles.modalTab}
                onClick={() => setActiveTab("points")}
              >
                Points
              </button>
              <button
                type="button"
                className={activeTab === "gifts" ? styles.modalTabActive : styles.modalTab}
                onClick={() => setActiveTab("gifts")}
              >
                Gifts
              </button>
              <button
                type="button"
                className={activeTab === "party" ? styles.modalTabActive : styles.modalTab}
                onClick={() => setActiveTab("party")}
              >
                Party Scope
              </button>
            </div>
            <div className={styles.modalContent}>
              {activeTab === "scheme" ? (
                <form className={styles.modalForm} onSubmit={(event) => void handleSchemeSubmit(event)}>
                  {detailError ? (
                    <Alert kind="danger" title="Unable to load scheme details">
                      {detailError}
                    </Alert>
                  ) : null}
                  <div className={styles.formGrid}>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionEyebrow}>Scheme Header</span>
                      <h3 className={styles.sectionTitle}>Definition</h3>
                    </div>
                    <Field>
                      <Label htmlFor="scheme-code">Scheme Code</Label>
                      <Input
                        id="scheme-code"
                        value={schemeForm.ls_code}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({ ...previous, ls_code: event.target.value }))
                        }
                        placeholder="Optional code"
                      />
                    </Field>
                    <Field className={styles.fieldSpan2}>
                      <Label htmlFor="scheme-name">Scheme Name</Label>
                      <Input
                        id="scheme-name"
                        value={schemeForm.ls_name}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({ ...previous, ls_name: event.target.value }))
                        }
                        placeholder="Summer Rewards"
                        required
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-type">Scheme Type</Label>
                      <Select
                        id="scheme-type"
                        value={schemeForm.ls_type}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({ ...previous, ls_type: event.target.value }))
                        }
                      >
                        {SCHEME_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-status">Status</Label>
                      <Select
                        id="scheme-status"
                        value={schemeForm.ls_status}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({ ...previous, ls_status: event.target.value }))
                        }
                      >
                        {SCHEME_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-company">Company</Label>
                      <Input
                        id="scheme-company"
                        value={activeCompany?.compName ?? "Select Company from header"}
                        disabled
                      />
                      <FieldHelp>The loyalty page is scoped to the active company in the header.</FieldHelp>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-branch">Branch</Label>
                      <Select
                        id="scheme-branch"
                        value={schemeForm.ls_branch_id}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_branch_id: event.target.value,
                          }))
                        }
                      >
                        {branchOptions.map((option) => (
                          <option key={option.value || "__all-branches"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-start-date">Start Date</Label>
                      <Input
                        id="scheme-start-date"
                        type="date"
                        value={schemeForm.ls_start_date}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_start_date: event.target.value,
                          }))
                        }
                        required
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-end-date">End Date</Label>
                      <Input
                        id="scheme-end-date"
                        type="date"
                        value={schemeForm.ls_end_date}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_end_date: event.target.value,
                          }))
                        }
                        required
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-valid-from">Valid From Time</Label>
                      <Input
                        id="scheme-valid-from"
                        type="time"
                        value={schemeForm.ls_valid_from_time}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_valid_from_time: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-valid-to">Valid To Time</Label>
                      <Input
                        id="scheme-valid-to"
                        type="time"
                        value={schemeForm.ls_valid_to_time}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_valid_to_time: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field className={styles.fieldSpan2}>
                      <Label htmlFor="scheme-weekdays">Valid Weekdays</Label>
                      <Input
                        id="scheme-weekdays"
                        value={schemeForm.ls_valid_weekdays}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_valid_weekdays: event.target.value,
                          }))
                        }
                        placeholder="MON,TUE,WED"
                      />
                    </Field>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionEyebrow}>Applicability</span>
                      <h3 className={styles.sectionTitle}>Calculation Rules</h3>
                    </div>
                    <Field>
                      <Label htmlFor="scheme-apply-on">Apply On</Label>
                      <Select
                        id="scheme-apply-on"
                        value={schemeForm.ls_apply_on}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_apply_on: event.target.value,
                          }))
                        }
                      >
                        {APPLY_ON_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-calc-on-amount">Amount Type</Label>
                      <Select
                        id="scheme-calc-on-amount"
                        value={schemeForm.ls_calc_on_amount_type}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_calc_on_amount_type: event.target.value,
                          }))
                        }
                      >
                        {AMOUNT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-bill-type">Bill Type</Label>
                      <Select
                        id="scheme-bill-type"
                        value={schemeForm.ls_bill_type}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_bill_type: event.target.value,
                          }))
                        }
                      >
                        {BILL_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-customer-type">Customer Scope</Label>
                      <Select
                        id="scheme-customer-type"
                        value={schemeForm.ls_cust_type}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_cust_type: event.target.value,
                          }))
                        }
                      >
                        {CUSTOMER_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-item-type">Item Scope</Label>
                      <Select
                        id="scheme-item-type"
                        value={schemeForm.ls_item_type}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_item_type: event.target.value,
                          }))
                        }
                      >
                        {ITEM_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-rounding-method">Rounding</Label>
                      <Select
                        id="scheme-rounding-method"
                        value={schemeForm.ls_rounding_method}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_rounding_method: event.target.value,
                          }))
                        }
                      >
                        {ROUNDING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionEyebrow}>Redemption</span>
                      <h3 className={styles.sectionTitle}>Points Settings</h3>
                    </div>
                    <Field>
                      <Label htmlFor="scheme-redeem-value">Value Per Point</Label>
                      <Input
                        id="scheme-redeem-value"
                        type="number"
                        min="0"
                        step="0.001"
                        value={schemeForm.ls_redeem_value_per_point}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_redeem_value_per_point: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-min-redeem-points">Min Redeem Points</Label>
                      <Input
                        id="scheme-min-redeem-points"
                        type="number"
                        min="0"
                        step="0.001"
                        value={schemeForm.ls_min_redeem_points}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_min_redeem_points: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-max-redeem-points">Max Points Per Bill</Label>
                      <Input
                        id="scheme-max-redeem-points"
                        type="number"
                        min="0"
                        step="0.001"
                        value={schemeForm.ls_max_redeem_points_per_bill}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_max_redeem_points_per_bill: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-max-redeem-percent">Max % Per Bill</Label>
                      <Input
                        id="scheme-max-redeem-percent"
                        type="number"
                        min="0"
                        step="0.001"
                        value={schemeForm.ls_max_redeem_percent_per_bill}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_max_redeem_percent_per_bill: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-redeem-min-bill">Min Bill Amount</Label>
                      <Input
                        id="scheme-redeem-min-bill"
                        type="number"
                        min="0"
                        step="0.001"
                        value={schemeForm.ls_redeem_min_bill_amount}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_redeem_min_bill_amount: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-valid-days">Points Valid Days</Label>
                      <Input
                        id="scheme-valid-days"
                        type="number"
                        min="0"
                        step="1"
                        value={schemeForm.ls_points_valid_days}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_points_valid_days: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label htmlFor="scheme-expiry-basis">Expiry Basis</Label>
                      <Select
                        id="scheme-expiry-basis"
                        value={schemeForm.ls_expiry_basis}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_expiry_basis: event.target.value,
                          }))
                        }
                      >
                        {EXPIRY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field className={styles.fieldSpan3}>
                      <Label htmlFor="scheme-remarks">Remarks</Label>
                      <Textarea
                        id="scheme-remarks"
                        rows={3}
                        value={schemeForm.ls_remarks}
                        onChange={(event) =>
                          setSchemeForm((previous) => ({
                            ...previous,
                            ls_remarks: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <div className={styles.checkboxGrid}>
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={schemeForm.ls_auto_apply}
                          onChange={(event) =>
                            setSchemeForm((previous) => ({
                              ...previous,
                              ls_auto_apply: event.target.checked,
                            }))
                          }
                        />
                        Auto Apply
                      </label>
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={schemeForm.ls_include_tax_for_points}
                          onChange={(event) =>
                            setSchemeForm((previous) => ({
                              ...previous,
                              ls_include_tax_for_points: event.target.checked,
                            }))
                          }
                        />
                        Include Tax
                      </label>
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={schemeForm.ls_recur_apl}
                          onChange={(event) =>
                            setSchemeForm((previous) => ({
                              ...previous,
                              ls_recur_apl: event.target.checked,
                            }))
                          }
                        />
                        Recur Apply
                      </label>
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={schemeForm.ls_bal_apl}
                          onChange={(event) =>
                            setSchemeForm((previous) => ({
                              ...previous,
                              ls_bal_apl: event.target.checked,
                            }))
                          }
                        />
                        Balance Apply
                      </label>
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={schemeForm.ls_allow_point_redeem}
                          onChange={(event) =>
                            setSchemeForm((previous) => ({
                              ...previous,
                              ls_allow_point_redeem: event.target.checked,
                            }))
                          }
                        />
                        Allow Point Redeem
                      </label>
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={schemeForm.ls_allow_gift_redeem}
                          onChange={(event) =>
                            setSchemeForm((previous) => ({
                              ...previous,
                              ls_allow_gift_redeem: event.target.checked,
                            }))
                          }
                        />
                        Allow Gift Redeem
                      </label>
                      <label className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={schemeForm.ls_is_active}
                          onChange={(event) =>
                            setSchemeForm((previous) => ({
                              ...previous,
                              ls_is_active: event.target.checked,
                            }))
                          }
                        />
                        Active
                      </label>
                    </div>
                  </div>
                  <div className={styles.modalFooter}>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => resetSchemeEditor(selectedBranchId)}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={schemeSaving || !selectedCompanyId.trim()}
                    >
                      <FiSave aria-hidden="true" />
                      {schemeSaving ? "Saving..." : schemeForm.ls_id ? "Update Scheme" : "Save Scheme"}
                    </Button>
                  </div>
                </form>
              ) : null}
              {activeTab === "points" ? (
                <div className={styles.modalPanel}>
                  <Alert kind="info" title="Draft point rules">
                    {canSaveChildRows
                      ? "You can save point rows individually, or save the scheme to persist every draft row together."
                      : "Add point rows while creating the scheme. They will be saved automatically after the scheme header is created."}
                  </Alert>
                  <div className={styles.inlineActions}>
                    <Button variant="primary" type="button" onClick={addPointRow}>
                      <FiPlus aria-hidden="true" />
                      Add Point Row
                    </Button>
                  </div>
                  <div className={styles.tableEditorWrap}>
                    <table className={styles.editorTable}>
                      <thead>
                        <tr>
                          <th>Sl No</th>
                          <th>Item</th>
                          <th>Unit</th>
                          <th>Exceeds</th>
                          <th>Each</th>
                          <th>Factor</th>
                          <th>Points</th>
                          <th>Notes</th>
                          <th>Active</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pointRows.length === 0 ? (
                          <tr>
                            <td colSpan={10} className={styles.emptyRow}>
                              No point rows. Click “Add Point Row”.
                            </td>
                          </tr>
                        ) : (
                          pointRows.map((row) => (
                            <tr key={row._rowKey}>
                                  <td>
                                    <Input
                                      value={row.lspt_slno}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_slno: event.target.value })
                                      }
                                      type="number"
                                      min="1"
                                      step="1"
                                    />
                                  </td>
                                  <td>
                                    <Select
                                      value={row.lspt_item_id}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_item_id: event.target.value })
                                      }
                                    >
                                      {itemOptionsForPoint.map((option) => (
                                        <option key={option.value || "__all-items"} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </td>
                                  <td>
                                    <Select
                                      value={row.lspt_unit_id}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_unit_id: event.target.value })
                                      }
                                    >
                                      {unitOptionsForPoint.map((option) => (
                                        <option key={option.value || "__any-unit"} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lspt_exceeds}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_exceeds: event.target.value })
                                      }
                                      type="number"
                                      min="0"
                                      step="0.001"
                                    />
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lspt_each}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_each: event.target.value })
                                      }
                                      type="number"
                                      min="0.001"
                                      step="0.001"
                                    />
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lspt_factor}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_factor: event.target.value })
                                      }
                                      type="number"
                                      min="0.001"
                                      step="0.001"
                                    />
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lspt_points}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_points: event.target.value })
                                      }
                                      type="number"
                                      min="0"
                                      step="0.001"
                                    />
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lspt_notes}
                                      onChange={(event) =>
                                        updatePointRow(row._rowKey, { lspt_notes: event.target.value })
                                      }
                                      placeholder="Notes"
                                    />
                                  </td>
                                  <td>
                                    <label className={styles.tableCheck}>
                                      <input
                                        type="checkbox"
                                        checked={row.lspt_is_active}
                                        onChange={(event) =>
                                          updatePointRow(row._rowKey, {
                                            lspt_is_active: event.target.checked,
                                          })
                                        }
                                      />
                                      <span>{row.lspt_is_active ? "Yes" : "No"}</span>
                                    </label>
                                  </td>
                                  <td>
                                    <div className={styles.rowActions}>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="primary"
                                        onClick={() => {
                                          void savePointRow(row._rowKey);
                                        }}
                                        disabled={row._saving || !canSaveChildRows}
                                      >
                                        {row._saving
                                          ? "Saving..."
                                          : canSaveChildRows
                                            ? "Save"
                                            : "Save Scheme First"}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => cancelPointRow(row._rowKey)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          if (!row.lspt_id) {
                                            setPointRows((previous) =>
                                              previous.filter((item) => item._rowKey !== row._rowKey),
                                            );
                                            return;
                                          }
                                          setDeleteDialog({
                                            kind: "point",
                                            id: row.lspt_id,
                                            label: `Point Rule ${row.lspt_slno || ""}`.trim(),
                                          });
                                        }}
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {activeTab === "gifts" ? (
                <div className={styles.modalPanel}>
                  <Alert kind="info" title="Draft gift rules">
                    {canSaveChildRows
                      ? "You can save gift rows individually, or save the scheme to persist every draft row together."
                      : "Add gift rows while creating the scheme. They will be saved automatically after the scheme header is created."}
                  </Alert>
                  <div className={styles.inlineActions}>
                    <Button variant="primary" type="button" onClick={addGiftRow}>
                      <FiPlus aria-hidden="true" />
                      Add Gift Row
                    </Button>
                  </div>
                  <div className={styles.tableEditorWrap}>
                    <table className={styles.editorTable}>
                      <thead>
                        <tr>
                          <th>Sl No</th>
                          <th>Item</th>
                          <th>Unit</th>
                          <th>Qty</th>
                          <th>Redeem Points</th>
                          <th>Notes</th>
                          <th>Repeat</th>
                          <th>Active</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {giftRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className={styles.emptyRow}>
                              No gift rows. Click “Add Gift Row”.
                            </td>
                          </tr>
                        ) : (
                          giftRows.map((row) => (
                            <tr key={row._rowKey}>
                                  <td>
                                    <Input
                                      value={row.lsg_slno}
                                      onChange={(event) =>
                                        updateGiftRow(row._rowKey, { lsg_slno: event.target.value })
                                      }
                                      type="number"
                                      min="1"
                                      step="1"
                                    />
                                  </td>
                                  <td>
                                    <Select
                                      value={row.lsg_item_id}
                                      onChange={(event) =>
                                        updateGiftRow(row._rowKey, { lsg_item_id: event.target.value })
                                      }
                                    >
                                      {itemOptionsForGift.map((option) => (
                                        <option key={option.value || "__gift-item"} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </td>
                                  <td>
                                    <Select
                                      value={row.lsg_unit_id}
                                      onChange={(event) =>
                                        updateGiftRow(row._rowKey, { lsg_unit_id: event.target.value })
                                      }
                                    >
                                      {unitOptionsForGift.map((option) => (
                                        <option key={option.value || "__gift-unit"} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lsg_item_qty}
                                      onChange={(event) =>
                                        updateGiftRow(row._rowKey, { lsg_item_qty: event.target.value })
                                      }
                                      type="number"
                                      min="0.001"
                                      step="0.001"
                                    />
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lsg_redeem_points}
                                      onChange={(event) =>
                                        updateGiftRow(row._rowKey, { lsg_redeem_points: event.target.value })
                                      }
                                      type="number"
                                      min="0"
                                      step="0.001"
                                    />
                                  </td>
                                  <td>
                                    <Input
                                      value={row.lsg_notes}
                                      onChange={(event) =>
                                        updateGiftRow(row._rowKey, { lsg_notes: event.target.value })
                                      }
                                      placeholder="Notes"
                                    />
                                  </td>
                                  <td>
                                    <label className={styles.tableCheck}>
                                      <input
                                        type="checkbox"
                                        checked={row.lsg_repeat}
                                        onChange={(event) =>
                                          updateGiftRow(row._rowKey, { lsg_repeat: event.target.checked })
                                        }
                                      />
                                      <span>{row.lsg_repeat ? "Yes" : "No"}</span>
                                    </label>
                                  </td>
                                  <td>
                                    <label className={styles.tableCheck}>
                                      <input
                                        type="checkbox"
                                        checked={row.lsg_is_active}
                                        onChange={(event) =>
                                          updateGiftRow(row._rowKey, { lsg_is_active: event.target.checked })
                                        }
                                      />
                                      <span>{row.lsg_is_active ? "Yes" : "No"}</span>
                                    </label>
                                  </td>
                                  <td>
                                    <div className={styles.rowActions}>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="primary"
                                        onClick={() => {
                                          void saveGiftRow(row._rowKey);
                                        }}
                                        disabled={
                                          row._saving ||
                                          !canSaveChildRows ||
                                          !row.lsg_item_id.trim() ||
                                          !row.lsg_unit_id.trim()
                                        }
                                      >
                                        {row._saving
                                          ? "Saving..."
                                          : canSaveChildRows
                                            ? "Save"
                                            : "Save Scheme First"}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => cancelGiftRow(row._rowKey)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          if (!row.lsg_id) {
                                            setGiftRows((previous) =>
                                              previous.filter((item) => item._rowKey !== row._rowKey),
                                            );
                                            return;
                                          }
                                          setDeleteDialog({
                                            kind: "gift",
                                            id: row.lsg_id,
                                            label: `Gift Rule ${row.lsg_slno || ""}`.trim(),
                                          });
                                        }}
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {activeTab === "party" ? (
                <div className={styles.modalPanel}>
                  <Alert kind="info" title="Party scope saves with scheme">
                    Add or edit party scope rows here, then save the scheme header to persist the
                    latest party scope payload.
                  </Alert>
                  <div className={styles.tableResponsive}>
                    <ReusableTable<EditablePartyRow>
                      columns={partyColumns}
                      rows={partyRows}
                      rowKey="_rowKey"
                      emptyText="No party scope rows. Click Add Party Row."
                      title="Party Scope Rows"
                      onCreate={addPartyRow}
                      createLabel="Add Party Row"
                      onDelete={(row) => {
                        setPartyRows((previous) =>
                          previous.filter((item) => item._rowKey !== row._rowKey),
                        );
                      }}
                      deleteLabel="Remove Row"
                      tableMaxHeight="320px"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          </div>,
          document.body,
        )
        : null}
      <DeleteConfirmModal
        isOpen={Boolean(deleteDialog)}
        itemName={deleteDialog?.label}
        loading={deleteLoading}
        onCancel={() => setDeleteDialog(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
      {(detailLoading || schemeSaving) && selectedScheme ? (
        <div className={styles.inlineStatusBar}>
          <span>{detailLoading ? "Loading scheme details..." : "Saving scheme..."}</span>
        </div>
      ) : null}
    </main>
  );
}
