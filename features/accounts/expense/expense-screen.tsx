"use client";

/**
 * Expense Voucher — menu 277 (ExpV): an expense paid by one or more tenders.
 * The React port of Qt `ExpenseVoucherEntry` (NexERP d5c3637, grids d97cdd4).
 *
 *   WHAT WAS SPENT   ui_table 51. Reason and Expense ledger are popup cells
 *                    (grids 155 / 156): a reason fills its ledger, and a
 *                    ledger its GST rate and HSN/SAC. Amount is the TAXABLE
 *                    value with a GST bill, then HSN, rate and ITC per line.
 *   HOW IT WAS PAID  ui_table 52: tenders (cash, bank, UPI; no cheque — that
 *                    is a bill-wise Payment), equal to the lines to the paisa.
 *                    The first tender, until typed, takes the balance. Bare
 *                    + / − add and remove lines on both grids.
 *
 * With a GST bill the supplier's GSTIN comes from the Party ledger and the
 * place of supply from the GSTIN's state, until the operator picks one.
 *
 * Everything derived — tax, totals, where each tender's money comes from (this
 * till's drawer, the default safe, the tender's ledger), the legs, the
 * refusals, the 40A(3) / approval warnings — is the server's own answer to
 * `POST /expenses/validate`, asked 400 ms after each edit and shown as is.
 *
 * F5 saves a DRAFT, Ctrl+Enter posts it (create, then post by key): the number
 * is issued at post, and either way the screen clears for the next one (Qt
 * 5e25760; the draft reopens from the list). A POSTED voucher can be cancelled,
 * or cancelled and re-entered — its copy opens as a new voucher to correct and
 * post. A POSTED voucher can be cancelled (a mirror in the Rev
 * series) while its till session still takes money. The approval the EXPENSE
 * rule asks for is reported only — the gate is till phase 3.
 *
 * Layout and wiring only: the lifecycle is `state/use-expense-voucher.ts`,
 * every figure `domain/view.ts`, every body `domain/payload.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useGridId } from "@/lib/configured-grids";
import { documentRights } from "@/lib/permissions/document-rights";
import { toast } from "@/lib/notify";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { GridPickerModal, type PickerFallbackColumn } from "@/features/stocks/opening-stock/components/grid-picker-modal";
/*
 * The right-click menu ("save column width", "Admin settings"): the same
 * dialog every configured grid carries, on the same `fixed.ui_table_columns`
 * rows — imported, not rebuilt. Drag-to-widen is share-aware here
 * (`use-share-resize.ts`): these grids fit their block, as Qt's do.
 */
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useShareResize } from "./components/use-share-resize";
import { resolveLineLayout, resolveTenderLayout, visibleLineColumns, visibleTenderColumns } from "./columns";
import { DateInput } from "./components/date-input";
import { CancelReasonDialog, ConfirmDialog, type ConfirmRequest } from "./components/expense-dialogs";
import {
  advanceHead,
  focusCellSoon,
  focusHeadSoon,
  headAttrs,
  isGridCell,
} from "./components/grid-keys";
import { LinesGrid, type PopupColumn } from "./components/lines-grid";
import { TendersGrid } from "./components/tenders-grid";
import { EXPENSE_ROUTE } from "./constants";
import type { ExpenseKeys, ExpenseScope } from "./expense.types";
import { isBlankLine, isBlankTender } from "./domain/draft";
import { statusPill, TENDER_NOTE, type Tone } from "./domain/view";
import { useExpenseVoucher } from "./state/use-expense-voucher";
import { useExpenseTillSession } from "./till-session";
import styles from "./expense.module.scss";

