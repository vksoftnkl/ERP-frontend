"use client";
import { useMemo, useRef } from "react";
import {
  ERPDynamicModalForm,
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
// key/value store (POST /configs/create, create-or-update by configId). The whole
// template is one row: configValue is a JSON blob of the three selected ids.
const CONFIG_SAVE_ENDPOINT = "/configs/create";
const CUSTOMER_TEMPLATE_CONFIG_ID = 1;
const CUSTOMER_TEMPLATE_CONFIG_NAME = "customer_template";
// Settings -> Templates -> Customer Template.
// A single popup whose only fields are three lazy, server-side searchable
// configured dropdowns (fixed.dropdown_details, fetched via /dropdown-details/run
// on open + on debounced search). The dropdown ids mirror the customer master:
// 8 = company (comp_id/comp_name), 10 = area (arm_id/arm_name),
// 28 = customer group (cgr_id/cgr_name).
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
  // Auto-open the popup the first time the page mounts so landing here from the
  // menu shows the dialog straight away. Guarded so closing it doesn't re-trigger
  // (onControllerReady fires again on re-render); the landing card re-opens it.
  const hasAutoOpenedRef = useRef(false);
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
        if (!hasAutoOpenedRef.current) {
          hasAutoOpenedRef.current = true;
          controller.openModal("customerTemplate");
        }
      }}
      onSubmit={async ({ values }) => {
        // Save the whole template as one config row: configValue is the JSON of the
        // three selected ids. Awaited so a failed POST throws -> modal stays open.
        await saveTemplate({
          body: {
            configId: CUSTOMER_TEMPLATE_CONFIG_ID,
            configName: CUSTOMER_TEMPLATE_CONFIG_NAME,
            configValue: JSON.stringify({
              company: values.company,
              area: values.area,
              customerGroup: values.customerGroup,
            }),
          },
        });
      }}
    />
  );
}