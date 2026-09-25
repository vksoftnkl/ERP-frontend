"use client";

/**
 * Temp Credits (menu 257, grid 114) — §24.
 *
 * `atc_*` rows; filters `istatus` ('' = Open + Partial … ALL) and
 * `ioverdue_only`; 365 days back; search "mobile, name or bill no". Open =
 * the BILL behind it (`atc_src_doc_id`), read-only. **Receive F5** (balance >
 * 0): copy the mobile to the clipboard, say "Opening the receipt. Bill X ·
 * mobile M (copied) — pick the walk-in ledger and tick the bill.", open menu
 * 99. **Follow-up F6** (balance > 0): the promise date + remark →
 * `PUT /temp-credits/follow-up`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiEye, FiMessageSquare, FiRefreshCw, FiDollarSign } from "react-icons/fi";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { formatCurrency } from "@/domain/pricing";
import { accountingYearOf, addDays, toDateInput, todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import { useFollowUpTempCreditMutation, useListTempCreditsQuery, type TempCreditRow } from "@/features/sales/testbill/api/bills";
import { RECEIPT_ROUTE, TEMP_CREDIT_LIST_WINDOW_DAYS } from "@/features/sales/testbill/constants";
import { errorMessageOf } from "@/features/sales/testbill/domain/notes";
import type { SaleBillDocKey } from "@/features/sales/testbill/types";
import { FollowUpDialog } from "./follow-up-dialog";
import { RegisterShell, type RegisterColumn } from "./register-shell";

const STATUS_OPTIONS = [
  { value: "", label: "Open + Partial" },
  { value: "OPEN", label: "Open" },
  { value: "PARTIAL", label: "Partial" },
  { value: "SETTLED", label: "Settled" },
  { value: "WRITTEN_OFF", label: "Written off" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All" },
] as const;

const PAGE_SIZE = 20;

/** The bill behind the temp credit — the key comes from the ROW. */
function billKeyOf(row: TempCreditRow): SaleBillDocKey | null {
  if (!row.atc_src_doc_id) {
    return null;
  }
  return { sbId: row.atc_src_doc_id, sbCompanyId: row.atc_company_id, sbBranchId: row.atc_branch_id, sbAccYear: row.atc_acc_year };
}

export type TempCreditListViewProps = {
  onOpenBill?: (key: SaleBillDocKey) => void;
};

