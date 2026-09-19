"use client";
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import type { DropdownSelection } from "@/components/design-system/dropdown";
import CrudMasterPage from "@/components/master/crud-master-page";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toSelectBoolean,
} from "@/app/master/_shared/crud-utils";
import { buildTaxRateSavePayload } from "./build-save-payload";
import {
  API_ENDPOINTS,
  CESS_BASIS_OPTIONS,
  GRID_ACTIVE_ONLY_TOKEN,
  LIST_GRID_KEY,
  GRID_TABLE_NAME,
  RATE_DROPDOWN_KEY,
  TAXABILITY_OPTIONS,
  TAX_RATE_INITIAL_FORM_VALUES,
} from "./constants";
import { deriveTaxRateSplitValues } from "./derived";
import LedgerOverridesEditor from "./ledger-overrides-editor";
import { createEmptyLedgerRow, extractLedgerRows } from "./lines";
import ResolvePanel from "./resolve-panel";
import type { TaxRateLedgerRow } from "./types";
import { getLedgerRowsValidationError } from "./validate";
import { useDropdownId } from "@/lib/configured-dropdowns";

/**
 * GST Rate Master — menu 40.
 *
 * A rate is one row of `inventory.tax_rate_master`, and its Ledgers tab is zero
 * or more rows of `inventory.tax_rate_ledger` saying "for THIS rate, role X posts
 * to ledger Y instead of the chart-wide default". No rows at all is a complete
 * and normal configuration.
 *
 * A rate is GLOBAL — there is no company control, deliberately. The model is one
 * shared chart of accounts, and company separation lives on `av_company_id` on
 * the voucher rows.
 *
 * Almost everything this screen appears to decide is decided by the database or
 * by a server-side SQL filter, and the job here is not to restate any of it:
 * which ledgers a role may use is dropdown 51's join, the three component rates
 * are GENERATED columns, and the two-level ledger resolution is
 * `/tax-rates/resolve`. Keep it that way — see `constants.ts` for the ids.
 */

/** Grid 103's id column, and the query-param name `/get` and `/delete` both take. */
const LOOKUP_KEYS = {
  id: ["tax_id", "taxId", "id", "_id"],
  code: ["tax_code", "taxCode", "code"],
  name: ["tax_name", "taxName", "name"],
  // Deliberately columns grid 103 does NOT select, so CrudMasterPage's accessor
  // heuristic cannot claim a configured column for them and push a real one out
  // of the table (the same trap the Charge master documents).
  short: ["tax_cess_per_unit", "short"],
  alias: ["tax_acess_perc", "alias"],
  active: ["tax_is_active", "taxIsActive", "is_active", "isActive", "active", "status"],
  position: ["tax_sort_order", "taxSortOrder", "position", "sort"],
  array: ["data", "items", "results", "rows", "list", "taxRates", "tax_rate_master"],
} as const;

/**
 * `id` is load-bearing — CrudMasterPage uses it as the literal query-param name
 * for `/tax-rates/get` and `/tax-rates/delete`. The rest only feed the default
 * `buildRequestPayload`, which this page overrides, so they are inert filler.
 */
const REQUEST_PAYLOAD_KEYS = {
  id: "tax_id",
  name: "tax_name",
  alias: "tax_code",
  short: "tax_taxability",
  description: "tax_name",
  sort: "tax_sort_order",
} as const;

const MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(72vw/var(--erp-ui-scale)), 74rem)",
  maxHeight: "calc(80vh/var(--erp-ui-scale))",
};

const TEXT_FIELDS = [
  "tax_name",
  "tax_code",
  "tax_taxability",
  "tax_cess_basis",
  "tax_acess_basis",
  "tax_supersedes_id",
  "tax_supersedes_name",
] as const;
const NUMERIC_FIELDS = [
  "tax_rate_perc",
  "tax_cgst_perc",
  "tax_sgst_perc",
  "tax_igst_perc",
  "tax_cess_perc",
  "tax_cess_per_unit",
  "tax_acess_perc",
  "tax_acess_per_unit",
  "tax_sort_order",
] as const;
const BOOLEAN_FIELDS = ["tax_is_reverse_charge", "tax_is_active"] as const;

/** The legacy dialog's 12-column tab grid; `span(6)` is a half-width field. */
const span = (columns: number) => ({
  fieldStyle: { gridColumnEnd: `span ${columns}` } as CSSProperties,
});

function showsCessPercent(basis: string): boolean {
  return basis === "PERCENT" || basis === "BOTH";
}
function showsCessPerUnit(basis: string): boolean {
  return basis === "PER_UNIT" || basis === "BOTH";
}

