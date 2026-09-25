"use client";

/**
 * Bill Delivery Update (menu 226, grid 113) — §24.
 *
 * `sb_delivery_status` badge; filter `idelivery_status` ('' = the pending set,
 * PENDING…ALL). PUT `/bills/delivery-status {key, event, remarks?}`: Verify F4
 * (only with `sales.require_verification_before_dispatch`, from NA/PENDING) →
 * Packed F5 → Dispatched F6 → Delivered F7; the server enforces the order
 * (`SALES_DELIVERY_ORDER`). Only meaningful with
 * `sales.delivery_status_tracking`; POS bills are NA. Enter opens the bill
 * read-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiPackage, FiRefreshCw, FiTruck, FiHome, FiEye } from "react-icons/fi";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { formatCurrency } from "@/domain/pricing";
import { accountingYearOf, addDays, toDateInput, todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import { useAppSelector } from "@/store/hooks";
import { selectAppSettingBool } from "@/store/slices/appSettingsSlice";
import {
  useListBillDeliveriesQuery,
  useUpdateDeliveryStatusMutation,
  type BillDeliveryRow,
} from "@/features/sales/testbill/api/bills";
import {
  DELIVERY_STATUS_TRACKING_SETTING_KEY,
  REQUIRE_VERIFICATION_BEFORE_DISPATCH_SETTING_KEY,
  type DeliveryEvent,
} from "@/features/sales/testbill/constants";
import { errorMessageOf } from "@/features/sales/testbill/domain/notes";
import { AskText } from "@/features/sales/testbill/components/ask-text";
import type { SaleBillDocKey } from "@/features/sales/testbill/types";
import { RegisterShell, type RegisterColumn } from "./register-shell";

const STATUS_OPTIONS = [
  { value: "", label: "Pending set" },
  { value: "PENDING", label: "Pending" },
  { value: "VERIFIED", label: "Verified" },
  { value: "PACKED", label: "Packed" },
  { value: "DISPATCHED", label: "Dispatched" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "NA", label: "Not applicable" },
  { value: "ALL", label: "All" },
] as const;

const PAGE_SIZE = 20;

const EVENTS: ReadonlyArray<{ event: DeliveryEvent; label: string; key: string; from: readonly string[] }> = [
  { event: "VERIFIED", label: "Verify", key: "F4", from: ["NA", "PENDING", ""] },
  { event: "PACKED", label: "Packed", key: "F5", from: ["NA", "PENDING", "VERIFIED", ""] },
  { event: "DISPATCHED", label: "Dispatched", key: "F6", from: ["PACKED"] },
  { event: "DELIVERED", label: "Delivered", key: "F7", from: ["DISPATCHED"] },
];

function keyOf(row: BillDeliveryRow): SaleBillDocKey {
  return { sbId: row.sb_id, sbCompanyId: row.sb_company_id, sbBranchId: row.sb_branch_id, sbAccYear: row.sb_acc_year };
}

export type DeliveryListViewProps = {
  /** Enter / double-click: open the bill read-only. */
  onOpen?: (key: SaleBillDocKey) => void;
};

