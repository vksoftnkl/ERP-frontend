"use client";

/**
 * Purchase Entry (menu 24) — the supplier's bill keyed as printed (Qt
 * `PurchaseInvoiceEntry`). A typed line is worked out at once (an estimate, Qt
 * dd59c2c P11); every money figure is then the server's — `POST
 * /purchase/invoices/validate`, or on a stored bill what the server stored. The
 * list lives on the same route (features/purchase/shared); Show List / Close go
 * back to it.
 *
 * The v2 screen (Qt NexERP 7d8c926, `purchase_invoice_entry.ui`, the 11-04
 * mockup), with 6b81080 / c0dbff1 / a639bc6 / 15b54ca:
 *
 *  - the title band: "Purchase Invoice — <Our No>" (D8) over the company line,
 *    the 17-button quick bar (COM-11, Qt `applyStatus`'s enable rules), and the
 *    created / modified line over the status pill (PE-27);
 *  - the header, 3 rows × 4 pairs with no vertical gap (no "THE HEADER" title,
 *    P13; no Mode box — the bill is credit, D4; no Our No — it is in the title);
 *    Enter walks it left to right, row by row, into the lines (P15); Tab leaves
 *    the lines for the charges, then TCS;
 *  - the pill row: the supplier's chips, Place of supply, Source (click or
 *    Ctrl+L), Transport (click or Alt+T), RCM when it applies;
 *  - the lines take every spare pixel (24 px rows, 15b54ca); the item strip;
 *  - the money band: charges | totals, half and half (P14, PE-35);
 *  - the footer: Payment hold… (posted), the notes one-liner ("2 warnings ·
 *    View", COM-09), the hint, the document buttons;
 *  - F12 = the batches / serials as a popup (c0dbff1, PE-14);
 *  - Save / Post with notes ask first in the COM-09 popup (a ticked Override
 *    asks for the reason); a refusal opens it too;
 *  - a successful Save / Post clears the screen (D7) and keeps the bill for
 *    Print ("Print PUR/… (just saved)?", COM-10);
 *  - Esc / New / Show List / Previous / Next / Pick held ask "This bill has
 *    changes that are not saved. Leave it?" while the bill is dirty (PE-15).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  FiBookOpen,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiCornerUpLeft,
  FiCreditCard,
  FiDownload,
  FiFileText,
  FiGitBranch,
  FiGrid,
  FiInbox,
  FiList,
  FiPaperclip,
  FiPercent,
  FiPrinter,
  FiTrendingUp,
  FiTruck,
} from "react-icons/fi";
import { cx } from "@/components/design-system/cx";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { DateField, DropdownCombo, Field, TextField } from "@/features/sales/quotation/components/fields";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { AdjustmentItemPicker, type AdjustmentItemPick } from "@/features/stocks/stock-adjustment/components/adjustment-item-picker";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { isoToDisplayDate } from "@/lib/date-format";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { toast } from "@/lib/notify";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectUserInfo } from "@/store/slices/authSlice";
import { PurchaseAgentDropdown } from "../../shared/components/purchase-agent-dropdown";
import { PurchaseAllocDialog } from "../../shared/components/purchase-alloc-dialog";
import { usePurchaseDropdownMasters } from "../../shared/components/purchase-dropdown-masters";
import { PurchaseNotesLine, PurchaseNotesPopup } from "../../shared/components/purchase-notes";
import { PurchaseStatusPill } from "../../shared/components/purchase-parts";
import { PurchaseQuickBar, type PurchaseQuickAction } from "../../shared/components/purchase-quick-bar";
import { PurchaseSourcePicker } from "../../shared/components/purchase-source-picker";
import { PurchaseTransportDialog } from "../../shared/components/purchase-transport-dialog";
import { allocPopupTitle } from "../../shared/purchase-alloc";
import type { PurchaseAllocEntry, PurchaseAllocNeed } from "../../shared/purchase-dialogs.types";
import { purchaseNotesOf, transportSummary } from "../../shared/purchase-parts";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import { money } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import type { BillFromPoHandoff, GrnHandoff } from "../../shared/purchase-handoff";
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
  STATUS,
  SUPPLIER_DROPDOWN_KEY,
} from "../invoice.constants";
import { dueText, placeOfSupplyText, priceKeptText, sourceText } from "../invoice-fidelity";
import { allocNeedOf, allocSeedOf } from "../invoice-lines";
import { gstBreakupRows, type GstBreakupRow } from "../invoice-figures";
import { isEditable, rowFromGrn, rowHasItem } from "../invoice.state";
import {
  INVOICE_QUICK_GROUPS,
  LEAVE_MESSAGE,
  LEAVE_TITLE,
  invoiceAuditParts,
  invoiceQuickRules,
  totalsFrameOf,
  type InvoiceQuickKey,
  type TotalsFrame,
} from "../invoice-v2";
import { usePurchaseInvoiceDraft } from "../use-purchase-invoice-draft";
import { SIDE_KEY_ROWS, useInvoiceSide } from "../use-invoice-side";
import { focusNextStopFrom } from "@/features/sales/quotation/components/grid-focus";
import { GstBreakupDialog } from "./gst-breakup-dialog";
import { focusBlankLineEntry, focusLineCell, focusLineGrid, InvoiceLineGrid } from "./invoice-line-grid";
import { ItemContextStrip } from "./item-context-strip";
import styles from "../page.module.scss";

const IDS = {
  supplier: "purchase-invoice-supplier",
  billFrom: "purchase-invoice-bill-from",
  goods: "purchase-invoice-goods-recd",
  creditDays: "purchase-invoice-credit-days",
  agent: "purchase-invoice-agent",
  invNo: "purchase-invoice-inv-no",
  invDate: "purchase-invoice-inv-date",
  docDate: "purchase-invoice-doc-date",
  godown: "purchase-invoice-godown",
  amount: "purchase-invoice-amount",
  remarks: "purchase-invoice-remarks",
} as const;

const AMOUNT_PATTERN = /^[\d,]*(\.\d{0,2})?$/;

/** The quick bar's glyphs — one set (Feather), so every icon draws the same size (Qt 721dabe). */
const QUICK_ICONS: Record<InvoiceQuickKey, ReactNode> = {
  fromSource: <FiDownload />,
  sister: <FiFileText />,
  pickHeld: <FiInbox />,
  batches: <FiGrid />,
  lastPurchases: <FiTrendingUp />,
  ledger: <FiBookOpen />,
  supplierDues: <FiList />,
  pay: <FiCreditCard />,
  returnBill: <FiCornerUpLeft />,
  returnLines: <FiGitBranch />,
  transport: <FiTruck />,
  attach: <FiPaperclip />,
  gstBreakup: <FiPercent />,
  previous: <FiChevronLeft />,
  next: <FiChevronRight />,
  history: <FiClock />,
  print: <FiPrinter />,
};

