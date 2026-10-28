"use client";

/**
 * Purchase Return / Claim (menu 25) — the Qt `PurchaseReturnEntry` (NexERP
 * 8ca6ff3, plan-purchase-frontend F7). Layout and wiring only: the rules are in
 * `return.state.ts`, the network in `use-purchase-return.ts`.
 *
 * Pick the supplier, then the bill (or GRN) the goods came on: its lines come
 * in with what can still go back. Type the qty per row and pick the outcome —
 * RETURN (a debit note), CLAIM SENT / CLAIM DESTROYED (a claim on the supplier,
 * transporter or insurer), REPLACE (the same goods are due back). + on a row
 * splits that bill line into another outcome. Post: stock out of the exact
 * lots, the books per outcome. Claims… opens the open claims to credit /
 * short-settle / reject.
 *
 * Header, four columns (Qt grid): Supplier · Against · Bill / GRN · Return No /
 * Date · Supplier CN · CN Date · Vehicle / Claim on (other) · Remarks.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { useBusinessContext } from "@/components/layout/business-context";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { DateField, DropdownCombo, ReadOnlyInput, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { keySheetRows, withKey } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import { purchaseStatusText, qtyText } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import { resolveColumns } from "../return.columns";
import {
  CLAIM_PARTY_DROPDOWN_KEY,
  FALLBACK_COLUMN_TITLES,
  FALLBACK_COLUMN_WIDTHS,
  KIND_OPTIONS,
  LINE_GRID_UI_TABLE_KEY,
  SHOWN_COLUMNS,
  SUPPLIER_DROPDOWN_KEY,
  type ReturnKind,
} from "../return.constants";
import { isEditable, isFresh, overReturned, rowQty, titleLine, totalsParts } from "../return.state";
import { usePurchaseReturn } from "../use-purchase-return";
import { PurchaseClaimsDialog } from "./purchase-claims-dialog";
import { focusReturnGrid, ReturnLineGrid } from "./return-line-grid";
import styles from "../page.module.scss";

const CONFIG = PURCHASE_DOC_TYPES.return;

const IDS = {
  supplier: "purchase-return-supplier",
  kind: "purchase-return-kind",
  source: "purchase-return-source",
  date: "purchase-return-date",
  cnNo: "purchase-return-cn-no",
  cnDate: "purchase-return-cn-date",
  vehicle: "purchase-return-vehicle",
  claimParty: "purchase-return-claim-party",
  remarks: "purchase-return-remarks",
} as const;

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

const GRID_NOTE = "Enter walks Qty → Outcome · + splits a bill line into another outcome · − drops a row · F1 lists the keys";

const LINE_KEYS = [
  { label: "Split the bill line into another outcome", keyText: "+ / Alt+=" },
  { label: "Drop the row", keyText: "− / Alt+−" },
  { label: "Next stop (Qty → Outcome → next row)", keyText: "Enter" },
  { label: "Same column, row above / below", keyText: "↑ / ↓" },
];
const KEY_SHEET = keySheetRows(["new", "saveDraft", "post", "edit", "cancelDoc", "open", "close"], LINE_KEYS);

const sourceKey = (srcDocId: string, srcAccYear: string) => (srcDocId ? `${srcDocId}|${srcAccYear}` : "");

export function PurchaseReturnEntryView({ initialDocument, initialMode, onBackToList, memory }: PurchaseEntryViewProps) {
  const api = usePurchaseReturn({ memory });
  const { draft, draftRef, pickSource } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const { activeCompany, activeBranch } = useBusinessContext();

  const [keysOpen, setKeysOpen] = useState(false);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const activeKey = useRef<string | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(LINE_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveColumns(layout, SHOWN_COLUMNS, FALLBACK_COLUMN_TITLES, FALLBACK_COLUMN_WIDTHS), [layout]);
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Return lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote: "Where Enter stops is this screen's own rule: Qty, then Outcome, then the next row.",
  });
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const partyDropdownId = useDropdownId(CLAIM_PARTY_DROPDOWN_KEY);

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
  const overKeys = useMemo(() => overReturned(draft), [draft]);
  const totals = useMemo(() => totalsParts(draft), [draft]);

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
    if (initialDocument) {
      void api.load(initialDocument, initialMode === "entry").then((loaded) => {
        if (loaded) {
          api.requestFocus(api.draftRef.current.rows.length > 0 ? "grid" : "date");
        }
      });
    } else {
      api.requestFocus("supplier");
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
            : "— pick —";
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
      return;
    }
    setCancelAsk(true);
  }, [draftRef]);

  const runNew = useCallback(async () => {
    if (await guardDirty("Discard entry", "This return has unsaved changes. Start a new one anyway?")) {
      api.newDocument();
    }
  }, [api, guardDirty]);

  const runEdit = useCallback(() => {
    api.act({ type: "beginEdit" });
    api.requestFocus("grid");
  }, [api]);

  const runClose = useCallback(async () => {
    if (await guardDirty("Discard entry", "This return has unsaved changes. Close it anyway?")) {
      api.forgetRemembered();
      onBackToList();
    }
  }, [api, guardDirty, onBackToList]);

  // ------------------------------------------------------------ shortcuts
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? () => void runNew() : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      edit: !working && canEdit ? runEdit : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      open: !working ? () => void runClose() : null,
      close: !working ? () => void runClose() : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !gridSettings.active && !claimsOpen && !cancelAsk },
  );

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

  const at = (row: number, column: number, span = 1) => ({
    gridRow: row,
    gridColumn: span > 1 ? `${column} / span ${span}` : String(column),
  });
  const scope = [activeCompany?.name, activeBranch?.name, draft.accYear].filter(Boolean).join(" · ");

  return (
    <div className={cx(quotationStyles.page, styles.page)}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={() => void runClose()}>
              ‹ {CONFIG.listTitle}
            </button>
            <h1 className={quotationStyles.title}>{CONFIG.title}</h1>
          </div>
          <span className={styles.docTitle}>{titleLine(draft)}</span>
          <span className={styles.scope} title="The company, branch and accounting year this document belongs to.">
            {scope}
          </span>
          <div className={styles.statusLine}>
            <span className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)} title="DRAFT, POSTED or CANCELLED.">
              {purchaseStatusText(draft.status)}
            </span>
            {draft.viewMode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.scope}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
          </div>
        </div>

        {/* ── the header: four columns, in tab order ──────────────────── */}
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
              label="Against *"
              value={draft.kind}
              options={KIND_OPTIONS}
              disabled={!fresh}
              title="A posted bill, or a posted GRN not yet billed (RETURN only)."
              onChange={(value) => api.setKind(value as ReturnKind)}
            />
          </div>
          <div className={styles.pair} style={at(1, 3)} data-tone={fresh ? (draft.srcDocId ? "set" : "missing") : undefined}>
            <SelectField
              id={IDS.source}
              label="Bill / GRN *"
              value={sourceKey(draft.srcDocId, draft.srcAccYear)}
              options={sourceOptions}
              disabled={!fresh || draft.sourcesState !== "ready"}
              title="The document the goods came on — its lines come in with what can still go back."
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
            <TextField
              id={IDS.cnNo}
              label="Supplier CN"
              value={draft.supplierCnNo}
              disabled={!editable}
              maxLength={60}
              placeholder="their credit note, when it comes"
              onChange={(value) => api.act({ type: "setHeader", patch: { supplierCnNo: value } })}
            />
          </div>
          <div className={styles.pair} style={at(2, 3)}>
            <DateField
              id={IDS.cnDate}
              label="CN Date"
              value={draft.supplierCnDate}
              disabled={!editable}
              onChange={(value) => api.act({ type: "setHeader", patch: { supplierCnDate: value } })}
            />
          </div>
          <div className={styles.pair} style={at(2, 4)}>
            <TextField
              id={IDS.vehicle}
              label="Vehicle"
              value={draft.vehicleNo}
              disabled={!editable}
              maxLength={20}
              onChange={(value) => api.act({ type: "setHeader", patch: { vehicleNo: value.toUpperCase() } })}
            />
          </div>
          <div className={styles.pair} style={at(3, 1, 2)}>
            <DropdownCombo
              id={IDS.claimParty}
              label="Claim on (other)"
              dropdownId={partyDropdownId}
              valueKey="led_id"
              labelKey="led_name"
              value={draft.claimPartyId}
              selectedLabel={draft.claimPartyName || (draft.claimPartyId ? "(the saved ledger)" : "")}
              disabled={!editable}
              placeholder="The transporter / insurer a TRANSPORTER or INSURER claim row is on"
              onSelect={(id, name) => api.act({ type: "setClaimParty", id, name })}
            />
          </div>
          <div className={styles.pair} style={at(3, 3, 2)}>
            <TextField
              id={IDS.remarks}
              label="Remarks"
              value={draft.remarks}
              disabled={!editable}
              maxLength={500}
              onChange={(value) => api.act({ type: "setHeader", patch: { remarks: value } })}
            />
          </div>
        </div>
      </div>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Lines</span>
          <span className={quotationStyles.modalNote}>{GRID_NOTE}</span>
        </div>
        {gridSettings.overlays}
        <ReturnLineGrid
          draft={draft}
          columns={columns}
          editable={editable}
          overKeys={overKeys}
          onContextMenu={gridSettings.onContextMenu}
          onActiveRow={(key) => {
            activeKey.current = key;
          }}
          onQty={(key, raw) => api.act({ type: "editQty", key, raw })}
          onOutcome={(key, outcome) => api.act({ type: "editOutcome", key, outcome })}
          onBucket={(key, bucket) => api.act({ type: "editBucket", key, bucket })}
          onClaimOn={(key, claimOn) => api.act({ type: "editClaimOn", key, claimOn })}
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
      </section>

      {overKeys.size > 0 ? (
        <p className={styles.validation}>
          {overKeys.size === 1 ? "A row asks" : `${overKeys.size} rows ask`} for more than its bill line can still give back
          {(() => {
            const row = draft.rows.find((candidate) => overKeys.has(candidate.key));
            return row && row.returnable !== null ? ` (line ${row.srcLineNo}: ${qtyText(row.returnable)} left)` : "";
          })()}
          .
        </p>
      ) : null}
      <p className={styles.hintLine}>{draft.hint}</p>
      <p className={styles.totalsLine} aria-label="Totals">
        {totals.map((part, index) => (
          <span key={part.label}>
            {index > 0 ? " · " : ""}
            {part.strong ? (
              <strong>
                {part.label} {part.value}
              </strong>
            ) : index === 0 && !draft.serverTotals ? (
              `${part.value} ${part.label}`
            ) : (
              `${part.label} ${part.value}`
            )}
          </span>
        ))}
      </p>

      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>F1 · keys on this screen</span>
        <button type="button" className={quotationStyles.button} disabled={working || !rights.mayStartNew} title="Start a new return." onClick={() => void runNew()}>
          {withKey("New", "new")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Save without moving anything."
          disabled={!canSaveDraft || working}
          onClick={() => runSave(false)}
        >
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
          title={`Open claims — credit, short-settle, reject (${draft.supplierName ? `${draft.supplierName}'s` : "every supplier's"})`}
          disabled={working}
          onClick={() => setClaimsOpen(true)}
        >
          Claims…
        </button>
        {canEdit ? (
          <button type="button" className={quotationStyles.button} title="Edit this DRAFT." disabled={working} onClick={runEdit}>
            {withKey("Edit", "edit")}
          </button>
        ) : null}
        <button
          type="button"
          className={quotationStyles.button}
          title="A draft, or a posted return whose debit note is unadjusted and claims unsettled."
          disabled={!canCancel || working}
          onClick={runCancel}
        >
          {withKey("Cancel", "cancelDoc")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={() => void runClose()}>
          {withKey("Close", "close")}
        </button>
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
      {claimsOpen ? (
        <PurchaseClaimsDialog
          supplierId={draft.supplierId}
          supplierName={draft.supplierName}
          companyId={draft.companyId}
          branchId={draft.branchId}
          deviceId={draft.deviceId}
          canSettle={rights.mayPost}
          canUndo={rights.mayCancelDocument(true)}
          onClose={() => setClaimsOpen(false)}
        />
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
    </div>
  );
}