export default function TaxRateMasterPage() {
  // The supersedes picker's dropdown, named rather than numbered (see
  // lib/configured-dropdowns).
  const rateDropdownId = useDropdownId(RATE_DROPDOWN_KEY);
  // The Ledgers tab's rows. They live here rather than in the form's string map
  // because a line is a record, not a field — and because `lines` has to reach
  // `buildRequestPayload` whole.
  const [ledgerRows, setLedgerRows] = useState<TaxRateLedgerRow[]>([]);
  // The rate being edited, for the resolve panel. Null while creating.
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  // `tax_supersedes_id` is a searchable picker over dropdown 53; the form holds
  // the id, and this holds the text so an edit renders the name before the list
  // is ever fetched.
  const [supersedesSelection, setSupersedesSelection] =
    useState<DropdownSelection | null>(null);
  // Grid 103's SQL is `AND (NOT itax_is_active OR t.tax_is_active)`, so the token
  // means "only active". The checkbox reads the other way round, as the operator
  // thinks of it.
  const [showInactive, setShowInactive] = useState(false);

  const ledgerRowsError = useMemo(
    () => getLedgerRowsValidationError(ledgerRows),
    [ledgerRows],
  );

  const handleAddLedgerRow = useCallback(() => {
    setLedgerRows((rows) => [...rows, createEmptyLedgerRow()]);
  }, []);
  const handleChangeLedgerRow = useCallback(
    (rowKey: string, patch: Partial<TaxRateLedgerRow>) => {
      setLedgerRows((rows) =>
        rows.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)),
      );
    },
    [],
  );
  const handleRemoveLedgerRow = useCallback((rowKey: string) => {
    setLedgerRows((rows) => rows.filter((row) => row.rowKey !== rowKey));
  }, []);

  const formFields = useMemo<ERPDynamicModalField[]>(
    () => buildFormFields({
      rateDropdownId,
      ledgerRows,
      ledgerRowsError,
      editingTaxId,
      supersedesSelection,
      onAddLedgerRow: handleAddLedgerRow,
      onChangeLedgerRow: handleChangeLedgerRow,
      onRemoveLedgerRow: handleRemoveLedgerRow,
      onSupersedesChange: setSupersedesSelection,
    }),
    [
      editingTaxId,
      handleAddLedgerRow,
      rateDropdownId,
      handleChangeLedgerRow,
      handleRemoveLedgerRow,
      ledgerRows,
      ledgerRowsError,
      supersedesSelection,
    ],
  );

  // Grid 103 binds `itax_is_active` textually: run it without the key and the
  // statement 400s with `column "itax_is_active" does not exist` rather than
  // falling back to unfiltered.
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
      grid_param: JSON.stringify({ [GRID_ACTIVE_ONLY_TOKEN]: !showInactive }),
    }),
    [showInactive],
  );

  return (
    <CrudMasterPage
      title="GST Rate"
      auditHistory={{ screenName: "Tax Master" }}
      entityLabel="GST rate"
      entityLabelPlural="GST rates"
      apiEndpoints={API_ENDPOINTS}
      gridKey={LIST_GRID_KEY}
      gridTableName={GRID_TABLE_NAME}
      listResponseStyleArrayKey=""
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      buildListQuery={buildListQuery}
      listStateResetKey={showInactive ? "with-inactive" : "active-only"}
      toolbarContent={
        <div className={styles.filterCheckGroup}>
          <label className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show inactive rates
          </label>
        </div>
      }
      listTitle="GST Rate List"
      listTitleOverride="GST Rate List"
      createLabel="Add GST Rate"
      codeColumnHeader="Code"
      nameColumnHeader="Rate"
      nameFieldLabel="Rate Name"
      nameFieldPlaceholder="GST 18%"
      formTitle="GST Rate"
      formDescription="Create and update GST rates and their posting-ledger overrides."
      createModalTitle="GST Rate Entry"
      editModalTitle="Edit GST Rate"
      viewModalTitle="GST Rate Details"
      customFields={formFields}
      createInitialValues={TAX_RATE_INITIAL_FORM_VALUES}
      modalPanelStyle={MODAL_PANEL_STYLE}
      modalFormGridColumns={12}
      // The dense packer back-fills fields above a full-width inline heading into
      // the wrong subsection; the Ledgers tab is one such full-width block.
      modalFormDenseGrid={false}
      modalStackLabels
      modalSectionNavigationMode="tabs"
      modalFocusFirstInvalidFieldOnValidationError
      onModalOpenChange={(open, variantKey) => {
        // A create starts with no overrides — which is a complete configuration,
        // not an empty one waiting to be filled.
        if (open && variantKey === "master-create") {
          setLedgerRows([]);
          setEditingTaxId(null);
          setSupersedesSelection(null);
        }
        // Drop the edited rows on close so the next create starts clean; edit and
        // view re-seed them through mapFormValues before the modal opens.
        if (!open) {
          setLedgerRows([]);
          setEditingTaxId(null);
          setSupersedesSelection(null);
        }
      }}
      mapFormValues={({ source }) => {
        const rowSource = (source ?? {}) as Record<string, unknown>;
        const values: Record<string, string> = { ...TAX_RATE_INITIAL_FORM_VALUES };
        for (const field of [...TEXT_FIELDS, ...NUMERIC_FIELDS]) {
          const value = toDisplayValue(rowSource[field]);
          if (value !== "") {
            values[field] = value;
          }
        }
        for (const field of BOOLEAN_FIELDS) {
          values[field] = toSelectBoolean(
            rowSource[field],
            TAX_RATE_INITIAL_FORM_VALUES[field] === "true" ? "true" : "false",
          );
        }
        // The stored splits are authoritative on reload; the mirror only fills in
        // for a row that arrived without them (the list grid selects them, /get
        // returns them, so this is belt and braces).
        if (!toDisplayValue(rowSource.tax_cgst_perc)) {
          Object.assign(values, deriveTaxRateSplitValues(values.tax_rate_perc));
        }

        const taxId = toDisplayValue(
          getFirstDefinedValue(rowSource, LOOKUP_KEYS.id),
        ).trim();
        setEditingTaxId(taxId || null);
        setSupersedesSelection(
          values.tax_supersedes_id
            ? {
                id: values.tax_supersedes_id,
                text: values.tax_supersedes_name || values.tax_supersedes_id,
              }
            : null,
        );
        setLedgerRows(extractLedgerRows(rowSource));
        return values;
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) =>
        buildTaxRateSavePayload({
          values: values as Record<string, string>,
          lines: ledgerRows,
          shouldUpdate,
          editingItemId,
        })
      }
    />
  );
}

