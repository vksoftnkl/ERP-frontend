"use client";

/**
 * The list half every till master screen shares — Qt `TillMasterList`
 * (NexERP d5c3637): its configured grid on the house `CrudMasterPage` shell,
 * "Show inactive", Add / Edit opening the screen's popup with the grid row,
 * and **Active on / off (Ctrl+D)** in place of Delete — a master with history
 * is deactivated, never deleted from here. Safes add **Set default**, reasons
 * a category filter.
 *
 * ── Wire notes ───────────────────────────────────────────────────────────
 *  - Every grid token is QUOTED in the SQL and always sent (`gridParamsOf`):
 *    one left out stays a literal word and the list is silently empty.
 *  - The popup fills from the grid row — it carries the names and the facts
 *    the server's `/get` leaves out — so no `/get` is called.
 *  - The server caches a grid run for about a second: after a save the list
 *    re-reads once that has turned over (`RELOAD_AFTER_SAVE_MS`).
 *  - Edit on a shipped reason / denomination opens THIS company's copy (a
 *    create); Active off on one saves an inactive copy that hides it here only.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import CrudMasterPage from "@/components/master/crud-master-page";
import type {
  CrudMasterLookupKeys,
  CrudMasterRequestPayloadKeys,
  MasterTableRow,
} from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages, toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { useTillMastersGridTotalMutation, useTillMastersSaveMutation } from "@/store/api/tillApi";
import { tillErrorText } from "../domain/api-error";
import {
  CELL_FORMATS,
  REASON_CATEGORIES,
  RELOAD_AFTER_SAVE_MS,
  TILL_MASTER_SPECS,
  canEditRow,
  canSetDefault,
  canToggleRow,
  cellText,
  entryModeOf,
  gridParamsOf,
  initialForm,
  nextSortOf,
  overInsured,
  rowActive,
  rowBool,
  rowHint,
  rowMuted,
  rowName,
  scopeMissingText,
  setDefaultBody,
  toggleBody,
  toggleRefusal,
  toggleWords,
  type EntryMode,
  type GridRow,
  type TillForm,
  type TillMasterKind,
} from "../domain/till-masters";
import { TillEntryDialog } from "./entry-dialog";
import styles from "../page.module.scss";

/** Text columns of the four grids, drawn from their own field whatever the shell's heuristics make of them. */
const TEXT_COLUMNS = [
  "tcn_code",
  "tcn_name",
  "tcn_kind",
  "device_name",
  "tcn_drawer_mode",
  "safe_name",
  "live_session_no",
  "last_closed",
  "tsf_code",
  "tsf_name",
  "ledger_name",
  "counter_codes",
  "last_count",
  "last_remit",
  "trs_category",
  "trs_code",
  "trs_name",
  "tdn_currency",
  "tdn_kind",
  "tdn_label",
] as const;

function sourceOf(row: MasterTableRow | null | undefined): GridRow | null {
  return row?.__source ?? null;
}

const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => ReactNode> = {
  ...Object.fromEntries(
    [...TEXT_COLUMNS, ...Object.keys(CELL_FORMATS)].map((key) => [
      key,
      (row: MasterTableRow) => cellText(key, sourceOf(row)),
    ]),
  ),
  // Red = more cash in the safe than it is insured for.
  balance: (row: MasterTableRow) => {
    const source = sourceOf(row);
    const over = overInsured(source);
    return (
      <span className={over ? styles.toneDanger : undefined} title={over ? "Over the insured limit" : undefined}>
        {cellText("balance", source)}
      </span>
    );
  },
};

/** The table each master lives in — names the shell's grid-settings save. */
const TABLE_NAMES: Record<TillMasterKind, string> = {
  counters: "till_counter",
  safes: "till_safe",
  reasons: "till_reason",
  denominations: "till_denomination",
};

const EMPTY_TEXT: Record<TillMasterKind, string> = {
  counters: "No counters in this branch yet — Add makes the first.",
  safes: "No safes in this branch yet — Add makes the first, and it becomes the default.",
  reasons: "No reasons here. Widen the category, or tick Show inactive.",
  denominations: "No notes or coins here. Tick Show inactive to see the switched-off ones.",
};