/*
 * The keys, as Qt binds them (d97cdd4) — with two the browser keeps for itself:
 *
 *   F5  Save draft     Ctrl+Enter  Post     F2  New (in a grid: the cell's own)
 *   F8  List           Alt+N  + line        Alt+T  + tender      Esc  Close
 *   Enter walks the header like Tab, then on into the lines (Reason)
 *   in a grid: Enter next cell · + / − add / remove a line · F2 the picker
 *
 * Qt's Ctrl+N / Ctrl+T are a new browser window and a new tab: Chromium never
 * hands either to the page, so the line and tender keys are Alt+N / Alt+T
 * here (Ctrl+N / Ctrl+T are still honoured where a shell does deliver them).
 * F1 and F5 are always swallowed — the browser's help window and its reload
 * would cost the operator the voucher.
 */

const REASON_PICKER_COLUMNS: PickerFallbackColumn[] = [
  { field: "trs_name", header: "Reason" },
  { field: "ledger_name", header: "Expense ledger" },
  { field: "trs_code", header: "Code" },
];
const LEDGER_PICKER_COLUMNS: PickerFallbackColumn[] = [
  { field: "led_name", header: "Ledger" },
  { field: "group_name", header: "Group" },
  { field: "tax_name", header: "GST" },
  { field: "led_hsn_sac", header: "HSN/SAC" },
];

type PickerState = { lineKey: string; column: PopupColumn; query: string };

/*
 * What the Admin-settings dialog's Focus column means here. The entry grids'
 * default sentence (Focus = where Enter stops) is not this screen's walk.
 */
const LINES_FOCUS_NOTE =
  "Focus is not used on this grid: Enter walks every cell that takes typing, left to right. HSN/SAC, GST, ITC and Tax show only with a GST bill, whatever is ticked here.";
const TENDERS_FOCUS_NOTE =
  "Focus is not used on this grid: Enter walks Tender, Ref and Amount, left to right.";

const TONE_CLASS: Record<Tone, string | undefined> = {
  success: styles.toneSuccess,
  danger: styles.toneDanger,
  warning: styles.toneWarning,
  neutral: undefined,
  pending: undefined,
};

export type ExpenseScreenProps = {
  /** Set when the voucher is opened by its four keys (the register, or its own URL). */
  initialKeys?: ExpenseKeys;
  /**
   * Back to the register the screen was opened from. Without it the screen was
   * reached by its own URL, and Close walks the browser back.
   */
  onBackToList?: () => void;
};

