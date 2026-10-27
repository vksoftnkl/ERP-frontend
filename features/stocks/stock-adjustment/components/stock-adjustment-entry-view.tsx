"use client";

/**
 * Stock Adjustment — the voucher (the Qt `StockAdjustmentEntry`, menu 264).
 * ONE screen for six kinds, picked by the Type selector. Layout and wiring
 * only: every rule is in `stock-adjustment.state.ts` / `.validate.ts`, the
 * network in `use-stock-adjustment-draft.ts`.
 *
 * Save & Post (Ctrl+Enter) saves AND posts in one server transaction; nothing
 * posts unless every line passes. Save Draft keeps a DRAFT. The server runs the
 * same adjustment rules at both, so a refused line comes back naming
 * "lines.<n>" and is tinted on the grid.
 *
 * ── Layout (Qt .ui, 2026-10-24 — "as on Opening Stock") ──────────────────
 * The title block on the LEFT — name, what this document is, its scope
 * (godown · year), the status pill, who created / posted it and the latest
 * notice — and the document's details on the RIGHT in a card: Doc No · Date ·
 * Rate Source on the first row, Default Reason · Your Ref No · Remarks on the
 * second, and the godown in its own highlighted box across both (red until
 * chosen: no line is keyed before it). The Type selector stays below the band.
 * Enter and Tab follow the Qt tab order: Date, Rate Source, Godown, Default
 * Reason, Your Ref No, Remarks, then the grid.
 *
 * ── Keys: the shared transaction set (`lib/txn-keys`), as Opening Stock ──
 * Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Save & Post (it still asks), F2
 * Edit, Alt+X Cancel, Ctrl+H History, Ctrl+O Show List, Esc Close, Alt+PgUp /
 * Alt+PgDn the previous / next document, F1 the key sheet. A key runs only what
 * its button may. Pick from stock moved from F2 to F12 (`stock-adjustment.keys`).
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
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import type { ScreenMemoryOption } from "@/lib/use-screen-memory";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import {
  DateField,
  DropdownCombo,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import { focusCell } from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import { addDays, isRealDate, todayIso } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { resolveLineColumns } from "../stock-adjustment.columns";
import {
  COL,
  FALLBACK_COLUMN_TITLES,
  GODOWN_DROPDOWN_KEY,
  KIND_BUTTONS,
  kindName,
  kindNote,
  LINE_GRID_NAME,
  LINE_GRID_UI_TABLE_KEY,
  RATE_SOURCES,
  rateSourceLabel,
  STEP_NOTICES,
  type Kind,
} from "../stock-adjustment.constants";
import {
  accountsCard,
  auditLines,
  blankLineEntryColumn,
  computeTotals,
  defaultReasonOptions,
  entryStartTarget,
  hasLines,
  isEditable,
  isInward,
  kindSelectable,
  lineNumbers,
  rateSourceEditable,
  relotBalance,
  remarksRequiredKeys,
  rowHasItem,
  rowHint,
  scopeLabel,
  titleLine,
} from "../stock-adjustment.state";
import { KEY_SHEET, kindStep, screenKeyAction } from "../stock-adjustment.keys";
import type { StockAdjustmentDocKey } from "../stock-adjustment.types";
import { GODOWN_FIRST, postConfirmMessage, validationStrip } from "../stock-adjustment.validate";
import { useStockAdjustmentDraft } from "../use-stock-adjustment-draft";
import { AdjustmentItemPicker, type AdjustmentItemPick } from "./adjustment-item-picker";
import { AdjustmentLineGrid, focusBlankLineEntry, focusLineGrid } from "./adjustment-line-grid";
import { CancelFlow, type CancelTarget } from "./cancel-flow";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { DamagedPanel } from "./damaged-panel";
import { notify } from "./notify";
import { StockPickDialog } from "./stock-pick-dialog";
import styles from "../page.module.scss";

const DOC_DATE_ID = "stock-adjustment-date";
const GODOWN_ID = "stock-adjustment-godown";

const KINDS = KIND_BUTTONS.map((button) => button.kind);

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

const GRID_NOTE =
  "Barcode: scan, or type a name and press ↓ for the item list · F12 pick from stock · + / − add or remove a line · F1 lists the keys";

/** Commit the cell being typed in before anything reads the lines — the Qt `tblLines->setFocus()`. */
function commitOpenEditor() {
  const active = document.activeElement as HTMLElement | null;
  if (active && active.closest(`[data-quotation-grid="${LINE_GRID_NAME}"], table`)) {
    active.blur();
  }
}

