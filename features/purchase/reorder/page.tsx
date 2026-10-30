"use client";

/**
 * Reorder → PO (menu 296) — the Qt `PurchaseReorderEntry` (NexERP 6c6b5c2,
 * plan DOC-02). Items of this branch at / below their reorder level (the item
 * card's reorder rows), with stock here, what is already on order, the
 * suggested qty and supplier (preferred on the supplier–item map, else the last
 * bill's). Tick rows (✓ or Space), adjust Order qty / Rate, set a supplier for
 * the ticked ones — "Create POs" makes one DRAFT PO per supplier, opened from
 * Purchase Order to check and Confirm.
 *
 * Keys: Ctrl+Enter Create POs, F5 Refresh, Esc Close, F1 the sheet.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { money, purchaseRefusalText } from "@/features/purchase/shared/purchase.format";
import { usePurchaseScope } from "@/features/purchase/shared/use-purchase-scope";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { HOME_ROUTE } from "@/lib/navigation/routes";
import { toast } from "@/lib/notify";
import { documentRights } from "@/lib/permissions/document-rights";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { focusReorderCell, ReorderGrid } from "./components/reorder-grid";
import { usePurchaseReorderCreatePosMutation, usePurchaseReorderSuggestionsMutation } from "./reorder.api";
import { PURCHASE_ORDER_ROUTE, REORDER_LINES_UI_TABLE_KEY, SUPPLIER_DROPDOWN_KEY } from "./reorder.constants";
import {
  createBody,
  createProblems,
  editOrderQty,
  editRate,
  resolveReorderColumns,
  rowsFromSuggestions,
  setSupplierForTicked,
  summarize,
  tickAll,
  tickAllLabel,
  toggleTick,
} from "./reorder.state";
import type { ReorderMadePo, ReorderRow } from "./reorder.types";
import styles from "./page.module.scss";

const IDS = { filter: "purchase-reorder-supplier-filter", setSupplier: "purchase-reorder-set-supplier" } as const;

const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Tick / untick the row", keyText: "Space" },
  { label: "Order qty → Rate → next row", keyText: "Enter" },
  { label: "Row above / below", keyText: "↑ / ↓" },
  { label: "Read the list again", keyText: "F5" },
];
const KEY_SHEET = keySheetRows([{ action: "post", label: "Create POs" }, "close"], LINE_KEYS);

const HINT_READY =
  "Rows below their level with a supplier come ticked. Click ✓ or press Space to tick; key Order qty / Rate; Create POs makes one draft per supplier.";

type Picked = { id: string; name: string };
type Busy = "loading" | "creating" | null;

export default function PurchaseReorderPage() {
  const router = useRouter();
  const scope = usePurchaseScope();
  const { activeCompany, activeBranch } = useBusinessContext();
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [rows, setRows] = useState<ReorderRow[]>([]);
  const [filter, setFilter] = useState<Picked>({ id: "", name: "" });
  const [showAll, setShowAll] = useState(false);
  const [buyFrom, setBuyFrom] = useState<Picked>({ id: "", name: "" });
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [made, setMade] = useState<ReorderMadePo[] | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });

  const uiTableId = useUiTableId(REORDER_LINES_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveReorderColumns(layout), [layout]);
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);

  const [suggestionsMutation] = usePurchaseReorderSuggestionsMutation();
  const [createPosMutation] = usePurchaseReorderCreatePosMutation();

  // ------------------------------------------------------------- reading
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    if (!scope.companyId || !scope.branchId) {
      return;
    }
    seq.current += 1;
    const mine = seq.current;
    setBusy("loading");
    setHint("Reading the reorder list…");
    try {
      const answer = await suggestionsMutation({
        companyId: scope.companyId,
        branchId: scope.branchId,
        supplierId: filter.id || undefined,
        belowOnly: !showAll,
      }).unwrap();
      if (mine !== seq.current) {
        return;
      }
      const next = rowsFromSuggestions(answer);
      setRows(next);
      setHint(
        next.length > 0
          ? HINT_READY
          : showAll
            ? "No reorder levels are set for this branch — set them on the item card (Reorder)."
            : "Nothing is at or below its reorder level here.",
      );
    } catch (error) {
      if (mine === seq.current) {
        setHint(purchaseRefusalText(error));
      }
    } finally {
      if (mine === seq.current) {
        setBusy(null);
      }
    }
  }, [filter.id, scope.branchId, scope.companyId, showAll, suggestionsMutation]);

  // The list follows the branch, the supplier filter and "every reorder item"
  // (read on the next tick, so a burst of changes reads once).
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // ------------------------------------------------------------ the rows
  const onToggle = useCallback((key: string) => setRows((current) => toggleTick(current, key)), []);
  const onOrderQty = useCallback((key: string, raw: string) => setRows((current) => editOrderQty(current, key, raw)), []);
  const onRate = useCallback((key: string, raw: string) => setRows((current) => editRate(current, key, raw)), []);
  const onTickAll = useCallback(() => setRows((current) => tickAll(current)), []);

  const onUseSupplier = useCallback(() => {
    if (!buyFrom.id) {
      toast.warn("Pick the supplier to buy the ticked rows from.", { title: "Pick a supplier" });
      return;
    }
    const { rows: next, count } = setSupplierForTicked(rowsRef.current, buyFrom.id, buyFrom.name);
    setRows(next);
    setHint(count ? `${count} ticked rows will be bought from ${buyFrom.name}.` : "Tick the rows first.");
  }, [buyFrom]);

  // ------------------------------------------------------------ creating
  const mayCreate = rights.mayStartNew;
  const working = busy !== null;
  const createPos = useCallback(async () => {
    if (busy) {
      return;
    }
    // An order qty still being typed lands on blur.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const current = rowsRef.current;
    const problems = createProblems(current);
    if (problems.length > 0) {
      toast.warn(problems.join("\n"), { title: "Check the ticked rows" });
      return;
    }
    if (!scope.deviceId) {
      toast.warn("This sign-in carries no registered device. Sign in again on a registered computer.", { title: "No device" });
      return;
    }
    const body = createBody(current, scope);
    if (!body) {
      toast.warn("Tick the rows to order (✓ column or Space).", { title: "Nothing ticked" });
      return;
    }
    setBusy("creating");
    try {
      const answer = await createPosMutation(body).unwrap();
      setMade(answer);
      setBusy(null);
      void refresh();
    } catch (error) {
      setHint(purchaseRefusalText(error));
      toast.apiError(error, { title: "Not made" });
      setBusy(null);
    }
  }, [busy, createPosMutation, refresh, scope]);

  const close = useCallback(() => router.push(HOME_ROUTE), [router]);

  // ------------------------------------------------------------ keys
  useTxnKeys(
    {
      post: !working && mayCreate ? () => void createPos() : null,
      close: !working ? close : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: made === null && !keysOpen },
  );

  // F5 reads the list again — and never reloads the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F5" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      if (!document.querySelector('[aria-modal="true"]')) {
        void refresh();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refresh]);

  // The first row takes the keys once the list is in.
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (focusedOnce.current || rows.length === 0) {
      return;
    }
    focusedOnce.current = true;
    window.requestAnimationFrame(() => focusReorderCell(rows[0].key, "tick"));
  }, [rows]);

  const summary = summarize(rows);

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        <div className={styles.titleLine}>
          <h1 className={quotationStyles.title}>Reorder → PO</h1>
          <span className={styles.scope} title="The company and branch the reorder levels are read for.">
            {[activeCompany?.name, activeBranch?.name, scope.accYear].filter(Boolean).join(" · ")}
          </span>
          {busy === "loading" ? <span className={styles.scope}>loading…</span> : null}
        </div>
        <div className={styles.filterCard}>
          <div className={styles.filterSupplier}>
            <DropdownCombo
              id={IDS.filter}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              metaKey="sup_region_name"
              value={filter.id}
              selectedLabel={filter.name}
              placeholder="All suppliers"
              onSelect={(id, name) => setFilter({ id, name })}
            />
          </div>
          <button
            type="button"
            className={quotationStyles.button}
            title="Clear the supplier — every supplier's items."
            disabled={!filter.id}
            onClick={() => setFilter({ id: "", name: "" })}
          >
            All suppliers
          </button>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
            Every reorder item (not only those at / below their level)
          </label>
          <button
            type="button"
            className={cx(quotationStyles.button, styles.pushRight)}
            disabled={busy === "loading"}
            onClick={() => void refresh()}
          >
            Refresh · F5
          </button>
        </div>
      </div>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Reorder items</span>
          <span className={quotationStyles.modalNote}>
            ✓ or Space ticks · Enter walks Order qty → Rate · F1 lists the keys
          </span>
        </div>
        <ReorderGrid
          rows={rows}
          columns={columns}
          disabled={busy === "creating"}
          onToggle={onToggle}
          onOrderQty={onOrderQty}
          onRate={onRate}
        />
      </section>

      <p className={styles.hintLine} role="status">
        {hint}
      </p>

      <div className={styles.supplierBar}>
        <div className={styles.filterSupplier}>
          <DropdownCombo
            id={IDS.setSupplier}
            label="Buy the ticked rows from"
            dropdownId={supplierDropdownId}
            valueKey="sup_id"
            labelKey="sup_name"
            metaKey="sup_region_name"
            value={buyFrom.id}
            selectedLabel={buyFrom.name}
            placeholder="Pick a supplier"
            onSelect={(id, name) => setBuyFrom({ id, name })}
          />
        </div>
        <button type="button" className={quotationStyles.button} disabled={working || !buyFrom.id} onClick={onUseSupplier}>
          Use for ticked rows
        </button>
        <span className={styles.summary} aria-label="Ticked">
          {summary.ticked > 0 ? (
            <>
              {summary.ticked} ticked · <strong>{summary.pos} PO{summary.pos === 1 ? "" : "s"}</strong> · about{" "}
              {money(summary.value)} before tax
              {summary.withoutSupplier > 0 ? (
                <span className={styles.warn}> · {summary.withoutSupplier} without a supplier</span>
              ) : null}
            </>
          ) : null}
        </span>
      </div>

      <div className={styles.buttonBar}>
        <button type="button" className={quotationStyles.button} disabled={working || rows.length === 0} onClick={onTickAll}>
          {tickAllLabel(rows)}
        </button>
        <span className={styles.footerHint}>F1 · keys on this screen</span>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title="One DRAFT purchase order per supplier from the ticked rows."
          disabled={working || !mayCreate || summary.ticked === 0}
          onClick={() => void createPos()}
        >
          {busy === "creating" ? "Creating…" : withKey("Create POs", "post")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={close}>
          {withKey("Close", "close")}
        </button>
      </div>

      {made ? (
        <ModalShell
          title="Purchase orders made"
          isOpen
          narrow
          onClose={() => setMade(null)}
          footer={
            <div className={styles.dialogActions}>
              <button type="button" className={quotationStyles.button} onClick={() => setMade(null)}>
                Stay here
              </button>
              <button
                type="button"
                className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
                autoFocus
                onClick={() => router.push(PURCHASE_ORDER_ROUTE)}
              >
                Open Purchase Orders
              </button>
            </div>
          }
        >
          <p className={styles.dialogNote}>Saved as drafts — open them in Purchase Order to check and Confirm:</p>
          <ul className={styles.madeList}>
            {made.map((po) => (
              <li key={po.poId}>
                <strong>{po.refno}</strong> — {po.supplierName ?? ""} ({po.lines} {po.lines === 1 ? "line" : "lines"})
              </li>
            ))}
          </ul>
        </ModalShell>
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
    </div>
  );
}
