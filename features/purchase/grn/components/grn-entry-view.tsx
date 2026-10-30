"use client";

/**
 * GRN — Goods Received Note (menu 196): goods in before the supplier's bill.
 * Built to the approved mockup share/purchase/purchase_grn_ui_mockup.png as the
 * Qt `GrnEntry` rebuild of 2026-10-29 lays it out: title "GRN — <no>" with
 * company · branch and the status pill; THE HEADER (4 × 5: From PO = several
 * POs, Received date-time, Bill status, Loadmen / Supervisor / Vehicle /
 * Driver, Transport (popup), E-way bill, Packages, Received by); WHAT ARRIVED
 * (Check chips, Shelf life %, Labels, Dmg reason, the blank-row prompt); the F12
 * panel beside the off-bill CHARGES (payees loadman-wise); the totals strip; the
 * WARN / REFUSE strip with "override (logged)"; the two button rows. Every
 * figure is the server's (/purchase/grns/validate, debounced, and /get).
 * Layout and wiring only — rules in grn.state.ts / grn-charges.ts /
 * grn-check.ts, the network in use-grn-draft.ts.
 *
 * Keys: the shared transaction set (lib/txn-keys) — Alt+N New, Ctrl+S Save
 * Draft, Ctrl+Enter Post, F2 Edit, Alt+X Cancel, Ctrl+H History, Ctrl+P Print
 * (key only, as in Qt), Alt+PgUp / Alt+PgDn Previous / Next, Ctrl+O Show List,
 * Esc Close; the screen's own: Ctrl+L From PO, F12 split, Ctrl+Shift+P Print
 * labels, Ctrl+B Make bill, Ctrl+A attachments; F4 / Space on From PO and
 * Transport; F1 is the sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { NexDropdownMulti } from "@/components/design-system/dropdown";
import type { DropdownSelection } from "@/components/design-system/dropdown/types";
import { DateInput, DateTimeInput } from "@/components/design-system/ui";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { PurchasePayeeDialog } from "../../shared/components/purchase-payee-dialog";
import { useDocumentPrint } from "@/features/printing/hooks/useDocumentPrint";
import { DateField, DropdownCombo, Field, ReadOnlyInput, TextField } from "@/features/sales/quotation/components/fields";
import { focusCell } from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { NewChoiceDialog } from "@/features/stocks/opening-stock/components/new-choice-dialog";
import {
  AdjustmentItemPicker,
  type AdjustmentItemPick,
} from "@/features/stocks/stock-adjustment/components/adjustment-item-picker";
import { useStockAdjustmentSettings } from "@/features/stocks/stock-adjustment/use-stock-adjustment-settings";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import { toast } from "@/lib/notify";
import { PurchaseAllocDialog } from "../../shared/components/purchase-alloc-dialog";
import { PurchaseAttachDialog } from "../../shared/components/purchase-attach-dialog";
import { PurchaseLabelDialog, usePurchaseAfterPost } from "../../shared/components/purchase-labels-dialog";
import {
  PurchasePickerBox,
  PurchaseSectionHeading,
  PurchaseStatusPill,
  PurchaseTotalsStrip,
  PurchaseWarnStrip,
  purchaseOverrideActive,
} from "../../shared/components/purchase-parts";
import { PurchaseSourcePicker } from "../../shared/components/purchase-source-picker";
import { PurchaseTransportDialog } from "../../shared/components/purchase-transport-dialog";
import type { PurchaseAllocEntry } from "../../shared/purchase-dialogs.types";
import { purchaseStatusTone, transportSummary } from "../../shared/purchase-parts";
import { useGetPurchaseChargeMasterQuery, useGetPurchaseSettingsQuery } from "../../shared/purchase.api";
import { purchaseRefusalText } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import { usePurchaseAllocPanel } from "../../shared/use-purchase-alloc-panel";
import { usePurchaseCompanySubtitle, usePurchaseScope } from "../../shared/use-purchase-scope";
import { useGrnDamageReasonsQuery } from "../grn.api";
import { resolveGrnColumns } from "../grn.columns";
import {
  CANCEL_REASONS,
  COL,
  CREW_DROPDOWN_KEY,
  CREW_EMPTY_PARAMS,
  DISCARD_MESSAGE,
  GODOWN_DROPDOWN_KEY,
  GRN_GRID_NAME,
  GRN_PRINT_PURPOSE,
  LINES_HINT,
  LOADMAN_ROLE,
  SUPERVISOR_ROLE,
  SUPPLIER_DROPDOWN_KEY,
} from "../grn.constants";
import { buildBillFromGrnHref, buildReturnAgainstGrnHref, type GrnFromPoHandoff } from "../../shared/purchase-handoff";
import { totalsCells } from "../grn-check";
import { grnScreenKey, isTypingTarget, KEY_SHEET } from "../grn.keys";
import {
  allocNeedOf,
  allocRefusal,
  billStatusText,
  expiryIso,
  hiddenColumns,
  isDraftStatus,
  isEditable,
  makeBillRefusal,
  poFieldText,
  poPickerChoices,
  poPickerRefusal,
  receivedByText,
  rowHasItem,
  seedAllocs,
  statusPill,
  titleLine,
} from "../grn.state";
import type { GrnChargeRow, GrnDraft } from "../grn.types";
import { useGrnDraft } from "../use-grn-draft";
import { useGrnTextile, type TextileWord } from "../use-grn-textile";
import { GrnChargesGrid } from "./grn-charges-grid";
import { focusGrnLine, GrnLineGrid } from "./grn-line-grid";
import styles from "../page.module.scss";

const IDS = {
  supplier: "grn-supplier",
  po: "grn-from-po",
  received: "grn-received",
  docNo: "grn-docno",
  godown: "grn-godown",
  challanNo: "grn-challan-no",
  challanDate: "grn-challan-date",
  billStatus: "grn-bill-status",
  loadmen: "grn-loadmen",
  supervisor: "grn-supervisor",
  vehicle: "grn-vehicle",
  driver: "grn-driver",
  transport: "grn-transport",
  ewbNo: "grn-ewb-no",
  ewbDate: "grn-ewb-date",
  pkgRecd: "grn-packages-received",
  pkgSent: "grn-packages-sent",
  receivedBy: "grn-received-by",
  remarks: "grn-remarks",
} as const;

type ItemPickerState = { key: string; query: string; origin: number };

const EMPTY_KEYS: ReadonlySet<string> = new Set();
const NO_MASTERS: never[] = [];

const OVERRIDE_HINT_ALLOWED =
  "Post past what needs a right (shelf life below the minimum when the setting refuses it). You give a reason; it is kept on the GRN's trail.";
const OVERRIDE_HINT_NO_RIGHT =
  "Posting past a REFUSE needs the Override right on GRN (menu 196) — ask your admin. Without it, fix the line (F12) or change the setting.";

/** Qt `PurchaseDocNav::edit`'s words for F2 on a document that is not a draft opened to look at. */
function editRefusal(draft: GrnDraft): string {
  if (!draft.grnId) {
    return "A new GRN — key it and Save Draft (Ctrl+S) or Post.";
  }
  const status = draft.status.toUpperCase();
  if (status === "DRAFT") {
    return `${draft.refno} is a draft — change it, then Save Draft (Ctrl+S) or Post.`;
  }
  if (status === "CANCELLED") {
    return `${draft.refno} is cancelled — it cannot be changed. Enter a new one (Alt+N).`;
  }
  return `${draft.refno} is posted — only a draft can be changed. Cancel it (Alt+X) and enter it again.`;
}

