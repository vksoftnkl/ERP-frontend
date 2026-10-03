"use client";

/**
 * Bill-wise Payment — menu 100.
 *
 * The Receipt screen as built, mirrored (the Qt client's PaymentEntry, "do as
 * like receipt"): the header, the party band with its two context panels, the
 * bills grid (held items and bills together), the instruments grid
 * (instruments and role lines together), the identity strip, and the whole
 * lifecycle — draft → post → cancel, delete a draft, correct a posted one,
 * walk the register.
 *
 *     PAID + DEDUCTIONS + CREDITS = ALLOCATED + ON ACCOUNT + ADDITIONS
 *
 * with the payment's one delta: the bank's charge on a transfer is INSIDE the
 * amount paid, so BANK_CHARGES is an ADDITION here, not the leg split it is on
 * a receipt. And what is the payment's own:
 *
 *  - the payee is any party ledger (dropdown 60); a cash or bank ledger is a
 *    Contra and is refused;
 *  - TDS is DEDUCTED by us, worked out exactly as the server does, never typed;
 *  - our cheque comes from a BOOK and the leaf is the server's, taken at Post;
 *  - a transfer carries the bank's charge and a beneficiary snapshot;
 *  - a bill paid a few paise over is rounded UP.
 *
 * Layout and wiring only — every figure is `domain/`'s, every body `payload/`'s,
 * every refusal `validate.ts`'s, every rule about change `state/draft.ts`'s.
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
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import { useGetReceiptLedgerContactQuery } from "@/store/api/receiptApi";
import { useGetOpenChequeBooksQuery } from "@/store/api/paymentApi";
import { planDeductions } from "@/features/accounts/receipt/domain/deductions";
import { IdentityStrip } from "@/features/accounts/receipt/components/identity-strip";
import { PaidDetail, type PaidDetailTarget } from "@/features/accounts/receipt/components/paid-detail";
import { PromptDialog } from "@/features/accounts/receipt/components/prompt-dialog";
import {
  RECEIPT_FIELD_ATTR,
  advanceReceiptField,
  focusReceiptField,
} from "@/features/accounts/receipt/focus-walk";
import styles from "@/features/accounts/receipt/page.module.scss";
import { resolvePaymentBillColumns, resolvePaymentTenderColumns } from "./columns";
import { PAYMENT_SETTLEMENT } from "./domain/roles";
import { paymentTdsOf } from "./domain/seeded-lines";
import { defaultPaymentTender, isChequeType, isTransferType, isUpiType } from "./domain/tenders";
import type { BillRow, CreditRow, PaymentKeys, PaymentScope } from "./payment.types";
import { paidTotal } from "./state/draft";
import { usePaymentDraft, type ConfirmRequest, type PromptRequest } from "./state/use-payment-draft";
import { usePaymentSettings } from "./state/use-payment-settings";
import { BeneficiaryDialog } from "./components/beneficiary-dialog";
import { OurChequeDialog } from "./components/our-cheque-dialog";
import { LastPaymentsPanel, OurChequesOutPanel } from "./components/payment-context-panels";
import { PaymentBillsGrid } from "./components/payment-bills-grid";
import { PaymentDocStrip } from "./components/payment-doc-strip";
import { PaymentInstrumentsGrid } from "./components/payment-instruments-grid";
import { PaymentPartyPanel } from "./components/payment-party-panel";
import {
  PaymentRegisterModal,
  type RegisterFilters,
} from "./components/payment-register-modal";

const BILL_FOCUS_NOTE =
  "Focus is not used on this grid: the money cells are reached by clicking or tabbing, and which of them open is decided by the row — a held item takes an Apply and nothing else.";
const TENDER_FOCUS_NOTE =
  "Focus is not used on this grid: which cells open is decided by the row's KIND — a cheque has no number, a transfer has a charge, a role line has neither.";

/** Menu 100, "Bill-wise Payment", a child of Accounts (menu 5). */
export const PAYMENT_MENU_ID = 100;

/**
 * The keying order — the receipt's, without the beat. Enter is a Tab that
 * follows it rather than the DOM (the payee picker and the Amount box sit
 * below the strip).
 */
const PAYMENT_FIELD_ORDER = [
  "paymentNo",
  "date",
  "paidBy",
  "theirRef",
  "refDate",
  "ourRef",
  "narration",
  "party",
  "amount",
] as const;

