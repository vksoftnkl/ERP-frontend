"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import {
  applyWidgetFieldConfig,
  buildControllableFieldNames,
  buildWidgetFieldConfig,
  type ResolvedFieldConfig,
  type WidgetMasterSectionConfig,
  type WidgetMastersResponse,
} from "@/features/masters/shared/widget-config";
import { useApi } from "@/hooks/useApi";
import {
  ERPDynamicModalForm,
  type ERPDynamicModalController,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  DEFAULT_LOOKUP_ARRAY_KEYS,
  buildLookupOptions,
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
const API_ENDPOINTS = {
list: "/configured-grid-sql/run?grid_id=6",
  getById: "/item-groups/get",
  create: "/item-groups/create",
  delete: "/item-groups/delete",
} as const;


const GRID_TABLE_NAME = "item_group_master";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 35;
const WIDGET_SECTION_PLATFORM = "web";
// Sent with the list request as the `grid_param` query field (JSON-stringified).
// The server JSON-parses it and binds each key into the matching named token in
// grid 6's stored SQL; keys with no matching token are ignored. `wantdelete` is
// driven by the "Show deleted records" checkbox beside the list search input.
// Bridge each hardcoded form field `name` (camelCase aliases used by form state
// and the submit payload) to the backend `fieldName` it is configured under
// (itg_* column-style keys, matched case-insensitively). Form fields with no
// mapping — or no matching response entry — keep their hardcoded label and
// render after all configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "itg_name",
  masterShortName: "itg_short",
  position: "itg_position",
  parentGroupId: "itg_parent_group",
  masterDescription: "itg_description",
  itgPhoto: "itg_image",
};
// Right-clicking inside the open create/update modal opens a tree popup of this
// menu's configured sections/fields (GET /widget-masters/config?menu_id=…).
// Ticking a field toggles its live visibility in the form via the same config map.
const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
// Persists the tree's section/field visibility back to the server (PATCH).
const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
// Backend fieldNames (lowercased) that map to a real form field, so their popup
// checkbox can actually show/hide something. Others render read-only ("not on form").
const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(WIDGET_FIELD_NAME_BY_FORM_FIELD);
const PARENT_GROUP_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const PARENT_GROUP_LOOKUP_QUERY = {
  module: "itemGroups",
  limit: "100",
} as const;
const LOOKUP_KEYS = {
  id: ["itg_id", "group_id", "groupId", "id", "_id", "item_group_id", "itemGroupId"],
  code: ["itg_alias", "itg_short", "group_code", "groupCode", "code", "groupalias", "groupshort"],
  name: ["itg_name", "group_name", "groupName", "name", "itemgroupname", "item_group_name", "itemGroupName"],
  short: ["itg_short", "short_name", "shortName", "short", "groupshort", "item_group_short"],
  alias: ["itg_alias", "alias", "group_alias", "groupalias", "item_group_alias"],
  active: ["itg_is_active", "itg_active", "active", "is_active", "isActive", "status"],
  position: ["itg_sort", "position", "sort"],
  description: ["itg_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "groups", "itemGroups"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "itg_id",
  name: "itg_name",
  alias: "itg_alias",
  short: "itg_short",
  description: "itg_description",
  sort: "itg_sort",
} as const;
const GROUP_PARENT_ID_KEYS = ["itg_parent_id", "parent_id", "parentId", "parent_group_id", "parentGroupId"] as const;
const GROUP_LEVEL_KEYS = ["itg_level", "level", "group_level", "groupLevel"] as const;
const GROUP_TAX_CLAIM_KEYS = ["itg_tax_claim", "tax_claim", "taxClaim"] as const;
const GROUP_DEFAULT_TAX_ID_KEYS = ["itg_default_tax_id", "default_tax_id", "defaultTaxId"] as const;
const GROUP_DEFAULT_HSN_KEYS = ["itg_default_hsn", "default_hsn", "defaultHsn", "hsn_code", "hsnCode"] as const;
const GROUP_DEFAULT_UOM_ID_KEYS = ["itg_default_uom_id", "default_uom_id", "defaultUomId"] as const;
const GROUP_PHOTO_URL_KEYS = ["itg_photo_url", "photo_url", "photoUrl"] as const;
const FILE_CONSTRAINTS = {
  MAX_UPLOAD_IMAGE_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ] as const,
} as const;
const DEFAULT_PARENT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  masterDescription: "",
  position: "0",
  parentGroupId: "",
  groupLevel: "0",
  groupTaxClaim: "false",
  groupDefaultTaxId: "",
  groupDefaultHsn: "",
  groupDefaultUomId: "",
  groupPhotoUrl: "",
} as const;
function buildItemGroupFormFields(parentOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Item Group Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Group Name must be at least 2 characters.",
      },
    },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "position",
      label: "Position",
      type: "number",
      colSpan: 1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Position must be 0 or greater.",
      },
    },
    {
      name: "parentGroupId",
      label: "Parent Group",
      type: "select",
      colSpan: 2,
      searchable: true,
      options: parentOptions,
    },
    {
      name: "masterDescription",
      label: "Description",
      type: "textarea",
      colSpan: 2,
    },
    {
      name: "itgPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Optional. Sent as base64 in itg_photo.",
      colSpan: 2,
    },
  ];
}

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableReference(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read selected image."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });
}

function getBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}
export default function ItemGroupMasterPage() {
  const { getAll: getParentGroupLookup } = useApi<unknown>(PARENT_GROUP_LOOKUP_ENDPOINT);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [parentOptions, setParentOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_PARENT_OPTION,
  ]);
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted item groups. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getWidgetConfig({
          sectionMenuId: String(WIDGET_SECTION_MENU_ID),
          sectionPlatform: WIDGET_SECTION_PLATFORM,
        });
        if (!mounted) {
          return;
        }
        setWidgetFieldConfig(buildWidgetFieldConfig(payload ?? null));
      } catch {
        if (mounted) {
          setWidgetFieldConfig(new Map());
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getWidgetConfig]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getParentGroupLookup(PARENT_GROUP_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }
        setParentOptions(
          buildLookupOptions(payload, DEFAULT_PARENT_OPTION, {
            arrayKeys: DEFAULT_LOOKUP_ARRAY_KEYS,
            idKeys: ["id", "value", "itg_id"],
            labelKeys: ["name", "label", "itg_name"],
          }),
        );
      } catch {
        if (mounted) {
          setParentOptions([DEFAULT_PARENT_OPTION]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getParentGroupLookup]);

  const formFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildItemGroupFormFields(parentOptions),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [parentOptions, widgetFieldConfig],
  );

  // Adds the `grid_param` payload to the default page/limit/search list query.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify({ wantdelete: wantDelete }),
    }),
    [wantDelete],
  );

  // Right-click config tree popup over the create/update modal.
  const { getAll: getWidgetConfigTree } = useApi<WidgetMastersResponse>(
    WIDGET_CONFIG_TREE_ENDPOINT,
    { toast: { error: false } },
  );
  const { run: saveVisibility, loading: savingVisibility } = useApi(WIDGET_VISIBILITY_ENDPOINT, {
    method: "PATCH",
  });
  const [configSections, setConfigSections] = useState<WidgetMasterSectionConfig[]>([]);
  // Section-level visibility overrides keyed by sectionId; falls back to the
  // fetched sectionVisibility until the user toggles a section.
  const [sectionVisibility, setSectionVisibility] = useState<Map<number, boolean>>(() => new Map());
  // Edited secondary text keyed by fieldId; falls back to the fetched value.
  const [secondaryTextById, setSecondaryTextById] = useState<Map<number, string>>(() => new Map());
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const treeLoadedRef = useRef(false);
  const visibilityControllerRef = useRef<ERPDynamicModalController | null>(null);

  // Fetched lazily the first time the popup is opened, then cached.
  const loadConfigTree = useCallback(async () => {
    if (treeLoadedRef.current) {
      return;
    }
    treeLoadedRef.current = true;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const payload = await getWidgetConfigTree({ menu_id: String(WIDGET_SECTION_MENU_ID) });
      setConfigSections(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      treeLoadedRef.current = false;
      setTreeError("Unable to load field configuration.");
    } finally {
      setTreeLoading(false);
    }
  }, [getWidgetConfigTree]);

  // Hijack right-clicks that land inside the open create/update modal only; clicks
  // elsewhere keep the browser's native context menu. Opens the Visible Settings
  // modal (an ERPDynamicModalForm) on top via its controller.
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      void loadConfigTree();
      visibilityControllerRef.current?.openModal("visibility");
    };
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, [loadConfigTree]);

  const handleToggleField = useCallback((backendName: string, checked: boolean) => {
    const key = backendName.toLowerCase();
    setWidgetFieldConfig((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      next.set(
        key,
        existing
          ? { ...existing, visible: checked }
          : { label: "", order: Number.MAX_SAFE_INTEGER, visible: checked },
      );
      return next;
    });
  }, []);

  const handleToggleSection = useCallback((sectionId: number, checked: boolean) => {
    setSectionVisibility((prev) => {
      const next = new Map(prev);
      next.set(sectionId, checked);
      return next;
    });
  }, []);

  const handleChangeSecondaryText = useCallback((fieldId: number, value: string) => {
    setSecondaryTextById((prev) => {
      const next = new Map(prev);
      next.set(fieldId, value);
      return next;
    });
  }, []);

  // Build the tree view from the /config payload, deriving each checkbox from the
  // live form visibility map so the popup and the rendered form stay in sync.
  const treeSections = useMemo<WidgetTreeSectionView[]>(
    () =>
      configSections.map((section) => ({
        sectionId: section.sectionId,
        label: section.sectionGuiName?.trim() || section.sectionName || "Section",
        visible: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            label: (field.fieldGuiName ?? "").trim() || field.fieldName,
            secondaryText: secondaryTextById.get(field.fieldId) ?? (field.fieldSecondaryText ?? ""),
            checked: configEntry ? configEntry.visible : field.fieldVisibility !== false,
            controllable: WIDGET_CONTROLLABLE_FIELD_NAMES.has(key),
          };
        }),
      })),
    [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig],
  );

  // PATCH the current section/field visibility for every configured field back to
  // the server in the documented { data: [{ sectionId, sectionGuiName,
  // sectionVisibility, fields: [{ fieldId, fieldSecondaryText, fieldVisibility }] }] }
  // shape. Throws on failure so the hosting modal stays open (useApi toasts the error);
  // on success it resolves and the modal closes itself.
  const handleVisibilitySubmit = useCallback(async () => {
    const payload = {
      data: configSections.map((section) => ({
        sectionId: section.sectionId,
        sectionGuiName: section.sectionGuiName,
        sectionVisibility: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldSecondaryText: secondaryTextById.get(field.fieldId) ?? field.fieldSecondaryText,
            fieldVisibility: configEntry ? configEntry.visible : field.fieldVisibility !== false,
          };
        }),
      })),
    };
    await saveVisibility({ body: payload });
  }, [configSections, sectionVisibility, secondaryTextById, widgetFieldConfig, saveVisibility]);

  // While the Visible Settings modal is open, intercept Escape/F5 in the capture
  // phase so they act on it alone — without this, the underlying create/update
  // modal's window-level Escape would also fire and close both. F5 mirrors the
  // legacy "Save (F5)" shortcut.
  useEffect(() => {
    if (!visibilityModalOpen) {
      return;
    }
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        visibilityControllerRef.current?.closeModal();
      } else if (event.key === "F5") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!savingVisibility) {
          void handleVisibilitySubmit()
            .then(() => visibilityControllerRef.current?.closeModal())
            .catch(() => {
              // Error toast handled by useApi; keep the modal open to retry.
            });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => window.removeEventListener("keydown", handleKeyDownCapture, true);
  }, [visibilityModalOpen, savingVisibility, handleVisibilitySubmit]);

  // The Visible Settings modal hosts the whole tree as a single custom field so it
  // reuses the standard ERP modal chrome (header, backdrop, Save/Cancel footer).
  const visibilityVariant = useMemo<ERPDynamicModalVariant>(
    () => ({
      key: "visibility",
      cardTitle: "Visible Settings",
      cardDescription: "",
      cardButtonLabel: "Open",
      modalTitle: "Visible Settings",
      submitLabel: "Save (F5)",
      fields: [
        {
          name: "visibilityTree",
          label: "",
          type: "custom",
          colSpan: 2,
          render: () => (
            <WidgetVisibilityTree
              sections={treeSections}
              loading={treeLoading}
              error={treeError}
              disabled={savingVisibility}
              onToggleSection={handleToggleSection}
              onToggleField={handleToggleField}
              onChangeSecondaryText={handleChangeSecondaryText}
            />
          ),
        },
      ],
    }),
    [
      treeSections,
      treeLoading,
      treeError,
      savingVisibility,
      handleToggleSection,
      handleToggleField,
      handleChangeSecondaryText,
    ],
  );

  return (
    <>
    <CrudMasterPage
      title="Item Group"
      auditHistory={{ screenName: "Item Group Master" }}
      entityLabel="item group"
      entityLabelPlural="item groups"
      apiEndpoints={API_ENDPOINTS}
      buildListQuery={buildListQuery}
      toolbarContent={
        <div className={styles.filterCheckGroup}>
          <label className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={wantDelete}
              onChange={(event) => setWantDelete(event.target.checked)}
            />
            Show deleted records
          </label>
        </div>
      }
      gridTableName={GRID_TABLE_NAME}
        listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item Group List"
      listTitleOverride="Item Group List"
      createLabel="Add Item Group"
      codeColumnHeader="Group Code"
      nameColumnHeader="Group Name"
      nameFieldLabel="Item Group Name"
      nameFieldPlaceholder="Enter item group name"
      formTitle="Item Group Form"
      formDescription="Create and update item groups."
        viewModalTitle="Group Details"
      createModalTitle="Group Entry"
      editModalTitle="Edit Group Entry"
      customFields={formFields}
      createInitialValues={INITIAL_FORM_VALUES}
      modalPanelStyle={{ width: "min(52rem, calc(100vw - 2rem))", maxHeight: "min(82vh, 42rem)" }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) || defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) || defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) || defaults.masterShortName,
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) || defaults.masterDescription,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
          parentGroupId: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_PARENT_ID_KEYS)),
          groupLevel: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_LEVEL_KEYS)) || "0",
          groupTaxClaim: toSelectBoolean(
            getFirstDefinedValue(rowSource, GROUP_TAX_CLAIM_KEYS),
            "false",
          ),
          groupDefaultTaxId: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEFAULT_TAX_ID_KEYS)),
          groupDefaultHsn: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEFAULT_HSN_KEYS)),
          groupDefaultUomId: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_DEFAULT_UOM_ID_KEYS)),
          groupPhotoUrl: toDisplayValue(getFirstDefinedValue(rowSource, GROUP_PHOTO_URL_KEYS)),
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const groupName = (values.masterName ?? "").trim();
        const groupCode = (values.searchCode ?? "").trim();
        const groupAlias = (values.masterAlias ?? "").trim() || groupCode;
        const groupShort = (values.masterShortName ?? "").trim() || groupCode || groupAlias;
        const groupDescription = toNullableString(values.masterDescription ?? "");
        const uploadedImage = files.itgPhoto;
        const groupPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : undefined;

        return {
          itg_name: groupName,
          itg_alias: groupAlias || null,
          itg_short: groupShort || null,
          itg_description: groupDescription,
          itg_parent_id: toNullableReference(values.parentGroupId ?? ""),
          itg_sort: toInteger(values.position ?? "0", 0),
          itg_level: Math.max(0, toInteger(values.groupLevel ?? "0", 0)),
          itg_tax_claim: (values.groupTaxClaim ?? "false") === "true",
          itg_default_tax_id: toNullableReference(values.groupDefaultTaxId ?? ""),
          itg_default_hsn: (values.groupDefaultHsn ?? "").trim(),
          itg_default_uom_id: toNullableReference(values.groupDefaultUomId ?? ""),
          itg_photo_url: (values.groupPhotoUrl ?? "").trim(),
          ...(groupPhoto ? { itg_photo: groupPhoto } : {}),
          ...(shouldUpdate && editingItemId !== null ? { itg_id: toUpdateId(editingItemId) } : {}),
        };
      }}
    />
    <ERPDynamicModalForm
      title="Visible Settings"
      variants={[visibilityVariant]}
      showDefaultCards={false}
      hideSectionHeader
      resetOnSubmit={false}
      panelStyle={{ width: "min(680px, calc(100vw - 2rem))", maxHeight: "min(82vh, 620px)" }}
      onControllerReady={(controller) => {
        visibilityControllerRef.current = controller;
      }}
      onOpenChange={(open) => setVisibilityModalOpen(open)}
      onSubmit={() => handleVisibilitySubmit()}
    />
    </>
  );
}