/**
 * The shell's own form never opens (the popup is this screen's) and Delete
 * stays off, so these only satisfy its contract — as module constants, so the
 * shell sees the same objects on every render.
 */
function perKind<T>(make: (kind: TillMasterKind) => T): Record<TillMasterKind, T> {
  return {
    counters: make("counters"),
    safes: make("safes"),
    reasons: make("reasons"),
    denominations: make("denominations"),
  };
}

const API_ENDPOINTS = perKind((kind) => {
  const master = TILL_MASTER_SPECS[kind].master;
  return { getById: `/till/${master}/get`, create: `/till/${master}/create`, delete: `/till/${master}/delete` };
});

const LOOKUP_KEYS = perKind(
  (kind): CrudMasterLookupKeys => ({
    id: [TILL_MASTER_SPECS[kind].rowId],
    code: [TILL_MASTER_SPECS[kind].rowCode],
    name: [TILL_MASTER_SPECS[kind].rowName],
    short: [],
    alias: [],
    active: [TILL_MASTER_SPECS[kind].rowActive],
    array: ["items", "data", "rows", "results", "list"],
  }),
);

const REQUEST_PAYLOAD_KEYS = perKind(
  (kind): CrudMasterRequestPayloadKeys => ({
    id: TILL_MASTER_SPECS[kind].bodyId,
    name: TILL_MASTER_SPECS[kind].rowName,
    alias: "",
    short: "",
    description: "",
    sort: "",
  }),
);

const NEVER = () => true;

type OpenEntry = {
  key: number;
  row: GridRow | null;
  mode: EntryMode;
  initial: TillForm;
  readOnlyReason: string | null;
  companyId: string;
  branchId: string;
};

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
    </svg>
  );
}