/** Commit the cell being typed in before anything reads the lines. */
function commitOpenEditor() {
  const active = document.activeElement as HTMLElement | null;
  if (active && active.closest(`[data-quotation-grid="${LINE_GRID_NAME}"]`)) {
    active.blur();
  }
}

type ItemPickerState = { key: string; query: string };

/** F12 open on a line (Qt `PurchaseAllocDialog::openPopup`). */
type AllocPopup = {
  key: string;
  title: string;
  need: PurchaseAllocNeed;
  rows: PurchaseAllocEntry[];
  editable: boolean;
  tip: string;
  seq: number;
};

/** The COM-09 popup: asked before a verb, a refusal the server gave, or View. */
type NotesAsk = { kind: "ask"; post: boolean } | { kind: "refused"; post: boolean } | { kind: "view" };

export type PurchaseInvoiceEntryViewProps = PurchaseEntryViewProps & {
  /** GRN's Make bill · Ctrl+B (shared/purchase-handoff.ts): a new bill on its supplier / godown, its lines brought in. */
  fromGrn?: GrnHandoff | null;
  /** PO's Make Purchase Invoice (shared/purchase-handoff.ts `?fromPo=`): a new bill on its supplier / godown, the PO's pending lines in. */
  fromPo?: BillFromPoHandoff | null;
};

