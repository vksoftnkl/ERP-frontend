"use client";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  Alert,
  Button,
  Field,
  Input,
  Label,
  Select,
} from "@/components/library/ui";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import {
  APPLY_ON_OPTIONS,
  AMOUNT_TYPE_OPTIONS,
  BILL_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  EXPIRY_OPTIONS,
  ITEM_TYPE_OPTIONS,
  ROUNDING_OPTIONS,
  SCHEME_STATUS_OPTIONS,
  SCHEME_TYPE_OPTIONS,
} from "../promotion-loyalty-points.constant";
import type { SchemeFormState } from "../promotion-loyalty-points.local-types";

type SchemeTabProps = {
  schemeForm: SchemeFormState;
  setSchemeForm: Dispatch<SetStateAction<SchemeFormState>>;
  activeCompanyName: string | undefined;
  branchOptions: ERPDynamicSelectOption[];
  detailError: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function SchemeTab({
  schemeForm,
  setSchemeForm,
  activeCompanyName,
  branchOptions,
  detailError,
  onSubmit,
}: SchemeTabProps) {
  return (
    <form
      className="grid gap-[18px]"
      onSubmit={onSubmit}
      id="loyalty-editor-panel-scheme"
      role="tabpanel"
      aria-labelledby="loyalty-editor-tab-scheme"
    >
      {detailError ? (
        <Alert kind="danger" title="Unable to load scheme details">
          {detailError}
        </Alert>
      ) : null}

      <div className="grid grid-cols-4 gap-4 form">
        {/* ── Definition ────────────────────────────────────────────── */}
        <div className="grid gap-1 col-span-full pt-2">
          <span className="text-eyebrow text-erp-teal uppercase">Scheme Header</span>
          <h3 className="m-0 text-section-title font-bold text-erp-slate">Definition</h3>
        </div>

        <Field>
          <Label htmlFor="scheme-code">Scheme Code</Label>
          <Input
            id="scheme-code"
            value={schemeForm.ls_code}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_code: e.target.value }))}
            placeholder="Optional code"
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-name">Scheme Name</Label>
          <Input
            id="scheme-name"
            value={schemeForm.ls_name}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_name: e.target.value }))}
            placeholder="Summer Rewards"
            required
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-type">Scheme Type</Label>
          <Select
            id="scheme-type"
            value={schemeForm.ls_type}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_type: e.target.value }))}
          >
            {SCHEME_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-status">Status</Label>
          <Select
            id="scheme-status"
            value={schemeForm.ls_status}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_status: e.target.value }))}
          >
            {SCHEME_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-company">Company</Label>
          <Input
            id="scheme-company"
            value={activeCompanyName ?? "Select Company from header"}
            disabled
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-branch">Branch</Label>
          <Select
            id="scheme-branch"
            value={schemeForm.ls_branch_id}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_branch_id: e.target.value }))}
          >
            {branchOptions.map((o) => (
              <option key={o.value || "__all-branches"} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-start-date">Start Date</Label>
          <Input
            id="scheme-start-date"
            type="date"
            value={schemeForm.ls_start_date}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_start_date: e.target.value }))}
            required
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-end-date">End Date</Label>
          <Input
            id="scheme-end-date"
            type="date"
            value={schemeForm.ls_end_date}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_end_date: e.target.value }))}
            required
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-valid-from">Valid From Time</Label>
          <Input
            id="scheme-valid-from"
            type="time"
            value={schemeForm.ls_valid_from_time}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_valid_from_time: e.target.value }))}
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-valid-to">Valid To Time</Label>
          <Input
            id="scheme-valid-to"
            type="time"
            value={schemeForm.ls_valid_to_time}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_valid_to_time: e.target.value }))}
          />
        </Field>

        <Field className="col-span-2">
          <Label htmlFor="scheme-weekdays">Valid Weekdays</Label>
          <Input
            id="scheme-weekdays"
            value={schemeForm.ls_valid_weekdays}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_valid_weekdays: e.target.value }))}
            placeholder="MON,TUE,WED"
          />
        </Field>

        {/* ── Calculation Rules ─────────────────────────────────────── */}
        <div className="grid gap-1 col-span-full pt-2">
          <span className="text-eyebrow text-erp-teal uppercase">Applicability</span>
          <h3 className="m-0 text-section-title font-bold text-erp-slate">Calculation Rules</h3>
        </div>

        <Field>
          <Label htmlFor="scheme-apply-on">Apply On</Label>
          <Select
            id="scheme-apply-on"
            value={schemeForm.ls_apply_on}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_apply_on: e.target.value }))}
          >
            {APPLY_ON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-calc-on-amount">Amount Type</Label>
          <Select
            id="scheme-calc-on-amount"
            value={schemeForm.ls_calc_on_amount_type}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_calc_on_amount_type: e.target.value }))}
          >
            {AMOUNT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-bill-type">Bill Type</Label>
          <Select
            id="scheme-bill-type"
            value={schemeForm.ls_bill_type}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_bill_type: e.target.value }))}
          >
            {BILL_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-customer-type">Customer Scope</Label>
          <Select
            id="scheme-customer-type"
            value={schemeForm.ls_cust_type}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_cust_type: e.target.value }))}
          >
            {CUSTOMER_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-item-type">Item Scope</Label>
          <Select
            id="scheme-item-type"
            value={schemeForm.ls_item_type}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_item_type: e.target.value }))}
          >
            {ITEM_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="scheme-rounding-method">Rounding</Label>
          <Select
            id="scheme-rounding-method"
            value={schemeForm.ls_rounding_method}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_rounding_method: e.target.value }))}
          >
            {ROUNDING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        {/* ── Points Settings ───────────────────────────────────────── */}
        <div className="grid gap-1 col-span-full pt-2">
          <span className="text-eyebrow text-erp-teal uppercase">Redemption</span>
          <h3 className="m-0 text-section-title font-bold text-erp-slate">Points Settings</h3>
        </div>

        <Field>
          <Label htmlFor="scheme-redeem-value">Value Per Point</Label>
          <Input
            id="scheme-redeem-value"
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_redeem_value_per_point}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_redeem_value_per_point: e.target.value }))}
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-min-redeem-points">Min Redeem Points</Label>
          <Input
            id="scheme-min-redeem-points"
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_min_redeem_points}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_min_redeem_points: e.target.value }))}
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-max-redeem-points">Max Points Per Bill</Label>
          <Input
            id="scheme-max-redeem-points"
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_max_redeem_points_per_bill}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_max_redeem_points_per_bill: e.target.value }))}
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-max-redeem-percent">Max % Per Bill</Label>
          <Input
            id="scheme-max-redeem-percent"
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_max_redeem_percent_per_bill}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_max_redeem_percent_per_bill: e.target.value }))}
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-redeem-min-bill">Min Bill Amount</Label>
          <Input
            id="scheme-redeem-min-bill"
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_redeem_min_bill_amount}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_redeem_min_bill_amount: e.target.value }))}
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-valid-days">Points Valid Days</Label>
          <Input
            id="scheme-valid-days"
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_points_valid_days}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_points_valid_days: e.target.value }))}
          />
        </Field>

        <Field>
          <Label htmlFor="scheme-expiry-basis">Expiry Basis</Label>
          <Select
            id="scheme-expiry-basis"
            value={schemeForm.ls_expiry_basis}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_expiry_basis: e.target.value }))}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field className="col-span-full">
          <Label htmlFor="scheme-remarks">Remarks</Label>
          <Input
            id="scheme-remarks"
            value={schemeForm.ls_remarks}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_remarks: e.target.value }))}
          />
        </Field>

        {/* ── Checkboxes ────────────────────────────────────────────── */}
        <div className="col-span-full grid grid-cols-4 gap-checkbox">
          {(
            [
              { key: "ls_auto_apply", label: "Auto Apply" },
              { key: "ls_include_tax_for_points", label: "Include Tax" },
              { key: "ls_recur_apl", label: "Recur Apply" },
              { key: "ls_bal_apl", label: "Balance Apply" },
              { key: "ls_allow_point_redeem", label: "Allow Point Redeem" },
              { key: "ls_allow_gift_redeem", label: "Allow Gift Redeem" },
              { key: "ls_is_active", label: "Active" },
            ] as { key: keyof SchemeFormState; label: string }[]
          ).map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2.5 p-[11px] px-3 rounded-field bg-[rgba(248,250,252,0.9)] text-erp-slate text-input font-medium"
            >
              <input
                className={dynamicFormStyles.checkboxControl}
                type="checkbox"
                checked={schemeForm[key] as boolean}
                onChange={(e) =>
                  setSchemeForm((p) => ({ ...p, [key]: e.target.checked }))
                }
              />
              <span className={dynamicFormStyles.checkboxLabel}>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </form>
  );
}