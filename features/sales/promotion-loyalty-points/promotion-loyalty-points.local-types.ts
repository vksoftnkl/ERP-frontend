import type { LoyaltyPartyPayload } from "./promotion-loyalty-points.types";

export type SchemeFormState = {
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

export type PointFormState = {
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

export type GiftFormState = {
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

export type EditablePointRow = PointFormState & {
  _rowKey: string;
  _saving?: boolean;
  _isNew?: boolean;
};

export type EditableGiftRow = GiftFormState & {
  _rowKey: string;
  _saving?: boolean;
  _isNew?: boolean;
};

export type EditablePartyRow = LoyaltyPartyPayload & {
  _rowKey: string;
};

export type DeleteDialogState =
  | { kind: "scheme"; id: string; label: string }
  | { kind: "point"; id: string; rowKey: string; label: string }
  | { kind: "gift"; id: string; rowKey: string; label: string }
  | { kind: "party"; rowKey: string; label: string }
  | null;

export type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";
export type EditorTab = "scheme" | "points" | "gifts" | "party";
export type PartyScopeType = "CUSTOMER_GROUP" | "CUSTOMER";

export type PointScopeDescriptor = {
  headerLabel: string;
  options: import("@/components/design-system/ui").ERPDynamicSelectOption[];
  defaultOption: import("@/components/design-system/ui").ERPDynamicSelectOption;
};

export type LookupConfig = {
  arrayKeys: readonly string[];
  idKeys: readonly string[];
  labelKeys: readonly string[];
};

export const EDITOR_TABS: ReadonlyArray<{ key: EditorTab; label: string }> = [
  { key: "scheme", label: "Scheme" },
  { key: "points", label: "Points" },
  { key: "gifts", label: "Gifts" },
  { key: "party", label: "Party Scope" },
];