/** A header box that opens a popup (Qt PurchasePickerCombo: From PO, Transport) — click, ▾, F4, Space, Alt+↓. */
function PickerField({
  id,
  label,
  value,
  placeholder,
  title,
  disabled,
  onOpen,
  onClear,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  title: string;
  disabled?: boolean;
  onOpen: () => void;
  onClear?: () => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <PurchasePickerBox
        id={id}
        text={value}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        onPick={onOpen}
        onClear={onClear}
      />
    </Field>
  );
}

export type GrnEntryViewProps = PurchaseEntryViewProps & {
  /** PO's Make GRN · Ctrl+G (shared/purchase-handoff.ts): a new GRN on its supplier / godown, its pending lines brought in. */
  fromPo?: GrnFromPoHandoff | null;
};

export function GrnEntryView({ initialDocument, initialMode, onBackToList, memory, fromPo }: GrnEntryViewProps) {
  const router = useRouter();
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const crewDropdownId = useDropdownId(CREW_DROPDOWN_KEY);
  const subtitle = usePurchaseCompanySubtitle();

  // ------------------------------------------------------------- settings
  // stock.auto_batch_no (Qt AppSession::autoBatchNo) and purchase.* (Qt setupTextile).
  const scope = usePurchaseScope();
  const { settings: stockSettings } = useStockAdjustmentSettings(scope.companyId, scope.branchId);
  const { data: purchaseSettings } = useGetPurchaseSettingsQuery(
    { companyId: scope.companyId, branchId: scope.branchId },
    { skip: !scope.companyId || !scope.branchId },
  );
  // Unknown (still loading, or refused): Sell A–D stay shut, as in Qt.
  const priceAtGrn = Boolean(
    purchaseSettings?.allowPriceUpdate &&
      purchaseSettings.priceUpdate === "UPDATE_PRICES" &&
      purchaseSettings.priceSetAt === "GRN",
  );
  const rules = useMemo(
    () => ({ autoBatchNo: stockSettings.autoBatchNo, priceAtGrn }),
    [priceAtGrn, stockSettings.autoBatchNo],
  );
  const { data: chargeMasters = NO_MASTERS } = useGetPurchaseChargeMasterQuery();
  const { data: reasons = NO_MASTERS } = useGrnDamageReasonsQuery(
    { companyId: scope.companyId },
    { skip: !scope.companyId },
  );
  const afterPost = usePurchaseAfterPost({ companyId: scope.companyId, branchId: scope.branchId });
  const afterPostRun = afterPost.run;
  const onPosted = useCallback(
    (posted: GrnDraft) =>
      afterPostRun({ docType: "GRN", docId: posted.grnId, accYear: posted.accYear, refno: posted.refno }),
    [afterPostRun],
  );

  const api = useGrnDraft({ memory, godownDropdownId, rules, onPosted, chargeMasters });
  const { draft, draftRef } = api;
  const textile = useGrnTextile(draft.autoBatchNo, draft.companyId);
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const overrideAllowed = Boolean(permissions?.canOverride);

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [overrideAsk, setOverrideAsk] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const allocPanel = usePurchaseAllocPanel();
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  const [payeeTarget, setPayeeTarget] = useState<GrnChargeRow | null>(null);
  const [newChoice, setNewChoice] = useState<{ key: string; word: TextileWord } | null>(null);
  const activeKey = useRef<string | null>(null);
  const { print: printDocument, isPrinting } = useDocumentPrint({
    companyId: draft.companyId || null,
    purposeCode: GRN_PRINT_PURPOSE,
  });

  // ------------------------------------------------------------- layout
  // Size / Colour / Model, Sell A–D and Excess show by the screen's rule (Qt applyColumns).
  const hiddenKey = [...hiddenColumns(draft)].join(",");
  const columns = useMemo(
    () => resolveGrnColumns(new Set(hiddenKey ? hiddenKey.split(",").map(Number) : []), draft.autoBatchNo),
    [draft.autoBatchNo, hiddenKey],
  );

  // --------------------------------------------------------------- derived
  const editable = isEditable(draft);
  const draftStatus = isDraftStatus(draft);
  const saved = draft.grnId !== "";
  const working = api.busy !== null;
  const posted = saved && draft.status === "POSTED";
  const problemKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const line of draft.lines) {
      if (rowHasItem(line) && line.expiry.trim() !== "" && !expiryIso(line.expiry)) {
        keys.add(line.key);
      }
    }
    return keys.size > 0 ? keys : EMPTY_KEYS;
  }, [draft.lines]);

  const canSaveDraft = editable && rights.maySaveDraft(saved);
  const canPost = draftStatus && rights.mayPost && (editable || saved);
  const canEdit = draftStatus && saved && draft.viewMode === "browse" && rights.mayEdit;
  // Qt applyStatus: a posted GRN no bill has taken (not even part of it).
  const canCancel = posted && draft.billStatus === "NOT_BILLED" && rights.mayCancelDocument(true);
  const billWhy = makeBillRefusal(draft);
  const pill = statusPill(draft);

  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);
  const crewParams = useMemo(() => ({ iemp_branch_id: draft.branchId, iemp_role: LOADMAN_ROLE }), [draft.branchId]);
  const supervisorParams = useMemo(
    () => ({ iemp_branch_id: draft.branchId, iemp_role: SUPERVISOR_ROLE }),
    [draft.branchId],
  );

  // ------------------------------------------------------------- opening
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    if (initialDocument && !api.resumed) {
      void api.load(initialDocument, initialMode === "entry");
    } else if (!api.resumed) {
      api.requestFocus({ target: "supplier" });
    }
    // Once, on mount: the page remounts this view for every Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where the cursor goes next — the hook asks, the DOM answers after the render.
  const focusRequest = api.focusRequest;
  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      if (focusRequest.target === "cell") {
        if (!focusCell(GRN_GRID_NAME, focusRequest.key, String(focusRequest.column))) {
          const line = draftRef.current.lines.find((candidate) => candidate.key === focusRequest.key);
          if (line) {
            focusGrnLine(line);
          }
        }
        return;
      }
      if (focusRequest.target === "lines") {
        const lines = draftRef.current.lines;
        const target = lines.find((line) => !rowHasItem(line)) ?? lines[0];
        if (target) {
          focusGrnLine(target);
        }
        return;
      }
      document.getElementById(focusRequest.target === "supplier" ? IDS.supplier : IDS.godown)?.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [draftRef, focusRequest]);

  // ------------------------------------------------------------- actions
  /** Ask before throwing away unsaved work; true = go ahead. */
  const discardOk = useCallback(async (): Promise<boolean> => {
    if (!draftRef.current.dirty || !isEditable(draftRef.current)) {
      return true;
    }
    return confirm({ title: "Discard entry", message: DISCARD_MESSAGE, confirmLabel: "Discard" });
  }, [draftRef]);

  const runClose = useCallback(() => {
    void (async () => {
      if (await discardOk()) {
        api.discard();
        onBackToList();
      }
    })();
  }, [api, discardOk, onBackToList]);

  const runNew = useCallback(() => {
    void (async () => {
      if (await discardOk()) {
        api.discard();
        api.reset();
      }
    })();
  }, [api, discardOk]);

  /**
   * Qt `saveDocument`: Post with "override (logged)" ticked over a warning that
   * needs the right asks the reason first (kept on the GRN's trail).
   */
  const runSave = useCallback(
    (post: boolean) => {
      const current = draftRef.current;
      if (post && purchaseOverrideActive(current.warnings, current.refusals, overrideAllowed, current.overrideTicked)) {
        setOverrideAsk(true);
        return;
      }
      void api.save(post);
    },
    [api, draftRef, overrideAllowed],
  );

  const openHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current.grnId) {
      api.setHint("Save the GRN first — a new one has no history yet.");
      return;
    }
    setHistoryTarget({ docId: current.grnId, companyId: current.companyId, accYear: current.accYear, refNo: current.refno });
  }, [api, draftRef]);

  /** F2 (Qt `PurchaseDocNav::edit`): a draft opened to look at opens for keying; anything else says why not. */
  const runEdit = useCallback(() => {
    const current = draftRef.current;
    if (isDraftStatus(current) && current.grnId && current.viewMode === "browse") {
      if (rights.mayEdit) {
        api.beginEdit();
      } else {
        api.setHint("You have no Edit right on GRN.");
      }
      return;
    }
    api.setHint(editRefusal(current));
    if (isEditable(current)) {
      api.requestFocus({ target: "lines" });
    }
  }, [api, draftRef, rights.mayEdit]);

  /** Ctrl+P (Qt `PurchaseDocNav::print`, key only on the GRN): purpose GRN, on the saved document. */
  const runPrint = useCallback(() => {
    const current = draftRef.current;
    if (!current.grnId) {
      api.setHint("Save the GRN first, then print it.");
      return;
    }
    void printDocument({
      docId: current.grnId,
      companyId: current.companyId,
      accYear: current.accYear,
      branchId: current.branchId,
    });
  }, [api, draftRef, printDocument]);

  /** Alt+PgUp / Alt+PgDn — the GRN before / after this one, once unsaved work is let go. */
  const runStep = useCallback(
    (previous: boolean) => {
      void (async () => {
        if (await discardOk()) {
          await api.step(previous);
        }
      })();
    },
    [api, discardOk],
  );

  /** From PO · Ctrl+L (Qt `openPoPicker`): the supplier's open POs, several at once. */
  const openPoPicker = useCallback(() => {
    const current = draftRef.current;
    const why = poPickerRefusal(current);
    if (why) {
      api.setHint(why);
      if (!current.supplierId && isEditable(current)) {
        api.requestFocus({ target: "supplier" });
      }
      return;
    }
    if (current.pendingFor === current.supplierId && current.pendingLines.length === 0 && !api.pendingLoading) {
      api.setHint("This supplier has no confirmed PO with anything pending — key the lines (a GRN without a PO is fine).");
      return;
    }
    setPoPickerOpen(true);
  }, [api, draftRef]);

  // PO → Make GRN (Qt makeGrn): the supplier and godown first; the PO's lines once its
  // pending lines (From PO) have answered for that supplier.
  const handoffStage = useRef<"supplier" | "lines" | "done">(fromPo ? "supplier" : "done");
  useEffect(() => {
    if (!fromPo || handoffStage.current !== "supplier" || !isEditable(draft) || !draft.companyId) {
      return;
    }
    handoffStage.current = "lines";
    api.setSupplier(fromPo.supplierId, fromPo.supplierName);
    if (fromPo.godownId) {
      api.setGodown(fromPo.godownId, fromPo.godownName ?? "");
    }
  }, [api, draft, fromPo]);
  useEffect(() => {
    if (!fromPo || handoffStage.current !== "lines" || api.pendingLoading || draft.pendingFor !== fromPo.supplierId) {
      return;
    }
    handoffStage.current = "done";
    if (draft.pendingLines.some((row) => row.poId === fromPo.poId)) {
      api.pickPos([fromPo.poId]);
    } else {
      api.setHint(
        `${fromPo.refno || "That PO"} has nothing pending for this supplier now — key the lines, or pick a PO with From PO (Ctrl+L).`,
      );
    }
  }, [api, draft.pendingFor, draft.pendingLines, fromPo]);

  /** Ctrl+Shift+P (Qt `printLabels`): the labels of a posted GRN. */
  const runLabels = useCallback(() => {
    if (draftRef.current.status !== "POSTED" || !draftRef.current.grnId) {
      api.setHint("Labels print from a posted GRN — Post it first.");
      return;
    }
    setLabelsOpen(true);
  }, [api, draftRef]);

  /** Reject (Qt `rejectToSupplier`): a Purchase Return of kind "against GRN" on this GRN (menu 25's rights). */
  const runReject = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== "POSTED" || !current.grnId) {
      api.setHint("Reject returns goods of a posted GRN — post it first (a draft is just changed).");
      return;
    }
    router.push(
      buildReturnAgainstGrnHref({
        grnId: current.grnId,
        accYear: current.accYear,
        supplierId: current.supplierId,
        supplierName: current.supplierName,
        refno: current.refno,
      }),
    );
  }, [api, draftRef, router]);

  /** Ctrl+B (Qt `makeBill`): Purchase Entry (menu 24's rights) on the supplier and godown, this GRN's lines in. */
  const runMakeBill = useCallback(() => {
    const current = draftRef.current;
    const why = makeBillRefusal(current);
    if (why) {
      api.setHint(why);
      return;
    }
    router.push(
      buildBillFromGrnHref({
        grnId: current.grnId,
        accYear: current.accYear,
        supplierId: current.supplierId,
        supplierName: current.supplierName,
        refno: current.refno,
        godownId: current.godownId,
        godownName: current.godownName,
      }),
    );
  }, [api, draftRef, router]);

  // ------------------------------------------------- F12 — batches / serials
  // Inline under the lines, beside the CHARGES (Qt openAllocs, embedded): the need is read
  // from the line live, so the panel follows Received / Damaged / Free while it is open.
  const allocOpen = allocPanel.open;
  const openAllocs = useCallback(() => {
    const current = draftRef.current;
    const line = current.lines.find((candidate) => candidate.key === activeKey.current);
    const why = allocRefusal(current, line);
    if (why || !line) {
      api.setHint(why);
      return;
    }
    const index = current.lines.indexOf(line);
    const serial = line.signature.toUpperCase().includes("R");
    const held = allocOpen(
      {
        key: line.key,
        title: serial ? `F12 — SERIALS (line ${index + 1}, scan mode)` : `F12 — BATCH SPLIT (line ${index + 1})`,
        rows: seedAllocs(current, line, textile.names),
        tip: line.itemName,
      },
      {
        editable: isEditable(current),
        lineNoOf: (key) => draftRef.current.lines.findIndex((candidate) => candidate.key === key) + 1,
      },
    );
    if (held) {
      api.setHint(held);
    }
  }, [allocOpen, api, draftRef, textile.names]);

  const allocLine = allocPanel.target ? draft.lines.find((line) => line.key === allocPanel.target?.key) : undefined;
  const allocNeed = useMemo(() => (allocLine ? allocNeedOf(draft, allocLine) : null), [allocLine, draft]);
  // Its line went (removed, or another document loaded): the panel goes too (Qt closeAllocPanel).
  const allocClose = allocPanel.close;
  const allocGone = allocPanel.target !== null && !allocLine;
  useEffect(() => {
    if (allocGone) {
      allocClose();
    }
  }, [allocClose, allocGone]);
  const allocStatus = draft.status.toUpperCase();
  const allocReadOnlyReason = editable
    ? undefined
    : allocStatus === "DRAFT"
      ? "Read only — Edit (F2) to change the split."
      : `${draft.refno} is ${allocStatus.toLowerCase()} — its batches are as received.`;
  const onAllocRows = useCallback(
    (rows: PurchaseAllocEntry[]) => {
      const key = allocPanel.target?.key;
      if (key && isEditable(draftRef.current)) {
        api.setLineAllocs(key, rows);
      }
    },
    [allocPanel.target, api, draftRef],
  );
  const onAllocClose = useCallback(() => {
    const key = allocPanel.target?.key;
    allocClose();
    if (key) {
      api.requestFocus({ target: "cell", key, column: COL.Recd });
    }
  }, [allocClose, allocPanel.target, api]);

  // --------------------------------------------------------- textile
  const onAddChoice = useCallback((key: string, word: TextileWord) => setNewChoice({ key, word }), []);
  const onNewChoiceAccept = useCallback(
    (name: string) => {
      const target = newChoice;
      setNewChoice(null);
      if (!target) {
        return;
      }
      void (async () => {
        try {
          const added = await textile.quickAdd(target.word, name);
          if (added) {
            api.setTextileChoice(target.key, target.word === "size" ? "sizeId" : "colourId", added.id);
          }
        } catch (error) {
          api.setHint(purchaseRefusalText(error));
          toast.apiError(error, { title: target.word === "size" ? "Size not added" : "Colour not added" });
        }
      })();
    },
    [api, newChoice, textile],
  );

  const openAttachments = useCallback(() => setAttachOpen(true), []);

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
      window.requestAnimationFrame(() =>
        window.setTimeout(() => {
          if (!focusCell(GRN_GRID_NAME, target.key, String(target.origin))) {
            focusCell(GRN_GRID_NAME, target.key, String(COL.Item));
          }
        }, 0),
      );
    }
  }, [itemPicker]);

  const onPickItem = useCallback(
    (picked: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        void api.pickItem(target.key, { itemId: picked.itemId, itemName: picked.itemName, unitId: picked.unitId });
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
      void (async () => {
        const ok = await confirm({
          title: "Remove line",
          message: `Remove "${line.itemName}" from this GRN?`,
          confirmLabel: "Remove",
          iconVariant: "delete",
        });
        if (ok) {
          api.dropLine(key);
          api.requestFocus({ target: "lines" });
        }
      })();
    },
    [api, draftRef],
  );

  const onGoToBlank = useCallback(() => api.requestFocus({ target: "lines" }), [api]);

  // ------------------------------------------------------------ shortcuts
  // A handler left null is not intercepted at all: its button is off. A dialog
  // is `aria-modal`, so the hook stands down under one.
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      edit: !working ? runEdit : null,
      cancelDoc: !working && canCancel ? () => setCancelAsk(true) : null,
      // Kept while a print is on its way, so a second Ctrl+P never falls through to the browser's.
      print: !working ? () => (isPrinting ? undefined : runPrint()) : null,
      history: openHistory,
      previous: !working ? () => runStep(true) : null,
      next: !working ? () => runStep(false) : null,
      open: !working ? runClose : null,
      close: !working ? runClose : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: itemPicker === null },
  );

  // The screen's own keys (Qt QShortcut / PurchaseAttach::install).
  const overlayOpen = itemPicker !== null;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { action, swallow } = grnScreenKey(event, {
        overlayOpen: overlayOpen || document.querySelector('[aria-modal="true"]') !== null,
        typingTarget: isTypingTarget(event.target),
      });
      if (swallow) {
        event.preventDefault();
      }
      if (action === "allocs") openAllocs();
      else if (action === "attach") openAttachments();
      else if (action === "fromPo") openPoPicker();
      else if (action === "labels") runLabels();
      else if (action === "makeBill") runMakeBill();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openAllocs, openAttachments, openPoPicker, overlayOpen, runLabels, runMakeBill]);

  useEffect(() => {
    if (!draft.dirty || !editable) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft.dirty, editable]);

  /** Enter walks the header; the last field hands over to the grid. */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && editable) {
      event.preventDefault();
      api.requestFocus({ target: "lines" });
    }
  };

  const supplierSet = Boolean(draft.supplierId);
  const godownSet = Boolean(draft.godownId);
  const button = quotationStyles.button;

  return (
    <div className={cx(quotationStyles.page, styles.page)}>
      <div className={styles.body}>
        {/* ── title band: "GRN — <no>", company · branch, the status pill ── */}
        <div className={styles.titleBand}>
          <div className={styles.titles}>
            <h1 className={styles.formTitle}>{titleLine(draft)}</h1>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>
          <div className={styles.titleRight}>
            {draftStatus && draft.viewMode === "browse" ? (
              <span className={quotationStyles.readOnlyBadge}>Read only</span>
            ) : null}
            {draft.dirty && editable ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.busy}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
            <PurchaseStatusPill
              status={pill.status}
              label={pill.label}
              tone={purchaseStatusTone(pill.status)}
              title="DRAFT moved nothing; POSTED has the stock in; BILLED / PART BILLED once a bill takes it; CANCELLED took it out again."
            />
          </div>
        </div>

        {/* ── THE HEADER: 4 × 5, as the mockup ─────────────────────────── */}
        <PurchaseSectionHeading title="THE HEADER" />
        <div className={styles.headerCard} onKeyDown={onHeaderKeyDown}>
          <div className={styles.pair} data-tone={editable ? (supplierSet ? "set" : "missing") : undefined}>
            <DropdownCombo
              id={IDS.supplier}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              value={draft.supplierId}
              selectedLabel={draft.supplierName}
              disabled={!editable}
              required
              placeholder="Who sent the goods"
              onSelect={api.setSupplier}
            />
          </div>
          <div className={styles.pair}>
            <PickerField
              id={IDS.po}
              label="From PO"
              value={poFieldText(draft, api.pendingLoading)}
              placeholder={editable ? "pick the supplier first" : ""}
              title="The POs this GRN receives — click, F4 or Ctrl+L picks the supplier's pending PO lines (several POs at once)"
              disabled={!editable}
              onOpen={openPoPicker}
            />
          </div>
          <div className={styles.pair}>
            <Field label="Received" htmlFor={IDS.received} required>
              <DateTimeInput
                id={IDS.received}
                value={draft.receivedAt}
                disabled={!editable}
                block
                clearable={false}
                title="When the goods came in (kept as first saved unless changed here)"
                onChange={api.setReceivedAt}
              />
            </Field>
          </div>
          <div className={styles.pair}>
            <ReadOnlyInput id={IDS.docNo} label="GRN No" value={draft.refno} placeholder="given on save" />
          </div>

          <div className={styles.pair} data-tone={editable ? (godownSet ? "set" : "missing") : undefined}>
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
              placeholder="Where the goods are kept"
              onSelect={api.setGodown}
            />
          </div>
          <div className={styles.pair}>
            <TextField
              id={IDS.challanNo}
              label="Challan / Inv"
              value={draft.challanNo}
              disabled={!editable}
              maxLength={60}
              placeholder="if known"
              title="The supplier's DC / invoice no on the papers (the bill may not exist yet)"
              onChange={(value) => api.setHeader({ challanNo: value })}
            />
          </div>
          <div className={styles.pair}>
            <DateField
              id={IDS.challanDate}
              label="Challan date"
              value={draft.challanDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ challanDate: value })}
            />
          </div>
          <div className={styles.pair}>
            <ReadOnlyInput id={IDS.billStatus} label="Bill status" value={billStatusText(draft)} placeholder="Not billed yet" />
          </div>

          <div className={styles.pair}>
            <label className={quotationStyles.label} htmlFor={IDS.loadmen}>
              Loadmen
            </label>
            <NexDropdownMulti
              id={IDS.loadmen}
              dropdownId={crewDropdownId}
              params={crewParams}
              keepEmptyParams={CREW_EMPTY_PARAMS}
              value={draft.loadmen}
              disabled={!editable}
              placeholder="Who unloaded — the coolie is owed to each"
              aria-label="Loadmen"
              onChange={(loadmen: DropdownSelection[]) => api.setLoadmen(loadmen)}
            />
          </div>
          <div className={styles.pair}>
            <DropdownCombo
              id={IDS.supervisor}
              label="Supervisor"
              dropdownId={crewDropdownId}
              valueKey="emp_id"
              labelKey="emp_name"
              value={draft.supervisorId}
              selectedLabel={draft.supervisorName}
              disabled={!editable}
              params={supervisorParams}
              placeholder="Who checked the goods in"
              onSelect={api.setSupervisor}
            />
          </div>
          <div className={styles.pair}>
            <TextField
              id={IDS.vehicle}
              label="Vehicle"
              value={draft.vehicleNo}
              disabled={!editable}
              maxLength={20}
              onChange={(value) => api.setHeader({ vehicleNo: value.toUpperCase() })}
            />
          </div>
          <div className={styles.pair}>
            <TextField
              id={IDS.driver}
              label="Driver"
              value={draft.driverName}
              disabled={!editable}
              maxLength={100}
              onChange={(value) => api.setHeader({ driverName: value })}
            />
          </div>

          <div className={cx(styles.pair, styles.pairWide)}>
            <PickerField
              id={IDS.transport}
              label="Transport"
              value={transportSummary(draft.transport)}
              placeholder="LR no · transporter — Enter / F4"
              title="The transport band: transporter, LR no / date, mode, distance — click, Space or F4"
              onOpen={() => setTransportOpen(true)}
              onClear={editable && draft.transport ? () => api.setTransport(null) : undefined}
            />
          </div>
          <div className={styles.pair}>
            <Field label="E-way bill" htmlFor={IDS.ewbNo}>
              <div className={styles.inline}>
                <input
                  id={IDS.ewbNo}
                  className={quotationStyles.input}
                  value={draft.ewbNo}
                  disabled={!editable}
                  maxLength={15}
                  placeholder="supplier's e-way bill no"
                  autoComplete="off"
                  onChange={(event) => api.setHeader({ ewbNo: event.target.value.replace(/\s+/g, "") })}
                />
                <DateInput
                  id={IDS.ewbDate}
                  value={draft.ewbDate}
                  disabled={!editable}
                  aria-label="E-way bill date"
                  onChange={(value) => api.setHeader({ ewbDate: value })}
                />
              </div>
            </Field>
          </div>
          <div className={styles.pair}>
            <Field label="Packages" htmlFor={IDS.pkgRecd}>
              <div className={styles.inline}>
                <input
                  id={IDS.pkgRecd}
                  className={cx(quotationStyles.input, quotationStyles.alignRight)}
                  value={draft.packagesReceived}
                  disabled={!editable}
                  inputMode="numeric"
                  maxLength={6}
                  aria-label="Packages received"
                  onChange={(event) => api.setHeader({ packagesReceived: event.target.value.replace(/\D/g, "") })}
                />
                <span className={styles.inlineCap}>recd of</span>
                <input
                  id={IDS.pkgSent}
                  className={cx(quotationStyles.input, quotationStyles.alignRight)}
                  value={draft.packagesSent}
                  disabled={!editable}
                  inputMode="numeric"
                  maxLength={6}
                  aria-label="Packages sent"
                  onChange={(event) => api.setHeader({ packagesSent: event.target.value.replace(/\D/g, "") })}
                />
                <span className={styles.inlineCap}>sent</span>
              </div>
            </Field>
          </div>

          <div className={styles.pair}>
            <ReadOnlyInput id={IDS.receivedBy} label="Received by" value={receivedByText(draft)} placeholder="the supervisor" />
          </div>
          <div className={cx(styles.pair, styles.pairRest)}>
            <TextField
              id={IDS.remarks}
              label="Remarks"
              value={draft.remarks}
              disabled={!editable}
              maxLength={500}
              onChange={(value) => api.setHeader({ remarks: value })}
            />
          </div>
        </div>

        {/* ── WHAT ARRIVED ─────────────────────────────────────────────── */}
        <PurchaseSectionHeading title="WHAT ARRIVED" hint={LINES_HINT} />
        <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
          <GrnLineGrid
            draft={draft}
            columns={columns}
            problemKeys={problemKeys}
            onActiveRow={(key) => {
              activeKey.current = key;
            }}
            onEdit={api.editLine}
            onOpenItemPicker={openItemPicker}
            onScanBarcode={onScanBarcode}
            onSearchItems={searchItemsFromBarcode}
            onRefused={api.setHint}
            onGoToBlank={onGoToBlank}
            onRemoveLine={onRemoveLine}
            sizes={textile.sizes}
            colours={textile.colours}
            onPickChoice={api.setTextileChoice}
            onAddChoice={onAddChoice}
            onExcessAction={api.setExcessAction}
            reasons={reasons}
            onDamageReason={api.setDamageReason}
          />
        </section>

        {/* ── F12 (left) beside CHARGES (right), as the mockup ─────────── */}
        <div className={styles.lowerPair}>
          <div className={styles.allocSlot}>
            {allocPanel.target && allocNeed ? (
              <PurchaseAllocDialog
                key={allocPanel.target.seq}
                open
                embedded
                title={allocPanel.target.title}
                tip={allocPanel.target.tip}
                need={allocNeed}
                rows={allocPanel.target.rows}
                readOnly={!editable}
                readOnlyReason={allocReadOnlyReason}
                branchId={draft.branchId}
                onAccept={onAllocRows}
                onEdited={onAllocRows}
                onProblem={allocPanel.onProblem}
                onClose={onAllocClose}
              />
            ) : (
              <>
                <PurchaseSectionHeading title="F12 — BATCH SPLIT" hint="pur_item_alloc · Σ = received + damaged + free" />
                <p className={styles.panelNote}>
                  Put the cursor on a line and press F12: its godown / bucket / batch / expiry / MRP split opens here (one row
                  per piece for a serial item; size × colour for textile, ratio pack inside).
                </p>
              </>
            )}
          </div>
          <div>
            <PurchaseSectionHeading title="CHARGES (off the bill — our own labour)" />
            <GrnChargesGrid
              rows={draft.charges}
              masters={chargeMasters}
              editable={editable}
              onAdd={api.addCharge}
              onEdit={api.editCharge}
              onRemove={api.removeCharge}
              onPayees={(row) => setPayeeTarget(row)}
            />
          </div>
        </div>

        <PurchaseTotalsStrip cells={totalsCells(draft)} />
      </div>

      {/* ── under the page, always in view: hint, WARN strip, the two button rows ── */}
      <div className={styles.foot}>
        <p className={styles.hintLine} role="status">
          {draft.hint}
        </p>
        <PurchaseWarnStrip
          warnings={draft.warnings}
          refusals={draft.refusals}
          overrideAllowed={overrideAllowed}
          overrideTicked={draft.overrideTicked}
          onOverrideChange={api.setOverrideTicked}
          hintAllowed={OVERRIDE_HINT_ALLOWED}
          hintNoRight={OVERRIDE_HINT_NO_RIGHT}
        />
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={button}
            disabled={!editable}
            title="The supplier's pending PO lines — tick several POs, they come in together"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openPoPicker}
          >
            From PO · Ctrl+L
          </button>
          <button
            type="button"
            className={button}
            title="Batches / serials / godown split of the current line"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openAllocs}
          >
            Batches · F12
          </button>
          <button
            type="button"
            className={button}
            disabled={!posted}
            title="One label per piece received (+ free) — after Post (Ctrl+P is the GRN's own print)"
            onClick={runLabels}
          >
            Print labels · Ctrl+Shift+P
          </button>
          <button
            type="button"
            className={button}
            disabled={!posted}
            title="A Purchase Return against this GRN: goods go back, Dr GRNI / Cr Stock, no GST (no bill yet)"
            onClick={runReject}
          >
            Reject (return to supplier)
          </button>
          <button
            type="button"
            className={button}
            disabled={billWhy !== ""}
            title={billWhy || "The supplier's bill came: Purchase Entry opens with this GRN's lines"}
            onClick={runMakeBill}
          >
            Make bill · Ctrl+B
          </button>
          <span className={styles.footerHint}>F1 lists the keys</span>
        </div>
        <div className={cx(styles.buttonRow, styles.buttonRowEnd)}>
          <button type="button" className={button} disabled={working || !rights.mayStartNew} onClick={runNew}>
            {withKey("New", "new")}
          </button>
          <button
            type="button"
            className={button}
            disabled={working || !canSaveDraft}
            title="Save without moving stock."
            onClick={() => runSave(false)}
          >
            {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
          </button>
          <button
            type="button"
            className={cx(button, quotationStyles.buttonPrimary)}
            disabled={working || !canPost}
            title="Saves, then brings the stock in at the provisional rate — coolie owed to each loadman, a challan short parked."
            onClick={() => runSave(true)}
          >
            {api.busy === "posting" ? "Posting…" : withKey("Post", "post")}
          </button>
          <button
            type="button"
            className={button}
            disabled={working}
            title={canEdit ? "Open this draft for keying." : "Says what can be changed here."}
            onClick={runEdit}
          >
            {withKey("Edit", "edit")}
          </button>
          <button
            type="button"
            className={button}
            disabled={working || !canCancel}
            title={draft.billStatus !== "NOT_BILLED" ? "Billed — cancel the bill first." : "Undo a posted GRN that is not billed yet."}
            onClick={() => setCancelAsk(true)}
          >
            {withKey("Cancel", "cancelDoc")}
          </button>
          <button type="button" className={button} disabled={working} onClick={openHistory}>
            {withKey("History", "history")}
          </button>
          <button type="button" className={button} disabled={working} onClick={runClose}>
            {withKey("Show List", "open")}
          </button>
          <button type="button" className={button} disabled={working} onClick={runClose}>
            {withKey("Close", "close")}
          </button>
        </div>
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
      {cancelAsk ? (
        <ReasonDialog
          title={`Cancel ${draft.refno}`}
          message="Why is this GRN being cancelled? The stock goes out again, the coolie rows are withdrawn and a parked short is dropped."
          placeholder="Type the reason"
          presets={CANCEL_REASONS}
          onCancel={() => setCancelAsk(false)}
          onConfirm={(reason) => {
            setCancelAsk(false);
            void api.cancel(reason);
          }}
        />
      ) : null}
      {overrideAsk ? (
        <ReasonDialog
          title="Post past the warnings"
          message={`Why post ${draft.refno || "this GRN"} anyway? (kept on the GRN's trail)`}
          placeholder="Type the reason"
          onCancel={() => setOverrideAsk(false)}
          onConfirm={(reason) => {
            setOverrideAsk(false);
            void api.save(true, { reason });
          }}
        />
      ) : null}
      <PurchaseSourcePicker
        open={poPickerOpen}
        choices={poPickerChoices(draft)}
        multi
        loading={api.pendingLoading}
        title={`Open POs of ${draft.supplierName}`}
        headings={{ PO: `Open POs of ${draft.supplierName}` }}
        hint="A PO's pending lines come in at the PO's rate (the provisional rate); change Received to what came. Several POs of one supplier can feed one GRN."
        onPickMany={(ids) => {
          setPoPickerOpen(false);
          api.pickPos(ids);
        }}
        onClose={() => setPoPickerOpen(false)}
      />
      <PurchaseTransportDialog
        open={transportOpen}
        band={draft.transport}
        companyId={draft.companyId}
        readOnly={!editable}
        showCrew={false}
        onClose={() => setTransportOpen(false)}
        onApply={(band) => {
          setTransportOpen(false);
          api.setTransport(band);
        }}
      />
      {payeeTarget ? (
        <PurchasePayeeDialog
          charge={{
            name: payeeTarget.name,
            payees: payeeTarget.payeeIds.map((id, index) => ({ id, text: payeeTarget.payeeNames[index] ?? id })),
          }}
          branchId={draft.branchId}
          onClose={() => setPayeeTarget(null)}
          onPick={(payees) => {
            const target = payeeTarget;
            setPayeeTarget(null);
            api.setChargePayees(target.key, payees);
          }}
        />
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel="GRN" onClose={() => setHistoryTarget(null)} />
      {posted ? (
        <PurchaseLabelDialog
          open={labelsOpen}
          docType="GRN"
          docId={draft.grnId}
          accYear={draft.accYear}
          title={`Labels — ${draft.refno}`}
          onClose={() => setLabelsOpen(false)}
        />
      ) : null}
      <PurchaseAttachDialog
        open={attachOpen}
        docType="GRN"
        docId={saved ? draft.grnId : null}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        docLabel={draft.refno ? `GRN ${draft.refno}` : "GRN"}
        readOnly={draft.status.toUpperCase() === "CANCELLED"}
        onClose={() => setAttachOpen(false)}
      />
      <NewChoiceDialog
        word={newChoice?.word ?? "size"}
        isOpen={newChoice !== null}
        onCancel={() => setNewChoice(null)}
        onAccept={onNewChoiceAccept}
      />
      {afterPost.element}
    </div>
  );
}
