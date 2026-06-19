"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import InlineRelatedMasterModal from "@/features/masters/shared/inline-related-master";
import { toast } from "react-toastify";
import type {
  ERPDynamicModalController,
  ERPDynamicModalSubmitPayload,
  ERPDynamicModalVariant,
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicSearchShortcutPayload,
} from "@/components/design-system/ui/dynamic-modal-form";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import { toUpper, toNullableString } from "@/app/master/_shared/crud-utils";
import {
  API_ENDPOINTS,
  GRID_TABLE_NAME,
  CUSTOMER_MODAL_PANEL_STYLE,
  STATE_MODAL_PANEL_STYLE,
  SUPPLIER_GROUP_MODAL_PANEL_STYLE,
  SUPPLIER_GROUP_LOOKUP_ENDPOINT,
  SUPPLIER_GROUP_GET_ENDPOINT,
  SUPPLIER_GROUP_CREATE_ENDPOINT,
  COMPANY_LOOKUP_ENDPOINT,
  BRANCH_LOOKUP_ENDPOINT,
  STATE_LOOKUP_ENDPOINT,
  STATE_GET_ENDPOINT,
  STATE_CREATE_ENDPOINT,
  SUPPLIER_GROUP_LOOKUP_QUERY,
  COMPANY_LOOKUP_QUERY,
  BRANCH_LOOKUP_QUERY,
  STATE_LOOKUP_QUERY,
  GST_LOOKUP_ENDPOINT,
  GST_LOOKUP_PATTERN,
  LOOKUP_KEYS,
  REQUEST_PAYLOAD_KEYS,
  SUPPLIER_INITIAL_FORM_VALUES,
  STATE_MODAL_INITIAL_VALUES,
  SUPPLIER_GROUP_MODAL_INITIAL_VALUES,
  STATE_LOOKUP_ARRAY_KEYS,
  SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS,
  COLLECTION_DAY_OPTIONS,
} from "./constants";
import type { SupplierFormValues } from "./types";
import {
  buildSupplierGroupOptions,
  buildStateNameOptions,
  buildCompanyOptions,
  buildBranchOptions,
  buildStateCodeByName,
  buildStateNameByCode,
  extractGstLookupSource,
  buildSupplierLookupValues,
  getLookupErrorMessage,
  extractDetailSource,
  mapStateDetailToFormValues,
  mapSupplierGroupDetailToFormValues,
  toSupplierFormValues,
  resolveOptionFromShortcut,
} from "./transformers";
import {
  validateSupplierGstin,
  buildSupplierRequestPayload,
} from "./form-builder";
import {
  buildSupplierFormFields,
  buildStateModalFields,
  buildSupplierGroupModalFields,
} from "./fields-schema";

