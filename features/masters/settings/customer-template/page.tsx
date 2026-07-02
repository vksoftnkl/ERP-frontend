"use client";
import { useCallback, useMemo, useRef } from "react";
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
import { useApi } from "@/hooks/useApi";
// The chosen company/area/customer-group are persisted to the settings config
// key/value store, keyed by a single fixed configId:
//  - GET  /configs/get?configId=1  -> read the saved template to prefill the popup
//  - POST /configs/create          -> create-or-update by configId (server decides)
// The whole template is one row. configValue is a JSON blob of the three picks:
//  - company keeps { id, name } (comp_id is the real key; name is for the prefill label)
//  - area / customerGroup store the exact NAME (their dropdown value IS the name), since
//    downstream consumers key those by name, not id.
const CONFIG_SAVE_ENDPOINT = "/configs/create";
const CONFIG_GET_ENDPOINT = "/configs/get";
const CUSTOMER_TEMPLATE_CONFIG_ID = 1;
const CUSTOMER_TEMPLATE_CONFIG_NAME = "customer_template";
type ConfigGetResponse = {
  data?: { configValue?: string | null } | null;
};
type SavedEntry = { id: string; name: string };
// company round-trips by id (+ label); area/customerGroup round-trip by their name.
type SavedTemplate = { company: SavedEntry; area: string; customerGroup: string };
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
// Parse the configValue JSON into the three saved picks. Returns null when there's
// nothing usable (no row yet / bad JSON) so the caller leaves the form empty.
function parseSavedTemplate(configValue: string | null | undefined): SavedTemplate | null {
  if (!configValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(configValue) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      company: readSavedEntry(parsed.company),
      area: readSavedName(parsed.area),
      customerGroup: readSavedName(parsed.customerGroup),
    };
  } catch {
    return null;
  }
}
// Resolve the label the user sees for a selected value so it can be persisted
// alongside the id (options always contain the picked/seeded option).
function resolveOptionLabel(options: ERPDynamicSelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? "";
}
// Settings -> Templates -> Customer Template.
// A single popup whose only fields are three lazy, server-side searchable
// configured dropdowns (fixed.dropdown_details, fetched via /dropdown-details/run
// on open + on debounced search). The dropdown ids mirror the customer master:
// 8 = company (comp_id/comp_name), 10 = area (arm_id/arm_name),
// 28 = customer group (cgr_id/cgr_name).
// Company's option value is its id; area and customer group use their NAME as the option
// value (idKeys point at the name column) so the picked value is the exact name we persist.
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
const INITIAL_FORM_VALUES = {
  company: "",
  area: "",
  customerGroup: "",
} as const;
// Each field is wired to its own lazy-dropdown handler set so opening/typing fetches
// (and re-fetches) that dropdown independently.
function buildCustomerTemplateFields(
  companyOptions: ERPDynamicSelectOption[],
  companyHandlers: LazyDropdownHandlers,
  areaOptions: ERPDynamicSelectOption[],
  areaHandlers: LazyDropdownHandlers,
  groupOptions: ERPDynamicSelectOption[],
  groupHandlers: LazyDropdownHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "company",
      label: "Company",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      required: true,
      options: companyOptions,
      onSearchOpenChange: companyHandlers.onSearchOpenChange,
      onSearchQueryChange: companyHandlers.onSearchQueryChange,
      onValueChange: companyHandlers.onValueChange,
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "area",
      label: "Area",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      required: true,
      options: areaOptions,
      onSearchOpenChange: areaHandlers.onSearchOpenChange,
      onSearchQueryChange: areaHandlers.onSearchQueryChange,
      onValueChange: areaHandlers.onValueChange,
      validation: {
        requiredMessage: "Area is required.",
      },
    },
    {
      name: "customerGroup",
      label: "Customer Group",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      required: true,
      options: groupOptions,
      onSearchOpenChange: groupHandlers.onSearchOpenChange,
      onSearchQueryChange: groupHandlers.onSearchQueryChange,
      onValueChange: groupHandlers.onValueChange,
      validation: {
        requiredMessage: "Customer Group is required.",
      },
    },
  ];
}
export default function CustomerTemplatePage() {
  // One hook per dropdown so each has its own fetch/abort/pin lifecycle.
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const area = useLazyConfiguredDropdown(AREA_DROPDOWN_CONFIG);
  const group = useLazyConfiguredDropdown(CUSTOMER_GROUP_DROPDOWN_CONFIG);
  // Persists the selected template to the config key/value store. useApi surfaces
  // success/error toasts; a thrown error keeps the modal open (see handleSubmit).
  const { run: saveTemplate } = useApi<unknown, Record<string, unknown>>(CONFIG_SAVE_ENDPOINT, {
    method: "POST",
  });
  // Reads the saved template to prefill the popup. Errors are silenced: a missing row
  // (first-time / 404) just means an empty form, and saving will create it.
  const { run: getTemplate } = useApi<ConfigGetResponse>(CONFIG_GET_ENDPOINT, {
    toast: { error: false },
  });
  // Auto-open the popup the first time the page mounts so landing here from the
  // menu shows the dialog straight away. Guarded so closing it doesn't re-trigger
  // (onControllerReady fires again on re-render); the landing card re-opens it.
  const hasAutoOpenedRef = useRef(false);
  // Held so the prefill can push saved values into the already-open form.
  const controllerRef = useRef<ERPDynamicModalController | null>(null);
  // Guards the re-entrant openModal below: openModal fires onOpenChange again, which
  // would otherwise re-trigger the prefill fetch in a loop.
  const isPrefillingRef = useRef(false);

  // On every open, GET the saved template and prefill the three dropdowns so the saved
  // labels show before each field is lazily loaded, then push the values into the open
  // form. Company round-trips by id; area/customer group round-trip by their name (which
  // is also their option value). No saved row -> leave the form empty.
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
    isPrefillingRef.current = true;
    controllerRef.current?.openModal("customerTemplate", {
      values: {
        company: saved.company.id,
        area: saved.area,
        customerGroup: saved.customerGroup,
      },
    });
    isPrefillingRef.current = false;
  }, [getTemplate, company.seedSelected, area.seedSelected, group.seedSelected]);
  const variant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "customerTemplate",
      cardTitle: "Customer Template",
      cardDescription: "Pick the company, area, and customer group for this template.",
      cardButtonLabel: "Open Template",
      modalTitle: "Customer Template",
      modalDescription: "Select the company, area, and customer group.",
      submitLabel: "Save Template",
      accent: "blue",
      fields: buildCustomerTemplateFields(
        company.options,
        company.handlers,
        area.options,
        area.handlers,
        group.options,
        group.handlers,
      ),
    }),
    [company.options, company.handlers, area.options, area.handlers, group.options, group.handlers],
  );
  return (
    <ERPDynamicModalForm
      title="Customer Template"
      description="Configure a customer template by choosing its company, area, and customer group."
      variants={[variant]}
      resetOnSubmit={false}
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
        // Save the whole template as one config row. company keeps { id, name } (id is its
        // key; name lets the re-open show the label); area/customerGroup store the exact
        // NAME (their option value already is the name). The server create-or-updates by
        // configId; awaited so a failed POST throws -> modal stays open.
        await saveTemplate({
          body: {
            configId: CUSTOMER_TEMPLATE_CONFIG_ID,
            configName: CUSTOMER_TEMPLATE_CONFIG_NAME,
            configValue: JSON.stringify({
              company: { id: values.company, name: resolveOptionLabel(company.options, values.company) },
              area: values.area,
              customerGroup: values.customerGroup,
            }),
          },
        });
      }}
    />
  );
}