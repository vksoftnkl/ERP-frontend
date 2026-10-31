"use client";

/**
 * Delivery Challan entry — the Qt `DeliveryChallanEntry` screen on the web.
 *
 * Title bar (status · fulfilment · source chip · DC no · audit), the quick
 * strip, four header panels (customer + bill-to + party facts · challan ·
 * delivery crew + transport · source order), the GST badge line, the item grid
 * (ui_table 38 through the shared ItemGrid), the totals the Qt footer shows
 * (Items · Qty · Weight · Taxable · Tax · Total · COGS) and the verb bar, which
 * `verbsOf` paints from `/get`'s locks and rights.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FiArchive,
  FiCornerUpLeft,
  FiDollarSign,
  FiFileText,
  FiGitBranch,
  FiNavigation,
  FiPauseCircle,
  FiPercent,
  FiShoppingBag,
  FiTruck,
} from "react-icons/fi";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { DateInput } from "@/components/design-system/ui";
import { formatCurrency } from "@/domain/pricing";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { formatDateTime } from "@/lib/date-format";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { keySheetRows, type TxnKeyRow } from "@/lib/txn-keys";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { TxnHistoryDialog } from "@/components/txn/txn-history-dialog";
import { useGetTxnAdjacentMutation } from "@/components/txn/txn-adjacent";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { DropdownCombo, Field, GroupBox, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import { ItemGrid } from "@/features/sales/quotation/components/item-grid";
import { ItemPickerModal } from "@/features/sales/quotation/components/item-picker-modal";
import { HeldListModal } from "@/features/sales/quotation/components/held-list-modal";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { PriceLevelPrompt } from "@/features/sales/quotation/components/price-level-prompt";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useGetPriceLevelsQuery } from "@/store/api/quotationApi";
import { NumberPromptModal } from "@/features/sales/sale-order/components/number-prompt-modal";
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import { AskText } from "@/features/sales/testbill/components/ask-text";
import { CustomerQuickAdd } from "@/features/sales/testbill/components/customer-quick-add";
import { OpenSourcesDialog } from "@/features/sales/testbill/components/open-sources-dialog";
import { ShippingDialog } from "@/features/sales/testbill/components/shipping-dialog";
import { ValidationPopup, WarningStrip } from "@/features/sales/testbill/components/warning-strip";
import { shippingSummary } from "@/features/sales/testbill/domain/shipping";
import { useLazyGetBranchAddressQuery, useQuickAddCustomerMutation, type BranchAddress } from "@/features/sales/testbill/api/bills";
import { QuickRateDialog } from "@/features/stocks/selling-price/components/quick-rate-dialog";
import { DC_DOC_TYPE, DC_MENU_ID, DC_PRINT_PURPOSE, DC_PURPOSES, DC_PURPOSE_DROPDOWN_KEY, DC_TITLE, purposeLabel } from "../dc.constants";
import { billToLocked, customerLockReason, gstBadgeText, partyFacts, sourceSummary, type Fact } from "../dc.lifecycle";
import { dcKeyOf } from "../dc.payload";
import { itemLines } from "../dc.state";
import type { DcDocKey, DcDraftLine } from "../dc.types";
import { isDcHold, type DcScreen } from "../use-dc-screen";
import styles from "../page.module.scss";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "statusDraft",
  POSTED: "statusAccepted",
  CANCELLED: "statusCancelled",
};

const TONE_CLASS: Record<Fact["tone"], string | undefined> = {
  ink: undefined,
  amber: quotationStyles.statusSent,
  red: quotationStyles.statusCancelled,
};

/** The screen's own keys beyond the shared set — Qt's F-keys and chords, for the F1 sheet. */
const SCREEN_KEYS: TxnKeyRow[] = [
  { label: "Save draft / Post (by state)", keyText: "F5" },
  { label: "Post & Print", keyText: "F6" },
  { label: "Delete draft", keyText: "F3" },
  { label: "Clear", keyText: "F7" },
  { label: "Challan list", keyText: "F8" },
  { label: "Hold", keyText: "F9" },
  { label: "Pick held", keyText: "F10" },
  { label: "Validate (dry run)", keyText: "Ctrl+F7" },
  { label: "Import order lines", keyText: "Ctrl+F4" },
  { label: "Discount % to all", keyText: "Alt+D" },
  { label: "Show line cost", keyText: "Alt+O" },
  { label: "Copy as new", keyText: "Alt+Y" },
  { label: "Switch unit", keyText: "F4" },
  { label: "Row price level", keyText: "Ctrl+± / Ctrl+1..4" },
];

export type DcEntryViewProps = {
  screen: DcScreen;
  onShowList: () => void;
};

