"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "react-toastify";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import {
  buildLookupOptions,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/features/masters/shared/normalizers";
import {
  buildSessionScopeOverride,
  CUSTOMER_FORM_DEFAULTS_SETTING_KEY,
  describeSessionScope,
  findEffectiveSettingValue,
  parseSettingObject,
  useSessionSettingContext,
  useSessionSettingQuery,
} from "@/features/masters/shared/form-defaults-setting";
import {
  parseCustomerFormDefaults,
  type CustomerTemplateDefaults,
} from "@/features/masters/sales/customer/customer-dropdowns";
import {
  useGetEffectiveSettingsQuery,
  useSaveAppSettingsMutation,
} from "@/store/api/appSettingsApi";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useApi } from "@/hooks/useApi";
// The customer template — what a new customer starts with — is the
// `masters.customer_form_defaults` SETTING, read and written through the app-settings
// catalog:
//  - GET  /app-setting-values/effective?companyId=&branchId=…  -> the value in force
//  - POST /app-setting-values/create  { data: [ … ] }          -> upsert on the target
// Both follow the session, and the write lands on the deepest layer it names (branch,
// else company, else global) — see form-defaults-setting.ts for why they must agree.
//
// The value is TEXT holding a JSON object keyed by the CUSTOMER FORM's own field names,
// typed as they are used (booleans as booleans, numbers as numbers), with a `*Name`
// companion beside each id so a lazy dropdown can show its label before it has loaded:
//   { "cusAreaId": "019f…", "cusAreaName": "MUSIRI", "cusCreditDays": 35, … }
// That shape is not this screen's invention — it is what already sits in the setting,
// written by the POS — so anything this screen does not render is carried through a
// save untouched rather than dropped.
// Price Level is the one non-configured dropdown; it loads eagerly from the shared
// master-lookup endpoint (same source the customer master uses).
const PRICE_LEVEL_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const PRICE_LEVEL_LOOKUP_QUERY = { module: "priceLevels" } as const;
// Resolve the label the user sees for a selected value so it can be persisted alongside
// the id (options always contain the picked/seeded option).
function resolveOptionLabel(options: ERPDynamicSelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? "";
}
// Settings -> Templates -> Customer Template.
// A single popup mirroring the customer master form. Company/Area/Customer Group/State
// are lazy, server-side searchable configured dropdowns (fixed.dropdown_details, fetched
// via /dropdown-details/run on open + on debounced search). The dropdown ids mirror the
// customer master: 8 = company (comp_id/comp_name), 10 = area (arm_id/arm_name),
// 28 = customer group (cgr_id/cgr_name), 9 = state (state_code/state_name). Every one of
// them is keyed by ID, like the customer form itself — the label is saved beside it.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: { value: "", label: "Select Company" } as ERPDynamicSelectOption,
} as const;
const AREA_DROPDOWN_CONFIG = {
  dropdownId: "10",
  idKeys: ["arm_id", "armId"] as const,
  labelKeys: ["arm_name", "armName"] as const,
  defaultOption: { value: "", label: "Select Area" } as ERPDynamicSelectOption,
} as const;
const CUSTOMER_GROUP_DROPDOWN_CONFIG = {
  dropdownId: "28",
  idKeys: ["cgr_id", "cgrId"] as const,
  labelKeys: ["cgr_name", "cgrName"] as const,
  defaultOption: { value: "", label: "Select Customer Group" } as ERPDynamicSelectOption,
} as const;
const STATE_DROPDOWN_CONFIG = {
  dropdownId: "9",
  idKeys: ["state_code", "stateCode"] as const,
  labelKeys: ["state_name", "stateName"] as const,
  defaultOption: { value: "", label: "Select State" } as ERPDynamicSelectOption,
} as const;
const DEFAULT_PRICE_LEVEL_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Price Level",
};
const GST_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "" },
  { value: "REGULAR", label: "Regular" },
  { value: "COMPOSITION", label: "Composition" },
  { value: "UNREGISTERED", label: "Unregistered" },
];
const TCS_TDS_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "" },
  { value: "TCS", label: "TCS" },
  { value: "TDS", label: "TDS" },
];
// Field names ARE the customer master's cus* keys, so a saved template maps straight
// onto the create form. Checkboxes default to "false"; numeric fields to "0".
const INITIAL_FORM_VALUES: Record<string, string> = {
  // Primary Information (saved as an id, with its label beside it).
  cusCompanyId: "",
  cusAreaId: "",
  cusGroupId: "",
  // Basic Information.
  cusGstNo: "",
  cusStateCode: "",
  cusName: "",
  cusGstType: "",
  cusShort: "",
  cusPanNo: "",
  cusDefaultSalesman: "",
  cusAadharNo: "",
  cusPriceLevelId: "",
  cusPhone1: "",
  cusAddr1: "",
  cusPhone2: "",
  cusCity: "",
  cusWhatsappNo: "",
  cusDistrict: "",
  cusTel: "",
  cusPin: "",
  cusEmail: "",
  cusDistanceKm: "0",
  cusLoyaltyCardNo: "",
  cusLandmark: "",
  cusItcollType: "TCS",
  cusCreditAllowed: "false",
  cusItcollExempted: "false",
  // Credit Setting.
  cusCreditDays: "0",
  cusCreditAmtLimit: "0",
  cusCreditBillLimit: "0",
  cusOverdueBilling: "false",
  // Bill Setting.
  cusSortOrder: "0",
  cusDiscPerc: "0",
  cusAllowDiscount: "false",
  cusLoadingCharge: "false",
  cusUnloadingCharge: "false",
  cusFreightCharge: "false",
  cusAllowLoyalty: "false",
  cusAllowPromotion: "false",
  cusEnableSms: "false",
};
const TEMPLATE_FIELD_NAMES = Object.keys(INITIAL_FORM_VALUES);
// The modal holds every value as a string; the setting stores each one as the JSON type
// the field actually is, because the POS reads it back as that type.
const TEMPLATE_BOOLEAN_FIELDS = new Set([
  "cusCreditAllowed",
  "cusItcollExempted",
  "cusOverdueBilling",
  "cusAllowDiscount",
  "cusLoadingCharge",
  "cusUnloadingCharge",
  "cusFreightCharge",
  "cusAllowLoyalty",
  "cusAllowPromotion",
  "cusEnableSms",
]);
const TEMPLATE_NUMBER_FIELDS = new Set([
  "cusDistanceKm",
  "cusCreditDays",
  "cusCreditAmtLimit",
  "cusCreditBillLimit",
  "cusSortOrder",
  "cusDiscPerc",
]);
function toSettingValue(name: string, raw: string): unknown {
  if (TEMPLATE_BOOLEAN_FIELDS.has(name)) {
    return raw === "true";
  }
  if (TEMPLATE_NUMBER_FIELDS.has(name)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return raw;
}
const CUSTOMER_TEMPLATE_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(72vw/var(--erp-ui-scale)), 72rem)",
  height: "calc(80vh/var(--erp-ui-scale))",
  maxHeight: "calc(80vh/var(--erp-ui-scale))",
};
// Each lazy field is wired to its own handler set so opening/typing fetches (and
// re-fetches) that dropdown independently.
function buildCustomerTemplateFields(
  companyOptions: ERPDynamicSelectOption[],
  companyHandlers: LazyDropdownHandlers,
  areaOptions: ERPDynamicSelectOption[],
  areaHandlers: LazyDropdownHandlers,
  groupOptions: ERPDynamicSelectOption[],
  groupHandlers: LazyDropdownHandlers,
  stateOptions: ERPDynamicSelectOption[],
  stateHandlers: LazyDropdownHandlers,
  priceLevelOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    // ---- Primary Information ---------------------------------------------------
    { name: "primaryHeading", label: "Primary Information", type: "heading" },
    {
      name: "cusCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: companyOptions,
      onSearchOpenChange: companyHandlers.onSearchOpenChange,
      onSearchQueryChange: companyHandlers.onSearchQueryChange,
      onValueChange: companyHandlers.onValueChange,
      validation: { requiredMessage: "Company is required." },
    },
    {
      name: "cusAreaId",
      label: "Area",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: areaOptions,
      onSearchOpenChange: areaHandlers.onSearchOpenChange,
      onSearchQueryChange: areaHandlers.onSearchQueryChange,
      onValueChange: areaHandlers.onValueChange,
      validation: { requiredMessage: "Area is required." },
    },
    {
      // The image labels this "Customer Type"; it is the Customer Group master (cgr).
      name: "cusGroupId",
      label: "Customer Group",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: groupOptions,
      onSearchOpenChange: groupHandlers.onSearchOpenChange,
      onSearchQueryChange: groupHandlers.onSearchQueryChange,
      onValueChange: groupHandlers.onValueChange,
      validation: { requiredMessage: "Customer Group is required." },
    },
    // ---- Basic Information (interleaved to mirror the two-column screen) --------
    { name: "basicHeading", label: "Basic Information", type: "heading" },
    {
      name: "cusGstNo",
      label: "GST No",
      placeholder: "24ABCDE1234F1Z5",
    },
    {
      name: "cusStateCode",
      label: "State Name",
      type: "select",
      searchable: true,
      serverSearch: true,
      options: stateOptions,
      onSearchOpenChange: stateHandlers.onSearchOpenChange,
      onSearchQueryChange: stateHandlers.onSearchQueryChange,
      onValueChange: stateHandlers.onValueChange,
    },
    { name: "cusName", label: "Customer Name" },
    {
      name: "cusGstType",
      label: "GST Type",
      type: "select",
      searchable: true,
      options: GST_TYPE_OPTIONS,
    },
    { name: "cusShort", label: "Search Code" },
    {
      name: "cusPanNo",
      label: "PAN No",
      validation: {
        pattern: "^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
        patternMessage: "PAN must be 10 characters (e.g., ABCDE1234F).",
      },
    },
    { name: "cusDefaultSalesman", label: "Salesman" },
    {
      name: "cusAadharNo",
      label: "Aadhar No",
      validation: {
        pattern: "^[0-9]{12}$",
        patternMessage: "Aadhar must be 12 digits.",
      },
    },
    {
      name: "cusPriceLevelId",
      label: "Price Level",
      type: "select",
      searchable: true,
      options: priceLevelOptions,
    },
    { name: "cusPhone1", label: "Mobile No1", type: "tel" },
    { name: "cusAddr1", label: "Address" },
    { name: "cusPhone2", label: "Mobile No2", type: "tel" },
    { name: "cusCity", label: "Place" },
    { name: "cusWhatsappNo", label: "WhatsApp No", type: "tel" },
    { name: "cusDistrict", label: "District" },
    { name: "cusTel", label: "Telephone No", type: "tel" },
    {
      name: "cusPin",
      label: "Pincode",
      validation: {
        pattern: "^[0-9]{0,10}$",
        patternMessage: "Pincode can contain digits only.",
      },
    },
    { name: "cusEmail", label: "eMail ID", type: "email" },
    {
      name: "cusDistanceKm",
      label: "Approx Distance (Km)",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Distance must be 0 or greater." },
    },
    { name: "cusLoyaltyCardNo", label: "Loyalty Card No" },
    { name: "cusLandmark", label: "Landmark" },
    {
      name: "cusItcollType",
      label: "TCS/TDS on Sales",
      type: "select",
      searchable: true,
      options: TCS_TDS_OPTIONS,
    },
    { name: "cusCreditAllowed", label: "Allow Credit", type: "checkbox" },
    { name: "cusItcollExempted", label: "TCS Collection Exempted", type: "checkbox" },
    // ---- Credit Setting --------------------------------------------------------
    { name: "creditHeading", label: "Credit Setting", type: "heading" },
    {
      name: "cusCreditDays",
      label: "Credit Days",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Credit Days must be 0 or greater." },
    },
    {
      name: "cusCreditAmtLimit",
      label: "Amount Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: { minMessage: "Amount Limit must be 0 or greater." },
    },
    {
      name: "cusCreditBillLimit",
      label: "Bills Limit",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Bills Limit must be 0 or greater." },
    },
    { name: "cusOverdueBilling", label: "Overdue Billing", type: "checkbox" },
    // ---- Bill Setting ----------------------------------------------------------
    { name: "billHeading", label: "Bill Setting", type: "heading" },
    {
      name: "cusSortOrder",
      label: "Position",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Position must be 0 or greater." },
    },
    {
      name: "cusDiscPerc",
      label: "Discount %",
      type: "number",
      min: 0,
      step: "0.001",
      validation: { minMessage: "Discount % must be 0 or greater." },
    },
    { name: "cusAllowDiscount", label: "Special Discount", type: "checkbox" },
    { name: "cusLoadingCharge", label: "Loading", type: "checkbox" },
    { name: "cusUnloadingCharge", label: "UnLoading", type: "checkbox" },
    { name: "cusFreightCharge", label: "Freight", type: "checkbox" },
    { name: "cusAllowLoyalty", label: "Loyalty", type: "checkbox" },
    { name: "cusAllowPromotion", label: "Promotion", type: "checkbox" },
    { name: "cusEnableSms", label: "Send SMS", type: "checkbox" },
  ];
}
export default function CustomerTemplatePage() {
  // One hook per configured dropdown so each has its own fetch/abort/pin lifecycle.
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const area = useLazyConfiguredDropdown(AREA_DROPDOWN_CONFIG);
  const group = useLazyConfiguredDropdown(CUSTOMER_GROUP_DROPDOWN_CONFIG);
  const state = useLazyConfiguredDropdown(STATE_DROPDOWN_CONFIG);
  // Price Level is eager (master-lookup), loaded once on mount. A failed fetch just
  // leaves the dropdown empty, so errors aren't toasted.
  const { getAll: getPriceLevelLookup } = useApi<unknown>(PRICE_LEVEL_LOOKUP_ENDPOINT, {
    toast: { error: false },
  });
  const [priceLevelOptions, setPriceLevelOptions] = useState<ERPDynamicSelectOption[]>([]);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getPriceLevelLookup(PRICE_LEVEL_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }
        setPriceLevelOptions(
          buildLookupOptions(payload, DEFAULT_PRICE_LEVEL_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "priceLevels", "price_levels"],
            idKeys: ["priceLvlId", "price_lvl_id", "id", "value"],
            labelKeys: ["priceLvlName", "price_lvl_name", "name", "label"],
          }),
        );
      } catch {
        if (mounted) {
          setPriceLevelOptions([]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getPriceLevelLookup]);
  // The saved template, as it stands for this session. A standing subscription rather
  // than a fetch on open: an RTK Query lazy trigger fired from a mount effect (which is
  // what the popup's auto-open amounts to) resolves undefined without touching the
  // network. Nothing is toasted on a failed read — the popup simply opens on its blanks.
  const session = useSessionSettingContext();
  const scope = useSessionSettingQuery(session);
  const { data: effectiveSettings } = useGetEffectiveSettingsQuery(scope);
  const [saveSettings] = useSaveAppSettingsMutation();
  const savedText = useMemo(
    () => findEffectiveSettingValue(effectiveSettings, CUSTOMER_FORM_DEFAULTS_SETTING_KEY),
    [effectiveSettings],
  );
  const savedDefaults = useMemo<CustomerTemplateDefaults>(
    () => parseCustomerFormDefaults(savedText),
    [savedText],
  );
  // The saved JSON as written, so a save carries through the keys this screen does not
  // render (the POS writes cusCountry, cusIsActive, cusCollectionDays and others).
  // Held in a ref because only the submit reads it.
  const savedRawRef = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    savedRawRef.current = parseSettingObject(savedText);
  }, [savedText]);
  // Auto-open the popup the first time the page mounts so landing here from the menu
  // shows the dialog straight away. Guarded so closing it doesn't re-trigger.
  const hasAutoOpenedRef = useRef(false);
  // Held so the prefill can push saved values into the already-open form.
  const controllerRef = useRef<ERPDynamicModalController | null>(null);
  // Guards the re-entrant openModal below: openModal fires onOpenChange again, which
  // would otherwise loop.
  const isPrefillingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  // The prefill runs once per opening. Re-running it whenever the read refreshes would
  // overwrite whatever the operator had already typed.
  const hasPrefilledRef = useRef(false);

  // Push the saved template into the open popup: every field by its own name, the four
  // lazy dropdowns seeded with their saved label so the trigger reads properly before
  // the list has loaded. Fields the setting omits fall back to the blank defaults.
  const prefillFromSavedTemplate = useCallback(
    (saved: CustomerTemplateDefaults) => {
      company.seedSelected(saved.company?.id ?? "", saved.company?.label ?? "");
      area.seedSelected(saved.area?.id ?? "", saved.area?.label ?? "");
      group.seedSelected(saved.group?.id ?? "", saved.group?.label ?? "");
      state.seedSelected(saved.state?.code ?? "", saved.state?.name ?? "");
      isPrefillingRef.current = true;
      controllerRef.current?.openModal("customerTemplate", {
        values: {
          ...INITIAL_FORM_VALUES,
          ...saved.fieldValues,
          cusCompanyId: saved.company?.id ?? "",
          cusAreaId: saved.area?.id ?? "",
          cusGroupId: saved.group?.id ?? "",
        },
      });
      isPrefillingRef.current = false;
    },
    [company.seedSelected, area.seedSelected, group.seedSelected, state.seedSelected],
  );
  // The session's scope hydrates in stages — company first, branch once the header has
  // resolved it — so the first read to land can be from a SHALLOWER layer than the one
  // this session ends up in (a company row where a branch row exists). When the scope
  // changes the answer changes, so arm the prefill again: this effect is declared
  // before the prefill below so the re-arm always happens first in the same commit.
  useEffect(() => {
    hasPrefilledRef.current = false;
  }, [scope]);
  // Prefill as soon as the popup is open AND the read has landed — in either order, so
  // opening before the catalog arrives still fills the form when it does.
  useEffect(() => {
    if (!isOpen || hasPrefilledRef.current || effectiveSettings === undefined) {
      return;
    }
    hasPrefilledRef.current = true;
    prefillFromSavedTemplate(savedDefaults);
  }, [isOpen, scope, effectiveSettings, savedDefaults, prefillFromSavedTemplate]);

  const scopeLabel = describeSessionScope(session);
  const variant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "customerTemplate",
      cardTitle: "Customer Template",
      cardDescription: "Set the default values applied to new customers.",
      cardButtonLabel: "Open Template",
      modalTitle: "Customer Template",
      modalDescription: `Configure the default field values for new customers. Saved for ${scopeLabel}.`,
      submitLabel: "Save Template",
      accent: "primary",
      fields: buildCustomerTemplateFields(
        company.options,
        company.handlers,
        area.options,
        area.handlers,
        group.options,
        group.handlers,
        state.options,
        state.handlers,
        priceLevelOptions,
      ),
    }),
    [
      company.options,
      company.handlers,
      area.options,
      area.handlers,
      group.options,
      group.handlers,
      state.options,
      state.handlers,
      priceLevelOptions,
      scopeLabel,
    ],
  );
  return (
    <ERPDynamicModalForm
      title="Customer Template"
      description="Configure the default values used when creating a new customer."
      variants={[variant]}
      resetOnSubmit={false}
      panelStyle={CUSTOMER_TEMPLATE_MODAL_PANEL_STYLE}
      initialValuesByVariant={{ customerTemplate: INITIAL_FORM_VALUES }}
      onControllerReady={(controller) => {
        controllerRef.current = controller;
        if (!hasAutoOpenedRef.current) {
          hasAutoOpenedRef.current = true;
          controller.openModal("customerTemplate");
        }
      }}
      onOpenChange={(open, variantKey) => {
        // Skip the re-entrant open the prefill itself triggers; a real close arms the
        // next opening's prefill. A close carries the variant key too, but it is typed
        // nullable, so only the OPEN side is keyed on it.
        if (isPrefillingRef.current || (open && variantKey !== "customerTemplate")) {
          return;
        }
        if (!open) {
          hasPrefilledRef.current = false;
        }
        setIsOpen(open);
      }}
      onSubmit={async ({ values }) => {
        // One setting value: whatever was stored, with every field this screen renders
        // written over it in the JSON type that field is, and the label saved beside
        // each id. The override goes to the deepest layer this session names and the
        // server upserts it, so Save is create and update alike. Awaited and re-thrown
        // so a refused write keeps the popup open with the values still in it.
        const settingValue: Record<string, unknown> = { ...(savedRawRef.current ?? {}) };
        for (const name of TEMPLATE_FIELD_NAMES) {
          settingValue[name] = toSettingValue(name, values[name] ?? INITIAL_FORM_VALUES[name] ?? "");
        }
        settingValue.cusCompanyName = resolveOptionLabel(company.options, values.cusCompanyId ?? "");
        settingValue.cusAreaName = resolveOptionLabel(area.options, values.cusAreaId ?? "");
        settingValue.cusGroupName = resolveOptionLabel(group.options, values.cusGroupId ?? "");
        settingValue.cusStateName = resolveOptionLabel(state.options, values.cusStateCode ?? "");
        settingValue.cusPriceLevelName = resolveOptionLabel(
          priceLevelOptions,
          values.cusPriceLevelId ?? "",
        );
        try {
          await saveSettings([
            buildSessionScopeOverride(
              CUSTOMER_FORM_DEFAULTS_SETTING_KEY,
              JSON.stringify(settingValue),
              session,
            ),
          ]).unwrap();
        } catch (error) {
          toast.error(getApiErrorMessage(error as never) ?? "Could not save the customer template.");
          throw error;
        }
        // No local patch of what was just written: the save invalidates the
        // "AppSettings" tag, so the standing read comes back from the server, which is
        // the only thing that knows which layer now holds the value.
        toast.success(`Customer template saved for ${scopeLabel}.`);
      }}
    />
  );
}
