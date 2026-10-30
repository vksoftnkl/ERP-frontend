"use client";

/**
 * Purchase Entry (menu 24) — the supplier's bill keyed as printed, direct mode
 * (Qt `PurchaseInvoiceEntry`, NexERP 3ce8487; plan-purchase-frontend F5, first
 * slice): the header, lines with batch / expiry on the row, the server's
 * calculation painted back, Save Draft / Post / Cancel / reopen.
 *
 * Every money figure on screen comes from `POST /purchase/invoices/validate`
 * (or, on a stored bill, from what the server stored). The list lives on the
 * same route (features/purchase/shared); Show List / Close go back to it.
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
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { DateField, DropdownCombo, Field, ReadOnlyInput, TextField } from "@/features/sales/quotation/components/fields";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { AdjustmentItemPicker, type AdjustmentItemPick } from "@/features/stocks/stock-adjustment/components/adjustment-item-picker";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { toast } from "@/lib/notify";
import { isoToDisplayDate } from "@/lib/date-format";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { PurchaseAgentPicker } from "../../shared/components/purchase-agent-picker";
import { PurchaseAllocDialog } from "../../shared/components/purchase-alloc-dialog";
import { usePurchaseAllocPanel } from "../../shared/use-purchase-alloc-panel";
import {
  PurchaseMoreColumns,
  PurchasePickerBox,
  PurchaseSectionHeading,
  PurchaseStatusPill,
  PurchaseTotalsPanel,
  PurchaseWarnStrip,
  purchaseOverrideActive,
} from "../../shared/components/purchase-parts";
import { PurchaseSourcePicker } from "../../shared/components/purchase-source-picker";
import { PurchaseTransportDialog } from "../../shared/components/purchase-transport-dialog";
import { readMoreColumns, toggleMoreColumn, transportSummary, writeMoreColumns } from "../../shared/purchase-parts";
import {
  dueText,
  placeOfSupplyText,
  priceKeptText,
  reverseChargeText,
  sourceText,
  totalsRows,
} from "../invoice-fidelity";
import type { PurchaseAllocEntry } from "../../shared/purchase-dialogs.types";
import type { InvoiceDraft } from "../invoice.types";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import { money } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import type { GrnHandoff } from "../../shared/purchase-handoff";
import { usePurchaseCompanySubtitle } from "../../shared/use-purchase-scope";
import { resolveLineColumns } from "../invoice.columns";
import {
  COL,
  FALLBACK_COLUMN_TITLES,
  GODOWN_DROPDOWN_KEY,
  ITEM_STRIP_DELAY_MS,
  KEY_SHEET,
  LINE_GRID_NAME,
  LINE_GRID_UI_TABLE_KEY,
  MORE_COLUMNS,
  MORE_COLUMNS_SCREEN_KEY,
  STATUS,
  SUPPLIER_DROPDOWN_KEY,
} from "../invoice.constants";
import { allocNeedOf, allocSeedOf } from "../invoice-lines";
import { isEditable, rowFromGrn, rowHasItem } from "../invoice.state";
import { usePurchaseInvoiceDraft } from "../use-purchase-invoice-draft";
import { SIDE_KEY_ROWS, useInvoiceSide } from "../use-invoice-side";
import { focusBlankLineEntry, focusLineCell, focusLineGrid, InvoiceLineGrid } from "./invoice-line-grid";
import { ItemContextStrip } from "./item-context-strip";
import styles from "../page.module.scss";

const IDS = {
  supplier: "purchase-invoice-supplier",
  billFrom: "purchase-invoice-bill-from",
  goods: "purchase-invoice-goods-recd",
  source: "purchase-invoice-source",
  mode: "purchase-invoice-mode",
  creditDays: "purchase-invoice-credit-days",
  agent: "purchase-invoice-agent",
  pos: "purchase-invoice-pos",
  rcm: "purchase-invoice-rcm",
  irn: "purchase-invoice-irn",
  ack: "purchase-invoice-ack",
  transport: "purchase-invoice-transport",
  invNo: "purchase-invoice-inv-no",
  invDate: "purchase-invoice-inv-date",
  ourNo: "purchase-invoice-our-no",
  docDate: "purchase-invoice-doc-date",
  godown: "purchase-invoice-godown",
  amount: "purchase-invoice-amount",
  remarks: "purchase-invoice-remarks",
} as const;


const AMOUNT_PATTERN = /^[\d,]*(\.\d{0,2})?$/;

/** Commit the cell being typed in before anything reads the lines. */
function commitOpenEditor() {
  const active = document.activeElement as HTMLElement | null;
  if (active && active.closest(`[data-quotation-grid="${LINE_GRID_NAME}"]`)) {
    active.blur();
  }
}

type ItemPickerState = { key: string; query: string };

export type PurchaseInvoiceEntryViewProps = PurchaseEntryViewProps & {
  /** GRN's Make bill · Ctrl+B (shared/purchase-handoff.ts): a new bill on its supplier / godown, its lines brought in. */
  fromGrn?: GrnHandoff | null;
};