/*
 * The keys, for the reader — each is also written on its button:
 *
 *   F1  New               Alt+A  Auto-allocate
 *   F5  Save draft        Alt+T  Add instrument
 *   F6  Re-read bills     F4     Cheque book / beneficiary (on the row)
 *   F7  Paid detail       F8     Show list
 *   F9  Ledger statement  Ctrl+Enter  Post & print
 *   Ctrl+PgUp/PgDn  Walk the register      Esc  Close
 *
 * F1 and F5 are always prevented: the browser's own would open help and
 * reload the page over a half-keyed payment.
 */

type DialogRequest =
  | { kind: "confirm"; request: ConfirmRequest; resolve: (ok: boolean) => void }
  | { kind: "prompt"; request: PromptRequest; resolve: (value: string | null) => void };

export type PaymentScreenProps = {
  initialKeys?: PaymentKeys;
  onBackToList?: () => void;
};

export default function PaymentScreen({ initialKeys, onBackToList }: PaymentScreenProps) {
  const router = useRouter();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const { permissions, isLoading: permissionsLoading } = usePagePermissions({
    menuId: PAYMENT_MENU_ID,
  });

  const scope: PaymentScope = useMemo(
    () => ({
      companyId: activeCompany?.id ?? "",
      branchId: activeBranch?.id ?? "",
      accYear: (activeFiscalYear?.name ?? "").trim(),
    }),
    [activeCompany?.id, activeBranch?.id, activeFiscalYear?.name],
  );

  // "Unloaded" is not "denied": read-only while the menu loads, and the server
  // stays the authority.
  const canWrite = !permissionsLoading && permissions.canEdit;
  const settings = usePaymentSettings(scope.companyId, scope.branchId);

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

  const api = usePaymentDraft({
    scope,
    appDate: todayIso(),
    settings,
    canWrite,
    confirm,
    prompt,
  });
  const { draft, dispatch, identity, masters, busy, editable } = api;

  // ── The grid layouts — ui tables 42 and 43 ────────────────────────────────
  const billUiTableId = useUiTableId("paymentBills");
  const tenderUiTableId = useUiTableId("paymentTenders");
  const { data: billLayout } = useGetQuotationGridLayoutQuery(
    { uiTableId: billUiTableId },
    { skip: !billUiTableId },
  );
  const { data: tenderLayout } = useGetQuotationGridLayoutQuery(
    { uiTableId: tenderUiTableId },
    { skip: !tenderUiTableId },
  );
  const billColumns = useMemo(() => resolvePaymentBillColumns(billLayout), [billLayout]);
  const tenderColumns = useMemo(() => resolvePaymentTenderColumns(tenderLayout), [tenderLayout]);
  const billResize = useColumnResize(billColumns, billUiTableId);
  const tenderResize = useColumnResize(tenderColumns, tenderUiTableId);
  const billSettings = useGridSettings({
    label: "Bills and held items",
    uiTableId: billUiTableId,
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

  // The mobile and address, which `/open-items` does not carry.
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

  // The open cheque books — what F4 on a cheque row offers.
  const { data: bookPayload, isFetching: booksLoading } = useGetOpenChequeBooksQuery(
    { companyId: scope.companyId, branchId: scope.branchId || undefined },
    { skip: !scope.companyId },
  );
  const books = useMemo(() => bookPayload?.books ?? [], [bookPayload]);

  // Where the settling deductions land — the After column and the Note hint.
  const deductionShares = useMemo(() => {
    const plan = planDeductions(draft.bills, draft.lines, PAYMENT_SETTLEMENT);
    return new Map(
      draft.bills.map((bill, index) => [bill.billId, plan.pinned[index] + plan.shares[index]]),
    );
  }, [draft.bills, draft.lines]);

  const tds = useMemo(
    () =>
      paymentTdsOf({
        bills: draft.bills,
        tenders: draft.tenders,
        lines: draft.lines,
        party: draft.party,
      }),
    [draft.bills, draft.lines, draft.party, draft.tenders],
  );

  // ── Screen-local UI state ─────────────────────────────────────────────────
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerFilters, setRegisterFilters] = useState<RegisterFilters>({
    status: "",
    fromDate: "",
    toDate: "",
  });
  const [instrumentRowKey, setInstrumentRowKey] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<PaidDetailTarget | null>(null);
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);
  const [currentTenderKey, setCurrentTenderKey] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  const instrumentRow = useMemo(
    () => draft.tenders.find((row) => row.key === instrumentRowKey) ?? null,
    [draft.tenders, instrumentRowKey],
  );
  // F4 only ever opens on a cheque or a transfer; the grid says so on cash.
  const instrumentDialogOpen =
    instrumentRow !== null &&
    (isChequeType(instrumentRow.tenderTypeId) || isTransferType(instrumentRow.tenderTypeId));

  const openByKeys = api.openByKeys;

  const openedInitial = useRef(false);
  useEffect(() => {
    if (!initialKeys?.avhVoucherId || openedInitial.current) {
      return;
    }
    openedInitial.current = true;
    void openByKeys(initialKeys);
  }, [initialKeys, openByKeys]);

  // The caret starts on PAYMENT NO on every new or loaded document.
  useEffect(() => {
    focusReceiptField(pageRef.current, "paymentNo");
  }, [draft.header.voucherId, draft.header.status]);

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
    const master = defaultPaymentTender(masters);
    if (!master) {
      toast.warn(
        "Nothing can be paid until the Tender Master answers with a cash, bank, cheque or UPI tender.",
      );
      return;
    }
    dispatch({ type: "ADD_TENDER", master });
  }, [dispatch, masters]);

  /** The Amount box: what is paid, onto the FIRST instrument. */
  const setPaidAmount = useCallback(
    (amount: number) => {
      const first = draft.tenders[0];
      if (first) {
        dispatch({ type: "SET_TENDER", rowKey: first.key, patch: { amount } });
        return;
      }
      const master = defaultPaymentTender(masters);
      if (!master) {
        toast.warn("No tender is configured for this date, so nothing can be paid on it.");
        return;
      }
      dispatch({ type: "ADD_TENDER", master, amount });
    },
    [dispatch, draft.tenders, masters],
  );

  /** Default: put this row back on the default tender, clearing what it carried. */
  const resetRowToDefaultTender = useCallback(() => {
    const row =
      draft.tenders.find((candidate) => candidate.key === currentTenderKey) ??
      draft.tenders[draft.tenders.length - 1];
    const master = defaultPaymentTender(masters);
    if (!row || !master) {
      return;
    }
    dispatch({ type: "RESET_TENDER", rowKey: row.key, master });
  }, [currentTenderKey, dispatch, draft.tenders, masters]);

  const removeCurrentRow = useCallback(() => {
    const key =
      currentTenderKey &&
      (draft.tenders.some((row) => row.key === currentTenderKey) ||
        draft.lines.some((row) => row.key === currentTenderKey))
        ? currentTenderKey
        : (draft.lines.filter((row) => !row.seeded).at(-1)?.key ??
          draft.tenders[draft.tenders.length - 1]?.key);
    if (!key) {
      return;
    }
    dispatch({ type: "REMOVE_ROW", rowKey: key });
  }, [currentTenderKey, dispatch, draft.lines, draft.tenders]);

  const openLedgerStatement = useCallback(() => {
    if (!draft.header.partyId) {
      toast.info("Choose the payee first — a statement is one party's account.");
      return;
    }
    toast.info(
      "The party's ledger statement is not available from this screen yet — it has no screen of its own in this client.",
    );
  }, [draft.header.partyId]);

  /** Post, then print — there is no payment advice print yet, and it says so. */
  const postAndPrint = useCallback(async () => {
    const posted = await api.post();
    if (posted) {
      toast.info("Printing the payment advice is not available from this screen yet.");
    }
  }, [api]);

  const closeScreen = useCallback(() => {
    void (async () => {
      if (draft.dirty) {
        const ok = await confirm({
          title: "Close this payment?",
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

  const openHistory = useCallback((row: BillRow | CreditRow, isHeld: boolean) => {
    setHistoryTarget({
      billId: row.billId,
      billAccYear: row.billAccYear,
      docRefno: row.docRefno,
      isCredit: isHeld,
    });
  }, []);

  const emptyBillsMessage = useMemo(() => {
    if (draft.header.status !== "DRAFT" && !draft.amending) {
      return "This payment settled no bill — all of it was paid on account.";
    }
    if (!draft.header.partyId) {
      return "Choose the payee to see what we owe them and what they hold of ours.";
    }
    return "We owe this party nothing, and they hold nothing of ours.";
  }, [draft.amending, draft.header.partyId, draft.header.status]);

  const openHistoryForCursor = useCallback(() => {
    const bill = draft.bills.find((row) => row.billId === currentRowId);
    const held = draft.credits.find((row) => row.billId === currentRowId);
    if (bill) {
      openHistory(bill, false);
      return;
    }
    if (held) {
      openHistory(held, true);
      return;
    }
    toast.info("Put the cursor on a bill first — F7 shows every payment that has touched it.");
  }, [currentRowId, draft.bills, draft.credits, openHistory]);

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
    modalOpen: registerOpen || dialog !== null || instrumentDialogOpen || historyTarget !== null,
  };
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = shortcutsRef.current;
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
  // Hidden, not greyed, when the company setting is off.
  const canAmend =
    settings.allowPostedAmend && draft.header.status === "POSTED" && !draft.amending && canWrite;
  const postDisabled =
    !canWrite ||
    !identity.balances ||
    busy !== "idle" ||
    !draft.header.partyId ||
    (!editable && !draft.amending);

  const paid = paidTotal(draft);

  return (
    <div
      className={styles.page}
      ref={pageRef}
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
        // Enter in the Amount box allocates, as on the desktop screen.
        if (target.closest(`[${RECEIPT_FIELD_ATTR}="amount"]`)) {
          event.preventDefault();
          dispatch({ type: "AUTO_ALLOCATE" });
          return;
        }
        if (advanceReceiptField(pageRef.current, target, PAYMENT_FIELD_ORDER)) {
          event.preventDefault();
        }
      }}
    >
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            Payment{draft.dirty ? <span className={styles.dirtyMark}> •</span> : null}
          </h1>
          <p className={styles.subtitle}>
            Money out — pay the party&apos;s bills, or pay ahead of them on account
          </p>
        </div>
        <div className={styles.titleRight}>
          {draft.notice ? (
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

      <PaymentDocStrip
        header={draft.header}
        editable={editable && canWrite}
        salesmanMandatory={settings.salesmanMandatory}
        branchId={scope.branchId}
        invalidField={invalidField}
        onChange={(patch) =>
          // The date re-reads the open items: it ages the discount, picks the
          // TDS rate and decides the tenders on offer.
          patch.voucherDate !== undefined
            ? api.setVoucherDate(patch.voucherDate)
            : dispatch({ type: "SET_HEADER", patch })
        }
      />

      <div className={styles.panelsRow}>
        <PaymentPartyPanel
          header={draft.header}
          party={draft.party}
          summary={draft.summary}
          context={draft.context?.summary ?? null}
          identity={identity}
          tds={tds}
          paidAnything={paid > 0}
          companyId={scope.companyId}
          mobile={(contact?.ledMobile ?? contact?.ledPhone ?? "").trim()}
          address={address}
          editable={editable && canWrite && !draft.amending}
          invalid={invalidField === "partyId"}
          appliesToBalance={draft.header.status === "DRAFT" || draft.amending}
          onPickParty={(partyId, partyName) => {
            if (draft.amending) {
              // The server refuses a party change on an amend (409).
              toast.warn(
                "A posted payment cannot be moved to another payee. Cancel it and make a new one.",
              );
              return;
            }
            void api.pickParty(partyId, partyName);
          }}
        />
        <LastPaymentsPanel
          rows={draft.context?.lastPayments ?? []}
          loaded={draft.context !== null}
        />
        <OurChequesOutPanel
          rows={draft.context?.ourChequesOut ?? []}
          loaded={draft.context !== null}
        />
      </div>

      <div className={styles.body}>
        <div className={styles.sectionBar}>
          <h2 className={styles.sectionCaption}>What we owe — and what we hold</h2>
          <div className={styles.amountBox} {...{ [RECEIPT_FIELD_ATTR]: "amount" }}>
            <span className={styles.amountLabel}>Amount</span>
            <input
              className={styles.amountInput}
              type="number"
              min={0}
              step="0.01"
              value={paid === 0 ? "" : paid}
              disabled={!editable || !canWrite}
              placeholder="0.00"
              title="What is paid, on the first instrument — Enter allocates it. Split it across rows in the grid below."
              onChange={(event) => setPaidAmount(Number(event.target.value))}
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
            title="Every payment that has touched the selected bill."
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
          <PaymentBillsGrid
            columns={billResize.columns}
            bills={draft.bills}
            held={draft.credits}
            deductionShares={deductionShares}
            editable={editable && canWrite}
            currentRowId={currentRowId}
            onFocusRow={setCurrentRowId}
            onSetCell={(billId, column, value) =>
              dispatch({ type: "SET_BILL_CELL", billId, column, value })
            }
            onSetNote={(billId, note) => dispatch({ type: "SET_BILL_NOTE", billId, note })}
            onSetHeldApply={(billId, value) => dispatch({ type: "SET_HELD_APPLY", billId, value })}
            onOpenHistory={openHistory}
            loading={busy === "loading"}
            emptyMessage={emptyBillsMessage}
            resizingKey={billResize.resizingKey}
            onColumnResizeStart={billResize.onResizeStart}
            onContextMenu={billSettings.onContextMenu}
          />
        </section>

        <div className={styles.sectionBar}>
          <h2 className={styles.sectionCaption}>How it was paid — and what was deducted</h2>
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
              title="Put this row back on the default tender and clear what it carried"
              onClick={resetRowToDefaultTender}
            >
              Default
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={!editable || !canWrite}
              title="Remove the row the cursor is on (Alt+−)"
              onClick={removeCurrentRow}
            >
              −
            </button>
          </div>
          <span className={styles.sectionHint}>
            F4 on a cheque row: book + auto leaf · on a bank / UPI row: the beneficiary · TDS and
            the bank charge are seeded, never typed
          </span>
        </div>

        <section className={`${styles.gridShell} ${styles.tenderShell}`}>
          <PaymentInstrumentsGrid
            columns={tenderResize.columns}
            tenders={draft.tenders}
            lines={draft.lines}
            masters={masters}
            books={books}
            bills={draft.bills}
            paymentDate={draft.header.voucherDate}
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
            // The row was just retargeted in the same tick, so the dialog is
            // opened by key and reads the row as it is when it renders.
            onOpenInstrumentDialog={setInstrumentRowKey}
            onAmountCommitted={() => void api.runDuplicateCheck()}
            onFocusRow={setCurrentTenderKey}
            resizingKey={tenderResize.resizingKey}
            onColumnResizeStart={tenderResize.onResizeStart}
            onContextMenu={tenderSettings.onContextMenu}
          />
        </section>
      </div>

      <IdentityStrip
        identity={identity}
        hint={api.identityHint}
        movedCaption="Paid"
        ariaLabel="Payment identity"
      />

      {draft.problems.length > 0 ? (
        <ul className={styles.problems}>
          {draft.problems.slice(0, 3).map((problem, index) => (
            <li key={`${problem.message}-${index}`}>{problem.message}</li>
          ))}
        </ul>
      ) : null}

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
          title="Previous payment (Ctrl+PgUp). On an empty screen, the last payment."
          onClick={() => void api.walk("prev", registerFilters)}
        >
          Prev - Ctrl+PgUp
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={busy !== "idle" || !draft.header.voucherId}
          title="Next payment (Ctrl+PgDn)"
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
            Cancel Payment
          </button>
        ) : null}
        {canAmend ? (
          <button
            type="button"
            className={styles.button}
            title="Restate this posted payment in place. It keeps its number; the change is recorded against it."
            onClick={() => void api.beginAmend()}
          >
            Correct Payment
          </button>
        ) : null}
        <button type="button" className={styles.button} onClick={() => setRegisterOpen(true)}>
          Show List - F8
        </button>
        <button type="button" className={styles.button} onClick={() => void api.newDocument()}>
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

      <PaymentRegisterModal
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

      {instrumentRow && isChequeType(instrumentRow.tenderTypeId) ? (
        <OurChequeDialog
          key={instrumentRow.key}
          row={instrumentRow}
          books={books}
          booksLoading={booksLoading}
          paymentDate={draft.header.voucherDate}
          defaultFavouring={draft.party.favouringName || draft.header.partyName}
          editable={editable && canWrite}
          onClose={() => setInstrumentRowKey(null)}
          onKeep={(rowKey, result) =>
            dispatch({
              type: "SET_TENDER",
              rowKey,
              patch: {
                cheque: result.cheque,
                instrumentDate: result.instrumentDate,
                bankName: result.bankName,
                bookNo: result.bookNo,
                // The leaf is the server's.
                refNo: "",
              },
            })
          }
        />
      ) : null}

      {instrumentRow && isTransferType(instrumentRow.tenderTypeId) ? (
        <BeneficiaryDialog
          key={instrumentRow.key}
          row={instrumentRow}
          party={draft.party}
          partyName={draft.header.partyName}
          isUpi={isUpiType(instrumentRow.tenderTypeId)}
          editable={editable && canWrite}
          onClose={() => setInstrumentRowKey(null)}
          onKeep={(rowKey, beneficiary, payerVpa) =>
            dispatch({ type: "SET_TENDER", rowKey, patch: { beneficiary, payerVpa } })
          }
        />
      ) : null}

      <PaidDetail
        target={historyTarget}
        onClose={() => setHistoryTarget(null)}
        heldMessage="An advance we paid or a debit note is something we HOLD — it has no payment history of its own. Put the cursor on a bill."
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
