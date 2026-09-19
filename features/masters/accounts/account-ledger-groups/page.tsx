"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
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
  type ERPDynamicModalField,
  type ERPDynamicModalVariant,
  type ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";
import { useDataRefresh } from "@/lib/data-freshness";
import { buildGridDeletedParam, type ConfiguredGridKey } from "@/lib/configured-grids";
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";
/**
 * The Grid Master row this list reads — "MAIN LIST - ACCOUNT GROUP". `CrudMasterPage`
 * resolves it to a grid id at runtime (see lib/configured-grids), and uses it
 * for both the rows and the configured columns.
 */
const LIST_GRID_KEY = "accountGroupList" satisfies ConfiguredGridKey;
const API_ENDPOINTS = {
  getById: "/account-groups/get",
  create: "/account-groups/create",
  delete: "/account-groups/delete",
} as const;
const GRID_TABLE_NAME = "account_groups";
// The form fields below are re-labelled, re-ordered, and shown/hidden from the
// backend widget-masters config (fixed.form_section / form_field) for this
// screen's menu id. Only those three properties come from the API — validation,
// state shape, and submit logic stay defined locally.
const WIDGET_CONFIG_ENDPOINT = "/widget-masters/get";
const WIDGET_SECTION_MENU_ID = 54;
// Platform filter for widget sections. The server validates it against its
// WidgetPlatform enum (Mobile | Desktop | Web) case-sensitively AND matches the
// stored section_platform exactly — the ledger-group fields live on the "Web" section.
const WIDGET_SECTION_PLATFORM = "Web";
// Bridge each hardcoded form field `name` to the backend `fieldName` it is
// configured under on menu 54's "Web" section (matched case-insensitively).
const WIDGET_FIELD_NAME_BY_FORM_FIELD: Record<string, string> = {
  masterName: "group_name",
  masterShortName: "group_short",
  accGroupParentId: "group_parent",
  position: "group_sort",
  masterDescription: "group_description",
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
const LOOKUP_KEYS = {
  id: ["accGroupId", "acc_group_id", "id", "_id"],
  code: ["accGroupAlias", "acc_group_alias", "accGroupShort", "acc_group_short", "code"],
  name: ["accGroupName", "acc_group_name", "name"],
  short: ["accGroupShort", "acc_group_short", "short", "short_name", "shortName"],
  alias: ["accGroupAlias", "acc_group_alias", "alias"],
  active: ["accGroupIsActive", "acc_group_is_active", "isActive", "is_active", "status"],
  position: ["accGroupSort", "acc_group_sort", "position", "sort"],
  description: ["accGroupDescription", "acc_group_description", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "accountGroups", "account_groups"],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "accGroupId",
  name: "accGroupName",
  alias: "accGroupAlias",
  short: "accGroupShort",
  description: "accGroupDescription",
  sort: "accGroupSort",
} as const;
const GROUP_PARENT_ID_KEYS = ["accGroupParentId", "acc_group_parent_id"] as const;
// `/account-groups/get` resolves the parent's name alongside its id, so the trigger can
// show the saved parent on edit/view before the lazy list has loaded.
const GROUP_PARENT_NAME_KEYS = ["accGroupParentName", "acc_group_parent_name"] as const;
const DEFAULT_SELECT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
// Group Parent is a lazy, server-side searchable configured dropdown: fixed.dropdown_details
// id 23 (ACCOUNT GROUPS -> active, undeleted accounts.acc_group_master rows). Nothing is
// fetched until the field is opened; typing re-queries the server (columns acc_group_short
// and acc_group_name are filter-enabled). Rows carry the raw SQL column names, not the
// id/name shape master-lookups returns, hence the explicit key lists.
const PARENT_GROUP_DROPDOWN_CONFIG = {
  dropdownKey: "accountGroup",
  idKeys: ["acc_group_id", "accGroupId"] as const,
  labelKeys: ["acc_group_name", "accGroupName"] as const,
  defaultOption: DEFAULT_SELECT_OPTION,
} as const;
const ACCOUNT_GROUP_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  masterDescription: "",
  accGroupParentId: "",
  position: "0",
} as const;
function buildAccountGroupFormFields(
  parentGroupOptions: ERPDynamicSelectOption[],
  parentGroupHandlers: LazyDropdownHandlers,
): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Group Name",
      required: true,
      colSpan: 2,
      validation: {
        minLength: 2,
        minLengthMessage: "Group Name must be at least 2 characters.",
      },
    },
    // {
    //   name: "masterAlias",
    //   label: "Group Alias",
    // },
    {
      name: "masterShortName",
      label: "Group Short",
      colSpan: 2,
    },
    {
      name: "accGroupParentId",
      label: "Group Parent",
      required: true,
      type: "select",
      colSpan: 2,
      searchable: true,
      // The server does the filtering; don't also filter the fetched page client-side.
      serverSearch: true,
      options: parentGroupOptions,
      onSearchOpenChange: parentGroupHandlers.onSearchOpenChange,
      onSearchQueryChange: parentGroupHandlers.onSearchQueryChange,
      onValueChange: parentGroupHandlers.onValueChange,
    },
    {
      name: "position",
      label: "Group Sort",
      type: "number",
      colSpan: 1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Group Sort must be 0 or greater.",
      },
    },
    {
      name: "masterDescription",
      label: "Group Description",
       colSpan:2
    }
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
export default function AccountLedgerGroupsMasterPage() {
  const parentGroup = useLazyConfiguredDropdown(PARENT_GROUP_DROPDOWN_CONFIG);
  // Silent progressive enhancement: a failed config fetch leaves the form on its
  // hardcoded labels/order (empty map), so don't nag the user with an error toast.
  const { getAll: getWidgetConfig } = useApi<WidgetMastersResponse>(WIDGET_CONFIG_ENDPOINT, {
    toast: { error: false },
  });
  const [widgetFieldConfig, setWidgetFieldConfig] = useState<Map<string, ResolvedFieldConfig>>(
    () => new Map(),
  );
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted account groups. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
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
  const accountGroupFormFields = useMemo(
    () =>
      applyWidgetFieldConfig(
        buildAccountGroupFormFields(parentGroup.options, parentGroup.handlers),
        widgetFieldConfig,
        WIDGET_FIELD_NAME_BY_FORM_FIELD,
      ),
    [parentGroup.options, parentGroup.handlers, widgetFieldConfig],
  );
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 25's stored SQL; keys with no matching token are ignored. `wantdelete` is
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
      grid_param: JSON.stringify(buildGridDeletedParam(LIST_GRID_KEY, wantDelete)),
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
  // "Web" platform to match the configured ledger-group section.
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
      title="Account Group"
      iconName="account_group_master"
      auditHistory={{ screenName: "Account Group Master" }}
      entityLabel="account group"
      entityLabelPlural="account groups"
      apiEndpoints={API_ENDPOINTS}
      gridKey={LIST_GRID_KEY}
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
      listTitle="Account Group List"
      createLabel="Add"
      codeColumnHeader="Group Code"
      nameColumnHeader="Group Name"
      nameFieldLabel="Group Name"
      nameFieldPlaceholder="Sundry Debtors"
      formTitle="Account Group Form"
      viewModalTitle="Group Entry"
      createModalTitle="Group Entry"
      editModalTitle="Edit Group Entry"
      formDescription="Create and update account groups."
      modalPanelStyle={{ width: "min(40rem, calc(calc(100vw/var(--erp-ui-scale)) - 2.4rem))" }}
      customFields={accountGroupFormFields}
      createInitialValues={ACCOUNT_GROUP_INITIAL_FORM_VALUES}
      onModalOpenChange={(open, variantKey) => {
        // Clear the lazy Group Parent dropdown when the create modal opens so no
        // selection from a previously edited group lingers (it reloads on open).
        if (open && variantKey === "master-create") {
          parentGroup.seedSelected("", "");
        }
      }}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        const accGroupParentId = toDisplayValue(
          getFirstDefinedValue(rowSource, GROUP_PARENT_ID_KEYS),
        );
        // Seed the lazy dropdown so the trigger shows the saved parent's name on
        // edit/view, before the list is opened and fetched.
        parentGroup.seedSelected(
          accGroupParentId,
          toDisplayValue(getFirstDefinedValue(rowSource, GROUP_PARENT_NAME_KEYS)),
        );
        return {
          ...ACCOUNT_GROUP_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
          accGroupParentId,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || defaults.position,
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const groupName = (values.masterName ?? "").trim();
        const groupShort = (values.masterShortName ?? "").trim();
        const groupDescription = (values.masterDescription ?? "").trim();
        const groupSort = Math.max(0, toInteger(values.position ?? "0", 0));
        return {
          accGroupName: groupName,
          accGroupShort: groupShort || null,
          accGroupDescription: groupDescription || null,
          accGroupParentId: toNullableReference(values.accGroupParentId ?? ""),
          accGroupSort: groupSort,
          ...(shouldUpdate && editingItemId !== null
            ? { accGroupId: String(editingItemId) }
            : {}),
        };
      }}
    />
    <ERPDynamicModalForm
      title="Visible Settings"
      variants={[visibilityVariant]}
      showDefaultCards={false}
      hideSectionHeader
      resetOnSubmit={false}
      panelStyle={{ width: "min(680px, calc(calc(100vw/var(--erp-ui-scale)) - 2rem))", maxHeight: "min(calc(82vh/var(--erp-ui-scale)), 620px)" }}
      onControllerReady={(controller) => {
        visibilityControllerRef.current = controller;
      }}
      onOpenChange={(open) => setVisibilityModalOpen(open)}
      onSubmit={() => handleVisibilitySubmit()}
    />
    </>
  );
}