"use client";

/**
 * Shortage Receipt (menu 195) — the Qt `ShortageReceiptEntry` (NexERP
 * src/modules/purchase/shortage/, rebuilt 2026-10-29 to the approved mockup
 * share/purchase/purchase_claims_shortage_ui_mockup.png, "SHORTAGES &
 * REPLACEMENTS — goods expected"). Layout and wiring only: every rule is in
 * `shortage.state.ts`, the network in `use-shortage-receipt.ts`.
 *
 * Title "Shortage Receipt — <supplier>", company · branch, the pill (N OPEN on a
 * new receipt, the status once saved); the header (Supplier · Receipt No ·
 * Received date-time · Godown · Challan no / Received by (supervisor) · Loadmen
 * · Remarks); the supplier's open shortages as rows — tick the ones that came,
 * Receive now, Batch / Serial, Expiry; F12 = the line's batches / serials; the
 * strip; the WARN / REFUSE strip; Batches · F12, Close row… (CN / claim /
 * write-off) and Supplier dues; New · Save Draft · Post receipt · History · Show
 * List · Close. Post brings the goods in at the ORIGINAL bill cost and releases
 * the parked GST.
 *
 * Keys: Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Post receipt, F2 Edit, Alt+X
 * Cancel, Ctrl+H History, Ctrl+P Print (key only, as Qt), Alt+PgUp / Alt+PgDn the
 * receipt before / after, Ctrl+O Show List, Esc Close, F12 batches / serials,
 * Space tick; F1 the sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import { NexDropdownMulti } from "@/components/design-system/dropdown";
import { DateTimeInput } from "@/components/design-system/ui";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { useBusinessContext } from "@/components/layout/business-context";
import { MENU_ROUTES } from "@/components/layout/constants";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { ShortageCloseDialog, type ShortageCloseBody } from "@/features/purchase/supplier-dues/components/shortage-close-dialog";
import { DropdownCombo, Field, ReadOnlyInput, TextField } from "@/features/sales/quotation/components/fields";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useMenuPermissionIndex, usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { documentRights } from "@/lib/permissions/document-rights";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { PurchaseAllocDialog } from "../../shared/components/purchase-alloc-dialog";
import { usePurchaseAllocPanel } from "../../shared/use-purchase-alloc-panel";
import {
  PurchaseSectionHeading,
  PurchaseStatusPill,
  PurchaseTotalsStrip,
  PurchaseWarnStrip,
} from "../../shared/components/purchase-parts";
import type { PurchaseAllocEntry, PurchaseAllocNeed } from "../../shared/purchase-dialogs.types";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import { num } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import {
  CHALLAN_MAX_LENGTH,
  COL,
  CREW_DROPDOWN_KEY,
  CREW_EMPTY_PARAMS,
  DISCARD_MESSAGE,
  GODOWN_DROPDOWN_KEY,
  LINE_GRID_NAME,
  LOADMAN_ROLE,
  PRINT_PURPOSE_CODE,
  REMARKS_MAX_LENGTH,
  SUPERVISOR_ROLE,
  SUPPLIER_DROPDOWN_KEY,
  SUPPLIER_DUES_MENU_ID,
} from "../shortage.constants";
import {
  allocBlocker,
  allocSeed,
  closeTargets,
  computeTotals,
  editAnswer,
  isEditable,
  isFresh,
  isSerial,
  lineProblems,
  pillOf,
  stripCells,
  titleText,
} from "../shortage.state";
import { useShortageReceipt } from "../use-shortage-receipt";
import { ShortageLinesTable } from "./shortage-lines-table";
import styles from "../page.module.scss";

const CONFIG = PURCHASE_DOC_TYPES.shortage;

const IDS = {
  supplier: "shortage-receipt-supplier",
  refno: "shortage-receipt-refno",
  received: "shortage-receipt-received",
  godown: "shortage-receipt-godown",
  challan: "shortage-receipt-challan",
  supervisor: "shortage-receipt-supervisor",
  loadmen: "shortage-receipt-loadmen",
  remarks: "shortage-receipt-remarks",
} as const;

const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Tick / untick the row (a tick receives its open qty)", keyText: "Space" },
  { label: "Batches / serials of the current line", keyText: "F12" },
  { label: "Next cell (Receive now, Batch, Expiry)", keyText: "Enter" },
  { label: "Same column, row above / below", keyText: "↑ / ↓" },
  { label: "Close a shortage without goods (CN / claim / write-off)", keyText: "Close row…" },
];
const KEY_SHEET = keySheetRows(
  ["new", "saveDraft", "post", "edit", "cancelDoc", "history", "print", "previous", "next", "open", "close"],
  LINE_KEYS,
);

const CANCEL_REASONS = ["Keyed in error", "Goods sent back", "Wrong supplier"] as const;

type CloseAsk = { rows: number; openQty: number; unit: string };

export function ShortageReceiptEntryView({ initialDocument, initialMode, onBackToList, memory }: PurchaseEntryViewProps) {
  const api = useShortageReceipt(memory);
  const { draft, draftRef } = api;
  const router = useRouter();
  const { activeCompany, activeBranch } = useBusinessContext();
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const menuIndex = useMenuPermissionIndex();
  // Qt `supplierDuesAvailable()`: the page is wired and the user may open it.
  const duesAvailable =
    Boolean(MENU_ROUTES[SUPPLIER_DUES_MENU_ID]?.href) &&
    (!menuIndex.loaded || menuIndex.byMenuId.get(SUPPLIER_DUES_MENU_ID)?.canView === true);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeAsk, setCloseAsk] = useState<CloseAsk | null>(null);
  const allocPanel = usePurchaseAllocPanel();
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const linesRef = useRef<HTMLElement | null>(null);

  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const crewDropdownId = useDropdownId(CREW_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);
  const loadmanParams = useMemo(() => ({ iemp_branch_id: draft.branchId, iemp_role: LOADMAN_ROLE }), [draft.branchId]);
  const supervisorParams = useMemo(() => ({ iemp_branch_id: draft.branchId, iemp_role: SUPERVISOR_ROLE }), [draft.branchId]);

  // --------------------------------------------------------------- derived
  const working = api.busy !== null;
  const saved = draft.psrId !== "";
  const isDraft = draft.status === "DRAFT";
  const editable = isEditable(draft);
  const fresh = isFresh(draft);
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const problems = useMemo(() => lineProblems(draft), [draft]);
  const problemKeys = useMemo(() => new Set(problems.map((problem) => problem.key)), [problems]);
  const pill = pillOf(draft);

  const canSaveDraft = editable && rights.maySaveDraft(saved);
  const canPost = editable && rights.mayPost;
  const canCancel = saved && draft.status !== "CANCELLED" && rights.mayCancelDocument(draft.status === "POSTED");
  const canEdit = saved && isDraft && draft.mode === "browse" && rights.mayEdit;
  const canPrint = saved && permissions.canPrint;
  // Qt: Close row… = a new receipt's open list, and the Post right on menu 195.
  const canCloseRow = fresh && editable && rights.mayPost && draft.lines.length > 0;
  const closeRowTip = !rights.mayPost
    ? "Closing a shortage needs the Post right on Shortage Receipt (menu 195)."
    : fresh
      ? "Close the ticked shortage(s) without goods: supplier CN, a claim on the transporter / insurer, or write off"
      : "Close row… works on the open list of a new receipt (New · Alt+N)";

  // ------------------------------------------------------------- opening
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    if (initialDocument && !memory.resume) {
      void api.load(initialDocument, initialMode === "entry");
    }
    // Once, on mount: the page remounts this view for every Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFirstReceive = useCallback(() => {
    linesRef.current
      ?.querySelector<HTMLElement>(`[data-quotation-grid="${LINE_GRID_NAME}"][data-quotation-field="${COL.Receive}"]`)
      ?.focus();
  }, []);

  // ------------------------------------------------------------- actions
  const guardDirty = useCallback(
    async (run: () => void) => {
      if (draftRef.current.dirty) {
        const ok = await confirm({ title: "Discard entry", message: DISCARD_MESSAGE, confirmLabel: "Discard" });
        if (!ok) {
          return;
        }
        api.forgetRemembered();
      }
      run();
    },
    [api, draftRef],
  );
  const runClose = useCallback(() => void guardDirty(onBackToList), [guardDirty, onBackToList]);
  const runNew = useCallback(() => void guardDirty(api.reset), [api.reset, guardDirty]);
  const runSave = useCallback((post: boolean) => void api.save(post), [api]);

  const startCancel = useCallback(() => {
    const current = draftRef.current;
    if (!current.psrId || current.status === "CANCELLED") {
      toast.warn("Open a saved receipt first.", { title: "Nothing to cancel" });
      return;
    }
    setCancelOpen(true);
  }, [draftRef]);

  /** F12 — the current line's batches / serials, INLINE under the lines (Qt `openAllocs`, embedded). */
  const allocOpen = allocPanel.open;
  const openAllocs = useCallback(() => {
    const current = draftRef.current;
    const index = current.lines.findIndex((line) => line.key === current.activeKey);
    const line = index >= 0 ? current.lines[index] : null;
    const blocker = allocBlocker(current, line, index);
    if (blocker || !line) {
      api.setHint(blocker);
      return;
    }
    const serial = isSerial(line);
    const held = allocOpen(
      {
        key: line.key,
        title: serial ? `F12 — SERIALS (line ${index + 1}, scan mode)` : `F12 — BATCH SPLIT (line ${index + 1})`,
        rows: allocSeed(line),
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
  }, [allocOpen, api, draftRef]);

  // The need is the line's, read live: the panel follows Receive now while it is open (Qt setNeed).
  const allocLine = allocPanel.target ? draft.lines.find((line) => line.key === allocPanel.target?.key) : undefined;
  const allocReceive = allocLine ? num(allocLine.receive) : 0;
  const allocSerial = allocLine ? isSerial(allocLine) : false;
  const allocNeed = useMemo<PurchaseAllocNeed | null>(
    () =>
      allocLine
        ? {
            received: allocReceive,
            damaged: 0,
            free: 0,
            serial: allocSerial,
            textile: false,
            godownId: draft.godownId,
            godownName: draft.godownName || "(the receipt's godown)",
          }
        : null,
    [allocLine, allocReceive, allocSerial, draft.godownId, draft.godownName],
  );
  // Its line went (the open list reloaded, another receipt opened): the panel goes too.
  const allocClose = allocPanel.close;
  const allocGone = allocPanel.target !== null && !allocLine;
  useEffect(() => {
    if (allocGone) {
      allocClose();
    }
  }, [allocClose, allocGone]);
  const onAllocRows = useCallback(
    (rows: PurchaseAllocEntry[]) => {
      const key = allocPanel.target?.key;
      if (key && isEditable(draftRef.current)) {
        api.applyAllocs(key, rows);
      }
    },
    [allocPanel.target, api, draftRef],
  );

  /** Close row… — the ticked open rows, else the current one (Qt `closeRows`). */
  const startCloseRows = useCallback(() => {
    const current = draftRef.current;
    if (current.psrId) {
      api.setHint("Close row… works on the open list — press New (Alt+N), pick the supplier, then close the row.");
      return;
    }
    const rows = closeTargets(current);
    if (rows.length === 0) {
      api.setHint("Tick the open shortage(s) to close (Space).");
      return;
    }
    setCloseAsk({ rows: rows.length, openQty: rows[0].openQty ?? 0, unit: rows[0].unitName });
  }, [api, draftRef]);

  const onCloseAccept = useCallback(
    (body: ShortageCloseBody) => {
      setCloseAsk(null);
      void api.closeRows(body);
    },
    [api],
  );

  /** Supplier dues (menu 297): the claims a close raised are settled there. */
  const openSupplierDues = useCallback(() => {
    const current = draftRef.current;
    const href = MENU_ROUTES[SUPPLIER_DUES_MENU_ID]?.href;
    if (!href) {
      api.setHint("Supplier dues (menu 297) is not in this build.");
      return;
    }
    const query = new URLSearchParams();
    if (current.supplierId) query.set("supplierId", current.supplierId);
    if (current.supplierName) query.set("supplierName", current.supplierName);
    router.push(query.size > 0 ? `${href}?${query.toString()}` : href);
  }, [api, draftRef, router]);

  /** Edit · F2 (Qt `PurchaseDocNav::edit`): a read-only draft opens; anything else says why. */
  const runEdit = useCallback(() => {
    const answer = editAnswer(draftRef.current, rights.mayEdit);
    if (answer.open) {
      api.beginEdit();
    }
    if (answer.notice) {
      api.setHint(answer.notice);
    }
    if (answer.focusLines) {
      window.requestAnimationFrame(() => window.setTimeout(focusFirstReceive, 0));
    }
  }, [api, draftRef, focusFirstReceive, rights.mayEdit]);

  const runStep = useCallback((previous: boolean) => void guardDirty(() => void api.stepDocument(previous)), [api, guardDirty]);

  const runPrint = useCallback(() => {
    if (!draftRef.current.psrId) {
      api.setHint("Save the shortage receipt first, then print it.");
      return;
    }
    setPrintOpen(true);
  }, [api, draftRef]);

  const openHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current.psrId) {
      api.setHint("Save the shortage receipt first — a new one has no history yet.");
      return;
    }
    setHistoryTarget({ docId: current.psrId, companyId: current.companyId, accYear: current.accYear, refNo: current.refno });
  }, [api, draftRef]);

  // ------------------------------------------------------------ shortcuts
  const anyDialog = cancelOpen || closeAsk !== null || printOpen || historyTarget !== null || keysOpen;
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      edit: !working ? runEdit : null,
      cancelDoc: !working && canCancel ? startCancel : null,
      history: !working ? openHistory : null,
      print: !working && canPrint ? runPrint : null,
      previous: !working ? () => runStep(true) : null,
      next: !working ? () => runStep(false) : null,
      open: !working ? runClose : null,
      close: !working ? runClose : null,
    },
    { onHelp: () => setKeysOpen(true) },
  );

  // F12 — batches / serials of the current line (not a TxnKeys action).
  useEffect(() => {
    if (anyDialog) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "F12" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) {
        return;
      }
      event.preventDefault();
      if (!working) {
        openAllocs();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialog, working, openAllocs]);

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

  /** Enter walks the header; its last field hands over to the first Receive now. */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && editable && draft.lines.length > 0) {
      event.preventDefault();
      focusFirstReceive();
    }
  };

  const emptyText = !draft.supplierId
    ? "Pick the supplier — every open shortage of theirs comes in as a row."
    : api.busy === "loading"
      ? "Reading the open shortages…"
      : fresh
        ? "Nothing of this supplier's is short."
        : "No lines.";

  return (
    <div className={quotationStyles.page}>
      {/* ── title band: "Shortage Receipt — <supplier>", company · branch, the pill ── */}
      <div className={styles.titleBand}>
        <div className={styles.titleBlock}>
          <h1 className={styles.formTitle}>{titleText(draft)}</h1>
          <span className={styles.subtitle}>{[activeCompany?.name, activeBranch?.name].filter(Boolean).join(" · ")}</span>
        </div>
        <div className={styles.statusLine}>
          {draft.mode === "browse" && saved ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
          {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
          {api.busy ? <span className={styles.subtitle}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
          <PurchaseStatusPill
            status={draft.status}
            label={pill.label}
            tone={pill.tone}
            title="A new receipt: how many shortages are open. A saved one: DRAFT holds the qty, POSTED brought the goods in, CANCELLED opened the shortage again."
          />
        </div>
      </div>

      <PurchaseSectionHeading
        title="SHORTAGES & REPLACEMENTS — goods expected"
        hint="tick rows, receive what came → Shortage Receipt (stock in at the ORIGINAL bill cost)"
      />

      {/* ── the header: Supplier / Receipt No · Received · Godown · Challan no / Received by · Loadmen · Remarks ── */}
      <div className={styles.fieldsCard} onKeyDown={onHeaderKeyDown}>
        <div className={styles.supplierRow}>
          <DropdownCombo
            id={IDS.supplier}
            label="Supplier"
            dropdownId={supplierDropdownId}
            valueKey="sup_id"
            labelKey="sup_name"
            value={draft.supplierId}
            selectedLabel={draft.supplierName}
            disabled={!editable || !fresh || working}
            required
            placeholder="Every open shortage of this supplier comes in as a row"
            onSelect={api.chooseSupplier}
          />
        </div>
        <ReadOnlyInput id={IDS.refno} label="Receipt No" value={draft.refno} placeholder="given on save" />
        <Field label="Received" htmlFor={IDS.received} required>
          <DateTimeInput
            id={IDS.received}
            className={quotationStyles.input}
            value={draft.receivedAt}
            disabled={!isDraft || !editable}
            clearable={false}
            block
            title="When the goods came in (kept as first saved unless changed here)"
            data-quotation-focus={IDS.received}
            onChange={api.patchReceivedAt}
          />
        </Field>
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
          placeholder="Where the goods land"
          onSelect={(godownId, godownName) => api.patchHeader({ godownId, godownName })}
        />
        <TextField
          id={IDS.challan}
          label="Challan no"
          value={draft.challanNo}
          disabled={!editable}
          maxLength={CHALLAN_MAX_LENGTH}
          placeholder="the supplier's DC no"
          onChange={(challanNo) => api.patchHeader({ challanNo })}
        />
        <DropdownCombo
          id={IDS.supervisor}
          label="Received by"
          dropdownId={crewDropdownId}
          valueKey="emp_id"
          labelKey="emp_name"
          value={draft.supervisorId}
          selectedLabel={draft.supervisorName}
          disabled={!editable}
          params={supervisorParams}
          placeholder="The supervisor who checked the goods in"
          onSelect={(supervisorId, supervisorName) =>
            api.patchHeader({ supervisorId, supervisorName: supervisorId ? supervisorName : "" })
          }
        />
        <Field label="Loadmen" htmlFor={IDS.loadmen}>
          <NexDropdownMulti
            dropdownId={crewDropdownId}
            params={loadmanParams}
            keepEmptyParams={CREW_EMPTY_PARAMS}
            value={draft.receivedBy}
            disabled={!editable}
            placeholder="Who unloaded"
            aria-label="Loadmen"
            onChange={(receivedBy) => api.patchHeader({ receivedBy })}
          />
        </Field>
        <Field label="Remarks" htmlFor={IDS.remarks}>
          <input
            id={IDS.remarks}
            className={cx(quotationStyles.input, styles.remarksInput)}
            value={draft.remarks}
            disabled={!editable}
            maxLength={REMARKS_MAX_LENGTH}
            autoComplete="off"
            data-quotation-focus={IDS.remarks}
            onChange={(event) => api.patchHeader({ remarks: event.target.value })}
          />
        </Field>
        {editable && draft.supervisorId ? (
          <button
            type="button"
            className={cx(quotationStyles.button, styles.clearSupervisor)}
            title="Clear Received by"
            onClick={() => api.patchHeader({ supervisorId: "", supervisorName: "" })}
          >
            Clear received by
          </button>
        ) : null}
      </div>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)} ref={linesRef}>
        <ShortageLinesTable
          lines={draft.lines}
          editable={editable}
          isDraft={isDraft}
          activeKey={draft.activeKey}
          problemKeys={problemKeys}
          emptyText={emptyText}
          onTick={api.tick}
          onReceive={api.typeReceive}
          onEdit={api.patchLine}
          onSelect={api.selectLine}
        />
      </section>

      {/* ── F12, inline under the lines while it is open (Qt m_allocSlot) ── */}
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
          readOnlyReason={editable ? undefined : `${draft.refno} is ${draft.status} — the split is the server's.`}
          branchId={draft.branchId}
          onAccept={onAllocRows}
          onEdited={onAllocRows}
          onProblem={allocPanel.onProblem}
          onClose={allocClose}
        />
      ) : null}

      {/* ── the strip: Ticked rows · Receive now (base) · Stock in at original cost · ITC released · Still open after this ── */}
      <PurchaseTotalsStrip cells={stripCells(totals)} />

      {/* ── the foot: the hint, the WARN / REFUSE strip, the two button rows ── */}
      <div className={styles.foot}>
        <p className={styles.hintLine} aria-live="polite">
          {problems.length > 0 ? problems.map((problem) => problem.text).join(" · ") : api.hint}
        </p>
        <PurchaseWarnStrip refusals={api.refusals} overrideAllowed={false} overrideTicked={false} onOverrideChange={() => undefined} />
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={working || draft.lines.length === 0}
            title="Batches / serials of the current line"
            onClick={openAllocs}
          >
            Batches · F12
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={working || !canCloseRow}
            title={closeRowTip}
            onClick={startCloseRows}
          >
            Close row… (CN / claim / write-off)
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={!duesAvailable || !draft.supplierId}
            title={duesAvailable ? "What this supplier owes — claims raised by Close row… are settled there" : "Supplier dues (menu 297) is not open to you"}
            onClick={openSupplierDues}
          >
            Supplier dues
          </button>
        </div>
        <div className={cx(styles.buttonRow, styles.buttonRowEnd)}>
          <button type="button" className={quotationStyles.button} disabled={working || !rights.mayStartNew} onClick={runNew}>
            {withKey("New", "new")}
          </button>
          {saved ? (
            <button
              type="button"
              className={quotationStyles.button}
              disabled={working}
              title={canEdit ? "Edit this DRAFT." : "Only a draft can be changed — F2 says why this one cannot."}
              onClick={runEdit}
            >
              {withKey("Edit", "edit")}
            </button>
          ) : null}
          <button
            type="button"
            className={quotationStyles.button}
            disabled={working || !canSaveDraft}
            title="Holds the qty against the shortages. Nothing comes in."
            onClick={() => runSave(false)}
          >
            {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={working || !canPost}
            title="Stock in at the original bill cost, the receivable cleared, the parked GST released."
            onClick={() => runSave(true)}
          >
            {api.busy === "posting" ? "Posting…" : withKey("Post receipt", "post")}
          </button>
          {saved ? (
            <button
              type="button"
              className={quotationStyles.button}
              disabled={working || !canCancel}
              title={draft.status === "POSTED" ? "The goods go out again and the shortage is open again." : "Drop this draft's hold on the shortages."}
              onClick={startCancel}
            >
              {withKey("Cancel", "cancelDoc")}
            </button>
          ) : null}
          <button type="button" className={quotationStyles.button} disabled={!saved} onClick={openHistory}>
            {withKey("History", "history")}
          </button>
          <button type="button" className={quotationStyles.button} disabled={working} onClick={runClose}>
            {withKey("Show List", "open")}
          </button>
          <button type="button" className={quotationStyles.button} disabled={working} onClick={runClose}>
            {withKey("Close", "close")}
          </button>
        </div>
      </div>

      {cancelOpen ? (
        <ReasonDialog
          title={`Cancel ${draft.refno}`}
          message="Why is this receipt being cancelled?"
          placeholder="Type the reason"
          presets={CANCEL_REASONS}
          onCancel={() => setCancelOpen(false)}
          onConfirm={(reason) => {
            setCancelOpen(false);
            void api.cancel(reason);
          }}
        />
      ) : null}
      <ShortageCloseDialog
        open={closeAsk !== null}
        rows={closeAsk?.rows ?? 1}
        openQty={closeAsk?.openQty ?? 0}
        unit={closeAsk?.unit ?? ""}
        onCancel={() => setCloseAsk(null)}
        onAccept={onCloseAccept}
      />
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel={CONFIG.title} onClose={() => setHistoryTarget(null)} />
      {printOpen && draft.psrId ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintOpen(false)}
          purposeCode={PRINT_PURPOSE_CODE}
          documentLabel={`${CONFIG.title} ${draft.refno}`.trim()}
          targets={[
            {
              docId: draft.psrId,
              companyId: draft.companyId,
              branchId: draft.branchId,
              accYear: draft.accYear,
              filename: (draft.refno || draft.psrId).replace(/\//g, "-"),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
