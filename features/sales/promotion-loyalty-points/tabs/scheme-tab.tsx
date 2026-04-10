"use client";
import type { Dispatch, SetStateAction } from "react";
import { useRef, useState } from "react";
import {
  Alert,
  Field,
  FieldError,
  Input,
  Label,
  SearchableMultiSelect,
  SearchableSelect,
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
  SCHEME_TYPE_OPTIONS,
  WEEKDAY_OPTIONS,
} from "../promotion-loyalty-points.constant";
import type { SchemeFormState } from "../promotion-loyalty-points.local-types";
import {
  formatDateForDisplay,
  isValidDateValue,
  toDateInputValue,
} from "../promotion-loyalty-points.utils";
function parseWeekdayValues(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
function formatDateEntry(value: string): string {
  if (value.includes("-")) {
    return value;
  }
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
type SchemeTabProps = {
  schemeForm: SchemeFormState;
  setSchemeForm: Dispatch<SetStateAction<SchemeFormState>>;
  onItemTypeChange: (value: string) => void;
  companyOptions: ERPDynamicSelectOption[];
  onCompanyChange: (value: string) => void;
  branchOptions: ERPDynamicSelectOption[];
  detailError: string | null;
  showValidationErrors: boolean;
};
export function SchemeTab({
  schemeForm,
  setSchemeForm,
  onItemTypeChange,
  companyOptions,
  onCompanyChange,
  branchOptions,
  detailError,
  showValidationErrors,
}: SchemeTabProps) {
  const weekdayValues = parseWeekdayValues(schemeForm.ls_valid_weekdays);
  const startDatePickerRef = useRef<HTMLInputElement | null>(null);
  const endDatePickerRef = useRef<HTMLInputElement | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const schemeNameError =
    showValidationErrors && !schemeForm.ls_name.trim() ? "Scheme Name is required" : "";
  const startDateError = !showValidationErrors
    ? ""
    : !schemeForm.ls_start_date.trim()
      ? "Start Date is required"
      : errors.ls_start_date || "";
  const endDateError = !showValidationErrors
    ? ""
    : !schemeForm.ls_end_date.trim()
      ? "End Date is required"
      : errors.ls_end_date || "";
  const isSchemeNameInvalid = Boolean(schemeNameError);
  const isStartDateInvalid = Boolean(startDateError);
  const isEndDateInvalid = Boolean(endDateError);
  const handleFieldChange = (field: string, value: string) => {
    setSchemeForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };
  const handleDateFieldChange = (field: "ls_start_date" | "ls_end_date", value: string) => {
    const displayValue = formatDateEntry(value);
    const nextValue = toDateInputValue(displayValue);
    setSchemeForm((p) => ({ ...p, [field]: nextValue }));
    setErrors((prev) => ({
      ...prev,
      [field]:
        displayValue.trim().length === 10 && !isValidDateValue(nextValue)
          ? "Use dd/mm/yyyy"
          : "",
    }));
  };
  const openDatePicker = (input: HTMLInputElement | null) => {
    if (!input) {
      return;
    }
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }
    input.focus();
    input.click();
  };
  return (
    <div
      className="grid gap-3"
      id="loyalty-editor-panel-scheme"
      role="tabpanel"
      aria-labelledby="loyalty-editor-tab-scheme"
    >
      {detailError ? (
        <Alert kind="danger" title="Unable to load scheme details">
          {detailError}
        </Alert>
      ) : null}
      <div className="grid gap-2.5 form">
        {/* Row 1: Scheme Name, Scheme Code, Scheme Type */}
        <div className="grid grid-cols-3 gap-2.5">
          <Field>
            <Label htmlFor="scheme-name" className={dynamicFormStyles.label}>Scheme Name <span className="text-red-500">*</span></Label>
            <Input
              id="scheme-name"
              className={`${dynamicFormStyles.control} ${
                isSchemeNameInvalid ? dynamicFormStyles.controlInvalid : ""
              }`}
              value={schemeForm.ls_name}
              aria-invalid={isSchemeNameInvalid ? true : undefined}
              onChange={(e) => handleFieldChange("ls_name", e.target.value)}
            />
            {schemeNameError ? <FieldError>{schemeNameError}</FieldError> : null}
          </Field>
          <Field>
            <Label htmlFor="scheme-code" className={dynamicFormStyles.label}>Scheme Code</Label>
            <Input
              id="scheme-code"
              className={dynamicFormStyles.control}
              value={schemeForm.ls_code}
              onChange={(e) => setSchemeForm((p) => ({ ...p, ls_code: e.target.value }))}
            />
          </Field>
          <Field>
            <Label htmlFor="scheme-type" className={dynamicFormStyles.label}>Scheme Type</Label>
            <SearchableSelect
              id="scheme-type"
              value={schemeForm.ls_type}
              options={SCHEME_TYPE_OPTIONS}
              onChange={(value) => setSchemeForm((p) => ({ ...p, ls_type: value }))}
              searchPlaceholder="Search scheme type"
            />
          </Field>
        </div>
        {/* Row 2: Start Date, End Date, Valid From Time, Valid To Time */}
        <div className="grid grid-cols-4 gap-2.5">
          <Field>
            <Label htmlFor="scheme-start-date" className={dynamicFormStyles.label}>Start Date <span className="text-red-500">*</span></Label>
            <div className="relative">
              <Input
                id="scheme-start-date"
                className={`${dynamicFormStyles.control} pr-10 ${
                  isStartDateInvalid ? dynamicFormStyles.controlInvalid : ""
                }`}
                type="text"
                inputMode="numeric"
                value={formatDateForDisplay(schemeForm.ls_start_date)}
                aria-invalid={isStartDateInvalid ? true : undefined}
                onChange={(e) => handleDateFieldChange("ls_start_date", e.target.value)}
                placeholder="dd/mm/yyyy"
                maxLength={10}
                pattern="\d{2}/\d{2}/\d{4}"
              />
              <input
                ref={startDatePickerRef}
                type="date"
                value={schemeForm.ls_start_date}
                onChange={(e) => handleDateFieldChange("ls_start_date", e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500"
                onClick={() => openDatePicker(startDatePickerRef.current)}
                aria-label="Open start date calendar"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M6 2.75v1.5M14 2.75v1.5M3.75 6.25h12.5M5.25 4.25h9.5A1.5 1.5 0 0 1 16.25 5.75v8.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {startDateError ? <FieldError>{startDateError}</FieldError> : null}
          </Field>
          <Field>
            <Label htmlFor="scheme-end-date" className={dynamicFormStyles.label}>End Date <span className="text-red-500">*</span></Label>
            <div className="relative">
              <Input
                id="scheme-end-date"
                className={`${dynamicFormStyles.control} pr-10 ${
                  isEndDateInvalid ? dynamicFormStyles.controlInvalid : ""
                }`}
                type="text"
                inputMode="numeric"
                value={formatDateForDisplay(schemeForm.ls_end_date)}
                aria-invalid={isEndDateInvalid ? true : undefined}
                onChange={(e) => handleDateFieldChange("ls_end_date", e.target.value)}
                placeholder="dd/mm/yyyy"
                maxLength={10}
                pattern="\d{2}/\d{2}/\d{4}"
              />
              <input
                ref={endDatePickerRef}
                type="date"
                value={schemeForm.ls_end_date}
                onChange={(e) => handleDateFieldChange("ls_end_date", e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500"
                onClick={() => openDatePicker(endDatePickerRef.current)}
                aria-label="Open end date calendar"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M6 2.75v1.5M14 2.75v1.5M3.75 6.25h12.5M5.25 4.25h9.5A1.5 1.5 0 0 1 16.25 5.75v8.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {endDateError ? <FieldError>{endDateError}</FieldError> : null}
          </Field>
          <Field>
            <Label htmlFor="scheme-valid-from" className={dynamicFormStyles.label}>Valid From Time</Label>
            <Input
              id="scheme-valid-from"
              className={dynamicFormStyles.control}
              type="time"
              value={schemeForm.ls_valid_from_time}
              onChange={(e) => setSchemeForm((p) => ({ ...p, ls_valid_from_time: e.target.value }))}
            />
          </Field>
          <Field>
            <Label htmlFor="scheme-valid-to" className={dynamicFormStyles.label}>Valid To Time</Label>
            <Input
              id="scheme-valid-to"
              className={dynamicFormStyles.control}
              type="time"
              value={schemeForm.ls_valid_to_time}
              onChange={(e) => setSchemeForm((p) => ({ ...p, ls_valid_to_time: e.target.value }))}
            />
          </Field>
        </div>
        {/* Row 3: Valid Weekdays, Company, Branch */}
        <div className="grid grid-cols-3 gap-2.5">
          <Field>
            <Label htmlFor="scheme-weekdays" className={dynamicFormStyles.label}>Valid Weekdays</Label>
            <SearchableMultiSelect
              id="scheme-weekdays"
              values={weekdayValues}
              options={WEEKDAY_OPTIONS}
              onChange={(values) =>
                setSchemeForm((p) => ({ ...p, ls_valid_weekdays: values.join(",") }))
              }          
              searchPlaceholder="Select Days"
            />
          </Field>
          <Field>
            <Label htmlFor="scheme-company" className={dynamicFormStyles.label}>Company</Label>
            <SearchableSelect
              id="scheme-company"
              value={schemeForm.ls_comp_id}
              options={companyOptions}
              onChange={onCompanyChange}
            />
          </Field>
          <Field>
            <Label htmlFor="scheme-branch" className={dynamicFormStyles.label}>Branch</Label>
            <SearchableSelect
              id="scheme-branch"
              value={schemeForm.ls_branch_id}
              options={branchOptions}
              onChange={(value) => setSchemeForm((p) => ({ ...p, ls_branch_id: value }))}
            />
          </Field>
        </div>
        {/* ── Calculation Rules ─────────────────────────────────────── */}
        <div className="grid gap-1  pt-2">
          <span className="text-eyebrow text-erp-teal uppercase">Applicability</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
                <Field>
          <Label htmlFor="scheme-apply-on" className={dynamicFormStyles.label}>Apply On</Label>
          <SearchableSelect
            id="scheme-apply-on"
            value={schemeForm.ls_apply_on}
            options={APPLY_ON_OPTIONS}
            onChange={(value) => setSchemeForm((p) => ({ ...p, ls_apply_on: value }))}
            searchPlaceholder="Search apply on"
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-calc-on-amount" className={dynamicFormStyles.label}>Amount Type</Label>
          <SearchableSelect
            id="scheme-calc-on-amount"
            value={schemeForm.ls_calc_on_amount_type}
            options={AMOUNT_TYPE_OPTIONS}
            onChange={(value) => setSchemeForm((p) => ({ ...p, ls_calc_on_amount_type: value }))}
            searchPlaceholder="Search amount type"
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-bill-type" className={dynamicFormStyles.label}>Bill Type</Label>
          <SearchableSelect
            id="scheme-bill-type"
            value={schemeForm.ls_bill_type}
            options={BILL_TYPE_OPTIONS}
            onChange={(value) => setSchemeForm((p) => ({ ...p, ls_bill_type: value }))}
            searchPlaceholder="Search bill type"
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-customer-type" className={dynamicFormStyles.label}>Customer Scope</Label>
          <SearchableSelect
            id="scheme-customer-type"
            value={schemeForm.ls_cust_type}
            options={CUSTOMER_TYPE_OPTIONS}
            onChange={(value) => setSchemeForm((p) => ({ ...p, ls_cust_type: value }))}
            searchPlaceholder="Search customer scope"
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-item-type" className={dynamicFormStyles.label}>Item Scope</Label>
          <SearchableSelect
            id="scheme-item-type"
            value={schemeForm.ls_item_type}
            options={ITEM_TYPE_OPTIONS}
            onChange={onItemTypeChange}
            searchPlaceholder="Search item scope"
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-rounding-method" className={dynamicFormStyles.label}>Rounding</Label>
          <SearchableSelect
            id="scheme-rounding-method"
            value={schemeForm.ls_rounding_method}
            options={ROUNDING_OPTIONS}
            onChange={(value) => setSchemeForm((p) => ({ ...p, ls_rounding_method: value }))}
            searchPlaceholder="Search rounding"
          />
        </Field></div>
        {/* ── Points Settings ───────────────────────────────────────── */}
        <div className="grid gap-1 col-span-full pt-2">
          <span className="text-eyebrow text-erp-teal uppercase">Redemption</span>
        </div>
          <div className="grid grid-cols-4 gap-2.5"><Field>
          <Label htmlFor="scheme-redeem-value" className={dynamicFormStyles.label}>Value Per Point</Label>
          <Input
            id="scheme-redeem-value"
            className={dynamicFormStyles.control}
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_redeem_value_per_point}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_redeem_value_per_point: e.target.value }))}
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-min-redeem-points" className={dynamicFormStyles.label}>Min Redeem Points</Label>
          <Input
            id="scheme-min-redeem-points"
            className={dynamicFormStyles.control}
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_min_redeem_points}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_min_redeem_points: e.target.value }))}
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-max-redeem-points" className={dynamicFormStyles.label}>Max Points Per Bill</Label>
          <Input
            id="scheme-max-redeem-points"
            className={dynamicFormStyles.control}
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_max_redeem_points_per_bill}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_max_redeem_points_per_bill: e.target.value }))}
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-max-redeem-percent" className={dynamicFormStyles.label}>Max % Per Bill</Label>
          <Input
            id="scheme-max-redeem-percent"
            className={dynamicFormStyles.control}
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_max_redeem_percent_per_bill}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_max_redeem_percent_per_bill: e.target.value }))}
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-redeem-min-bill" className={dynamicFormStyles.label}>Min Bill Amount</Label>
          <Input
            id="scheme-redeem-min-bill"
            className={dynamicFormStyles.control}
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_redeem_min_bill_amount}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_redeem_min_bill_amount: e.target.value }))}
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-valid-days" className={dynamicFormStyles.label}>Points Valid Days</Label>
          <Input
            id="scheme-valid-days"
            className={dynamicFormStyles.control}
            type="text"
            inputMode="decimal"
            value={schemeForm.ls_points_valid_days}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_points_valid_days: e.target.value }))}
          />
        </Field>
        <Field>
          <Label htmlFor="scheme-expiry-basis" className={dynamicFormStyles.label}>Expiry Basis</Label>
          <SearchableSelect
            id="scheme-expiry-basis"
            value={schemeForm.ls_expiry_basis}
            options={EXPIRY_OPTIONS}
            onChange={(value) => setSchemeForm((p) => ({ ...p, ls_expiry_basis: value }))}
            searchPlaceholder="Search expiry basis"
          />
        </Field>
        <Field className="col-span-full">
          <Label htmlFor="scheme-remarks" className={dynamicFormStyles.label}>Remarks</Label>
          <Input
            id="scheme-remarks"
            className={dynamicFormStyles.control}
            value={schemeForm.ls_remarks}
            onChange={(e) => setSchemeForm((p) => ({ ...p, ls_remarks: e.target.value }))}
          />
        </Field></div>
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
    </div>
  );
}
