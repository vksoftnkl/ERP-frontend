"use client";

/**
 * Branch Inward — the receipt (the Qt `BranchInwardEntry`, menu 193, "Transfer
 * In — receive"). Layout and wiring only: every rule is in
 * `branch-inward.state.ts`, the network in `use-branch-inward-draft.ts`.
 *
 * WORKLIST-DRIVEN, NEVER FREE ENTRY. A new receipt starts from what is on the
 * way to this branch; picking a despatch opens its transit rows at the
 * REMAINDER. Save Draft keeps a DRAFT (nothing comes in); Post receipt
 * (Ctrl+Enter) saves and posts — the stock arrives, the transit rows settle and
 * the Unloading charge posts at this branch. A posted receipt cannot be
 * un-received (a new transfer sends it back), so there is no Cancel here — a
 * DRAFT is deleted.
 *
 * Keys: the shared transaction set (`lib/txn-keys`) as the Qt screen binds
 * them — Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Post, Ctrl+H History, Ctrl+O
 * Show List, Esc Close — and F2 to open a draft that was looked at. F1 is the
 * sheet; F5 refreshes the worklist.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { cx } from "@/components/design-system/cx";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useGridId } from "@/lib/configured-grids";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { DateField, Field, ReadOnlyInput } from "@/features/sales/quotation/components/fields";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { ConfirmDialog, type ConfirmRequest } from "../../stock-adjustment/components/confirm-dialog";
import { resolveColumns } from "../branch-inward.columns";
import {
  BRANCH_INWARD_INBOUND_GRID_KEY,
  BRANCH_INWARD_LINES_UI_TABLE_KEY,
  DISCARD_CLOSE,
  DISCARD_NEW,
  GRID_NOTE,
} from "../branch-inward.constants";
import { KEY_SHEET } from "../branch-inward.keys";
import {
  auditLines,
  chargeText,
  computeTotals,
  hasDespatch,
  isDraftStatus,
  isEditable,
  lineNotes,
  outcomeOf,
  postConfirmMessage,
  scopeLabel,
  titleLine,
  validationStrip,
} from "../branch-inward.state";
import type { BranchInwardDocKey } from "../branch-inward.types";
import { useBranchInwardDraft } from "../use-branch-inward-draft";
import { InboundWorklist } from "./inbound-worklist";
import { LinesTable } from "./lines-table";
import { OutcomeCard } from "./outcome-card";
import { UnloadingBox } from "./unloading-box";
import styles from "../page.module.scss";

const DOC_DATE_ID = "branch-inward-date";
const REMARKS_ID = "branch-inward-remarks";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
};

export type BranchInwardEntryViewProps = {
  initialDocument?: BranchInwardDocKey;
  initialMode?: "browse" | "entry";
  onBackToList: () => void;
};

export function BranchInwardEntryView({
  initialDocument,
  initialMode = "browse",
  onBackToList,
}: BranchInwardEntryViewProps) {
  const inboundGridId = useGridId(BRANCH_INWARD_INBOUND_GRID_KEY);
  const api = useBranchInwardDraft({ inboundGridId });
  const { draft, draftRef, save, deleteDraft, reset, load, beginEdit, loadInbound } = api;
  const { activeCompany } = useBusinessContext();
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const linesRef = useRef<HTMLDivElement | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(BRANCH_INWARD_LINES_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(
    () => resolveColumns(layout, { unloading: draft.unloadEnabled, asKeyed: draft.asKeyed }),
    [draft.asKeyed, draft.unloadEnabled, layout],
  );

  // --------------------------------------------------------------- derived
  const picked = hasDespatch(draft);
  const saved = draft.svhId !== "";
  const isDraft = isDraftStatus(draft);
  const keying = isEditable(draft) && picked;
  const showWorklist = !picked && !saved;
  const working = api.busy !== null;
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const outcome = useMemo(() => outcomeOf(draft, totals), [draft, totals]);
  const notes = useMemo(() => lineNotes(draft), [draft]);
  const strip = useMemo(() => validationStrip(draft), [draft]);
  const audit = auditLines(draft);

  const canPost = keying && rights.mayPost;
  const canSaveDraft = keying && rights.maySaveDraft(saved);
  const canDelete = saved && isDraft && rights.mayDeleteDraft;
  const canEdit = saved && isDraft && draft.mode === "browse" && rights.mayEdit;

  // ------------------------------------------------------------- opening
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !initialDocument) {
      return;
    }
    opened.current = true;
    void load(initialDocument, initialMode === "entry");
    // Once, on mount: the page remounts this view for every Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The cursor goes where keying starts: the first Receiving now.
  const focusKey = `${draft.outId}|${draft.svhId}|${draft.mode}`;
  useEffect(() => {
    if (!keying) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      linesRef.current?.querySelector<HTMLElement>('[data-bi-cell$=":6"]:not(:disabled)')?.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [focusKey, keying]);

  // ------------------------------------------------------------- actions
  const guardDirty = useCallback(
    (title: string, message: string, run: () => void) => {
      if (!draftRef.current.dirty) {
        run();
        return;
      }
      setConfirm({ title, message, onConfirm: run });
    },
    [draftRef],
  );

  const runClose = useCallback(
    () => guardDirty("Discard entry", DISCARD_CLOSE, onBackToList),
    [guardDirty, onBackToList],
  );
  const runNew = useCallback(() => guardDirty("Discard entry", DISCARD_NEW, reset), [reset, guardDirty]);

  const runSave = useCallback(
    (post: boolean) => {
      const current = draftRef.current;
      if (!isEditable(current) || !hasDespatch(current)) {
        return;
      }
      if (!post) {
        void save(false);
        return;
      }
      const currentTotals = computeTotals(current);
      setConfirm({
        title: "Post the receipt?",
        message: postConfirmMessage(current, currentTotals, outcomeOf(current, currentTotals)),
        confirmLabel: "Post",
        onConfirm: () => void save(true),
      });
    },
    [draftRef, save],
  );

  const runDelete = useCallback(() => {
    const current = draftRef.current;
    setConfirm({
      title: `Delete ${current.refno}?`,
      message: "The draft brought nothing in. Delete it? The despatch stays in transit.",
      confirmLabel: "Delete",
      onConfirm: () => void deleteDraft(),
    });
  }, [deleteDraft, draftRef]);

  const openHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current.svhId) {
      return;
    }
    setHistoryTarget({
      docId: current.svhId,
      companyId: current.companyId,
      accYear: current.accYear,
      refNo: current.refno,
    });
  }, [draftRef]);

  // ------------------------------------------------------------ shortcuts
  // A handler left null is not intercepted at all: its button is off. A dialog
  // is `aria-modal`, so the hook stands down under one.
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      edit: !working && canEdit ? () => void beginEdit() : null,
      history: saved ? openHistory : null,
      open: !working ? runClose : null,
      close: !working ? runClose : null,
    },
    { onHelp: () => setKeysOpen(true) },
  );

  // F5 refreshes the worklist; anywhere else it is swallowed, so a habit press
  // cannot reload the page and take the unsaved receipt with it.
  const refreshRef = useRef({ show: showWorklist, busy: working, refresh: loadInbound });
  useEffect(() => {
    refreshRef.current = { show: showWorklist, busy: working, refresh: loadInbound };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F5" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      const current = refreshRef.current;
      if (current.show && !current.busy && !document.querySelector('[aria-modal="true"]')) {
        void current.refresh();
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

  /** Enter walks the header — Date, Remarks — and the last field hands over to the grid. */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && keying) {
      event.preventDefault();
      linesRef.current?.querySelector<HTMLElement>('[data-bi-cell$=":6"]:not(:disabled)')?.focus();
    }
  };

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={runClose}>
              ‹ Branch Inward
            </button>
            <h1 className={quotationStyles.title}>Branch Inward</h1>
          </div>
          <span className={styles.kindHint}>{titleLine(draft)}</span>
          <span className={styles.scope} title="The company and the despatch this receipt is against.">
            {scopeLabel(draft, activeCompany?.name ?? "")}
          </span>
          <div className={styles.statusLine}>
            <span
              className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)}
              title="DRAFT brought nothing in; POSTED has arrived."
            >
              {draft.status}
            </span>
            {draft.mode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.scope}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
          </div>
          <div className={styles.audit} title="Who created this receipt and, once posted, who posted it">
            {audit.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {draft.notice ? (
              <span className={styles.notice} role="status">
                {draft.notice}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── the header: Voucher No · Date · Against · From branch / To godown · Remarks ── */}
        <div className={styles.fieldsCard} onKeyDown={onHeaderKeyDown}>
          <ReadOnlyInput
            id="branch-inward-docno"
            label="Voucher No"
            value={draft.refno}
            placeholder="given on save — this branch's own series"
          />
          <DateField
            id={DOC_DATE_ID}
            label="Date"
            value={draft.docDate}
            disabled={!keying}
            onChange={api.setDocDate}
          />
          <ReadOnlyInput id="branch-inward-against" label="Against" value={draft.outRefno} placeholder="pick a despatch" />
          <ReadOnlyInput id="branch-inward-from-branch" label="From branch" value={draft.fromBranchName} />
          <ReadOnlyInput id="branch-inward-to-godown" label="To godown" value={draft.toGodownName} />
          <Field label="Remarks" htmlFor={REMARKS_ID}>
            <input
              id={REMARKS_ID}
              className={cx(quotationStyles.input, styles.remarksInput)}
              value={draft.remarks}
              disabled={!keying}
              maxLength={250}
              placeholder="e.g. one bag torn, two short"
              autoComplete="off"
              data-quotation-focus={REMARKS_ID}
              onChange={(event) => api.setRemarks(event.target.value)}
            />
          </Field>
        </div>
      </div>

      {showWorklist ? (
        <InboundWorklist
          rows={api.inbound}
          loaded={api.inboundLoaded}
          busy={working}
          onOpen={(row) => void api.openDespatch(row)}
          onRefresh={() => void loadInbound()}
        />
      ) : (
        <>
          <section className={cx(quotationStyles.gridShell, styles.gridShell)} ref={linesRef}>
            <div className={quotationStyles.gridHead}>
              <span className={quotationStyles.gridHeadTitle}>What arrived</span>
              <span className={quotationStyles.modalNote}>{keying ? GRID_NOTE : ""}</span>
            </div>
            <LinesTable
              lines={draft.lines}
              columns={columns}
              editable={keying}
              problemKeys={strip?.keys ?? EMPTY_KEYS}
              notes={notes}
              focusRequest={api.focusRequest}
              onEdit={api.editCell}
              onAddDamaged={api.addDamaged}
              onRemove={api.dropLine}
            />
          </section>
          <div className={styles.bottomRow}>
            <UnloadingBox
              draft={draft}
              editable={keying}
              charge={chargeText(draft, totals)}
              patch={api.patchUnloading}
            />
            <OutcomeCard outcome={outcome} />
          </div>
        </>
      )}

      {strip ? <p className={styles.validation}>{strip.text}</p> : null}
      <p className={styles.hintLine}>{api.hint}</p>
      <div className={styles.spacer} />

      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>F1 lists the keys</span>
        {saved && isDraft && rights.mayDeleteDraft ? (
          <button type="button" className={quotationStyles.button} disabled={working || !canDelete} onClick={runDelete}>
            Delete draft
          </button>
        ) : null}
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          onClick={runNew}
        >
          {withKey("New", "new")}
        </button>
        {canEdit ? (
          <button type="button" className={quotationStyles.button} disabled={working} onClick={() => void beginEdit()}>
            {withKey("Edit", "edit")}
          </button>
        ) : null}
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canSaveDraft}
          onClick={() => runSave(false)}
        >
          {withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={working || !canPost}
          title={canPost ? "The stock arrives, the transit rows settle, the unloading charge posts." : undefined}
          onClick={() => runSave(true)}
        >
          {withKey("Post receipt", "post")}
        </button>
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

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <TxnKeysSheet
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        document={KEY_SHEET.document}
        lines={KEY_SHEET.lines}
      />
      <TxnHistoryDialog target={historyTarget} docLabel="Branch Inward" onClose={() => setHistoryTarget(null)} />
    </div>
  );
}

const EMPTY_KEYS: ReadonlySet<string> = new Set();
