"use client";

/**
 * Stock Adjustment — the voucher (the Qt `StockAdjustmentEntry`, menu 264).
 * ONE screen for six kinds, picked by the Type selector. Layout and wiring
 * only: every rule is in `stock-adjustment.state.ts` / `.validate.ts`, the
 * network in `use-stock-adjustment-draft.ts`.
 *
 * Save (F5) saves AND posts in one server transaction; nothing posts unless
 * every line passes. Save draft keeps a DRAFT. The server runs the same
 * adjustment rules at both, so a refused line comes back naming "lines.<n>"
 * and is tinted on the grid.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { FALLBACK_COLUMN_TITLES } from "../stock-adjustment.constants";
import {
  DateField,
  DropdownCombo,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import { focusCell, focusFirstCell } from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import { moveSectionFocus } from "@/features/sales/quotation/components/section-focus";
import { SECTION_ATTR } from "@/features/sales/quotation/quotation.constants";
import { addDays, isRealDate, todayIso } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { resolveLineColumns } from "../stock-adjustment.columns";
import {
  COL,
  GODOWN_DROPDOWN_KEY,
  KIND_BUTTONS,
  kindName,
  kindNote,
  LINE_GRID_NAME,
  LINE_GRID_UI_TABLE_KEY,
  RATE_SOURCES,
  rateSourceLabel,
  type Kind,
} from "../stock-adjustment.constants";
import {
  accountsCard,
  computeTotals,
  defaultReasonOptions,
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
  titleLine,
} from "../stock-adjustment.state";
import { entryKeyAction, kindStep } from "../stock-adjustment.keys";
import type { StockAdjustmentDocKey } from "../stock-adjustment.types";
import { postConfirmMessage, validationStrip } from "../stock-adjustment.validate";
import { useStockAdjustmentDraft } from "../use-stock-adjustment-draft";
import { AdjustmentItemPicker, type AdjustmentItemPick } from "./adjustment-item-picker";
import { AdjustmentLineGrid } from "./adjustment-line-grid";
import { CancelFlow, type CancelTarget } from "./cancel-flow";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { DamagedPanel } from "./damaged-panel";
import { notify } from "./notify";
import { StockPickDialog } from "./stock-pick-dialog";
import styles from "../page.module.scss";

const DOC_DATE_ID = "stock-adjustment-date";
const GODOWN_ID = "stock-adjustment-godown";

const KINDS = KIND_BUTTONS.map((button) => button.kind);

/**
 * Enter walks the header, the way the Qt dialog's Enter-as-Tab does; Enter on
 * its last field (Remarks) carries on into the first line, so a document is
 * keyed from Date to the lines without the mouse.
 */
function onHeaderKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.getAttribute("aria-expanded") === "true") {
    return;
  }
  if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
    event.preventDefault();
    return;
  }
  if (!event.shiftKey && focusFirstCell(LINE_GRID_NAME, String(COL.Description))) {
    event.preventDefault();
  }
}

/** Put the cursor on the document date, once React has drawn the change that asked for it. */
function focusDocDate() {
  window.requestAnimationFrame(() => {
    const input = document.getElementById(DOC_DATE_ID) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  });
}

