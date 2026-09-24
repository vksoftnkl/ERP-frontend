"use client";

/**
 * Opening Balance — menu 55.
 *
 * A REVIEW SURFACE OVER A SET, not a data-entry form for one record. There is
 * no list page, no F8, no document number and no lifecycle: there is one set per
 * scope per year, and saving means "this is the whole set now".
 *
 * Layout and wiring only. Every figure on it comes from `derived.ts`, every
 * body from `payload/`, and every rule about what may be saved from the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/components/layout/business-context";
import { toast } from "@/lib/notify";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/design-system/ui/keyboard-shortcut-hints";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
/*
 * The right-click menu, the Admin-settings dialog and drag-to-widen are the
 * SAME two affordances every other configured grid in this app carries, acting
 * on the same `fixed.ui_table_columns` rows through the same two routes — so
 * they are imported rather than rebuilt. Both hooks are generic over the column
 * meaning; the quotation owns the file only because it was the first screen to
 * need them, exactly as Sale Order and Sale Bill import them today.
 */
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import { resolveBillColumns, resolveLedgerColumns } from "./columns";
import { agreement as computeAgreement, formatMoney, formatSigned, isBlankLedgerRow } from "./derived";
import type { BillRow, LedgerRow } from "./opening-balance.types";
import { SCOPE_LABELS, previousAccYear, scopeOf, type ScopeMode } from "./scope";
import { useOpeningDraft } from "./state/use-opening-draft";
import { Banners } from "./components/banners";
import { BILL_GRID_NAME, BillPanel } from "./components/bill-panel";
import { LedgerGrid } from "./components/ledger-grid";
import { LedgerPickerModal } from "./components/ledger-picker-modal";
import { ScopeHeader } from "./components/scope-header";
import { TotalsBand } from "./components/totals-band";
import { focusCellAfterRender, focusGrid, focusedRowKey } from "./components/grid-focus";
import { LEDGER_GRID_NAME } from "./components/ledger-grid";
import styles from "./page.module.scss";

/** Menu 55, "Opening Balance", a child of Accounts (menu 5). */
export const OPENING_BALANCE_MENU_ID = 55;

/** What the footer shows, and what the handler below actually binds. */
const SCREEN_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  { label: "Save", keys: ["F5"] },
  { label: "Check server", keys: ["F6"] },
  { label: "Reload", keys: ["F7"] },
  { label: "Carry forward", keys: ["F9"] },
  { label: "Breakup", keys: ["Alt", "B"] },
  { label: "Panels", keys: ["F1"] },
  { label: "Remove row", keys: ["-"] },
  { label: "Close", keys: ["Esc"] },
];

/**
 * Everything this screen asks before it acts.
 *
 * Each one carries its own words AND what confirming it does, so the dialog is
 * a plain read and the sentence lives beside the decision that raises it. The
 * browser's own `confirm()` and `alert()` are not used anywhere here: they look
 * nothing like the rest of the app, they cannot be styled or keyboard-tested,
 * and a blocking native dialog freezes the render loop underneath it.
 */
type PendingConfirm = {
  title: string;
  message: string;
  note?: string;
  confirmLabel: string;
  /** `delete` is the bin; `replace` is for a job that discards without deleting. */
  iconVariant: "delete" | "replace";
  run: () => void;
};