export function TillMasterList({ kind }: { kind: TillMasterKind }) {
  const spec = TILL_MASTER_SPECS[kind];
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const { permissions } = usePagePermissions({ href: spec.href });
  const rights = useMemo(
    () => ({ canCreate: permissions.canCreate, canEdit: permissions.canEdit }),
    [permissions.canCreate, permissions.canEdit],
  );

  const [saveMaster] = useTillMastersSaveMutation();
  const [countRows] = useTillMastersGridTotalMutation();
  const [showInactive, setShowInactive] = useState(false);
  const [category, setCategory] = useState("");
  const [entry, setEntry] = useState<OpenEntry | null>(null);
  const [acting, setActing] = useState(false);
  /** Bumped to make the shell re-read the list (after a save). */
  const [reloadTick, setReloadTick] = useState(0);
  const actingRef = useRef(false);
  const openingRef = useRef(false);
  const entrySeq = useRef(0);
  /** The highlighted row, as the shell last handed it over. */
  const selectedRef = useRef<GridRow | null>(null);
  const reloadTimer = useRef<number | null>(null);

  const params = useMemo(
    () => gridParamsOf(kind, { companyId, branchId, showInactive, category }),
    [branchId, category, companyId, kind, showInactive],
  );

  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
      sortBy,
      sortDir,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
      sortBy?: string;
      sortDir?: "asc" | "desc";
    }): Record<string, string> | null => {
      // A new tick is a new function, which is what makes the shell re-read.
      void reloadTick;
      if (!params) return null;
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
        grid_param: JSON.stringify(params),
      };
    },
    [params, reloadTick],
  );

  const listStateResetKey = `${companyId}|${branchId}|${showInactive}|${category}`;

  const reloadSoon = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      setReloadTick((tick) => tick + 1);
    }, RELOAD_AFTER_SAVE_MS);
  }, []);
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    },
    [],
  );

  // ── The popup ───────────────────────────────────────────────────────────

  const openNew = useCallback(async () => {
    if (openingRef.current) return;
    if (!params) {
      toast.warn(scopeMissingText(kind));
      return;
    }
    openingRef.current = true;
    try {
      // A new counter sorts after the rows listed; a branch's first safe is its default.
      let listed: number | null = null;
      if (kind === "counters" || kind === "safes") {
        try {
          listed = await countRows({ grid: spec.grid, params }).unwrap();
        } catch {
          listed = null;
        }
      }
      entrySeq.current += 1;
      setEntry({
        key: entrySeq.current,
        row: null,
        mode: "new",
        initial: initialForm(kind, null, "new", { nextSort: nextSortOf(listed), firstSafe: listed === 0, category }),
        readOnlyReason: null,
        companyId,
        branchId,
      });
    } finally {
      openingRef.current = false;
    }
  }, [branchId, category, companyId, countRows, kind, params, spec.grid]);

  const openRow = useCallback(
    (shellRow: MasterTableRow) => {
      const row = sourceOf(shellRow);
      if (!row) return;
      const mode = entryModeOf(kind, row);
      // A copy is a new row (CREATE); everything else is an update (EDIT).
      const may = mode === "copy" ? rights.canCreate : rights.canEdit;
      entrySeq.current += 1;
      setEntry({
        key: entrySeq.current,
        row,
        mode,
        initial: initialForm(kind, row, mode, { nextSort: 0, firstSafe: false, category: "" }),
        readOnlyReason:
          may || mode === "locked"
            ? null
            : `View only — no ${mode === "copy" ? "create" : "edit"} right on ${spec.title}.`,
        companyId,
        branchId,
      });
    },
    [branchId, companyId, kind, rights.canCreate, rights.canEdit, spec.title],
  );

  const closeEntry = useCallback(() => setEntry(null), []);
  const entrySaved = useCallback(() => {
    setEntry(null);
    reloadSoon();
  }, [reloadSoon]);

  // ── Active on / off, Set default ────────────────────────────────────────

  const post = useCallback(
    async (body: Record<string, unknown>, done: string) => {
      actingRef.current = true;
      setActing(true);
      try {
        await saveMaster({ master: spec.master, body }).unwrap();
        toast.success(done);
        reloadSoon();
      } catch (error) {
        toast.error(tillErrorText(error, "Save Failed"));
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [reloadSoon, saveMaster, spec.master],
  );

  const toggleActive = useCallback(
    async (row: GridRow | null) => {
      if (!row || actingRef.current) return;
      const active = !rowActive(kind, row);
      const refusal = toggleRefusal(kind, row, active);
      if (refusal) {
        toast.warn(refusal);
        return;
      }
      if (!canToggleRow(kind, row, rights)) return;
      const words = toggleWords(kind, row, active);
      if (
        !(await confirm({
          title: words.title,
          message: words.message,
          confirmLabel: words.title,
          iconVariant: "replace",
        }))
      ) {
        return;
      }
      await post(toggleBody(kind, row, active, { companyId, branchId }), words.done);
    },
    [branchId, companyId, kind, post, rights],
  );

  const setDefault = useCallback(
    async (row: GridRow | null) => {
      if (!row || actingRef.current || rowBool(row, "tsf_is_default")) return;
      if (!rowBool(row, "tsf_is_active")) {
        toast.warn("An inactive safe cannot be the branch default.");
        return;
      }
      await post(setDefaultBody(row, { companyId, branchId }), `${rowName("safes", row)} is now the branch default.`);
    },
    [branchId, companyId, post],
  );

  // Ctrl+D — Active on / off, the Qt key. Quiet while any dialog or message is up.
  const entryOpen = entry !== null;
  useEffect(() => {
    if (entryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "d") return;
      if (document.querySelector('[role="dialog"]') || getConfirmations().length > 0 || getMessages().length > 0) {
        return;
      }
      // Never the browser's bookmark dialog on this screen.
      event.preventDefault();
      void toggleActive(selectedRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entryOpen, toggleActive]);

  // ── The shell's slots ───────────────────────────────────────────────────

  const toolbarContent = useMemo(
    () => (
      <>
        {kind === "reasons" ? (
          <div className={masterStyles.filterGroup}>
            <label className={masterStyles.filterLabel} htmlFor="till-reason-category">
              Category
            </label>
            <select
              id="till-reason-category"
              className={styles.toolbarSelect}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {REASON_CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={masterStyles.filterCheckGroup}>
          <label className={masterStyles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show inactive
          </label>
        </div>
      </>
    ),
    [category, kind, showInactive],
  );

  const toolbarActions = useCallback(
    (shellRow: MasterTableRow | null) => {
      const row = sourceOf(shellRow);
      selectedRef.current = row;
      const toggleTitle = !row
        ? `Select a ${spec.entity} first`
        : canToggleRow(kind, row, rights)
          ? `Deactivate or reactivate the selected ${spec.entity} (Ctrl+D)`
          : toggleRefusal(kind, row, !rowActive(kind, row)) || `No right to switch this ${spec.entity} on or off`;
      return (
        <>
          <span className="erp-ms-tsep" aria-hidden="true" />
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnShipping} erp-ms-tbtn`}
            title={toggleTitle}
            disabled={!canToggleRow(kind, row, rights) || acting}
            onClick={() => void toggleActive(row)}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <LockIcon />
            </span>
            <span>Active on / off</span>
          </button>
          {kind === "safes" ? (
            <button
              type="button"
              className={`${masterStyles.iconBtn} ${masterStyles.iconBtnEdit} erp-ms-tbtn`}
              title="Make the selected safe the branch default"
              disabled={!canSetDefault(row, rights) || acting}
              onClick={() => void setDefault(row)}
            >
              <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
                <StarIcon />
              </span>
              <span>Set default</span>
            </button>
          ) : null}
        </>
      );
    },
    [acting, kind, rights, setDefault, spec.entity, toggleActive],
  );

  const hintMessage = useCallback(
    (shellRow: MasterTableRow | null) => {
      const hint = rowHint(kind, sourceOf(shellRow));
      return hint ? `Ctrl+D active on / off · ${hint}` : "Ctrl+D active on / off";
    },
    [kind],
  );

  const isRowEditDisabled = useCallback(
    (shellRow: MasterTableRow) => !canEditRow(kind, sourceOf(shellRow), rights),
    [kind, rights],
  );

  const rowClassName = useCallback(
    (shellRow: MasterTableRow) => (rowMuted(kind, sourceOf(shellRow)) ? styles.rowMuted : undefined),
    [kind],
  );

  const onCreate = useCallback(() => void openNew(), [openNew]);

  return (
    <>
      <CrudMasterPage
        title={spec.title}
        listTitleOverride={spec.title}
        listSubtitleOverride={spec.listSubtitle}
        entityLabel={spec.entity}
        entityLabelPlural={spec.entityPlural}
        searchPlaceholder="Search..."
        apiEndpoints={API_ENDPOINTS[kind]}
        gridKey={spec.grid}
        lookupKeys={LOOKUP_KEYS[kind]}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS[kind]}
        styles={masterStyles}
        createLabel={`New ${spec.entity} (Alt+C / F1)`}
        listResponseStyleArrayKey=""
        gridTableName={TABLE_NAMES[kind]}
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        rowClassName={rowClassName}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText={params ? EMPTY_TEXT[kind] : scopeMissingText(kind)}
        enableListActionKeys
        listHintMessage={hintMessage}
        permissionHref={spec.href}
        onCreateAction={onCreate}
        onEditAction={openRow}
        // Ctrl+Enter and double-click open the same popup; without the right it is read-only.
        onViewAction={openRow}
        isRowEditDisabled={isRowEditDisabled}
        rowEditDisabledReason={`Editing a shipped ${spec.entity} makes this company's own copy — that needs the Create right`}
        // Qt shows no Delete: a master with history is deactivated, never deleted.
        isRowDeleteDisabled={NEVER}
        rowDeleteDisabledReason={`A ${spec.entity} is deactivated, never deleted — use Active on / off (Ctrl+D)`}
      />
      {entry ? (
        <TillEntryDialog
          key={entry.key}
          kind={kind}
          row={entry.row}
          mode={entry.mode}
          initial={entry.initial}
          readOnlyReason={entry.readOnlyReason}
          companyId={entry.companyId}
          branchId={entry.branchId}
          onClose={closeEntry}
          onSaved={entrySaved}
        />
      ) : null}
    </>
  );
}
