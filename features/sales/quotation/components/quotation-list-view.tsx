"use client";

/**
 * The screen the menu lands on: the quotation list, built on the same
 * `CrudMasterPage` shell every master page uses, so it inherits the identical
 * header, toolbar, configured-column table, row actions, delete confirmation,
 * pagination, audit history and grid-settings context menu.
 *
 * The one difference from a master page: a quotation is not editable in a modal
 * form, so `onCreateAction` / `onEditAction` are supplied and the shell's own
 * form never opens — Create and Edit hand off to the voucher screen instead.
 *
 * Everything about the table — which columns, in what order, how wide, which are
 * searchable and sortable — is grid 84's own config, read through the same
 * `/configured-grid-sql/columns` path the other master pages use. Nothing here
 * overrides it, so a config change moves this list without touching code.
 *
 * One property of the grid the shell cannot paper over: **its SQL has no `WHERE`
 * and no `grid_param`**, so soft-deleted rows and rows from other companies,
 * branches and years are listed too — the same behaviour every other master page
 * has with its own grid (see grid 81 / Charge Master). The `Deleted` column is
 * kept visible for exactly that reason: without it the list would show a deleted
 * quotation as though it were live.
 */
import { toast } from "react-toastify";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import styles from "@/app/master/state-master/page.module.scss";
import { formatCurrency } from "@/domain/pricing";
import {
  CONFIGURED_GRID_RUN_ENDPOINT,
  QUOTATION_DELETE_ENDPOINT,
  QUOTATION_GET_ENDPOINT,
  QUOTATION_LIST_GRID_ID,
  QUOTATION_SAVE_ENDPOINT,
} from "../quotation.constants";
import type { QuotationDocKey } from "../quotation.types";
import { toDateInput, toNumber } from "../quotation.utils";

const GRID_DETAIL_ID = Number(QUOTATION_LIST_GRID_ID);

const API_ENDPOINTS = {
  list: `${CONFIGURED_GRID_RUN_ENDPOINT}?grid_id=${QUOTATION_LIST_GRID_ID}`,
  getById: QUOTATION_GET_ENDPOINT,
  create: QUOTATION_SAVE_ENDPOINT,
  delete: QUOTATION_DELETE_ENDPOINT,
} as const;

/**
 * A quotation has no code / short / alias / active column, so these name the
 * closest identifying grid aliases instead. They matter for two things only: the
 * delete-confirmation label (`masterName || masterCode || masterId`) and the
 * defensive fallback table used when the grid-column config cannot be fetched.
 */
const LOOKUP_KEYS = {
  id: ["sq_id", "sqId"],
  code: ["sq_quote_refno", "sqQuoteRefno"],
  name: ["sq_cust_name", "sqCustName"],
  short: ["sq_usr_refno", "sqUsrRefno"],
  alias: ["sq_cust_place", "sqCustPlace"],
  // The nearest thing a quotation has to a status flag. Rendered verbatim.
  active: ["sq_status", "sqStatus"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** Only `id` is used — the shell's form, which owns the rest, never opens here. */
const REQUEST_PAYLOAD_KEYS = {
  id: "sqId",
  name: "sqCustName",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

function sourceValue(row: MasterTableRow, key: string): unknown {
  return (row.__source ?? {})[key];
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The grid returns `sq_is_deleted` as a boolean, `'t'`/`'f'` or `'true'`/`'false'`. */
function isDeletedRow(row: MasterTableRow): boolean {
  const value = asText(sourceValue(row, "sq_is_deleted")).trim().toLowerCase();
  return value === "true" || value === "t" || value === "1";
}

/** Per-column formatting, keyed by the grid's own SQL field names. */
const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => string> = {
  sq_quote_date: (row) => toDateInput(asText(sourceValue(row, "sq_quote_date"))),
  sq_valid_until: (row) => toDateInput(asText(sourceValue(row, "sq_valid_until"))),
  sq_cancelled_on: (row) => toDateInput(asText(sourceValue(row, "sq_cancelled_on"))),
  sq_quote_amt: (row) =>
    formatCurrency(toNumber(asText(sourceValue(row, "sq_quote_amt"))), 2, true),
  sq_tot_bags: (row) => formatCurrency(toNumber(asText(sourceValue(row, "sq_tot_bags"))), 3, true),
  sq_is_deleted: (row) => (isDeletedRow(row) ? "Deleted" : ""),
};

/** The whole document key, not just the id: a quotation is keyed by four fields. */
function docKeyOf(row: MasterTableRow): QuotationDocKey {
  return {
    sqId: asText(sourceValue(row, "sq_id")),
    sqCompanyId: asText(sourceValue(row, "sq_company_id")),
    sqBranchId: asText(sourceValue(row, "sq_branch_id")),
    sqAccYear: asText(sourceValue(row, "sq_acc_year")),
  };
}

export type QuotationListViewProps = {
  onCreate: () => void;
  onOpen: (key: QuotationDocKey, mode: "browse" | "entry") => void;
};

export function QuotationListView({ onCreate, onOpen }: QuotationListViewProps) {
  return (
    <CrudMasterPage
      title="Quotations"
      entityLabel="quotation"
      entityLabelPlural="quotations"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Quotation List"
      createLabel="New Quotation"
      codeColumnHeader="Quote No"
      nameColumnHeader="Customer"
      gridDetailId={GRID_DETAIL_ID}
      // Without this the shell defaults to `"styles"` — the response-driven column
      // mode — and a configured grid that carries no `styles` array renders a
      // serial-number column and nothing else. Every master page on a configured
      // grid opts out the same way.
      listResponseStyleArrayKey=""
      gridTableName="sale_quotation"
      useConfiguredGridColumnsOnly
      enableGridSettingsContextMenu
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      // The voucher form replaces the shell's modal on both paths, so the form
      // props (fields, titles, payload builders) are deliberately absent.
      onCreateAction={onCreate}
      // The grid has no `WHERE`, so soft-deleted rows are listed. Selecting one
      // greys the toolbar's Edit button out rather than opening the voucher
      // screen on a document it would refuse to make editable anyway. Such a
      // quotation is still readable through the entry screen's own F8 picker.
      isRowEditDisabled={isDeletedRow}
      rowEditDisabledReason="This quotation is deleted and cannot be edited"
      // Unreachable for a deleted row while the gate above stands; the mode is
      // still resolved from the row so the two cannot disagree.
      onEditAction={(row) => onOpen(docKeyOf(row), isDeletedRow(row) ? "browse" : "entry")}
      // Ctrl+Enter (and double-click) open the voucher to be READ. A quotation
      // does not fit the shell's view modal — it has lines, charges and totals —
      // so it opens its own screen in browse mode.
      //
      // A deleted row is refused here rather than navigated to: `GET
      // /quotations/get` filters soft-deleted rows out and answers 404, so
      // opening one would clear the form, raise a "not found" toast and leave
      // the operator on a blank new quotation. Unlike the greyed-out Edit
      // button, a keyboard chord has no visible affordance, so this one says
      // why nothing happened.
      onViewAction={(row) => {
        if (isDeletedRow(row)) {
          toast.info("This quotation is deleted — it can no longer be opened.");
          return;
        }
        onOpen(docKeyOf(row), "browse");
      }}
      auditHistory={{
        // What the server stamps on `sale_quotation` audit rows.
        screenName: "Sale Quotation",
        getRecordId: (row) => asText(sourceValue(row, "sq_id")) || null,
        getDisplayName: (row) =>
          asText(sourceValue(row, "sq_quote_refno")) ||
          asText(sourceValue(row, "sq_cust_name")) ||
          null,
      }}
    />
  );
}
