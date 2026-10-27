"use client";

/**
 * Godown Transfer (menu 41) and Branch Outward (menu 192) — the voucher, ONE
 * screen in two modes (the Qt `GodownTransferEntry`, `Mode::Godown` /
 * `Mode::BranchOut`). Layout and wiring only: every rule is in
 * `stock-transfer.state.ts`, the network in `use-stock-transfer-draft.ts`.
 *
 * Header, four columns (Qt 69b86a0). Godown: Voucher No · Date · From godown ·
 * To godown / Reason · Remarks. Branch Outward: Voucher No · Date · From godown ·
 * To branch / To godown · Expected on · LR no · Vehicle no / Remarks.
 *
 * Post (Ctrl+Enter) saves a DRAFT and then despatches it: a godown transfer
 * ends POSTED (the OUT and IN rows written as a pair), a branch one IN_TRANSIT.
 * Save Draft moves no stock. A posted godown transfer is reversed by Cancel; a
 * draft is deleted; a despatch is never cancelled — it is Recalled while nobody
 * has received any of it, otherwise settled short.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { formatCurrency } from "@/domain/pricing";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import type { ScreenMemoryOption } from "@/lib/use-screen-memory";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { DateField, DropdownCombo, ReadOnlyInput, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import { focusCell } from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import {
  AdjustmentItemPicker,
  type AdjustmentItemPick,
} from "@/features/stocks/stock-adjustment/components/adjustment-item-picker";
import { StockPickDialog } from "@/features/stocks/stock-adjustment/components/stock-pick-dialog";
import { qtyCell } from "@/features/stocks/stock-adjustment/stock-adjustment.format";
import { resolveLineColumns } from "../stock-transfer.columns";
import {
  BRANCH_DROPDOWN_KEY,
  CANCEL_REASONS,
  COL,
  FALLBACK_COLUMN_TITLES,
  GODOWN_DROPDOWN_KEY,
  LINE_GRID_NAME,
  LINE_GRID_UI_TABLE_KEY,
  MODE_INFO,
  type TransferMode,
} from "../stock-transfer.constants";
import { KEY_SHEET, screenKeyAction } from "../stock-transfer.keys";
import {
  auditLines,
  clientProblems,
  computeTotals,
  entryStartTarget,
  hasLines,
  isBranch,
  isEditable,
  lineNumbers,
  postConfirm,
  recallable,
  rowHasItem,
  scopeLabel,
  settleShortOpen,
  shortTotals,
  statusText,
  titleLine,
} from "../stock-transfer.state";
import type { TransferDocKey, TransferPickRow } from "../stock-transfer.types";
import { handlingProblem, validationStrip } from "../stock-transfer.validate";
import { useStockTransferDraft } from "../use-stock-transfer-draft";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { HandlingBoxes } from "./handling-boxes";
import { notify } from "./notify";
import { ReasonDialog } from "./reason-dialog";
import { TransitPanel } from "./transit-panel";
import { focusBlankLineEntry, focusLineGrid, TransferLineGrid } from "./transfer-line-grid";
import styles from "../page.module.scss";

const IDS = {
  date: "stock-transfer-date",
  from: "stock-transfer-from",
  to: "stock-transfer-to",
  branch: "stock-transfer-branch",
  reason: "stock-transfer-reason",
  remarks: "stock-transfer-remarks",
} as const;

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  RECEIVED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
  IN_TRANSIT: styles.statusTransit,
};

const GRID_NOTE =
  "Barcode: scan, or type a name and press ↓ for the item list · F12 pick from stock · + / − add or remove a line · F1 lists the keys";

const money = (value: number) => formatCurrency(Number.isFinite(value) ? value : 0, 2, true);

/** Commit the cell being typed in before anything reads the lines. */
function commitOpenEditor() {
  const active = document.activeElement as HTMLElement | null;
  if (active && active.closest(`[data-quotation-grid="${LINE_GRID_NAME}"], table`)) {
    active.blur();
  }
}

type ItemPickerState = { key: string; query: string; origin: number };