export default function ExpenseScreen({ initialKeys, onBackToList }: ExpenseScreenProps) {
  const router = useRouter();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const { permissions } = usePagePermissions({ href: EXPENSE_ROUTE });
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const session = useExpenseTillSession();
  // One working date for the life of the screen: the client has no session
  // "app date"; the transaction screens all take today's.
  const [today] = useState(() => todayIso());

  const scope: ExpenseScope = useMemo(
    () => ({
      companyId: activeCompany?.id ?? "",
      branchId: activeBranch?.id ?? "",
      accYear: (activeFiscalYear?.name ?? "").trim(),
    }),
    [activeCompany?.id, activeBranch?.id, activeFiscalYear?.name],
  );

  const api = useExpenseVoucher({ scope, initialKeys, today, session, rights });
  const { draft, view, editable, busy } = api;
  const { header } = draft;
  const payeeDropdownId = useDropdownId("paymentPayee");
  const stateDropdownId = useDropdownId("gstStateCode");
  const reasonGridId = useGridId("expenseReasonPopup");
  const ledgerGridId = useGridId("expenseLedgerPopup");

  // ── the grids' layouts: ui_tables 51 / 52 ───────────────────────────────
  const linesTableId = useUiTableId("expenseLines");
  const tendersTableId = useUiTableId("expenseTenders");
  const { data: linesLayout } = useGetQuotationGridLayoutQuery({ uiTableId: linesTableId }, { skip: !linesTableId });
  const { data: tendersLayout } = useGetQuotationGridLayoutQuery(
    { uiTableId: tendersTableId },
    { skip: !tendersTableId },
  );
  const lineLayout = useMemo(() => resolveLineLayout(linesLayout), [linesLayout]);
  const tenderLayout = useMemo(() => resolveTenderLayout(tendersLayout), [tendersLayout]);

  /*
   * A drag is LOCAL until "save column width" commits it: these rows are the
   * layout every operator of this screen — and the Qt desktop — renders from.
   * The Admin-settings dialog is likewise a draft until Save.
   */
  const lineVisibleKeys = useMemo(
    () => visibleLineColumns(lineLayout, header.gstBill).map((column) => column.key),
    [lineLayout, header.gstBill],
  );
  const tenderVisibleKeys = useMemo(
    () => visibleTenderColumns(tenderLayout).map((column) => column.key),
    [tenderLayout],
  );
  const lineResize = useShareResize(lineLayout, lineVisibleKeys, linesTableId);
  const tenderResize = useShareResize(tenderLayout, tenderVisibleKeys, tendersTableId);
  const lineSettings = useGridSettings({
    label: "What was spent",
    uiTableId: linesTableId,
    // Every configured column, hidden ones included — the dialog is where a
    // hidden one is brought back.
    columns: lineResize.columns,
    pendingWidthCount: lineResize.pendingCount,
    savingWidths: lineResize.saving,
    onSaveWidths: lineResize.saveWidths,
    focusNote: LINES_FOCUS_NOTE,
  });
  const tenderSettings = useGridSettings({
    label: "How it was paid",
    uiTableId: tendersTableId,
    columns: tenderResize.columns,
    pendingWidthCount: tenderResize.pendingCount,
    savingWidths: tenderResize.saving,
    onSaveWidths: tenderResize.saveWidths,
    focusNote: TENDERS_FOCUS_NOTE,
  });
  const lineColumns = useMemo(
    () => visibleLineColumns(lineResize.columns, header.gstBill),
    [lineResize.columns, header.gstBill],
  );
  const tenderColumns = useMemo(() => visibleTenderColumns(tenderResize.columns), [tenderResize.columns]);

  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const [activeTenderKey, setActiveTenderKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  /** The reason dialog: a plain cancel, or Cancel & re-enter. */
  const [cancelMode, setCancelMode] = useState<"cancel" | "reenter" | null>(null);
  const cancelOpen = cancelMode !== null;
  const pickerParams = useMemo(() => ({ icompany_id: api.docCompanyId }), [api.docCompanyId]);

  const pill = statusPill(draft.status);
  const gst = header.gstBill;
  const dateLocked = !editable || session !== null;

  // ── the verbs, with the discard question where typing would be lost ─────
  const guardDiscard = useCallback(
    (title: string, confirmLabel: string, then: () => void) => {
      if (draft.dirty && editable) {
        setConfirmRequest({
          title,
          message: "The voucher has unsaved changes. Leave it and lose them?",
          confirmLabel,
          onConfirm: then,
        });
        return;
      }
      then();
    },
    [draft.dirty, editable],
  );

  const startNew = useCallback(() => {
    if (!rights.mayStartNew || busy) {
      return;
    }
    guardDiscard("Start a new voucher?", "New voucher", () => {
      api.startNew();
      setActiveLineKey(null);
      setActiveTenderKey(null);
      focusHeadSoon("paidTo");
    });
  }, [api, busy, guardDiscard, rights.mayStartNew]);

  const goList = useCallback(() => {
    guardDiscard("Go to the list?", "Go to the list", () => {
      if (onBackToList) {
        onBackToList();
      } else {
        router.push(EXPENSE_ROUTE);
      }
    });
  }, [guardDiscard, onBackToList, router]);

  const close = useCallback(() => {
    guardDiscard("Close this voucher?", "Close", () => {
      if (onBackToList) {
        onBackToList();
      } else {
        router.back();
      }
    });
  }, [guardDiscard, onBackToList, router]);

  // "+" puts the caret on the trailing blank row — that row IS the new line.
  const addLine = useCallback(() => {
    if (!editable) return;
    const key = api.addLine();
    if (key) {
      setActiveLineKey(key);
      focusCellSoon("lines", key, "reason");
    }
  }, [api, editable]);

  const addTender = useCallback(() => {
    if (!editable) return;
    const key = api.addTender();
    if (key) {
      setActiveTenderKey(key);
      focusCellSoon("tenders", key, "tender");
    }
  }, [api, editable]);

  // "−" removes the row the caret is on; a blank row has nothing to remove.
  const activeLine = draft.lines.find((line) => line.key === activeLineKey) ?? null;
  const activeTender = draft.tenders.find((row) => row.key === activeTenderKey) ?? null;
  const canRemoveLine = editable && activeLine !== null && !isBlankLine(activeLine);
  const canRemoveTender = editable && activeTender !== null && !isBlankTender(activeTender);
  const removeLine = useCallback(() => {
    if (activeLineKey) api.removeLine(activeLineKey);
  }, [activeLineKey, api]);
  const removeTender = useCallback(() => {
    if (activeTenderKey) api.removeTender(activeTenderKey);
  }, [activeTenderKey, api]);

  // ── the reason / ledger pickers (grids 155 / 156) ───────────────────────
  const openPicker = useCallback(
    (lineKey: string, column: PopupColumn, query: string) => {
      if (!editable) return;
      setActiveLineKey(lineKey);
      setPicker({ lineKey, column, query });
    },
    [editable],
  );
  const closePicker = useCallback(() => {
    if (picker) {
      // The popup took the caret: give it back to the cell it was opened on.
      focusCellSoon("lines", picker.lineKey, picker.column);
    }
    setPicker(null);
  }, [picker]);
  const onPicked = useCallback(
    (row: Record<string, unknown>) => {
      if (!picker) return;
      const next = api.pickIntoLine(picker.lineKey, picker.column, row);
      setPicker(null);
      focusCellSoon("lines", picker.lineKey, next ?? picker.column);
    },
    [api, picker],
  );

  // Save draft and Post both clear the screen for the next voucher (Qt
  // 5e25760): the caret goes back to Paid to, where Qt's New puts it.
  const { saveDraft: saveDraftNow, post: postNow } = api;
  const saveDraft = useCallback(async () => {
    if (await saveDraftNow()) {
      setActiveLineKey(null);
      setActiveTenderKey(null);
      focusHeadSoon("paidTo");
    }
  }, [saveDraftNow]);
  const post = useCallback(async () => {
    if (await postNow()) {
      setActiveLineKey(null);
      setActiveTenderKey(null);
      focusHeadSoon("paidTo");
    }
  }, [postNow]);

  // A new voucher opens with the caret in Paid to.
  const opensNew = !initialKeys;
  useEffect(() => {
    if (opensNew) focusHeadSoon("paidTo");
  }, [opensNew]);

  // ── the keys ────────────────────────────────────────────────────────────
  const keyTargets = {
    canSave: api.canSave,
    canPost: api.canPost,
    postHint: api.postHint,
    saveDraft,
    post,
    startNew,
    goList,
    close,
    addLine,
    addTender,
    dialogOpen:
      confirmRequest !== null || cancelOpen || picker !== null || lineSettings.active || tenderSettings.active,
  };
  const keyTargetsRef = useRef(keyTargets);
  useEffect(() => {
    keyTargetsRef.current = keyTargets;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = keyTargetsRef.current;
      if (event.key === "F1" || event.key === "F5") {
        event.preventDefault();
      }
      if (current.dialogOpen) {
        return;
      }
      // By the physical key: Alt+letter types another character on a Mac.
      const letter = event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : "";
      const chord = (event.altKey || event.ctrlKey) && !event.metaKey && !event.shiftKey;
      if (event.key === "F5") {
        if (current.canSave) void current.saveDraft();
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault();
        if (current.canPost) {
          void current.post();
        } else if (current.postHint) {
          // Qt shows the button's tooltip — why Post is not open yet.
          toast.warn(current.postHint, { toastId: "expense-post-hint" });
        }
        return;
      }
      if (event.key === "F2") {
        // In a grid F2 is the cell's own (its picker, or nothing); elsewhere New.
        const inGrid = event.defaultPrevented || isGridCell(event.target);
        event.preventDefault();
        if (!inGrid) {
          current.startNew();
        }
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        current.goList();
        return;
      }
      if (chord && letter === "n") {
        event.preventDefault();
        current.addLine();
        return;
      }
      if (chord && letter === "t") {
        event.preventDefault();
        current.addTender();
        return;
      }
      // A popup (a dropdown's list, a picker's search) takes its own Escape
      // and marks it; only an unclaimed Escape closes the voucher.
      if (event.key === "Escape" && !event.defaultPrevented) {
        current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── render ──────────────────────────────────────────────────────────────
  if (api.loadError && draft.keys === null) {
    return (
      <div className={styles.page}>
        <header className={styles.titleBar}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Expense Voucher</h1>
          </div>
        </header>
        <p className={styles.loadError}>{api.loadError}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={goList}>
            F8  List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── title · where the cash comes from · status (the Qt card's top row) ── */}
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            Expense Voucher
            {draft.dirty && editable ? <span className={styles.dirtyMark}> *</span> : null}
          </h1>
          <p className={styles.subtitle}>Expense paid out</p>
        </div>
        <div className={styles.moneyFrom} role="status">
          <span className={styles.moneyDot} aria-hidden="true" />
          <span>{api.loading ? "Reading the voucher…" : view.moneyFrom}</span>
        </div>
        <div className={styles.titleRight}>
          {draft.voucherNo ? <span className={styles.docNumber}>{draft.voucherNo}</span> : null}
          <span className={cx(styles.pill, TONE_CLASS[pill.tone])}>{api.loading ? "LOADING" : pill.label}</span>
        </div>
      </header>

      <div className={styles.scroll}>
        {/* ── the header: Enter walks it like Tab (Qt 5e25760) ────────── */}
        <div
          className={styles.head}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.defaultPrevented ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey
            ) {
              return;
            }
            if (advanceHead(event.target)) {
              event.preventDefault();
            }
          }}
        >
          <section className={styles.facts} aria-label="Voucher">
            <div className={styles.field}>
              <span className={styles.cap}>Voucher no</span>
              <span className={cx(styles.input, styles.inputReadOnly, !draft.voucherNo && styles.inputPlaceholder)}>
                {draft.voucherNo ?? "auto on post"}
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.cap}>Date</span>
              <DateInput
                fieldProps={headAttrs("date")}
                value={header.voucherDate}
                disabled={dateLocked}
                title={session ? "At the till the voucher is dated the session's business day." : undefined}
                aria-label="Date"
                onChange={(voucherDate) => api.setHeader({ voucherDate })}
              />
            </div>
            <label className={styles.field}>
              <span className={styles.cap}>Paid to</span>
              <input
                {...headAttrs("paidTo")}
                className={styles.input}
                value={header.paidTo}
                maxLength={240}
                disabled={!editable}
                placeholder="who took the money"
                onChange={(event) => api.setHeader({ paidTo: event.target.value })}
              />
            </label>
            <div className={styles.field} {...headAttrs("party")}>
              <span className={cx(styles.cap, gst && !header.partyId && styles.capRequired)}>
                {gst ? "Supplier party *" : "Party (optional)"}
              </span>
              <NexDropdownSingle
                dropdownId={payeeDropdownId}
                className={styles.dropdownField}
                value={header.partyId ? { id: header.partyId, text: header.partyName } : null}
                onChange={api.pickParty}
                // Dropdown 60 PAYMENT PAYEES binds `icompany_id` inside a quoted
                // literal: left out, only the shared ledgers match. Always sent.
                params={{ icompany_id: api.docCompanyId }}
                clearOnParamsChange={false}
                disabled={!editable}
                placeholder="— none —"
                aria-label="Party"
              />
            </div>
            <label className={styles.field}>
              <span className={styles.cap}>Notes</span>
              <input
                {...headAttrs("notes")}
                className={styles.input}
                value={header.notes}
                maxLength={240}
                disabled={!editable}
                onChange={(event) => api.setHeader({ notes: event.target.value })}
              />
            </label>
          </section>

          {/* ── with a GST bill ──────────────────────────────────────── */}
          <section className={styles.gst} aria-label="GST bill">
            <div className={styles.field}>
              <label className={styles.check}>
                <input
                  {...headAttrs("gstBill")}
                  type="checkbox"
                  checked={gst}
                  disabled={!editable}
                  onChange={(event) => {
                    api.setGstBill(event.target.checked);
                    // A GST bill needs its supplier: no party yet, go and pick one.
                    if (event.target.checked && !header.partyId) focusHeadSoon("party");
                  }}
                />
                With GST bill
              </label>
              <p className={styles.gstNote}>input tax claimed through GSTR-2 (as PurA) · the supplier is the Party above</p>
            </div>
            <label className={styles.field}>
              <span className={styles.cap}>Supplier GSTIN</span>
              <input
                {...headAttrs("gstin")}
                className={styles.input}
                value={header.supplierGstin}
                maxLength={15}
                data-uppercase="off"
                autoComplete="off"
                disabled={!editable || !gst}
                onChange={(event) => api.setHeader({ supplierGstin: event.target.value.toUpperCase() })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.cap}>Invoice no</span>
              <input
                {...headAttrs("invoiceNo")}
                className={styles.input}
                value={header.invoiceNo}
                maxLength={50}
                data-uppercase="off"
                autoComplete="off"
                disabled={!editable || !gst}
                onChange={(event) => api.setHeader({ invoiceNo: event.target.value })}
              />
            </label>
            <div className={styles.field}>
              <span className={styles.cap}>Invoice date</span>
              <DateInput
                fieldProps={headAttrs("invoiceDate")}
                value={header.invoiceDate}
                disabled={!editable || !gst}
                aria-label="Invoice date"
                onChange={(invoiceDate) => api.setHeader({ invoiceDate })}
              />
            </div>
            <div className={styles.field} {...headAttrs("pos")}>
              <span className={styles.cap}>Place of supply</span>
              <NexDropdownSingle
                dropdownId={stateDropdownId}
                className={styles.dropdownField}
                value={api.placeOfSupply}
                onChange={api.pickPlaceOfSupply}
                disabled={!editable || !gst}
                placeholder="from GSTIN"
                aria-label="Place of supply"
              />
            </div>
          </section>
        </div>

        {/* ── WHAT WAS SPENT | HOW IT WAS PAID: the grids take the height ── */}
        <div className={styles.mid}>
          <section className={styles.block} aria-label="What was spent">
            <div className={styles.blockHead}>
              <h2 className={styles.formCap}>What was spent</h2>
              <span className={styles.code}>+ adds a line · − removes it · type in Reason or Expense ledger to pick</span>
            </div>
            <LinesGrid
              columns={lineColumns}
              lines={draft.lines}
              cells={view.lineCells}
              linesFresh={view.linesFresh}
              gstBill={gst}
              editable={editable}
              reasonNames={api.reasonNames}
              rates={api.rates}
              ratesFailed={api.ratesFailed}
              activeKey={activeLineKey}
              onActivate={setActiveLineKey}
              onOpenPicker={openPicker}
              onClearReason={api.clearReason}
              onChange={api.setLine}
              onAddLine={addLine}
              onRemoveLine={api.removeLine}
              resizingKey={lineResize.resizingKey}
              onColumnResizeStart={lineResize.onResizeStart}
              onContextMenu={lineSettings.onContextMenu}
            />
            <div className={styles.blockFoot}>
              <button
                type="button"
                className={styles.lineButton}
                // Mouse-only, as Qt's: the bare + / − keys in the grid do the same.
                tabIndex={-1}
                disabled={!editable}
                title="Add line (Alt+N)"
                aria-label="Add line"
                onClick={addLine}
              >
                +
              </button>
              <button
                type="button"
                className={styles.lineButton}
                // Mouse-only, as Qt's: the bare + / − keys in the grid do the same.
                tabIndex={-1}
                disabled={!canRemoveLine}
                title="Remove line"
                aria-label="Remove line"
                onClick={removeLine}
              >
                −
              </button>
              <span className={cx(styles.strong, !view.linesFresh && gst && styles.stale)}>{view.linesSummary}</span>
            </div>
            <p className={styles.note}>{view.taxNote}</p>
          </section>

          <section className={styles.block} aria-label="How it was paid">
            <div className={styles.blockHead}>
              <h2 className={styles.formCap}>How it was paid</h2>
              <span className={styles.code}>must equal the lines · the first tender takes the balance</span>
            </div>
            <TendersGrid
              columns={tenderColumns}
              rows={draft.tenders}
              accounts={view.tenderAccounts}
              editable={editable}
              options={api.tenderOptions}
              activeKey={activeTenderKey}
              onActivate={setActiveTenderKey}
              onPickTender={api.pickTender}
              onChange={api.setTender}
              onAddTender={addTender}
              onRemoveTender={api.removeTender}
              resizingKey={tenderResize.resizingKey}
              onColumnResizeStart={tenderResize.onResizeStart}
              onContextMenu={tenderSettings.onContextMenu}
            />
            <div className={styles.blockFoot}>
              <button
                type="button"
                className={styles.lineButton}
                // Mouse-only, as Qt's: the bare + / − keys in the grid do the same.
                tabIndex={-1}
                disabled={!editable}
                title="Add tender (Alt+T)"
                aria-label="Add tender"
                onClick={addTender}
              >
                +
              </button>
              <button
                type="button"
                className={styles.lineButton}
                // Mouse-only, as Qt's: the bare + / − keys in the grid do the same.
                tabIndex={-1}
                disabled={!canRemoveTender}
                title="Remove tender"
                aria-label="Remove tender"
                onClick={removeTender}
              >
                −
              </button>
              <span className={styles.strong}>{view.tendersSummary}</span>
            </div>
            <p className={styles.note}>{TENDER_NOTE}</p>
          </section>
        </div>

        {/* ── LINES − TENDERS ──────────────────────────────────────────── */}
        <div
          className={cx(
            styles.balance,
            view.balance.tone === "success" && styles.balanceSuccess,
            view.balance.tone === "danger" && styles.balanceDanger,
          )}
        >
          <span className={styles.balanceCap}>Lines − tenders</span>
          <span className={styles.figure}>{view.balance.text}</span>
        </div>

        {/* ── what the server noticed ──────────────────────────────────── */}
        {view.warnings.length > 0 ? (
          <div className={cx(styles.notice, !view.fresh && styles.stale)} role="note">
            <span className={cx(styles.pill, styles.toneInfo)}>INFO</span>
            <span>{view.warnings.join("\n")}</span>
          </div>
        ) : null}

        {view.approval ? (
          <div className={cx(styles.notice, styles.approval, !view.fresh && styles.stale)} role="note">
            <span className={cx(styles.pill, styles.toneWarning)}>APPROVAL</span>
            <span className={styles.code}>{view.approval.code}</span>
            <span className={styles.approvalText}>{view.approval.text}</span>
            <span className={styles.approvalAmount}>{view.approval.amount}</span>
          </div>
        ) : null}

        {view.refusals.length > 0 ? (
          <ul className={cx(styles.refusals, !view.fresh && styles.stale)} role="alert">
            {view.refusals.map((refusal) => (
              <li key={refusal}>{refusal}</li>
            ))}
          </ul>
        ) : null}

        {/* ── POSTS: the legs, once the server has worked them out ─────── */}
        {view.legs.columns.length > 0 ? (
          <section className={styles.posts} aria-label="Posts">
            <div className={styles.blockHead}>
              <h2 className={styles.formCap}>Posts</h2>
              <span className={styles.code}>one ExpV voucher — the legs the server would write (validate)</span>
              <span
                className={cx(styles.strong, view.legs.balanced ? styles.toneTextSuccess : styles.toneTextDanger)}
              >
                {view.legs.balance}
              </span>
            </div>
            <div className={cx(styles.legs, !view.fresh && styles.stale)}>
              {view.legs.columns.map((column, columnIndex) => (
                <div key={columnIndex} className={styles.legColumn}>
                  {column.map((leg, legIndex) => (
                    <div key={legIndex} className={styles.leg}>
                      <span className={styles.legSide}>{leg.side}</span>
                      <span className={styles.legName} title={leg.name}>
                        {leg.name}
                      </span>
                      <span className={styles.legAmount}>{leg.amount}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* ── the verbs: right-aligned, one width each (Qt 5e25760) ─────────── */}
      <div className={styles.buttons}>
        <div className={styles.verbs}>
          <button
            type="button"
            className={styles.button}
            disabled={!api.canSave}
            title={api.problem ?? undefined}
            onClick={() => void saveDraft()}
          >
            F5  Save draft
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!api.canPost}
            title={api.postHint || undefined}
            onClick={() => void post()}
          >
            Post - Ctrl+Enter
          </button>
          <button type="button" className={styles.button} disabled={!rights.mayStartNew || busy} onClick={startNew}>
            F2  New
          </button>
          {api.showCancel ? (
            <button
              type="button"
              className={styles.dangerButton}
              disabled={!api.canCancel}
              title={rights.mayCancelDocument(true) ? undefined : "You may not cancel an expense voucher (menu 277)"}
              onClick={() => setCancelMode("cancel")}
            >
              Cancel voucher…
            </button>
          ) : null}
          {api.showCancel ? (
            <button
              type="button"
              className={styles.dangerButton}
              disabled={!api.canCancelReenter}
              title={
                api.canCancelReenter || busy
                  ? "Cancel this voucher and open a copy to correct and post again"
                  : "Cancel & re-enter needs both the Cancel and the Create right (menu 277)"
              }
              onClick={() => setCancelMode("reenter")}
            >
              Cancel &amp; re-enter…
            </button>
          ) : null}
          <button type="button" className={styles.button} onClick={goList}>
            F8  List
          </button>
          <button type="button" className={styles.button} onClick={close}>
            Close
          </button>
        </div>
      </div>
      {picker ? (
        <GridPickerModal
          key={`${picker.lineKey}-${picker.column}`}
          isOpen
          title={picker.column === "reason" ? "Select expense reason" : "Select expense ledger"}
          gridId={picker.column === "reason" ? reasonGridId : ledgerGridId}
          params={pickerParams}
          initialQuery={picker.query}
          searchPlaceholder={picker.column === "reason" ? "Reason, ledger or code" : "Ledger, group, GST or HSN/SAC"}
          fallbackColumns={picker.column === "reason" ? REASON_PICKER_COLUMNS : LEDGER_PICKER_COLUMNS}
          rowKeyField={picker.column === "reason" ? "trs_id" : "led_id"}
          onClose={closePicker}
          onPick={onPicked}
        />
      ) : null}

      {lineSettings.overlays}
      {tenderSettings.overlays}

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      {cancelMode ? (
        <CancelReasonDialog
          voucherNo={draft.voucherNo}
          reenter={cancelMode === "reenter"}
          busy={busy}
          onCancel={() => setCancelMode(null)}
          onConfirm={(reason) => {
            void api.cancelVoucher(reason, cancelMode === "reenter").then((result) => {
              if (!result.ok) return;
              setCancelMode(null);
              // The copy is open: the caret goes to its first line's amount.
              if (result.firstLineKey) {
                setActiveLineKey(result.firstLineKey);
                focusCellSoon("lines", result.firstLineKey, "amount");
              }
            });
          }}
        />
      ) : null}
    </div>
  );
}