export function TempCreditListView({ onOpenBill }: TempCreditListViewProps) {
  const router = useRouter();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());

  const [status, setStatus] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -TEMP_CREDIT_LIST_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [followUp, setFollowUp] = useState<TempCreditRow | null>(null);

  const { data, isFetching, refetch } = useListTempCreditsQuery(
    { companyId, branchId, accYear, page, limit: PAGE_SIZE, fromDate, toDate, status, overdueOnly },
    { skip: !companyId || !accYear },
  );
  const [followUpTempCredit, { isLoading: saving }] = useFollowUpTempCreditMutation();

  const rows = useMemo(() => {
    const all = data?.items ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) =>
      [row.atc_mobile, row.atc_name, row.atc_bill_refno].filter(Boolean).some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [data, search]);
  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length, page]);
  useEffect(() => {
    setPage(1);
  }, [status, overdueOnly, fromDate, toDate]);

  const activeRow = rows[activeIndex] ?? null;
  const balanceOf = (row: TempCreditRow | null) => toNumber(row?.atc_balance_amount);

  const receive = useCallback(async () => {
    if (!activeRow || balanceOf(activeRow) <= 0) {
      toast.warn("Highlight a temp credit with a balance first.");
      return;
    }
    const mobile = activeRow.atc_mobile ?? "";
    try {
      await navigator.clipboard.writeText(mobile);
    } catch {
      // The clipboard is a convenience; the message names the mobile anyway.
    }
    toast.info(
      `Opening the receipt. Bill ${activeRow.atc_bill_refno ?? "—"} · mobile ${mobile || "—"} (copied) — pick the walk-in ledger and tick the bill.`,
    );
    router.push(RECEIPT_ROUTE);
  }, [activeRow, router]);

  const openFollowUp = useCallback(() => {
    if (!activeRow || balanceOf(activeRow) <= 0) {
      toast.warn("Highlight a temp credit with a balance first.");
      return;
    }
    setFollowUp(activeRow);
  }, [activeRow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (followUp || event.repeat) return;
      if (event.key === "F5") {
        event.preventDefault();
        void receive();
      } else if (event.key === "F6") {
        event.preventDefault();
        openFollowUp();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [followUp, openFollowUp, receive]);

  const columns: RegisterColumn<TempCreditRow>[] = [
    { key: "date", header: "Bill date", render: (row) => toDateInput(row.atc_bill_date) },
    { key: "refno", header: "Bill No", render: (row) => row.atc_bill_refno ?? "—" },
    { key: "name", header: "Name", render: (row) => row.atc_name ?? "" },
    { key: "mobile", header: "Mobile", render: (row) => row.atc_mobile ?? "" },
    { key: "place", header: "Place", render: (row) => row.atc_place ?? "" },
    { key: "credit", header: "Credit", align: "right", render: (row) => formatCurrency(toNumber(row.atc_credit_amount), 2, true) },
    { key: "balance", header: "Balance", align: "right", render: (row) => formatCurrency(toNumber(row.atc_balance_amount), 2, true) },
    { key: "due", header: "Due", render: (row) => toDateInput(row.atc_due_date) },
    {
      key: "overdue",
      header: "Overdue",
      align: "right",
      render: (row) => {
        const days = toNumber(row.days_overdue);
        return days > 0 ? <span className={orderStyles.creditFieldAlert}>{days} d</span> : "";
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const value = (row.atc_status ?? "").toUpperCase();
        const cls = value === "SETTLED" ? orderStyles.statusPillCompleted : value === "CANCELLED" || value === "WRITTEN_OFF" ? orderStyles.statusPillCancelled : orderStyles.statusPillDraft;
        return <span className={cx(orderStyles.statusPill, cls)}>{value}</span>;
      },
    },
    { key: "promise", header: "Promised", render: (row) => toDateInput(row.atc_promise_date) },
    { key: "followup", header: "Last follow-up", render: (row) => toDateInput(row.atc_followup_on) },
    { key: "remarks", header: "Remarks", render: (row) => row.atc_remarks ?? "" },
  ];

  return (
    <>
      <RegisterShell
        title="Temp Credits"
        toolbar={
          <>
            <button
              type="button"
              className={cx(quotationStyles.toolButton, activeRow && balanceOf(activeRow) > 0 && quotationStyles.toolButtonActive)}
              disabled={!activeRow || balanceOf(activeRow) <= 0}
              title="Receive — opens the receipt with the mobile copied (F5)"
              onClick={() => void receive()}
            >
              <FiDollarSign aria-hidden="true" />
              Receive <span className={quotationStyles.buttonHint}>F5</span>
            </button>
            <button type="button" className={quotationStyles.toolButton} disabled={!activeRow || balanceOf(activeRow) <= 0} title="Record a follow-up (F6)" onClick={openFollowUp}>
              <FiMessageSquare aria-hidden="true" />
              Follow-up <span className={quotationStyles.buttonHint}>F6</span>
            </button>
            <button
              type="button"
              className={quotationStyles.toolButton}
              disabled={!activeRow || !billKeyOf(activeRow) || !onOpenBill}
              title="Open the bill behind it, read-only"
              onClick={() => {
                const key = activeRow ? billKeyOf(activeRow) : null;
                if (key) onOpenBill?.(key);
              }}
            >
              <FiEye aria-hidden="true" />
              Open bill
            </button>
            <button type="button" className={quotationStyles.toolButton} onClick={() => void refetch()}>
              <FiRefreshCw aria-hidden="true" />
              Refresh
            </button>
          </>
        }
        filters={
          <>
            <label className={quotationStyles.filterField}>
              <span>Search:</span>
              <input className={quotationStyles.input} value={search} placeholder="mobile, name or bill no" onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label className={quotationStyles.filterField}>
              <span>Status:</span>
              <select className={quotationStyles.select} value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={quotationStyles.filterField}>
              <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
              <span>Overdue only</span>
            </label>
            <label className={quotationStyles.filterField}>
              <span>From:</span>
              <input type="date" className={quotationStyles.input} value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label className={quotationStyles.filterField}>
              <span>To:</span>
              <input type="date" className={quotationStyles.input} value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
            </label>
          </>
        }
        columns={columns}
        rows={rows}
        rowKey={(row) => row.atc_id}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        onRowEnter={(row) => {
          const key = billKeyOf(row);
          if (key) onOpenBill?.(key);
        }}
        loading={isFetching}
        emptyText="No temp credit matches."
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.meta?.total ?? 0}
        onPageChange={setPage}
        hint="F5 receive (opens the receipt, mobile copied) · F6 follow-up · Enter opens the bill read-only."
        paused={followUp !== null}
      />
      <FollowUpDialog
        isOpen={followUp !== null}
        row={followUp}
        busy={saving}
        onClose={() => setFollowUp(null)}
        onSubmit={async (result) => {
          if (!followUp) return;
          try {
            await followUpTempCredit({
              atcId: followUp.atc_id,
              atcAccYear: followUp.atc_acc_year,
              remarks: result.remarks,
              // Three-way: omitted = keep, null = clear, date = set.
              ...(result.promiseDate === undefined ? {} : { promiseDate: result.promiseDate }),
            }).unwrap();
            toast.success("Follow-up recorded.");
            setFollowUp(null);
            void refetch();
          } catch (error) {
            toast.error(errorMessageOf(error));
          }
        }}
      />
    </>
  );
}
