"use client";

/**
 * Purchase Order (menu 23) — the entry screen, the Qt `PurchaseOrderEntry`
 * (NexERP fc46bde; plan-purchase-frontend F3).
 *
 * The header (supplier, PO date, expected date, deliver-to godown, contact,
 * remarks), the lines with the SERVER's figures painted back
 * (/purchase/orders/validate), and Save Draft / Confirm / Cancel / Short-close.
 * Confirm writes no stock and no books: it opens the PO for GRNs and bills. A
 * loaded PO shows what was received and what is still pending per line.
 *
 * DOC-01 (Qt 6c6b5c2): Amend a confirmed PO (lines keep their ids, Save
 * amendment = revision + 1, asks why), Versions…, Clone, Merge… the
 * supplier's pending POs into one draft, Approve / Not approve… a PO waiting
 * for approval; a new PO says when the supplier has orders pending.
 *
 * Keys (the shared TxnKeys; Qt 7c809f9 `PurchaseDocNav`): Alt+N New, Ctrl+S
 * Save Draft, Ctrl+Enter Confirm / Save amendment, F2 Edit (a draft) or Amend
 * (a confirmed PO), Alt+X Cancel PO, Ctrl+P Print, Ctrl+H History,
 * Alt+PgUp / Alt+PgDn the previous / next PO, Ctrl+O Show List, Esc Close,
 * F1 the sheet.
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
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURCHASE_DOC_TYPES } from "@/features/purchase/shared/purchase.doc-types";
import { money } from "@/features/purchase/shared/purchase.format";
import { PurchaseAgentPicker } from "@/features/purchase/shared/components/purchase-agent-picker";
import {
  PurchasePickerBox,
  PurchaseSectionHeading,
  PurchaseStatusPill,
  PurchaseTotalsStrip,
} from "@/features/purchase/shared/components/purchase-parts";
import { useGetPurchaseChargeMasterQuery, useGetPurchaseSettingsQuery } from "@/features/purchase/shared/purchase.api";
import { buildGrnFromPoHref } from "@/features/purchase/shared/purchase-handoff";
import { usePurchaseCompanySubtitle } from "@/features/purchase/shared/use-purchase-scope";
import { normalizeWhatsappNumber, whatsappChatUrl } from "@/features/sales/salebill/salebill.whatsapp";
import { useRouter } from "next/navigation";
import { isoToDisplayDate } from "@/lib/date-format";
import { baseApi } from "@/store/api/baseApi";
import type { PurchaseEntryViewProps } from "@/features/purchase/shared/purchase.types";
import { DateField, DropdownCombo, Field, ReadOnlyInput, TextField } from "@/features/sales/quotation/components/fields";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { focusCell } from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import {
  AdjustmentItemPicker,
  type AdjustmentItemPick,
} from "@/features/stocks/stock-adjustment/components/adjustment-item-picker";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { documentRights } from "@/lib/permissions/document-rights";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { resolvePoColumns } from "../purchase-order.columns";
import {
  COL,
  GODOWN_DROPDOWN_KEY,
  PO_FALLBACK_TITLES,
  PO_LINE_GRID_NAME,
  PURCHASE_ORDER_LINES_UI_TABLE_KEY,
  PO_TERMS_DROPDOWN_KEY,
  PURCHASE_ORDER_PRINT_PURPOSE,
  SUPPLIER_DROPDOWN_KEY,
} from "../purchase-order.constants";
import {
  approvalText,
  poPillStatus,
  poPillTone,
  poStripCells,
  revisionText,
  shortCloseLines,
  type ReorderSuggestion,
} from "../po-fidelity";
import {
  amendProblem,
  awaitingApproval,
  cancellable,
  isEditable,
  mergeable,
  mergeChoices,
  revisionRows,
  rowHasItem,
  shortClosable,
  supplierEditable,
  titleLine,
  whyNotRemovable,
  type MergeChoice,
  type RevisionRow,
} from "../purchase-order.state";
import { usePurchaseOrderDraft } from "../use-purchase-order-draft";
import { AmendReasonDialog, PoMergeDialog, PoRevisionsDialog } from "./po-dialogs";
import { PoChargesGrid } from "./po-charges-grid";
import { PoChoiceMenu, PoReorderDialog, PoShortCloseDialog } from "./po-rebuild-dialogs";
import { focusPoBlankLine, focusPoGrid, PoLineGrid } from "./po-line-grid";
import styles from "../page.module.scss";

const CONFIG = PURCHASE_DOC_TYPES.order;

const IDS = {
  supplier: "purchase-order-supplier",
  date: "purchase-order-date",
  expected: "purchase-order-expected",
  refno: "purchase-order-no",
  godown: "purchase-order-godown",
  contact: "purchase-order-contact",
  remarks: "purchase-order-remarks",
  agent: "purchase-order-agent",
  revision: "purchase-order-revision",
  creditDays: "purchase-order-credit-days",
  approval: "purchase-order-approval",
  terms: "purchase-order-terms",
} as const;

/** GET /account-ledger-masters/get?ledId — the supplier's WhatsApp / phones (Qt ledgerContact). */
const ledgerContactApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    purchaseOrderLedgerContact: builder.mutation<Record<string, unknown>, { ledId: string }>({
      query: (params) => ({ url: "/account-ledger-masters/get", method: "GET", params }),
      transformResponse: (payload: { data?: unknown }) => {
        const data = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
        return (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      },
    }),
  }),
});