/** Commit the cell being typed in before anything reads the lines — the Qt `tblLines->setFocus()`. */
function commitOpenEditor() {
  const active = document.activeElement as HTMLElement | null;
  if (active && active.closest(`[data-quotation-grid="${LINE_GRID_NAME}"], table`)) {
    active.blur();
  }
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

export type StockAdjustmentEntryViewProps = {
  initialDocument?: StockAdjustmentDocKey;
  initialMode?: "browse" | "entry";
  expiryGraceDays: number;
  onBackToList: () => void;
};

export function StockAdjustmentEntryView({
  initialDocument,
  initialMode = "browse",
  expiryGraceDays,
  onBackToList,
}: StockAdjustmentEntryViewProps) {
  const api = useStockAdjustmentDraft();
  const { draft } = api;
  const { permissions } = usePagePermissions();

  const [itemPicker, setItemPicker] = useState<{ key: string; query: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
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
      "Focus is where Enter stops in a row. Which columns show is the adjustment kind's — Visible is kept with the layout, but this grid follows the kind.",
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
  const saved = Boolean(draft.svhId);

  // ---------------------------------------------------------- open a doc
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument?.svhId ?? " new";
    if (opened.current === target) {
      return;
    }
    opened.current = target;
    if (initialDocument) {
      void api.load(initialDocument, initialMode === "entry");
    } else {
      // A new document starts at its date, so the keyboard can begin at once.
      focusDocDate();
    }
  }, [api, initialDocument, initialMode]);

  // ------------------------------------------------------- focus requests
  useEffect(() => {
    const request = api.focusRequest;
    if (!request) {
      return;
    }
    window.requestAnimationFrame(() => {
      if (request.target === "cell") {
        if (!focusCell(LINE_GRID_NAME, request.key, String(request.column))) {
          focusCell(LINE_GRID_NAME, request.key, String(COL.Description));
        }
        return;
      }
      document.getElementById(request.target === "godown" ? GODOWN_ID : DOC_DATE_ID)?.focus();
    });
  }, [api.focusRequest]);

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
  const openItemPicker = useCallback(
    (key: string, query: string) => {
      if (!isEditable(api.draftRef.current)) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query });
    },
    [api.draftRef],
  );

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
      focusDocDate();
    });
  }, [api, guardDirty]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      focusDocDate();
    }
  }, [api]);

  const runList = useCallback(() => {
    guardDirty("Open another", "This document has unsaved changes. Discard it and open another?", onBackToList);
  }, [guardDirty, onBackToList]);

  const runClose = useCallback(() => {
    guardDirty("Discard entry", "This document has unsaved changes. Close it anyway?", onBackToList);
  }, [guardDirty, onBackToList]);

  const runPick = useCallback(() => {
    const current = api.draftRef.current;
    const key =
      activeKey.current && current.lines.some((line) => line.key === activeKey.current)
        ? activeKey.current
        : current.lines[current.lines.length - 1]?.key ?? null;
    api.openPick(key);
  }, [api]);

  // ------------------------------------------------------------ shortcuts
  // The key map is `stock-adjustment.keys.ts`; this only runs what it answers.
  // Anything layered over the voucher owns the keyboard first: a dialog stops
  // Escape in capture (`ModalShell`), the message popup swallows every key, and
  // the grid's settings menu is counted here.
  const overlayOpen =
    itemPicker !== null ||
    confirm !== null ||
    cancelTarget !== null ||
    api.pickKey !== null ||
    gridSettings.active;
  const keyState = {
    overlayOpen,
    mode: draft.mode,
    status: draft.status,
    saved,
    busy: api.busy !== null,
    canCreate: permissions.canCreate,
    canEdit: permissions.canEdit,
    canDelete: permissions.canDelete,
  };
  const actions = {
    save: () => runSave(true),
    saveDraft: () => runSave(false),
    validate: runValidate,
    print: () => api.setHint("Save & Print (F6 / Ctrl+Enter) — printing for stock documents comes later."),
    new: runNew,
    list: runList,
    close: runClose,
    edit: runEdit,
    pick: runPick,
    cancel: runCancel,
    panelNext: () => moveSectionFocus(1),
    panelPrev: () => moveSectionFocus(-1),
  };
  const keysRef = useRef({ keyState, actions });
  useLayoutEffect(() => {
    keysRef.current = { keyState, actions };
  });

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const { keyState: state, actions: run } = keysRef.current;
      const { action, swallow } = entryKeyAction(event, state);
      if (swallow) {
        event.preventDefault();
      }
      if (action) {
        run[action]();
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

  // ---------------------------------------------------------- the pick dialog
  const pickLine = api.pickKey ? draft.lines.find((line) => line.key === api.pickKey) ?? null : null;
  const expiredBy =
    draft.kind === "Expiry"
      ? addDays(isRealDate(draft.docDate) ? draft.docDate : todayIso(), expiryGraceDays)
      : null;

  const note = kindNote(draft.kind);
  const rateOptions = RATE_SOURCES.map((code) => ({ value: code, label: rateSourceLabel(code) }));

  return (
    <div className={quotationStyles.page}>
      <header className={quotationStyles.titleBar}>
        <span className={quotationStyles.gridHeadActions}>
          <button type="button" className={quotationStyles.button} onClick={runClose}>
            ‹ Stock Adjustments
          </button>
          <span className={styles.titleBlock}>
            <h1 className={quotationStyles.title}>Stock Adjustment</h1>
            <span className={styles.kindHint}>{titleLine(draft)}</span>
          </span>
        </span>
        <div className={quotationStyles.titleMeta}>
          {api.busy ? <span>{api.busy === "loading" ? "Loading…" : "Working…"}</span> : null}
          {draft.mode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
          {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
          <span>
            Year <strong>{draft.accYear || "—"}</strong>
          </span>
          <span className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)}>
            {draft.status}
          </span>
        </div>
      </header>

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

      <div className={styles.headerRows} {...{ [SECTION_ATTR]: "header" }} onKeyDown={onHeaderKeyDown}>
        <div className={styles.headerLine}>
          <div className={cx(styles.fieldRow, styles.flex2)}>
            <ReadOnlyInput id="stock-adjustment-docno" label="Doc no" value={draft.refno} placeholder="assigned at save" />
          </div>
          <div
            className={cx(styles.fieldRow, styles.flex1)}
            title="svh_doc_date. An expiry write-off needs the lot expired by this date."
          >
            <DateField
              id={DOC_DATE_ID}
              label="Date"
              value={draft.docDate}
              disabled={!editable}
              onChange={(value) => api.setHeader("docDate", value)}
            />
          </div>
          <div
            className={cx(styles.fieldRow, styles.flex3)}
            title="ONE godown per document — every line is in it. Moving stock between godowns is a transfer."
          >
            <DropdownCombo
              id={GODOWN_ID}
              label="Godown"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              value={draft.godownId}
              selectedLabel={draft.godownName}
              disabled={!editable}
              placeholder="Search godowns…"
              onSelect={onGodown}
            />
          </div>
          <div
            className={cx(styles.fieldRow, styles.flex2)}
            title="The reason a NEW line starts with. Each line keeps its own reason; the reason decides which way the line moves."
          >
            <SelectField
              id="stock-adjustment-default-reason"
              label="Default reason"
              value={draft.defaultReasonId}
              options={defaultReasonOptions(draft)}
              disabled={!editable}
              onChange={(value) => api.setHeader("defaultReasonId", value)}
            />
          </div>
          <div className={cx(styles.fieldRow, styles.flex1)}>
            <SelectField
              id="stock-adjustment-rate-source"
              label="Rate source (in)"
              value={draft.rateSource}
              options={rateOptions}
              disabled={!rateSourceEditable(draft)}
              title="What an INWARD line is valued at. An outward line is always valued at the branch average. Re-lot and Move stock carry the average across."
              onChange={api.setRateSource}
            />
          </div>
        </div>
        <div className={styles.headerLine}>
          <div className={cx(styles.fieldRow, styles.flex3)}>
            <TextField
              id="stock-adjustment-usr-refno"
              label="Their ref"
              value={draft.usrRefno}
              disabled={!editable}
              maxLength={100}
              title="svh_usr_refno — your own reference."
              onChange={(value) => api.setHeader("usrRefno", value)}
            />
          </div>
          <div className={cx(styles.fieldRow, styles.flex5)}>
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
      </div>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)} {...{ [SECTION_ATTR]: "lines" }}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Lines</span>
          <span className={quotationStyles.modalNote}>
            Enter next cell · ↑ ↓ row · F2 / F12 pick from stock · Alt+= add a line · Alt+− remove the line · F1
            header ⇄ lines
          </span>
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
        {draftStatus && saved && draft.mode === "browse" ? (
          <button
            type="button"
            className={quotationStyles.button}
            title="F2 — edit this DRAFT."
            disabled={!permissions.canEdit || api.busy !== null}
            onClick={runEdit}
          >
            Edit<span className={quotationStyles.buttonHint}>F2</span>
          </button>
        ) : null}
        {saved && draft.status !== "CANCELLED" ? (
          <button
            type="button"
            className={quotationStyles.button}
            title="F3 — a POSTED document is reversed by mirror rows and a reversing accounts voucher; a DRAFT is marked cancelled."
            disabled={!permissions.canDelete || api.busy !== null}
            onClick={runCancel}
          >
            Cancel document<span className={quotationStyles.buttonHint}>F3</span>
          </button>
        ) : null}
        <button
          type="button"
          className={quotationStyles.button}
          title="Delete this DRAFT. A posted document is cancelled, never deleted."
          disabled={!(draftStatus && saved) || !permissions.canDelete || api.busy !== null}
          onClick={runDelete}
        >
          Delete draft
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="F4 — save without moving stock. The adjustment rules still run."
          disabled={!draftStatus || !permissions.canCreate || api.busy !== null}
          onClick={() => runSave(false)}
        >
          Save draft<span className={quotationStyles.buttonHint}>F4</span>
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="F9 — check every line against the server's rules without posting."
          disabled={!draftStatus || api.busy !== null}
          onClick={runValidate}
        >
          Validate<span className={quotationStyles.buttonHint}>F9</span>
        </button>
        <button type="button" className={quotationStyles.button} title="F8 — the adjustment list." onClick={runList}>
          List<span className={quotationStyles.buttonHint}>F8</span>
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="F7 — start a new document."
          disabled={!permissions.canCreate}
          onClick={runNew}
        >
          New<span className={quotationStyles.buttonHint}>F7</span>
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="F6 / Ctrl+Enter — printing for stock documents comes later."
          disabled
        >
          Save &amp; Print
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title="F5 — save and post in one go. Nothing posts unless every line passes."
          disabled={!draftStatus || !permissions.canCreate || api.busy !== null}
          onClick={() => runSave(true)}
        >
          Save<span className={quotationStyles.buttonHint}>F5</span>
        </button>
        <button type="button" className={quotationStyles.button} title="Esc — back to the list." onClick={runClose}>
          Close<span className={quotationStyles.buttonHint}>Esc</span>
        </button>
      </div>

      <AdjustmentItemPicker
        isOpen={itemPicker !== null}
        initialQuery={itemPicker?.query ?? ""}
        companyId={draft.companyId}
        branchId={draft.branchId}
        onClose={() => setItemPicker(null)}
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
    </div>
  );
}
