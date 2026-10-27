"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { useApi } from "@/hooks/useApi";
import {
  useLazyConfiguredDropdown,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import styles from "@/app/master/state-master/page.module.scss";
import {
  defineMasterModule,
  getFirstDefinedValue,
  toDisplayValue,
  toUpdateId,
} from "@/features/masters/shared";
import {
  buildGstinFieldValidators,
  normalizeGstin,
} from "@/features/masters/shared/gst-registration";
import {
  GSTIN_LOOKUP_ENDPOINT,
  GSTIN_LOOKUP_INPUT_PATTERN,
  fetchGstinDetails,
  gstinLookupToValues,
} from "@/features/masters/shared/gstin-lookup";
import {
  withEditMode,
} from "@/features/masters/shared/edit-mode-field";
import {
  BRANCH_GSTIN_FIELDS,
  BRANCH_ID_KEYS,
  BRANCH_INITIAL_FORM_VALUES,
  BRANCH_LOOKUP_FIELD_MAP,
  BRANCH_MODAL_PANEL_STYLE,
  BRANCH_STATE_KEYS,
  buildBranchFormFields,
  buildBranchRequestPayload,
  buildStateCodeByName,
  buildStateNameByCode,
  getBranchFieldValue,
  mapBranchFormValues,
} from "./branches";
import { useDataRefresh } from "@/lib/data-freshness";
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";

/**
 * Branch master — the React twin of the Qt `branch_entry.cpp` form (notes 72):
 * three tabs (Identity · Billing & Preferences · Regional Details) in two
 * columns, the same required set (Name, Type, Company, GST Reg Type, City,
 * District, State, Pin), and the company's GSTIN rules under the `br` prefix.
 * A saved branch keeps its company (its documents carry it), and its default
 * godown is picked from its OWN godowns, so only after it exists.
 */

/**
 * The Grid Master row this list reads — "MAIN LIST - BRANCHES". `CrudMasterPage`
 * resolves it to a grid id at runtime (see lib/configured-grids), and uses it
 * for both the rows and the configured columns.
 */
export const BRANCH_LIST_GRID_KEY = "branchList" satisfies ConfiguredGridKey;
const API_ENDPOINTS = {
  getById: "/branch-masters/get",
  create: "/branch-masters/create",
  delete: "/branch-masters/delete",
} as const;
const GRID_TABLE_NAME = "branch_master";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const STATE_LOOKUP_QUERY = {
  module: "stateCodes",
} as const;
const LOOKUP_KEYS = {
  id: ["brId", "br_id", "id", "_id"],
  code: ["brCode", "br_code", "code"],
  name: ["brName", "br_name", "name"],
  short: ["brShort", "br_short", "short", "shortName"],
  alias: ["brAlias", "br_alias", "alias"],
  active: ["brIsActive", "br_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["brTerms", "br_terms", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "branches", "branch_masters"],
} as const;
/**
 * Delete / Restore for the list (notes 72 B1, B3): a soft-deleted branch comes
 * back through `/restore` (409 while its company is deleted).
 */
export const BRANCH_SOFT_DELETE = {
  deleteEndpoint: API_ENDPOINTS.delete,
  restoreEndpoint: "/branch-masters/restore",
  idParam: "brId",
  idKeys: LOOKUP_KEYS.id,
  entityTitle: "Branch",
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "brId",
  name: "brName",
  alias: "brAlias",
  short: "brShort",
  description: "brTerms",
  sort: "position",
} as const;
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
const DEFAULT_BANK_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Bank",
};
const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Godown",
};
// Company is a lazy, server-side searchable configured dropdown (dropdown 22,
// COMPANYS -> comp_id/comp_name), loaded on open + on debounced search.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownKey: "company" satisfies ConfiguredDropdownKey,
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: DEFAULT_COMPANY_OPTION,
} as const;
// Source keys to seed the saved company on edit/view (getById returns brCompId + brCompName).
const COMPANY_SOURCE_ID_KEYS = ["brCompId", "br_comp_id", "compId", "comp_id"] as const;
const COMPANY_SOURCE_NAME_KEYS = ["brCompName", "br_comp_name", "compName", "comp_name", "companyName", "company_name"] as const;
// State is a lazy configured dropdown (dropdown 21 -> state_code/state_name); the
// field value is the state NAME. The full code<->name maps below still load eagerly
// because submit derives brStateCode from the picked name and the GSTIN rules
// compare its code.
const STATE_DROPDOWN_CONFIG = {
  dropdownKey: "gstStateCode" satisfies ConfiguredDropdownKey,
  idKeys: ["state_name", "stateName"] as const,
  labelKeys: ["state_name", "stateName"] as const,
  defaultOption: { value: "", label: "Select State" } as ERPDynamicSelectOption,
} as const;
// Default Bank: dropdown 25, the bank-group ledgers only (not every ledger).
const BANK_LEDGER_DROPDOWN_CONFIG = {
  dropdownKey: "bankLedger" satisfies ConfiguredDropdownKey,
  idKeys: ["led_id", "ledId"] as const,
  labelKeys: ["led_name", "ledName"] as const,
  defaultOption: DEFAULT_BANK_LEDGER_OPTION,
} as const;
// Default Godown: dropdown 26 (GODOWNS -> gdl_id/gdl_name). Its SQL narrows to
// one branch's godowns through the guarded `ibranch_id` token; the edit form
// sends the branch's own id there.
const GODOWN_DROPDOWN_CONFIG = {
  dropdownKey: "godown" satisfies ConfiguredDropdownKey,
  idKeys: ["gdl_id", "gdlId"] as const,
  labelKeys: ["gdl_name", "gdlName"] as const,
  defaultOption: DEFAULT_GODOWN_OPTION,
} as const;
export function useBranchesModule() {
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  // GET /gst/search (notes 72 C6). Its failures are shown on the GSTIN field,
  // not as a popup: a 503 "not configured" must not interrupt typing a branch.
  const { getAll: searchGstin } = useApi<unknown>(GSTIN_LOOKUP_ENDPOINT, {
    toast: { error: false },
  });
  // The branch the form is editing ("" on create): the godown dropdown lists
  // only its godowns, through dropdown 26's `ibranch_id` token.
  const [editingBranchId, setEditingBranchId] = useState("");
  const {
    options: companyOptions,
    handlers: companyHandlers,
    seedSelected: seedCompany,
  } = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const {
    options: stateOptions,
    handlers: stateHandlers,
    seedSelected: seedState,
  } = useLazyConfiguredDropdown(STATE_DROPDOWN_CONFIG);
  const {
    options: bankOptions,
    handlers: bankHandlers,
    seedSelected: seedBank,
  } = useLazyConfiguredDropdown(BANK_LEDGER_DROPDOWN_CONFIG);
  const godownParams = useMemo(
    () => (editingBranchId ? { ibranch_id: editingBranchId } : undefined),
    [editingBranchId],
  );
  const {
    options: godownOptions,
    handlers: godownHandlers,
    seedSelected: seedGodown,
  } = useLazyConfiguredDropdown({ ...GODOWN_DROPDOWN_CONFIG, params: godownParams });
  // Full code<->name maps are loaded eagerly: the GSTIN lookup turns its state
  // code into the State field's name, the GSTIN/State rule reads the picked
  // state's code, and submit derives brStateCode from the picked name.
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  // Per GSTIN: the form patch, and the registered name kept apart (see below).
  const gstLookupCacheRef = useRef<
    Record<string, { values: Record<string, string>; tradeName: string }>
  >({});
  // Lookup options come from master tables that other users and other screens
  // change, so they are re-read on every data-refresh signal, not just on mount.
  const loadStateOptions = useCallback(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getStateLookup(STATE_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }
        setStateCodeByName(buildStateCodeByName(payload));
        setStateNameByCode(buildStateNameByCode(payload));
      } catch {
        if (!mounted) {
          return;
        }
        setStateCodeByName({});
        setStateNameByCode({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getStateLookup]);
  useEffect(() => loadStateOptions(), [loadStateOptions]);
  useDataRefresh(() => {
    loadStateOptions();
  });
  // The company's GSTIN rules under the `br` prefix (notes 72 C7).
  const gstinValidators = useMemo(
    () =>
      buildGstinFieldValidators({
        fields: BRANCH_GSTIN_FIELDS,
        stateCodeOf: (values) => stateCodeByName[(values.brState ?? "").trim()] ?? "",
      }),
    [stateCodeByName],
  );
  const handleBranchGstinValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(
      async ({ value, values }) => {
        const typingPatch = gstinValidators.valueChangePatch(value, values);
        const typingValues = Object.keys(typingPatch).length ? { values: typingPatch } : {};
        const normalizedGstin = normalizeGstin(value);
        if (!GSTIN_LOOKUP_INPUT_PATTERN.test(normalizedGstin)) {
          return {
            ...typingValues,
            errors: { brGstinNo: null },
          };
        }
        let cached = gstLookupCacheRef.current[normalizedGstin];
        if (!cached) {
          const result = await fetchGstinDetails(searchGstin, normalizedGstin);
          if (!result.ok) {
            return {
              ...typingValues,
              errors: { brGstinNo: result.message },
            };
          }
          cached = {
            values: gstinLookupToValues(result.payload, BRANCH_LOOKUP_FIELD_MAP, {
              stateNameByCode,
            }),
            tradeName: result.payload.tradeName || result.payload.legalName || "",
          };
          gstLookupCacheRef.current[normalizedGstin] = cached;
        }
        const lookupValues = { ...cached.values };
        const { tradeName } = cached;
        // Branches in one state share their company's GSTIN, so the registered
        // trade name is only a starting point: it fills a blank Branch Name and
        // never replaces one already typed.
        if (tradeName && !(values.brName ?? "").trim()) {
          lookupValues.brName = tradeName;
        }
        // Pin the auto-filled state so the lazy dropdown can display it.
        if (lookupValues.brState) {
          seedState(lookupValues.brState, lookupValues.brState);
        }
        return {
          values: { ...typingPatch, ...lookupValues },
          errors: { brGstinNo: null },
        };
      },
      [gstinValidators, searchGstin, stateNameByCode, seedState],
    );
  const branchFormFields = useMemo(
    () =>
      buildBranchFormFields({
        companyOptions,
        companyHandlers,
        stateOptions,
        stateHandlers,
        bankOptions,
        bankHandlers,
        godownOptions,
        godownHandlers,
        onBranchGstinValueChange: handleBranchGstinValueChange,
        gstinValidators,
      }),
    [
      companyOptions,
      companyHandlers,
      stateOptions,
      stateHandlers,
      bankOptions,
      bankHandlers,
      godownOptions,
      godownHandlers,
      handleBranchGstinValueChange,
      gstinValidators,
    ],
  );
  const createInitialValues = useMemo(
    () => withEditMode({ ...BRANCH_INITIAL_FORM_VALUES }, false),
    [],
  );
  return useMemo(
    () =>
      defineMasterModule({
        title: "Branch",
        iconName: "branch_master",
        auditHistory: { screenName: "Branch Master" },
        entityLabel: "branch",
        entityLabelPlural: "branches",
        apiEndpoints: API_ENDPOINTS,
        gridKey: BRANCH_LIST_GRID_KEY,
        gridTableName: GRID_TABLE_NAME,
        listResponseStyleArrayKey: "",
        lookupKeys: LOOKUP_KEYS,
        requestPayloadKeys: REQUEST_PAYLOAD_KEYS,
        styles,
        listTitle: "Branch List",
        listTitleOverride: "Branch List",
        listSubtitleOverride: "Manage branches and their configuration",
        createLabel: "Add Branch",
        codeColumnHeader: "Branch Code",
        nameColumnHeader: "Branch Name",
        nameFieldLabel: "Branch Name",
        nameFieldPlaceholder: "Main Branch",
        formTitle: "Branch Form",
        formDescription:
          "Create and update branches with address, billing, inventory, and compliance details.",
        customFields: branchFormFields,
        createInitialValues,
        modalPanelStyle: BRANCH_MODAL_PANEL_STYLE,
        createModalTitle: "Branch Entry",
        editModalTitle: "Edit Branch Entry",
        modalFormGridColumns: 2,
        modalFormDenseGrid: false,
        modalStackLabels: false,
        modalSectionNavigationMode: "tabs",
        modalHideFieldHelperText: true,
        modalHideFieldErrorText: true,
        modalFocusFirstInvalidFieldOnValidationError: true,
        // Field errors are hidden, and the GSTIN / financial-year / PAN rules
        // need their words: the first one is raised as a warning, as Qt does.
        modalShowValidationErrorPopup: true,
        modalEnableArrowKeyFieldNavigation: true,
        onModalOpenChange: (open, variantKey) => {
          // Clear the lazy dropdowns when the create modal opens so no stale
          // selection from a previously edited branch lingers (they reload on open).
          if (open && variantKey === "master-create") {
            setEditingBranchId("");
            seedCompany("", "");
            seedState("", "");
            seedBank("", "");
            seedGodown("", "");
          }
        },
        mapFormValues: ({ source, defaults }) => {
          const rowSource = source ?? {};
          setEditingBranchId(
            source ? toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_ID_KEYS)) : "",
          );
          // Seed the lazy dropdowns so the triggers show the saved labels on
          // edit/view before each field is opened (and lazily loaded). GET
          // resolves the company, bank and godown names alongside their ids.
          const companyId = toDisplayValue(
            getFirstDefinedValue(rowSource, COMPANY_SOURCE_ID_KEYS),
          );
          seedCompany(
            companyId,
            toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_SOURCE_NAME_KEYS)),
          );
          // State field value IS the name. Fall back to deriving it from the saved code.
          const stateName =
            toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_STATE_KEYS)) ||
            stateNameByCode[
              toDisplayValue(getBranchFieldValue(rowSource, "brStateCode")).toUpperCase()
            ] ||
            "";
          seedState(stateName, stateName);
          const bankId = toDisplayValue(getBranchFieldValue(rowSource, "brBankId"));
          seedBank(
            bankId,
            toDisplayValue(getBranchFieldValue(rowSource, "brBankName")) || bankId,
          );
          const godownId = toDisplayValue(getBranchFieldValue(rowSource, "brDefaultGodownId"));
          seedGodown(
            godownId,
            toDisplayValue(getBranchFieldValue(rowSource, "brDefaultGodownName")) || godownId,
          );
          const mappedValues = mapBranchFormValues(source, defaults, stateNameByCode);
          // Keep the company field value aligned with the seeded dropdown regardless of
          // which key getById returns it under (brCompId/br_comp_id/compId/comp_id).
          mappedValues.brCompId = companyId || mappedValues.brCompId;
          return withEditMode(mappedValues, source !== null);
        },
        buildRequestPayload: ({ values, shouldUpdate, editingItemId }) => {
          const payload = buildBranchRequestPayload(values, stateCodeByName);
          if (shouldUpdate && editingItemId !== null) {
            payload.brId = toUpdateId(editingItemId);
          }
          return payload;
        },
      }),
    [
      branchFormFields,
      createInitialValues,
      stateCodeByName,
      stateNameByCode,
      seedCompany,
      seedState,
      seedBank,
      seedGodown,
    ],
  );
}