const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Item list (type a name in Barcode)", keyText: "↓" },
  { label: "Go to the blank line", keyText: "+" },
  { label: "Remove a line", keyText: "−" },
  { label: "Next cell", keyText: "Enter" },
  { label: "Leave the grid", keyText: "Tab" },
];

const LINE_EXTRA_KEYS: readonly TxnKeyRow[] = [
  { label: "Reorder suggestions into this order", keyText: "F7" },
  { label: "Make a GRN against this order", keyText: "Ctrl+G" },
  { label: "Versions of the order (on Revision)", keyText: "F4" },
  { label: "Pick the agent (on Agent)", keyText: "F4" },
];

const KEY_SHEET = keySheetRows(
  [
    "new",
    "saveDraft",
    { action: "post", label: "Post / Save amendment" },
    { action: "edit", label: "Edit (draft) / Amend (confirmed)" },
    { action: "cancelDoc", label: "Cancel PO" },
    "print",
    "history",
    "previous",
    "next",
    "open",
    "close",
  ],
  [...LINE_KEYS, ...LINE_EXTRA_KEYS],
);

type ItemPickerState = { key: string; query: string; origin: number };
type ReasonAsk = "cancel" | "notApprove" | null;
type MenuKind = "cloneMerge" | "send" | null;
type MergeState = { choices: MergeChoice[]; initiallyTicked: string; supplierName: string };
type RevisionsState = { refno: string; rows: RevisionRow[] };