export default function OpeningBalanceScreen() {
  const { activeCompany, activeBranch, activeFiscalYear, loading: contextLoading } =
    useBusinessContext();
  const { permissions, isLoading: permissionsLoading } = usePagePermissions({
    menuId: OPENING_BALANCE_MENU_ID,
  });

  const companyId = activeCompany?.id ?? "";
  const companyName = activeCompany?.name ?? "";
  const branchId = activeBranch?.id ?? "";
  const branchName = activeBranch?.name ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();

  /**
   * The one choice the screen offers. Everything else — company, branch, year —
   * is captured from the session, because `acc_opening_balance` is partitioned
   * by `op_acc_year` and a wrong year writes into the wrong partition.
   *
   * A company with no branch selected has only the company-level set to show.
   */
  const router = useRouter();
  const [mode, setMode] = useState<ScopeMode>("branch");
  const effectiveMode: ScopeMode = branchId ? mode : "company";
  const scope = useMemo(
    () => scopeOf(effectiveMode, companyId, branchId, accYear),
    [effectiveMode, companyId, branchId, accYear],
  );

  /**
   * Writes are gated on the RESOLVED permission. "Unloaded" is not "denied":
   * the desktop build refused a user with every right because its dialog had no
   * menu id yet during construction, so while the menu is loading the screen
   * renders read-only rather than locked, and the server stays the authority.
   */
  const canWrite = !permissionsLoading && permissions.canEdit;
  const canCreate = !permissionsLoading && permissions.canCreate;

  const api = useOpeningDraft(scope, canWrite);
  const { draft, totals, busy } = api;

  const ledgerUiTableId = useUiTableId("openingBalanceLedgers");
  const billUiTableId = useUiTableId("openingBalanceBills");
  const { data: ledgerLayout } = useGetQuotationGridLayoutQuery(
    { uiTableId: ledgerUiTableId },
    { skip: !ledgerUiTableId },
  );
  const { data: billLayout } = useGetQuotationGridLayoutQuery(
    { uiTableId: billUiTableId },
    { skip: !billUiTableId },
  );
  const ledgerColumns = useMemo(() => resolveLedgerColumns(ledgerLayout), [ledgerLayout]);
  const billColumns = useMemo(() => resolveBillColumns(billLayout), [billLayout]);

  /*
   * A drag is LOCAL until "save column width" commits it: these rows are the
   * layout every operator of this screen renders from, so widening a column for
   * yourself must not silently re-lay-out the grid for everyone. The dialog is
   * likewise a draft until Save.
   *
   * Both hooks run whether or not the breakup panel is mounted — a hook that
   * appears with the panel would change the hook order the render after a
   * bill-wise row is selected.
   */
  /**
   * These grids stop Enter at every editable cell, so the Focus flag decides
   * only where the caret lands on entering a row — see `components/grid-focus.ts`.
   * The dialog has to say that, or it invites an operator to tick boxes that
   * change nothing.
   */
  const FOCUS_NOTE =
    "Focus is where the caret lands when Enter or an arrow key steps into a row; Enter itself stops at every editable cell.";
  const ledgerResize = useColumnResize(ledgerColumns, ledgerUiTableId);
  const billResize = useColumnResize(billColumns, billUiTableId);
  const ledgerSettings = useGridSettings({
    label: "Ledgers",
    uiTableId: ledgerUiTableId,
    // Every configured column, hidden ones included — the dialog is where a
    // hidden one (Remarks, on the reference layout) is brought back.
    columns: ledgerResize.columns,
    pendingWidthCount: ledgerResize.pendingCount,
    savingWidths: ledgerResize.saving,
    onSaveWidths: ledgerResize.saveWidths,
    focusNote: FOCUS_NOTE,
  });
  const billSettings = useGridSettings({
    label: "Bill-wise breakup",
    uiTableId: billUiTableId,
    columns: billResize.columns,
    pendingWidthCount: billResize.pendingCount,
    savingWidths: billResize.saving,
    onSaveWidths: billResize.saveWidths,
    focusNote: FOCUS_NOTE,
  });

  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const agreement = useMemo(
    () => computeAgreement(totals, draft.server, draft.dirty),
    [totals, draft.server, draft.dirty],
  );

  const usedLedgerIds = useMemo(
    () => draft.rows.filter((row) => row.ledId !== "").map((row) => row.ledId),
    [draft.rows],
  );

  const currentRow = useMemo(
    () => draft.rows.find((row) => row.ledId === draft.currentParty) ?? null,
    [draft.rows, draft.currentParty],
  );

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


  // ── Handlers ──────────────────────────────────────────────────────────────
  const onRemoveRow = useCallback(
    (rowKey: string) => {
      const row = draft.rows.find((candidate) => candidate.key === rowKey);
      if (!row || isBlankLedgerRow(row)) {
        return;
      }
      // Every removal asks. It is one keystroke, and the row may hold a figure
      // somebody spent the morning agreeing.
      setConfirm({
        title: `Remove "${row.ledName}"?`,
        message: row.opId
          ? `"${row.ledName}" has a SAVED opening of ${formatSigned(row.amount, row.drCr)}.`
          : `"${row.ledName}" has no saved opening yet.`,
        note: row.opId
          ? "Removing the row and saving DELETES it from the server."
          : "Nothing on the server changes until you save.",
        confirmLabel: "Remove",
        iconVariant: "delete",
        run: () => api.removeRow(rowKey),
      });
    },
    [api, draft.rows],
  );

  const onRemoveBill = useCallback(
    (rowKey: string) => {
      const partyId = draft.currentParty;
      if (!partyId) {
        return;
      }
      const bill = (draft.billsByParty[partyId] ?? []).find(
        (candidate) => candidate.key === rowKey,
      );
      if (!bill) {
        return;
      }
      if (bill.isFrozen) {
        // The reducer refuses it too; asking first would be a dialog whose only
        // possible outcome is a refusal.
        api.removeBill(partyId, rowKey);
        return;
      }
      setConfirm({
        title: `Remove "${bill.docRefno || "this bill"}"?`,
        message: `${formatMoney(bill.amount)} ${bill.drCr} drops out of this party's opening.`,
        confirmLabel: "Remove",
        iconVariant: "delete",
        run: () => api.removeBill(partyId, rowKey),
      });
    },
    [api, draft.billsByParty, draft.currentParty],
  );

  const onModeChange = useCallback(
    (next: ScopeMode) => {
      if (next === effectiveMode) {
        return;
      }
      if (draft.dirty) {
        setConfirm({
          title: `Switch to "${SCOPE_LABELS[next]}"?`,
          message:
            "That is a different set of rows, not a filter over this one. Unsaved changes here, and every breakup loaded so far, are discarded.",
          confirmLabel: "Switch",
          iconVariant: "replace",
          run: () => setMode(next),
        });
        return;
      }
      setMode(next);
    },
    [draft.dirty, effectiveMode],
  );

  const onCarryForward = useCallback(() => {
    if (draft.dirty) {
      // Refused rather than asked: the reload that follows a carry forward would
      // overwrite what is on screen, and there is no answer to that question
      // that keeps the work.
      toast.warn(
        "Save or reload first — a carry forward reloads the set, and would overwrite the unsaved changes on this screen.",
      );
      return;
    }
    const fromAccYear = previousAccYear(accYear);
    if (!fromAccYear) {
      toast.error(
        `"${accYear}" is not an accounting year this server can read (YYYY-YYYY, second half = first + 1), so there is no year to carry from.`,
      );
      return;
    }
    setConfirm({
      title: `Carry forward from ${fromAccYear}?`,
      // The rule goes IN the dialog. This is the one action on the screen that
      // writes rows the operator did not type.
      message: [
        `Every balance-sheet closing of ${fromAccYear} becomes an opening of ${accYear}.`,
        "The year's profit or loss goes to the RETAINED_EARNINGS ledger.",
        "Every still-open bill of a bill-wise party is carried as an OPENING bill — without which every debtor's ageing would restart from scratch.",
        "MANUAL and MIGRATION rows are left exactly as they are.",
        `Scope: ${effectiveMode === "branch" ? branchName || "this branch" : "the company-level set"}.`,
      ].join(" "),
      confirmLabel: "Carry forward",
      iconVariant: "replace",
      run: () => void api.carryForward(),
    });
  }, [accYear, api, branchName, draft.dirty, effectiveMode]);

  /** Esc with no breakup open: leave, asking first when there is work to lose. */
  const requestLeave = useCallback(() => {
    if (!draft.dirty) {
      router.back();
      return;
    }
    setConfirm({
      title: "Leave this opening set?",
      message: "The changes on this screen have not been saved, and leaving discards them.",
      confirmLabel: "Leave",
      iconVariant: "replace",
      run: () => router.back(),
    });
  }, [draft.dirty, router]);

  /** F7: re-read the set from the server, which throws the screen away. */
  const requestReload = useCallback(() => {
    if (!draft.dirty) {
      api.reload();
      return;
    }
    setConfirm({
      title: "Reload this opening set?",
      message:
        "Reloading re-reads the set from the server, and discards the unsaved changes on this screen.",
      confirmLabel: "Reload",
      iconVariant: "replace",
      run: () => api.reload(),
    });
  }, [api, draft.dirty]);

  /**
   * The screen's keys. The grids own their own (Enter goes to the next field,
   * ↑/↓ move a row, Alt+B opens a breakup, − removes a row) because those have
   * to mean different things inside a cell and outside one; everything here acts
   * on the whole set.
   *
   *   F5 · Ctrl+Enter   save
   *   F6                check against the server
   *   F7                reload — throw the screen away and re-read the set
   *   F9                carry forward
   *   F1                step between the ledger grid and the breakup panel
   *   Alt+B             open the selected row's breakup, or say why it cannot
   *   Esc               close the breakup; with none open, leave the screen
   *
   * F5 and F1 are ALWAYS prevented, keyed set on screen or not: the browser's
   * own F5 reloads the page and its F1 opens a help window over it, and an
   * operator who hit either reaching for Save would lose the morning's work.
   */
  const shortcuts = {
    save: api.save,
    requestReload,
    requestLeave,
    checkAgainstServer: api.checkAgainstServer,
    requestBreakup: api.requestBreakup,
    closePanel: api.closePanel,
    onCarryForward,
    rows: draft.rows,
    currentParty: draft.currentParty,
    dirty: draft.dirty,
    // The button is disabled without the right; the KEY has to check it too.
    canCarryForward: canCreate,
    // Anything layered over the screen owns the keys first.
    modalOpen: pickerRow !== null || confirm !== null,
  };
  /**
   * The handler below is registered once and reads the latest values through
   * this ref, so a keystroke never acts on a stale set. Refreshed in an effect
   * rather than during render: a keypress is always handled after the paint
   * that wrote it, so there is nothing to gain from writing it earlier.
   */
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = shortcutsRef.current;
      if (current.modalOpen || event.repeat) {
        return;
      }
      /**
       * Commit whatever editor is open before acting on the set: a cell whose
       * `change` has not fired yet is work the payload would not carry. The Qt
       * screen moved focus to the grid for the same reason.
       */
      const commit = () => (document.activeElement as HTMLElement | null)?.blur();

      switch (event.key) {
        case "Escape":
          // Everything layered over the screen owns Escape first — the picker
          // and the confirmation both call preventDefault — so only a press
          // with nothing left to dismiss reaches this.
          if (event.defaultPrevented) {
            break;
          }
          event.preventDefault();
          if (current.currentParty) {
            current.closePanel();
            break;
          }
          current.requestLeave();
          break;

        case "F5":
          event.preventDefault();
          commit();
          void current.save();
          break;

        case "F6":
          event.preventDefault();
          void current.checkAgainstServer();
          break;

        case "F7":
          event.preventDefault();
          current.requestReload();
          break;

        case "F9":
          event.preventDefault();
          if (current.canCarryForward) {
            current.onCarryForward();
          }
          break;

        case "F1": {
          event.preventDefault();
          // Two panels, so the direction only matters when both are up.
          const inBills = focusedRowKey(BILL_GRID_NAME) !== null;
          if (!focusGrid(inBills ? LEDGER_GRID_NAME : BILL_GRID_NAME)) {
            focusGrid(LEDGER_GRID_NAME);
          }
          break;
        }

        case "Enter":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            commit();
            void current.save();
          }
          break;

        default:
          if (event.altKey && (event.key === "b" || event.key === "B")) {
            // The same request the grid serves, from anywhere on the screen:
            // whichever row the caret is on, or the one whose breakup is open.
            const rowKey = focusedRowKey(LEDGER_GRID_NAME);
            const row =
              current.rows.find((candidate) => candidate.key === rowKey) ??
              current.rows.find((candidate) => candidate.ledId === current.currentParty);
            if (row) {
              event.preventDefault();
              current.requestBreakup(row);
            }
          }
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** One line, because every confirmation carries what confirming it does. */
  const resolveConfirm = useCallback(() => {
    const pending = confirm;
    setConfirm(null);
    pending?.run();
  }, [confirm]);

  const onSelectRow = useCallback((row: LedgerRow) => api.selectRow(row), [api]);
  const onRepointRefused = useCallback((row: LedgerRow) => {
    toast.info(
      `"${row.ledName}" cannot be repointed at another ledger — its opening row belongs to it. Remove this row and add the other ledger instead.`,
    );
  }, []);
  const onSetBillField = useCallback(
    (rowKey: string, patch: Partial<BillRow>) => {
      if (draft.currentParty) {
        api.setBillField(draft.currentParty, rowKey, patch);
      }
    },
    [api, draft.currentParty],
  );

  const busyNow = busy !== "idle";
  const editable = canWrite && !busyNow;

  return (
    <div className={styles.page}>
      <ScopeHeader
        companyName={companyName}
        branchName={branchName}
        accYear={accYear}
        mode={effectiveMode}
        totals={totals}
        dirty={draft.dirty}
        busy={busyNow || contextLoading}
        canCarryForward={canCreate}
        onModeChange={onModeChange}
        onCarryForward={onCarryForward}
        onCheckServer={() => void api.checkAgainstServer()}
        onReload={api.reload}
      />

      {!accYear ? (
        <p className={styles.bannerWarn}>
          No fiscal year is selected. An opening belongs to one year — pick it in the header before
          keying anything.
        </p>
      ) : null}

      <Banners
        unclassified={draft.unclassified}
        rows={draft.rows}
        companyLevel={effectiveMode === "company"}
      />

      {api.problems.length > 0 ? (
        <ul className={styles.problems}>
          {api.problems.map((problem) => (
            <li key={`${problem.key}-${problem.message}`}>{problem.message}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.gridsRow}>
        <LedgerGrid
          columns={ledgerResize.columns}
          resizingKey={ledgerResize.resizingKey}
          onColumnResizeStart={ledgerResize.onResizeStart}
          onContextMenu={ledgerSettings.onContextMenu}
          rows={draft.rows}
          editable={editable}
          currentParty={draft.currentParty}
          onSelectRow={onSelectRow}
          onOpenPicker={setPickerRow}
          onSetAmount={api.setAmount}
          onSetSide={api.setSide}
          onSetRemarks={api.setRemarks}
          onRemoveRow={onRemoveRow}
          onRequestBreakup={api.requestBreakup}
          onRepointRefused={onRepointRefused}
        />

        {draft.currentParty && currentRow ? (
          <BillPanel
            columns={billResize.columns}
            resizingKey={billResize.resizingKey}
            onColumnResizeStart={billResize.onResizeStart}
            onContextMenu={billSettings.onContextMenu}
            partyName={currentRow.ledName}
            bills={draft.billsByParty[draft.currentParty]}
            editable={editable}
            loadedTie={draft.tiedByParty[draft.currentParty] ?? null}
            onSetField={onSetBillField}
            onRemoveBill={onRemoveBill}
            onClose={api.closePanel}
          />
        ) : null}
      </div>

      <footer className={styles.footer}>
        <TotalsBand totals={totals} server={draft.server} agreement={agreement} />
        <div className={styles.footerActions}>
          <KeyboardShortcutHints
            className={styles.footerHint}
            shortcuts={SCREEN_SHORTCUTS}
            dense
            ariaHidden
          />
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canWrite || busyNow}
            onClick={() => void api.save()}
          >
            {busy === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </footer>

      {/* Mounted only while open, and keyed by the row, so it starts fresh. */}
      {pickerRow !== null ? (
      <LedgerPickerModal
        key={pickerRow}
        companyId={companyId}
        usedLedgerIds={usedLedgerIds}
        onClose={() => setPickerRow(null)}
        onPick={(ledger) => {
          const rowKey = pickerRow;
          setPickerRow(null);
          if (!rowKey) {
            return;
          }
          api.pickLedger(rowKey, ledger);
          // A bill-wise party's work is in the panel, so focus goes there; an
          // ordinary ledger's is the figure.
          if (!ledger.isBillWise) {
            focusCellAfterRender(LEDGER_GRID_NAME, rowKey, "opening");
          }
        }}
      />
      ) : null}

      {ledgerSettings.overlays}
      {billSettings.overlays}

      <DeleteConfirmModal
        isOpen={confirm !== null}
        title={confirm?.title}
        message={confirm?.message}
        note={confirm?.note}
        iconVariant={confirm?.iconVariant ?? "delete"}
        confirmLabel={confirm?.confirmLabel ?? "Confirm"}
        onConfirm={resolveConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