export default function SuppliersMasterPage() {
  const stateModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const supplierGroupModalControllerRef =
    useRef<ERPDynamicModalController | null>(null);

  // API Hooks
  const { getAll: getSupplierGroupLookup } = useApi<unknown>(
    SUPPLIER_GROUP_LOOKUP_ENDPOINT,
  );
  const {
    getAll: getSupplierGroupById,
    loading: supplierGroupDetailsLoading,
    error: supplierGroupDetailsError,
    reset: resetSupplierGroupDetailsState,
  } = useApi<unknown>(SUPPLIER_GROUP_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const {
    run: upsertSupplierGroup,
    loading: supplierGroupSaveLoading,
    error: supplierGroupSaveError,
    reset: resetSupplierGroupSaveState,
  } = useApi<unknown, Record<string, unknown>>(SUPPLIER_GROUP_CREATE_ENDPOINT, {
    method: "POST",
  });
  const { getAll: getCompanyLookup } = useApi<unknown>(COMPANY_LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(BRANCH_LOOKUP_ENDPOINT);
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  const {
    getAll: getStateByCode,
    loading: stateDetailsLoading,
    error: stateDetailsError,
    reset: resetStateDetailsState,
  } = useApi<unknown>(STATE_GET_ENDPOINT, {
    toast: {
      success: false,
    },
  });
  const {
    run: upsertStateCode,
    loading: stateSaveLoading,
    error: stateSaveError,
    reset: resetStateSaveState,
  } = useApi<unknown, Record<string, unknown>>(STATE_CREATE_ENDPOINT, {
    method: "POST",
  });

  // State Management
  const [supplierGroupOptions, setSupplierGroupOptions] = useState<
    ERPDynamicSelectOption[]
  >([]);
  const [companyOptions, setCompanyOptions] = useState<ERPDynamicSelectOption[]>(
    [],
  );
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>(
    [],
  );
  const [stateOptions, setStateOptions] = useState<ERPDynamicSelectOption[]>([]);
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>(
    {},
  );
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>(
    {},
  );
  const [editingStateCode, setEditingStateCode] = useState<string | null>(null);
  const [editingSupplierGroupId, setEditingSupplierGroupId] = useState<
    string | null
  >(null);
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted suppliers. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 17's stored SQL; keys with no matching token are ignored. `wantdelete` is
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

  // Cache for GST Lookups
  const gstLookupCacheRef = useRef<Record<string, Record<string, string>>>({});

  // Refresh Functions
  const refreshSupplierGroupOptions = useCallback(async () => {
    const payload = await getSupplierGroupLookup(SUPPLIER_GROUP_LOOKUP_QUERY);
    setSupplierGroupOptions(buildSupplierGroupOptions(payload));
  }, [getSupplierGroupLookup]);

  const refreshStateOptions = useCallback(async () => {
    const payload = await getStateLookup(STATE_LOOKUP_QUERY);
    setStateOptions(buildStateNameOptions(payload));
    setStateCodeByName(buildStateCodeByName(payload));
    setStateNameByCode(buildStateNameByCode(payload));
  }, [getStateLookup]);

  // Load Initial Lookup Data
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [supplierGroupPayload, companyPayload, branchPayload, statePayload] =
          await Promise.all([
            getSupplierGroupLookup(SUPPLIER_GROUP_LOOKUP_QUERY),
            getCompanyLookup(COMPANY_LOOKUP_QUERY),
            getBranchLookup(BRANCH_LOOKUP_QUERY),
            getStateLookup(STATE_LOOKUP_QUERY),
          ]);
        if (!mounted) {
          return;
        }
        setSupplierGroupOptions(buildSupplierGroupOptions(supplierGroupPayload));
        setCompanyOptions(buildCompanyOptions(companyPayload));
        setBranchOptions(buildBranchOptions(branchPayload));
        setStateOptions(buildStateNameOptions(statePayload));
        setStateCodeByName(buildStateCodeByName(statePayload));
        setStateNameByCode(buildStateNameByCode(statePayload));
      } catch {
        if (mounted) {
          setSupplierGroupOptions([]);
          setCompanyOptions([]);
          setBranchOptions([]);
          setStateOptions([]);
          setStateCodeByName({});
          setStateNameByCode({});
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [
    getBranchLookup,
    getCompanyLookup,
    getStateLookup,
    getSupplierGroupLookup,
  ]);

  // Modal Variants
  const stateCreateModalFields = useMemo(() => buildStateModalFields(false), []);
  const stateUpdateModalFields = useMemo(() => buildStateModalFields(true), []);
  const stateModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "state-create",
        cardTitle: "Create State",
        cardDescription: "Create a new state code.",
        cardButtonLabel: "Create",
        modalTitle: "New State",
        modalDescription: "Create state from supplier form.",
        submitLabel: stateSaveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: stateCreateModalFields,
      },
      {
        key: "state-update",
        cardTitle: "Update State",
        cardDescription: "Update existing state code.",
        cardButtonLabel: "Update",
        modalTitle: "Edit State",
        modalDescription: "Update state from supplier form.",
        submitLabel: stateSaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: stateUpdateModalFields,
      },
    ],
    [stateCreateModalFields, stateSaveLoading, stateUpdateModalFields],
  );

  const supplierGroupModalFields = useMemo(
    () => buildSupplierGroupModalFields(),
    [],
  );
  const supplierGroupModalVariants = useMemo<ERPDynamicModalVariant[]>(
    () => [
      {
        key: "supplier-group-create",
        cardTitle: "Create Supplier Group",
        cardDescription: "Create a new supplier group.",
        cardButtonLabel: "Create",
        modalTitle: "New Supplier Group",
        modalDescription: "Create supplier group from supplier form.",
        submitLabel: supplierGroupSaveLoading ? "Saving..." : "Save",
        accent: "blue",
        fields: supplierGroupModalFields,
      },
      {
        key: "supplier-group-update",
        cardTitle: "Update Supplier Group",
        cardDescription: "Update existing supplier group.",
        cardButtonLabel: "Update",
        modalTitle: "Edit Supplier Group",
        modalDescription: "Update supplier group from supplier form.",
        submitLabel: supplierGroupSaveLoading ? "Updating..." : "Update",
        accent: "emerald",
        fields: supplierGroupModalFields,
      },
    ],
    [supplierGroupModalFields, supplierGroupSaveLoading],
  );

  // State Modal Handlers
  const handleStateCreateShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload) => {
      const query = payload.query.trim();
      const compactQuery = query.replace(/\s+/g, "");
      resetStateSaveState();
      resetStateDetailsState();
      setEditingStateCode(null);
      stateModalControllerRef.current?.openModal("state-create", {
        values: {
          ...STATE_MODAL_INITIAL_VALUES,
          stateCode: compactQuery.length === 2 ? toUpper(compactQuery) : "",
          stateName: query,
        },
      });
    },
    [resetStateDetailsState, resetStateSaveState],
  );

  const handleStateEditShortcut = useCallback(
    async (payload: ERPDynamicSearchShortcutPayload) => {
      const matchedOption = resolveOptionFromShortcut(payload, stateOptions);
      if (!matchedOption) {
        toast.info("Type/select an existing state, then press Alt+A.");
        return;
      }
      const matchedStateName = matchedOption.value.trim();
      const matchedStateCode =
        stateCodeByName[matchedStateName]?.trim().toUpperCase() ?? "";
      if (!matchedStateCode) {
        toast.info("Select an existing state to edit.");
        return;
      }
      resetStateSaveState();
      resetStateDetailsState();
      setEditingStateCode(matchedStateCode);
      try {
        const detailPayload = await getStateByCode({
          stateCode: matchedStateCode,
        });
        const detailSource = extractDetailSource(
          detailPayload,
          STATE_LOOKUP_ARRAY_KEYS,
        );
        stateModalControllerRef.current?.openModal("state-update", {
          values: detailSource
            ? mapStateDetailToFormValues(detailSource)
            : {
                ...STATE_MODAL_INITIAL_VALUES,
                stateCode: matchedStateCode,
                stateName: matchedStateName,
              },
        });
      } catch {
        // Error UI is handled by useApi.
      }
    },
    [
      getStateByCode,
      resetStateDetailsState,
      resetStateSaveState,
      stateCodeByName,
      stateOptions,
    ],
  );

  const handleStateModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      const isUpdate = variantKey === "state-update";
      const requestedStateCode = toUpper(values.stateCode ?? "");
      const stateCode = isUpdate && editingStateCode ? editingStateCode : requestedStateCode;
      const payload: Record<string, unknown> = {
        stateCode,
        stateName: (values.stateName ?? "").trim(),
        stateUt: (values.stateUt ?? "false") === "true",
        tinCode: toNullableString(toUpper(values.tinCode ?? "")),
        isActive: (values.isActive ?? "true") === "true",
      };
      await upsertStateCode({ body: payload });
      setEditingStateCode(null);
      await refreshStateOptions();
    },
    [editingStateCode, refreshStateOptions, upsertStateCode],
  );

  const handleStateModalCancel = useCallback(() => {
    if (stateSaveLoading || stateDetailsLoading) {
      return;
    }
    resetStateSaveState();
    resetStateDetailsState();
    setEditingStateCode(null);
  }, [
    resetStateDetailsState,
    resetStateSaveState,
    stateDetailsLoading,
    stateSaveLoading,
  ]);

  // Supplier Group Modal Handlers
  const handleSupplierGroupCreateShortcut = useCallback(
    (payload: ERPDynamicSearchShortcutPayload) => {
      resetSupplierGroupSaveState();
      resetSupplierGroupDetailsState();
      setEditingSupplierGroupId(null);
      supplierGroupModalControllerRef.current?.openModal("supplier-group-create", {
        values: {
          ...SUPPLIER_GROUP_MODAL_INITIAL_VALUES,
          spgName: payload.query.trim(),
        },
      });
    },
    [resetSupplierGroupDetailsState, resetSupplierGroupSaveState],
  );

  const handleSupplierGroupEditShortcut = useCallback(
    async (payload: ERPDynamicSearchShortcutPayload) => {
      const selectedGroupId = payload.value.trim();
      if (!selectedGroupId) {
        toast.info("Select an existing supplier group to edit.");
        return;
      }
      const matchedOption = supplierGroupOptions.find(
        (option) => option.value.trim() === selectedGroupId,
      );
      if (!matchedOption) {
        toast.info("Select an existing supplier group to edit.");
        return;
      }
      const matchedGroupId = matchedOption.value.trim();
      resetSupplierGroupSaveState();
      resetSupplierGroupDetailsState();
      setEditingSupplierGroupId(matchedGroupId);
      try {
        const detailPayload = await getSupplierGroupById({
          spgId: matchedGroupId,
        });
        const detailSource = extractDetailSource(
          detailPayload,
          SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS,
        );
        supplierGroupModalControllerRef.current?.openModal("supplier-group-update", {
          values: detailSource
            ? mapSupplierGroupDetailToFormValues(detailSource)
            : {
                ...SUPPLIER_GROUP_MODAL_INITIAL_VALUES,
                spgName: matchedOption.label,
              },
        });
      } catch {
        // Error UI is handled by useApi.
      }
    },
    [
      getSupplierGroupById,
      resetSupplierGroupDetailsState,
      resetSupplierGroupSaveState,
      supplierGroupOptions,
    ],
  );

  const handleSupplierGroupModalSubmit = useCallback(
    async ({ variantKey, values }: ERPDynamicModalSubmitPayload) => {
      const isUpdate = variantKey === "supplier-group-update";
      const payload: Record<string, unknown> = {
        spgName: (values.spgName ?? "").trim(),
        spgShort: toNullableString(values.spgShort ?? ""),
        spgDesc: toNullableString(values.spgDesc ?? ""),
        spgIsActive: (values.spgIsActive ?? "true") === "true",
      };
      if (isUpdate) {
        if (!editingSupplierGroupId) {
          return;
        }
        payload.spgId = editingSupplierGroupId;
      }
      await upsertSupplierGroup({ body: payload });
      setEditingSupplierGroupId(null);
      await refreshSupplierGroupOptions();
    },
    [editingSupplierGroupId, refreshSupplierGroupOptions, upsertSupplierGroup],
  );

  const handleSupplierGroupModalCancel = useCallback(() => {
    if (supplierGroupSaveLoading || supplierGroupDetailsLoading) {
      return;
    }
    resetSupplierGroupSaveState();
    resetSupplierGroupDetailsState();
    setEditingSupplierGroupId(null);
  }, [
    resetSupplierGroupDetailsState,
    resetSupplierGroupSaveState,
    supplierGroupDetailsLoading,
    supplierGroupSaveLoading,
  ]);

  // Form Field Value Change Handlers
  const handleSupplierGstinValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(
      async ({ value }) => {
        const normalizedGstin = value.trim().toUpperCase();
        const normalizedValuePatch =
          normalizedGstin && normalizedGstin !== value
            ? { supGstNo: normalizedGstin }
            : undefined;
        if (!GST_LOOKUP_PATTERN.test(normalizedGstin)) {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: { supGstNo: null },
          };
        }
        const cachedValues = gstLookupCacheRef.current[normalizedGstin];
        if (cachedValues) {
          return {
            values: cachedValues,
            errors: { supGstNo: null },
          };
        }
        try {
          const response = await fetch(
            `${GST_LOOKUP_ENDPOINT}?gstin=${encodeURIComponent(normalizedGstin)}`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                Accept: "application/json",
              },
            },
          );
          const payload = (await response.json().catch(() => null)) as unknown;
          if (!response.ok) {
            return {
              ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
              errors: {
                supGstNo: getLookupErrorMessage(
                  payload,
                  "Unable to load GST details for this GSTIN.",
                ),
              },
            };
          }
          const lookupSource = extractGstLookupSource(payload);
          if (!lookupSource) {
            return {
              ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
              errors: {
                supGstNo: "GST details were not available for this GSTIN.",
              },
            };
          }
          const resolvedValues = buildSupplierLookupValues(
            normalizedGstin,
            lookupSource,
            stateNameByCode,
          );
          gstLookupCacheRef.current[normalizedGstin] = resolvedValues as Record<
            string,
            string
          >;
          return {
            values: resolvedValues,
            errors: { supGstNo: null },
          };
        } catch {
          return {
            ...(normalizedValuePatch ? { values: normalizedValuePatch } : {}),
            errors: {
              supGstNo:
                "Unable to load GST details right now. Please try again.",
            },
          };
        }
      },
      [stateNameByCode],
    );

  const handleSupplierStateValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(({ value }) => ({
      values: {
        supRegionStateName: value.trim(),
      },
    }), []);

  // Build Form Fields
  const supplierFormFields = useMemo(
    () =>
      buildSupplierFormFields(
        supplierGroupOptions,
        companyOptions,
        branchOptions,
        stateOptions,
        handleSupplierGroupCreateShortcut,
        handleSupplierGroupEditShortcut,
        handleStateCreateShortcut,
        handleStateEditShortcut,
        handleSupplierStateValueChange,
        handleSupplierGstinValueChange,
      ),
    [
      branchOptions,
      companyOptions,
      handleSupplierGstinValueChange,
      handleSupplierStateValueChange,
      handleStateCreateShortcut,
      handleStateEditShortcut,
      handleSupplierGroupCreateShortcut,
      handleSupplierGroupEditShortcut,
      stateOptions,
      supplierGroupOptions,
    ],
  );

  return (
    <>
      <CrudMasterPage
        title="Supplier"
        auditHistory={{ screenName: "Supplier Master" }}
        entityLabel="supplier"
        entityLabelPlural="suppliers"
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
        gridDetailId={17}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={styles}
        listTitle="Supplier List"
        createLabel="Add Supplier"
        codeColumnHeader="Purchase Type"
        nameColumnHeader="Supplier Name"
        nameFieldLabel="Supplier Name"
        nameFieldPlaceholder="ABC Distributors"
        modalPanelStyle={CUSTOMER_MODAL_PANEL_STYLE}
        modalFormGridColumns={3}
        modalStackLabels
        modalSectionNavigationMode="tabs"
        modalHideFieldHelperText
        modalHideFieldErrorText
        modalFocusFirstInvalidFieldOnValidationError
        modalEnableArrowKeyFieldNavigation
        formTitle="Supplier Form"
        formDescription="Create and update suppliers."
        customFields={supplierFormFields}
        columnRenderOverrides={{
          sup_collection_days: (row) => {
            const value = row.__source?.sup_collection_days;
            if (!value) return "-";
            const days = Array.isArray(value) ? value : String(value).split(",").filter(Boolean);
            const dayNames = days.map((d) => {
              const found = COLLECTION_DAY_OPTIONS.find((opt) => opt.value === String(d).trim());
              return found ? found.label : String(d);
            });
            return dayNames.filter(Boolean).join(", ") || "-";
          },
        }}
        createInitialValues={SUPPLIER_INITIAL_FORM_VALUES}
        mapFormValues={({ source, defaults }) => {
          return toSupplierFormValues(
            (source ?? {}) as Record<string, unknown>,
            (defaults ?? {}) as Record<string, unknown>,
            stateCodeByName,
            SUPPLIER_INITIAL_FORM_VALUES,
            LOOKUP_KEYS,
          );
        }}
        buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
          return buildSupplierRequestPayload(
            values as unknown as SupplierFormValues,
            stateCodeByName,
            shouldUpdate,
            typeof editingItemId === "string" ? editingItemId : null,
          );
        }}
      />
      <InlineRelatedMasterModal
        title="State Form"
        description="Create and update states."
        variants={stateModalVariants}
        submitError={stateSaveError || stateDetailsError}
        panelStyle={STATE_MODAL_PANEL_STYLE}
        controllerRef={stateModalControllerRef}
        onSubmit={handleStateModalSubmit}
        onCancel={handleStateModalCancel}
      />
      <InlineRelatedMasterModal
        title="Supplier Group Form"
        description="Create and update supplier groups."
        variants={supplierGroupModalVariants}
        submitError={supplierGroupSaveError || supplierGroupDetailsError}
        panelStyle={SUPPLIER_GROUP_MODAL_PANEL_STYLE}
        controllerRef={supplierGroupModalControllerRef}
        onSubmit={handleSupplierGroupModalSubmit}
        onCancel={handleSupplierGroupModalCancel}
      />
    </>
  );
}