export function PurchaseInvoiceEntryView({ initialDocument, initialMode, onBackToList, memory, fromGrn }: PurchaseInvoiceEntryViewProps) {
  const config = PURCHASE_DOC_TYPES.invoice;
  const api = usePurchaseInvoiceDraft(memory);
  const { draft, draftRef } = api;
  const { permissions } = usePagePermissions();
  const companySubtitle = usePurchaseCompanySubtitle();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  /** The Override right on menu 24 (the strip's tick; the server is the gate). */
  const mayOverride = (permissions as { canOverride?: boolean } | undefined)?.canOverride === true;

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const activeKey = useRef<string | null>(null);
  // PI-LINES: the line the item strip follows (settles 200 ms after the cursor, Qt m_stripTimer) and F12's line.
  const [stripKey, setStripKey] = useState<string | null>(null);
  const stripTimer = useRef<number | null>(null);
  // F12 — BATCHES (left) and SERIALS (right), inline, side by side (Qt m_batchPanel / m_serialPanel)
  const batchPanel = usePurchaseAllocPanel();
  const serialPanel = usePurchaseAllocPanel();

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(LINE_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  // "More columns" (callout 10) — the user's choice, kept per screen (Qt QSettings per user)
  const [moreKeys, setMoreKeys] = useState<string[]>(() => readMoreColumns(MORE_COLUMNS_SCREEN_KEY, []));
  const moreSet = useMemo(
    () => new Set(MORE_COLUMNS.filter((m) => m.column !== null && moreKeys.includes(m.key)).map((m) => m.column as number)),
    [moreKeys],
  );
  const toggleMore = useCallback((key: string) => {
    setMoreKeys((shown) => {
      const next = toggleMoreColumn(shown, key);
      writeMoreColumns(MORE_COLUMNS_SCREEN_KEY, next);
      return next;
    });
  }, []);
  const columns = useMemo(() => resolveLineColumns(layout, draft.lineSettings, moreSet), [draft.lineSettings, layout, moreSet]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  const [overrideTick, setOverrideTick] = useState(false);
  const [overrideAsk, setOverrideAsk] = useState(false);
  const overrideTickRef = useRef(overrideTick);
  useLayoutEffect(() => {
    overrideTickRef.current = overrideTick;
  });
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Purchase invoice lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule: Barcode and Item on a blank line, then Billed, Rate and Disc %. Sell A–D and Markup show while the bill keys selling prices; Size, Colour and Model while the company numbers its own batches.",
  });
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);

  // -------------------------------------------------------------- state
  const editable = isEditable(draft);
  const isDraft = draft.status === STATUS.draft;
  const saved = Boolean(draft.piId);
  const working = api.busy !== null;
  const canSaveDraft = isDraft && rights.maySaveDraft(saved);
  const canPost = isDraft && rights.mayPost;
  const canCancel = draft.status === STATUS.posted && saved && rights.mayCancelDocument(true);
  const canEdit = isDraft && saved && draft.viewMode === "browse" && rights.mayEdit;

  // ---------------------------------------------------------- open a doc
  const { load, finishResume, requestFocus, resumed } = api;
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument?.id ?? " new";
    if (opened.current === target) {
      return;
    }
    opened.current = target;
    if (memory?.resume && resumed) {
      void finishResume();
      return;
    }
    if (initialDocument) {
      void load(initialDocument, initialMode === "entry").then((loaded) => {
        if (loaded) {
          requestFocus({ target: "entryStart" });
        }
      });
    } else {
      requestFocus({ target: "entryStart" });
    }
  }, [finishResume, initialDocument, initialMode, load, memory?.resume, requestFocus, resumed]);

  // ------------------------------------------------------- focus requests
  useEffect(() => {
    const request = api.focusRequest;
    if (!request) {
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (request.target === "cell") {
          focusLineCell(request.key, request.column);
          return;
        }
        const current = draftRef.current;
        if (request.target === "supplier" || (isEditable(current) && !current.supplierId)) {
          document.getElementById(IDS.supplier)?.focus();
          return;
        }
        if (isEditable(current)) {
          const line = current.lines.find((candidate) => !rowHasItem(candidate));
          if (line && focusBlankLineEntry(line.key)) {
            return;
          }
        }
        focusLineGrid();
      }, 0),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [draftRef, api.focusRequest]);

  // ---------------------------------------------------------------- guards
  const guardDirty = useCallback(
    (title: string, message: string, then: () => void) => {
      if (!draftRef.current.dirty) {
        then();
        return;
      }
      void confirm({ title, message, confirmLabel: "Discard" }).then((yes) => {
        if (yes) {
          then();
        }
      });
    },
    [draftRef],
  );

  // ---------------------------------------------- header / side (PI-HEADER)
  const side = useInvoiceSide({
    api,
    editable,
    guardDirty,
    keysEnabled: !gridSettings.active && itemPicker === null && !cancelAsk && !sourceOpen && !agentOpen && !transportOpen && !overrideAsk,
    openedOnWork: Boolean(initialDocument) || Boolean(memory?.resume && resumed),
    mayStartNew: rights.mayStartNew,
    amountClassName: styles.amountInput,
    ewbClassName: styles.ewbPair,
  });

  // ------------------------------------------------------------ the lines
  const openItemPicker = useCallback(
    (key: string, query: string) => {
      if (!isEditable(draftRef.current)) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query: query.replace(/\s+/g, " ").trim() });
    },
    [draftRef],
  );

  const closeItemPicker = useCallback(() => {
    const target = itemPicker;
    setItemPicker(null);
    if (target) {
      window.requestAnimationFrame(() => window.setTimeout(() => focusBlankLineEntry(target.key), 0));
    }
  }, [itemPicker]);

  const onPickItem = useCallback(
    (picked: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        void api.pickItem(target.key, picked.itemId, picked.itemName, picked.unitId || undefined);
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

  /** Queued, never run inside the cell's own commit: the resolve rewrites the very line being committed. */
  const onScanBarcode = useCallback(
    (key: string, code: string) => {
      window.setTimeout(() => void api.resolveBarcode(key, code), 0);
    },
    [api],
  );

  const onRemoveLine = useCallback(
    (key: string) => {
      const line = draftRef.current.lines.find((candidate) => candidate.key === key);
      if (!line || !rowHasItem(line) || !isEditable(draftRef.current)) {
        return;
      }
      void confirm({ title: "Remove line", message: `Remove "${line.itemName || "this item"}" from the bill?`, confirmLabel: "Remove" }).then(
        (yes) => {
          if (yes) {
            api.removeLine(key);
          }
        },
      );
    },
    [api, draftRef],
  );

  const onAddLine = useCallback(() => {
    api.addLine();
    window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        const current = draftRef.current;
        const blank = current.lines.find((candidate) => !rowHasItem(candidate));
        if (blank) {
          focusBlankLineEntry(blank.key);
        }
      }, 0),
    );
  }, [api, draftRef]);

  // ------------------------------------------- line extras (PI-LINES)
  const followLine = useCallback((key: string) => {
    activeKey.current = key;
    if (stripTimer.current !== null) {
      window.clearTimeout(stripTimer.current);
    }
    stripTimer.current = window.setTimeout(() => {
      stripTimer.current = null;
      setStripKey(key);
    }, ITEM_STRIP_DELAY_MS);
  }, []);
  useEffect(
    () => () => {
      if (stripTimer.current !== null) {
        window.clearTimeout(stripTimer.current);
      }
    },
    [],
  );
  const stripLine = useMemo(() => {
    const line = draft.lines.find((candidate) => candidate.key === stripKey);
    return line && rowHasItem(line) ? line : null;
  }, [draft.lines, stripKey]);

  /** Qt `openAllocs` — F12: the line's batches / serials, INLINE (embedded); Σ must equal what came in. */
  const batchOpen = batchPanel.open;
  const serialOpen = serialPanel.open;
  const openAllocs = useCallback(
    (key: string | null) => {
      const current = draftRef.current;
      const index = current.lines.findIndex((candidate) => candidate.key === key);
      const line = current.lines[index];
      if (!line || !rowHasItem(line)) {
        api.setHint("Put the cursor on an item line, then F12.");
        return;
      }
      if (rowFromGrn(line)) {
        api.setHint(`Line ${index + 1} came in on a GRN — its batches are the GRN's.`);
        return;
      }
      const need = allocNeedOf(line, { godownId: current.godownId, godownName: current.godownName }, current.lineSettings);
      if (need.received + need.damaged + need.free <= 0) {
        api.setHint(`Line ${index + 1}: key the qty first.`);
        return;
      }
      const open = need.serial ? serialOpen : batchOpen;
      const held = open(
        {
          key: line.key,
          title: need.serial ? `F12 — SERIALS (line ${index + 1}, scan mode)` : `F12 — BATCHES (line ${index + 1})`,
          rows: allocSeedOf(line, need),
          tip: line.itemName,
        },
        {
          editable: isEditable(current),
          noun: need.serial ? "serials" : "batches",
          lineNoOf: (lineKey) => draftRef.current.lines.findIndex((candidate) => candidate.key === lineKey) + 1,
        },
      );
      if (held) {
        api.setHint(held);
      }
    },
    [api, batchOpen, draftRef, serialOpen],
  );

  // F12 anywhere on the screen (Qt: a screen shortcut) — the grid's own rows take it first.
  const openAllocsRef = useRef(openAllocs);
  useLayoutEffect(() => {
    openAllocsRef.current = openAllocs;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F12" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.defaultPrevented) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      if (!event.repeat) {
        openAllocsRef.current(activeKey.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** From GRN / PO · Ctrl+L (and Source ▾) — Qt `openSourcePicker`. */
  const openSourcePicker = useCallback(() => {
    const current = draftRef.current;
    if (!isEditable(current)) {
      return;
    }
    if (!current.supplierId) {
      api.setHint("Pick the supplier first — its GRNs and POs are listed then.");
      document.getElementById(IDS.supplier)?.focus();
      return;
    }
    if (api.lines.grnOptions.length === 0 && api.lines.poOptions.length === 0) {
      api.setHint(`No GRN is waiting for a bill and no PO is open for ${current.supplierName || "this supplier"} — key the lines as they are on the bill.`);
      return;
    }
    setSourceOpen(true);
  }, [api, draftRef]);
  const sourceChoices = useMemo(
    () => [
      ...api.lines.grnOptions.map((option) => ({ kind: "GRN", id: option.id, text: option.label })),
      ...api.lines.poOptions.map((option) => ({ kind: "PO", id: option.id, text: option.label })),
    ],
    [api.lines.grnOptions, api.lines.poOptions],
  );
  // GRN → Make bill: the supplier and godown first; the GRN's lines once its list (From GRN) has it (Qt makeBill)
  const handoffStage = useRef<"supplier" | "lines" | "done">(fromGrn ? "supplier" : "done");
  useEffect(() => {
    if (!fromGrn || handoffStage.current !== "supplier" || !isEditable(draftRef.current)) {
      return;
    }
    handoffStage.current = "lines";
    side.onSupplierPicked(fromGrn.supplierId, fromGrn.supplierName);
    if (fromGrn.godownId) {
      api.setGodown(fromGrn.godownId, fromGrn.godownName ?? "");
    }
  }, [api, draftRef, fromGrn, side]);
  useEffect(() => {
    if (!fromGrn || handoffStage.current !== "lines") {
      return;
    }
    if (api.lines.grnOptions.some((option) => option.id === fromGrn.grnId)) {
      handoffStage.current = "done";
      api.lines.fillFromGrn(fromGrn.grnId);
    }
  }, [api.lines, fromGrn]);

  const openSourceRef = useRef(openSourcePicker);
  useLayoutEffect(() => {
    openSourceRef.current = openSourcePicker;
  });
  // Ctrl+L (Qt key(Ctrl+L)); the browser's address-bar chord is taken back while the page has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || (event.key !== "l" && event.key !== "L")) {
        return;
      }
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      if (!event.repeat) {
        openSourceRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ------------------------------------------------------------ actions
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy) {
        return;
      }
      commitOpenEditor();
      // The commit above lands synchronously in the draft ref; read it next tick.
      window.setTimeout(() => {
        if (!post) {
          void api.save(false).then((ok) => ok && side.afterSave(false));
          return;
        }
        const current = draftRef.current;
        // "override (logged)" ticked and a WARN needs it: ask why first (Qt askText), then post
        if (purchaseOverrideActive(current.issues?.warnings, current.issues?.refusals, mayOverride, overrideTickRef.current)) {
          setOverrideAsk(true);
          return;
        }
        const net = current.totals ? ` at the net payable ${money(current.totals.netPayable)}` : "";
        void confirm({
          title: `Post ${current.refno || "this bill"}?`,
          message: `The stock comes into ${current.godownName || "the godown"} and ${current.supplierName || "the supplier"} is credited${net}.`,
          note: "A posted bill is not edited — it is cancelled (with a reason) while nothing has paid it.",
          confirmLabel: "Post",
        }).then((yes) => {
          if (yes) {
            void api.save(true).then((ok) => ok && side.afterSave(true));
          }
        });
      }, 0);
    },
    [api, draftRef, mayOverride, side],
  );
  const runCancel = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== STATUS.posted) {
      toast.warn("Only a posted bill can be cancelled.", { title: "Not posted" });
      return;
    }
    setCancelAsk(true);
  }, [draftRef]);

  const runNew = useCallback(() => {
    guardDirty("Discard entry", "This bill has unsaved changes. Start a new one anyway?", () => {
      side.dropAutosave();
      api.newDocument();
    });
  }, [api, guardDirty, side]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      api.requestFocus({ target: "entryStart" });
    }
  }, [api]);

  const leave = useCallback(
    (title: string) => {
      guardDirty(title, "This bill has unsaved changes. Discard them?", () => {
        api.forgetRemembered();
        side.dropAutosave();
        onBackToList();
      });
    },
    [api, guardDirty, onBackToList, side],
  );

  // ------------------------------------------------------------ shortcuts
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft && editable ? () => runSave(false) : null,
      post: !working && canPost && editable ? () => runSave(true) : null,
      edit: !working ? (canEdit ? runEdit : side.explainEdit) : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      open: !working ? () => leave("Open another") : null,
      close: !working ? () => leave("Close") : null,
      previous: !working ? side.keys.previous : null,
      next: !working ? side.keys.next : null,
      history: side.keys.history,
      print: side.keys.print,
    },
    {
      onHelp: () => setKeysOpen(true),
      enabled:
        !gridSettings.active && itemPicker === null && !cancelAsk && !side.dialogOpen && !sourceOpen && !agentOpen && !transportOpen && !overrideAsk,
    },
  );

  // Bare F5 is swallowed: a habit press must not reload the page and take the bill with it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F5" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
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

  /** Enter and Tab walk the header in the Qt tab order; the last field hands over to the grid. */
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
        focusBlankLineEntry(line.key);
      }
    }
  };

  const at = (row: number, column: number) => ({ gridRow: row, gridColumn: String(column) });
  const span = (row: number, column: number, columns: number) => ({ gridRow: row, gridColumn: `${column} / span ${columns}` });
  const ext = draft.ext;
  const facts = draft.facts;
  const issues = draft.issues;
  const sourceLine = sourceText(draft.lines);
  const transportText = transportSummary(ext.transport);
  const keptLines = draft.lines.flatMap((line, index) => (rowHasItem(line) && line.priceKept ? [index + 1] : []));
  const panelRows = totalsRows(draft.serverTotals, facts.interState).map((row) =>
    row.tcsInput ? { key: row.key, caption: row.caption, value: side.tcsInput } : row,
  );
  const statusLabel = side.statusText;

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <div className={styles.titleLine}>
              <button type="button" className={quotationStyles.button} onClick={() => leave("Close")}>
                ‹ {config.listTitle}
              </button>
              <h1 className={quotationStyles.title}>{draft.refno ? `Purchase Invoice — ${draft.refno}` : "Purchase Invoice — new"}</h1>
            </div>
            <span className={styles.subtitle}>{companySubtitle}</span>
          </div>
          <div className={styles.statusBlock}>
            <div className={styles.statusLine}>
              {draft.viewMode === "browse" && isDraft && saved ? (
                <span className={quotationStyles.readOnlyBadge}>Read only</span>
              ) : null}
              {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
              {api.busy ? <span className={styles.busy}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
              <PurchaseStatusPill
                status={draft.paymentHold && draft.status === STATUS.posted ? "ON_HOLD" : draft.status}
                label={statusLabel}
                title="DRAFT, POSTED or CANCELLED."
              />
            </div>
          </div>
        </div>

        <PurchaseSectionHeading title="THE HEADER" />
        {/* ── the header: four pairs a row, the mockup's rows, in the Qt tab order ── */}
        <div className={styles.headerCard} onKeyDown={onHeaderKeyDown}>
          {/* row 1 — Supplier · Bill from · Supplier Inv · Inv Date */}
          <div className={styles.pair} style={at(1, 1)}>
            <DropdownCombo
              id={IDS.supplier}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              metaKey="sup_short"
              value={draft.supplierId}
              selectedLabel={draft.supplierName}
              disabled={!editable}
              required
              placeholder="Who sent the bill"
              onSelect={side.onSupplierPicked}
            />
          </div>
          <div className={styles.pair} style={at(1, 2)}>
            <Field label="Bill from" htmlFor={IDS.billFrom}>
              <select
                id={IDS.billFrom}
                className={quotationStyles.input}
                value={ext.billFromGstin}
                disabled={!editable || side.billFrom.length === 0}
                title="Which of the supplier's GSTINs the bill is from — another state turns CGST + SGST into IGST"
                data-quotation-focus={IDS.billFrom}
                onChange={(event) => api.dispatch({ type: "ext", patch: { billFromGstin: event.target.value } })}
              >
                {side.billFrom.length === 0 ? <option value={ext.billFromGstin}>{ext.billFromGstin || "—"}</option> : null}
                {side.billFrom.map((option) => (
                  <option key={option.gstin || option.label} value={option.gstin} title={option.addr}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className={styles.pair} style={at(1, 3)}>
            <TextField
              id={IDS.invNo}
              label="Supplier Inv"
              value={draft.supplierInvNo}
              disabled={!editable}
              required
              maxLength={60}
              placeholder="as printed on the bill"
              onChange={(value) => api.setHeader({ supplierInvNo: value })}
            />
          </div>
          <div className={styles.pair} style={at(1, 4)}>
            <DateField id={IDS.invDate} label="Inv Date" value={draft.supplierInvDate} disabled={!editable} onChange={(value) => api.setHeader({ supplierInvDate: value })} />
          </div>
          {/* row 2 — Our No · Entry date · Goods recd · Source */}
          <div className={styles.pair} style={at(2, 1)}>
            <ReadOnlyInput id={IDS.ourNo} label="Our No" value={draft.refno} placeholder="given on save" />
          </div>
          <div className={styles.pair} style={at(2, 2)}>
            <DateField id={IDS.docDate} label="Entry date" value={draft.docDate} disabled={!editable} onChange={(value) => api.setHeader({ docDate: value })} />
          </div>
          <div className={styles.pair} style={at(2, 3)}>
            <DateField
              id={IDS.goods}
              label="Goods recd"
              value={ext.goodsReceivedOn}
              disabled={!editable}
              onChange={(value) => api.dispatch({ type: "ext", patch: { goodsReceivedOn: value, goodsTyped: Boolean(value) } })}
            />
          </div>
          <div className={styles.pair} style={at(2, 4)}>
            <Field label="Source" htmlFor={IDS.source}>
              <PurchasePickerBox
                id={IDS.source}
                text={sourceLine}
                disabled={!editable}
                title="Where the lines come from — ▾ or Ctrl+L brings in a GRN or a PO"
                onPick={openSourcePicker}
              />
            </Field>
          </div>
          {/* row 3 — Inv Amount · Mode · Credit days · Godown */}
          <div className={styles.pair} style={at(3, 1)}>
            <Field label="Inv Amount" htmlFor={IDS.amount} required>
              <input
                id={IDS.amount}
                className={cx(quotationStyles.input, styles.amountInput)}
                value={draft.invoiceAmount}
                disabled={!editable}
                inputMode="decimal"
                autoComplete="off"
                placeholder="as printed on the bill"
                title="The bill's total as printed — compared with the net payable."
                data-quotation-focus={IDS.amount}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (AMOUNT_PATTERN.test(next)) {
                    api.setHeader({ invoiceAmount: next });
                  }
                }}
              />
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 2)}>
            <Field label="Mode" htmlFor={IDS.mode}>
              <select
                id={IDS.mode}
                className={quotationStyles.input}
                value={ext.mode}
                disabled={!editable}
                data-quotation-focus={IDS.mode}
                onChange={(event) => api.dispatch({ type: "ext", patch: { mode: event.target.value === "CASH" ? "CASH" : "CREDIT" } })}
              >
                <option value="CREDIT">Credit</option>
                <option value="CASH" disabled title="Cash purchase is not built yet">
                  Cash
                </option>
              </select>
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 3)}>
            <Field label="Credit days" htmlFor={IDS.creditDays}>
              <span className={styles.creditPair}>
                <input
                  id={IDS.creditDays}
                  className={cx(quotationStyles.input, styles.creditInput)}
                  value={ext.creditDays}
                  disabled={!editable}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  title={facts.msmeDueDate ? `MSME: pay by ${isoToDisplayDate(facts.msmeDueDate)}` : undefined}
                  data-quotation-focus={IDS.creditDays}
                  onChange={(event) => api.dispatch({ type: "ext", patch: { creditDays: event.target.value.replace(/\D/g, ""), creditDaysTyped: true } })}
                />
                <span className={styles.dueText}>{dueText(facts)}</span>
              </span>
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 4)}>
            <DropdownCombo
              id={IDS.godown}
              label="Godown"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              value={draft.godownId}
              selectedLabel={draft.godownName}
              disabled={!editable}
              required
              params={godownParams}
              placeholder="Where the goods go in"
              onSelect={api.setGodown}
            />
          </div>
          {/* row 4 — Agent · Place of sup · Rev. charge · E-way bill */}
          <div className={styles.pair} style={at(4, 1)}>
            <Field label="Agent" htmlFor={IDS.agent}>
              <PurchasePickerBox
                id={IDS.agent}
                text={ext.agentName || "—"}
                disabled={!editable}
                title="The broker who brought the bill (Agents master) — ▾ to pick, Delete to clear"
                onPick={() => setAgentOpen(true)}
                onClear={() => api.dispatch({ type: "ext", patch: { agentId: "", agentName: "" } })}
              />
            </Field>
          </div>
          <div className={styles.pair} style={at(4, 2)}>
            <ReadOnlyInput id={IDS.pos} label="Place of sup" value={placeOfSupplyText(facts, side.billFrom, ext.billFromGstin)} />
          </div>
          <div className={styles.pair} style={at(4, 3)}>
            <ReadOnlyInput id={IDS.rcm} label="Rev. charge" value={reverseChargeText(facts)} />
          </div>
          <div className={styles.pair} style={at(4, 4)}>
            {side.ewbField}
          </div>
          {/* row 5 — IRN / Ack · Transport */}
          <div className={styles.pair} style={span(5, 1, 2)}>
            <Field label="IRN / Ack" htmlFor={IDS.irn}>
              <span className={styles.irnPair}>
                <input
                  id={IDS.irn}
                  className={quotationStyles.input}
                  value={ext.irn}
                  disabled={!editable}
                  maxLength={64}
                  placeholder="IRN"
                  autoComplete="off"
                  data-quotation-focus={IDS.irn}
                  onChange={(event) => api.dispatch({ type: "ext", patch: { irn: event.target.value.trim() } })}
                />
                <input
                  id={IDS.ack}
                  className={quotationStyles.input}
                  value={ext.ackNo}
                  disabled={!editable}
                  maxLength={20}
                  placeholder="Ack no (QR scan: phase 2)"
                  autoComplete="off"
                  aria-label="Ack no"
                  data-quotation-focus={IDS.ack}
                  onChange={(event) => api.dispatch({ type: "ext", patch: { ackNo: event.target.value.trim() } })}
                />
              </span>
            </Field>
          </div>
          <div className={styles.pair} style={span(5, 3, 2)}>
            <Field label="Transport" htmlFor={IDS.transport}>
              <PurchasePickerBox
                id={IDS.transport}
                text={transportText}
                placeholder="LR no · transporter · vehicle — click or F4 to fill"
                title="The bill's transport band — click, Space or F4 opens it"
                onPick={() => setTransportOpen(true)}
              />
            </Field>
          </div>
          {/* row 6 — Remarks, full width */}
          <div className={styles.pair} style={span(6, 1, 4)}>
            <TextField id={IDS.remarks} label="Remarks" value={draft.remarks} disabled={!editable} maxLength={500} onChange={(value) => api.setHeader({ remarks: value })} />
          </div>
        </div>
        {side.chips}
      </div>

      <PurchaseSectionHeading title="THE LINES" hint="as printed · batch / serial on the row OR split in F12 — both write the same allocation rows" />
      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        {gridSettings.overlays}
        <InvoiceLineGrid
          lines={draft.lines}
          columns={columns}
          editable={editable}
          onContextMenu={gridSettings.onContextMenu}
          onActiveRow={followLine}
          rules={draft.lineSettings}
          sizes={api.lines.choices.sizes}
          colours={api.lines.choices.colours}
          onPickChoice={api.lines.pickChoice}
          onAddChoice={(field) =>
            api.setHint(
              field === "size"
                ? "Sizes are added on the Size master (Inventory) — this list is read from it."
                : "Colours are added on the Colour master (Inventory) — this list is read from it.",
            )
          }
          onOpenAllocs={openAllocs}
          onCycleUnit={(key) => void api.lines.cycleUnit(key)}
          onEdit={api.editCell}
          onOpenItemPicker={openItemPicker}
          onScanBarcode={onScanBarcode}
          onSearchItems={openItemPicker}
          onRefused={api.setHint}
          onAddLine={onAddLine}
          onRemoveLine={onRemoveLine}
        />
      </section>
      <PurchaseMoreColumns
        columns={MORE_COLUMNS.map((m) => {
          const priceOnly = m.key === "sellB" || m.key === "sellC" || m.key === "sellD";
          const off = m.column === null || (priceOnly && !draft.lineSettings.priceUpdate);
          return {
            key: m.key,
            label: m.label,
            disabled: off,
            title:
              m.column === null
                ? "Not on the lines grid yet — the column has to be registered first."
                : off
                  ? "Selling prices are not written from the bill (purchase settings)."
                  : undefined,
          };
        })}
        shown={moreKeys}
        onToggle={toggleMore}
      />

      <ItemContextStrip line={stripLine} supplierId={draft.supplierId} contextFor={api.lines.contextFor} epoch={api.lines.contextEpoch} />
      {keptLines.length > 0 ? <p className={styles.priceKept}>{priceKeptText(keptLines)}</p> : null}

      {batchPanel.target || serialPanel.target ? (
        <div className={styles.allocArea}>
          <InvoiceAllocSlot panel={batchPanel} draft={draft} editable={editable} onRows={api.lines.setAllocs} />
          <InvoiceAllocSlot panel={serialPanel} draft={draft} editable={editable} onRows={api.lines.setAllocs} />
        </div>
      ) : null}

      <div className={styles.sideBySide}>
        <div className={styles.chargesColumn}>
          <PurchaseSectionHeading title="CHARGES" hint="charge_master rows only · no fixed freight / loading fields" />
          {side.chargesGrid}
        </div>
        <div className={styles.totalsColumn}>
          <PurchaseSectionHeading title="TOTALS" />
          <PurchaseTotalsPanel rows={panelRows} />
        </div>
      </div>

      <p className={styles.hintLine} role="status">
        {draft.hint}
      </p>

      <PurchaseWarnStrip
        warnings={issues?.warnings}
        refusals={issues?.refusals}
        overrideAllowed={mayOverride && isDraft}
        overrideTicked={overrideTick}
        onOverrideChange={setOverrideTick}
        hintAllowed={"Post past the warnings that need a right (rate above the PO: no payment hold).\nNeeds the Override right on Purchase Entry; the reason is kept on the bill's trail."}
        hintNoRight="Needs the Override right on Purchase Entry — ask a supervisor to post it."
      />

      {/* row 1 — where the lines come from and what follows the bill */}
      <div className={styles.buttonBarLeft}>
        <button type="button" className={quotationStyles.button} disabled={!editable || working} onClick={openSourcePicker}>
          From GRN / PO · Ctrl+L
        </button>
        {side.row1Buttons}
        <button
          type="button"
          className={quotationStyles.button}
          title="The batches / serials of the line the cursor is on (F12 in the grid)"
          disabled={working}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openAllocs(activeKey.current)}
        >
          Batches / serials · F12
        </button>
      </div>
      {/* row 2 — the document keys (TxnKeys), right-aligned */}
      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>F1 · keys on this screen</span>
        <button type="button" className={quotationStyles.button} disabled={working || !rights.mayStartNew} title="Start a new bill." onClick={runNew}>
          {withKey("New", "new")}
        </button>
        {side.holdButton}
        <button
          type="button"
          className={quotationStyles.button}
          title="Save without moving stock or books."
          disabled={!canSaveDraft || !editable || working}
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title="Saves and posts in one step: the stock comes in, the supplier is credited."
          disabled={!canPost || !editable || working}
          onClick={() => runSave(true)}
        >
          {api.busy === "posting" ? "Posting…" : withKey("Post", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Edit this DRAFT."
          disabled={!canEdit || working}
          onClick={runEdit}
        >
          {withKey("Edit", "edit")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Undo a posted bill nothing has paid: stock out, books reversed."
          disabled={!canCancel || working}
          onClick={runCancel}
        >
          {api.busy === "cancelling" ? "Cancelling…" : withKey("Cancel", "cancelDoc")}
        </button>
        {side.navButtons}
        <button type="button" className={quotationStyles.button} disabled={working} onClick={() => leave("Open another")}>
          {withKey("Show List", "open")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={() => leave("Close")}>
          {withKey("Close", "close")}
        </button>
      </div>

      <PurchaseSourcePicker
        open={sourceOpen}
        choices={sourceChoices}
        onClose={() => setSourceOpen(false)}
        onPick={(kind, id) => (kind === "GRN" ? api.lines.fillFromGrn(id) : api.lines.fillFromPo(id))}
      />
      <PurchaseAgentPicker
        open={agentOpen}
        companyId={draft.companyId}
        onClose={() => setAgentOpen(false)}
        onPick={(agent) => api.dispatch({ type: "ext", patch: { agentId: agent.id, agentName: agent.name } })}
      />
      <PurchaseTransportDialog
        open={transportOpen}
        band={ext.transport}
        companyId={draft.companyId}
        readOnly={!editable}
        onClose={() => setTransportOpen(false)}
        onApply={(band) => api.dispatch({ type: "ext", patch: { transport: band, transportTouched: true } })}
      />
      {overrideAsk ? (
        <ReasonDialog
          title="Override the warnings"
          message="Why post past them? (kept on the bill's trail)"
          placeholder="Type the reason"
          onCancel={() => setOverrideAsk(false)}
          onConfirm={(reason) => {
            setOverrideAsk(false);
            void api.save(true, { reason }).then((ok) => ok && side.afterSave(true));
          }}
        />
      ) : null}

      <AdjustmentItemPicker
        isOpen={itemPicker !== null}
        initialQuery={itemPicker?.query ?? ""}
        companyId={draft.companyId}
        branchId={draft.branchId}
        onClose={closeItemPicker}
        onPick={onPickItem}
        onBarcode={onPickerBarcode}
      />
      {cancelAsk ? (
        <ReasonDialog
          title={`Cancel ${draft.refno}`}
          message="Why is this bill being cancelled?"
          placeholder="Type the reason"
          onCancel={() => setCancelAsk(false)}
          onConfirm={(reason) => {
            setCancelAsk(false);
            void api.cancelDocument(reason);
          }}
        />
      ) : null}
      {side.dialogs}
      <TxnKeysSheet
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        document={[...KEY_SHEET.document, ...SIDE_KEY_ROWS]}
        lines={KEY_SHEET.lines}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One F12 slot (BATCHES or SERIALS): the panel on its line, the need read live
// ---------------------------------------------------------------------------

function InvoiceAllocSlot({
  panel,
  draft,
  editable,
  onRows,
}: {
  panel: ReturnType<typeof usePurchaseAllocPanel>;
  draft: InvoiceDraft;
  editable: boolean;
  onRows: (key: string, rows: PurchaseAllocEntry[]) => void;
}) {
  const target = panel.target;
  const line = target ? draft.lines.find((candidate) => candidate.key === target.key) : undefined;
  const need = useMemo(
    () => (line ? allocNeedOf(line, { godownId: draft.godownId, godownName: draft.godownName }, draft.lineSettings) : null),
    [draft.godownId, draft.godownName, draft.lineSettings, line],
  );
  // Its line went (removed, another bill loaded) or turned into a GRN line: the panel goes too.
  const close = panel.close;
  const gone = target !== null && (!line || !rowHasItem(line) || rowFromGrn(line));
  useEffect(() => {
    if (gone) {
      close();
    }
  }, [close, gone]);
  const key = target?.key ?? "";
  const write = useCallback(
    (rows: PurchaseAllocEntry[]) => {
      if (key && editable) {
        onRows(key, rows);
      }
    },
    [editable, key, onRows],
  );
  if (!target || !need || gone) {
    return <div />;
  }
  return (
    <PurchaseAllocDialog
      key={target.seq}
      open
      embedded
      title={target.title}
      tip={target.tip}
      need={need}
      rows={target.rows}
      readOnly={!editable}
      readOnlyReason={
        draft.status === STATUS.draft ? "Read only — Edit (F2) first to change the batches." : "The bill is stored — its batches are as posted."
      }
      branchId={draft.branchId}
      onAccept={write}
      onEdited={write}
      onProblem={panel.onProblem}
      onClose={() => {
        close();
        window.requestAnimationFrame(() => window.setTimeout(() => focusLineCell(key, COL.Billed), 0));
      }}
    />
  );
}
