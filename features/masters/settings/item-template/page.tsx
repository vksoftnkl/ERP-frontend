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
// The chosen item group/category/brand are persisted to the settings config
// key/value store, keyed by a single fixed configId:
//  - GET  /configs/get?configId=2  -> read the saved template to prefill the popup
//  - POST /configs/create          -> create-or-update by configId (server decides)
// The whole template is one row: configValue is a JSON blob of the three picks, each
// stored as its exact NAME (the dropdown value IS the name), since downstream consumers
// key items by name, not id.
const CONFIG_SAVE_ENDPOINT = "/configs/create";
const CONFIG_GET_ENDPOINT = "/configs/get";
const ITEM_TEMPLATE_CONFIG_ID = 2;
const ITEM_TEMPLATE_CONFIG_NAME = "item_template";

type ConfigGetResponse = {
  data?: { configValue?: string | null } | null;
};

type SavedTemplate = { itemGroup: string; itemCategory: string; itemBrand: string };

// Each pick is stored as the plain name string; tolerate an { id, name } object too
// (reads its name) in case a row was ever written that way.
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
      itemGroup: readSavedName(parsed.itemGroup),
      itemCategory: readSavedName(parsed.itemCategory),
      itemBrand: readSavedName(parsed.itemBrand),
    };
  } catch {
    return null;
  }
}