export function DcEntryView({ screen, onShowList }: DcEntryViewProps) {
  const router = useRouter();
  const { draft, dispatch, pricing, verbs, actions, settings, busy } = screen;
  const editable = draft.mode === "entry";
  const totals = pricing.totals;
  const stored = draft.storedTotals;

  const customerDropdownId = useDropdownId("customer");
  const posDropdownId = useDropdownId("gstStateCode");
  const employeeDropdownId = useDropdownId("employee");
  const purposeDropdownId = useDropdownId(DC_PURPOSE_DROPDOWN_KEY);
  const employeeParams = useMemo(() => ({ iemp_branch_id: screen.branchId }), [screen.branchId]);
  const purposeParams = useMemo(() => ({ icomp_id: screen.companyId }), [screen.companyId]);
  const { data: priceLevels = [] } = useGetPriceLevelsQuery();
  const resize = useColumnResize(screen.columns, screen.uiTableId);

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [levelPrompt, setLevelPrompt] = useState<number | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [branch, setBranch] = useState<BranchAddress | null>(null);
  const [quickRate, setQuickRate] = useState<DcDraftLine | null>(null);
  const [convert, setConvert] = useState({ purpose: "", remark: "" });
  const [fetchBranch] = useLazyGetBranchAddressQuery();
  const [quickAdd, { isLoading: quickAddBusy }] = useQuickAddCustomerMutation();
  const [adjacent] = useGetTxnAdjacentMutation();

  const isWalkIn = screen.party?.party.isWalkIn ?? false;
  const billTo = billToLocked(draft, isWalkIn);
  const customerLock = customerLockReason(draft.source, settings.allowCustomerChangeOnImport);
  const facts = partyFacts(
    { gstType: draft.customer.gstType, stateCode: draft.customer.stateCode, isLocalSale: draft.isLocalSale },
    screen.party,
  );
  const source = sourceSummary(draft.lines, draft.source, draft.sourceRefnos);
  const badge = gstBadgeText(draft.status, draft.posting);
  const activeLine = draft.lines.find((line) => line.key === activeRowKey) ?? null;
  const shipMode = !editable
    ? draft.posting?.ewbLive
      ? "declared"
      : draft.status === "POSTED" && draft.posting?.bandEditable
        ? "ownVerb"
        : "readOnly"
    : "document";

  // Qt `itemSelectionChanged` + `recalcAfterQtyChange`: the stock line under the grid.
  const stockText = useMemo(() => {
    if (!activeLine?.itemId || activeLine.stockQty === null) return "";
    const qty = activeLine.billQty;
    if (qty > activeLine.stockQty && !activeLine.isService) {
      return `Short: ${(qty - activeLine.stockQty).toFixed(3)} of ${qty.toFixed(3)} not in stock — the engine decides at post`;
    }
    return `Stock: ${activeLine.stockQty} ${activeLine.unitName}`;
  }, [activeLine]);

  const guardUnsaved = async (then: () => void) => {
    if (draft.isDirty && !draft.docId && itemLines(draft.lines).length > 0) {
      const ok = await confirm({ title: "Open Challan", message: "This challan hasn't been saved. Discard it and open another?" });
      if (!ok) return;
    }
    then();
  };

  const showCost = () => {
    if (!activeLine?.itemId) return;
    toast.info(
      `${activeLine.itemName} — Cost: ${formatCurrency(activeLine.costPrice, 2, true)}   ·   Cost (pre-tax): ${formatCurrency(activeLine.costBeforeTax, 2, true)}`,
    );
  };

  const printCurrent = () => {
    const key = dcKeyOf(draft);
    if (!key) return void toast.warning("Save the challan first.");
    screen.setPrintTarget({ key, refno: draft.refno });
  };

  const walk = async (direction: "prev" | "next") => {
    try {
      const answer = await adjacent({
        docType: DC_DOC_TYPE,
        companyId: screen.companyId,
        branchId: screen.branchId,
        accYear: screen.accYear,
        ...(draft.docId ? { docId: draft.docId } : {}),
        direction,
      }).unwrap();
      if (!answer.doc) return void toast.info(direction === "prev" ? "This is the first challan." : "This is the last challan.");
      const doc = answer.doc;
      void guardUnsaved(() =>
        void actions.loadChallan({ sdcId: doc.docId, sdcCompanyId: doc.companyId, sdcBranchId: doc.branchId, sdcAccYear: doc.accYear }, false),
      );
    } catch (error) {
      toast.apiError(error);
    }
  };

  const openShipping = async () => {
    setShipOpen(true);
    if (!branch && screen.branchId) {
      try {
        setBranch(await fetchBranch(screen.branchId).unwrap());
      } catch {
        setBranch(null);
      }
    }
  };

  // The shared TxnKeys (Qt keys; Alt+N / Alt+PgUp / Alt+PgDn where Chrome keeps the Ctrl chord).
  useTxnKeys(
    {
      new: verbs.clear ? () => void actions.clearScreen() : null,
      // Save Draft only where the screen keeps drafts — never a post in disguise under auto_post.
      saveDraft:
        !settings.autoPost && !draft.amending && verbs.save.visible && verbs.save.enabled
          ? () => void actions.saveDraft()
          : null,
      // Save & Post: the amendment while amending, else the post.
      post: verbs.postPrint.visible && verbs.postPrint.enabled
        ? () => (draft.amending ? actions.primaryVerb(false) : void actions.post(false))
        : null,
      edit: verbs.edit.visible && verbs.edit.enabled ? actions.edit : null,
      cancelDoc: verbs.cancelDoc.visible && verbs.cancelDoc.enabled ? actions.requestCancel : null,
      open: verbs.showList ? () => void guardUnsaved(onShowList) : null,
      print: draft.docId && screen.permissions.canPrint ? printCurrent : null,
      history: draft.docId ? () => setHistoryOpen(true) : null,
      previous: () => void walk("prev"),
      next: () => void walk("next"),
      changeRate: activeLine?.itemId ? () => setQuickRate(activeLine) : null,
    },
    { enabled: !busy, onHelp: () => setKeysOpen(true) },
  );

  // Qt's own F-keys and chords on this screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || busy || document.querySelector('[aria-modal="true"]')) return;
      const key = event.key;
      const ctrl = event.ctrlKey || event.metaKey;
      const alt = event.altKey;
      const run = (fn: () => void) => {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        fn();
      };
      if (!ctrl && !alt) {
        if (key === "F5" && verbs.save.visible && verbs.save.enabled) return run(() => actions.primaryVerb(false));
        if (key === "F6" && verbs.postPrint.visible && verbs.postPrint.enabled) return run(() => actions.primaryVerb(true));
        if (key === "F3") return run(() => void actions.deleteDraft());
        if (key === "F7" && verbs.clear) return run(() => void actions.clearScreen());
        if (key === "F8" && verbs.showList) return run(() => void guardUnsaved(onShowList));
        if (key === "F9" && verbs.hold) return run(() => void actions.hold());
        if (key === "F10" && verbs.pickHeld) return run(() => setHeldOpen(true));
      }
      if (ctrl && !alt && key === "F7") return run(() => void actions.validate());
      if (ctrl && !alt && key === "F4") return run(() => void actions.openImportOrders());
      if (alt && !ctrl) {
        const letter = event.code;
        if (letter === "KeyD" && editable) return run(() => setDiscountOpen(true));
        if (letter === "KeyO") return run(showCost);
        if (letter === "KeyY" && verbs.copyAsNew) return run(() => void actions.copyAsNew());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Qt `closeEvent`: a new challan with lines asks before the tab goes.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (draft.isDirty && !draft.docId && itemLines(draft.lines).length > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft.docId, draft.isDirty, draft.lines]);

  const keyRows = useMemo(
    () =>
      keySheetRows(
        ["new", "saveDraft", "post", "edit", "cancelDoc", "open", "close", "print", "history", "previous", "next", { action: "changeRate", label: "Change this item's rate" }],
        SCREEN_KEYS,
      ),
    [],
  );

  const quickStrip: Array<{ key: string; label: string; icon: ReactNode; enabled: boolean; title: string; onClick: () => void }> = [
    { key: "import", label: "Import order", icon: <FiShoppingBag />, enabled: verbs.importOrder, title: "Draw lines from the customer's open orders (Ctrl+F4)", onClick: () => void actions.openImportOrders() },
    { key: "hold", label: "Hold", icon: <FiPauseCircle />, enabled: verbs.hold, title: "Park this challan (F9)", onClick: () => void actions.hold() },
    { key: "held", label: "Pick held", icon: <FiArchive />, enabled: verbs.pickHeld, title: "Resume a held challan (F10)", onClick: () => setHeldOpen(true) },
    { key: "disc", label: "Discount all", icon: <FiPercent />, enabled: editable, title: "Discount % on every item (Alt+D)", onClick: () => setDiscountOpen(true) },
    { key: "cost", label: "Show cost", icon: <FiDollarSign />, enabled: Boolean(activeLine?.itemId), title: "This line's cost (Alt+O)", onClick: showCost },
    { key: "eway", label: "E-way bill", icon: <FiNavigation />, enabled: verbs.eway.enabled, title: verbs.eway.title, onClick: actions.eway },
    { key: "convert", label: "Convert purpose", icon: <FiGitBranch />, enabled: verbs.convert.enabled, title: verbs.convert.title, onClick: actions.requestConvert },
    { key: "return", label: "DC return", icon: <FiCornerUpLeft />, enabled: verbs.returnLink, title: "Goods coming back on a challan (menu 251)", onClick: () => toast.info("The DC Return screen (menu 251) is not on the web yet.") },
    { key: "bill", label: "Bill it", icon: <FiFileText />, enabled: verbs.billLink, title: "Raise the bill — Sales Bill imports open challans", onClick: () => router.push("/sales/sale-bill") },
    { key: "transport", label: "Transport", icon: <FiTruck />, enabled: true, title: "The transport band — the e-way bill's details", onClick: () => void openShipping() },
  ];

  const totalCells: Array<{ label: string; value: string; grand?: boolean }> = [
    { label: "Items", value: String(stored ? stored.totItems : totals.totItems) },
    { label: "Qty", value: (stored ? stored.totQty : totals.totQty).toFixed(3) },
    { label: "Weight", value: (stored ? stored.totWeight : totals.totWeight).toFixed(3) },
    { label: "Taxable", value: formatCurrency(stored ? stored.taxable : totals.lineTaxable, 2, true) },
    { label: "Tax", value: formatCurrency(stored ? stored.tax : totals.lineTax, 2, true) },
    { label: "Total", value: formatCurrency(stored ? stored.total : totals.bill, 2, true), grand: true },
    { label: "COGS", value: formatCurrency(draft.status === "POSTED" ? draft.posting?.cogsAmt ?? 0 : 0, 2, true) },
  ];

  const historyTarget =
    historyOpen && draft.docId
      ? { docId: draft.docId, companyId: draft.companyId, accYear: draft.accYear, refNo: draft.refno }
      : null;

  return (
    <div className={quotationStyles.page}>
      <header className={quotationStyles.titleBar}>
        <span className={quotationStyles.gridHeadActions}>
          <button type="button" className={quotationStyles.button} disabled={!verbs.showList} onClick={() => void guardUnsaved(onShowList)}>
            ‹ Delivery Challans
          </button>
          <h1 className={cx(quotationStyles.title, orderStyles.entryTitle)}>{DC_TITLE}</h1>
        </span>
        <span className={cx(quotationStyles.statusBadge, quotationStyles[STATUS_TONE[draft.status] ?? "statusDraft"])}>
          {draft.amending ? "AMENDING" : draft.status}
        </span>
        {draft.fulfilStatus ? (
          <span
            className={cx(
              styles.fulfilmentBadge,
              draft.fulfilStatus === "OPEN" || draft.fulfilStatus === "PARTIAL" ? quotationStyles.statusSent : quotationStyles.statusAccepted,
            )}
          >
            FULFILMENT {draft.fulfilStatus}
          </span>
        ) : null}
        {source.chip ? (
          <span className={orderStyles.sourceChip} title={customerLock ?? "Drawn from these orders."}>
            {source.chip}
          </span>
        ) : null}
        <div className={quotationStyles.titleMeta}>
          {draft.mode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
          {stored ? <span>showing saved figures</span> : null}
          {draft.isDirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
          {screen.activeHold ? <span>held cart {screen.activeHold.txhHoldNo}</span> : null}
          <span>
            Year <strong>{draft.accYear || "—"}</strong>
          </span>
          {draft.refno ? (
            <span>
              DC <strong>{draft.refno}</strong>
              {draft.revisionNo > 1 ? ` · rev ${draft.revisionNo}` : ""}
            </span>
          ) : null}
          {draft.audit.createdBy ? (
            <span>
              created {draft.audit.createdBy} · {formatDateTime(draft.audit.createdOn)}
              {draft.audit.modifiedBy ? ` · modified ${draft.audit.modifiedBy} · ${formatDateTime(draft.audit.modifiedOn)}` : ""}
            </span>
          ) : null}
        </div>
      </header>

      <div className={orderStyles.iconToolbar} role="toolbar" aria-label="Challan actions">
        {quickStrip.map((action) => (
          <button
            key={action.key}
            type="button"
            className={cx(orderStyles.iconButton, !action.enabled && orderStyles.iconButtonDisabled)}
            disabled={!action.enabled || busy}
            title={`${action.label} — ${action.title}`}
            aria-label={action.label}
            onClick={action.onClick}
          >
            {action.icon}
          </button>
        ))}
        <span className={orderStyles.iconToolbarNote}>F1 keys · Ctrl+F7 validate</span>
      </div>

      <div className={cx(quotationStyles.headerRow, styles.headerRowDc)}>
        <GroupBox title="Customer">
          <div className={quotationStyles.fieldGrid}>
            <DropdownCombo
              id="dc-customer"
              label="Customer"
              required
              dropdownId={customerDropdownId}
              valueKey="cus_id"
              labelKey="cus_name"
              value={draft.customer.custId ?? ""}
              selectedLabel={draft.customer.masterName}
              disabled={!editable || Boolean(customerLock)}
              onSelect={(value) => void actions.pickCustomer(value)}
            />
            <TextField id="dc-cust-name" label="Bill-to name" value={draft.customer.name} disabled={!editable || billTo.locked} maxLength={200} title={billTo.locked ? BILL_TO_HINT : undefined} onChange={(value) => dispatch({ type: "customerField", field: "name", value })} />
            <TextField id="dc-cust-addr" label="Address" value={draft.customer.address ?? ""} disabled={!editable || billTo.locked} maxLength={500} title={billTo.locked ? BILL_TO_HINT : undefined} onChange={(value) => dispatch({ type: "customerField", field: "address", value })} />
            <TextField id="dc-cust-place" label="Place" value={draft.customer.place ?? ""} disabled={!editable || billTo.locked} maxLength={100} onChange={(value) => dispatch({ type: "customerField", field: "place", value })} />
            <TextField id="dc-cust-pin" label="Pin" value={draft.customer.pin ?? ""} disabled={!editable || billTo.locked} maxLength={6} onChange={(value) => dispatch({ type: "customerField", field: "pin", value: value.replace(/\D/g, "").slice(0, 6) })} />
            <TextField id="dc-cust-phone" label="Phone" value={draft.customer.phone ?? ""} disabled={!editable || billTo.locked} maxLength={20} onChange={(value) => dispatch({ type: "customerField", field: "phone", value })} />
            <TextField id="dc-cust-gstin" label="GSTIN" value={draft.customer.gstin ?? ""} disabled={!editable || billTo.locked} maxLength={15} onChange={(value) => dispatch({ type: "customerField", field: "gstin", value: value.toUpperCase() })} />
            <DropdownCombo
              id="dc-pos"
              label="Place of supply"
              dropdownId={posDropdownId}
              valueKey="state_code"
              labelKey="state_name"
              value={draft.header.posStateCode}
              selectedLabel={draft.header.posStateName}
              disabled={!editable}
              onSelect={(value, label) => screen.actions.setPlaceOfSupply(value, label)}
            />
            {billTo.listed || screen.quickAddCustomer ? (
              <Field label="">
                <div className={styles.inlinePair}>
                  {billTo.listed ? (
                    <button
                      type="button"
                      className={quotationStyles.button}
                      disabled={!editable}
                      aria-pressed={draft.billToUnlocked}
                      title={billTo.locked ? BILL_TO_HINT : undefined}
                      onClick={() => dispatch({ type: "billToUnlocked", value: !draft.billToUnlocked })}
                    >
                      {draft.billToUnlocked ? "Editing for this challan" : "Edit for this challan"}
                    </button>
                  ) : null}
                  {screen.quickAddCustomer ? (
                    <button
                      type="button"
                      className={quotationStyles.button}
                      disabled={!editable || Boolean(customerLock)}
                      title={customerLock ?? "Quick-add a customer"}
                      onClick={() => setQuickAddOpen(true)}
                    >
                      + New customer
                    </button>
                  ) : null}
                </div>
              </Field>
            ) : null}
            {draft.customer.custId ? (
              <div className={styles.facts}>
                {[facts.line1, facts.line2].map((line, index) =>
                  line.length ? (
                    <div key={index} className={styles.factLine}>
                      {line.map((fact) => (
                        <span key={fact.caption}>
                          <span className={styles.factCaption}>{fact.caption}</span>
                          <span className={cx(styles.factValue, TONE_CLASS[fact.tone])}>{fact.value}</span>
                        </span>
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            ) : null}
          </div>
        </GroupBox>

        <GroupBox title="Challan">
          <div className={quotationStyles.fieldGrid}>
            <TextField id="dc-refno" label="DC No" value={draft.refno} disabled placeholder="on save" onChange={() => undefined} />
            <Field label="DC Date" htmlFor="dc-date" required>
              <DateInput id="dc-date" block value={draft.header.dcDate} disabled={!editable || Boolean(draft.docId && draft.status !== "DRAFT")} onChange={(value) => dispatch({ type: "header", patch: { dcDate: value } })} />
            </Field>
            <DropdownCombo
                id="dc-purpose"
                label="Purpose"
                required
                dropdownId={purposeDropdownId}
                valueKey="purpose"
                labelKey="purpose_name"
                value={draft.header.purpose}
                selectedLabel={draft.header.purposeLabel}
                params={purposeParams}
                disabled={!editable || draft.status === "POSTED"}
                onSelect={(value, label) => dispatch({ type: "header", patch: { purpose: value.toUpperCase(), purposeLabel: label || purposeLabel(value) } })}
              />
            <TextField id="dc-usr-refno" label="Your ref no" value={draft.header.usrRefno} disabled={!editable} maxLength={100} onChange={(value) => dispatch({ type: "header", patch: { usrRefno: value } })} />
            <Field label="Your ref date" htmlFor="dc-usr-refdate">
              <DateInput id="dc-usr-refdate" block value={draft.header.usrRefdate} disabled={!editable} onChange={(value) => dispatch({ type: "header", patch: { usrRefdate: value } })} />
            </Field>
            <SelectField
              id="dc-price-level"
              label="Price level"
              value={String(draft.header.priceLevel)}
              options={priceLevels.length ? priceLevels : [{ value: String(draft.header.priceLevel), label: `Level ${draft.header.priceLevel}` }]}
              disabled={!editable || !screen.canEditPrice}
              onChange={(value) => setLevelPrompt(Number(value) || 1)}
            />
            <TextField id="dc-remarks" label="Remarks" value={draft.header.remarks} disabled={!editable} maxLength={500} onChange={(value) => dispatch({ type: "header", patch: { remarks: value } })} />
          </div>
        </GroupBox>

        <GroupBox title="Delivery crew">
          <div className={quotationStyles.fieldGrid}>
            {(
              [
                ["salesman", "Salesman", "salesmanId", "salesmanName"],
                ["driver", "Driver", "driverId", "driverName"],
                ["loadman", "Loadman", "loadmanId", "loadmanName"],
              ] as const
            ).map(([id, label, idField, nameField]) => (
                <DropdownCombo
                  key={id}
                  id={`dc-${id}`}
                  label={label}
                  required={id === "salesman" && settings.salesmanMandatory}
                  dropdownId={employeeDropdownId}
                  valueKey="emp_id"
                  labelKey="emp_name"
                  value={draft.header[idField] ?? ""}
                  selectedLabel={draft.header[nameField]}
                  params={employeeParams}
                  disabled={!crewEditable(draft.mode, draft.status)}
                  onSelect={(value, name) => dispatch({ type: "header", patch: { [idField]: value || null, [nameField]: name } })}
                />
            ))}
            <TextField
              id="dc-vehicle"
              label="Vehicle no"
              value={draft.header.vehicleNo}
              disabled={!crewEditable(draft.mode, draft.status)}
              maxLength={20}
              onChange={(value) => dispatch({ type: "header", patch: { vehicleNo: value.toUpperCase(), vehicleId: null } })}
            />
            <div className={styles.transportSummary}>
              <strong>Transport</strong>{" "}
              {shippingSummary(draft.transport, { vehicleNo: draft.header.vehicleNo, driverName: draft.header.driverName })}{" "}
              <button type="button" className={quotationStyles.button} onClick={() => void openShipping()}>
                Transport…
              </button>
            </div>
          </div>
        </GroupBox>

        <GroupBox title="Source order">
          <div className={styles.sourceList}>
            {source.rows.length === 0 ? (
              <span className={styles.muted}>{source.emptyText}</span>
            ) : (
              source.rows.map((row) => (
                <span key={row.refno} className={styles.sourceRow}>
                  <span className={styles.sourceTag}>SO</span>
                  <strong>{row.refno}</strong>
                  <span className={styles.muted}>{row.detail}</span>
                </span>
              ))
            )}
            <button type="button" className={quotationStyles.button} disabled={!editable || busy} onClick={() => void actions.openImportOrders()}>
              Import order lines (Ctrl+F4)
            </button>
            {screen.dcRequiresOrder ? <span className={styles.muted}>This company sends goods against an order only.</span> : null}
          </div>
        </GroupBox>
      </div>

      {badge ? <div className={styles.badgeLine}>{badge}</div> : null}

      <section className={cx(quotationStyles.gridShell, quotationStyles.itemGridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Items</span>
          <span className={quotationStyles.modalNote}>
            Enter next cell · F4 unit · Ctrl+± row price level · Ctrl+1..{settings.priceLevelCount} price level · Ctrl+R rate · an order line keeps the order&apos;s rate
          </span>
        </div>
        <ItemGrid
          columns={resize.columns}
          resizingKey={resize.resizingKey}
          onColumnResizeStart={resize.onResizeStart}
          lines={draft.lines}
          priced={pricing.lines}
          editable={editable}
          canEditPrice={screen.canEditPrice}
          invalidCells={{}}
          activeRowKey={activeRowKey}
          unitOptionsFor={() => []}
          onActiveRowChange={setActiveRowKey}
          onSetField={(rowKey, field, raw) => actions.setLineField(rowKey, field as keyof DcDraftLine, raw)}
          onToggleField={() => undefined}
          onOpenItemPicker={(rowKey) => {
            // Qt locks Description once the row has its item.
            const line = draft.lines.find((candidate) => candidate.key === rowKey);
            if (line && !line.itemId) setPickerRow(rowKey);
          }}
          onCommitBarcode={(rowKey, barcode) => void actions.resolveBarcode(rowKey, barcode)}
          onSetUnit={() => undefined}
          onSetPriceLevel={(rowKey, level) => void actions.applyPriceLevel(level, "selected", rowKey)}
          onAddLine={() => undefined}
          onInsertLine={(rowKey) => dispatch({ type: "lineInserted", rowKey })}
          onDuplicateLine={() => undefined}
          onRemoveLine={(rowKey) => void actions.removeLine(rowKey)}
          onSwitchUnit={(rowKey) => void actions.switchUnit(rowKey)}
          onPriceLevelShortcut={(level) => setLevelPrompt(level)}
          priceLevelCount={Math.min(4, settings.priceLevelCount)}
          onStepPriceLevel={(rowKey, delta) => void actions.stepLinePriceLevel(rowKey, delta)}
        />
      </section>
      <div className={styles.stockLine}>{stockText}</div>

      <div className={styles.totalsRow}>
        {totalCells.map((cell) => (
          <div key={cell.label} className={cx(styles.totalCell, cell.grand && styles.totalGrand)} title={cell.label === "COGS" ? "DR COGS / CR Stock-in-Hand, one pair, voucher type DCh — posted under PERPETUAL only." : undefined}>
            <span className={styles.totalLabel}>{cell.label}</span>
            <span className={styles.totalValue}>{cell.value}</span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <WarningStrip notes={screen.notes} onView={() => screen.setPopup({ proceedVerb: null, onProceed: null })} />
        <div className={quotationStyles.buttonBar}>
          {verbs.save.visible ? (
            <button type="button" className={quotationStyles.button} disabled={!verbs.save.enabled || busy} title={verbs.save.title} onClick={() => actions.primaryVerb(false)}>
              {verbs.save.label}
            </button>
          ) : null}
          {verbs.post.visible ? (
            <button type="button" className={quotationStyles.button} disabled={!verbs.post.enabled || busy} onClick={() => void actions.post(false)}>
              Post <span className={quotationStyles.buttonHint}>Ctrl+Enter</span>
            </button>
          ) : null}
          {verbs.postPrint.visible ? (
            <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} disabled={!verbs.postPrint.enabled || busy} onClick={() => actions.primaryVerb(true)}>
              {verbs.postPrint.label}
            </button>
          ) : null}
          {verbs.edit.visible ? (
            <button type="button" className={quotationStyles.button} disabled={!verbs.edit.enabled || busy} title={verbs.edit.title} onClick={actions.edit}>
              {verbs.edit.label}
            </button>
          ) : null}
          {verbs.cancelDoc.visible ? (
            <button type="button" className={quotationStyles.button} disabled={!verbs.cancelDoc.enabled || busy} title={verbs.cancelDoc.title} onClick={actions.requestCancel}>
              Cancel challan <span className={quotationStyles.buttonHint}>Alt+X</span>
            </button>
          ) : null}
          {verbs.delete ? (
            <button type="button" className={quotationStyles.button} disabled={busy || !screen.permissions.canDelete} onClick={() => void actions.deleteDraft()}>
              Delete <span className={quotationStyles.buttonHint}>F3</span>
            </button>
          ) : null}
          {verbs.hold ? (
            <button type="button" className={quotationStyles.button} disabled={busy} onClick={() => void actions.hold()}>
              Hold <span className={quotationStyles.buttonHint}>F9</span>
            </button>
          ) : null}
          {verbs.pickHeld ? (
            <button type="button" className={quotationStyles.button} disabled={busy} onClick={() => setHeldOpen(true)}>
              Pick held <span className={quotationStyles.buttonHint}>F10</span>
            </button>
          ) : null}
          {verbs.copyAsNew ? (
            <button type="button" className={quotationStyles.button} disabled={busy || !screen.permissions.canCreate} onClick={() => void actions.copyAsNew()}>
              Copy as new <span className={quotationStyles.buttonHint}>Alt+Y</span>
            </button>
          ) : null}
          {verbs.clear ? (
            <button type="button" className={quotationStyles.button} disabled={busy} onClick={() => void actions.clearScreen()}>
              Clear <span className={quotationStyles.buttonHint}>F7</span>
            </button>
          ) : null}
          {verbs.showList ? (
            <button type="button" className={quotationStyles.button} disabled={busy} onClick={() => void guardUnsaved(onShowList)}>
              Show list <span className={quotationStyles.buttonHint}>F8</span>
            </button>
          ) : null}
        </div>
      </div>

      <ItemPickerModal
        isOpen={pickerRow !== null}
        usedItemIds={itemLines(draft.lines).map((line) => line.itemId)}
        onClose={() => setPickerRow(null)}
        onPick={(pick) => {
          const row = pickerRow;
          setPickerRow(null);
          if (row) void actions.pickItem(row, pick.itemId, pick.itemUnitId);
        }}
      />

      <PriceLevelPrompt
        priceLevel={levelPrompt}
        hasSelection={Boolean(activeLine?.itemId)}
        onClose={() => setLevelPrompt(null)}
        onApply={(scope) => {
          const level = levelPrompt ?? 1;
          setLevelPrompt(null);
          void actions.applyPriceLevel(level, scope, activeRowKey);
        }}
      />

      <NumberPromptModal
        isOpen={discountOpen}
        title="Discount %"
        label="Apply discount % to every item:"
        min={0}
        max={100}
        step={0.01}
        initialValue={0}
        onClose={() => setDiscountOpen(false)}
        onApply={(value) => {
          setDiscountOpen(false);
          actions.applyDiscountAll(value);
        }}
      />

      <ValidationPopup
        isOpen={screen.popup !== null}
        notes={screen.notes}
        overrides={screen.overrides}
        canOverride={draft.posting?.canOverride ?? false}
        proceedVerb={screen.popup?.proceedVerb ?? null}
        onToggleOverride={(code) =>
          screen.setOverrides((current) => (current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code]))
        }
        onBack={() => screen.setPopup(null)}
        onProceed={() => {
          const next = screen.popup?.onProceed;
          screen.setPopup(null);
          next?.();
        }}
      />

      <AskText
        isOpen={screen.prompt?.kind === "cancel"}
        title="Cancel Challan"
        message={`Why is challan ${draft.refno} being cancelled?\n\nStock comes back, the COGS voucher is reversed and the order's pending quantity is restored. The reason cannot be edited afterwards.`}
        label="Reason"
        required
        maxLength={250}
        requiredMessage="A reason is required to cancel a challan."
        busy={busy}
        confirmLabel="Cancel challan"
        cancelLabel="Back"
        onCancel={() => screen.setPrompt(null)}
        onConfirm={(reason) => actions.cancelChallan(reason.trim())}
      />

      <AskText
        isOpen={screen.prompt?.kind === "amend"}
        title="Post Amendment"
        message={`What is being corrected on challan ${draft.refno}?\n\nStored with revision ${draft.revisionNo + 1}.`}
        label="Reason"
        required
        maxLength={250}
        requiredMessage="A reason is required to amend a posted challan."
        busy={busy}
        confirmLabel="Post amendment"
        cancelLabel="Back"
        onCancel={() => screen.setPrompt(null)}
        onConfirm={(remark) => actions.amend(remark.trim())}
      />

      <ModalShell
        title="Convert Purpose"
        isOpen={screen.prompt?.kind === "convert"}
        narrow
        onClose={() => screen.setPrompt(null)}
        footer={
          <div className={quotationStyles.buttonBar}>
            <button type="button" className={quotationStyles.button} onClick={() => screen.setPrompt(null)}>
              Back
            </button>
            <button
              type="button"
              className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
              disabled={busy || !convert.purpose || convert.purpose === draft.header.purpose || !convert.remark.trim()}
              onClick={() => void actions.convertPurpose(convert.purpose, convert.remark.trim())}
            >
              Convert
            </button>
          </div>
        }
      >
        <p className={quotationStyles.modalNote}>
          Challan {draft.refno} is {draft.header.purpose}. Convert it to:
        </p>
        <div className={styles.promptGrid}>
          <SelectField
            id="dc-convert-purpose"
            label="Purpose"
            value={convert.purpose}
            options={[{ value: "", label: "—" }, ...DC_PURPOSES.map((code) => ({ value: code, label: code }))]}
            onChange={(value) => setConvert((current) => ({ ...current, purpose: value }))}
          />
          <TextField
            id="dc-convert-remark"
            label="Why?"
            value={convert.remark}
            maxLength={250}
            placeholder="stored with the log"
            onChange={(value) => setConvert((current) => ({ ...current, remark: value }))}
          />
        </div>
      </ModalShell>

      <OpenSourcesDialog
        isOpen={screen.openSources !== null}
        kind="ORDER"
        docs={screen.openSources?.docs ?? []}
        loading={screen.openSources?.loading ?? false}
        error={screen.openSources?.error ?? null}
        onClose={() => screen.setOpenSources(null)}
        onApply={(picks) => void actions.applySourcePicks(picks)}
      />

      <ShippingDialog
        isOpen={shipOpen}
        mode={shipMode}
        required={null}
        ewbVehicle={draft.posting?.ewbVehicleNo || null}
        band={draft.transport}
        terms={{ remarks: "", paymentTerms: "", deliveryTerms: "", termsConditions: "" }}
        vehicleNo={draft.header.vehicleNo}
        vehicleId={draft.header.vehicleId}
        companyId={screen.companyId}
        branchId={screen.branchId}
        shipTo={screen.party?.shipTo ?? []}
        billTo={{
          name: draft.customer.name,
          addr: draft.customer.address,
          place: draft.customer.place,
          pin: draft.customer.pin ?? null,
          phone: draft.customer.phone,
          stcd: draft.customer.stateCode,
          gstin: draft.customer.gstin,
        }}
        branch={branch}
        busy={busy}
        hideTerms
        onClose={() => setShipOpen(false)}
        onApply={(result) => {
          dispatch({ type: "transport", band: result.band, vehicleNo: result.vehicleNo, vehicleId: result.vehicleId });
          setShipOpen(false);
        }}
        onSaveTransport={async (band) => {
          const ok = await actions.saveTransport(band);
          if (ok) setShipOpen(false);
          return ok;
        }}
      />

      <CustomerQuickAdd
        isOpen={quickAddOpen}
        companyId={screen.companyId}
        branchId={screen.branchId}
        defaultStateCode={screen.companyStateCode}
        defaultStateName={draft.header.posStateName}
        defaultPriceLevel={draft.header.priceLevel}
        busy={quickAddBusy}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={async (dto) => {
          try {
            const created = await quickAdd(dto).unwrap();
            setQuickAddOpen(false);
            if (created.cusId) await actions.pickCustomer(created.cusId);
          } catch (error) {
            toast.apiError(error);
          }
        }}
      />

      <HeldListModal
        isOpen={heldOpen}
        companyId={screen.companyId}
        branchId={screen.branchId}
        accYear={screen.accYear}
        docType={DC_DOC_TYPE}
        recognises={isDcHold}
        title="Held challans"
        onClose={() => setHeldOpen(false)}
        onPick={(txhId) => {
          setHeldOpen(false);
          void actions.resumeHeld(txhId);
        }}
        onTakeOver={actions.takeOverHold}
      />

      <TxnHistoryDialog target={historyTarget} docLabel={DC_TITLE} onClose={() => setHistoryOpen(false)} />

      {screen.printTarget ? (
        <PrintOptionsDialog
          open
          onClose={() => screen.setPrintTarget(null)}
          purposeCode={DC_PRINT_PURPOSE}
          documentLabel={screen.printTarget.refno ? `Challan ${screen.printTarget.refno}` : "Challan"}
          targets={[printTargetOf(screen.printTarget.key, screen.printTarget.refno)]}
        />
      ) : null}

      {quickRate ? (
        <QuickRateDialog
          itemId={quickRate.itemId}
          unitId={quickRate.itemUnitId}
          itemName={quickRate.itemName}
          originMenuId={DC_MENU_ID}
          fromLine
          lineText={`${quickRate.itemName} · ${quickRate.unitName}`}
          onClose={() => setQuickRate(null)}
          onSaved={({ applyToLine }) => {
            const line = quickRate;
            setQuickRate(null);
            if (applyToLine && line) void actions.applyPriceLevel(line.priceLevel, "selected", line.key);
          }}
        />
      ) : null}

      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={keyRows.document} lines={keyRows.lines} />
    </div>
  );
}

const BILL_TO_HINT = 'From the customer master. "Edit for this challan" corrects it on this challan only.';

/**
 * A draft's crew opens and closes with the screen. On a POSTED challan Qt opens
 * the crew row with the band (`applyTransportLocks`), but PUT /transport carries
 * the band only, so a crew edit there would never be saved — it stays shut here.
 */
function crewEditable(mode: string, status: string): boolean {
  return status !== "POSTED" && mode === "entry";
}

function printTargetOf(key: DcDocKey, refno: string) {
  return { docId: key.sdcId, companyId: key.sdcCompanyId, accYear: key.sdcAccYear, filename: `challan-${refno || key.sdcId}` };
}