export function PurchaseOrderEntryView({ initialDocument, initialMode, onBackToList, memory }: PurchaseEntryViewProps) {
  const api = usePurchaseOrderDraft(memory);
  const { draft, draftRef } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const companySubtitle = usePurchaseCompanySubtitle();
  const router = useRouter();
  const { data: settings, isError: settingsFailed } = useGetPurchaseSettingsQuery(
    { companyId: draft.companyId, branchId: draft.branchId },
    { skip: !draft.companyId || !draft.branchId },
  );
  // −1 = not known (no View on menu 24, or not answered yet)
  const approvalAbove = settings ? Number(settings.poApprovalAbove) || 0 : settingsFailed ? -1 : -1;
  const { data: chargeMasters = [] } = useGetPurchaseChargeMasterQuery();
  const [contactMutation] = ledgerContactApi.usePurchaseOrderLedgerContactMutation();
  const termsDropdownId = useDropdownId(PO_TERMS_DROPDOWN_KEY);
  const termsParams = useMemo(() => ({ icompany_id: draft.companyId }), [draft.companyId]);
  const [agentOpen, setAgentOpen] = useState(false);
  /** The current line (for Short close…'s tick), as state: render reads it. */
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuKind>(null);
  const [shortCloseOpen, setShortCloseOpen] = useState(false);
  const [reorderRows, setReorderRows] = useState<ReorderSuggestion[] | null>(null);

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const [amendAsk, setAmendAsk] = useState(false);
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [revisions, setRevisions] = useState<RevisionsState | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const activeKey = useRef<string | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(PURCHASE_ORDER_LINES_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolvePoColumns(layout), [layout]);
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, PO_FALLBACK_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Purchase order lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule: Barcode and Item on a blank line, then Qty, Rate and Disc % on a line.",
  });
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);

  // ------------------------------------------------------- what may be done
  const editable = isEditable(draft);
  const draftStatus = draft.status === "DRAFT";
  const amending = draft.amending && draft.status === "POSTED";
  const saved = Boolean(draft.poId);
  const working = api.busy !== null;
  // The server's amend = Edit + Post + Amend on menu 23 (the save of a confirmed PO).
  const mayAmendRight = rights.mayAmend && permissions.canEdit && rights.mayPost;
  const canSaveDraft = draftStatus && editable && rights.maySaveDraft(saved);
  const canConfirm = editable && (amending ? mayAmendRight : draftStatus && rights.mayPost);
  const canEdit = draftStatus && saved && draft.viewMode === "browse" && rights.mayEdit;
  const canAmend = !amendProblem(draft) && !amending && mayAmendRight;
  const canCancel = cancellable(draft) && rights.mayCancelDocument(draft.status === "POSTED");
  // The server judges short-close on the menu's EDIT right.
  const canShortClose = shortClosable(draft) && permissions.canEdit;
  // Clone = Create; Merge = Create + Edit (it short-closes the sources); Approve = Override.
  const canClone = saved && !amending && permissions.canCreate;
  const canMerge = mergeable(draft) && permissions.canCreate && permissions.canEdit;
  const awaiting = awaitingApproval(draft);
  const canApprove = awaiting && permissions.canOverride;
  const pillStatus = poPillStatus(draft);
  const hasPending = draft.status === "POSTED" && draft.lines.some((line) => line.lineId && (line.pending ?? 0) > 0);
  const feedsGrn =
    draft.status === "POSTED" && !amending && hasPending && draft.approvalStatus !== "AWAITING" && draft.approvalStatus !== "REJECTED";

  // ---------------------------------------------------------- open a doc
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument?.id ?? " new";
    if (opened.current === target) {
      return;
    }
    opened.current = target;
    if (memory?.resume && api.resumed) {
      api.finishResume();
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
        const current = draftRef.current;
        switch (request.target) {
          case "cell":
            if (!focusCell(PO_LINE_GRID_NAME, request.key, String(request.column))) {
              focusPoBlankLine(request.key);
            }
            return;
          case "supplier":
            document.getElementById(IDS.supplier)?.focus();
            return;
          case "grid":
            focusPoGrid();
            return;
          default: {
            if (!isEditable(current)) {
              focusPoGrid();
              return;
            }
            if (!current.supplierId) {
              document.getElementById(IDS.supplier)?.focus();
              return;
            }
            const blank = current.lines.find((line) => !rowHasItem(line));
            if (blank) {
              focusPoBlankLine(blank.key);
            } else {
              focusPoGrid();
            }
          }
        }
      }, 0),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [draftRef, api.focusRequest]);

  // ---------------------------------------------------------------- guards
  const guardDirty = useCallback(
    async (title: string, message: string): Promise<boolean> => {
      if (!draftRef.current.dirty) {
        return true;
      }
      return confirm({ title, message, confirmLabel: "Discard" });
    },
    [draftRef],
  );

  // ------------------------------------------------------------ the lines
  const openItemPicker = useCallback(
    (key: string, query: string) => {
      if (!isEditable(draftRef.current)) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query, origin: COL.Item });
    },
    [draftRef],
  );

  /** ↓ in a blank line's Barcode: the item list, searched for what was typed. */
  const searchItemsFromBarcode = useCallback(
    (key: string, typed: string) => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!isEditable(current) || !line || rowHasItem(line)) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query: typed.replace(/\s+/g, " ").trim(), origin: COL.Barcode });
    },
    [draftRef],
  );

  const closeItemPicker = useCallback(() => {
    const target = itemPicker;
    setItemPicker(null);
    if (target) {
      window.requestAnimationFrame(() => window.setTimeout(() => focusPoBlankLine(target.key, target.origin), 0));
    }
  }, [itemPicker]);

  const onPickItem = useCallback(
    (picked: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        void api.pickItem(target.key, { itemId: picked.itemId, itemName: picked.itemName, uomId: picked.unitId });
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
      const refused = whyNotRemovable(draftRef.current, line);
      if (refused) {
        api.setHint(refused);
        return;
      }
      void confirm({ title: "Remove line", message: `Remove "${line.itemName}" from this order?`, confirmLabel: "Remove" }).then(
        (yes) => {
          if (yes) {
            api.removeLine(key);
            api.focusEntryStart();
          }
        },
      );
    },
    [api, draftRef],
  );

  const goToBlankLine = useCallback(() => {
    const current = draftRef.current;
    const blank = current.lines.find((line) => !rowHasItem(line));
    if (blank) {
      focusPoBlankLine(blank.key);
    }
  }, [draftRef]);

  // ------------------------------------------------------------ actions
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy) {
        return;
      }
      // A cell still being typed in commits on blur; read the draft after it lands.
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest(`[data-purchase-order-viewport]`)) {
        active.blur();
      }
      window.setTimeout(() => {
        // Save amendment asks why first (Qt `saveDocument`); the answer may be blank.
        if (draftRef.current.amending) {
          setAmendAsk(true);
          return;
        }
        void api.save(post);
      }, 0);
    },
    [api, draftRef],
  );

  const onAmendReason = useCallback(
    (reason: string) => {
      setAmendAsk(false);
      void api.save(true, reason);
    },
    [api],
  );

  const runCancel = useCallback(() => {
    const current = draftRef.current;
    if (!current.poId || current.status === "CANCELLED") {
      toast.warn("Open a saved purchase order first.", { title: "Nothing to cancel" });
      return;
    }
    if (!cancellable(current)) {
      toast.warn(`${current.refno} has goods received against it — short-close the rest instead.`, {
        title: "Cannot cancel",
      });
      return;
    }
    setReasonAsk("cancel");
  }, [draftRef]);

  /** Short close… — per line (the current one ticked) or every line = the whole PO (Qt openShortClose). */
  const runShortClose = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== "POSTED" || current.amending) {
      toast.warn("Only a posted (confirmed) order is short closed.", { title: "Not confirmed" });
      return;
    }
    setShortCloseOpen(true);
  }, [draftRef]);

  /** Reorder suggestions · F7 (Qt openReorderSuggestions; Ctrl+R is change rate on the sales screens). */
  const runReorder = useCallback(() => {
    if (!isEditable(draftRef.current)) {
      api.setHint("Reorder suggestions fill a draft (or an order being amended) — start a new one (Alt+N).");
      return;
    }
    void api.fetchSuggestions().then((rows) => {
      if (rows) {
        setReorderRows(rows);
      }
    });
  }, [api, draftRef]);

  /** Make GRN · Ctrl+G — the GRN screen (menu 196, its own rights) on this PO's pending lines. */
  const runMakeGrn = useCallback(() => {
    const current = draftRef.current;
    if (!feedsGrn) {
      api.setHint("A posted order with something pending (and approved, when it needs approval) makes a GRN.");
      return;
    }
    void guardDirty("Leave the order", "This order has unsaved changes. Open the GRN anyway?").then((go) => {
      if (go) {
        api.forgetRemembered();
        router.push(
          buildGrnFromPoHref({
            poId: current.poId,
            accYear: current.accYear,
            supplierId: current.supplierId,
            supplierName: current.supplierName,
            refno: current.refno,
            ...(current.godownId ? { godownId: current.godownId, godownName: current.godownName } : {}),
          }),
        );
      }
    });
  }, [api, draftRef, feedsGrn, guardDirty, router]);

  /** Send — WhatsApp to the supplier (Qt sendWhatsApp): its number, a message; the PDF is attached by hand. */
  const runWhatsApp = useCallback(() => {
    const current = draftRef.current;
    if (!current.poId) {
      api.setHint("Save the order first, then send it.");
      return;
    }
    void contactMutation({ ledId: current.supplierId })
      .unwrap()
      .catch(() => ({}) as Record<string, unknown>)
      .then((ledger) => {
        let number: string | null = null;
        for (const key of ["ledWhatsappNo", "ledPhone1", "ledPhone2"]) {
          number = normalizeWhatsappNumber(String(ledger[key] ?? ""));
          if (number) break;
        }
        if (!number) {
          const typed = window.prompt("No WhatsApp number on this supplier. Number to send to:", "");
          number = typed ? normalizeWhatsappNumber(typed) : null;
          if (!number) {
            if (typed) toast.warn("That is not a mobile number.", { title: "WhatsApp" });
            return;
          }
        }
        const total = current.serverTotals?.poTotal;
        const lines = [
          current.supplierName ? `Dear ${current.supplierName},` : "Dear Sir,",
          `Please find our purchase order ${current.refno} dated ${isoToDisplayDate(current.docDate)} for Rs. ${money(Number(total ?? current.totals?.net ?? 0))} attached.`,
          ...(current.expectedDate ? [`Kindly deliver by ${isoToDisplayDate(current.expectedDate)}.`] : []),
        ];
        window.open(whatsappChatUrl(number, lines.join("\n"), "web"), "_blank", "noopener");
        toast.info("The chat opens with the message. Print the order (Ctrl+P → PDF) and attach it in the chat, then Send.", {
          title: "WhatsApp",
        });
      });
  }, [api, contactMutation, draftRef]);

  const onReason = useCallback(
    (reason: string) => {
      const kind = reasonAsk;
      setReasonAsk(null);
      if (kind === "cancel") {
        void api.cancelOrder(reason);
      } else if (kind === "notApprove") {
        void api.approveOrder(false, reason);
      }
    },
    [api, reasonAsk],
  );

  const runNew = useCallback(() => {
    void guardDirty("Discard entry", "This order has unsaved changes. Start a new one anyway?").then((go) => {
      if (go) {
        api.newDocument();
      }
    });
  }, [api, guardDirty]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      api.focusEntryStart();
    }
  }, [api]);

  /** Amend — a confirmed PO opens for change (Qt `beginAmend`). */
  const runAmend = useCallback(() => {
    if (!canAmend) {
      return;
    }
    if (api.beginAmend()) {
      api.focusEntryStart();
    }
  }, [api, canAmend]);

  /** Leave an amendment unsaved: the stored PO comes back. */
  const runStopAmend = useCallback(() => {
    void guardDirty("Discard amendment", "This amendment has unsaved changes. Discard them?").then((go) => {
      if (go) {
        void api.stopAmend();
      }
    });
  }, [api, guardDirty]);

  /**
   * F2 (Qt `PurchaseDocNav::edit`): a draft opens for change, a confirmed PO
   * is amended; anything else says why not.
   */
  const runDocEdit = useCallback(() => {
    const current = draftRef.current;
    if (!current.poId) {
      api.setHint("A new purchase order — key it and Save Draft (Ctrl+S) or Confirm (Ctrl+Enter).");
      return;
    }
    if (current.status === "DRAFT") {
      if (current.viewMode === "browse") {
        if (canEdit) {
          runEdit();
        } else {
          api.setHint(`${current.refno} is a draft — your rights do not let you change it.`);
        }
        return;
      }
      api.setHint(`${current.refno} is a draft — change it, then Save Draft (Ctrl+S) or Confirm (Ctrl+Enter).`);
      focusPoGrid();
      return;
    }
    if (current.status === "CANCELLED") {
      api.setHint(`${current.refno} is cancelled — it cannot be changed. Enter a new one (Alt+N).`);
      return;
    }
    if (current.amending) {
      api.setHint(`Amending ${current.refno} — Save amendment (Ctrl+Enter) when done.`);
      return;
    }
    if (current.shortClosed) {
      api.setHint(`${current.refno} is short-closed — it cannot be amended.`);
      return;
    }
    if (!mayAmendRight) {
      api.setHint(`${current.refno} is confirmed — your rights do not let you amend it.`);
      return;
    }
    runAmend();
  }, [api, canEdit, draftRef, mayAmendRight, runAmend, runEdit]);

  /** Alt+PgUp / Alt+PgDn — the PO before / after this one in the list's order. */
  const runStep = useCallback(
    (previous: boolean) => {
      void guardDirty("Discard entry", "This order has unsaved changes. Leave it for another one?").then((go) => {
        if (go) {
          void api.stepDocument(previous);
        }
      });
    },
    [api, guardDirty],
  );

  /** Clone — a new draft with these lines. */
  const runClone = useCallback(() => {
    if (!canClone) {
      return;
    }
    void guardDirty("Discard entry", "This order has unsaved changes. Clone the saved one anyway?").then((go) => {
      if (go) {
        void api.cloneOrder();
      }
    });
  }, [api, canClone, guardDirty]);

  /** Merge… — the supplier's confirmed POs with something pending (Qt `mergeOrders`). */
  const runMerge = useCallback(() => {
    const current = draftRef.current;
    if (!current.supplierId) {
      toast.warn("Merge combines one supplier's orders — pick the supplier first.", { title: "Pick the supplier" });
      return;
    }
    if (!canMerge) {
      return;
    }
    void api.fetchSupplierPending(current.supplierId).then((rows) => {
      if (!rows) {
        return;
      }
      const now = draftRef.current;
      setMergeState({
        choices: mergeChoices(rows),
        initiallyTicked: now.status === "POSTED" ? `${now.poId}|${now.accYear}` : "",
        supplierName: now.supplierName,
      });
    });
  }, [api, canMerge, draftRef]);

  const onMerge = useCallback(
    (picked: MergeChoice[]) => {
      void guardDirty("Discard entry", "This order has unsaved changes. Merge into a new draft anyway?").then((go) => {
        if (!go) {
          return;
        }
        void api.mergeOrders(picked.map((choice) => ({ poId: choice.poId, accYear: choice.accYear }))).then((merged) => {
          if (merged) {
            setMergeState(null);
          }
        });
      });
    },
    [api, guardDirty],
  );

  const runApprove = useCallback(() => {
    if (canApprove) {
      void api.approveOrder(true);
    }
  }, [api, canApprove]);

  const runNotApprove = useCallback(() => {
    if (canApprove) {
      setReasonAsk("notApprove");
    }
  }, [canApprove]);

  /** Versions… — every save of this PO, newest first. */
  const runVersions = useCallback(() => {
    const current = draftRef.current;
    if (!current.poId) {
      return;
    }
    void api.fetchRevisions().then((rows) => {
      if (rows) {
        setRevisions({ refno: current.refno, rows: revisionRows(rows) });
      }
    });
  }, [api, draftRef]);

  /** Ctrl+P (Qt `PurchaseDocNav::print`): the saved PO, purpose PURCHASE_ORDER. */
  const runPrint = useCallback(() => {
    if (!draftRef.current.poId) {
      api.setHint("Save the purchase order first, then print it.");
      return;
    }
    setPrintOpen(true);
  }, [api, draftRef]);

  const runList = useCallback(() => {
    void guardDirty("Open another", "This order has unsaved changes. Discard it and open the list?").then((go) => {
      if (go) {
        api.forgetRemembered();
        onBackToList();
      }
    });
  }, [api, guardDirty, onBackToList]);

  const runClose = useCallback(() => {
    void guardDirty("Discard entry", "This order has unsaved changes. Close it anyway?").then((go) => {
      if (go) {
        api.forgetRemembered();
        onBackToList();
      }
    });
  }, [api, guardDirty, onBackToList]);

  const openHistory = useCallback(() => {
    if (!draft.poId) {
      api.setHint("Save the purchase order first — a new one has no history yet.");
      return;
    }
    setHistoryTarget({ docId: draft.poId, companyId: draft.companyId, accYear: draft.accYear, refNo: draft.refno });
  }, [api, draft.accYear, draft.companyId, draft.poId, draft.refno]);

  // ------------------------------------------------------------ shortcuts
  const overlayOpen =
    itemPicker !== null ||
    reasonAsk !== null ||
    keysOpen ||
    historyTarget !== null ||
    gridSettings.active ||
    amendAsk ||
    mergeState !== null ||
    revisions !== null ||
    printOpen ||
    agentOpen ||
    menu !== null ||
    shortCloseOpen ||
    reorderRows !== null;
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canConfirm ? () => runSave(true) : null,
      // F2 always answers: it edits, amends, or says why not (Qt `PurchaseDocNav::edit`).
      edit: !working ? runDocEdit : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      print: !working ? runPrint : null,
      history: openHistory,
      previous: !working ? () => runStep(true) : null,
      next: !working ? () => runStep(false) : null,
      open: !working ? runList : null,
      close: !working ? runClose : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !overlayOpen },
  );

  // F7 Reorder suggestions, Ctrl+G Make GRN (Qt key(F7) / key(Ctrl+G)); F4 on Agent / Revision is their own.
  const extraKeys = useRef({ runReorder, runMakeGrn, enabled: !overlayOpen && !working });
  useLayoutEffect(() => {
    extraKeys.current = { runReorder, runMakeGrn, enabled: !overlayOpen && !working };
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const keys = extraKeys.current;
      if (event.defaultPrevented || !keys.enabled || document.querySelector('[aria-modal="true"]')) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.key === "F7" && !ctrl && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) keys.runReorder();
      } else if (ctrl && !event.altKey && !event.shiftKey && (event.key === "g" || event.key === "G")) {
        event.preventDefault();
        if (!event.repeat) keys.runMakeGrn();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A habit F5 must not reload the page and take the unsaved order with it.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
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
      const blank = draft.lines.find((line) => !rowHasItem(line)) ?? draft.lines[draft.lines.length - 1];
      if (blank) {
        event.preventDefault();
        focusPoBlankLine(blank.key);
      }
    }
  };

  // ------------------------------------------------------------- render
  const at = (row: number, column: number, span = 1) => ({
    gridRow: row,
    gridColumn: span > 1 ? `${column} / span ${span}` : String(column),
  });
  const totals = draft.totals;
  const stripCells = poStripCells(draft.serverTotals, draft.status, totals?.tax ?? 0);
  const charges = draft.charges ?? [];
  const showCharges = editable || charges.length > 0;
  const closable = shortCloseLines(draft);
  const currentLine = draft.lines.find((line) => line.key === activeLine);
  const shortCloseTick = currentLine && (currentLine.pending ?? 0) > 0 && closable.length > 1 ? currentLine.lineId : "";

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── title band: "Purchase Order — <no> · rev n", company · branch, the pill ── */}
        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <div className={styles.titleLine}>
              <button type="button" className={quotationStyles.button} onClick={runList}>
                ‹ {CONFIG.listTitle}
              </button>
              <h1 className={quotationStyles.title}>{titleLine(draft)}</h1>
            </div>
            <span className={styles.scope}>{companySubtitle}</span>
          </div>
          <div className={styles.statusLine}>
            {draft.viewMode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.scope}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
            <PurchaseStatusPill
              status={pillStatus}
              tone={poPillTone(pillStatus)}
              title={
                awaiting
                  ? "purchase.po_approval_above — the PO value is above the limit; it feeds no GRN or bill until approved."
                  : "DRAFT, CONFIRMED, PART RECEIVED, RECEIVED, CLOSED, AWAITING APPROVAL, AMENDING or CANCELLED."
              }
            />
          </div>
        </div>

        <PurchaseSectionHeading title="THE HEADER" />
        {/* ── the header: 4 × 4, as the mockup, in tab order ─────────────── */}
        <div className={styles.headerCard} ref={headerRef} onKeyDown={onHeaderKeyDown}>
          <div
            className={styles.pair}
            style={at(1, 1)}
            data-tone={supplierEditable(draft) ? (draft.supplierId ? "set" : "missing") : undefined}
          >
            <DropdownCombo
              id={IDS.supplier}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              metaKey="sup_region_name"
              value={draft.supplierId}
              selectedLabel={draft.supplierName}
              disabled={!supplierEditable(draft)}
              required
              placeholder="Who the order goes to"
              onSelect={api.setSupplier}
            />
          </div>
          <div className={styles.pair} style={at(1, 2)}>
            <DateField id={IDS.date} label="PO Date" value={draft.docDate} disabled={!editable} onChange={(value) => api.setHeader({ docDate: value })} />
          </div>
          <div className={styles.pair} style={at(1, 3)}>
            <DateField
              id={IDS.expected}
              label="Expected"
              value={draft.expectedDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ expectedDate: value })}
            />
          </div>
          <div className={styles.pair} style={at(1, 4)}>
            <ReadOnlyInput id={IDS.refno} label="PO No" value={draft.refno} placeholder="given on save" />
          </div>
          <div className={styles.pair} style={at(2, 1)}>
            <DropdownCombo
              id={IDS.godown}
              label="Deliver to"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              value={draft.godownId}
              selectedLabel={draft.godownName}
              disabled={!editable}
              params={godownParams}
              placeholder="The godown it comes to"
              onSelect={api.setGodown}
            />
          </div>
          <div className={styles.pair} style={at(2, 2)}>
            <Field label="Agent" htmlFor={IDS.agent}>
              <PurchasePickerBox
                id={IDS.agent}
                text={draft.agentName || "—"}
                disabled={!editable}
                title="The broker for this order (Agents master) — ▾ or F4 to pick, Delete to clear"
                onPick={() => setAgentOpen(true)}
                onClear={() => api.setAgent("", "")}
              />
            </Field>
          </div>
          <div className={styles.pair} style={at(2, 3)}>
            <TextField
              id={IDS.contact}
              label="Contact"
              value={draft.contact}
              disabled={!editable}
              maxLength={150}
              placeholder="who placed / confirmed it"
              onChange={(value) => api.setHeader({ contact: value })}
            />
          </div>
          <div className={styles.pair} style={at(2, 4)}>
            <Field label="Revision" htmlFor={IDS.revision}>
              <input
                id={IDS.revision}
                className={cx(quotationStyles.input, quotationStyles.inputReadOnly, styles.clickable)}
                value={revisionText(draft)}
                placeholder="first version"
                readOnly
                tabIndex={saved ? 0 : -1}
                title="Every save of a confirmed order is a revision — click (or F4) for the versions"
                onClick={() => saved && runVersions()}
                onKeyDown={(event) => {
                  if (event.key === "F4" && saved) {
                    event.preventDefault();
                    runVersions();
                  }
                }}
              />
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 1)}>
            <Field label="Credit days" htmlFor={IDS.creditDays}>
              <span className={styles.creditPair}>
                <input
                  id={IDS.creditDays}
                  className={cx(quotationStyles.input, styles.creditInput)}
                  value={draft.creditDays ?? ""}
                  disabled={!editable}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  data-quotation-focus={IDS.creditDays}
                  onChange={(event) => api.setHeader({ creditDays: event.target.value.replace(/\D/g, ""), creditTyped: true, creditNote: "" })}
                />
                <span className={styles.scope}>{draft.creditNote}</span>
              </span>
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 2)}>
            <Field label="Approval" htmlFor={IDS.approval}>
              <input
                id={IDS.approval}
                className={cx(quotationStyles.input, quotationStyles.inputReadOnly)}
                value={approvalText(draft, approvalAbove)}
                readOnly
                tabIndex={-1}
                title="A PO above purchase.po_approval_above waits for approval (Override right on menu 23) and feeds no GRN until then"
              />
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 3, 2)}>
            <DropdownCombo
              id={IDS.terms}
              label="Terms"
              dropdownId={termsDropdownId}
              valueKey="pte_id"
              labelKey="pte_name"
              metaKey="pte_code"
              value={draft.termsId ?? ""}
              selectedLabel={draft.termsLabel ?? ""}
              disabled={!editable}
              params={termsParams}
              placeholder="terms & conditions printed on the PO"
              onSelect={(id, label) => api.setHeader({ termsId: id, termsLabel: id ? label : "", termsText: id ? "" : draft.termsText })}
            />
          </div>
          <div className={styles.pair} style={at(4, 1, 4)}>
            <TextField id={IDS.remarks} label="Remarks" value={draft.remarks} disabled={!editable} maxLength={500} onChange={(value) => api.setHeader({ remarks: value })} />
          </div>
        </div>
      </div>

      <PurchaseSectionHeading title="THE LINES" hint="estimated charges only — nothing posts" />
      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        {gridSettings.overlays}
        <PoLineGrid
          draft={draft}
          columns={columns}
          editable={editable}
          onContextMenu={gridSettings.onContextMenu}
          onActiveRow={(key) => {
            activeKey.current = key;
            setActiveLine(key);
          }}
          onEdit={api.editLine}
          onOpenItemPicker={openItemPicker}
          onScanBarcode={onScanBarcode}
          onSearchItems={searchItemsFromBarcode}
          onRefused={api.setHint}
          onGoToBlankLine={goToBlankLine}
          onRemoveLine={onRemoveLine}
        />
      </section>

      {showCharges ? (
        <div className={styles.chargesBlock}>
          <PurchaseSectionHeading title="ESTIMATED CHARGES" hint="an estimate only · the PO total includes it · nothing posts" />
          <PoChargesGrid
            rows={charges}
            editable={editable}
            masters={chargeMasters}
            onAdd={api.addCharge}
            onEdit={api.editCharge}
            onRemove={api.removeCharge}
          />
        </div>
      ) : null}

      <PurchaseTotalsStrip cells={stripCells} />

      <p className={styles.hintLine} role="status">
        {draft.hint}
        {!draft.hint && draft.shortClosed ? `Short-closed${draft.shortCloseReason ? `: ${draft.shortCloseReason}` : ""}` : ""}
      </p>

      {/* row 1 — where lines come from, and what follows the order */}
      <div className={styles.buttonBarLeft}>
        <button
          type="button"
          className={quotationStyles.button}
          title="Items at or below their reorder level → lines of this order"
          disabled={!editable || working}
          onClick={runReorder}
        >
          Reorder suggestions · F7
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Clone: a new draft with these lines · Merge: what is pending on several confirmed orders of this supplier → one new draft"
          disabled={amending || working || (!saved && !draft.supplierId)}
          onClick={() => setMenu("cloneMerge")}
        >
          {api.busy === "copying" ? "Working…" : "Clone / merge pending"}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Stop waiting for the rest — per line or the whole order, with a reason"
          disabled={!canShortClose || !hasPending || working}
          onClick={runShortClose}
        >
          {api.busy === "closing" ? "Closing…" : "Short close…"}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="The order's paper: print / save the PDF, or send it to the supplier on WhatsApp"
          disabled={!saved || draft.status === "CANCELLED" || working}
          onClick={() => setMenu("send")}
        >
          Send (PDF / WhatsApp)
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title={
            feedsGrn
              ? "Goods came: a GRN opens with this order's pending lines"
              : "A posted order with something pending (and approved, when it needs approval) makes a GRN"
          }
          disabled={!feedsGrn || working}
          onClick={runMakeGrn}
        >
          Make GRN · Ctrl+G
        </button>
        {awaiting ? (
          <>
            <button
              type="button"
              className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
              title="The order is above the approval limit (purchase.po_approval_above)."
              disabled={!canApprove || working}
              onClick={runApprove}
            >
              {api.busy === "approving" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              className={quotationStyles.button}
              title="Refuse it — with a reason. It feeds no GRN or bill."
              disabled={!canApprove || working}
              onClick={runNotApprove}
            >
              Not approve…
            </button>
          </>
        ) : null}
        {amending ? (
          <button
            type="button"
            className={quotationStyles.button}
            title="Leave the amendment — the order as it was saved comes back."
            disabled={working}
            onClick={runStopAmend}
          >
            Stop amending
          </button>
        ) : null}
      </div>
      {/* row 2 — the document keys (TxnKeys), right-aligned */}
      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>F1 · keys on this screen</span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          title="Start a new purchase order."
          onClick={runNew}
        >
          {withKey("New", "new")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Save without confirming — the supplier is not committed to yet."
          disabled={!canSaveDraft || working}
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title={
            amending
              ? "Save the amendment — the order is confirmed again as the next revision; the old version is kept."
              : "Post (confirm): the order is open for GRNs and bills. No stock and no books are written."
          }
          disabled={!canConfirm || working}
          onClick={() => runSave(true)}
        >
          {api.busy === "posting" ? (amending ? "Saving…" : "Posting…") : withKey(amending ? "Save amendment" : "Post", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Edit a DRAFT; amend a confirmed order (qty can't go below what came; the old version is kept)."
          disabled={working || !(canEdit || canAmend)}
          onClick={runDocEdit}
        >
          {withKey("Edit", "edit")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Cancel an order nothing has been received against."
          disabled={!canCancel || working}
          onClick={runCancel}
        >
          {api.busy === "cancelling" ? "Cancelling…" : withKey("Cancel", "cancelDoc")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Every step of this order — who saved, confirmed, closed or cancelled it, when, and why."
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

      <PurchaseAgentPicker open={agentOpen} companyId={draft.companyId} onClose={() => setAgentOpen(false)} onPick={(agent) => api.setAgent(agent.id, agent.name)} />
      {menu === "cloneMerge" ? (
        <PoChoiceMenu
          title="Clone / merge pending"
          choices={[
            { key: "clone", label: "Clone this order — a new draft with its lines", disabled: !canClone },
            { key: "merge", label: "Merge pending orders of the supplier…", disabled: !canMerge },
          ]}
          onCancel={() => setMenu(null)}
          onPick={(key) => {
            setMenu(null);
            if (key === "clone") runClone();
            else runMerge();
          }}
        />
      ) : null}
      {menu === "send" ? (
        <PoChoiceMenu
          title="Send"
          choices={[
            { key: "pdf", label: "PDF — print or save the order  (Ctrl+P)" },
            { key: "whatsapp", label: "WhatsApp to the supplier (attach the PDF in the chat)" },
          ]}
          onCancel={() => setMenu(null)}
          onPick={(key) => {
            setMenu(null);
            if (key === "pdf") runPrint();
            else runWhatsApp();
          }}
        />
      ) : null}
      {shortCloseOpen ? (
        <PoShortCloseDialog
          refno={draft.refno}
          lines={closable}
          tickLineId={shortCloseTick ?? ""}
          onCancel={() => setShortCloseOpen(false)}
          onConfirm={(lineIds, reason) => {
            setShortCloseOpen(false);
            void api.shortClose(reason, lineIds);
          }}
        />
      ) : null}
      {reorderRows ? (
        <PoReorderDialog
          supplierName={draft.supplierName}
          rows={reorderRows}
          onCancel={() => setReorderRows(null)}
          onPick={(rows) => {
            setReorderRows(null);
            void api.addReorderRows(rows);
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
      {reasonAsk ? (
        <ReasonDialog
          title={
            reasonAsk === "cancel"
              ? `Cancel ${draft.refno}`
              : reasonAsk === "notApprove"
                ? `Not approve ${draft.refno}`
                : `Short-close ${draft.refno}`
          }
          message={
            reasonAsk === "cancel"
              ? "Why is this order being cancelled?"
              : reasonAsk === "notApprove"
                ? "Why is the order not approved?"
                : "Why stop waiting for the rest?"
          }
          placeholder="Type the reason"
          onCancel={() => setReasonAsk(null)}
          onConfirm={onReason}
        />
      ) : null}
      {amendAsk ? <AmendReasonDialog refno={draft.refno} onCancel={() => setAmendAsk(false)} onConfirm={onAmendReason} /> : null}
      {mergeState ? (
        <PoMergeDialog
          supplierName={mergeState.supplierName}
          choices={mergeState.choices}
          initiallyTicked={mergeState.initiallyTicked}
          busy={api.busy === "copying"}
          onCancel={() => setMergeState(null)}
          onMerge={onMerge}
        />
      ) : null}
      {revisions ? (
        <PoRevisionsDialog refno={revisions.refno} rows={revisions.rows} onClose={() => setRevisions(null)} />
      ) : null}
      {printOpen && saved ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintOpen(false)}
          purposeCode={PURCHASE_ORDER_PRINT_PURPOSE}
          documentLabel={draft.refno ? `Purchase Order ${draft.refno}` : "Purchase Order"}
          targets={[
            {
              docId: draft.poId,
              companyId: draft.companyId,
              accYear: draft.accYear,
              branchId: draft.branchId,
              filename: (draft.refno || draft.poId).replace(/\//g, "-"),
            },
          ]}
        />
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel="Purchase order" onClose={() => setHistoryTarget(null)} />
    </div>
  );
}