export function PurchaseInvoiceEntryView({
  initialDocument,
  initialMode,
  onBackToList,
  memory,
  fromGrn,
  fromPo,
}: PurchaseInvoiceEntryViewProps) {
  const config = PURCHASE_DOC_TYPES.invoice;
  const api = usePurchaseInvoiceDraft(memory);
  const { draft, draftRef } = api;
  const { permissions } = usePagePermissions();
  const companySubtitle = usePurchaseCompanySubtitle();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  /** The Override right on menu 24 (the popup's ticks; the server is the gate). */
  const mayOverride = (permissions as { canOverride?: boolean } | undefined)?.canOverride === true;
  const userId = useAppSelector(selectAuthUserId);
  const userInfo = useAppSelector(selectUserInfo);

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const activeKey = useRef<string | null>(null);
  // PI-LINES: the line the item strip follows (settles 200 ms after the cursor, Qt m_stripTimer) and F12's line.
  const [stripKey, setStripKey] = useState<string | null>(null);
  const stripTimer = useRef<number | null>(null);
  const [alloc, setAlloc] = useState<AllocPopup | null>(null);
  const allocSeq = useRef(0);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(LINE_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  // Qt dd59c2c P4: the layout's columns, titles and order — less what the session's rules take away
  const columns = useMemo(() => resolveLineColumns(layout, draft.lineSettings), [draft.lineSettings, layout]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  /** P12 — the GST break-up on screen (null = closed). */
  const [gstBreakup, setGstBreakup] = useState<{ rows: GstBreakupRow[]; source: string } | null>(null);
  const [notesAsk, setNotesAsk] = useState<NotesAsk | null>(null);
  const [overrideAsk, setOverrideAsk] = useState(false);
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Purchase invoice lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule: Item on a blank line, Batch / Expiry on an item tracked by them, then Billed, Free, Rate, Disc %, Sch % and Extra disc. Markup A–D and Sell A–D show while the bill keys selling prices; Size, Colour and Model while the company numbers its own batches.",
  });
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);
  // Qt 6b81080 COM-05: Alt+C / Alt+A on Supplier, Agent and Godown open their masters (their own menu rights)
  const agentDropdownId = useDropdownId("purchaseAgent");
  usePurchaseDropdownMasters({ supplier: supplierDropdownId, agent: agentDropdownId, godown: godownDropdownId });

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
  // COM-07: a new bill → Supplier; an opened draft → its first blank line; a stored bill → the lines.
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
        if (request.target === "afterItem") {
          // Qt dd59c2c P15: on to the line's first typing cell after Item (Batch / Expiry for a tracked item, else Billed)
          if (!focusNextStopFrom(LINE_GRID_NAME, request.key, String(COL.Item))) {
            focusLineCell(request.key, COL.Billed);
          }
          return;
        }
        const current = draftRef.current;
        if (request.target === "supplier" || (isEditable(current) && !current.piId && !current.supplierId)) {
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

  /** F2 on a draft (COM-07): the cursor into the lines, on the first blank line. */
  const focusLines = useCallback(() => {
    const current = draftRef.current;
    const line = current.lines.find((candidate) => !rowHasItem(candidate)) ?? current.lines[current.lines.length - 1];
    if (!line || !focusBlankLineEntry(line.key)) {
      focusLineGrid();
    }
  }, [draftRef]);

  // ---------------------------------------------------------------- guards
  /** PE-15 (Qt confirmLeave): one question, every way off a bill with unsaved changes. */
  const confirmLeave = useCallback(async () => {
    if (!draftRef.current.dirty) {
      return true;
    }
    return confirm({ title: LEAVE_TITLE, message: LEAVE_MESSAGE, confirmLabel: "Leave it", cancelLabel: "Stay" });
  }, [draftRef]);
  const guardDirty = useCallback(
    (then: () => void) => {
      void confirmLeave().then((yes) => {
        if (yes) {
          then();
        }
      });
    },
    [confirmLeave],
  );

  // ---------------------------------------------- header / side (PI-HEADER)
  const side = useInvoiceSide({
    api,
    editable,
    guardDirty,
    confirmLeave,
    focusLines,
    keysEnabled:
      !gridSettings.active &&
      itemPicker === null &&
      !cancelAsk &&
      !sourceOpen &&
      !transportOpen &&
      !overrideAsk &&
      gstBreakup === null &&
      alloc === null &&
      notesAsk === null,
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

  /**
   * Qt `openAllocs` + c0dbff1 `openPopup` — F12: the line's batches / serials in a
   * modal popup; Σ must equal what came in (received + damaged + free) before OK.
   */
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
      allocSeq.current += 1;
      setAlloc({
        key: line.key,
        title: allocPopupTitle(index + 1, line.itemName, need.serial),
        need,
        rows: allocSeedOf(line, need),
        editable: isEditable(current),
        tip: line.itemName,
        seq: allocSeq.current,
      });
    },
    [api, draftRef],
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

  /** From GRN / PO · Ctrl+L (and the Source pill) — Qt `openSourcePicker`. */
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
  // GRN → Make bill (Qt makeBill) / PO → Make Purchase Invoice (Qt makeInvoice): the supplier and godown first;
  // the source's lines once its list (From GRN / From PO) has it
  const handoff = fromGrn ?? fromPo ?? null;
  const handoffStage = useRef<"supplier" | "lines" | "done">(handoff ? "supplier" : "done");
  useEffect(() => {
    if (!handoff || handoffStage.current !== "supplier" || !isEditable(draftRef.current)) {
      return;
    }
    handoffStage.current = "lines";
    side.onSupplierPicked(handoff.supplierId, handoff.supplierName);
    if (handoff.godownId) {
      api.setGodown(handoff.godownId, handoff.godownName ?? "");
    }
  }, [api, draftRef, handoff, side]);
  useEffect(() => {
    if (handoffStage.current !== "lines") {
      return;
    }
    if (fromGrn && api.lines.grnOptions.some((option) => option.id === fromGrn.grnId)) {
      handoffStage.current = "done";
      api.lines.fillFromGrn(fromGrn.grnId);
    } else if (!fromGrn && fromPo && api.lines.poOptions.some((option) => option.id === fromPo.poId)) {
      handoffStage.current = "done";
      api.lines.fillFromPo(fromPo.poId);
    }
  }, [api.lines, fromGrn, fromPo]);

  /** P12 — the bill's GST by rate: the server's break-up, else the lines grouped (Qt showGstBreakup). */
  const openGstBreakup = useCallback(() => {
    commitOpenEditor();
    window.setTimeout(() => {
      const breakup = gstBreakupRows(draftRef.current);
      if (breakup.rows.length === 0) {
        api.setHint("No line has its figures yet — key a line first.");
        return;
      }
      setGstBreakup(breakup);
    }, 0);
  }, [api, draftRef]);

  /** Transport (Qt openTransport): the pill, the quick button, Alt+T. A cancelled bill without a band has none to show. */
  const openTransport = useCallback(() => {
    const current = draftRef.current;
    if (current.status === STATUS.cancelled && !current.ext.transport) {
      return;
    }
    setTransportOpen(true);
  }, [draftRef]);

  // Ctrl+L (Qt key(Ctrl+L)) — the browser's address-bar chord is taken back while the page has focus — and
  // Transport: Qt's Ctrl+Shift+T is the browser's own "reopen tab" (never reaches the page), so Alt+T too.
  const screenKeys = useRef({ openSourcePicker, openTransport });
  useLayoutEffect(() => {
    screenKeys.current = { openSourcePicker, openTransport };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      const letter = event.key.toLowerCase();
      if (ctrl && !event.altKey && !event.shiftKey && letter === "l") {
        event.preventDefault();
        if (!event.repeat) {
          screenKeys.current.openSourcePicker();
        }
      } else if ((ctrl && event.shiftKey && !event.altKey && letter === "t") || (event.altKey && !ctrl && !event.shiftKey && letter === "t")) {
        event.preventDefault();
        if (!event.repeat) {
          screenKeys.current.openTransport();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ------------------------------------------------------------ actions
  /** Save / Post went through (D7): the after-post steps, then a clean screen on Supplier. */
  const doSave = useCallback(
    async (post: boolean, override?: { reason: string }) => {
      const outcome = await api.save(post, override);
      if (outcome.ok) {
        side.afterSave(outcome.saved, outcome.post);
        api.newDocument();
        // The Saved popup (and the labels question after a post) take the focus; once they are gone and the
        // cursor is nowhere, it goes to Supplier (Qt resetScreen → focus Supplier, COM-07).
        let tries = 0;
        const refocus = () => {
          if (document.querySelector('[aria-modal="true"]')) {
            tries += 1;
            if (tries < 200) {
              window.setTimeout(refocus, 150);
            }
            return;
          }
          const active = document.activeElement;
          if (!active || active === document.body) {
            api.requestFocus({ target: "entryStart" });
          }
        };
        window.setTimeout(refocus, 150);
      } else if (outcome.refused) {
        // COM-09 (Qt showRefusal): the refused rows beside the warnings, in the popup
        setNotesAsk({ kind: "refused", post });
      }
    },
    [api, side],
  );

  /** A Save / Post being checked (the fresh /validate below): a second press waits. */
  const checking = useRef(false);
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy || checking.current) {
        return;
      }
      checking.current = true;
      commitOpenEditor();
      // The commit above lands synchronously in the draft ref; read it next tick.
      window.setTimeout(async () => {
        // COM-09 asks on what the server says NOW: an edit that schedules no recalculation (the invoice no)
        // must not leave an old refusal holding Post off
        try {
          if (isEditable(draftRef.current)) {
            await api.recalcNow();
          }
        } finally {
          checking.current = false;
        }
        const current = draftRef.current;
        // COM-09: what /validate said is shown at Save / Post (Back / the verb), not on the page
        if (purchaseNotesOf(current.issues?.warnings, current.issues?.refusals).notes.length > 0) {
          setNotesAsk({ kind: "ask", post });
          return;
        }
        if (!post) {
          void doSave(false);
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
            void doSave(true);
          }
        });
      }, 0);
    },
    [api, doSave, draftRef],
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
    guardDirty(() => {
      side.dropAutosave();
      api.newDocument();
    });
  }, [api, guardDirty, side]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      api.requestFocus({ target: "entryStart" });
    }
  }, [api]);

  /** Show List (Ctrl+O) / Close (Esc): back to the list, asking first while the bill has unsaved changes. */
  const leave = useCallback(() => {
    guardDirty(() => {
      api.forgetRemembered();
      side.dropAutosave();
      onBackToList();
    });
  }, [api, guardDirty, onBackToList, side]);

  // ------------------------------------------------------------ shortcuts
  const overlaysClosed =
    !gridSettings.active &&
    itemPicker === null &&
    !cancelAsk &&
    !side.dialogOpen &&
    !sourceOpen &&
    !transportOpen &&
    !overrideAsk &&
    gstBreakup === null &&
    alloc === null &&
    notesAsk === null;
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft && editable ? () => runSave(false) : null,
      post: !working && canPost && editable ? () => runSave(true) : null,
      edit: !working ? (canEdit ? runEdit : side.explainEdit) : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      open: !working ? leave : null,
      close: !working ? leave : null,
      previous: !working ? side.keys.previous : null,
      next: !working ? side.keys.next : null,
      history: side.keys.history,
      print: side.keys.print,
    },
    { onHelp: () => setKeysOpen(true), enabled: overlaysClosed },
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

  /** P15 — Enter and Tab walk the header as it reads, left to right, row by row; the last field hands over to the lines. */
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

  // ------------------------------------------------------------- render
  const at = (row: number, column: number, columnSpan = 1) => ({
    gridRow: row,
    gridColumn: columnSpan > 1 ? `${column} / span ${columnSpan}` : String(column),
  });
  const ext = draft.ext;
  const facts = draft.facts;
  const issues = draft.issues;
  const sourceLine = sourceText(draft.lines);
  const transportText = transportSummary(ext.transport);
  const posText = placeOfSupplyText(facts, side.billFrom, ext.billFromGstin);
  const keptLines = draft.lines.flatMap((line, index) => (rowHasItem(line) && line.priceKept ? [index + 1] : []));
  // P11: while an edit waits for the server the totals are the lines' own (Qt paintLive)
  const frame = totalsFrameOf(draft.liveTotals ?? draft.serverTotals, facts.interState);
  const auditParts = invoiceAuditParts(draft.audit ?? {}, { userId, userName: userInfo?.userName });
  const busySide = side.working;

  // the quick bar (Qt applyStatus): each button, its key, and why not while it can't run
  const quickRules = invoiceQuickRules({
    status: draft.status,
    saved,
    editable,
    supplierId: draft.supplierId,
    mayStartNew: rights.mayStartNew,
    lastSavedRef: side.lastSaved ? side.lastSaved.refno || side.lastSaved.id : null,
    working: working || busySide,
  });
  const quickRun: Record<InvoiceQuickKey, () => void> = {
    fromSource: openSourcePicker,
    sister: side.actions.sister,
    pickHeld: side.actions.pickHeld,
    batches: () => openAllocs(activeKey.current),
    lastPurchases: () => undefined,
    ledger: side.actions.ledger,
    supplierDues: side.actions.supplierDues,
    pay: side.actions.payThisBill,
    returnBill: side.actions.returnFromBill,
    returnLines: side.actions.returnFromBill, // today: the whole bill (Qt: PE-17 comes later)
    transport: openTransport,
    attach: side.actions.attach,
    gstBreakup: openGstBreakup,
    previous: side.actions.previous,
    next: side.actions.next,
    history: side.actions.history,
    print: side.actions.print,
  };
  const quickGroups: PurchaseQuickAction[][] = INVOICE_QUICK_GROUPS.map((group) =>
    group.map((key) => ({ key, ...quickRules[key], icon: QUICK_ICONS[key], onClick: quickRun[key] })),
  );
  const notesPost = notesAsk?.kind === "ask" || notesAsk?.kind === "refused" ? notesAsk.post : false;
  const title = draft.refno ? `Purchase Invoice — ${draft.refno}` : "Purchase Invoice — new";

  return (
    <div className={cx(quotationStyles.page, styles.page)}>
      {/* ── the title band (Qt frameHeader): title · company ··· quick bar ··· created / modified over the status ── */}
      <div className={styles.titleBand}>
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} tabIndex={-1} onClick={leave}>
              ‹ {config.listTitle}
            </button>
            <h1 className={quotationStyles.title}>{title}</h1>
          </div>
          <span className={styles.subtitle}>{companySubtitle}</span>
        </div>
        <PurchaseQuickBar label="Purchase entry actions" groups={quickGroups} onRefused={api.setHint} className={styles.quickBar} />
        <div className={styles.auditBlock}>
          {auditParts.length > 0 ? (
            <span className={styles.audit} title="Who entered this bill, and who last changed it">
              {auditParts.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </span>
          ) : null}
          <div className={styles.statusLine}>
            {draft.viewMode === "browse" && isDraft && saved ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.busy}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
            <PurchaseStatusPill
              status={draft.paymentHold && draft.status === STATUS.posted ? "ON_HOLD" : draft.status}
              label={side.statusText}
              title="DRAFT, POSTED or CANCELLED."
            />
          </div>
        </div>
      </div>

      {/* ── the header (Qt gridFields): 3 rows × 4 pairs, no vertical gap, in the Enter / Tab order ── */}
      <div className={styles.headerGrid} onKeyDown={onHeaderKeyDown}>
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
            onChange={(value) => api.setHeader({ supplierInvNo: value })}
          />
        </div>
        <div className={styles.pair} style={at(1, 4)}>
          <DateField id={IDS.invDate} label="Inv Date" value={draft.supplierInvDate} disabled={!editable} onChange={(value) => api.setHeader({ supplierInvDate: value })} />
        </div>
        {/* row 2 — Inv Amount · Entry date · Goods recd · Godown */}
        <div className={styles.pair} style={at(2, 1)}>
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
        <div className={styles.pair} style={at(2, 2)}>
          <DateField id={IDS.docDate} label="Entry date" value={draft.docDate} disabled={!editable} onChange={(value) => api.setHeader({ docDate: value })} />
        </div>
        <div className={styles.pair} style={at(2, 3)} title="When the goods came in (from the GRN, or typed on a direct bill) — the MSME due date and ITC run from it">
          <DateField
            id={IDS.goods}
            label="Goods recd"
            value={ext.goodsReceivedOn}
            disabled={!editable}
            onChange={(value) => api.dispatch({ type: "ext", patch: { goodsReceivedOn: value, goodsTyped: Boolean(value) } })}
          />
        </div>
        <div className={styles.pair} style={at(2, 4)}>
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
        {/* row 3 — Credit days (→ due, in one box) · Agent · Remarks over the last two pairs */}
        <div className={styles.pair} style={at(3, 1)}>
          <Field label="Credit days" htmlFor={IDS.creditDays}>
            <span className={styles.creditBox}>
              <input
                id={IDS.creditDays}
                className={cx(quotationStyles.input, styles.creditInput)}
                value={ext.creditDays}
                disabled={!editable}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                title="Days the supplier gives to pay — the due date follows"
                data-quotation-focus={IDS.creditDays}
                onChange={(event) => api.dispatch({ type: "ext", patch: { creditDays: event.target.value.replace(/\D/g, ""), creditDaysTyped: true } })}
              />
              <span className={styles.dueInBox} title={facts.msmeDueDate ? `MSME: pay by ${isoToDisplayDate(facts.msmeDueDate)}` : undefined}>
                {dueText(facts)}
              </span>
            </span>
          </Field>
        </div>
        <div className={styles.pair} style={at(3, 2)}>
          <PurchaseAgentDropdown
            id={IDS.agent}
            companyId={draft.companyId}
            value={ext.agentId}
            selectedLabel={ext.agentName}
            disabled={!editable}
            onSelect={(id, name) => api.dispatch({ type: "ext", patch: { agentId: id, agentName: id ? name : "" } })}
          />
        </div>
        <div className={cx(styles.pair, styles.pairWide)} style={at(3, 3, 2)}>
          <TextField id={IDS.remarks} label="Remarks" value={draft.remarks} disabled={!editable} maxLength={500} onChange={(value) => api.setHeader({ remarks: value })} />
        </div>
      </div>

      {/* ── the pill row (Qt framePills): chips · Place of supply · Source · Transport · RCM — not in the Tab walk ── */}
      <div className={styles.pillRow}>
        {side.chips}
        {posText ? (
          <span
            className={cx(styles.pill, styles.pillTeal)}
            title="Place of supply — the state the goods are supplied to; local = CGST + SGST, inter-state = IGST"
          >
            Place of supply&nbsp; {posText}
          </span>
        ) : null}
        <button
          type="button"
          className={cx(styles.pill, styles.pillSource, styles.pillButton)}
          tabIndex={-1}
          disabled={!editable}
          title="Where the lines come from — click or Ctrl+L brings in a GRN or a PO"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openSourcePicker}
        >
          Source&nbsp; {sourceLine} ▾
        </button>
        <button
          type="button"
          className={cx(styles.pill, styles.pillButton)}
          tabIndex={-1}
          disabled={draft.status === STATUS.cancelled && !ext.transport}
          title="Transport — LR, transporter, vehicle and driver: click or Alt+T"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openTransport}
        >
          Transport&nbsp; {transportText || "—"} ▾
        </button>
        {facts.isReverseCharge ? (
          <span
            className={cx(styles.pill, styles.pillWarning)}
            title={
              facts.reverseChargeReason
                ? `Reverse charge — ${facts.reverseChargeReason}. The GST on this bill is paid by us, not by the supplier.`
                : "Reverse charge — this bill's GST is paid by us, not by the supplier"
            }
          >
            Reverse charge (RCM)
          </span>
        ) : null}
      </div>

      {/* ── the lines: every spare pixel (PE-30) ── */}
      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        {gridSettings.overlays}
        <InvoiceLineGrid
          lines={draft.lines}
          columns={columns}
          editable={editable}
          awaitingServer={draft.awaitingServer}
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
      <ItemContextStrip line={stripLine} supplierId={draft.supplierId} contextFor={api.lines.contextFor} epoch={api.lines.contextEpoch} />
      {keptLines.length > 0 ? <p className={styles.priceKept}>{priceKeptText(keptLines)}</p> : null}

      {/* ── the money band (Qt frameMoney): charges | totals, half and half ── */}
      <div className={styles.moneyBand}>
        <div className={styles.moneyCharges}>{side.chargesGrid}</div>
        <InvoiceTotalsFrame frame={frame} tcsInput={side.tcsInput} />
      </div>

      {/* ── the footer (Qt frameButtons): Payment hold… · the notes · the hint · the document buttons ── */}
      <div className={styles.footer}>
        {side.paymentHoldButton}
        <PurchaseNotesLine warnings={issues?.warnings} refusals={issues?.refusals} onView={() => setNotesAsk({ kind: "view" })} />
        <p className={styles.footerHint} role="status" title={draft.hint || undefined}>
          {draft.hint}
        </p>
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
        <button type="button" className={quotationStyles.button} title="Edit this DRAFT." disabled={!canEdit || working} onClick={runEdit}>
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
        <button type="button" className={quotationStyles.button} disabled={working} onClick={leave}>
          {withKey("Show List", "open")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={leave}>
          {withKey("Close", "close")}
        </button>
      </div>

      <PurchaseSourcePicker
        open={sourceOpen}
        choices={sourceChoices}
        onClose={() => setSourceOpen(false)}
        onPick={(kind, id) => (kind === "GRN" ? api.lines.fillFromGrn(id) : api.lines.fillFromPo(id))}
      />
      <GstBreakupDialog breakup={gstBreakup} onClose={() => setGstBreakup(null)} />
      <PurchaseTransportDialog
        open={transportOpen}
        band={ext.transport}
        companyId={draft.companyId}
        readOnly={!editable}
        onClose={() => setTransportOpen(false)}
        onApply={(band) => api.dispatch({ type: "ext", patch: { transport: band, transportTouched: true } })}
      />
      {/* F12 — the line's batches / serials (Qt c0dbff1 openPopup); the focus goes back to the opener */}
      <PurchaseAllocDialog
        key={alloc?.seq ?? 0}
        open={alloc !== null}
        title={alloc?.title ?? ""}
        tip={alloc?.tip}
        need={alloc?.need ?? { received: 0, damaged: 0, free: 0, serial: false, textile: false, godownId: "", godownName: "" }}
        rows={alloc?.rows ?? []}
        readOnly={!alloc?.editable}
        readOnlyReason={
          draft.status === STATUS.draft ? "Read only — Edit (F2) first to change the batches." : "The bill is stored — its batches are as posted."
        }
        branchId={draft.branchId}
        onAccept={(rows) => {
          const target = alloc;
          setAlloc(null);
          if (target?.editable) {
            api.lines.setAllocs(target.key, rows);
          }
        }}
        onClose={() => setAlloc(null)}
      />
      {/* COM-09 — the notes at Save / Post (Back / the verb), a refusal, or View */}
      <PurchaseNotesPopup
        open={notesAsk !== null}
        warnings={issues?.warnings}
        refusals={issues?.refusals}
        verb={notesAsk?.kind === "ask" ? (notesAsk.post ? { key: "post", label: "Post" } : { key: "save", label: "Save Draft" }) : null}
        refused={notesAsk?.kind === "refused" ? (notesPost ? "post" : "save") : null}
        overrideAllowed={mayOverride && isDraft}
        noOverride={!notesPost}
        onBack={() => {
          setNotesAsk(null);
          api.requestFocus({ target: "entryStart" }); // back to where the bill is keyed (Qt: the lines)
        }}
        onProceed={(overrides) => {
          const post = notesPost;
          setNotesAsk(null);
          if (post && overrides.length > 0) {
            setOverrideAsk(true); // a ticked row asks for the reason (Qt confirmPost)
            return;
          }
          void doSave(post);
        }}
      />
      {overrideAsk ? (
        <ReasonDialog
          title="Override the warnings"
          message="Why go past them? (kept on the bill's trail)"
          placeholder="Type the reason"
          onCancel={() => setOverrideAsk(false)}
          onConfirm={(reason) => {
            setOverrideAsk(false);
            void doSave(true, { reason });
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
// The totals frame (Qt frameTotals, PE-35): Net payable large, the printed
// amount and the Difference pill; the break-up in two columns with TCS typed
// here; the ITC pills and, muted, our own costs and the short parked.
// ---------------------------------------------------------------------------

const FRAME_TONE: Record<"good" | "warn" | "bad" | "muted", string> = {
  good: styles.toneGood,
  warn: styles.toneWarn,
  bad: styles.toneBad,
  muted: styles.toneMuted,
};

function InvoiceTotalsFrame({ frame, tcsInput }: { frame: TotalsFrame; tcsInput: ReactNode }) {
  const cell = (item: TotalsFrame["left"][number]) => (
    <div key={item.key} className={styles.frameCell} data-total={item.key}>
      <span className={styles.frameCap}>{item.caption}</span>
      {item.key === "tcs" ? (
        <span className={styles.frameTcs}>{tcsInput}</span>
      ) : (
        <span className={cx(styles.frameValue, item.tone && FRAME_TONE[item.tone])}>{item.value}</span>
      )}
    </div>
  );
  return (
    <section className={styles.totalsFrame} aria-label="Totals">
      <div className={styles.frameNet}>
        <span className={styles.frameCap}>NET PAYABLE</span>
        <span className={styles.frameNetValue} data-total="netPayable">
          {frame.net}
        </span>
        <div className={styles.frameCell}>
          <span className={styles.frameCap}>Invoice amount (printed)</span>
          <span className={styles.frameValue} data-total="invoiceAmountPrinted">
            {frame.printed}
          </span>
        </div>
        {frame.difference ? (
          <span
            className={cx(styles.pill, frame.difference.tone === "good" ? styles.pillGood : styles.pillBad)}
            title="Invoice amount as printed − net payable worked out here"
            data-total="difference"
          >
            {frame.difference.text}
          </span>
        ) : null}
      </div>
      <div className={styles.frameBreak}>
        <div className={styles.frameColumn}>{frame.left.map(cell)}</div>
        <div className={styles.frameColumn}>{frame.right.map(cell)}</div>
        {frame.itc.length > 0 || frame.ownCosts ? (
          <div className={styles.frameItc}>
            {frame.itc.map((pill) => (
              <span
                key={pill.key}
                className={cx(styles.pill, pill.tone === "good" ? styles.pillGood : pill.tone === "warn" ? styles.pillWarning : styles.pillBad)}
                title={
                  pill.key === "eligible"
                    ? "Input tax credit you can claim on this bill"
                    : pill.key === "pending"
                      ? "Credit on goods billed but not received — claimable once they come, or the credit note does"
                      : "Credit that cannot be claimed (blocked, ineligible, or a short absorbed as our own loss)"
                }
              >
                {pill.text}
              </span>
            ))}
            {frame.ownCosts ? (
              <span
                className={styles.frameMuted}
                title="Not on the supplier's bill: our own costs (off-bill charges) go into the item cost; the short qty is parked for the supplier to send or credit"
              >
                {frame.ownCosts}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
