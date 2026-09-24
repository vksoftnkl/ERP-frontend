"use client";

/**
 * Receipt Entry — menu 99.
 *
 * ONE page: the header, the party band with its two context panels, the bills
 * grid (bills and credits together), the instruments grid (instruments and
 * role lines together), the identity strip, and the whole lifecycle —
 * draft → post → cancel, delete a draft, restate a posted one, and walk the
 * register.
 *
 * Layout and wiring only. Every figure comes from `domain/`, every body from
 * `payload/`, every refusal from `validate.ts`, and every rule about what may
 * change from `state/draft.ts`.
 *
 *     RECEIVED + DEDUCTIONS + CREDITS = ALLOCATED + ON ACCOUNT + ADDITIONS
 *
 * is on screen permanently, Post is refused while it is out by a paisa, and
 * the server recomputes it anyway.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/components/layout/business-context";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { toast } from "@/lib/notify";
import { useUiTableId } from "@/lib/ui-tables";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
/*
 * The right-click menu, the Admin-settings dialog and drag-to-widen are the
 * SAME two affordances every other configured grid in this app carries, acting
 * on the same `fixed.ui_table_columns` rows through the same two routes — so
 * they are imported rather than rebuilt. Both hooks are generic over the
 * column meaning; the quotation owns the file only because it was the first
 * screen to need them.
 */
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import {
  useGetReceiptLedgerContactQuery,
} from "@/store/api/receiptApi";
import { resolveBillColumns, resolveTenderColumns } from "./columns";
import { RECEIPT_FIELD_ATTR, advanceReceiptField, focusReceiptField } from "./focus-walk";
import { defaultTender } from "./domain/tenders";
import type { ChequeExtras, ReceiptKeys, ReceiptScope } from "./receipt.types";
import { receivedTotal } from "./state/draft";
import { useReceiptDraft, type ConfirmRequest, type PromptRequest } from "./state/use-receipt-draft";
import { useReceiptSettings } from "./state/use-receipt-settings";
import { ApproverDialog } from "./components/approver-dialog";
import { BillsGrid } from "./components/bills-grid";
import { ChequeDialog } from "./components/cheque-dialog";
import { ChequesOutPanel, LastReceiptsPanel } from "./components/context-panels";
import { DocStrip } from "./components/doc-strip";
import { IdentityStrip } from "./components/identity-strip";
import { InstrumentsGrid } from "./components/instruments-grid";
import { PaidDetail, type PaidDetailTarget } from "./components/paid-detail";
import { PartyPanel } from "./components/party-panel";
import { PromptDialog } from "./components/prompt-dialog";
import { RegisterModal, type RegisterFilters } from "./components/register-modal";
import styles from "./page.module.scss";

/*
 * What the Admin-settings dialog's Focus column means on these two grids.
 *
 * The default sentence describes the entry grids' walk, where Focus is the
 * subset of columns Enter stops at. Neither grid here subsets a walk that way,
 * so saying nothing would invite an operator to tick boxes that change
 * nothing.
 */
const BILL_FOCUS_NOTE =
  "Focus is not used on this grid: the money cells are reached by clicking or tabbing, and which of them open is decided by the row — a credit takes an Apply and nothing else.";
const TENDER_FOCUS_NOTE =
  "Focus is not used on this grid: which cells open is decided by the row's KIND — an instrument has no Dr/Cr, a role line has no bank.";

/** Menu 99, "Receipt", a child of Accounts (menu 5). */
export const RECEIPT_MENU_ID = 99;

/*
 * The keys this screen binds, for the reader rather than for the footer — most
 * of them are written on the button that answers to them:
 *
 *   F1                New            Alt+A   Auto-allocate
 *   F5                Save draft     Alt+T   Add instrument
 *   F6                Re-read bills  F4      Cheque details (on the row)
 *   F7                Paid detail    F8      Show list
 *   F9                Ledger statement
 *   Ctrl+Enter        Post & print
 *   Ctrl+PgUp/PgDn    Walk the register
 *   Esc               Close
 *
 * F1 and F5 are always prevented, modal or not: the browser's own F1 opens a
 * help window over the screen and its F5 reloads the page, and an operator
 * reaching for either would lose the morning's work.
 */

