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
  ERPDynamicFieldValueChangePayload,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicSearchShortcutPayload,
} from "@/components/design-system/ui/dynamic-modal-form";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  toUpper,
  toNullableString,
  toDisplayValue,
  getFirstDefinedValue,
} from "@/app/master/_shared/crud-utils";
import {
  API_ENDPOINTS,
  GRID_TABLE_NAME,
  CUSTOMER_MODAL_PANEL_STYLE,
  STATE_MODAL_PANEL_STYLE,
  SUPPLIER_GROUP_MODAL_PANEL_STYLE,
  SUPPLIER_GROUP_GET_ENDPOINT,
  SUPPLIER_GROUP_CREATE_ENDPOINT,
  STATE_GET_ENDPOINT,
  STATE_CREATE_ENDPOINT,
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
  type SupplierLazyDropdownHandlers,
} from "./fields-schema";
import {
  DROPDOWN_RUN_ENDPOINT,
  DROPDOWN_SEARCH_DEBOUNCE_MS,
  SUPPLIER_DROPDOWN_CONFIG,
  type SupplierDropdownKind,
  buildDropdownRunQuery,
  buildDropdownOptions,
  buildSupplierStateData,
  withPinnedOption,
} from "./dropdowns";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
// The supplier shares its primary key with a linked account ledger, which owns the
// bank-account rows. Reuse the ledger feature's editor + helpers so suppliers edit the
// same nested `ledgerBankAccount` array the server accepts on create/update.
import BankAccountsEditor from "@/features/masters/accounts/account-ledger/bank-accounts-editor";
import {
  createEmptyBankAccountRow,
  extractLedgerBankAccountRows,
  getBankAccountValidationError,
  buildLedgerBankAccountPayload,
  type LedgerBankAccountFormRow,
} from "@/features/masters/accounts/account-ledger/bank-accounts";
export default function SuppliersMasterPage() {
  const stateModalControllerRef = useRef<ERPDynamicModalController | null>(null);
  const supplierGroupModalControllerRef =
    useRef<ERPDynamicModalController | null>(null);
  // API Hooks
  // Lazy configured-dropdown runners (fixed.dropdown_details via /dropdown-details/run).
  // One hook per kind so each fetch has an independent abort/loading lifecycle; errors
  // are not toasted. Nothing loads up front — options load on open + on debounced search.
  const { run: runCompanyDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runBranchDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runGroupDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
  const { run: runStateDropdown } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, {
    toast: { error: false },
  });
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
  // Nested bank accounts edited alongside the supplier (persisted on its linked
  // account ledger). Seeded from the loaded record on edit/view, reset on create.
  const [bankAccounts, setBankAccounts] = useState<LedgerBankAccountFormRow[]>([]);
  const handleAddBankAccount = useCallback(() => {
    setBankAccounts((rows) => [...rows, createEmptyBankAccountRow()]);
  }, []);
  const handleChangeBankAccount = useCallback(
    (rowKey: string, patch: Partial<LedgerBankAccountFormRow>) => {
      setBankAccounts((rows) =>
        rows.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)),
      );
    },
    [],
  );
  const handleRemoveBankAccount = useCallback((rowKey: string) => {
    setBankAccounts((rows) => rows.filter((row) => row.rowKey !== rowKey));
  }, []);
  // Single default per ledger: marking one row default clears the others.
  const handleSetDefaultBankAccount = useCallback((rowKey: string) => {
    setBankAccounts((rows) =>
      rows.map((row) => ({ ...row, lbaIsDefault: row.rowKey === rowKey })),
    );
  }, []);
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
  // Lazy-dropdown plumbing: mirror of the latest options per field (so the value handler
  // can resolve a picked label), the pinned selection per field (kept visible after a
  // fetch), and a debounce handle per field for server-side search typing.
  const dropdownOptionsRef = useRef<Record<string, ERPDynamicSelectOption[]>>({});
  const pinnedDropdownOptionRef = useRef<Record<string, ERPDynamicSelectOption | null>>({});
  const dropdownSearchTimeoutsRef = useRef<Record<string, number | null>>({});
  // Push freshly built options into both the matching state setter and the mirror ref.
  const applyDropdownOptions = useCallback(
    (fieldName: string, options: ERPDynamicSelectOption[]) => {
      dropdownOptionsRef.current[fieldName] = options;
      switch (fieldName) {
        case "supCompanyId":
          setCompanyOptions(options);
          break;
        case "supBranchId":
          setBranchOptions(options);
          break;
        case "supGroupId":
          setSupplierGroupOptions(options);
          break;
        case "supStateName":
          setStateOptions(options);
          break;
      }
    },
    [],
  );
  // Lazily fetch a dropdown's first page (open) or search results (typing) from
  // /dropdown-details/run. A superseded/aborted request returns undefined and is skipped
  // so it never wipes the options the latest request set.
  const fetchDropdown = useCallback(
    async (kind: SupplierDropdownKind, search: string) => {
      const config = SUPPLIER_DROPDOWN_CONFIG[kind];
      const query = buildDropdownRunQuery(config.dropdownId, search);
      try {
        switch (kind) {
          case "company": {
            const payload = await runCompanyDropdown({ query });
            if (payload === undefined) return;
            applyDropdownOptions(
              "supCompanyId",
              withPinnedOption(
                buildDropdownOptions(payload, config.idKeys, config.labelKeys),
                pinnedDropdownOptionRef.current.supCompanyId,
              ),
            );
            break;
          }
          case "branch": {
            const payload = await runBranchDropdown({ query });
            if (payload === undefined) return;
            applyDropdownOptions(
              "supBranchId",
              withPinnedOption(
                buildDropdownOptions(payload, config.idKeys, config.labelKeys),
                pinnedDropdownOptionRef.current.supBranchId,
              ),
            );
            break;
          }
          case "group": {
            const payload = await runGroupDropdown({ query });
            if (payload === undefined) return;
            applyDropdownOptions(
              "supGroupId",
              withPinnedOption(
                buildDropdownOptions(payload, config.idKeys, config.labelKeys),
                pinnedDropdownOptionRef.current.supGroupId,
              ),
            );
            break;
          }
          case "state": {
            const payload = await runStateDropdown({ query });
            if (payload === undefined) return;
            const data = buildSupplierStateData(payload);
            applyDropdownOptions(
              "supStateName",
              withPinnedOption(data.options, pinnedDropdownOptionRef.current.supStateName),
            );
            // Merge so a previously seeded selected state's code mapping survives.
            setStateCodeByName((prev) => ({ ...prev, ...data.stateCodeByName }));
            setStateNameByCode((prev) => ({ ...prev, ...data.stateNameByCode }));
            break;
          }
        }
      } catch {
        // Keep whatever options are currently shown (e.g. the seeded selection).
      }
    },
    [
      applyDropdownOptions,
      runBranchDropdown,
      runCompanyDropdown,
      runGroupDropdown,
      runStateDropdown,
    ],
  );
  // Per-field handlers: fetch on open (immediate), on debounced typing, and pin the
  // chosen option. The State field also mirrors its name into supRegionStateName.
  const lazyDropdownHandlers = useMemo<SupplierLazyDropdownHandlers>(() => {
    const build = (fieldName: string, kind: SupplierDropdownKind) => ({
      onSearchOpenChange: (open: boolean) => {
        const pending = dropdownSearchTimeoutsRef.current[fieldName];
        if (pending != null) {
          window.clearTimeout(pending);
          dropdownSearchTimeoutsRef.current[fieldName] = null;
        }
        if (open) {
          void fetchDropdown(kind, "");
        }
      },
      onSearchQueryChange: ((query: string) => {
        const pending = dropdownSearchTimeoutsRef.current[fieldName];
        if (pending != null) {
          window.clearTimeout(pending);
        }
        const delay = query.trim() ? DROPDOWN_SEARCH_DEBOUNCE_MS : 0;
        dropdownSearchTimeoutsRef.current[fieldName] = window.setTimeout(() => {
          dropdownSearchTimeoutsRef.current[fieldName] = null;
          void fetchDropdown(kind, query);
        }, delay);
      }) as ERPDynamicSearchQueryChangeHandler,
      onValueChange: ((payload: ERPDynamicFieldValueChangePayload) => {
        const option = dropdownOptionsRef.current[fieldName]?.find(
          (item) => item.value === payload.value,
        );
        pinnedDropdownOptionRef.current[fieldName] =
          option && payload.value ? option : null;
        if (fieldName === "supStateName") {
          return { values: { supRegionStateName: payload.value.trim() } };
        }
      }) as ERPDynamicFieldValueChangeHandler,
    });
    return {
      supCompanyId: build("supCompanyId", "company"),
      supBranchId: build("supBranchId", "branch"),
      supGroupId: build("supGroupId", "group"),
      supStateName: build("supStateName", "state"),
    };
  }, [fetchDropdown]);
  // Seed each lazy dropdown with its currently-selected option (from the loaded record)
  // so the trigger shows the saved name on edit/view before the field is opened.
  const seedDropdownSelections = useCallback(
    (source: Record<string, unknown>, values: SupplierFormValues) => {
      const blank: ERPDynamicSelectOption = { value: "", label: "" };
      const nameFrom = (keys: readonly string[]) =>
        toDisplayValue(getFirstDefinedValue(source, keys));
      const seedOne = (fieldName: string, rawValue: string, label: string) => {
        const value = (rawValue ?? "").trim();
        if (!value) {
          pinnedDropdownOptionRef.current[fieldName] = null;
          applyDropdownOptions(fieldName, [blank]);
          return;
        }
        const option: ERPDynamicSelectOption = { value, label: label || value };
        pinnedDropdownOptionRef.current[fieldName] = option;
        applyDropdownOptions(fieldName, [blank, option]);
      };
      seedOne("supCompanyId", values.supCompanyId, nameFrom(["supCompanyName", "sup_company_name"]));
      seedOne("supBranchId", values.supBranchId, nameFrom(["supBranchName", "sup_branch_name"]));
      seedOne("supGroupId", values.supGroupId, nameFrom(["supGroupName", "sup_group_name"]));
      // The State field's value IS the state name, so seed value === label.
      const stateName = (values.supStateName ?? "").trim();
      seedOne("supStateName", stateName, stateName);
      // Seed the code map from the record so name->code resolves on submit without
      // having to open the dropdown.
      const stateCode = (values.supStateCode ?? "").trim().toUpperCase();
      if (stateName && stateCode) {
        setStateCodeByName((prev) => ({ ...prev, [stateName]: stateCode }));
        setStateNameByCode((prev) => ({ ...prev, [stateCode]: stateName }));
      }
    },
    [applyDropdownOptions],
  );
  // Reset every lazy dropdown to just its empty head (used when the create modal opens).
  const resetDropdownSelections = useCallback(() => {
    const blank: ERPDynamicSelectOption = { value: "", label: "" };
    pinnedDropdownOptionRef.current = {};
    applyDropdownOptions("supCompanyId", [blank]);
    applyDropdownOptions("supBranchId", [blank]);
    applyDropdownOptions("supGroupId", [blank]);
    applyDropdownOptions("supStateName", [blank]);
  }, [applyDropdownOptions]);
  // Clear any pending dropdown search debounces on unmount.
  useEffect(() => {
    return () => {
      for (const handle of Object.values(dropdownSearchTimeoutsRef.current)) {
        if (handle != null) {
          window.clearTimeout(handle);
        }
      }
    };
  }, []);
  // Refresh Functions (re-run the lazy fetch after an inline create/update).
  const refreshSupplierGroupOptions = useCallback(async () => {
    await fetchDropdown("group", "");
  }, [fetchDropdown]);
  const refreshStateOptions = useCallback(async () => {
    await fetchDropdown("state", "");
  }, [fetchDropdown]);
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
  // First invalid bank-account row/field (or null), recomputed as rows change. Drives
  // both the inline cell highlight and the custom field's submit-blocking validation.
  const bankAccountValidationError = useMemo(
    () => getBankAccountValidationError(bankAccounts),
    [bankAccounts],
  );
  // The bank-accounts grid, rendered as a full-width `custom` field under its own tab.
  // `validation.custom` blocks submit while a row is invalid (mirrors the server rules).
  const bankAccountsField = useMemo<ERPDynamicModalField>(
    () => ({
      name: "ledgerBankAccountEditor",
      label: "",
      type: "custom",
      fieldStyle: { gridColumn: "1 / -1" },
      validation: {
        custom: () =>
          bankAccountValidationError ? bankAccountValidationError.message : null,
      },
      render: ({ disabled }) => (
        <BankAccountsEditor
          rows={bankAccounts}
          disabled={disabled}
          invalidRowKey={bankAccountValidationError?.rowKey ?? null}
          invalidField={bankAccountValidationError?.field ?? null}
          onAddRow={handleAddBankAccount}
          onChangeRow={handleChangeBankAccount}
          onRemoveRow={handleRemoveBankAccount}
          onSetDefault={handleSetDefaultBankAccount}
        />
      ),
    }),
    [
      bankAccounts,
      bankAccountValidationError,
      handleAddBankAccount,
      handleChangeBankAccount,
      handleRemoveBankAccount,
      handleSetDefaultBankAccount,
    ],
  );
  // Build Form Fields
  const supplierFormFields = useMemo<ERPDynamicModalField[]>(
    () => [
      ...buildSupplierFormFields(
        supplierGroupOptions,
        companyOptions,
        branchOptions,
        stateOptions,
        lazyDropdownHandlers,
        handleSupplierGroupCreateShortcut,
        handleSupplierGroupEditShortcut,
        handleStateCreateShortcut,
        handleStateEditShortcut,
        handleSupplierGstinValueChange,
      ),
      {
        name: "bankAccountsHeading",
        label: "Bank Accounts",
        type: "heading",
        gridColumnStart: 1,
      },
      bankAccountsField,
    ],
    [
      bankAccountsField,
      branchOptions,
      companyOptions,
      lazyDropdownHandlers,
      handleSupplierGstinValueChange,
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
        iconName="supplier_master"
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
        onModalOpenChange={(open, variantKey) => {
          // Clear the lazy dropdowns when the create modal opens so no stale selection
          // from a previously edited supplier lingers (they reload on open).
          if (open && variantKey === "master-create") {
            resetDropdownSelections();
            setBankAccounts([]);
          }
          // Drop the edited bank rows on close so the next create starts empty (edit/view
          // re-seed them via mapFormValues before the modal opens).
          if (!open) {
            setBankAccounts([]);
          }
        }}
        mapFormValues={({ source, defaults }) => {
          const rowSource = (source ?? {}) as Record<string, unknown>;
          const values = toSupplierFormValues(
            rowSource,
            (defaults ?? {}) as Record<string, unknown>,
            stateCodeByName,
            SUPPLIER_INITIAL_FORM_VALUES,
            LOOKUP_KEYS,
          );
          // Seed the lazy dropdowns with the saved selection so each trigger shows the
          // resolved name on edit/view before the field is opened (and lazily loaded).
          seedDropdownSelections(rowSource, values);
          // Seed the bank-accounts grid from the loaded record's nested ledgerBankAccount.
          setBankAccounts(extractLedgerBankAccountRows(rowSource));
          return values;
        }}
        buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
          const payload = buildSupplierRequestPayload(
            values as unknown as SupplierFormValues,
            stateCodeByName,
            shouldUpdate,
            typeof editingItemId === "string" ? editingItemId : null,
          );
          // Attach the nested bank accounts; the server persists them on the supplier's
          // linked ledger (insert new rows, update rows carrying an lbaId).
          payload.ledgerBankAccount = buildLedgerBankAccountPayload(bankAccounts);
          return payload;
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