// Settings -> Templates -> Item Template.
// A single popup whose only fields are three lazy, server-side searchable configured
// dropdowns (fixed.dropdown_details, fetched via /dropdown-details/run on open + on
// debounced search). The dropdown ids are the item classification masters:
// 17 = item group (itg_id/itg_name), 20 = item category (category_id/category_name),
// 18 = item brand (brand_id/brand_name).
// Each field uses its NAME as the option value (idKeys point at the name column) so the
// picked value is the exact name we persist.
const ITEM_GROUP_DROPDOWN_CONFIG = {
  dropdownId: "17",
  idKeys: ["itg_name", "itgName"] as const,
  labelKeys: ["itg_name", "itgName"] as const,
  defaultOption: { value: "", label: "Select Item Group" } as ERPDynamicSelectOption,
} as const;
const ITEM_CATEGORY_DROPDOWN_CONFIG = {
  dropdownId: "20",
  idKeys: ["category_name", "categoryName"] as const,
  labelKeys: ["category_name", "categoryName"] as const,
  defaultOption: { value: "", label: "Select Item Category" } as ERPDynamicSelectOption,
} as const;
const ITEM_BRAND_DROPDOWN_CONFIG = {
  dropdownId: "18",
  idKeys: ["brand_name", "brandName"] as const,
  labelKeys: ["brand_name", "brandName"] as const,
  defaultOption: { value: "", label: "Select Item Brand" } as ERPDynamicSelectOption,
} as const;
const INITIAL_FORM_VALUES = {
  itemGroup: "",
  itemCategory: "",
  itemBrand: "",
} as const;
// Each field is wired to its own lazy-dropdown handler set so opening/typing fetches
// (and re-fetches) that dropdown independently.
function buildItemTemplateFields(
  groupOptions: ERPDynamicSelectOption[],
  groupHandlers: LazyDropdownHandlers,
  categoryOptions: ERPDynamicSelectOption[],
  categoryHandlers: LazyDropdownHandlers,
  brandOptions: ERPDynamicSelectOption[],
  brandHandlers: LazyDropdownHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "itemGroup",
      label: "Item Group",
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
        requiredMessage: "Item Group is required.",
      },
    },
    {
      name: "itemCategory",
      label: "Item Category",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      required: true,
      options: categoryOptions,
      onSearchOpenChange: categoryHandlers.onSearchOpenChange,
      onSearchQueryChange: categoryHandlers.onSearchQueryChange,
      onValueChange: categoryHandlers.onValueChange,
      validation: {
        requiredMessage: "Item Category is required.",
      },
    },
    {
      name: "itemBrand",
      label: "Item Brand",
      type: "select",
      colSpan: 2,
      searchable: true,
      serverSearch: true,
      required: true,
      options: brandOptions,
      onSearchOpenChange: brandHandlers.onSearchOpenChange,
      onSearchQueryChange: brandHandlers.onSearchQueryChange,
      onValueChange: brandHandlers.onValueChange,
      validation: {
        requiredMessage: "Item Brand is required.",
      },
    },
  ];
}
export default function ItemTemplatePage() {
  // One hook per dropdown so each has its own fetch/abort/pin lifecycle.
  const group = useLazyConfiguredDropdown(ITEM_GROUP_DROPDOWN_CONFIG);
  const category = useLazyConfiguredDropdown(ITEM_CATEGORY_DROPDOWN_CONFIG);
  const brand = useLazyConfiguredDropdown(ITEM_BRAND_DROPDOWN_CONFIG);
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
  // form. Every field round-trips by its name (which is also its option value).
  // No saved row -> leave the form empty.
  const prefillFromSavedTemplate = useCallback(async () => {
    let response: ConfigGetResponse | undefined;
    try {
      response = await getTemplate({ query: { configId: String(ITEM_TEMPLATE_CONFIG_ID) } });
    } catch {
      return;
    }
    const saved = parseSavedTemplate(response?.data?.configValue);
    if (!saved) {
      return;
    }
    group.seedSelected(saved.itemGroup, saved.itemGroup);
    category.seedSelected(saved.itemCategory, saved.itemCategory);
    brand.seedSelected(saved.itemBrand, saved.itemBrand);
    isPrefillingRef.current = true;
    controllerRef.current?.openModal("itemTemplate", {
      values: {
        itemGroup: saved.itemGroup,
        itemCategory: saved.itemCategory,
        itemBrand: saved.itemBrand,
      },
    });
    isPrefillingRef.current = false;
  }, [getTemplate, group.seedSelected, category.seedSelected, brand.seedSelected]);
  const variant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "itemTemplate",
      cardTitle: "Item Template",
      cardDescription: "Pick the item group, category, and brand for this template.",
      cardButtonLabel: "Open Template",
      modalTitle: "Item Template",
      modalDescription: "Select the item group, category, and brand.",
      submitLabel: "Save Template",
      accent: "primary",
      fields: buildItemTemplateFields(
        group.options,
        group.handlers,
        category.options,
        category.handlers,
        brand.options,
        brand.handlers,
      ),
    }),
    [group.options, group.handlers, category.options, category.handlers, brand.options, brand.handlers],
  );
  return (
    <ERPDynamicModalForm
      title="Item Template"
      description="Configure an item template by choosing its group, category, and brand."
      variants={[variant]}
      resetOnSubmit={false}
      initialValuesByVariant={{ itemTemplate: INITIAL_FORM_VALUES }}
      onControllerReady={(controller) => {
        controllerRef.current = controller;
        if (!hasAutoOpenedRef.current) {
          hasAutoOpenedRef.current = true;
          controller.openModal("itemTemplate");
        }
      }}
      onOpenChange={(open, variantKey) => {
        // Prefill from the saved config each time the popup opens (card button or the
        // mount auto-open). Skip the re-entrant open the prefill itself triggers.
        if (!open || variantKey !== "itemTemplate" || isPrefillingRef.current) {
          return;
        }
        void prefillFromSavedTemplate();
      }}
      onSubmit={async ({ values }) => {
        // Save the whole template as one config row. Each pick is stored as its exact
        // NAME (the option value already is the name). The server create-or-updates by
        // configId; awaited so a failed POST throws -> modal stays open.
        await saveTemplate({
          body: {
            configId: ITEM_TEMPLATE_CONFIG_ID,
            configName: ITEM_TEMPLATE_CONFIG_NAME,
            configValue: JSON.stringify({
              itemGroup: values.itemGroup,
              itemCategory: values.itemCategory,
              itemBrand: values.itemBrand,
            }),
          },
        });
      }}
    />
  );
}