/** The item list is open for one line — from its Item cell, or from its Barcode (↓). */
type ItemPickerState = { key: string; query: string; origin: number };

export type StockAdjustmentEntryViewProps = {
  initialDocument?: StockAdjustmentDocKey;
  initialMode?: "browse" | "entry";
  expiryGraceDays: number;
  /** `stock.auto_batch_no` — a scanned code that is no item barcode may be a batch label. */
  autoBatchNo?: boolean;
  onBackToList: () => void;
  /**
   * Screen memory (lib/screen-memory): the page names the slot, and says whether
   * it reopened ON a remembered document — the operator coming back from another
   * screen — rather than on an explicit Create / Open.
   */
  memory?: ScreenMemoryOption;
};

export function StockAdjustmentEntryView({
  initialDocument,
  initialMode = "browse",
  expiryGraceDays,
  autoBatchNo = false,
  onBackToList,
  memory,
}: StockAdjustmentEntryViewProps) {
  const api = useStockAdjustmentDraft({ memory, autoBatchNo });
  const { draft } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const activeKey = useRef<string | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(LINE_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveLineColumns(layout, draft.kind), [draft.kind, layout]);
  // Right-click on the lines: "Admin settings" over the shared layout (ui table
  // 41). The grid sizes its columns as shares of its width, so there is no drag
  // and no "save column width".
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Adjustment lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule (as on Opening Stock): Barcode and Item on a blank line, then the cells the line can take and Qty. Which columns show is the adjustment kind's — Visible is kept with the layout, but this grid follows the kind.",
  });
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);

  // ---------------------------------------------------- what the lines say
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const strip = useMemo(() => validationStrip(draft), [draft]);
  const lineNos = useMemo(() => lineNumbers(draft), [draft]);
  const remarksRequired = useMemo(() => remarksRequiredKeys(draft), [draft]);
  const hints = useMemo(() => new Map(draft.lines.map((line) => [line.key, rowHint(draft, line)])), [draft]);
  const accounts = useMemo(() => accountsCard(draft, api.roleLedgers), [api.roleLedgers, draft]);
  const relot = useMemo(() => relotBalance(draft), [draft]);
  const problemKeys = useMemo(() => new Set(strip?.problems.keys() ?? []), [strip]);
  const problemText = useMemo(() => strip?.problems ?? new Map<string, string>(), [strip]);

  const editable = isEditable(draft);
  const draftStatus = draft.status === "DRAFT";
  const postedStatus = draft.status === "POSTED";
  const saved = Boolean(draft.svhId);
  const working = api.busy !== null;
  // Status and rights together (Qt's `applyStatus()`, document rights). Save &
  // Post is save-AND-post, so it is the Post right; the keys obey the same gates.
  const canSave = draftStatus && rights.mayPost;
  const canSaveDraft = draftStatus && rights.maySaveDraft(saved);
  const canDeleteDraft = draftStatus && saved && rights.mayDeleteDraft;
  const canCancel = saved && (draftStatus || postedStatus) && rights.mayCancelDocument(postedStatus);
  const canEdit = draftStatus && saved && rights.mayEdit;
  const godownChosen = Boolean(draft.godownId);

  // ---------------------------------------------------------- open a doc
  // Reopened on the document the operator left here (screen memory): it is
  // already on screen, so it is neither loaded nor started over.
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
      // The first show: the cursor goes where keying starts (Qt `showEvent()`)
      // — the godown, which a new document does not have yet.
      api.focusEntryStart();
    }
  }, [api, initialDocument, initialMode, memory?.resume]);

  // ------------------------------------------------------- focus requests
  // One frame for React to draw what asked, one tick for a closing dialog's
  // portal to let go of the focus.
  useEffect(() => {
    const request = api.focusRequest;
    if (!request) {
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (request.target === "cell") {
          if (!focusCell(LINE_GRID_NAME, request.key, String(request.column))) {
            focusCell(LINE_GRID_NAME, request.key, String(COL.Description));
          }
          return;
        }
        if (request.target === "entryStart") {
          const start = entryStartTarget(api.draftRef.current);
          if (start.target === "cell") {
            focusBlankLineEntry(start.key, start.column);
          } else if (start.target === "godown") {
            document.getElementById(GODOWN_ID)?.focus();
          } else {
            focusLineGrid();
          }
          return;
        }
        document.getElementById(request.target === "godown" ? GODOWN_ID : DOC_DATE_ID)?.focus();
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

  // ------------------------------------------------------------- the kind
  const requestKind = useCallback(
    (kind: Kind) => {
      const current = api.draftRef.current;
      if (kind === current.kind) {
        return;
      }
      // The kind decides the reasons, the direction and the lot rule of every
      // line, so a sheet keyed as one kind is not the same sheet as another.
      if (hasLines(current)) {
        ask({
          title: "Change type",
          message:
            `Switching from ${kindName(current.kind)} to ${kindName(kind)} clears the lines keyed so far — ` +
            "their reasons belong to the old type. Continue?",
          onConfirm: () => api.setKind(kind),
        });
        return;
      }
      api.setKind(kind);
    },
    [api, ask],
  );

  const onGodown = useCallback(
    (godownId: string, godownName: string) => {
      const current = api.draftRef.current;
      if (godownId === current.godownId) {
        return;
      }
      // One godown per document, and every picked holding belongs to it — so
      // a different godown means different lines.
      if (hasLines(current)) {
        ask({
          title: "Change godown",
          message:
            `Every line is in ${current.godownName}. Changing the godown clears the lines — ` +
            "an adjustment is about one godown. Continue?",
          onConfirm: () => api.setGodown(godownId, godownName),
        });
        return;
      }
      api.setGodown(godownId, godownName);
    },
    [api, ask],
  );

  // ------------------------------------------------------------ the lines
  /** The Item cell's list: typing or Enter on it, or a double-click. */
  const openItemPicker = useCallback(
    (key: string, query: string) => {
      if (!isEditable(api.draftRef.current)) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query, origin: COL.Description });
    },
    [api.draftRef],
  );

  /**
   * ↓ in a blank line's Barcode (Qt `openItemList`) — the item list, searched
   * for what was typed. Only on a DRAFT being keyed, and the godown first: the
   * stock is picked from it.
   */
  const searchItemsFromBarcode = useCallback(
    (key: string, typed: string) => {
      const current = api.draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!isEditable(current) || !line || rowHasItem(line)) {
        return;
      }
      if (!current.godownId) {
        api.refuse(GODOWN_FIRST);
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query: typed.replace(/\s+/g, " ").trim(), origin: COL.Barcode });
    },
    [api],
  );

  /** A cancelled list hands the cursor back to the cell it was opened from. */
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
    (pick: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        api.pickItem(target.key, pick);
      }
    },
    [api, itemPicker],
  );

  const onBarcode = useCallback(
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

  /**
   * A code committed in a blank line's Barcode. Queued, never run inside the
   * cell's own commit: the resolve can raise "Godown first" and rewrite the
   * very line being committed (the Qt crash Opening Stock had, 2026-10-23).
   * The line is named by its key, so the answer lands on it wherever it is by
   * then.
   */
  const onScanBarcode = useCallback(
    (key: string, code: string) => {
      window.setTimeout(() => void api.resolveBarcode(key, code), 0);
    },
    [api],
  );

  /**
   * onEditRefused — the batch cell of an outward line refuses typing BECAUSE
   * it is picked, so the refusal opens the picker rather than just explaining
   * itself.
   */
  const onRefused = useCallback(
    (key: string, column: number, why: string) => {
      const current = api.draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (
        (column === COL.BatchNo || column === COL.ExpiryDate) &&
        line &&
        rowHasItem(line) &&
        !isInward(current.kind, line) &&
        isEditable(current)
      ) {
        window.setTimeout(() => api.openPick(key), 0);
        return;
      }
      api.setHint(why);
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
        message: `Remove "${line.itemName}" from this document?`,
        onConfirm: () => api.deleteLine(key),
      });
    },
    [api, ask],
  );

  // ------------------------------------------------------------ actions
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy) {
        return;
      }
      commitOpenEditor();
      // The commit above lands synchronously in the draft ref; read it now.
      window.setTimeout(() => {
        if (!api.gate(post)) {
          return;
        }
        if (!post) {
          void api.save(false);
          return;
        }
        const current = api.draftRef.current;
        const sums = computeTotals(current);
        ask({
          title: "Save and post?",
          message: postConfirmMessage(current, sums.outText, sums.inText),
          onConfirm: () => void api.save(true),
        });
      }, 0);
    },
    [api, ask],
  );

  const runValidate = useCallback(() => {
    if (api.busy) {
      return;
    }
    commitOpenEditor();
    window.setTimeout(() => void api.validate(), 0);
  }, [api]);

  const runCancel = useCallback(() => {
    const current = api.draftRef.current;
    if (!current.svhId) {
      notify("warn", "Nothing to cancel", "This document has not been saved, so there is nothing to cancel.");
      return;
    }
    if (current.status === "CANCELLED") {
      notify("warn", "Already cancelled", `${current.refno} is cancelled already.`);
      return;
    }
    setCancelTarget({ label: current.refno || current.svhId, posted: current.status === "POSTED" });
  }, [api.draftRef]);

  const runDelete = useCallback(() => {
    const current = api.draftRef.current;
    if (!current.svhId || current.status !== "DRAFT") {
      notify("info", "Delete draft", "Only a saved DRAFT can be deleted. A posted document is cancelled.");
      return;
    }
    ask({
      title: `Delete ${current.refno}?`,
      message: "The draft moved no stock. Delete it?",
      onConfirm: () => void api.deleteDraft(),
    });
  }, [api, ask]);

  const runNew = useCallback(() => {
    guardDirty("Discard entry", "This document has unsaved changes. Start a new one anyway?", () => {
      api.newDocument();
    });
  }, [api, guardDirty]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      api.focusEntryStart();
    }
  }, [api]);

  // Both leave for the list on a confirmed discard — unlike a menu trip, the
  // document must not be waiting on the next visit.
  const runList = useCallback(() => {
    guardDirty("Open another", "This document has unsaved changes. Discard it and open another?", () => {
      api.forgetRemembered();
      onBackToList();
    });
  }, [api, guardDirty, onBackToList]);

  const runClose = useCallback(() => {
    guardDirty("Discard entry", "This document has unsaved changes. Close it anyway?", () => {
      api.forgetRemembered();
      onBackToList();
    });
  }, [api, guardDirty, onBackToList]);

  /**
   * Previous / Next (Qt `stepDocument`). A new document has nothing after it;
   * unsaved changes are asked about before another document replaces them.
   */
  const runStep = useCallback(
    (previous: boolean) => {
      const current = api.draftRef.current;
      if (!current.svhId && !previous) {
        api.setNotice(STEP_NOTICES.newHasNoNext);
        return;
      }
      guardDirty("Open another", "This document has unsaved changes. Discard it and open another?", () => {
        void api.stepDocument(previous);
      });
    },
    [api, guardDirty],
  );

  const runPick = useCallback(() => {
    const current = api.draftRef.current;
    const key =
      activeKey.current && current.lines.some((line) => line.key === activeKey.current)
        ? activeKey.current
        : current.lines[current.lines.length - 1]?.key ?? null;
    api.openPick(key);
  }, [api]);

  /** History (Ctrl+H) — this document's status trail (Qt `TxnHistoryDialog::showFor`). */
  const openHistory = useCallback(() => {
    if (!draft.svhId) {
      return;
    }
    setHistoryTarget({
      docId: draft.svhId,
      companyId: draft.companyId,
      accYear: draft.accYear,
      refNo: draft.refno,
    });
  }, [draft.accYear, draft.companyId, draft.refno, draft.svhId]);

  // ------------------------------------------------------------ shortcuts
  // The shared document keys. A handler left null is not intercepted at all:
  // its button is off. Anything layered over the voucher owns the keyboard — a
  // dialog is `aria-modal` (the hook stands down), the message popup swallows
  // every key, and the grid's settings menu turns the keys off here.
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canSave ? () => runSave(true) : null,
      // In browse mode only: on a draft open for keying there is nothing to edit.
      edit: !working && canEdit && draft.mode === "browse" ? runEdit : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      history: saved ? openHistory : null,
      open: !working ? runList : null,
      close: !working ? runClose : null,
      previous: !working ? () => runStep(true) : null,
      next: !working ? () => runStep(false) : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !gridSettings.active },
  );

  // The screen's own keys (`screenKeyAction`): F12 pick from stock — the grid's
  // F12 claims it first on the line it is pressed on — and bare F5 swallowed.
  const overlayOpen =
    itemPicker !== null ||
    confirm !== null ||
    cancelTarget !== null ||
    api.pickKey !== null ||
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

  /**
   * Enter and Tab walk the header in the Qt tab order — Date, Rate Source,
   * Godown, Default Reason, Your Ref No, Remarks — and the last field hands
   * over to the grid: the first line still without an item, on its Barcode
   * (its Item on a move). Tab is taken here rather than left to the browser so
   * it cannot step into the godown's open option list.
   */
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
        focusBlankLineEntry(line.key, blankLineEntryColumn(draft.kind));
      }
    }
  };

  // ---------------------------------------------------------- the pick dialog
  const pickLine = api.pickKey ? draft.lines.find((line) => line.key === api.pickKey) ?? null : null;
  const expiredBy =
    draft.kind === "Expiry"
      ? addDays(isRealDate(draft.docDate) ? draft.docDate : todayIso(), expiryGraceDays)
      : null;

  const note = kindNote(draft.kind);
  const rateOptions = RATE_SOURCES.map((code) => ({ value: code, label: rateSourceLabel(code) }));
  const audit = auditLines(draft);
  const notice = draft.notice ?? "";

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={runClose}>
              ‹ Stock Adjustments
            </button>
            <h1 className={quotationStyles.title}>Stock Adjustment</h1>
          </div>
          <span className={styles.kindHint}>{titleLine(draft)}</span>
          <span className={styles.scope} title="The godown this document belongs to.">
            {scopeLabel(draft)}
          </span>
          <div className={styles.statusLine}>
            <span
              className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)}
              title="DRAFT, POSTED or CANCELLED."
            >
              {draft.status}
            </span>
            {draft.mode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
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

        {/* ── the document's details; the godown in its own box at the right ── */}
        <div className={styles.fieldsCard} onKeyDown={onHeaderKeyDown}>
          <ReadOnlyInput id="stock-adjustment-docno" label="Doc No" value={draft.refno} placeholder="given on save" />
          <DateField
            id={DOC_DATE_ID}
            label="Date"
            value={draft.docDate}
            disabled={!editable}
            onChange={(value) => api.setHeader("docDate", value)}
          />
          <SelectField
            id="stock-adjustment-rate-source"
            label="Rate Source (in)"
            value={draft.rateSource}
            options={rateOptions}
            disabled={!rateSourceEditable(draft)}
            title="What an INWARD line is valued at. An outward line is always valued at the branch average. Re-lot and Move stock carry the average across."
            onChange={api.setRateSource}
          />
          <div
            className={cx(styles.godownBox, godownChosen ? styles.godownSet : styles.godownMissing)}
            data-tone={godownChosen ? "set" : "missing"}
            title="ONE godown per document — every line is in it. Moving stock between godowns is a transfer."
          >
            <DropdownCombo
              id={GODOWN_ID}
              label="Godown *  — every line is in it"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              value={draft.godownId}
              selectedLabel={draft.godownName}
              disabled={!editable}
              placeholder="Choose the godown"
              onSelect={onGodown}
            />
          </div>
          <SelectField
            id="stock-adjustment-default-reason"
            label="Default Reason"
            value={draft.defaultReasonId}
            options={defaultReasonOptions(draft)}
            disabled={!editable}
            title="The reason a NEW line starts with. Each line keeps its own reason; the reason decides which way the line moves."
            onChange={(value) => api.setHeader("defaultReasonId", value)}
          />
          <TextField
            id="stock-adjustment-usr-refno"
            label="Your Ref No"
            value={draft.usrRefno}
            disabled={!editable}
            maxLength={100}
            title="svh_usr_refno — your own reference."
            onChange={(value) => api.setHeader("usrRefno", value)}
          />
          <TextField
            id="stock-adjustment-remarks"
            label="Remarks"
            value={draft.remarks}
            disabled={!editable}
            maxLength={250}
            title="svh_remarks — describes the document. A line with no remarks of its own falls back to these."
            onChange={(value) => api.setHeader("remarks", value)}
          />
        </div>
      </div>

      <div
        className={styles.kindRow}
        role="radiogroup"
        aria-label="Type"
        onKeyDown={(event) => {
          // One Tab stop for the row; the arrows walk the types (a radio group).
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
          }
          const next = kindStep(KINDS, draft.kind, event.key);
          if (!next || !kindSelectable(draft)) {
            return;
          }
          event.preventDefault();
          requestKind(next);
          event.currentTarget.querySelector<HTMLButtonElement>(`[data-kind="${next}"]`)?.focus();
        }}
      >
        <span className={styles.kindLabel}>Type</span>
        {KIND_BUTTONS.map((button) => (
          <button
            key={button.kind}
            type="button"
            role="radio"
            data-kind={button.kind}
            aria-checked={draft.kind === button.kind}
            tabIndex={draft.kind === button.kind ? 0 : -1}
            className={cx(styles.kindButton, draft.kind === button.kind && styles.kindButtonActive)}
            title={button.tooltip}
            disabled={!kindSelectable(draft)}
            onClick={() => requestKind(button.kind)}
          >
            {button.label}
          </button>
        ))}
      </div>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Lines</span>
          <span className={quotationStyles.modalNote}>{GRID_NOTE}</span>
        </div>
        {gridSettings.overlays}
        <AdjustmentLineGrid
          draft={draft}
          columns={columns}
          onContextMenu={gridSettings.onContextMenu}
          lineNos={lineNos}
          problemKeys={problemKeys}
          problemText={problemText}
          remarksRequired={remarksRequired}
          hints={hints}
          editable={editable}
          onActiveRow={(key) => {
            activeKey.current = key;
          }}
          onEdit={api.editLine}
          onOpenItemPicker={openItemPicker}
          onScanBarcode={onScanBarcode}
          onSearchItems={searchItemsFromBarcode}
          onOpenPick={(key) => api.openPick(key)}
          onRefused={onRefused}
          onInsertLine={api.insertLine}
          onRemoveLine={onRemoveLine}
        />
      </section>

      {note ? <p className={styles.kindNote}>{note}</p> : null}
      {relot ? (
        <p className={cx(styles.relotBalance, relot.good ? styles.toneGood : styles.toneBad)}>
          {relot.lines.join("\n")}
        </p>
      ) : null}

      {draft.kind !== "Relot" && draft.kind !== "Move" ? (
        <div className={styles.summaryRow}>
          <section className={styles.card}>
            <h3 className={styles.cardTitle}>TOTALS</h3>
            <p className={styles.cardLine}>{totals.outText}</p>
            <p className={styles.cardLine}>{totals.inText}</p>
            <p className={styles.cardLine}>{totals.netText}</p>
          </section>
          <section className={cx(styles.card, styles.cardWide)}>
            <h3 className={styles.cardTitle}>
              ACCOUNTS · Stock Journal at Save (PERPETUAL) — estimate; the voucher uses the posted ledger values
            </h3>
            <pre className={styles.accounts}>{(accounts ?? []).join("\n")}</pre>
            <p className={styles.cardNote}>
              the reason&apos;s own ledger when it has one, else the Stock Shortage / Stock Excess role; netted per
              ledger
            </p>
          </section>
        </div>
      ) : null}

      {draft.kind === "Move" ? (
        <DamagedPanel
          rows={api.damaged.rows}
          loading={api.damaged.loading}
          godownName={draft.godownName}
          hasGodown={Boolean(draft.godownId)}
          canTake={editable}
          onTake={api.takeDamagedRow}
        />
      ) : null}

      {strip ? <p className={styles.validation}>{strip.text}</p> : null}
      <p className={styles.hintLine}>{draft.hint}</p>
      <div className={styles.spacer} />

      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>
          F1 · keys on this screen · Alt+PgUp / Alt+PgDn previous / next adjustment
        </span>
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
          title="Save without moving stock. The adjustment rules still run."
          disabled={!canSaveDraft || working}
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Check every line against the server's rules without posting."
          disabled={!draftStatus || working}
          onClick={runValidate}
        >
          Validate
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title="Saves and posts in one step. Nothing posts unless every line passes; if any is refused, nothing is saved."
          disabled={!canSave || working}
          onClick={() => runSave(true)}
        >
          {withKey("Save & Post", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Printing for stock documents comes later."
          disabled
        >
          Save &amp; Print
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Delete this DRAFT. A posted document is cancelled, never deleted."
          disabled={!canDeleteDraft || working}
          onClick={runDelete}
        >
          Delete Draft
        </button>
        {saved && draft.status !== "CANCELLED" ? (
          <button
            type="button"
            className={quotationStyles.button}
            title="A POSTED document is reversed by mirror rows and a reversing accounts voucher; a DRAFT is marked cancelled."
            disabled={!canCancel || working}
            onClick={runCancel}
          >
            {withKey("Cancel", "cancelDoc")}
          </button>
        ) : null}
        {draftStatus && saved && draft.mode === "browse" ? (
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
        onBarcode={onBarcode}
      />
      <StockPickDialog
        isOpen={api.pickKey !== null}
        companyId={draft.companyId}
        branchId={draft.branchId}
        godownId={draft.godownId}
        godownName={draft.godownName}
        item={pickLine && rowHasItem(pickLine) ? { itemId: pickLine.itemId, itemName: pickLine.itemName } : null}
        groupBySupplier={draft.kind === "Move"}
        expiredBy={expiredBy}
        initialSearch={api.pickSearch}
        onClose={api.closePick}
        onPick={(row) => {
          const key = api.pickKey;
          api.closePick();
          if (key) {
            api.applyHolding(key, row);
          }
        }}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <CancelFlow
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelDocument={(reason) => void api.cancelDocument(reason)}
      />
      <TxnKeysSheet
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        document={KEY_SHEET.document}
        lines={KEY_SHEET.lines}
      />
      <TxnHistoryDialog
        target={historyTarget}
        docLabel="Stock Adjustment"
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}