export function DeliveryListView({ onOpen }: DeliveryListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  const tracking = useAppSelector((state) => selectAppSettingBool(state, DELIVERY_STATUS_TRACKING_SETTING_KEY, false));
  const requireVerification = useAppSelector((state) =>
    selectAppSettingBool(state, REQUIRE_VERIFICATION_BEFORE_DISPATCH_SETTING_KEY, false),
  );

  const [status, setStatus] = useState<string>("");
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -30));
  const [toDate, setToDate] = useState(() => todayIso());
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [remarkFor, setRemarkFor] = useState<{ row: BillDeliveryRow; event: DeliveryEvent } | null>(null);

  const { data, isFetching, refetch } = useListBillDeliveriesQuery(
    { companyId, branchId, accYear, page, limit: PAGE_SIZE, fromDate, toDate, deliveryStatus: status },
    { skip: !companyId || !branchId || !accYear },
  );
  const [updateStatus, { isLoading: updating }] = useUpdateDeliveryStatusMutation();

  const rows = useMemo(() => {
    const all = data?.items ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) =>
      [row.sb_bill_refno, row.sb_cust_name, row.sb_cust_phone, row.sb_cust_place, row.sb_vehicle_no, row.driver_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [data, search]);
  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length, page]);
  useEffect(() => {
    setPage(1);
  }, [status, fromDate, toDate]);

  const activeRow = rows[activeIndex] ?? null;

  const eventAllowed = useCallback(
    (row: BillDeliveryRow | null, event: DeliveryEvent): string | null => {
      if (!row) return "Highlight a bill first.";
      const current = (row.sb_delivery_status ?? "").toUpperCase();
      if (current === "NA" && (row.sb_status ?? "").toUpperCase() !== "POSTED") {
        return "Only a posted bill is delivered.";
      }
      if (event === "VERIFIED" && !requireVerification) {
        return "Verification is off for this company (sales.require_verification_before_dispatch).";
      }
      const spec = EVENTS.find((entry) => entry.event === event)!;
      if (!spec.from.includes(current)) {
        return `${spec.label} follows ${spec.from.filter(Boolean).join(" / ") || "the start"} — this bill is ${current || "pending"}. The server enforces the order.`;
      }
      return null;
    },
    [requireVerification],
  );

  const runEvent = useCallback(
    async (row: BillDeliveryRow, event: DeliveryEvent, remarks: string | null) => {
      try {
        const result = await updateStatus({ ...keyOf(row), event, ...(remarks ? { remarks } : {}) }).unwrap();
        toast.success(`Bill ${row.sb_bill_refno ?? ""} is now ${result.sbDeliveryStatus}.`);
        void refetch();
      } catch (error) {
        toast.error(errorMessageOf(error));
      }
    },
    [refetch, updateStatus],
  );

  const requestEvent = useCallback(
    (event: DeliveryEvent) => {
      const blocked = eventAllowed(activeRow, event);
      if (blocked || !activeRow) {
        toast.warn(blocked ?? "Highlight a bill first.");
        return;
      }
      // Dispatch and delivery take a remark (who took it, the LR); the others go straight through.
      if (event === "DISPATCHED" || event === "DELIVERED") {
        setRemarkFor({ row: activeRow, event });
        return;
      }
      void runEvent(activeRow, event, null);
    },
    [activeRow, eventAllowed, runEvent],
  );

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (remarkFor || keyEvent.repeat) return;
      const spec = EVENTS.find((entry) => entry.key === keyEvent.key);
      if (spec) {
        keyEvent.preventDefault();
        requestEvent(spec.event);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [remarkFor, requestEvent]);

  const columns: RegisterColumn<BillDeliveryRow>[] = [
    { key: "date", header: "Date", render: (row) => toDateInput(row.sb_bill_date) },
    { key: "refno", header: "Bill No", render: (row) => row.sb_bill_refno ?? "—" },
    { key: "cust", header: "Customer", render: (row) => row.sb_cust_name ?? "" },
    { key: "place", header: "Place", render: (row) => row.sb_cust_place ?? "" },
    { key: "phone", header: "Phone", render: (row) => row.sb_cust_phone ?? "" },
    { key: "amt", header: "Total", align: "right", render: (row) => formatCurrency(toNumber(row.sb_bill_amt), 2, true) },
    {
      key: "status",
      header: "Delivery",
      render: (row) => {
        const value = (row.sb_delivery_status ?? "").toUpperCase() || "PENDING";
        const cls =
          value === "DELIVERED" ? orderStyles.statusPillCompleted : value === "NA" ? orderStyles.statusPillCancelled : orderStyles.statusPillDraft;
        return <span className={cx(orderStyles.statusPill, cls)}>{value}</span>;
      },
    },
    { key: "vehicle", header: "Vehicle", render: (row) => row.sb_vehicle_no ?? "" },
    { key: "driver", header: "Driver", render: (row) => row.driver_name ?? "" },
    { key: "delivered", header: "Delivered on", render: (row) => (row.sb_delivered_on ? toDateInput(row.sb_delivered_on) : "") },
  ];

  return (
    <>
      <RegisterShell
        title="Bill Delivery Update"
        subtitle={tracking ? undefined : "Delivery tracking is off for this company (sales.delivery_status_tracking) — the register still reads."}
        toolbar={
          <>
            {EVENTS.map((spec) => {
              const blocked = eventAllowed(activeRow, spec.event);
              const Icon = spec.event === "VERIFIED" ? FiCheckCircle : spec.event === "PACKED" ? FiPackage : spec.event === "DISPATCHED" ? FiTruck : FiHome;
              return (
                <button
                  key={spec.event}
                  type="button"
                  className={cx(quotationStyles.toolButton, !blocked && quotationStyles.toolButtonActive)}
                  disabled={Boolean(blocked) || updating}
                  title={blocked ?? `${spec.label} (${spec.key})`}
                  onClick={() => requestEvent(spec.event)}
                >
                  <Icon aria-hidden="true" />
                  {spec.label} <span className={quotationStyles.buttonHint}>{spec.key}</span>
                </button>
              );
            })}
            <button type="button" className={quotationStyles.toolButton} disabled={!activeRow || !onOpen} onClick={() => activeRow && onOpen?.(keyOf(activeRow))}>
              <FiEye aria-hidden="true" />
              Open
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
              <input className={quotationStyles.input} value={search} placeholder="bill no, customer, vehicle…" onChange={(event) => setSearch(event.target.value)} />
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
        rowKey={(row) => row.sb_id}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        onRowEnter={(row) => onOpen?.(keyOf(row))}
        loading={isFetching}
        emptyText="No bill matches."
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.meta?.total ?? 0}
        onPageChange={setPage}
        hint="F4 verify · F5 packed · F6 dispatched · F7 delivered · Enter opens the bill read-only. The server enforces the order."
        paused={remarkFor !== null}
      />
      <AskText
        isOpen={remarkFor !== null}
        title={remarkFor ? `${EVENTS.find((entry) => entry.event === remarkFor.event)?.label} — bill ${remarkFor.row.sb_bill_refno ?? ""}` : ""}
        message="Who takes it, where, and any LR or vehicle note."
        label="Remarks"
        maxLength={250}
        busy={updating}
        confirmLabel="Record"
        onCancel={() => setRemarkFor(null)}
        onConfirm={async (value) => {
          const pending = remarkFor;
          setRemarkFor(null);
          if (pending) {
            await runEvent(pending.row, pending.event, value || null);
          }
        }}
      />
    </>
  );
}