/** What the Cancel button does for this document, if anything (Qt `applyStatus`). */
type CancelKind = "none" | "reverse" | "recall";

export type StockTransferEntryViewProps = {
  mode: TransferMode;
  initialDocument?: TransferDocKey;
  initialMode?: "browse" | "entry";
  /** `stock.auto_batch_no` — a scanned code that is no item barcode may be a batch label. */
  autoBatchNo?: boolean;
  onBackToList: () => void;
  memory?: ScreenMemoryOption;
};

export function StockTransferEntryView({
  mode,
  initialDocument,
  initialMode = "browse",
  autoBatchNo = false,
  onBackToList,
  memory,
}: StockTransferEntryViewProps) {
  const info = MODE_INFO[mode];
  const branchMode = mode === "branch";
  const api = useStockTransferDraft({ mode, memory, autoBatchNo });
  const { draft } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const { activeCompany, activeBranch } = useBusinessContext();

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [reasonAsk, setReasonAsk] = useState<null | "cancel" | "recall" | "settle">(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const activeKey = useRef<string | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(LINE_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const loadShown = draft.handling.loadEnabled;
  const unloadShown = !branchMode && draft.handling.unloadEnabled;
  const columns = useMemo(
    () => resolveLineColumns(layout, { loadEnabled: loadShown, unloadEnabled: unloadShown }),
    [layout, loadShown, unloadShown],
  );
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Transfer lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule: Barcode and Item on a blank line, then Qty, Free and the rates the ticked boxes show. Which columns show follows the Loading / Unloading boxes.",
  });
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const branchDropdownId = useDropdownId(BRANCH_DROPDOWN_KEY);

  // ---------------------------------------------------- what the lines say
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const lineNos = useMemo(() => lineNumbers(draft), [draft]);
  const local = useMemo(() => clientProblems(draft), [draft]);
  const strip = useMemo(
    () => validationStrip(local, draft.serverProblems, lineNos, draft.headerProblems),
    [draft.headerProblems, draft.serverProblems, lineNos, local],
  );
  const problemKeys = useMemo(() => new Set(strip?.problems.keys() ?? []), [strip]);
  const problemText = useMemo(() => strip?.problems ?? new Map<string, string>(), [strip]);

  const editable = isEditable(draft);
  const draftStatus = draft.status === "DRAFT";
  const saved = Boolean(draft.svhId);
  const working = api.busy !== null;
  const cancelKind: CancelKind = recallable(draft) && branchMode ? "recall" : draft.status === "POSTED" && !branchMode ? "reverse" : "none";
  const canSave = draftStatus && rights.mayPost;
  const canSaveDraft = draftStatus && rights.maySaveDraft(saved);
  const canDeleteDraft = draftStatus && saved && rights.mayDeleteDraft;
  const canCancel = saved && cancelKind !== "none" && rights.mayCancelDocument(true);
  const canEdit = draftStatus && saved && rights.mayEdit;
  const canSettle = settleShortOpen(draft);

  // The godown dropdown lists every branch's godowns unless narrowed: a godown
  // transfer stays inside this branch; Branch Outward's To godown is the
  // RECEIVING branch's.
  const fromParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);
  const toParams = useMemo(
    () => ({ ibranch_id: branchMode ? draft.toBranchId : draft.branchId }),
    [branchMode, draft.branchId, draft.toBranchId],
  );
  const branchParams = useMemo(() => ({ ibr_comp_id: draft.companyId }), [draft.companyId]);

  const reasonOptions = useMemo(() => {
    const options = [{ value: "", label: "— none —" }];
    for (const reason of api.reasons) {
      options.push({ value: reason.srmId, label: reason.name });
    }
    if (draft.extraReason && !options.some((option) => option.value === draft.extraReason?.id)) {
      options.push({ value: draft.extraReason.id, label: draft.extraReason.name });
    }
    return options;
  }, [api.reasons, draft.extraReason]);

  // ---------------------------------------------------------- open a doc
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument?.svhId ?? " new";
    if (opened.current === target) {
      return;
    }
    opened.current = target;
    if (memory?.resume && api.resumed) {
      void api.finishResume();
      return;
    }
    if (initialDocument) {
      void api.load(initialDocument, initialMode === "entry").then((loaded) => {
        if (loaded) {
          api.focusEntryStart();
        }
      });
    } else {
      api.focusEntryStart();
    }
  }, [api, initialDocument, initialMode, memory?.resume]);

  // ------------------------------------------------------- focus requests
  useEffect(() => {
    const request = api.focusRequest;
    if (!request) {
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        const byId = (id: string) => document.getElementById(id)?.focus();
        switch (request.target) {
          case "cell":
            if (!focusCell(LINE_GRID_NAME, request.key, String(request.column))) {
              focusCell(LINE_GRID_NAME, request.key, String(COL.Description));
            }
            return;
          case "entryStart": {
            const start = entryStartTarget(api.draftRef.current);
            if (start.target === "cell") {
              focusBlankLineEntry(start.key, start.column);
            } else if (start.target === "grid") {
              focusLineGrid();
            } else {
              byId(IDS[start.target === "fromGodown" ? "from" : start.target === "toBranch" ? "branch" : "to"]);
            }
            return;
          }
          case "fromGodown":
            byId(IDS.from);
            return;
          case "toGodown":
            byId(IDS.to);
            return;
          case "toBranch":
            byId(IDS.branch);
            return;
          default:
            byId(IDS.date);
        }
      }, 0),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [api.draftRef, api.focusRequest]);

  // ---------------------------------------------------------------- guards
  const ask = useCallback((request: ConfirmRequest) => setConfirm(request), []);

  const guardDirty = useCallback(
    (title: string, message: string, then: () => void) => {
      if (api.draftRef.current.dirty) {
        ask({ title, message, onConfirm: then });
        return;
      }
      then();
    },
    [api.draftRef, ask],
  );

  // ------------------------------------------------------------ the header
  const onFromGodown = useCallback(
    (id: string, name: string) => {
      const current = api.draftRef.current;
      if (id === current.fromGodownId) {
        return;
      }
      if (!branchMode && id === current.toGodownId) {
        notify("warn", "Same godown", `${name} cannot transfer to itself — pick a different From godown.`);
        return;
      }
      // Every line was picked from the From godown's stock.
      if (hasLines(current)) {
        ask({
          title: "Change From godown",
          message: `Every line was picked from ${current.fromGodownName}'s stock. Changing the From godown clears the lines. Continue?`,
          onConfirm: () => api.setFromGodown(id, name),
        });
        return;
      }
      api.setFromGodown(id, name);
    },
    [api, ask, branchMode],
  );

  const onToGodown = useCallback(
    (id: string, name: string) => {
      const current = api.draftRef.current;
      if (id === current.toGodownId) {
        return;
      }
      if (!branchMode && id === current.fromGodownId) {
        notify("warn", "Same godown", `${name} cannot transfer to itself — pick a different To godown.`);
        return;
      }
      api.setToGodown(id, name);
    },
    [api, branchMode],
  );

  const onToBranch = useCallback(
    (id: string, name: string) => {
      const current = api.draftRef.current;
      if (id === current.toBranchId) {
        return;
      }
      if (id === current.branchId) {
        notify("warn", "Same branch", `${name} is this branch — moving stock inside it is a Godown Transfer.`);
        return;
      }
      api.setToBranch(id, name);
    },
    [api],
  );

  // ------------------------------------------------------------ the lines
  const openItemPicker = useCallback(
    (key: string, query: string) => {
      if (!isEditable(api.draftRef.current) || !api.needGodowns()) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query, origin: COL.Description });
    },
    [api],
  );

  /** ↓ in a blank line's Barcode: the item list, searched for what was typed. */
  const searchItemsFromBarcode = useCallback(
    (key: string, typed: string) => {
      const current = api.draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!isEditable(current) || !line || rowHasItem(line) || !api.needGodowns()) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query: typed.replace(/\s+/g, " ").trim(), origin: COL.Barcode });
    },
    [api],
  );

  const closeItemPicker = useCallback(() => {
    const target = itemPicker;
    setItemPicker(null);
    if (target) {
      window.requestAnimationFrame(() =>
        window.setTimeout(() => focusBlankLineEntry(target.key, target.origin), 0),
      );
    }
  }, [itemPicker]);

  const onPickItem = useCallback(
    (picked: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        void api.pickItem(target.key, { itemId: picked.itemId, itemName: picked.itemName });
      }
    },
    [api, itemPicker],
  );

  const onPickerBarcode = useCallback(
    async (code: string) => {
      const target = itemPicker;
      if (!target) {
        return false;
      }
      const resolved = await api.resolveBarcode(target.key, code);
      if (resolved) {
        setItemPicker(null);
      }
      return resolved;
    },
    [api, itemPicker],
  );

  /** Queued, never run inside the cell's own commit: the resolve can rewrite the very line being committed. */
  const onScanBarcode = useCallback(
    (key: string, code: string) => {
      window.setTimeout(() => void api.resolveBarcode(key, code), 0);
    },
    [api],
  );

  const onRemoveLine = useCallback(
    (key: string) => {
      const line = api.draftRef.current.lines.find((candidate) => candidate.key === key);
      if (!line || !rowHasItem(line) || !isEditable(api.draftRef.current)) {
        return;
      }
      ask({
        title: "Remove line",
        message: `Remove "${line.itemName}" from this transfer?`,
        onConfirm: () => api.deleteLine(key),
      });
    },
    [api, ask],
  );

  const runPick = useCallback(() => {
    const current = api.draftRef.current;
    const key =
      activeKey.current && current.lines.some((line) => line.key === activeKey.current)
        ? activeKey.current
        : current.lines[current.lines.length - 1]?.key ?? null;
    api.openPick(key);
  }, [api]);

  // ------------------------------------------------------------ actions
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy) {
        return;
      }
      commitOpenEditor();
      // The commit above lands synchronously in the draft ref; read it now.
      window.setTimeout(() => {
        const current = api.draftRef.current;
        if (current.viewMode === "browse") {
          void api.save(post);
          return;
        }
        if (!api.gate()) {
          return;
        }
        if (!post) {
          void api.save(false);
          return;
        }
        const confirmation = postConfirm(current);
        ask({
          title: confirmation.title,
          message: confirmation.message,
          onConfirm: () => void api.save(true),
        });
      }, 0);
    },
    [api, ask],
  );

  /** Cancel (Alt+X): reverse a POSTED godown transfer, or recall an untouched despatch. */
  const runCancel = useCallback(() => {
    const current = api.draftRef.current;
    if (!current.svhId) {
      notify("warn", "Nothing to cancel", "This transfer has not been saved, so there is nothing to cancel.");
      return;
    }
    if (isBranch(current) && recallable(current)) {
      setReasonAsk("recall");
      return;
    }
    if (isBranch(current) && (current.status === "IN_TRANSIT" || current.status === "RECEIVED")) {
      notify(
        "warn",
        "Cannot cancel a despatch",
        `${current.refno} has left. Goods that left cannot be cancelled on paper — let ${current.toBranchName} receive them and transfer them back, or settle short what never arrives.`,
      );
      return;
    }
    if (current.status !== "POSTED") {
      notify("warn", "Not posted", `${current.refno} is ${current.status}.`);
      return;
    }
    setReasonAsk("cancel");
  }, [api.draftRef]);

  const onReason = useCallback(
    (reason: string) => {
      const kind = reasonAsk;
      setReasonAsk(null);
      const current = api.draftRef.current;
      if (kind === "settle") {
        void api.settleShort(reason);
        return;
      }
      if (kind === "recall") {
        ask({
          title: `Recall ${current.refno}?`,
          message: `Nothing has been received at ${current.toBranchName}. The stock comes back into ${current.fromGodownName} and the loading charge is reversed.`,
          onConfirm: () => void api.recallDespatch(reason),
        });
        return;
      }
      ask({
        title: `Cancel ${current.refno}?`,
        message: `The stock goes back from ${current.toGodownName} to ${current.fromGodownName} — a mirror row for each row the transfer wrote. Nothing is deleted.\n\nIt is refused if the stock has since left ${current.fromGodownName === current.toGodownName ? "the To godown" : current.toGodownName}.`,
        onConfirm: () => void api.cancelDocument(reason),
      });
    },
    [api, ask, reasonAsk],
  );

  const runDelete = useCallback(() => {
    const current = api.draftRef.current;
    if (!current.svhId || current.status !== "DRAFT") {
      notify("info", "Delete draft", "Only a saved DRAFT can be deleted. A posted transfer is cancelled.");
      return;
    }
    ask({
      title: `Delete ${current.refno}?`,
      message: "The draft moved no stock. Delete it?",
      onConfirm: () => void api.deleteDraft(),
    });
  }, [api, ask]);

  const runNew = useCallback(() => {
    guardDirty("Discard entry", "This transfer has unsaved changes. Start a new one anyway?", () => api.newDocument());
  }, [api, guardDirty]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      api.focusEntryStart();
    }
  }, [api]);

  const runList = useCallback(() => {
    guardDirty("Open another", "This transfer has unsaved changes. Discard it and open another?", () => {
      api.forgetRemembered();
      onBackToList();
    });
  }, [api, guardDirty, onBackToList]);

  const runClose = useCallback(() => {
    guardDirty("Discard entry", "This transfer has unsaved changes. Close it anyway?", () => {
      api.forgetRemembered();
      onBackToList();
    });
  }, [api, guardDirty, onBackToList]);

  const runStep = useCallback(
    (previous: boolean) => {
      const current = api.draftRef.current;
      if (!current.svhId && !previous) {
        api.setNotice("A new document is the newest — nothing comes after it.");
        return;
      }
      guardDirty("Open another", "This transfer has unsaved changes. Discard it and open another?", () => {
        void api.stepDocument(previous);
      });
    },
    [api, guardDirty],
  );

  const openHistory = useCallback(() => {
    if (!draft.svhId) {
      return;
    }
    setHistoryTarget({ docId: draft.svhId, companyId: draft.companyId, accYear: draft.accYear, refNo: draft.refno });
  }, [draft.accYear, draft.companyId, draft.refno, draft.svhId]);

  // ------------------------------------------------------------ shortcuts
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canSave ? () => runSave(true) : null,
      edit: !working && canEdit && draft.viewMode === "browse" ? runEdit : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      history: saved ? openHistory : null,
      open: !working ? runList : null,
      close: !working ? runClose : null,
      previous: !working ? () => runStep(true) : null,
      next: !working ? () => runStep(false) : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !gridSettings.active },
  );

  const overlayOpen =
    itemPicker !== null ||
    confirm !== null ||
    reasonAsk !== null ||
    api.pick !== null ||
    keysOpen ||
    historyTarget !== null ||
    gridSettings.active;
  const keysRef = useRef({ overlayOpen, editable, runPick });
  useLayoutEffect(() => {
    keysRef.current = { overlayOpen, editable, runPick };
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const current = keysRef.current;
      const { action, swallow } = screenKeyAction(event, {
        overlayOpen: current.overlayOpen,
        editable: current.editable,
      });
      if (swallow) {
        event.preventDefault();
      }
      if (action === "pick") {
        current.runPick();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  /** Enter and Tab walk the header in the Qt tab order, and the last field hands over to the grid. */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const isTab = event.key === "Tab";
    if ((event.key !== "Enter" && !isTab) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!isTab && target?.getAttribute("aria-expanded") === "true") {
      return; // Enter picks from the open list
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && editable) {
      const line = draft.lines.find((candidate) => !rowHasItem(candidate)) ?? draft.lines[draft.lines.length - 1];
      if (line) {
        event.preventDefault();
        focusBlankLineEntry(line.key, COL.Barcode);
      }
    }
  };

  // ---------------------------------------------------------- the pick dialog
  const pickRequest = api.pick;
  const audit = auditLines(draft);
  const notice = draft.notice;
  const fromSet = Boolean(draft.fromGodownId);
  const toSet = Boolean(draft.toGodownId);
  const branchSet = Boolean(draft.toBranchId);
  const short = shortTotals(draft.transit);
  const at = (row: number, column: number, span = 1) => ({
    gridRow: row,
    gridColumn: span > 1 ? `${column} / span ${span}` : String(column),
  });

  const fromField = (
    <div className={styles.pair} style={at(1, 3)} data-tone={fromSet ? "set" : "missing"}>
      <DropdownCombo
        id={IDS.from}
        label="From godown"
        dropdownId={godownDropdownId}
        valueKey="gdl_id"
        labelKey="gdl_name"
        value={draft.fromGodownId}
        selectedLabel={draft.fromGodownName}
        disabled={!editable}
        required
        params={fromParams}
        placeholder="Where the stock is now"
        onSelect={onFromGodown}
      />
    </div>
  );
  const toGodownField = (
    <div className={styles.pair} style={branchMode ? at(2, 1) : at(1, 4)} data-tone={toSet ? "set" : "missing"}>
      <DropdownCombo
        id={IDS.to}
        label="To godown"
        dropdownId={godownDropdownId}
        valueKey="gdl_id"
        labelKey="gdl_name"
        value={draft.toGodownId}
        selectedLabel={draft.toGodownName}
        disabled={!editable || (branchMode && !branchSet)}
        required
        params={toParams}
        placeholder={branchMode ? "A godown of the receiving branch" : "Where the stock goes"}
        onSelect={onToGodown}
      />
    </div>
  );

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={runClose}>
              ‹ {info.listTitle}
            </button>
            <h1 className={quotationStyles.title}>{info.title}</h1>
          </div>
          <span className={styles.docTitle}>{titleLine(draft)}</span>
          <span className={styles.scope} title="The company and branch this document belongs to.">
            {scopeLabel(draft, activeCompany?.name ?? "", activeBranch?.name ?? "")}
          </span>
          <div className={styles.statusLine}>
            <span
              className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)}
              title="DRAFT, POSTED or CANCELLED (IN TRANSIT and RECEIVED on a branch despatch)."
            >
              {statusText(draft.status)}
            </span>
            {draft.viewMode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.scope}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
          </div>
          <div className={styles.audit} title="Who created this document and when — and, once posted, who posted it">
            {audit.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {notice ? (
              <span className={styles.notice} role="status">
                {notice}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── the header: four columns, in tab order ──────────────────── */}
        <div className={styles.headerCard} onKeyDown={onHeaderKeyDown}>
          <div className={styles.pair} style={at(1, 1)}>
            <ReadOnlyInput id="stock-transfer-docno" label="Voucher No" value={draft.refno} placeholder="given on save" />
          </div>
          <div className={styles.pair} style={at(1, 2)}>
            <DateField
              id={IDS.date}
              label="Date"
              value={draft.docDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ docDate: value })}
            />
          </div>
          {branchMode ? null : (
            <div className={styles.pair} style={at(2, 1)}>
              <SelectField
                id={IDS.reason}
                label="Reason"
                value={draft.reasonId}
                options={reasonOptions}
                disabled={!editable || reasonOptions.length <= 1}
                title={
                  reasonOptions.length <= 1
                    ? "No transfer reasons are set up yet."
                    : "Optional on a transfer — why the stock is being moved."
                }
                onChange={(value) => api.setHeader({ reasonId: value })}
              />
            </div>
          )}
          {fromField}
          {branchMode ? (
            <div className={styles.pair} style={at(1, 4)} data-tone={branchSet ? "set" : "missing"}>
              <DropdownCombo
                id={IDS.branch}
                label="To branch"
                dropdownId={branchDropdownId}
                valueKey="br_id"
                labelKey="br_name"
                value={draft.toBranchId}
                selectedLabel={draft.toBranchName}
                disabled={!editable}
                required
                params={branchParams}
                placeholder="The receiving branch"
                onSelect={onToBranch}
              />
            </div>
          ) : null}
          {toGodownField}
          {branchMode ? (
            <>
              <div className={styles.pair} style={at(2, 2)}>
                <DateField
                  id="stock-transfer-expected"
                  label="Expected on"
                  value={draft.expectedOn}
                  disabled={!editable}
                  onChange={(value) => api.setHeader({ expectedOn: value })}
                />
              </div>
              <div className={styles.pair} style={at(2, 3)}>
                <TextField
                  id="stock-transfer-lr"
                  label="LR no"
                  value={draft.lrNo}
                  disabled={!editable}
                  maxLength={50}
                  title="Lorry receipt number."
                  onChange={(value) => api.setHeader({ lrNo: value })}
                />
              </div>
              <div className={styles.pair} style={at(2, 4)}>
                <TextField
                  id="stock-transfer-vehicle-header"
                  label="Vehicle no"
                  value={draft.handling.vehicleNo}
                  disabled={!editable}
                  maxLength={30}
                  onChange={(value) => api.setHandling({ vehicleNo: value.toUpperCase() })}
                />
              </div>
            </>
          ) : null}
          <div className={styles.pair} style={branchMode ? at(3, 1, 4) : at(2, 2, 3)}>
            <TextField
              id={IDS.remarks}
              label="Remarks"
              value={draft.remarks}
              disabled={!editable}
              maxLength={250}
              title="svh_remarks — describes the document."
              onChange={(value) => api.setHeader({ remarks: value })}
            />
          </div>
        </div>
      </div>

      <p className={styles.shapeNote}>{info.shapeNote}</p>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Lines</span>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={!editable || working}
            title="Every line is a holding picked from the From godown's stock."
            onClick={runPick}
          >
            Pick from stock · F12
          </button>
          <span className={quotationStyles.modalNote}>{GRID_NOTE}</span>
        </div>
        {gridSettings.overlays}
        <TransferLineGrid
          draft={draft}
          columns={columns}
          lineNos={lineNos}
          problemKeys={problemKeys}
          problemText={problemText}
          editable={editable}
          onContextMenu={gridSettings.onContextMenu}
          onActiveRow={(key) => {
            activeKey.current = key;
          }}
          onEdit={api.editLine}
          onOpenItemPicker={openItemPicker}
          onScanBarcode={onScanBarcode}
          onSearchItems={searchItemsFromBarcode}
          onOpenPick={(key) => api.openPick(key)}
          onRefused={api.setHint}
          onInsertLine={api.insertLine}
          onRemoveLine={onRemoveLine}
        />
      </section>

      {branchMode ? (
        <TransitPanel rows={draft.transit} canSettle={canSettle} busy={working} onSettle={() => setReasonAsk("settle")} />
      ) : null}

      <div className={cx(styles.bottomRow, branchMode && styles.bottomRowBranch)}>
        <HandlingBoxes
          handling={draft.handling}
          branchId={draft.branchId}
          branchMode={branchMode}
          editable={editable}
          loadCharge={totals.loadCharge}
          unloadCharge={totals.unloadCharge}
          loadProblem={handlingProblem(draft.headerProblems, "load")}
          unloadProblem={handlingProblem(draft.headerProblems, "unload")}
          onChange={api.setHandling}
        />
        <dl className={cx(styles.card, styles.totals)} aria-label="Totals">
          <dt>Lines</dt>
          <dd>{totals.lines}</dd>
          <dt>Qty</dt>
          <dd>{totals.qty.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</dd>
          <dt>Value</dt>
          <dd>{money(totals.value)}</dd>
          <dt>{branchMode ? "Loading" : "Charges"}</dt>
          <dd>{money(totals.loadCharge + totals.unloadCharge)}</dd>
        </dl>
      </div>

      {strip ? <p className={styles.validation}>{strip.text}</p> : null}
      <p className={styles.hintLine}>{draft.hint}</p>

      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>F1 · keys on this screen · Alt+PgUp / Alt+PgDn previous / next transfer</span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          title="Start a new document."
          onClick={runNew}
        >
          {withKey("New", "new")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Save without moving stock."
          disabled={!canSaveDraft || working}
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title={
            branchMode
              ? "Saves, then sends the stock: out of the From godown and into transit to the other branch."
              : "Saves, then moves the stock: out of From and into To in one transaction."
          }
          disabled={!canSave || working}
          onClick={() => runSave(true)}
        >
          {api.busy === "posting" ? "Posting…" : withKey(info.postLabel, "post")}
        </button>
        {draftStatus && saved ? (
          <button
            type="button"
            className={quotationStyles.button}
            title="Delete this DRAFT. A posted transfer is cancelled, never deleted."
            disabled={!canDeleteDraft || working}
            onClick={runDelete}
          >
            Delete Draft
          </button>
        ) : null}
        {cancelKind !== "none" ? (
          <button
            type="button"
            className={quotationStyles.button}
            title={
              cancelKind === "recall"
                ? `Recall the despatch: the stock comes back into ${draft.fromGodownName}.`
                : "Reverse a POSTED transfer: the stock goes back to the From godown."
            }
            disabled={!canCancel || working}
            onClick={runCancel}
          >
            {withKey("Cancel", "cancelDoc")}
          </button>
        ) : null}
        {draftStatus && saved && draft.viewMode === "browse" ? (
          <button
            type="button"
            className={quotationStyles.button}
            title="Edit this DRAFT."
            disabled={!canEdit || working}
            onClick={runEdit}
          >
            {withKey("Edit", "edit")}
          </button>
        ) : null}
        <button
          type="button"
          className={quotationStyles.button}
          title="Every step of this document — who saved, posted or cancelled it, when, and why."
          disabled={!saved}
          onClick={openHistory}
        >
          {withKey("History", "history")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={runList}>
          {withKey("Show List", "open")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={runClose}>
          {withKey("Close", "close")}
        </button>
      </div>

      <AdjustmentItemPicker
        isOpen={itemPicker !== null}
        initialQuery={itemPicker?.query ?? ""}
        companyId={draft.companyId}
        branchId={draft.branchId}
        onClose={closeItemPicker}
        onPick={onPickItem}
        onBarcode={onPickerBarcode}
      />
      <StockPickDialog
        isOpen={pickRequest !== null}
        companyId={draft.companyId}
        branchId={draft.branchId}
        godownId={draft.fromGodownId}
        godownName={draft.fromGodownName}
        item={pickRequest?.item ?? null}
        groupBySupplier={false}
        expiredBy={null}
        initialSearch={pickRequest?.search ?? ""}
        onClose={api.closePick}
        onPick={(row) => {
          const key = pickRequest?.key;
          api.closePick();
          if (key) {
            api.takeHolding(key, row as TransferPickRow);
          }
        }}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <ReasonDialog
        isOpen={reasonAsk !== null}
        title={
          reasonAsk === "settle"
            ? `Settle ${draft.refno} short`
            : reasonAsk === "recall"
              ? `Recall ${draft.refno}`
              : `Cancel ${draft.refno}`
        }
        prompt={
          reasonAsk === "settle"
            ? `${qtyCell(short.qty)} still short (${money(short.value)} at cost). It will never arrive: the transfer closes, the short stays on the loss report and is written off. What happened?`
            : reasonAsk === "recall"
              ? "Why is this despatch being recalled?"
              : "Why is this transfer being reversed?"
        }
        placeholder={reasonAsk === "settle" ? "e.g. one bag stolen on the way" : "Type the reason"}
        presets={reasonAsk === "settle" ? [] : CANCEL_REASONS}
        onClose={() => setReasonAsk(null)}
        onSubmit={onReason}
      />
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel={info.historyLabel} onClose={() => setHistoryTarget(null)} />
    </div>
  );
}
