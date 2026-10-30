"use client";

/**
 * Purchase Return (menu 25) — the Qt `PurchaseReturnEntry` as rebuilt
 * 2026-10-29 to the approved mockup share/purchase/purchase_return_ui_mockup.png.
 * Layout and wiring only: the rules are in `return.state.ts`, the network in
 * `use-purchase-return.ts`.
 *
 * Top to bottom: title "Purchase Return — <no>" + company · branch + the status
 * pill; THE HEADER (4 × 4: Supplier, Against, Bill, Return No / Date, Godown,
 * Settlement, Our ref / Place of sup, Supplier CN, E-way bill, Vehicle · driver
 * / Transport (popup), Remarks; + Claim on while a claim row is on a
 * transporter / insurer); THE ROWS; THE FOUR OUTCOMES legend; the six-cell
 * totals strip; then, always in view, the hint, the WARN / REFUSE strip and the
 * two button rows. Every figure is the server's (/validate while keying, /get
 * after). Claims are settled on Supplier Dues (menu 297), not here.
 *
 * Keys: From bill · Ctrl+L (F4 on the Bill field), Batches · F12 (the row's
 * exact lot), Transport F4 / Space on its field, + / − on a row; the document
 * keys (TxnKeys): New, Save Draft, Post, Edit · F2, Cancel · Alt+X, History ·
 * Ctrl+H, Show List · Ctrl+O, Close, Print · Ctrl+P, Alt+PgUp / Alt+PgDn;
 * Ctrl+A the attachments.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { DateInput } from "@/components/design-system/ui";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { useBusinessContext } from "@/components/layout/business-context";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { DateField, DropdownCombo, Field, ReadOnlyInput, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { gstStateName } from "@/features/sales/testbill/domain/shipping";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { isoToDisplayDate } from "@/lib/date-format";
import { documentRights } from "@/lib/permissions/document-rights";
import { toast } from "@/lib/notify";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { useGetCompanyStateCodeQuery } from "@/store/api/quotationApi";
import { PurchaseAttachDialog } from "../../shared/components/purchase-attach-dialog";
import { PurchaseSectionHeading, PurchaseStatusPill, PurchaseTotalsStrip, PurchaseWarnStrip } from "../../shared/components/purchase-parts";
import { PurchaseSourcePicker } from "../../shared/components/purchase-source-picker";
import { PurchaseTransportDialog } from "../../shared/components/purchase-transport-dialog";
import { transportSummary, type PurchaseSourceChoice } from "../../shared/purchase-parts";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import type { ReturnAgainstBillHandoff } from "../../shared/purchase-handoff";
import { money, num, qtyText, text } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import {
  ATTACH_DOC_TYPE,
  CLAIM_PARTY_DROPDOWN_KEY,
  GODOWN_DROPDOWN_KEY,
  KIND_OPTIONS,
  OUTCOME_LEGEND,
  OUTCOME_LEGEND_HEADS,
  OUTCOME_LEGEND_WEIGHTS,
  PRINT_PURPOSE_CODE,
  SETTLEMENT_OPTIONS,
  SUPPLIER_DROPDOWN_KEY,
  SUPPLIER_DUES_ROUTE,
  type ReturnKind,
  type ReturnSettlement,
} from "../return.constants";
import {
  balanceTip,
  claimOnNeeded,
  editAnswer,
  ewbPlaceholder,
  isEditable,
  isFresh,
  itcTip,
  placeOfSupplyText,
  rowQty,
  supplierDuesHref,
  titleLine,
  totalsCells,
} from "../return.state";
import { usePurchaseReturn } from "../use-purchase-return";
import { focusReturnGrid, ReturnLineGrid } from "./return-line-grid";
import styles from "../page.module.scss";

const CONFIG = PURCHASE_DOC_TYPES.return;

const IDS = {
  supplier: "purchase-return-supplier",
  kind: "purchase-return-kind",
  source: "purchase-return-source",
  date: "purchase-return-date",
  godown: "purchase-return-godown",
  settlement: "purchase-return-settlement",
  ourRef: "purchase-return-our-ref",
  pos: "purchase-return-pos",
  cnNo: "purchase-return-cn-no",
  ewbNo: "purchase-return-ewb-no",
  vehicle: "purchase-return-vehicle",
  transport: "purchase-return-transport",
  remarks: "purchase-return-remarks",
  claimParty: "purchase-return-claim-party",
} as const;

const LINE_KEYS: TxnKeyRow[] = [
  { label: "Pick the bill (or GRN) the goods came on", keyText: "Ctrl+L" },
  { label: "The exact batch / lot of the row", keyText: "F12" },
  { label: "Split the row into another outcome / drop a row", keyText: "+ / −" },
  { label: "Transport (on the Transport field)", keyText: "F4 / Space" },
  { label: "Next stop (Qty → Outcome → Reason → next row)", keyText: "Enter" },
  { label: "Same column, row above / below", keyText: "↑ / ↓" },
];
/** Ctrl+A — not one of the shared TxnKeys (Qt `PurchaseAttach::install`). */
const ATTACH_KEY_ROW: TxnKeyRow = { label: "Attachments", keyText: "Ctrl+A" };
const KEY_ROWS = keySheetRows(
  ["new", "saveDraft", "post", "edit", "cancelDoc", "open", "close", "print", "history", "previous", "next"],
  LINE_KEYS,
);
const KEY_SHEET = { document: [...KEY_ROWS.document, ATTACH_KEY_ROW], lines: KEY_ROWS.lines };