function buildFormFields(context: {
  /** The "GST RATES" dropdown, resolved from Dropdown Master by the screen. */
  rateDropdownId: string;
  ledgerRows: TaxRateLedgerRow[];
  ledgerRowsError: ReturnType<typeof getLedgerRowsValidationError>;
  editingTaxId: string | null;
  supersedesSelection: DropdownSelection | null;
  onAddLedgerRow: () => void;
  onChangeLedgerRow: (rowKey: string, patch: Partial<TaxRateLedgerRow>) => void;
  onRemoveLedgerRow: (rowKey: string) => void;
  onSupersedesChange: (selection: DropdownSelection | null) => void;
}): ERPDynamicModalField[] {
  const {
    rateDropdownId,
    ledgerRows,
    ledgerRowsError,
    editingTaxId,
    supersedesSelection,
    onAddLedgerRow,
    onChangeLedgerRow,
    onRemoveLedgerRow,
    onSupersedesChange,
  } = context;

  const cessBasisOptions: ERPDynamicSelectOption[] = CESS_BASIS_OPTIONS;

  return [
    // ── Rate tab ──────────────────────────────────────────────────────
    { name: "rateSection", label: "Rate", type: "heading", sectionGridColumns: 12 },
    {
      name: "tax_name",
      label: "Rate Name",
      required: true,
      ...span(6),
      validation: {
        requiredMessage: "Rate Name is required.",
        maxLength: 100,
        maxLengthMessage: "Rate Name cannot exceed 100 characters.",
      },
    },
    {
      name: "tax_code",
      label: "Code",
      placeholder: "GST18",
      ...span(3),
      validation: {
        maxLength: 30,
        maxLengthMessage: "Code cannot exceed 30 characters.",
      },
    },
    {
      name: "tax_taxability",
      label: "Taxability",
      type: "select",
      required: true,
      options: TAXABILITY_OPTIONS,
      ...span(3),
      validation: { requiredMessage: "Taxability is required." },
      helperText:
        "Zero rated is an export taxed at 0% — not the same as exempt or nil rated.",
    },
    {
      name: "tax_rate_perc",
      label: "GST Rate %",
      type: "number",
      min: 0,
      max: 100,
      step: "0.001",
      inputMode: "decimal",
      ...span(3),
      // The three mirrors below track as the rate is typed, before any save.
      onValueChange: ({ value }) => ({ values: deriveTaxRateSplitValues(value) }),
    },
    // Shown so the operator sees 18 become 9 + 9. Disabled because they are
    // GENERATED ALWAYS columns: typing in them could never change anything, and
    // the API rejects them outright.
    {
      name: "tax_cgst_perc",
      label: "CGST %",
      type: "number",
      disabled: true,
      ...span(3),
      helperText: "Derived from the GST rate by the database.",
    },
    { name: "tax_sgst_perc", label: "SGST %", type: "number", disabled: true, ...span(3) },
    { name: "tax_igst_perc", label: "IGST %", type: "number", disabled: true, ...span(3) },

    { name: "cessSubheading", label: "Compensation Cess", type: "subheading" },
    {
      name: "tax_cess_basis",
      label: "Cess Basis",
      type: "select",
      options: cessBasisOptions,
      ...span(4),
      helperText: "Says which figure is in play, so a zero is never ambiguous.",
    },
    {
      name: "tax_cess_perc",
      label: "Cess %",
      type: "number",
      min: 0,
      step: "0.001",
      inputMode: "decimal",
      ...span(4),
      // Hidden rather than cleared: switching the basis back does not strand what
      // was typed, and the payload zeroes whatever the basis says is not in play.
      visibleWhen: (values) => showsCessPercent(values.tax_cess_basis ?? ""),
    },
    {
      name: "tax_cess_per_unit",
      label: "Cess Per Unit",
      type: "number",
      min: 0,
      step: "0.0001",
      inputMode: "decimal",
      ...span(4),
      visibleWhen: (values) => showsCessPerUnit(values.tax_cess_basis ?? ""),
    },

    // The SECOND cess, and not decoration: `sbi_acess_*`, `gdr_state_cess_value`
    // and the 'State Cess' duty head all expect it. Zero on every seeded rate
    // today, which is why forgetting it would look correct for a year.
    { name: "acessSubheading", label: "State Cess", type: "subheading" },
    {
      name: "tax_acess_basis",
      label: "State Cess Basis",
      type: "select",
      options: cessBasisOptions,
      ...span(4),
      helperText: "Kerala flood cess beside compensation cess is the standard case.",
    },
    {
      name: "tax_acess_perc",
      label: "State Cess %",
      type: "number",
      min: 0,
      step: "0.001",
      inputMode: "decimal",
      ...span(4),
      visibleWhen: (values) => showsCessPercent(values.tax_acess_basis ?? ""),
    },
    {
      name: "tax_acess_per_unit",
      label: "State Cess Per Unit",
      type: "number",
      min: 0,
      step: "0.0001",
      inputMode: "decimal",
      ...span(4),
      visibleWhen: (values) => showsCessPerUnit(values.tax_acess_basis ?? ""),
    },

    { name: "optionsSubheading", label: "Options", type: "subheading" },
    {
      name: "tax_supersedes_id",
      label: "Supersedes",
      type: "custom",
      ...span(6),
      helperText:
        "A rate change makes a new rate rather than editing this one; this keeps the chain followable.",
      render: ({ value, setValue, disabled }) => (
        <NexDropdownSingle
          dropdownId={rateDropdownId}
          value={
            supersedesSelection ?? (value ? { id: value, text: value } : null)
          }
          disabled={disabled}
          placeholder="The rate this one replaces"
          aria-label="Supersedes"
          onChange={(selection) => {
            onSupersedesChange(selection);
            setValue(selection?.id ?? "");
          }}
        />
      ),
    },
    {
      name: "tax_sort_order",
      label: "Sort Order",
      type: "number",
      min: 0,
      step: 1,
      ...span(3),
      helperText: "Drives the list and the picker order.",
    },
    { name: "tax_is_reverse_charge", label: "Reverse Charge", type: "checkbox", ...span(3) },
    { name: "tax_is_active", label: "Active", type: "checkbox", ...span(3) },
    // Carried in form state but never rendered: a display-only field the read
    // path adds, kept so the picker can show a name before the list is fetched.
    {
      name: "tax_supersedes_name",
      label: "Supersedes Name",
      visibleWhen: () => false,
    },

    // ── Ledgers tab ───────────────────────────────────────────────────
    { name: "ledgersSection", label: "Ledgers", type: "heading", sectionGridColumns: 12 },
    {
      name: "taxRateLedgerEditor",
      label: "",
      type: "custom",
      fieldStyle: { gridColumn: "1 / -1" },
      // Blocks submit while a row is incomplete or repeats another. The messages
      // name the row number — the database would answer `ux_trl_rate_role`.
      validation: { custom: () => ledgerRowsError?.message ?? null },
      render: ({ disabled }) => (
        <LedgerOverridesEditor
          rows={ledgerRows}
          disabled={disabled}
          error={ledgerRowsError}
          onAddRow={onAddLedgerRow}
          onChangeRow={onChangeLedgerRow}
          onRemoveRow={onRemoveLedgerRow}
        />
      ),
    },
    { name: "resolveSubheading", label: "Where This Rate Posts", type: "subheading" },
    {
      name: "taxRateResolvePanel",
      label: "",
      type: "custom",
      fieldStyle: { gridColumn: "1 / -1" },
      render: () => <ResolvePanel taxId={editingTaxId} />,
    },
  ];
}