type DialogRequest =
  | { kind: "confirm"; request: ConfirmRequest; resolve: (ok: boolean) => void }
  | { kind: "prompt"; request: PromptRequest; resolve: (value: string | null) => void };

export type ReceiptScreenProps = {
  /** Set when the route addresses one receipt by its four keys. */
  initialKeys?: ReceiptKeys;
  /**
   * Where Close goes. Supplied when the register opened this screen in place;
   * without it the screen was reached by its own URL and Close walks the
   * browser back, which is what that URL's visitor came from.
   */
  onBackToList?: () => void;
};

export default function ReceiptScreen({ initialKeys, onBackToList }: ReceiptScreenProps) {
  const router = useRouter();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const { permissions, isLoading: permissionsLoading } = usePagePermissions({
    menuId: RECEIPT_MENU_ID,
  });

  const scope: ReceiptScope = useMemo(
    () => ({
      companyId: activeCompany?.id ?? "",
      branchId: activeBranch?.id ?? "",
      accYear: (activeFiscalYear?.name ?? "").trim(),
    }),
    [activeCompany?.id, activeBranch?.id, activeFiscalYear?.name],
  );

  /**
   * "Unloaded" is not "denied": the desktop build refused a user with every
   * right because its dialog had no menu id yet, so while the menu is loading
   * the screen renders read-only rather than locked, and the server stays the
   * authority.
   */
  const canWrite = !permissionsLoading && permissions.canEdit;

  const settings = useReceiptSettings(scope.companyId, scope.branchId);

  // ── The two dialogs the hook asks for, as promises ────────────────────────
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => setDialog({ kind: "confirm", request, resolve })),
    [],
  );
  const prompt = useCallback(
    (request: PromptRequest) =>
      new Promise<string | null>((resolve) => setDialog({ kind: "prompt", request, resolve })),
    [],
  );

  const api = useReceiptDraft({
    scope,
    // There is no session "app date" in this client; the transaction screens
    // all take today's, and this one matches them. One place to change if a
    // working date is ever introduced.
    appDate: todayIso(),
    settings,
    canWrite,
    confirm,
    prompt,
  });
  const { draft, dispatch, identity, masters, busy, editable } = api;

  // ── The grid layouts ──────────────────────────────────────────────────────
  const billUiTableId = useUiTableId("receiptBills");
  const tenderUiTableId = useUiTableId("receiptTenders");
  const { data: billLayout } = useGetQuotationGridLayoutQuery(
    { uiTableId: billUiTableId },
    { skip: !billUiTableId },
  );
  const { data: tenderLayout } = useGetQuotationGridLayoutQuery(
    { uiTableId: tenderUiTableId },
    { skip: !tenderUiTableId },
  );
  const billColumns = useMemo(() => resolveBillColumns(billLayout), [billLayout]);
  const tenderColumns = useMemo(() => resolveTenderColumns(tenderLayout), [tenderLayout]);

  /*
   * A drag is LOCAL until "Save column width" commits it: these rows are the
   * layout every operator of this screen renders from, so widening a column
   * for yourself must not silently re-lay-out the grid for everyone. The
   * Admin-settings dialog is likewise a draft until Save.
   *
   * Both hooks run whether or not a grid has rows — a hook that appeared with
   * the data would change the hook order on the render after the party loads.
   */
  const billResize = useColumnResize(billColumns, billUiTableId);
  const tenderResize = useColumnResize(tenderColumns, tenderUiTableId);
  const billSettings = useGridSettings({
    label: "Bills and credits",
    uiTableId: billUiTableId,
    // Every configured column, hidden ones included — the dialog is where a
    // hidden one is brought back.
    columns: billResize.columns,
    pendingWidthCount: billResize.pendingCount,
    savingWidths: billResize.saving,
    onSaveWidths: billResize.saveWidths,
    focusNote: BILL_FOCUS_NOTE,
  });
  const tenderSettings = useGridSettings({
    label: "Instruments and deductions",
    uiTableId: tenderUiTableId,
    columns: tenderResize.columns,
    pendingWidthCount: tenderResize.pendingCount,
    savingWidths: tenderResize.saving,
    onSaveWidths: tenderResize.saveWidths,
    focusNote: TENDER_FOCUS_NOTE,
  });

  // The mobile and the address, which `/open-items` does not carry. Cached per
  // party by RTK Query's own key, so re-picking a customer costs nothing.
  const { data: contact } = useGetReceiptLedgerContactQuery(
    { ledId: draft.header.partyId },
    { skip: !draft.header.partyId },
  );
  const address = useMemo(() => {
    if (!contact) {
      return "";
    }
    return [contact.ledAddress1, contact.ledAddress2, contact.ledCity]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }, [contact]);

  // ── Screen-local UI state ─────────────────────────────────────────────────
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerFilters, setRegisterFilters] = useState<RegisterFilters>({
    status: "",
    fromDate: "",
    toDate: "",
  });
  const [chequeRowKey, setChequeRowKey] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<PaidDetailTarget | null>(null);
  const [approverBillId, setApproverBillId] = useState<string | null>(null);
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  /** The instrument row the cursor is on — what Default and − act on. */
  const [currentTenderKey, setCurrentTenderKey] = useState<string | null>(null);

  const chequeRow = useMemo(
    () => draft.tenders.find((row) => row.key === chequeRowKey) ?? null,
    [draft.tenders, chequeRowKey],
  );
  const approverBill = useMemo(
    () => draft.bills.find((row) => row.billId === approverBillId) ?? null,
    [draft.bills, approverBillId],
  );

  const openByKeys = api.openByKeys;

  // ── Opened by route, with the four keys ───────────────────────────────────
  const openedInitial = useRef(false);
  useEffect(() => {
    if (!initialKeys?.avhVoucherId || openedInitial.current) {
      return;
    }
    openedInitial.current = true;
    void openByKeys(initialKeys);
  }, [initialKeys, openByKeys]);

  /**
   * Where the caret starts: RECEIPT NO, on a fresh document and on every new
   * one after a save, a post or a delete.
   *
   * Keyed on the document rather than on mount, because this screen does not
   * unmount between receipts — `NEW_DOCUMENT` replaces the draft in place, and
   * a mount-only effect would leave the caret wherever the last receipt left
   * it. A loaded receipt gets it too: the operator is reading, and the top
   * left is where reading starts.
   */
  useEffect(() => {
    focusReceiptField(pageRef.current, "receiptNo");
  }, [draft.header.voucherId, draft.header.status]);

  // ── Leaving with unsaved work ─────────────────────────────────────────────
  useEffect(() => {
    if (!draft.dirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft.dirty]);

  const addInstrument = useCallback(() => {
    const master = defaultTender(masters);
    if (!master) {
      toast.warn("No tender is configured for this date, so no instrument can be added.");
      return;
    }
    dispatch({ type: "ADD_TENDER", master });
  }, [dispatch, masters]);

  /**
   * The Amount box: what the customer handed over, onto the FIRST instrument.
   *
   * It is the quick path — one figure, then Auto-allocate — and it deliberately
   * writes to a ROW rather than to a field of its own: money always arrives on
   * a tender, and `td_tender_ledger_id` is what the posting engine debits.
   * Splitting it across cash and a cheque is done in the grid below.
   */
  const setReceivedAmount = useCallback(
    (amount: number) => {
      const first = draft.tenders[0];
      if (first) {
        dispatch({ type: "SET_TENDER", rowKey: first.key, patch: { amount } });
        return;
      }
      const master = defaultTender(masters);
      if (!master) {
        toast.warn("No tender is configured for this date, so nothing can be received on it.");
        return;
      }
      // Added WITH its amount: a second action could not find the row, which
      // does not exist until this one has been applied.
      dispatch({ type: "ADD_TENDER", master, amount });
    },
    [dispatch, draft.tenders, masters],
  );

  /** 3.0's `tBtnDefTndr`: put this row back on the default tender. */
  const resetRowToDefaultTender = useCallback(() => {
    const row =
      draft.tenders.find((candidate) => candidate.key === currentTenderKey) ??
      draft.tenders[draft.tenders.length - 1];
    const master = defaultTender(masters);
    if (!row || !master) {
      return;
    }
    // `retargetTender` drops what the new tender cannot hold — the cheque date,
    // the bank and the extras — so this also clears them.
    dispatch({ type: "RETARGET_TENDER", rowKey: row.key, master });
  }, [currentTenderKey, dispatch, draft.tenders, masters]);

  const removeLastRow = useCallback(() => {
    const row =
      draft.tenders.find((candidate) => candidate.key === currentTenderKey) ??
      draft.otherLines[draft.otherLines.length - 1] ??
      draft.tenders[draft.tenders.length - 1];
    if (!row) {
      return;
    }
    dispatch({ type: "REMOVE_ROW", rowKey: row.key });
  }, [currentTenderKey, dispatch, draft.otherLines, draft.tenders]);

  /**
   * F9. There is no ledger statement screen in this client yet, so the button
   * says so rather than doing nothing — the same rule the print button follows.
   */
  const openLedgerStatement = useCallback(() => {
    toast.info(
      "The party's ledger statement is not available from this screen yet — it has no screen of its own in this client.",
    );
  }, []);

  /**
   * Post, then print. There IS no print pipeline for a receipt yet, so it
   * posts and says so: a button that silently does half of what it promises is
   * worse than one that reports the half it did.
   */
  const postAndPrint = useCallback(async () => {
    const posted = await api.post();
    if (posted) {
      toast.info("Printing is not available from this screen yet.");
    }
  }, [api]);

  const closeScreen = useCallback(() => {
    void (async () => {
      if (draft.dirty) {
        const ok = await confirm({
          title: "Close this receipt?",
          message: "It has unsaved changes. Close the screen and lose them?",
          confirmLabel: "Close",
        });
        if (!ok) {
          return;
        }
      }
      if (onBackToList) {
        onBackToList();
        return;
      }
      router.back();
    })();
  }, [confirm, draft.dirty, onBackToList, router]);

  const openHistory = useCallback(
    (row: { billId: string; billAccYear: string; docRefno: string }, isCredit: boolean) => {
      setHistoryTarget({
        billId: row.billId,
        billAccYear: row.billAccYear,
        docRefno: row.docRefno,
        isCredit,
      });
    },
    [],
  );

  /**
   * What an empty bills grid means. On a POSTED receipt it is not an invitation
   * to choose a customer — it is the receipt saying it settled nothing, which
   * is exactly what an on-account receipt does.
   */
  const emptyBillsMessage = useMemo(() => {
    if (draft.header.status !== "DRAFT" && !draft.amending) {
      return "This receipt settled no bill — all of it was held on account.";
    }
    if (!draft.header.partyId) {
      return "Choose a customer to see what they owe and what they hold.";
    }
    return "Nothing is outstanding against this customer, and they hold no credit.";
  }, [draft.amending, draft.header.partyId, draft.header.status]);

  /** F7 and the Paid Detail button act on the row the cursor is on. */
  const openHistoryForCursor = useCallback(() => {
    const bill = draft.bills.find((row) => row.billId === currentRowId);
    const credit = draft.credits.find((row) => row.billId === currentRowId);
    if (bill) {
      openHistory(bill, false);
      return;
    }
    if (credit) {
      openHistory(credit, true);
      return;
    }
    toast.info("Put the cursor on a bill first — F7 shows what has already settled it.");
  }, [currentRowId, draft.bills, draft.credits, openHistory]);

  /**
   * The screen's keys.
   *
   * F5 is always prevented, keyed receipt on screen or not: the browser's own
   * F5 reloads the page, and an operator reaching for Save would lose the
   * morning's work.
   */
  const shortcuts = {
    saveDraft: api.saveDraft,
    reloadItems: api.reloadItems,
    postAndPrint,
    walk: api.walk,
    newDocument: api.newDocument,
    closeScreen,
    addInstrument,
    openHistoryForCursor,
    openLedgerStatement,
    dispatch,
    setRegisterOpen,
    registerFilters,
    // Anything layered over the screen owns the keys first.
    modalOpen:
      registerOpen ||
      dialog !== null ||
      chequeRowKey !== null ||
      historyTarget !== null ||
      approverBillId !== null,
  };
  /**
   * Registered once, reading the latest values through this ref so a keystroke
   * never acts on a stale screen. Refreshed in an effect rather than during
   * render: a keypress is always handled after the paint that wrote it.
   */
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = shortcutsRef.current;
      // F1 and F5 are ALWAYS prevented, modal or not: the browser's own F1
      // opens a help window over the screen and its F5 reloads the page, and
      // an operator reaching for either would lose the morning's work.
      if (event.key === "F1") {
        event.preventDefault();
        if (!current.modalOpen) {
          void current.newDocument();
        }
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        if (!current.modalOpen) {
          void current.saveDraft();
        }
        return;
      }
      if (current.modalOpen) {
        return;
      }
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        void current.postAndPrint();
        return;
      }
      if (event.key === "F6") {
        event.preventDefault();
        current.reloadItems();
        return;
      }
      if (event.key === "F7") {
        event.preventDefault();
        current.openHistoryForCursor();
        return;
      }
      if (event.key === "F8") {
        event.preventDefault();
        current.setRegisterOpen(true);
        return;
      }
      if (event.key === "F9") {
        event.preventDefault();
        current.openLedgerStatement();
        return;
      }
      if (event.altKey && (event.key === "a" || event.key === "A")) {
        event.preventDefault();
        current.dispatch({ type: "AUTO_ALLOCATE" });
        return;
      }
      if (event.altKey && (event.key === "t" || event.key === "T")) {
        event.preventDefault();
        current.addInstrument();
        return;
      }
      if (event.ctrlKey && (event.key === "PageUp" || event.key === "PageDown")) {
        event.preventDefault();
        void current.walk(event.key === "PageUp" ? "prev" : "next", current.registerFilters);
        return;
      }
      if (event.key === "Escape") {
        current.closeScreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── What the header row says ──────────────────────────────────────────────
  const statusClass = draft.amending
    ? styles.statusAmending
    : draft.header.status === "POSTED"
      ? styles.statusPosted
      : draft.header.status === "CANCELLED"
        ? styles.statusCancelled
        : styles.statusDraft;
  const statusLabel = draft.amending ? "Amending" : draft.header.status;

  const invalidField = useMemo(() => {
    const problem = draft.problems.find((entry) => entry.target.kind === "header");
    return problem && problem.target.kind === "header" ? problem.target.field : null;
  }, [draft.problems]);

  const canDelete = draft.header.status === "DRAFT" && Boolean(draft.header.voucherId);
  const canCancel = draft.header.status === "POSTED" && !draft.amending;
  // R20 — HIDDEN, not greyed, when the company setting is off: a permanently
  // dead button prompts the same question from every operator, every week.
  const canAmend =
    settings.allowPostedAmend && draft.header.status === "POSTED" && !draft.amending && canWrite;

  const postDisabled =
    !canWrite || !identity.balances || busy !== "idle" || (!editable && !draft.amending);

  return (
    <div
      className={styles.page}
      ref={pageRef}
      /*
       * Enter is a Tab that follows the KEYING order, not the DOM order —
       * see `focus-walk.ts`. It acts only on the named header fields, so
       * Enter inside a grid cell, a dialog or a dropdown's own popup is left
       * to whoever owns it: `defaultPrevented` is the dropdown saying it has
       * just committed a pick, and Ctrl+Enter is Post.
       */
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
        const target = event.target as HTMLElement | null;
        if (!target?.closest(`[${RECEIPT_FIELD_ATTR}]`)) {
          return;
        }
        if (advanceReceiptField(pageRef.current, target)) {
          event.preventDefault();
        }
      }}
    >
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            Receipt{draft.dirty ? <span className={styles.dirtyMark}> •</span> : null}
          </h1>
          <p className={styles.subtitle}>
            Money in — allocate it to the party&apos;s bills, or leave it on account
          </p>
        </div>
        <div className={styles.titleRight}>
          {draft.notice ? (
            // SHORT on the row, with the whole sentence in its title. A
            // full-width banner pushed the party panel down every time one
            // fired, and every one of these is rare.
            <span className={styles.statusChip} title={draft.notice}>
              {draft.notice}
              <button
                type="button"
                className={styles.statusChipClose}
                aria-label="Dismiss"
                onClick={() => dispatch({ type: "NOTICE", notice: null })}
              >
                ×
              </button>
            </span>
          ) : null}
          {draft.header.voucherRefno ? (
            <span className={styles.docNumber}>{draft.header.voucherRefno}</span>
          ) : null}
          <span className={`${styles.statusPill} ${statusClass}`}>{statusLabel}</span>
        </div>
      </header>

      <DocStrip
        header={draft.header}
        editable={editable && canWrite}
        salesmanMandatory={settings.salesmanMandatory}
        branchId={scope.branchId}
        invalidField={invalidField}
        onChange={(patch) =>
          // The date is its own handler: moving it re-reads the open items,
          // because it decides what is overdue and what discount still stands.
          patch.voucherDate !== undefined
            ? api.setVoucherDate(patch.voucherDate)
            : dispatch({ type: "SET_HEADER", patch })
        }
      />

      <div className={styles.panelsRow}>
        <PartyPanel
          header={draft.header}
          party={draft.party}
          summary={draft.summary}
          context={draft.context?.summary ?? null}
          identity={identity}
          mobile={(contact?.ledMobile ?? contact?.ledPhone ?? "").trim()}
          address={address}
          editable={editable && canWrite && !draft.amending}
          invalid={invalidField === "partyId"}
          // A posted receipt is already inside the party's balance.
          appliesToBalance={draft.header.status === "DRAFT" || draft.amending}
          onPickParty={(partyId, partyName) => {
            if (draft.amending) {
              // The server refuses a party change on an amend (409), so the
              // refusal is made unreachable from this screen instead.
              toast.warn(
                "A posted receipt cannot be moved to another customer. Cancel it and key a new one.",
              );
              return;
            }
            void api.pickParty(partyId, partyName);
          }}
        />
        <LastReceiptsPanel
          rows={draft.context?.lastReceipts ?? []}
          loaded={draft.context !== null}
        />
        <ChequesOutPanel
          rows={draft.context?.pendingCheques ?? []}
          loaded={draft.context !== null}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.sectionBar}>
          <h2 className={styles.sectionCaption}>What the party owes — and what it holds</h2>
          <div className={styles.amountBox}>
            <span className={styles.amountLabel}>Amount</span>
            <input
              className={styles.amountInput}
              {...{ [RECEIPT_FIELD_ATTR]: "amount" }}
              type="number"
              min={0}
              step="0.01"
              // The quick way in: what the customer handed over, onto the one
              // instrument row. Everything else on the screen follows from it.
              value={receivedTotal(draft) === 0 ? "" : receivedTotal(draft)}
              disabled={!editable || !canWrite}
              placeholder="0.00"
              title="What was received, on the first instrument. Split it across rows in the grid below."
              onChange={(event) => setReceivedAmount(Number(event.target.value))}
              onBlur={() => void api.runDuplicateCheck()}
            />
          </div>
          <button
            type="button"
            className={styles.button}
            disabled={!editable || !canWrite}
            onClick={() => dispatch({ type: "AUTO_ALLOCATE" })}
          >
            Auto-allocate (Alt+A)
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={!currentRowId}
            onClick={openHistoryForCursor}
          >
            Paid Detail - F7
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={!editable || !canWrite}
            onClick={() => dispatch({ type: "CLEAR_ALLOCATIONS" })}
          >
            Clear
          </button>
        </div>

        <section className={`${styles.gridShell} ${styles.billShell}`}>
          <BillsGrid
            columns={billResize.columns}
            bills={draft.bills}
            credits={draft.credits}
            editable={editable && canWrite}
            currentRowId={currentRowId}
            onFocusRow={setCurrentRowId}
            onSetCell={(billId, column, value) =>
              dispatch({ type: "SET_BILL_CELL", billId, column, value })
            }
            onSetNote={(billId, note) => dispatch({ type: "SET_BILL_NOTE", billId, note })}
            onSetCreditApply={(billId, value) =>
              dispatch({ type: "SET_CREDIT_APPLY", billId, value })
            }
            onOpenHistory={openHistory}
            approvalAbove={settings.writeoffApprovalAbove}
            onPickApprover={setApproverBillId}
            loading={busy === "loading"}
            emptyMessage={emptyBillsMessage}
            resizingKey={billResize.resizingKey}
            onColumnResizeStart={billResize.onResizeStart}
            onContextMenu={billSettings.onContextMenu}
          />
        </section>

        <div className={styles.sectionBar}>
          <h2 className={styles.sectionCaption}>How it came — and what was deducted</h2>
          <div className={styles.smallButtons}>
            <button
              type="button"
              className={styles.iconButton}
              disabled={!editable || !canWrite}
              title="Add an instrument on the default tender (Alt+T)"
              onClick={addInstrument}
            >
              +
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={!editable || !canWrite || draft.tenders.length === 0}
              title="Put this row back on the default tender and clear its cheque details"
              onClick={resetRowToDefaultTender}
            >
              Default
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={!editable || !canWrite}
              title="Remove the last row"
              onClick={removeLastRow}
            >
              −
            </button>
          </div>
          <span className={styles.sectionHint}>
            cheque no, date and bank go in the row · F4 adds branch / IFSC / drawer · a seeded
            role row may be re-amounted, never removed
          </span>
        </div>

        <section className={`${styles.gridShell} ${styles.tenderShell}`}>
          <InstrumentsGrid
            columns={tenderResize.columns}
            tenders={draft.tenders}
            otherLines={draft.otherLines}
            masters={masters}
            bills={draft.bills}
            receiptDate={draft.header.voucherDate}
            editable={editable && canWrite}
            onSetTender={(rowKey, patch) => dispatch({ type: "SET_TENDER", rowKey, patch })}
            onRetarget={(rowKey, master) => dispatch({ type: "RETARGET_TENDER", rowKey, master })}
            onConvertToLine={(rowKey, role) => dispatch({ type: "CONVERT_TO_LINE", rowKey, role })}
            onConvertToTender={(rowKey, master) =>
              dispatch({ type: "CONVERT_TO_TENDER", rowKey, master })
            }
            onSetLine={(rowKey, patch) => dispatch({ type: "SET_LINE", rowKey, patch })}
            onSetLineRole={(rowKey, role) => dispatch({ type: "SET_LINE_ROLE", rowKey, role })}
            onRemoveRow={(rowKey) => dispatch({ type: "REMOVE_ROW", rowKey })}
            onOpenChequeDialog={setChequeRowKey}
            onAmountCommitted={() => void api.runDuplicateCheck()}
            onFocusRow={setCurrentTenderKey}
            resizingKey={tenderResize.resizingKey}
            onColumnResizeStart={tenderResize.onResizeStart}
            onContextMenu={tenderSettings.onContextMenu}
          />
        </section>
      </div>

      <IdentityStrip identity={identity} hint={api.identityHint} />

      {draft.problems.length > 0 ? (
        <ul className={styles.problems}>
          {draft.problems.slice(0, 3).map((problem, index) => (
            <li key={`${problem.message}-${index}`}>{problem.message}</li>
          ))}
        </ul>
      ) : null}

      {/*
        No shortcut legend here: every key this row offers is already written
        on the button that answers to it ("Prev - Ctrl+PgUp"), and a second
        copy underneath was two lines of the screen saying one thing.
      */}
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.button}
          disabled={!draft.header.partyId}
          onClick={openLedgerStatement}
        >
          Ledger Statement - F9
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={busy !== "idle"}
          onClick={() => void api.walk("prev", registerFilters)}
        >
          Prev - Ctrl+PgUp
        </button>
        <button
          type="button"
          className={styles.button}
          // Next means nothing on a blank screen: there is no receipt after
          // one that does not exist. Prev on a blank screen means "the latest".
          disabled={busy !== "idle" || !draft.header.voucherId}
          onClick={() => void api.walk("next", registerFilters)}
        >
          Next - Ctrl+PgDn
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={!canDelete || !canWrite || busy !== "idle"}
          onClick={() => void api.deleteDraft()}
        >
          Delete Draft
        </button>
        {canCancel ? (
          <button
            type="button"
            className={styles.dangerButton}
            disabled={!canWrite || busy !== "idle"}
            onClick={() => void api.cancel()}
          >
            Cancel Receipt
          </button>
        ) : null}
        {canAmend ? (
          <button
            type="button"
            className={styles.button}
            onClick={() => void api.beginAmend()}
          >
            Correct this receipt
          </button>
        ) : null}
        <button type="button" className={styles.button} onClick={() => setRegisterOpen(true)}>
          Show List - F8
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => void api.newDocument()}
        >
          New - F1
        </button>
        {draft.amending ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={postDisabled}
            onClick={() => void api.saveAmend()}
          >
            Save changes
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.button}
              disabled={!canWrite || !editable || busy !== "idle"}
              onClick={() => void api.saveDraft()}
            >
              Save Draft
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={postDisabled}
              onClick={() => void postAndPrint()}
            >
              Post &amp; Print - Ctrl+Enter
            </button>
          </>
        )}
        <button type="button" className={styles.button} onClick={closeScreen}>
          Close
        </button>
      </footer>

      {billSettings.overlays}
      {tenderSettings.overlays}

      <RegisterModal
        isOpen={registerOpen}
        scope={scope}
        filters={registerFilters}
        onFiltersChange={setRegisterFilters}
        onClose={() => setRegisterOpen(false)}
        onPick={(keys) => {
          setRegisterOpen(false);
          void openByKeys(keys);
        }}
      />

      {chequeRow ? (
      <ChequeDialog
        key={chequeRow.key}
        row={chequeRow}
        receiptDate={draft.header.voucherDate}
        editable={editable && canWrite}
        onClose={() => setChequeRowKey(null)}
        onSave={(rowKey, extras: ChequeExtras) =>
          dispatch({ type: "SET_TENDER", rowKey, patch: { cheque: extras } })
        }
      />
      ) : null}

      <PaidDetail target={historyTarget} onClose={() => setHistoryTarget(null)} />

      <ApproverDialog
        isOpen={approverBill !== null}
        billRefno={approverBill?.docRefno ?? ""}
        amount={approverBill?.writeOff ?? 0}
        threshold={settings.writeoffApprovalAbove}
        onCancel={() => setApproverBillId(null)}
        onPick={(userId) => {
          if (approverBillId) {
            dispatch({ type: "SET_WRITEOFF_APPROVER", billId: approverBillId, userId });
          }
          setApproverBillId(null);
        }}
      />

      <DeleteConfirmModal
        isOpen={dialog?.kind === "confirm"}
        title={dialog?.kind === "confirm" ? dialog.request.title : ""}
        message={dialog?.kind === "confirm" ? dialog.request.message : ""}
        confirmLabel={dialog?.kind === "confirm" ? (dialog.request.confirmLabel ?? "Continue") : ""}
        iconVariant="replace"
        onConfirm={() => {
          if (dialog?.kind === "confirm") {
            dialog.resolve(true);
          }
          setDialog(null);
        }}
        onCancel={() => {
          if (dialog?.kind === "confirm") {
            dialog.resolve(false);
          }
          setDialog(null);
        }}
      />

      {dialog?.kind === "prompt" ? (
      <PromptDialog
        title={dialog.request.title}
        message={dialog.request.message}
        placeholder={dialog.request.placeholder}
        onConfirm={(value) => {
          if (dialog?.kind === "prompt") {
            dialog.resolve(value);
          }
          setDialog(null);
        }}
        onCancel={() => {
          if (dialog?.kind === "prompt") {
            dialog.resolve(null);
          }
          setDialog(null);
        }}
      />
      ) : null}
    </div>
  );
}
