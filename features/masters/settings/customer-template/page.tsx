"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { useApi } from "@/hooks/useApi";
// The chosen customer-template defaults are persisted to the settings config key/value
// store, keyed by a single fixed configId:
//  - GET  /configs/get?configId=1  -> read the saved template to prefill the popup
//  - POST /configs/create          -> create-or-update by configId (server decides)
// The whole template is one row. configValue is a JSON blob of every field below.
// For backward compatibility the three original picks keep their exact shapes/keys so
// the customer master create form keeps reading them (parseCustomerTemplateConfig):
//  - company keeps { id, name } (comp_id is the real key; name is for the prefill label)
//  - area / customerGroup store the exact NAME (their dropdown value IS the name).
// Every other field is stored verbatim as a string (checkboxes as "true"/"false",
// numbers as strings). cusStateName rides along so the lazy State dropdown can be
// re-seeded with its label on re-open.
const CONFIG_SAVE_ENDPOINT = "/configs/create";
const CONFIG_GET_ENDPOINT = "/configs/get";
const CUSTOMER_TEMPLATE_CONFIG_ID = 1;
const CUSTOMER_TEMPLATE_CONFIG_NAME = "customer_template";
// Price Level is the one non-configured dropdown; it loads eagerly from the shared
// master-lookup endpoint (same source the customer master uses).
const PRICE_LEVEL_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const PRICE_LEVEL_LOOKUP_QUERY = { module: "priceLevels" } as const;
type ConfigGetResponse = {
  data?: { configValue?: string | null } | null;
};
type SavedEntry = { id: string; name: string };
// company round-trips by id (+ label); area/customerGroup round-trip by their name; the
// remaining fields round-trip as plain strings held in `extras` (keyed by field name).
type SavedTemplate = {
  company: SavedEntry;
  area: string;
  customerGroup: string;
  cusStateName: string;
  extras: Record<string, string>;
};
// Company is stored as { id, name }; tolerate a bare id string too (older rows).
function readSavedEntry(raw: unknown): SavedEntry {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    return {
      id: record.id == null ? "" : String(record.id),
      name: record.name == null ? "" : String(record.name),
    };
  }
  return { id: raw == null ? "" : String(raw), name: "" };
}
// Area/customer group are stored as the plain name string; tolerate an { id, name }
// object too (reads its name) in case an older row was written that way.
function readSavedName(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    return record.name == null ? "" : String(record.name);
  }
  return raw == null ? "" : String(raw);
}
// Plain string/number/checkbox fields: keep the saved value, else fall back to default.
function readSavedString(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null || typeof raw === "object") {
    return fallback;
  }
  return String(raw);
}
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
// 28 = customer group (cgr_id/cgr_name), 9 = state (state_code/state_name).
// Company/State option value is its id/code; area and customer group use their NAME as
// the option value (idKeys point at the name column) so the picked value is the exact
// name we persist. Price Level loads eagerly from the master-lookup endpoint.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: { value: "", label: "Select Company" } as ERPDynamicSelectOption,
} as const;
const AREA_DROPDOWN_CONFIG = {
  dropdownId: "10",
  idKeys: ["arm_name", "armName"] as const,
  labelKeys: ["arm_name", "armName"] as const,
  defaultOption: { value: "", label: "Select Area" } as ERPDynamicSelectOption,
} as const;
const CUSTOMER_GROUP_DROPDOWN_CONFIG = {
  dropdownId: "28",
  idKeys: ["cgr_name", "cgrName"] as const,
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
// Field names mirror the customer master's cus* keys so a future "seed the create form"
// step can map straight through. Checkboxes default to "false"; numeric fields to "0".
const INITIAL_FORM_VALUES: Record<string, string> = {
  // Primary Information (round-trip via their own shapes, see notes above).
  company: "",
  area: "",
  customerGroup: "",
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
// Every persisted field except the three original picks (which have bespoke shapes).
// cusStateName is not a form field — it is derived on save and stored for re-seeding.
const TEMPLATE_EXTRA_FIELD_NAMES = Object.keys(INITIAL_FORM_VALUES).filter(
  (name) => name !== "company" && name !== "area" && name !== "customerGroup",
);
const CUSTOMER_TEMPLATE_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(72vw/var(--erp-ui-scale)), 72rem)",
  height: "calc(80vh/var(--erp-ui-scale))",
  maxHeight: "calc(80vh/var(--erp-ui-scale))",
};
// Parse the configValue JSON into the saved picks. Returns null when there's nothing
// usable (no row yet / bad JSON) so the caller leaves the form at its defaults.
function parseSavedTemplate(configValue: string | null | undefined): SavedTemplate | null {
  if (!configValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(configValue) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const extras: Record<string, string> = {};
    for (const name of TEMPLATE_EXTRA_FIELD_NAMES) {
      extras[name] = readSavedString(parsed[name], INITIAL_FORM_VALUES[name]);
    }
    return {
      company: readSavedEntry(parsed.company),
      area: readSavedName(parsed.area),
      customerGroup: readSavedName(parsed.customerGroup),
      cusStateName: readSavedString(parsed.cusStateName, ""),
      extras,
    };
  } catch {
    return null;
  }
}
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
      name: "company",
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
      name: "area",
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
      name: "customerGroup",
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
  // Persists the selected template to the config key/value store. useApi surfaces
  // success/error toasts; a thrown error keeps the modal open (see onSubmit).
  const { run: saveTemplate } = useApi<unknown, Record<string, unknown>>(CONFIG_SAVE_ENDPOINT, {
    method: "POST",
  });
  // Reads the saved template to prefill the popup. Errors are silenced: a missing row
  // (first-time / 404) just means the default form, and saving will create it.
  const { run: getTemplate } = useApi<ConfigGetResponse>(CONFIG_GET_ENDPOINT, {
    toast: { error: false },
  });
  // Auto-open the popup the first time the page mounts so landing here from the menu
  // shows the dialog straight away. Guarded so closing it doesn't re-trigger.
  const hasAutoOpenedRef = useRef(false);
  // Held so the prefill can push saved values into the already-open form.
  const controllerRef = useRef<ERPDynamicModalController | null>(null);
  // Guards the re-entrant openModal below: openModal fires onOpenChange again, which
  // would otherwise re-trigger the prefill fetch in a loop.
  const isPrefillingRef = useRef(false);

  // On every open, GET the saved template and prefill every field. Company round-trips
  // by id; area/customer group/state round-trip by their name; the rest are plain
  // strings. No saved row -> leave the form at its defaults.
  const prefillFromSavedTemplate = useCallback(async () => {
    let response: ConfigGetResponse | undefined;
    try {
      response = await getTemplate({ query: { configId: String(CUSTOMER_TEMPLATE_CONFIG_ID) } });
    } catch {
      return;
    }
    const saved = parseSavedTemplate(response?.data?.configValue);
    if (!saved) {
      return;
    }
    company.seedSelected(saved.company.id, saved.company.name);
    area.seedSelected(saved.area, saved.area);
    group.seedSelected(saved.customerGroup, saved.customerGroup);
    state.seedSelected(saved.extras.cusStateCode ?? "", saved.cusStateName);
    isPrefillingRef.current = true;
    controllerRef.current?.openModal("customerTemplate", {
      values: {
        company: saved.company.id,
        area: saved.area,
        customerGroup: saved.customerGroup,
        ...saved.extras,
      },
    });
    isPrefillingRef.current = false;
  }, [getTemplate, company.seedSelected, area.seedSelected, group.seedSelected, state.seedSelected]);
  const variant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "customerTemplate",
      cardTitle: "Customer Template",
      cardDescription: "Set the default values applied to new customers.",
      cardButtonLabel: "Open Template",
      modalTitle: "Customer Template",
      modalDescription: "Configure the default field values for new customers.",
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
        // Prefill from the saved config each time the popup opens (card button or the
        // mount auto-open). Skip the re-entrant open the prefill itself triggers.
        if (!open || variantKey !== "customerTemplate" || isPrefillingRef.current) {
          return;
        }
        void prefillFromSavedTemplate();
      }}
      onSubmit={async ({ values }) => {
        // Save the whole template as one config row. company keeps { id, name }; area/
        // customerGroup keep their NAME; cusStateName is derived so the State field can
        // be re-seeded; every other field is stored verbatim. The server create-or-
        // updates by configId; awaited so a failed POST throws -> modal stays open.
        const extras: Record<string, string> = {};
        for (const name of TEMPLATE_EXTRA_FIELD_NAMES) {
          extras[name] = values[name] ?? INITIAL_FORM_VALUES[name] ?? "";
        }
        const stateCode = values.cusStateCode ?? "";
        await saveTemplate({
          body: {
            configId: CUSTOMER_TEMPLATE_CONFIG_ID,
            configName: CUSTOMER_TEMPLATE_CONFIG_NAME,
            configValue: JSON.stringify({
              company: { id: values.company, name: resolveOptionLabel(company.options, values.company) },
              area: values.area,
              customerGroup: values.customerGroup,
              cusStateName: stateCode ? resolveOptionLabel(state.options, stateCode) : "",
              ...extras,
            }),
          },
        });
      }}
    />
  );
}
