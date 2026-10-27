"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  currentIndianFiscalYear,
} from "@/features/masters/shared/fiscal-year";
import {
  withEditMode,
} from "@/features/masters/shared/edit-mode-field";
import {
  readFileAsDataUrl,
} from "@/features/masters/shared/stored-photo";
import {
  COMPANY_GSTIN_FIELDS,
  COMPANY_INITIAL_FORM_VALUES,
  COMPANY_LOOKUP_FIELD_MAP,
  COMPANY_MODAL_PANEL_STYLE,
  buildCompanyFormFields,
  buildCompanyRequestPayload,
  buildStateCodeByName,
  buildStateNameByCode,
  getCompanyFieldValue,
  mapCompanyFormValues,
} from "./companies";
import { useDataRefresh } from "@/lib/data-freshness";
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";

/**
 * Company master — the React twin of the Qt `company_entry.cpp` form (notes 72).
 * Same four tabs (Identity · Tax and Compliance · Preferences · Regional), same
 * required set (Name, GST Reg Type, Price Fixing, State, Turnover band), same
 * GSTIN / fiscal-year checks before the request leaves, so the server's 400s
 * are read here first in the same words.
 */

/**
 * The Grid Master row this list reads — "MAIN LIST - COMPANYS". `CrudMasterPage`
 * resolves it to a grid id at runtime (see lib/configured-grids), and uses it for
 * both the rows and the configured columns.
 */
