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
import { buildFormDefaults } from "@/features/masters/shared/build-form-defaults";
import { applyFormDefaults } from "@/features/masters/shared/apply-form-defaults";
import {
  buildSessionScopeOverride,
  describeSessionScope,
  findEffectiveSettingValue,
  ITEM_FORM_DEFAULTS_SETTING_KEY,
  parseSettingObject,
  useSessionSettingContext,
  useSessionSettingQuery,
} from "@/features/masters/shared/form-defaults-setting";
import {
  ITEM_TEMPLATE_EXCLUDED,
  ITEM_TEMPLATE_EXCLUDED_PREFIXES,
} from "@/features/masters/inventory/item/template/excluded";
import { ITEM_TEMPLATE_FIELD_SPECS } from "@/features/masters/inventory/item/template/field-specs";
import {
  BATCH_CONFIG_OPTIONS,
  BRANCH_LOOKUP_KEYS,
  BRANCH_LOOKUP_QUERY,
  DEFAULT_BRANCH_OPTION,
  DEFAULT_HSN_OPTION,
  HSN_LOOKUP_QUERY,
  ITEM_INITIAL_FORM_VALUES,
  LOOKUP_ENDPOINT,
} from "@/features/masters/inventory/item/item-master-page.constants";
import {
  toHsnOptions,
  toLookupOptions,
} from "@/features/masters/inventory/item/item-master-page.utils";
import {
  useGetEffectiveSettingsQuery,
  useSaveAppSettingsMutation,
} from "@/store/api/appSettingsApi";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { useApi } from "@/hooks/useApi";
import { useDataRefresh } from "@/lib/data-freshness";
// The item template — what a new item starts with — is the
// `masters.item_form_defaults` SETTING, read and written through the app-settings
// catalog, exactly like the customer one:
//  - GET  /app-setting-values/effective?companyId=&branchId=…  -> the value in force
//  - POST /app-setting-values/create  { data: [ … ] }          -> upsert on the target
// Both follow the session, and the write lands on the deepest layer it names (branch,
// else company, else global) — see form-defaults-setting.ts for why they must agree.
//
// This screen and the Item Entry footer's "Save as Default Template" write the SAME
// document, through the same pure builder and the same field specs, so a template
// authored either way reads back the same on the create form.
//
// The fields below mirror Item Entry's own — same names, same labels, same defaults —
// minus everything that identifies ONE item (name, code, SKU, barcode, notes) and the
// four linked-row tables, which belong to a record rather than to a kind of record.
const ITEM_TEMPLATE_FORM_FIELD_NAMES = [
  // Classification
  "item_company_id",
  "item_branch_id",
  "item_group_id",
  "item_category_id",
  "item_section_id",
  "item_brand_id",
  "item_supplier_id",
  "item_cust_group",
  // Core details
  "item_batch_config",
  "item_hsn_code",
  "item_default_tax_id",
  "item_sort_order",
  "item_is_active",
  // Rules & status
  "item_retail_item",
  "item_price_list",
  "item_allow_neg_stock",
  "item_allow_promo",
  "item_allow_purchase",
  "item_is_service",
  "item_allow_freight",
  "item_allow_negative_so",
  "item_allow_loyalty",
  "item_allow_sales",
  "item_allow_loading",
  "item_damagable_product",
  "item_has_offer",
  "item_allow_sales_return",
  "item_weigh_scale",
  "item_auto_break",
  "item_auto_make",
  "item_is_batch_based",
  "item_is_expiry_item",
  "item_expiry_days",
  "item_intimate_before_days",
  "item_allow_po",
  "item_allow_so",
  "item_is_kit",
  "item_is_demand",
  "item_random_stock",
  "item_barcode_sticker",
  // Inventory & notes
  "item_storage_location",
] as const;
// The entry form's own defaults, so an untouched template screen and an untouched
// Add form start from the same place.
const INITIAL_FORM_VALUES: Record<string, string> = Object.fromEntries(
  ITEM_TEMPLATE_FORM_FIELD_NAMES.map((name) => [name, ITEM_INITIAL_FORM_VALUES[name] ?? ""]),
);
// The lazy dropdowns' label keys, so a save can replace what this screen renders
// without disturbing a key it does not (see the merge in onSubmit).
const RENDERED_DOCUMENT_KEYS = new Set<string>([
  ...ITEM_TEMPLATE_FORM_FIELD_NAMES,
  ...ITEM_TEMPLATE_FIELD_SPECS.filter(
    (spec) => spec.labelKey && ITEM_TEMPLATE_FORM_FIELD_NAMES.includes(spec.name as never),
  ).map((spec) => spec.labelKey as string),
]);
// Configured dropdowns, mirroring the item master: 8 company, 17 item group,
// 20 item category, 19 item section, 18 item brand, 3 item customer group,
// 35 supplier, 36 item tax. Each is keyed by ID and the label is stored beside it.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownId: "8",
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: { value: "", label: "Select Company" } as ERPDynamicSelectOption,
} as const;
const GROUP_DROPDOWN_CONFIG = {
  dropdownId: "17",
  idKeys: ["itg_id", "itgId"] as const,
  labelKeys: ["itg_name", "itgName"] as const,
  defaultOption: { value: "", label: "Select Item Group" } as ERPDynamicSelectOption,
} as const;
const CATEGORY_DROPDOWN_CONFIG = {
  dropdownId: "20",
  idKeys: ["category_id", "categoryId"] as const,
  labelKeys: ["category_name", "categoryName"] as const,
  defaultOption: { value: "", label: "Select Item Category" } as ERPDynamicSelectOption,
} as const;
const SECTION_DROPDOWN_CONFIG = {
  dropdownId: "19",
  idKeys: ["sec_id", "secId"] as const,
  labelKeys: ["sec_name", "secName"] as const,
  defaultOption: { value: "", label: "Select Item Section" } as ERPDynamicSelectOption,
} as const;
const BRAND_DROPDOWN_CONFIG = {
  dropdownId: "18",
  idKeys: ["brand_id", "brandId"] as const,
  labelKeys: ["brand_name", "brandName"] as const,
  defaultOption: { value: "", label: "Select Item Brand" } as ERPDynamicSelectOption,
} as const;
const CUSTOMER_GROUP_DROPDOWN_CONFIG = {
  dropdownId: "3",
  idKeys: ["cgr_id", "cgrId"] as const,
  labelKeys: ["cgr_name", "cgrName"] as const,
  defaultOption: { value: "", label: "Select Customer Group" } as ERPDynamicSelectOption,
} as const;
const SUPPLIER_DROPDOWN_CONFIG = {
  dropdownId: "35",
  idKeys: ["sup_id", "supId"] as const,
  labelKeys: ["sup_name", "supName"] as const,
  defaultOption: { value: "", label: "Select Supplier" } as ERPDynamicSelectOption,
} as const;
const TAX_DROPDOWN_CONFIG = {
  dropdownId: "36",
  idKeys: ["tax_id", "taxId"] as const,
  labelKeys: ["tax_name", "taxName"] as const,
  defaultOption: { value: "", label: "Select Default Tax" } as ERPDynamicSelectOption,
} as const;
const ITEM_TEMPLATE_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(72vw/var(--erp-ui-scale)), 72rem)",
  height: "calc(80vh/var(--erp-ui-scale))",
  maxHeight: "calc(80vh/var(--erp-ui-scale))",
};
// Resolve the label the user sees for a selected value so it can be persisted
// alongside the id (options always contain the picked/seeded option).
function resolveOptionLabel(options: ERPDynamicSelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? "";
}
// Each lazy field is wired to its own handler set so opening/typing fetches (and
// re-fetches) that dropdown independently. Branch and HSN load eagerly from the
// shared master-lookup endpoint, the same source the item master uses.
function buildItemTemplateFields(
  companyOptions: ERPDynamicSelectOption[],
  companyHandlers: LazyDropdownHandlers,
  groupOptions: ERPDynamicSelectOption[],
  groupHandlers: LazyDropdownHandlers,
  categoryOptions: ERPDynamicSelectOption[],
  categoryHandlers: LazyDropdownHandlers,
  sectionOptions: ERPDynamicSelectOption[],
  sectionHandlers: LazyDropdownHandlers,
  brandOptions: ERPDynamicSelectOption[],
  brandHandlers: LazyDropdownHandlers,
  customerGroupOptions: ERPDynamicSelectOption[],
  customerGroupHandlers: LazyDropdownHandlers,
  supplierOptions: ERPDynamicSelectOption[],
  supplierHandlers: LazyDropdownHandlers,
  taxOptions: ERPDynamicSelectOption[],
  taxHandlers: LazyDropdownHandlers,
  branchOptions: ERPDynamicSelectOption[],
  hsnOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  const lazySelect = (
    name: string,
    label: string,
    options: ERPDynamicSelectOption[],
    handlers: LazyDropdownHandlers,
  ): ERPDynamicModalField => ({
    name,
    label,
    type: "select",
    searchable: true,
    serverSearch: true,
    options,
    onSearchOpenChange: handlers.onSearchOpenChange,
    onSearchQueryChange: handlers.onSearchQueryChange,
    onValueChange: handlers.onValueChange,
  });
  const flag = (name: string, label: string): ERPDynamicModalField => ({
    name,
    label,
    type: "checkbox",
  });
  return [
    // ---- Classification --------------------------------------------------------
    { name: "classificationHeading", label: "Classification", type: "heading" },
    lazySelect("item_company_id", "Company", companyOptions, companyHandlers),
    {
      name: "item_branch_id",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },
    lazySelect("item_group_id", "Item Group", groupOptions, groupHandlers),
    lazySelect("item_category_id", "Item Category", categoryOptions, categoryHandlers),
    lazySelect("item_section_id", "Item Section", sectionOptions, sectionHandlers),
    lazySelect("item_brand_id", "Item Brand", brandOptions, brandHandlers),
    lazySelect("item_supplier_id", "Default Supplier", supplierOptions, supplierHandlers),
    lazySelect(
      "item_cust_group",
      "Item Customer Group",
      customerGroupOptions,
      customerGroupHandlers,
    ),
    // ---- Core Details ----------------------------------------------------------
    { name: "coreHeading", label: "Core Details", type: "heading" },
    {
      name: "item_batch_config",
      label: "Batch Config",
      type: "select",
      searchable: false,
      options: BATCH_CONFIG_OPTIONS,
      placeholder: "Select Batch Config",
    },
    {
      name: "item_hsn_code",
      label: "HSN Code",
      type: "select",
      searchable: true,
      options: hsnOptions,
    },
    lazySelect("item_default_tax_id", "Default Tax", taxOptions, taxHandlers),
    {
      name: "item_sort_order",
      label: "Sort Order",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Sort Order must be 0 or greater." },
    },
    { name: "item_is_active", label: "Is Active", type: "checkbox" },
    // ---- Rules & Status --------------------------------------------------------
    { name: "rulesHeading", label: "Rules & Status", type: "heading" },
    flag("item_retail_item", "Retail Item"),
    flag("item_price_list", "Price List"),
    flag("item_allow_neg_stock", "Allow Negative Stock"),
    flag("item_allow_promo", "Allow Promo"),
    flag("item_allow_purchase", "Allow Purchase"),
    flag("item_is_service", "Service Item"),
    flag("item_allow_freight", "Allow Freight"),
    flag("item_allow_negative_so", "Allow Negative SO"),
    flag("item_allow_loyalty", "Allow Loyalty"),
    flag("item_allow_sales", "Allow Sales"),
    flag("item_allow_loading", "Allow Loading"),
    flag("item_damagable_product", "Damagable Product"),
    flag("item_has_offer", "Has Offer"),
    flag("item_allow_sales_return", "Allow Sales Return"),
    flag("item_weigh_scale", "Weigh Scale"),
    flag("item_auto_break", "Auto Break"),
    flag("item_auto_make", "Auto Make"),
    flag("item_is_batch_based", "Batch Based"),
    flag("item_is_expiry_item", "Expiry Item"),
    {
      name: "item_expiry_days",
      label: "Expiry Days",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Expiry Days must be 0 or greater." },
    },
    {
      name: "item_intimate_before_days",
      label: "Intimate Before Days",
      type: "number",
      min: 0,
      step: 1,
      validation: { minMessage: "Intimate Before Days must be 0 or greater." },
    },
    flag("item_allow_po", "Allow PO"),
    flag("item_allow_so", "Allow SO"),
    flag("item_is_kit", "Is Kit"),
    flag("item_is_demand", "Is Demand"),
    flag("item_random_stock", "Random Stock"),
    flag("item_barcode_sticker", "Barcode Sticker"),
    // ---- Inventory & Notes -----------------------------------------------------
    { name: "inventoryHeading", label: "Inventory & Notes", type: "heading" },
    {
      name: "item_storage_location",
      label: "Storage Location",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Storage Location must be at most 250 characters.",
      },
    },
  ];
}
export default function ItemTemplatePage() {
  // One hook per configured dropdown so each has its own fetch/abort/pin lifecycle.
  const company = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const group = useLazyConfiguredDropdown(GROUP_DROPDOWN_CONFIG);
  const category = useLazyConfiguredDropdown(CATEGORY_DROPDOWN_CONFIG);
  const section = useLazyConfiguredDropdown(SECTION_DROPDOWN_CONFIG);
  const brand = useLazyConfiguredDropdown(BRAND_DROPDOWN_CONFIG);
  const customerGroup = useLazyConfiguredDropdown(CUSTOMER_GROUP_DROPDOWN_CONFIG);
  const supplier = useLazyConfiguredDropdown(SUPPLIER_DROPDOWN_CONFIG);
  const tax = useLazyConfiguredDropdown(TAX_DROPDOWN_CONFIG);
  // Branch and HSN are eager (master-lookup), loaded once on mount. A failed fetch
  // just leaves the dropdown empty, so errors aren't toasted.
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT, {
    toast: { error: false },
  });
  const { getAll: getHsnLookup } = useApi<unknown>(LOOKUP_ENDPOINT, { toast: { error: false } });
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<ERPDynamicSelectOption[]>([]);
  // Lookup options come from master tables that other users and other screens
  // change, so they are re-read on every data-refresh signal, not just on mount.
  const loadLookupOptions = useCallback(() => {
    let mounted = true;
    void (async () => {
      const [branches, hsnCodes] = await Promise.allSettled([
        getBranchLookup(BRANCH_LOOKUP_QUERY),
        getHsnLookup(HSN_LOOKUP_QUERY),
      ]);
      if (!mounted) {
        return;
      }
      setBranchOptions(
        branches.status === "fulfilled"
          ? toLookupOptions(branches.value, DEFAULT_BRANCH_OPTION, BRANCH_LOOKUP_KEYS)
          : [],
      );
      setHsnOptions(
        hsnCodes.status === "fulfilled" ? toHsnOptions(hsnCodes.value, DEFAULT_HSN_OPTION) : [],
      );
    })();
    return () => {
      mounted = false;
    };
  }, [getBranchLookup, getHsnLookup]);
  useEffect(() => loadLookupOptions(), [loadLookupOptions]);
  useDataRefresh(() => {
    loadLookupOptions();
  });
  // The saved template, as it stands for this session. A standing subscription rather
  // than a fetch on open: an RTK Query lazy trigger fired from a mount effect (which is
  // what the popup's auto-open amounts to) resolves undefined without touching the
  // network. Nothing is toasted on a failed read — the popup simply opens on its blanks.
  const session = useSessionSettingContext();
  const scope = useSessionSettingQuery(session);
  const { data: effectiveSettings } = useGetEffectiveSettingsQuery(scope);
  const [saveSettings] = useSaveAppSettingsMutation();
  const savedText = useMemo(
    () => findEffectiveSettingValue(effectiveSettings, ITEM_FORM_DEFAULTS_SETTING_KEY),
    [effectiveSettings],
  );
  const savedDefaults = useMemo(
    () => applyFormDefaults(savedText, ITEM_TEMPLATE_FIELD_SPECS),
    [savedText],
  );
  // The saved JSON as written, so a save carries through the keys this screen does not
  // render. Held in a ref because only the submit reads it.
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

  // Push the saved template into the open popup: every field by its own name, the eight
  // lazy dropdowns seeded with their saved label so the trigger reads properly before
  // the list has loaded. Fields the setting omits fall back to the blank defaults.
  const prefillFromSavedTemplate = useCallback(
    (saved: ReturnType<typeof applyFormDefaults>) => {
      const seedOne = (
        fieldName: string,
        dropdown: { seedSelected: (id: string, name: string) => void },
      ) => {
        const seed = saved.seeds[fieldName];
        dropdown.seedSelected(seed?.id ?? "", seed?.label ?? "");
      };
      seedOne("item_company_id", company);
      seedOne("item_group_id", group);
      seedOne("item_category_id", category);
      seedOne("item_section_id", section);
      seedOne("item_brand_id", brand);
      seedOne("item_cust_group", customerGroup);
      seedOne("item_supplier_id", supplier);
      seedOne("item_default_tax_id", tax);
      isPrefillingRef.current = true;
      controllerRef.current?.openModal("itemTemplate", {
        values: { ...INITIAL_FORM_VALUES, ...saved.values },
      });
      isPrefillingRef.current = false;
    },
    [
      company.seedSelected,
      group.seedSelected,
      category.seedSelected,
      section.seedSelected,
      brand.seedSelected,
      customerGroup.seedSelected,
      supplier.seedSelected,
      tax.seedSelected,
    ],
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
      key: "itemTemplate",
      cardTitle: "Item Template",
      cardDescription: "Set the default values applied to new items.",
      cardButtonLabel: "Open Template",
      modalTitle: "Item Template",
      modalDescription: `Configure the default field values for new items. Saved for ${scopeLabel}.`,
      submitLabel: "Save Template",
      accent: "primary",
      fields: buildItemTemplateFields(
        company.options,
        company.handlers,
        group.options,
        group.handlers,
        category.options,
        category.handlers,
        section.options,
        section.handlers,
        brand.options,
        brand.handlers,
        customerGroup.options,
        customerGroup.handlers,
        supplier.options,
        supplier.handlers,
        tax.options,
        tax.handlers,
        branchOptions,
        hsnOptions,
      ),
    }),
    [
      company.options,
      company.handlers,
      group.options,
      group.handlers,
      category.options,
      category.handlers,
      section.options,
      section.handlers,
      brand.options,
      brand.handlers,
      customerGroup.options,
      customerGroup.handlers,
      supplier.options,
      supplier.handlers,
      tax.options,
      tax.handlers,
      branchOptions,
      hsnOptions,
      scopeLabel,
    ],
  );
  return (
    <ERPDynamicModalForm
      title="Item Template"
      description="Configure the default values used when creating a new item."
      variants={[variant]}
      resetOnSubmit={false}
      panelStyle={ITEM_TEMPLATE_MODAL_PANEL_STYLE}
      initialValuesByVariant={{ itemTemplate: INITIAL_FORM_VALUES }}
      onControllerReady={(controller) => {
        controllerRef.current = controller;
        if (!hasAutoOpenedRef.current) {
          hasAutoOpenedRef.current = true;
          controller.openModal("itemTemplate");
        }
      }}
      onOpenChange={(open, variantKey) => {
        // Skip the re-entrant open the prefill itself triggers; a real close arms the
        // next opening's prefill. A close carries the variant key too, but it is typed
        // nullable, so only the OPEN side is keyed on it.
        if (isPrefillingRef.current || (open && variantKey !== "itemTemplate")) {
          return;
        }
        if (!open) {
          hasPrefilledRef.current = false;
        }
        setIsOpen(open);
      }}
      onSubmit={async ({ values }) => {
        // The same builder the Item Entry button uses, so both write one document:
        // identity fields and the linked-row editors dropped, each id stored with its
        // label, empty treated as NOT SET. What this screen does not render is carried
        // through from the stored document rather than lost.
        const built = JSON.parse(
          buildFormDefaults(values, {
            specs: ITEM_TEMPLATE_FIELD_SPECS,
            excluded: ITEM_TEMPLATE_EXCLUDED,
            excludedPrefixes: ITEM_TEMPLATE_EXCLUDED_PREFIXES,
            labels: {
              item_company_id: resolveOptionLabel(company.options, values.item_company_id ?? ""),
              item_group_id: resolveOptionLabel(group.options, values.item_group_id ?? ""),
              item_category_id: resolveOptionLabel(category.options, values.item_category_id ?? ""),
              item_section_id: resolveOptionLabel(section.options, values.item_section_id ?? ""),
              item_brand_id: resolveOptionLabel(brand.options, values.item_brand_id ?? ""),
              item_cust_group: resolveOptionLabel(
                customerGroup.options,
                values.item_cust_group ?? "",
              ),
              item_supplier_id: resolveOptionLabel(supplier.options, values.item_supplier_id ?? ""),
              item_default_tax_id: resolveOptionLabel(tax.options, values.item_default_tax_id ?? ""),
            },
          }),
        ) as Record<string, unknown>;
        const settingValue: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(savedRawRef.current ?? {})) {
          // A field this screen shows is answered by this screen — including by being
          // cleared, which drops it. Everything else is the stored document's business.
          if (!RENDERED_DOCUMENT_KEYS.has(key)) {
            settingValue[key] = value;
          }
        }
        Object.assign(settingValue, built);
        try {
          await saveSettings([
            buildSessionScopeOverride(
              ITEM_FORM_DEFAULTS_SETTING_KEY,
              JSON.stringify(settingValue),
              session,
            ),
          ]).unwrap();
        } catch (error) {
          toast.error(getApiErrorMessage(error as never) ?? "Could not save the item template.");
          throw error;
        }
        // No local patch of what was just written: the save invalidates the
        // "AppSettings" tag, so the standing read comes back from the server, which is
        // the only thing that knows which layer now holds the value.
        toast.success(`Item template saved for ${scopeLabel}.`);
      }}
    />
  );
}
