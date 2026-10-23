"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useSoftDeleteActions } from "@/features/masters/shared/use-soft-delete-actions";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import { useVisibleSettingsContextMenu } from "@/features/masters/shared/use-visible-settings-context-menu";
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
  type ERPDynamicModalDraftAppliedPayload,
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
  type UseLazyConfiguredDropdownOptions,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import { useDataRefresh } from "@/lib/data-freshness";
const API_ENDPOINTS = {
 list: "/configured-grid-sql/run?grid_id=10",
  getById: "/item-sections/get",
  create: "/item-sections/create",
  delete: "/item-sections/delete",
} as const;
const GRID_TABLE_NAME = "item_section_master";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 37;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the section fields live on the "Web" section.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` to the backend `fieldName` it is
// configured under on menu 37's section (matched case-insensitively). secColorCode
// has no configured field, so it keeps its hardcoded label and renders after all
// configured fields.
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "item_section_name",
  masterShortName: "item_short",
  position: "item_position",
  secParentId: "item_parent",
  masterDescription: "iten_description",
  secPhoto: "item_image",
};
// Right-clicking inside the open create/update modal opens a tree popup of this
// menu's configured sections/fields (GET /widget-masters/config?menu_id=…).
// Ticking a field toggles its live visibility in the form via the same config map.
const WIDGET_CONFIG_TREE_ENDPOINT = "/widget-masters/config";
// Persists the tree's section/field visibility back to the server (PATCH).
const WIDGET_VISIBILITY_ENDPOINT = "/widget-masters/visibility";
// Backend fieldNames (lowercased) that map to a real form field, so their popup
// checkbox can actually show/hide something. Others are left out of the popup.
const WIDGET_CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames(WIDGET_FIELD_NAME_BY_FORM_FIELD);
// Parent Section is the lazy, server-side searchable configured dropdown "ITEM
// SECTIONS" (sec_id, sec_name … from item_section_master live rows), loaded on open
// and on debounced typing. Editing a section sends `dropdown_param`
// {"iexclude_id": <this section>}: the list then leaves out the section and
// everything under it — a pick there is a cycle the server refuses only after Save
// (Qt 4ae6575). A create sends no param.
const PARENT_SECTION_DROPDOWN = {
  dropdownKey: "itemSection",
  idKeys: ["sec_id", "secId"],
  labelKeys: ["sec_name", "secName"],
  defaultOption: { value: "", label: "None" },
} as const satisfies UseLazyConfiguredDropdownOptions;
const LOOKUP_KEYS = {
  id: [
    "sec_id",
    "secId",
    "section_id",
    "sectionId",
    "id",
    "_id",
    "its_id",
    "itemsectionid",
    "item_section_id",
    "itemSectionId",
  ],
  code: [
    "sec_code",
    "secCode",
    "sec_alias",
    "sec_short",
    "section_code",
    "sectionCode",
    "code",
    "its_alias",
    "its_short",
    "sectionalias",
    "sectionshort",
  ],
  name: [
    "sec_name",
    "secName",
    "section_name",
    "sectionName",
    "name",
    "its_name",
    "itemsectionname",
    "item_section_name",
    "itemSectionName",
  ],
  short: [
    "sec_short",
    "its_short",
    "short_name",
    "shortName",
    "short",
    "sectionshort",
    "itemsectionshort",
    "item_section_short",
  ],
  alias: [
    "sec_alias",
    "its_alias",
    "alias",
    "section_alias",
    "sectionalias",
    "itemsectionalias",
    "item_section_alias",
  ],
  active: [
    "sec_active",
    "sec_is_active",
    "its_active",
    "active",
    "is_active",
    "isActive",
    "isactive",
    "status",
  ],
  position: ["sec_position", "position", "sec_sort", "its_sort", "sort"],
  description: ["sec_description", "its_description", "description", "desc"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "sections",
    "itemSections",
    "item_sections",
  ],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "sec_id",
  name: "sec_name",
  alias: "sec_alias",
  short: "sec_short",
  description: "sec_description",
  sort: "sec_sort",
} as const;
const SECTION_PARENT_ID_KEYS = [
  "sec_parent_id",
  "section_parent_id",
  "parent_id",
  "parentId",
] as const;
const SECTION_PARENT_NAME_KEYS = [
  "sec_parent_name",
  "section_parent_name",
  "parent_name",
  "parentName",
] as const;
const SECTION_LEVEL_KEYS = ["sec_level", "section_level", "level"] as const;
const SECTION_COLOR_CODE_KEYS = [
  "sec_color_code",
  "section_color_code",
  "color_code",
  "colorCode",
] as const;
const SECTION_ICON_KEYS = ["sec_icon", "section_icon", "icon"] as const;
const SECTION_PHOTO_URL_KEYS = ["sec_photo_url", "section_photo_url", "photo_url", "photoUrl"] as const;
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
  DEBOUNCE_MS: 300,
} as const;
const SECTION_INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  position: "0",
  secParentId: "",
  secLevel: "0",  
  secColorCode: "",
  secIcon: "",
  secPhotoUrl: "",
  masterDescription: "",
} as const;
function buildSectionFormFields(
  sectionOptions: ERPDynamicSelectOption[],
  lazyParent: LazyDropdownHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Item Section Name",
      colSpan:2,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Section Name must be at least 2 characters.",
      },
    },   
    // {
    //   name: "masterAlias",
    //   label: "Section Alias",
    //   colSpan:2,
    // },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan:2,
    },
    {
      name: "position",
      label: "Position",
      type: "number",
      colSpan:1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "secParentId",
      label: "Parent Section ",
      type: "select",
      colSpan:2,
      searchable: true,
      serverSearch: true,
      options: sectionOptions,
      onSearchOpenChange: lazyParent.onSearchOpenChange,
      onSearchQueryChange: lazyParent.onSearchQueryChange,
      onValueChange: lazyParent.onValueChange,
    },
    
    {
      name: "secColorCode",
      label: "Color Code",
      type: "color",
      helperText: "Choose a color.",
    },
    {
      name: "masterDescription",
      label: "Description",
      colSpan: 2,
    },
    {
      name: "secPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Optional. Sent as base64 in sec_photo.",
      colSpan: 2,
    },
  ];
}
function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function toReferenceValue(value: string): string {
  const normalized = value.trim();
  return normalized;
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
export default function ItemSectionMasterPage() {
  // The section being edited, left out of its own parent list (with its subtree);
  // "" on a create.
  const [excludeParentId, setExcludeParentId] = useState("");
  const parentSection = useLazyConfiguredDropdown({
    ...PARENT_SECTION_DROPDOWN,
    params: { iexclude_id: excludeParentId },
  });
  const seedParentSection = parentSection.seedSelected;
  // The <id, name> Parent Section was seeded with as the popup opened, so a
  // draft's Discard can name the record's own parent again.
  const openingParentRef = useRef({ id: "", name: "" });
  // A restored draft (or its Discard) sets Parent Section without the user
  // picking it: re-seed it so it shows a name — the record's own for the value
  // the popup opened on, else the one the draft saved beside its choice.
  const applyDraftParentSelection = useCallback(
    ({ values, labels }: ERPDynamicModalDraftAppliedPayload) => {
      const id = (values.secParentId ?? "").trim();
      const opening = openingParentRef.current;
      const openingName = id && id === opening.id ? opening.name : "";
      seedParentSection(id, id ? openingName || labels.secParentId?.[id] || "" : "");
    },
    [seedParentSection],
  );
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted item sections. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Live view: Delete. Deleted view: the same button is Restore (`POST
  // /item-sections/restore`), and Edit / View are refused. A refusal is titled for what
  // was refused — "Cannot delete" / "Cannot restore", not "Cannot save".
  const softDeleteProps = useSoftDeleteActions({
    showingDeleted: wantDelete,
    deleteEndpoint: API_ENDPOINTS.delete,
    restoreEndpoint: "/item-sections/restore",
    idParam: "sec_id",
    idKeys: LOOKUP_KEYS.id,
    entityTitle: "Item section",
    plainRefusals: true,
  });
  // Field config comes from the database, so it is read on mount and again on
  // every data-refresh signal instead of only once per page load.
  const loadWidgetFieldConfig = useCallback(() => {
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
  useEffect(() => loadWidgetFieldConfig(), [loadWidgetFieldConfig]);
  useDataRefresh(() => {
    loadWidgetFieldConfig();
  });
  const sectionFormFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildSectionFormFields(parentSection.options, parentSection.handlers),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [parentSection.options, parentSection.handlers, widgetFieldConfig],
  );
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 10's stored SQL; keys with no matching token are ignored. `wantdelete` is
  // driven by the "Show deleted records" checkbox beside the list search input.
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
  // Fetched lazily the first time the popup is opened, then cached. Scoped to the
  // "Web" platform so the legacy non-Web section on this menu stays out of the tree.
  const loadConfigTree = useCallback(async () => {
    if (treeLoadedRef.current) {
      return;
    }
    treeLoadedRef.current = true;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const payload = await getWidgetConfigTree({
        menu_id: String(WIDGET_SECTION_MENU_ID),
        platform: WIDGET_SECTION_PLATFORM,
      });
      setConfigSections(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      treeLoadedRef.current = false;
      setTreeError("Unable to load field configuration.");
    } finally {
      setTreeLoading(false);
    }
  }, [getWidgetConfigTree]);
  // Right-clicking inside the open create/update modal opens the Visible Settings
  // modal (an ERPDynamicModalForm) on top via its controller; right-clicks
  // elsewhere keep the browser's native context menu.
  useVisibleSettingsContextMenu({
    loadConfigTree,
    openVisibilitySettings: () => visibilityControllerRef.current?.openModal("visibility"),
  });
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
  // on success it resolves and the modal closes itself. sectionGuiName and
  // fieldSecondaryText are coerced to non-null strings — the server DTO requires a
  // string (sectionGuiName is also @IsNotEmpty) and rejects the null an unset config
  // value carries.
  const handleVisibilitySubmit = useCallback(async () => {
    const payload = {
      data: configSections.map((section) => ({
        sectionId: section.sectionId,
        sectionGuiName: section.sectionGuiName?.trim() || section.sectionName || "Section",
        sectionVisibility: sectionVisibility.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (Array.isArray(section.fields) ? section.fields : []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          const configEntry = widgetFieldConfig.get(key);
          return {
            fieldId: field.fieldId,
            fieldSecondaryText: secondaryTextById.get(field.fieldId) ?? field.fieldSecondaryText ?? "",
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
      {...softDeleteProps}
      modalDraftKey="item-section"
      onModalDraftApplied={applyDraftParentSelection}
      title="Item Section"
      iconName="item_section_master_entry"
      auditHistory={{ screenName: "Item Section Master" }}
      entityLabel="item section"
      entityLabelPlural="item sections"
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
        gridDetailId={10}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item Section List"
      listTitleOverride="Item Section  List"
      createLabel="Add "
      codeColumnHeader="Item Section Code"
      nameColumnHeader="Item Section Name"
      nameFieldLabel="Item Section Name"
      nameFieldPlaceholder="Frozen Foods"
      formTitle="Item Section Form"
      formDescription="Create and update items Sections."
      viewModalTitle="Item Section Details"
      createModalTitle="Item Section Entry"
      editModalTitle="Edit Item Section Entry"
      modalPanelStyle={{ width: "min(52rem, calc(100vw - 2rem))", maxHeight: "min(82vh, 42rem)" }}
      customFields={sectionFormFields}
      createInitialValues={SECTION_INITIAL_FORM_VALUES}
      onModalOpenChange={(open, variantKey) => {
        // A create: no record to leave out, no saved parent to show.
        if (open && variantKey === "master-create") {
          setExcludeParentId("");
          seedParentSection("", "");
          openingParentRef.current = { id: "", name: "" };
        }
      }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const secParentId = toDisplayValue(getFirstDefinedValue(rowSource, SECTION_PARENT_ID_KEYS));
        const secParentName = toDisplayValue(getFirstDefinedValue(rowSource, SECTION_PARENT_NAME_KEYS));
        setExcludeParentId(toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.id)));
        openingParentRef.current = { id: secParentId, name: secParentName };
        // Seed the lazy dropdown so the trigger shows the saved parent's name on
        // edit/view, before the list is opened and fetched.
        seedParentSection(secParentId, secParentName);
        return {
          ...SECTION_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) || defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position,
          secParentId,
          secLevel: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_LEVEL_KEYS)) || "0",
          secColorCode: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_COLOR_CODE_KEYS)),
          secIcon: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_ICON_KEYS)),
          secPhotoUrl: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_PHOTO_URL_KEYS)),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const sectionName = (values.masterName ?? "").trim();
        const searchCode = (values.searchCode ?? "").trim();
        const sectionAlias = (values.masterAlias ?? "").trim() || searchCode;
        const sectionShort = (values.masterShortName ?? "").trim() || searchCode || sectionAlias;
        const sectionDescription = (values.masterDescription ?? "").trim();
        const sectionSort = toInteger(values.position ?? "", 0);
        const uploadedImage = files.secPhoto;
        const secPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : "";
        return {
          sec_name: sectionName,
          sec_alias: sectionAlias,
          sec_short: sectionShort,
          sec_description: sectionDescription,
          sec_parent_id: toReferenceValue(values.secParentId ?? ""),
          sec_sort: sectionSort,
          sec_position: sectionSort,
          sec_color_code: (values.secColorCode ?? "").trim(),
          sec_icon: (values.secIcon ?? "").trim(),
          sec_photo: secPhoto,
          sec_photo_url: (values.secPhotoUrl ?? "").trim(),
          ...(shouldUpdate && editingItemId !== null ? { sec_id: editingItemId } : {}),
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