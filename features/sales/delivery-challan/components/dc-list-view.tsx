"use client";

/**
 * The challan list — Qt `TxnMainView` over `TxnDocTypes::deliveryChallan()`:
 * grid 116 "MAIN LIST - DELIVERY CHALLANS" on the shared `CrudMasterPage`
 * shell (as the sale-order list), opening on a 90-day window, with the
 * Fulfilment combo whose `ifulfil` token is ALWAYS sent ('' = every status,
 * OPEN = OPEN + PARTIAL).
 *
 * The SQL binds six tokens and every one is sent: `icompany_id`, `ibranch_id`,
 * `iacc_year`, `ifrom_date`, `ito_date`, `ifulfil`. An unsent token would stay
 * in the SQL as literal text.
 *
 * Row policy (Qt `deliveryChallanRowPolicy`): a CANCELLED challan is neither
 * edited nor deleted; a POSTED one is opened to amend or cancel and is never
 * deleted. Delete = POST /delivery-challans/delete with the four keys (DRAFT
 * only). Print (F6 in Qt) renders the DELIVERY_CHALLAN purpose.
 */
import { useCallback, useMemo, useState } from "react";
import { toast } from "@/lib/notify";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import { DateInput } from "@/components/design-system/ui/date-input";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { formatCurrency } from "@/domain/pricing";
import { formatDate } from "@/lib/date-format";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { TxnHistoryDialog } from "@/components/txn/txn-history-dialog";
import { addDays, toDateInput, todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import {
  DC_CREATE_ENDPOINT,
  DC_DELETE_ENDPOINT,
  DC_FULFIL_FILTER_OPTIONS,
  DC_GET_ENDPOINT,
  DC_LIST_GRID_KEY,
  DC_LIST_SUBTITLE,
  DC_LIST_TITLE,
  DC_LIST_WINDOW_DAYS,
  DC_MENU_ID,
  DC_PRINT_PURPOSE,
  DC_SEARCH_HINT,
  DC_TITLE,
  purposeLabel,
} from "../dc.constants";
import { useDcDeleteMutation } from "../dc.api";
import { dcRowPolicy } from "../dc.lifecycle";
import type { DcDocKey } from "../dc.types";

const API_ENDPOINTS = { getById: DC_GET_ENDPOINT, create: DC_CREATE_ENDPOINT, delete: DC_DELETE_ENDPOINT } as const;
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const LOOKUP_KEYS = {
  id: ["sdc_id", "sdcId"],
  code: ["sdc_dc_refno", "sdcDcRefno"],
  name: ["sdc_cust_name", "sdcCustName"],
  short: ["sdc_purpose", "sdcPurpose"],
  alias: ["sdc_cust_place", "sdcCustPlace"],
  active: ["sdc_status", "sdcStatus"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = { id: "sdcId", name: "sdcCustName", alias: "", short: "", description: "", sort: "" } as const;

const asText = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const sourceValue = (row: MasterTableRow, key: string): unknown => (row.__source ?? {})[key];
const statusOf = (row: MasterTableRow) => asText(sourceValue(row, "sdc_status")).trim().toUpperCase();

const STATUS_PILL: Record<string, string> = {
  DRAFT: orderStyles.statusPillDraft,
  POSTED: orderStyles.statusPillConfirmed,
  CANCELLED: orderStyles.statusPillCancelled,
  OPEN: orderStyles.statusPillPartial,
  PARTIAL: orderStyles.statusPillPartial,
  BILLED: orderStyles.statusPillCompleted,
  RETURNED: orderStyles.statusPillCompleted,
  CLOSED: orderStyles.statusPillCompleted,
};

function pill(value: string) {
  return value ? <span className={`${orderStyles.statusPill} ${STATUS_PILL[value] ?? orderStyles.statusPillDraft}`}>{value}</span> : "";
}

/** The cells drawn here: date, purpose, amount, and the badge columns (Qt `badgeColumns`). */
const COLUMN_RENDER_OVERRIDES = {
  // The calendar day as stored (no zone shift), shown dd/MM/yyyy.
  sdc_dc_date: (row: MasterTableRow) => formatDate(toDateInput(asText(sourceValue(row, "sdc_dc_date")))),
  // The label the entry shows ("Job work"), not the stored code.
  sdc_purpose: (row: MasterTableRow) => purposeLabel(asText(sourceValue(row, "sdc_purpose"))),
  sdc_dc_amt: (row: MasterTableRow) => formatCurrency(toNumber(asText(sourceValue(row, "sdc_dc_amt"))), 2, true),
  sdc_status: (row: MasterTableRow) => pill(statusOf(row)),
  sdc_fulfil_status: (row: MasterTableRow) => pill(asText(sourceValue(row, "sdc_fulfil_status")).trim().toUpperCase()),
};

export function dcKeyOfRow(row: MasterTableRow): DcDocKey {
  return {
    sdcId: asText(sourceValue(row, "sdc_id")),
    sdcCompanyId: asText(sourceValue(row, "sdc_company_id")),
    sdcBranchId: asText(sourceValue(row, "sdc_branch_id")),
    sdcAccYear: asText(sourceValue(row, "sdc_acc_year")),
  };
}

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: String(DC_LIST_WINDOW_DAYS), label: `Last ${DC_LIST_WINDOW_DAYS} days` },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type DcListViewProps = {
  onCreate: () => void;
  onOpen: (key: DcDocKey, openForEdit: boolean) => void;
};

export function DcListView({ onCreate, onOpen }: DcListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -DC_LIST_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(DC_LIST_WINDOW_DAYS));
  const [fulfil, setFulfil] = useState<string>("");
  const [print, setPrint] = useState<{ key: DcDocKey; refno: string } | null>(null);
  const [history, setHistory] = useState<{ docId: string; companyId: string; accYear: string; refNo: string } | null>(null);
  const [deleteDc] = useDcDeleteMutation();

  const applyPeriod = useCallback((value: string) => {
    setPeriod(value);
    const days = Number.parseInt(value, 10);
    if (value === "custom" || !Number.isFinite(days)) return;
    setToDate(todayIso());
    setFromDate(addDays(todayIso(), -days));
  }, []);

  const buildListQuery = useCallback(
    ({ searchTerm, currentPage, pageSize, sortBy, sortDir }: { searchTerm: string; currentPage: number; pageSize: number; sortBy?: string; sortDir?: "asc" | "desc" }) => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
      grid_param: JSON.stringify({
        icompany_id: companyId || NO_TENANT_ID,
        ibranch_id: branchId || NO_TENANT_ID,
        iacc_year: accYear,
        ifrom_date: fromDate,
        ito_date: toDate,
        ifulfil: fulfil,
      }),
    }),
    [accYear, branchId, companyId, fromDate, fulfil, toDate],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${fulfil}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="dc-list-from">
            From
          </label>
          <DateInput id="dc-list-from" className={orderStyles.filterDateInput} value={fromDate} max={toDate || undefined} onChange={(value) => { setFromDate(value); setPeriod("custom"); }} />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="dc-list-to">
            To
          </label>
          <DateInput id="dc-list-to" className={orderStyles.filterDateInput} value={toDate} min={fromDate || undefined} onChange={(value) => { setToDate(value); setPeriod("custom"); }} />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="dc-list-period">
            Period
          </label>
          <select id="dc-list-period" className={orderStyles.filterSelect} value={period} onChange={(event) => applyPeriod(event.target.value)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="dc-list-fulfil">
            Fulfilment
          </label>
          <select id="dc-list-fulfil" className={orderStyles.filterSelect} value={fulfil} onChange={(event) => setFulfil(event.target.value)}>
            {DC_FULFIL_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </>
    ),
    [applyPeriod, fromDate, fulfil, period, toDate],
  );

  return (
    <>
      <CrudMasterPage
        title={DC_LIST_TITLE}
        listSubtitleOverride={DC_LIST_SUBTITLE}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        entityLabel="challan"
        entityLabelPlural="challans"
        searchPlaceholder={DC_SEARCH_HINT}
        apiEndpoints={API_ENDPOINTS}
        gridKey={DC_LIST_GRID_KEY}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        listTitle="Challan List"
        createLabel="New Challan"
        codeColumnHeader="DC No"
        nameColumnHeader="Customer"
        listResponseStyleArrayKey=""
        gridTableName="sale_dc"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        permissionMenuId={DC_MENU_ID}
        rowClassName={(row) => (statusOf(row) === "CANCELLED" ? orderStyles.cancelledRow : undefined)}
        onCreateAction={onCreate}
        isRowEditDisabled={(row) => !dcRowPolicy(statusOf(row)).canEdit}
        rowEditDisabledReason="Cancelled — raise a new challan instead."
        isRowDeleteDisabled={(row) => !dcRowPolicy(statusOf(row)).canDelete}
        rowDeleteDisabledReason="Posted — open it to amend or cancel; a posted challan is never deleted."
        deleteConfirmMessage={(row) => `Delete draft challan "${asText(sourceValue(row, "sdc_dc_refno")) || "this challan"}"? This cannot be undone.`}
        onDeleteAction={async (row) => {
          try {
            await deleteDc(dcKeyOfRow(row)).unwrap();
            const refno = asText(sourceValue(row, "sdc_dc_refno"));
            toast.success(refno ? `Challan "${refno}" deleted.` : "Challan deleted.");
            return true;
          } catch (error) {
            toast.apiError(error);
            return false;
          }
        }}
        onEditAction={(row) => onOpen(dcKeyOfRow(row), dcRowPolicy(statusOf(row)).canEdit)}
        onViewAction={(row) => onOpen(dcKeyOfRow(row), false)}
        onHistoryAction={(row) => {
          const key = dcKeyOfRow(row);
          setHistory({ docId: key.sdcId, companyId: key.sdcCompanyId, accYear: key.sdcAccYear, refNo: asText(sourceValue(row, "sdc_dc_refno")) });
        }}
        onPrintAction={(row) => setPrint({ key: dcKeyOfRow(row), refno: asText(sourceValue(row, "sdc_dc_refno")) })}
      />
      <TxnHistoryDialog target={history} docLabel={DC_TITLE} onClose={() => setHistory(null)} />
      {print ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrint(null)}
          purposeCode={DC_PRINT_PURPOSE}
          documentLabel={print.refno ? `Challan ${print.refno}` : "Challan"}
          targets={[{ docId: print.key.sdcId, companyId: print.key.sdcCompanyId, accYear: print.key.sdcAccYear, filename: `challan-${print.refno || print.key.sdcId}` }]}
        />
      ) : null}
    </>
  );
}