const LIST_GRID_KEY = "companyList" satisfies ConfiguredGridKey;
const API_ENDPOINTS = {
  getById: "/company-masters/get",
  create: "/company-masters/create",
  delete: "/company-masters/delete",
} as const;
const GRID_TABLE_NAME = "companys";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const STATE_LOOKUP_QUERY = {
  module: "stateCodes",
} as const;
const LOOKUP_KEYS = {
  id: ["compId", "comp_id", "id", "_id"],
  code: ["compCode", "comp_code", "code"],
  name: ["compName", "comp_name", "name"],
  short: ["compShort", "comp_short", "short", "short_name", "shortName"],
  alias: ["compLegalName", "comp_legal_name", "alias", "legal_name"],
  active: ["compIsActive", "comp_is_active", "isActive", "is_active", "status"],
  position: ["compStylesheetId", "comp_stylesheet_id", "position", "sort"],
  description: ["compRemarks", "comp_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "companies"],
} as const;
/**
 * Delete / Restore for the list (notes 72 B1, B2): a soft-deleted company
 * comes back through `/restore`, not through `/create`.
 */
export const COMPANY_SOFT_DELETE = {
  deleteEndpoint: API_ENDPOINTS.delete,
  restoreEndpoint: "/company-masters/restore",
  idParam: "compId",
  idKeys: LOOKUP_KEYS.id,
  entityTitle: "Company",
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "compId",
  name: "compName",
  alias: "compLegalName",
  short: "compShort",
  description: "compRemarks",
  sort: "compStylesheetId",
} as const;
const DEFAULT_STATE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select State",
};
// The State select is a lazy, server-side searchable configured dropdown
// (dropdown 21, GST - STATE CODES -> state_code/state_name). The field value is
// the state NAME (compState), so options map state_name -> state_name. The full
// code<->name maps below still load eagerly because the GSTIN auto-fill, the
// GSTIN/State check and the submit's code derivation need every state.
const STATE_DROPDOWN_CONFIG = {
  dropdownKey: "gstStateCode",
  idKeys: ["state_name", "stateName"] as const,
  labelKeys: ["state_name", "stateName"] as const,
  defaultOption: DEFAULT_STATE_OPTION,
} as const;
const DEFAULT_APP_THEME_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Stylesheet",
};
// Stylesheet is a FK to public.app_theme_master (thm_id), NOT a colour value: the server
// DTO types compStylesheetId as an integer. Options come from configured dropdown 27
// (APP THEMES -> thm_id/thm_name), lazily loaded like the State field.
const APP_THEME_DROPDOWN_CONFIG = {
  dropdownKey: "appTheme",
  idKeys: ["thm_id", "thmId"] as const,
  labelKeys: ["thm_name", "thmName"] as const,
  defaultOption: DEFAULT_APP_THEME_OPTION,
} as const;
const DEFAULT_BANK_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Bank",
};
// Bank is dropdown 25 (BANK LEDGERS -> led_id/led_name): only the ledgers under
// the bank group, lazily searched, instead of every ledger in the book.
const BANK_LEDGER_DROPDOWN_CONFIG = {
  dropdownKey: "bankLedger" satisfies ConfiguredDropdownKey,
  idKeys: ["led_id", "ledId"] as const,
  labelKeys: ["led_name", "ledName"] as const,
  defaultOption: DEFAULT_BANK_LEDGER_OPTION,
} as const;
export function useCompaniesModule() {
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  // GET /gst/search (notes 72 C6). Its failures are shown on the GSTIN field,
  // not as a popup: a 503 "not configured" must not interrupt typing a company.
  const { getAll: searchGstin } = useApi<unknown>(GSTIN_LOOKUP_ENDPOINT, {
    toast: { error: false },
  });
  // The State select itself is a lazy server-side dropdown (configured dropdown 21).
  const {
    options: stateOptions,
    handlers: stateHandlers,
    seedSelected: seedState,
  } = useLazyConfiguredDropdown(STATE_DROPDOWN_CONFIG);
  // Stylesheet is a lazy server-side dropdown too (configured dropdown 27).
  const {
    options: appThemeOptions,
    handlers: appThemeHandlers,
    seedSelected: seedAppTheme,
  } = useLazyConfiguredDropdown(APP_THEME_DROPDOWN_CONFIG);
  // Bank: dropdown 25, the bank-group ledgers only.
  const {
    options: bankOptions,
    handlers: bankHandlers,
    seedSelected: seedBank,
  } = useLazyConfiguredDropdown(BANK_LEDGER_DROPDOWN_CONFIG);
  // Full code<->name maps are still loaded eagerly: GSTIN auto-fill derives the state
  // name from the GSTIN's leading code, the GSTIN/State check reads the picked
  // state's code, and submit derives the code from the picked name.
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  const gstLookupCacheRef = useRef<Record<string, Record<string, string>>>({});
  // Lookup options come from master tables that other users and other screens
  // change, so they are re-read on every data-refresh signal, not just on mount.
  const loadLookupOptions = useCallback(() => {
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
  useEffect(() => loadLookupOptions(), [loadLookupOptions]);
  useDataRefresh(() => {
    loadLookupOptions();
  });
  // The GSTIN rules (notes 72 C7, Qt's extraValidate): blank only for an
  // UNREGISTERED company; format + checksum; the state it names must be the
  // State picked; the PAN typed must be the one it carries.
  const gstinValidators = useMemo(
    () =>
      buildGstinFieldValidators({
        fields: COMPANY_GSTIN_FIELDS,
        // "" while the map has not loaded or no state is picked: the check waits.
        stateCodeOf: (values) => stateCodeByName[(values.compState ?? "").trim()] ?? "",
      }),
    [stateCodeByName],
  );
  const handleCompanyGstinValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(
      async ({ value, values }) => {
        // Upper-case what was typed and fill a blank PAN from a well-formed GSTIN.
        const typingPatch = gstinValidators.valueChangePatch(value, values);
        const typingValues = Object.keys(typingPatch).length ? { values: typingPatch } : {};
        const normalizedGstin = normalizeGstin(value);
        if (!GSTIN_LOOKUP_INPUT_PATTERN.test(normalizedGstin)) {
          return {
            ...typingValues,
            errors: { compGstinNo: null },
          };
        }
        const cachedValues = gstLookupCacheRef.current[normalizedGstin];
        if (cachedValues) {
          // Pin the auto-filled state so the lazy dropdown can display it.
          if (cachedValues.compState) {
            seedState(cachedValues.compState, cachedValues.compState);
          }
          return {
            values: { ...typingPatch, ...cachedValues },
            errors: { compGstinNo: null },
          };
        }
        const result = await fetchGstinDetails(searchGstin, normalizedGstin);
        if (!result.ok) {
          return {
            ...typingValues,
            errors: { compGstinNo: result.message },
          };
        }
        const resolvedValues = gstinLookupToValues(result.payload, COMPANY_LOOKUP_FIELD_MAP, {
          stateNameByCode,
        });
        gstLookupCacheRef.current[normalizedGstin] = resolvedValues;
        // Pin the auto-filled state so the lazy dropdown can display it.
        if (resolvedValues.compState) {
          seedState(resolvedValues.compState, resolvedValues.compState);
        }
        return {
          values: { ...typingPatch, ...resolvedValues },
          errors: { compGstinNo: null },
        };
      },
      [gstinValidators, searchGstin, stateNameByCode, seedState],
    );
  const companyFormFields = useMemo(
    () =>
      buildCompanyFormFields({
        bankOptions,
        bankHandlers,
        stateOptions,
        stateHandlers,
        appThemeOptions,
        appThemeHandlers,
        onCompanyGstinValueChange: handleCompanyGstinValueChange,
        gstinValidators,
      }),
    [
      bankOptions,
      bankHandlers,
      gstinValidators,
      handleCompanyGstinValueChange,
      stateOptions,
      stateHandlers,
      appThemeOptions,
      appThemeHandlers,
    ],
  );
  // A new company starts in the Indian financial year running today, books
  // beginning with it (what the server would seed anyway, shown so it can be
  // changed to an earlier year before the first save).
  const createInitialValues = useMemo(() => {
    const fiscalYear = currentIndianFiscalYear();
    return withEditMode(
      {
        ...COMPANY_INITIAL_FORM_VALUES,
        compFinYearFrom: fiscalYear.from,
        compFinYearTo: fiscalYear.to,
        compBooksBeginFrom: fiscalYear.from,
      },
      false,
    );
  }, []);
  return useMemo(
    () =>
      defineMasterModule({
        title: "Company",
        iconName: "company_master",
        auditHistory: { screenName: "Company Master" },
        entityLabel: "company",
        entityLabelPlural: "companies",
        apiEndpoints: API_ENDPOINTS,
        gridKey: LIST_GRID_KEY,
        gridTableName: GRID_TABLE_NAME,
        listResponseStyleArrayKey: "",
        lookupKeys: LOOKUP_KEYS,
        requestPayloadKeys: REQUEST_PAYLOAD_KEYS,
        styles,
        listTitle: "Company List",
        listTitleOverride: "Company List",
        listSubtitleOverride: "Manage companies and their configuration",
        createLabel: "Add Company",
        codeColumnHeader: "Company Code",
        nameColumnHeader: "Company Name",
        nameFieldLabel: "Company Name",
        nameFieldPlaceholder: "ABC Traders Pvt Ltd",
        formTitle: "Company Form",
        formDescription:
          "Create and update companies with statutory, contact, fiscal, and system settings.",
        customFields: companyFormFields,
        createInitialValues,
        modalPanelStyle: COMPANY_MODAL_PANEL_STYLE,
        createModalTitle: "Company Entry",
        editModalTitle: "Edit Company Entry",
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
          // selection from a previously edited company lingers (they reload on open).
          if (open && variantKey === "master-create") {
            seedState("", "");
            seedAppTheme("", "");
            seedBank("", "");
          }
        },
        mapFormValues: ({ source, defaults }) => {
          const rowSource = source ?? {};
          // Seed the lazy State dropdown so the trigger shows the state name on
          // edit/view. The field value is the name; fall back to deriving it from the
          // saved code via the eager code->name map.
          const stateName =
            toDisplayValue(getCompanyFieldValue(rowSource, "compState")) ||
            stateNameByCode[
              toDisplayValue(getCompanyFieldValue(rowSource, "compStateCode")).toUpperCase()
            ] ||
            "";
          seedState(stateName, stateName);
          // Seed the lazy Stylesheet and Bank dropdowns from the saved ids;
          // /company-masters/get returns the resolved names alongside them so the
          // triggers have a label to show.
          const appThemeId = toDisplayValue(
            getCompanyFieldValue(rowSource, "compStylesheetId"),
          );
          seedAppTheme(
            appThemeId,
            toDisplayValue(getCompanyFieldValue(rowSource, "compStylesheetName")) ||
              appThemeId,
          );
          const bankId = toDisplayValue(getCompanyFieldValue(rowSource, "compBankId"));
          seedBank(
            bankId,
            toDisplayValue(getCompanyFieldValue(rowSource, "compBankName")) || bankId,
          );
          return withEditMode(
            mapCompanyFormValues(source, defaults, stateNameByCode),
            source !== null,
          );
        },
        buildRequestPayload: async ({ values, shouldUpdate, editingItemId, files }) => {
          const payload = buildCompanyRequestPayload(values, shouldUpdate, stateCodeByName);
          // A newly chosen image goes as a data URL; with none chosen the key is
          // left out and the stored signature stays (null / "" would clear it).
          const signatureFile = files.compAuthorizeSignature;
          if (signatureFile && signatureFile.size > 0) {
            payload.compAuthorizeSignature = await readFileAsDataUrl(signatureFile);
          }
          if (shouldUpdate && editingItemId !== null) {
            payload.compId = toUpdateId(editingItemId);
          }
          return payload;
        },
      }),
    [
      companyFormFields,
      createInitialValues,
      stateCodeByName,
      stateNameByCode,
      seedState,
      seedAppTheme,
      seedBank,
    ],
  );
}