/** Ctrl+A (not Shift / Alt): the attachments — unless a text field takes it as Select All. */
function isAttachKey(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "a") {
    return false;
  }
  const target = event.target as HTMLElement | null;
  if (target?.isContentEditable || target instanceof HTMLTextAreaElement) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    return ["checkbox", "radio", "button", "submit", "reset"].includes(target.type);
  }
  return true;
}

function plainKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

export type PurchaseReturnEntryViewProps = PurchaseEntryViewProps & {
  /** Purchase Entry's Ctrl+F11: start a new return against this posted bill. */
  /** Purchase Entry's Ctrl+F11 (kind Bill) or GRN's Reject (kind AGAINST_GRN, the GRN id in piId). */
  againstBill?: (ReturnAgainstBillHandoff & { kind?: ReturnKind }) | null;
};

const sourceKey = (srcDocId: string, srcAccYear: string) => (srcDocId ? `${srcDocId}|${srcAccYear}` : "");

export function PurchaseReturnEntryView({ initialDocument, initialMode, onBackToList, memory, againstBill }: PurchaseReturnEntryViewProps) {
  const router = useRouter();
  const api = usePurchaseReturn({ memory });
  const { draft, draftRef, pickSource } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const { activeCompany, activeBranch } = useBusinessContext();

  const [keysOpen, setKeysOpen] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  /** The row whose lot F12 is picking. */
  const [lotRowKey, setLotRowKey] = useState<string | null>(null);
  const [transportOpen, setTransportOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const dialogOpen = cancelAsk || sourcePickerOpen || lotRowKey !== null || transportOpen || printOpen || attachOpen || keysOpen;

  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const partyDropdownId = useDropdownId(CLAIM_PARTY_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);
  const { data: companyStateCode = "" } = useGetCompanyStateCodeQuery(draft.companyId, { skip: !draft.companyId });

  // ------------------------------------------------------------ status
  const editable = isEditable(draft);
  const fresh = isFresh(draft);
  const saved = Boolean(draft.prId);
  const isDraft = draft.status === "DRAFT";
  const working = api.busy !== null;
  const canSaveDraft = editable && rights.maySaveDraft(saved);
  const canPost = isDraft && rights.mayPost && (editable || saved);
  const canCancel = saved && draft.status !== "CANCELLED" && rights.mayCancelDocument(draft.status === "POSTED");
  const canEdit = isDraft && saved && draft.viewMode === "browse" && rights.mayEdit;
  const canPrint = saved && permissions.canPrint;
  const cells = useMemo(() => totalsCells(draft), [draft]);
  const showClaimOn = claimOnNeeded(draft);

  // ---------------------------------------------------------- open a doc
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument?.id ?? " new";
    if (opened.current === target) {
      return;
    }
    opened.current = target;
    if (memory?.resume && api.resumed) {
      void api.finishResume();
      return;
    }
    if (againstBill) {
      void api.startAgainstBill(againstBill);
      return;
    }
    if (initialDocument) {
      void api.load(initialDocument, initialMode === "entry").then((loaded) => {
        if (loaded) {
          api.requestFocus(api.draftRef.current.rows.length > 0 ? "grid" : "date");
        }
      });
    } else {
      api.requestFocus("supplier");
    }
  }, [againstBill, api, initialDocument, initialMode, memory?.resume]);

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
          case "grid":
            focusReturnGrid(api.draftRef.current.rows.find((row) => rowQty(row) <= 0)?.key ?? api.draftRef.current.rows[0]?.key);
            return;
          case "supplier":
            byId(IDS.supplier);
            return;
          case "source":
            byId(IDS.source);
            return;
          case "claimParty":
            byId(IDS.claimParty);
            return;
          default:
            byId(IDS.date);
        }
      }, 0),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [api.draftRef, api.focusRequest]);

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

  // ------------------------------------------------------------ the header
  const onSource = useCallback(
    async (value: string) => {
      const [srcDocId, srcAccYear] = value.split("|");
      const current = draftRef.current;
      if (!srcDocId || value === sourceKey(current.srcDocId, current.srcAccYear)) {
        return;
      }
      if (current.rows.some((row) => rowQty(row) > 0)) {
        const replace = await confirm({
          title: "Another bill",
          message: "The qty typed against the current bill is dropped and the new one's lines come in. Continue?",
          confirmLabel: "Continue",
        });
        if (!replace) {
          return;
        }
      }
      pickSource(srcDocId, srcAccYear ?? "");
    },
    [draftRef, pickSource],
  );

  const sourceOptions = useMemo(() => {
    const first =
      draft.sourcesState === "loading"
        ? "loading…"
        : !draft.supplierId
          ? "— pick the supplier first —"
          : draft.sources.length === 0
            ? "— nothing posted —"
            : "— pick (Ctrl+L) —";
    const options = [{ value: "", label: first }];
    for (const source of draft.sources) {
      options.push({ value: sourceKey(source.srcDocId, source.srcAccYear), label: source.label });
    }
    return options;
  }, [draft.sources, draft.sourcesState, draft.supplierId]);

  // ------------------------------------------------------------ actions
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy) {
        return;
      }
      // The Qty cell commits on blur; let it land in the draft before reading it.
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.setTimeout(() => void api.save(post), 0);
    },
    [api],
  );

  const runCancel = useCallback(() => {
    const current = draftRef.current;
    if (!current.prId || current.status === "CANCELLED") {
      toast.warn("Open a saved return first.", { title: "Nothing to cancel" });
      return;
    }
    setCancelAsk(true);
  }, [draftRef]);

  const runNew = useCallback(async () => {
    if (await guardDirty("Discard entry", "This return has unsaved changes. Start a new one anyway?")) {
      api.newDocument();
    }
  }, [api, guardDirty]);

  /** Edit · F2 (Qt `PurchaseDocNav::edit`): a read-only draft opens; anything else says why on the hint line. */
  const runEdit = useCallback(() => {
    const answer = editAnswer(draftRef.current, rights.mayEdit);
    if (answer.open) {
      api.act({ type: "beginEdit" });
    }
    if (answer.notice) {
      api.act({ type: "setHint", hint: answer.notice });
    }
    if (answer.focusLines) {
      api.requestFocus("grid");
    }
  }, [api, draftRef, rights.mayEdit]);

  const runStep = useCallback(
    async (previous: boolean) => {
      if (await guardDirty("Discard entry", "This return has unsaved changes. Open another anyway?")) {
        await api.stepDocument(previous);
      }
    },
    [api, guardDirty],
  );

  const runHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current.prId) {
      api.act({ type: "setHint", hint: "Save the purchase return first — a new one has no history yet." });
      return;
    }
    setHistoryTarget({ docId: current.prId, companyId: current.companyId, accYear: current.accYear, refNo: current.refno });
  }, [api, draftRef]);

  const runPrint = useCallback(() => {
    if (!draftRef.current.prId) {
      api.act({ type: "setHint", hint: "Save the purchase return first, then print it." });
      return;
    }
    setPrintOpen(true);
  }, [api, draftRef]);

  const runAttach = useCallback(() => {
    if (!draftRef.current.prId) {
      toast.info("Save the document first — attachments hang on its number.", { title: "Attachments" });
      return;
    }
    setAttachOpen(true);
  }, [draftRef]);

  const runClose = useCallback(async () => {
    if (await guardDirty("Discard entry", "This return has unsaved changes. Close it anyway?")) {
      api.forgetRemembered();
      onBackToList();
    }
  }, [api, guardDirty, onBackToList]);

  /** From bill · Ctrl+L (Qt `openSourcePicker`): the supplier's posted bills (or GRNs) in a list. */
  const runFromBill = useCallback(() => {
    const current = draftRef.current;
    if (!isFresh(current)) {
      api.act({
        type: "setHint",
        hint: current.prId
          ? "A saved return keeps its bill — start a new one (Alt+N) for another bill."
          : `This return is ${current.status}.`,
      });
      return;
    }
    if (!current.supplierId) {
      api.act({ type: "setHint", hint: "Pick the supplier first, then the bill the goods came on." });
      api.requestFocus("supplier");
      return;
    }
    if (current.sourcesState === "ready" && current.sources.length === 0) {
      api.act({
        type: "setHint",
        hint:
          current.kind === "AGAINST_GRN"
            ? `${current.supplierName} has no posted GRN waiting for a bill.`
            : `${current.supplierName} has no posted bill to return against.`,
      });
      return;
    }
    setSourcePickerOpen(true);
  }, [api, draftRef]);

  /** Batches · F12 (Qt `openLotPicker`): the source line's own lots; the pick is the row's lot. */
  const runLots = useCallback(() => {
    const current = draftRef.current;
    const row = current.rows.find((candidate) => candidate.key === activeKey && candidate.srcItemId);
    if (!row) {
      api.act({ type: "setHint", hint: "Put the cursor on a row, then F12." });
      return;
    }
    const index = current.rows.indexOf(row) + 1;
    const lots = current.srcLines[row.srcItemId]?.lots ?? [];
    if (!isEditable(current) || lots.length === 0) {
      api.act({
        type: "setHint",
        hint: isEditable(current) ? `Row ${index}: the bill's lots are not loaded.` : `Row ${index} goes back from batch ${row.batchNo || "—"}.`,
      });
      return;
    }
    setLotRowKey(row.key);
  }, [activeKey, api, draftRef]);

  const runTransport = useCallback(() => setTransportOpen(true), []);

  /** Supplier dues (menu 297) for this supplier — claims are settled there, not here. */
  const runSupplierDues = useCallback(async () => {
    const current = draftRef.current;
    if (!current.supplierId) {
      api.act({ type: "setHint", hint: "Pick the supplier first." });
      return;
    }
    // Screen memory keeps an unsaved return across the trip; without it, ask first.
    if (!memory?.key && !(await guardDirty("Leave this return", "This return has unsaved changes. Open Supplier dues anyway?"))) {
      return;
    }
    router.push(supplierDuesHref(SUPPLIER_DUES_ROUTE, current.supplierId, current.supplierName));
  }, [api, draftRef, guardDirty, memory?.key, router]);

  // ------------------------------------------------------------ shortcuts
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? () => void runNew() : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      edit: !working ? runEdit : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      open: !working ? () => void runClose() : null,
      close: !working ? () => void runClose() : null,
      print: !working && canPrint ? runPrint : null,
      history: !working ? runHistory : null,
      previous: !working ? () => void runStep(true) : null,
      next: !working ? () => void runStep(false) : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !dialogOpen },
  );

  // The screen's own keys: Ctrl+A attachments, Ctrl+L from bill, F12 batch, F4 on Bill / Transport.
  const screenKeysLive = !working && !dialogOpen;
  useEffect(() => {
    if (!screenKeysLive) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) {
        return;
      }
      if (isAttachKey(event)) {
        event.preventDefault();
        if (!event.repeat) {
          runAttach();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        runFromBill();
        return;
      }
      if (event.key === "F12" && plainKey(event)) {
        event.preventDefault();
        runLots();
        return;
      }
      if (event.key === "F4" && plainKey(event)) {
        const id = (document.activeElement as HTMLElement | null)?.id;
        if (id === IDS.transport) {
          event.preventDefault();
          runTransport();
        } else if (id === IDS.source) {
          event.preventDefault();
          runFromBill();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runAttach, runFromBill, runLots, runTransport, screenKeysLive]);

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
    if (!event.shiftKey && editable && draft.rows.length > 0) {
      event.preventDefault();
      focusReturnGrid(draft.rows[0]?.key);
    }
  };

  // ------------------------------------------------------------ pickers
  const sourceChoices = useMemo<PurchaseSourceChoice[]>(
    () =>
      draft.sources.map((source) => ({
        kind: draft.kind === "AGAINST_GRN" ? "GRN" : "BILL",
        id: sourceKey(source.srcDocId, source.srcAccYear),
        text: source.detail,
      })),
    [draft.kind, draft.sources],
  );
  const sourceHeadings = useMemo(
    () => ({
      BILL: `${draft.supplierName}'s posted bills`,
      GRN: `${draft.supplierName}'s posted GRNs (not billed yet)`,
    }),
    [draft.supplierName],
  );
  const lotRow = lotRowKey ? draft.rows.find((row) => row.key === lotRowKey) ?? null : null;
  const lotChoices = useMemo<PurchaseSourceChoice[]>(() => {
    if (!lotRow) {
      return [];
    }
    const lots = draft.srcLines[lotRow.srcItemId]?.lots ?? [];
    // The cursor starts on the row's own lot: it is listed first.
    const ordered = [...lots].sort((a, b) => Number(text(b.lotId) === lotRow.lotId) - Number(text(a.lotId) === lotRow.lotId));
    return ordered.map((lot) => ({
      kind: "LOT",
      id: text(lot.lotId),
      text: `${text(lot.bucket)} · batch ${text(lot.batchNo) || "—"} · exp ${isoToDisplayDate(text(lot.expiryDate).slice(0, 10)) || "—"} · MRP ${
        lot.mrp === null || lot.mrp === undefined ? "—" : money(num(lot.mrp))
      } · came in ${qtyText(num(lot.qty))}`,
    }));
  }, [draft.srcLines, lotRow]);
  const lotIndex = lotRow ? draft.rows.indexOf(lotRow) + 1 : 0;

  const at = (row: number, column: number, span = 1) => ({
    gridRow: row,
    gridColumn: span > 1 ? `${column} / span ${span}` : String(column),
  });
  const subtitle = [activeCompany?.name, activeBranch?.name].filter(Boolean).join(" · ");
  const posText = placeOfSupplyText(draft.posStcd, companyStateCode, gstStateName(companyStateCode));
  const transportText = transportSummary(draft.transport);

  return (
    <div className={cx(quotationStyles.page, styles.page)}>
      <div className={styles.body}>
        {/* ── the title band ─────────────────────────────────────────── */}
        <div className={styles.titleBand}>
          <div className={styles.titles}>
            <h1 className={styles.formTitle}>{titleLine(draft)}</h1>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>
          <div className={styles.statusLine}>
            {draft.viewMode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.subtitle}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
            <PurchaseStatusPill status={draft.status} title="DRAFT, POSTED or CANCELLED." />
          </div>
        </div>

        {/* ── THE HEADER: 4 columns × 4 rows (+ Claim on) ─────────────── */}
        <PurchaseSectionHeading title="THE HEADER" />
        <div className={styles.headerCard} onKeyDown={onHeaderKeyDown}>
          <div className={styles.pair} style={at(1, 1)} data-tone={fresh ? (draft.supplierId ? "set" : "missing") : undefined}>
            <DropdownCombo
              id={IDS.supplier}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              value={draft.supplierId}
              selectedLabel={draft.supplierName}
              disabled={!fresh}
              required
              placeholder="Who the goods go back to"
              onSelect={api.setSupplier}
            />
          </div>
          <div className={styles.pair} style={at(1, 2)}>
            <SelectField
              id={IDS.kind}
              label="Against"
              value={draft.kind}
              options={KIND_OPTIONS}
              disabled={!fresh}
              title="Against a GRN (goods not billed yet) = rejection at the gate: no GST, Dr GRNI / Cr Stock"
              onChange={(value) => api.setKind(value as ReturnKind)}
            />
          </div>
          <div className={styles.pair} style={at(1, 3)} data-tone={fresh ? (draft.srcDocId ? "set" : "missing") : undefined}>
            <SelectField
              id={IDS.source}
              label="Bill *"
              value={sourceKey(draft.srcDocId, draft.srcAccYear)}
              options={sourceOptions}
              disabled={!fresh || draft.sourcesState !== "ready"}
              title="The bill (or GRN) the goods came on — F4 or Ctrl+L lists the supplier's posted ones"
              onChange={(value) => void onSource(value)}
            />
          </div>
          <div className={styles.pair} style={at(1, 4)}>
            <ReadOnlyInput id="purchase-return-refno" label="Return No" value={draft.refno} placeholder="given on save" />
          </div>

          <div className={styles.pair} style={at(2, 1)}>
            <DateField id={IDS.date} label="Date *" value={draft.docDate} disabled={!editable} onChange={(value) => api.act({ type: "setHeader", patch: { docDate: value } })} />
          </div>
          <div className={styles.pair} style={at(2, 2)}>
            <DropdownCombo
              id={IDS.godown}
              label="Godown"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              value={draft.godownId}
              selectedLabel={draft.godownName}
              disabled={!editable}
              params={godownParams}
              placeholder="Where the goods leave from"
              onSelect={(id, name) => api.act({ type: "setGodown", id, name })}
            />
          </div>
          <div className={styles.pair} style={at(2, 3)}>
            <SelectField
              id={IDS.settlement}
              label="Settlement"
              value={draft.settlement}
              options={SETTLEMENT_OPTIONS}
              disabled={!editable}
              title="How the Return (debit note) rows are settled — the company default comes first. A cash refund comes through a Receipt."
              onChange={(value) => api.act({ type: "setHeader", patch: { settlement: value as ReturnSettlement } })}
            />
          </div>
          <div className={styles.pair} style={at(2, 4)}>
            <TextField
              id={IDS.ourRef}
              label="Our ref"
              value={draft.ourRef}
              disabled={!editable}
              maxLength={60}
              placeholder="our claim memo / ref"
              onChange={(value) => api.act({ type: "setHeader", patch: { ourRef: value } })}
            />
          </div>

          <div className={styles.pair} style={at(3, 1)}>
            <ReadOnlyInput id={IDS.pos} label="Place of sup" value={posText} placeholder="as the bill" />
          </div>
          <div className={styles.pair} style={at(3, 2)}>
            <Field label="Supplier CN" htmlFor={IDS.cnNo}>
              <div className={styles.duo}>
                <input
                  id={IDS.cnNo}
                  className={quotationStyles.input}
                  value={draft.supplierCnNo}
                  disabled={!editable}
                  maxLength={60}
                  placeholder="their credit note (if given now)"
                  autoComplete="off"
                  data-quotation-focus={IDS.cnNo}
                  onChange={(event) => api.act({ type: "setHeader", patch: { supplierCnNo: event.target.value } })}
                />
                <DateInput
                  className={quotationStyles.input}
                  aria-label="Supplier CN date"
                  value={draft.supplierCnDate}
                  disabled={!editable}
                  block
                  onChange={(value) => api.act({ type: "setHeader", patch: { supplierCnDate: value } })}
                />
              </div>
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 3)}>
            <Field label="E-way bill" htmlFor={IDS.ewbNo}>
              <div className={styles.duo}>
                <input
                  id={IDS.ewbNo}
                  className={quotationStyles.input}
                  value={draft.ewbNo}
                  disabled={!editable}
                  maxLength={15}
                  placeholder={ewbPlaceholder(draft)}
                  title="An e-way bill is needed when the goods going back are worth more than the company's e-way bill limit"
                  autoComplete="off"
                  data-quotation-focus={IDS.ewbNo}
                  onChange={(event) => api.act({ type: "setHeader", patch: { ewbNo: event.target.value } })}
                />
                <DateInput
                  className={quotationStyles.input}
                  aria-label="E-way bill date"
                  value={draft.ewbDate}
                  disabled={!editable}
                  block
                  onChange={(value) => api.act({ type: "setHeader", patch: { ewbDate: value } })}
                />
              </div>
            </Field>
          </div>
          <div className={styles.pair} style={at(3, 4)}>
            <Field label="Vehicle" htmlFor={IDS.vehicle}>
              <div className={styles.duoEven}>
                <input
                  id={IDS.vehicle}
                  className={quotationStyles.input}
                  value={draft.vehicleNo}
                  disabled={!editable}
                  maxLength={20}
                  placeholder="vehicle no"
                  autoComplete="off"
                  data-quotation-focus={IDS.vehicle}
                  onChange={(event) => api.act({ type: "setHeader", patch: { vehicleNo: event.target.value.toUpperCase() } })}
                />
                <input
                  className={quotationStyles.input}
                  aria-label="Driver"
                  value={draft.driverName}
                  disabled={!editable}
                  maxLength={100}
                  placeholder="driver"
                  autoComplete="off"
                  onChange={(event) => api.act({ type: "setHeader", patch: { driverName: event.target.value } })}
                />
              </div>
            </Field>
          </div>

          <div className={styles.pair} style={at(4, 1, 2)}>
            <Field label="Transport" htmlFor={IDS.transport}>
              <input
                id={IDS.transport}
                className={cx(quotationStyles.input, quotationStyles.inputReadOnly, styles.clickable)}
                value={transportText}
                readOnly
                placeholder="LR no · transporter — Space / F4"
                title="How the goods go back: transporter, LR no / date, mode, distance — click, Space or F4"
                autoComplete="off"
                onClick={runTransport}
                onKeyDown={(event) => {
                  if (event.key === " ") {
                    event.preventDefault();
                    runTransport();
                  }
                }}
              />
            </Field>
          </div>
          <div className={styles.pair} style={at(4, 3, 2)}>
            <TextField
              id={IDS.remarks}
              label="Remarks"
              value={draft.remarks}
              disabled={!editable}
              maxLength={500}
              onChange={(value) => api.act({ type: "setHeader", patch: { remarks: value } })}
            />
          </div>
          {showClaimOn ? (
            <div className={styles.pair} style={at(5, 1, 2)}>
              <DropdownCombo
                id={IDS.claimParty}
                label="Claim on"
                dropdownId={partyDropdownId}
                valueKey="led_id"
                labelKey="led_name"
                value={draft.claimPartyId}
                selectedLabel={draft.claimPartyName || (draft.claimPartyId ? "(the saved ledger)" : "")}
                disabled={!editable}
                placeholder="The transporter / insurer ledger a claim row is on"
                onSelect={(id, name) => api.act({ type: "setClaimParty", id, name })}
              />
            </div>
          ) : null}
        </div>

        {/* ── THE ROWS ─────────────────────────────────────────────────── */}
        <PurchaseSectionHeading title="THE ROWS" hint="from the bill — the exact batch it came in as · qty ≤ billed − already returned" />
        <ReturnLineGrid
          draft={draft}
          editable={editable}
          reasons={api.reasons}
          activeKey={activeKey}
          onActiveRow={setActiveKey}
          onQty={(key, raw) => api.act({ type: "editQty", key, raw })}
          onOutcome={(key, outcome) => api.act({ type: "editOutcome", key, outcome })}
          onBucket={(key, bucket) => api.act({ type: "editBucket", key, bucket })}
          onClaimOn={(key, claimOn) => api.act({ type: "editClaimOn", key, claimOn })}
          onReason={(key, reasonId, reasonName) => api.act({ type: "editReason", key, reasonId, reasonName })}
          onSplit={(key) => {
            const newKey = `${key}-s${Date.now().toString(36)}`;
            api.act({ type: "splitRow", key, newKey });
            window.requestAnimationFrame(() => window.setTimeout(() => focusReturnGrid(newKey), 0));
          }}
          onRemove={(key) => {
            const rows = api.draftRef.current.rows;
            const index = rows.findIndex((row) => row.key === key);
            api.act({ type: "removeRow", key });
            const next = api.draftRef.current.rows[Math.min(index, api.draftRef.current.rows.length - 1)];
            window.requestAnimationFrame(() => window.setTimeout(() => focusReturnGrid(next?.key), 0));
          }}
        />

        {/* ── THE FOUR OUTCOMES (a fixed legend, D17 / D18) ─────────────── */}
        <PurchaseSectionHeading title="THE FOUR OUTCOMES" hint="what each one does to goods, money and ITC (D17, D18)" />
        <table className={styles.legend}>
          <colgroup>
            {OUTCOME_LEGEND_WEIGHTS.map((weight, index) => (
              <col key={index} style={{ width: `${weight}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {OUTCOME_LEGEND_HEADS.map((head) => (
                <th key={head} scope="col">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OUTCOME_LEGEND.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) =>
                  index === 0 ? (
                    <th key={index} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={index}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* the totals strip: Rows · Return now · Claims raised · Replace qty due · ITC reversed · Supplier balance now */}
        <div className={styles.stripWrap} title={[itcTip(draft), balanceTip(draft)].filter(Boolean).join("\n")}>
          <PurchaseTotalsStrip cells={cells} />
        </div>
      </div>

      {/* ── under the page, always in view: the hint, the strip, the two button rows ── */}
      <div className={styles.foot}>
        {draft.hint ? <p className={styles.hintLine}>{draft.hint}</p> : null}
        <PurchaseWarnStrip
          warnings={draft.warnings}
          refusals={draft.refusals}
          overrideAllowed={false}
          overrideTicked={false}
          onOverrideChange={() => undefined}
          noOverride
        />
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={working || !fresh}
            title="The supplier's posted bills (or GRNs) — the picked one's lines come in as rows"
            onClick={runFromBill}
          >
            From bill · Ctrl+L
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={working}
            title="The exact batch / lot the row's goods go back from (the bill's own lots)"
            onClick={runLots}
          >
            Batches · F12
          </button>
          <button type="button" className={quotationStyles.button} disabled={working || !canPrint} title="Print this return (Ctrl+P)" onClick={runPrint}>
            Print debit note / claim memo
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={working || !draft.supplierId}
            title={
              draft.supplierId
                ? `Open ${draft.supplierName}'s dues: claims, debit notes and replacements, settled there`
                : "Pick the supplier first"
            }
            onClick={() => void runSupplierDues()}
          >
            Supplier dues
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            title="The bill scan, damage photos — files kept with this return."
            disabled={working || !saved}
            onClick={runAttach}
          >
            Attachments · Ctrl+A
          </button>
          <span className={styles.footerHint}>F1 · keys on this screen</span>
        </div>
        <div className={cx(styles.buttonRow, styles.buttonRowEnd)}>
          <button type="button" className={quotationStyles.button} disabled={working || !rights.mayStartNew} title="Start a new return." onClick={() => void runNew()}>
            {withKey("New", "new")}
          </button>
          <button type="button" className={quotationStyles.button} title="Save without moving anything." disabled={!canSaveDraft || working} onClick={() => runSave(false)}>
            {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            title="Saves, then posts: stock out of the exact lots, the books per outcome."
            disabled={!canPost || working}
            onClick={() => runSave(true)}
          >
            {api.busy === "posting" ? "Posting…" : withKey("Post", "post")}
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            title={canEdit ? "Edit this DRAFT." : "Only a draft can be changed — F2 says why this one cannot."}
            disabled={working}
            onClick={runEdit}
          >
            {withKey("Edit", "edit")}
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            title="A draft, or a posted return whose debit note is unadjusted and claims unsettled."
            disabled={!canCancel || working}
            onClick={runCancel}
          >
            {withKey("Cancel", "cancelDoc")}
          </button>
          <button type="button" className={quotationStyles.button} title="Its status trail." disabled={working || !saved} onClick={runHistory}>
            {withKey("History", "history")}
          </button>
          <button type="button" className={quotationStyles.button} title="The return list." disabled={working} onClick={() => void runClose()}>
            {withKey("Show List", "open")}
          </button>
          <button type="button" className={quotationStyles.button} disabled={working} onClick={() => void runClose()}>
            {withKey("Close", "close")}
          </button>
        </div>
      </div>

      {cancelAsk ? (
        <ReasonDialog
          title={`Cancel ${draft.refno}`}
          message="Why is this return being cancelled?"
          placeholder="Type the reason"
          onCancel={() => setCancelAsk(false)}
          onConfirm={(reason) => {
            setCancelAsk(false);
            void api.cancelDocument(reason);
          }}
        />
      ) : null}
      <PurchaseSourcePicker
        open={sourcePickerOpen}
        title="From bill"
        choices={sourceChoices}
        headings={sourceHeadings}
        loading={draft.sourcesState === "loading"}
        hint="The picked document's lines come in as rows: type the qty going back and pick the outcome."
        onClose={() => setSourcePickerOpen(false)}
        onPick={(_kind, id) => {
          setSourcePickerOpen(false);
          void onSource(id);
        }}
      />
      <PurchaseSourcePicker
        open={lotRow !== null}
        title="Batches"
        choices={lotChoices}
        headings={{ LOT: lotRow ? `Row ${lotIndex} · ${lotRow.itemName} — the lots it came in as` : "" }}
        hint="The goods go back from the exact lot (its expiry, MRP and cost). + on the row first to send part from another lot."
        onClose={() => setLotRowKey(null)}
        onPick={(_kind, lotId) => {
          const key = lotRowKey;
          setLotRowKey(null);
          if (key) {
            api.act({ type: "setLot", key, lotId });
          }
        }}
      />
      <PurchaseTransportDialog
        open={transportOpen}
        band={draft.transport}
        companyId={draft.companyId}
        readOnly={!editable}
        showCrew={false}
        onClose={() => setTransportOpen(false)}
        onApply={(band) => api.act({ type: "setTransport", band })}
      />
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel={CONFIG.title} onClose={() => setHistoryTarget(null)} />
      {printOpen && draft.prId ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintOpen(false)}
          purposeCode={PRINT_PURPOSE_CODE}
          documentLabel={`${CONFIG.title} ${draft.refno}`.trim()}
          targets={[
            {
              docId: draft.prId,
              companyId: draft.companyId,
              branchId: draft.branchId,
              accYear: draft.accYear,
              filename: (draft.refno || draft.prId).replace(/\//g, "-"),
            },
          ]}
        />
      ) : null}
      <PurchaseAttachDialog
        open={attachOpen && Boolean(draft.prId)}
        docType={ATTACH_DOC_TYPE}
        docId={draft.prId || null}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        docLabel={`${CONFIG.title} ${draft.refno}`.trim()}
        onClose={() => setAttachOpen(false)}
      />
    </div>
  );
}
