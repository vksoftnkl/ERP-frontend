"use client";

/**
 * Till Approval Authority's list — Qt `TillApprovalAuthorityList` (NexERP
 * a449b8c), a `TillMasterList` over grid 152. Built the way the web's till
 * master lists are (`features/sales/till-masters/components/till-master-list`,
 * which stays specific to its four masters): the configured grid on the house
 * `CrudMasterPage` shell, "Show inactive", Add / Edit opening the grant popup
 * with the grid row, and **Active on / off (Ctrl+D)** in place of Delete — a
 * grant is never deleted, so old approvals still show who was allowed.
 * Plus Qt's two verbs: **Copy grants** (needs CREATE) and **Who can approve?**
 * (F7, always allowed).
 *
 * ── Wire notes ───────────────────────────────────────────────────────────
 *  - Grid 152's tokens are QUOTED and always sent (`grantListParams`).
 *  - The server caches a grid run for about a second: after a save the list
 *    re-reads once that has turned over (`RELOAD_AFTER_SAVE_MS`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import CrudMasterPage from "@/components/master/crud-master-page";
import type {
  CrudMasterLookupKeys,
  CrudMasterRequestPayloadKeys,
  MasterTableRow,
} from "@/components/master/crud-master-page.types";
import type { DropdownSelection } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages, toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { useTillApprovalClient } from "@/features/sales/till/approval-setup/api/till-approval-api";
import {
  RELOAD_AFTER_SAVE_MS,
  approvalErrorText,
  text,
  type GridRow,
  type Tone,
} from "@/features/sales/till/approval-setup/domain/approval-setup";
import {
  AUTHORITY_SUBTITLE,
  AUTHORITY_TITLE,
  GRANT_SAVE_ROUTE,
  GRANT_TEXT_COLUMNS,
  LIST_KEYS_HINT,
  TILL_APPROVAL_AUTHORITY_HREF,
  canCopyGrants,
  canToggleGrant,
  copyConfirmText,
  copyGrantBodies,
  grantCellText,
  grantListEmptyText,
  grantListParams,
  grantOpen,
  grantRowHint,
  grantStatusTone,
  todayIso,
  toggleGrantBody,
  toggleGrantWords,
} from "../domain/approval-authority";
import { CopyGrantsDialog } from "./copy-grants-dialog";
import { GrantDialog } from "./grant-dialog";
import { WhoCanApproveDialog } from "./who-can-approve-dialog";
import styles from "../page.module.scss";

function sourceOf(row: MasterTableRow | null | undefined): GridRow | null {
  return row?.__source ?? null;
}

const INK: Partial<Record<Tone, string>> = {
  success: styles.inkSuccess,
  info: styles.inkInfo,
  muted: styles.inkMuted,
};

const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => ReactNode> = {
  ...Object.fromEntries(
    GRANT_TEXT_COLUMNS.map((key) => [key, (row: MasterTableRow) => grantCellText(key, sourceOf(row))]),
  ),
  grant_status: (row: MasterTableRow) => {
    const source = sourceOf(row);
    return <span className={INK[grantStatusTone(source)]}>{text(source, "grant_status")}</span>;
  },
};

/**
 * The shell's own form never opens (the popup is this screen's) and Delete
 * stays off, so these only satisfy its contract — as module constants, so the
 * shell sees the same objects on every render.
 */
const API_ENDPOINTS = {
  getById: "/till/approval-authorities/get",
  create: GRANT_SAVE_ROUTE,
  delete: "/till/approval-authorities/delete",
};

const LOOKUP_KEYS: CrudMasterLookupKeys = {
  id: ["taa_id"],
  code: [],
  name: ["approver"],
  short: [],
  alias: [],
  active: ["grant_open"],
  array: ["items", "data", "rows", "results", "list"],
};

const REQUEST_PAYLOAD_KEYS: CrudMasterRequestPayloadKeys = {
  id: "taaId",
  name: "approver",
  alias: "",
  short: "",
  description: "",
  sort: "",
};

const NEVER = () => true;

type OpenEntry = {
  key: number;
  row: GridRow | null;
  readOnlyReason: string | null;
  companyId: string;
  companyName: string;
};

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export function GrantList() {
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const companyName = activeCompany?.name ?? "";
  const loginBranch = activeBranch?.id ?? "";
  const { permissions } = usePagePermissions({ href: TILL_APPROVAL_AUTHORITY_HREF });
  const rights = useMemo(
    () => ({ canCreate: permissions.canCreate, canEdit: permissions.canEdit }),
    [permissions.canCreate, permissions.canEdit],
  );

  const client = useTillApprovalClient();
  const [showInactive, setShowInactive] = useState(false);
  const [entry, setEntry] = useState<OpenEntry | null>(null);
  /** The approver whose open grants Copy grants is giving away; null = closed. */
  const [copyFrom, setCopyFrom] = useState<GridRow | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [acting, setActing] = useState(false);
  /** Bumped to make the shell re-read the list (after a save). */
  const [reloadTick, setReloadTick] = useState(0);
  const actingRef = useRef(false);
  const entrySeq = useRef(0);
  /** The highlighted row, as the shell last handed it over. */
  const selectedRef = useRef<GridRow | null>(null);
  const reloadTimer = useRef<number | null>(null);

  const params = useMemo(() => grantListParams({ companyId, showInactive }), [companyId, showInactive]);

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

  const listStateResetKey = `${companyId}|${showInactive}`;

  /** Qt `reloadSoon`: after the server's grid cache has turned over. */
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

  const openNew = useCallback(() => {
    if (!companyId) {
      toast.warn("Choose a company in the header first.");
      return;
    }
    entrySeq.current += 1;
    setEntry({ key: entrySeq.current, row: null, readOnlyReason: null, companyId, companyName });
  }, [companyId, companyName]);

  const openRow = useCallback(
    (shellRow: MasterTableRow) => {
      const row = sourceOf(shellRow);
      if (!row) return;
      entrySeq.current += 1;
      setEntry({
        key: entrySeq.current,
        row,
        readOnlyReason: rights.canEdit ? null : `View only — no edit right on ${AUTHORITY_TITLE}.`,
        companyId,
        companyName,
      });
    },
    [companyId, companyName, rights.canEdit],
  );

  const closeEntry = useCallback(() => setEntry(null), []);

  const openWho = useCallback(() => {
    if (!companyId) {
      toast.warn("Choose a company in the header first.");
      return;
    }
    setWhoOpen(true);
  }, [companyId]);
  const entrySaved = useCallback(() => {
    setEntry(null);
    reloadSoon();
  }, [reloadSoon]);

  // ── Active on / off ─────────────────────────────────────────────────────

  const toggleActive = useCallback(
    async (row: GridRow | null) => {
      if (!row || actingRef.current || !canToggleGrant(row, rights)) return;
      const today = todayIso();
      const active = !grantOpen(row);
      const words = toggleGrantWords(row, active, today);
      if (
        !(await confirm({
          title: words.title,
          message: words.message,
          note: words.note || undefined,
          confirmLabel: words.title,
          iconVariant: "replace",
        }))
      ) {
        return;
      }
      actingRef.current = true;
      setActing(true);
      try {
        await client.saveAuthority(toggleGrantBody(row, active, today));
        toast.success(words.done);
        reloadSoon();
      } catch (error) {
        toast.error(approvalErrorText(error, "The grant could not be saved."));
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [client, reloadSoon, rights],
  );

  // ── Copy grants ─────────────────────────────────────────────────────────

  const startCopy = useCallback(
    (row: GridRow | null) => {
      if (!row || actingRef.current || !canCopyGrants(row, rights)) return;
      setCopyFrom(row);
    },
    [rights],
  );

  /**
   * Qt `copyGrants` after the pick: the source's open grants read fresh (the
   * list may be searched or show ended ones), the question, then one save per
   * grant. The first failure is reported; the list re-reads either way.
   */
  const copyTo = useCallback(
    async (to: DropdownSelection) => {
      const from = copyFrom;
      setCopyFrom(null);
      if (!from || actingRef.current) return;
      const fromName = text(from, "approver");
      actingRef.current = true;
      setActing(true);
      try {
        let rows: GridRow[];
        try {
          rows = await client.gridRows({
            grid: "tillApprovalGrants",
            params: { icompany_id: companyId, iinactive: "false" },
          });
        } catch (error) {
          toast.error(approvalErrorText(error, "The grants could not be read."));
          return;
        }
        const bodies = copyGrantBodies(rows, {
          fromUserId: text(from, "taa_user_id"),
          toUserId: to.id,
          today: todayIso(),
        });
        if (bodies.length === 0) {
          toast.warn(`${fromName} has no active grant to copy.`);
          return;
        }
        if (
          !(await confirm({
            title: "Copy grants",
            message: copyConfirmText(bodies.length, to.text, fromName),
            confirmLabel: "Copy",
            iconVariant: "replace",
          }))
        ) {
          return;
        }
        const results = await Promise.allSettled(bodies.map((body) => client.saveAuthority(body)));
        const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failure) toast.error(approvalErrorText(failure.reason, "A grant could not be copied."));
        else toast.success(`${to.text} has the grants now.`);
        reloadSoon();
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [client, companyId, copyFrom, reloadSoon],
  );

  // ── Keys: Ctrl+D Active on / off · F7 Who can approve? ──────────────────
  // Quiet while any popup, question or message is up.
  const dialogOpen = entry !== null || copyFrom !== null || whoOpen;
  useEffect(() => {
    if (dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) return;
      if (document.querySelector('[role="dialog"]') || getConfirmations().length > 0 || getMessages().length > 0) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl && event.key === "F7") {
        event.preventDefault();
        openWho();
        return;
      }
      if (ctrl && event.key.toLowerCase() === "d") {
        // Never the browser's bookmark dialog on this screen.
        event.preventDefault();
        void toggleActive(selectedRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, openWho, toggleActive]);

  // ── The shell's slots ───────────────────────────────────────────────────

  const toolbarContent = useMemo(
    () => (
      <div className={masterStyles.filterCheckGroup}>
        <label className={masterStyles.filterCheckLabel}>
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
          Show inactive
        </label>
      </div>
    ),
    [showInactive],
  );

  const toolbarActions = useCallback(
    (shellRow: MasterTableRow | null) => {
      const row = sourceOf(shellRow);
      selectedRef.current = row;
      const toggleTitle = !row
        ? "Select a grant first"
        : canToggleGrant(row, rights)
          ? "Switch the selected grant off, or reopen it (Ctrl+D)"
          : "No edit right on Till Approval Authority";
      const copyTitle = !row
        ? "Select an approver's grant first"
        : canCopyGrants(row, rights)
          ? "Give another user the selected approver's open grants"
          : "No create right on Till Approval Authority";
      return (
        <>
          <span className="erp-ms-tsep" aria-hidden="true" />
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnShipping} erp-ms-tbtn`}
            title={toggleTitle}
            disabled={!canToggleGrant(row, rights) || acting}
            onClick={() => void toggleActive(row)}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <LockIcon />
            </span>
            <span>Active on / off</span>
          </button>
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnEdit} erp-ms-tbtn`}
            title={copyTitle}
            disabled={!canCopyGrants(row, rights) || acting}
            onClick={() => startCopy(row)}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <UsersIcon />
            </span>
            <span>Copy grants</span>
          </button>
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnHistory} erp-ms-tbtn`}
            title="Who can approve? — the rule in force and each approver's verdict (F7)"
            disabled={!companyId}
            onClick={openWho}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <CheckIcon />
            </span>
            <span>Who can approve?</span>
          </button>
        </>
      );
    },
    [acting, companyId, openWho, rights, startCopy, toggleActive],
  );

  const hintMessage = useCallback((shellRow: MasterTableRow | null) => {
    const hint = grantRowHint(sourceOf(shellRow));
    return hint ? `${LIST_KEYS_HINT} · ${hint}` : LIST_KEYS_HINT;
  }, []);

  const rowClassName = useCallback(
    (shellRow: MasterTableRow) => (grantOpen(sourceOf(shellRow)) ? undefined : styles.rowMuted),
    [],
  );

  return (
    <>
      <CrudMasterPage
        title={AUTHORITY_TITLE}
        listTitleOverride={AUTHORITY_TITLE}
        listSubtitleOverride={AUTHORITY_SUBTITLE}
        entityLabel="grant"
        entityLabelPlural="grants"
        searchPlaceholder="Search..."
        apiEndpoints={API_ENDPOINTS}
        gridKey="tillApprovalGrants"
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        createLabel="New grant (Alt+C / F1)"
        listResponseStyleArrayKey=""
        gridTableName="till_approval_authority"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        rowClassName={rowClassName}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText={grantListEmptyText({ companyId, showInactive })}
        enableListActionKeys
        listHintMessage={hintMessage}
        permissionHref={TILL_APPROVAL_AUTHORITY_HREF}
        onCreateAction={openNew}
        onEditAction={openRow}
        // Ctrl+Enter and double-click open the same popup; without the right it is read-only.
        onViewAction={openRow}
        // Qt shows no Delete: a grant is never deleted, so old approvals still show who was allowed.
        isRowDeleteDisabled={NEVER}
        rowDeleteDisabledReason="A grant is never deleted — switch it off with Active on / off (Ctrl+D), or end it with Valid To"
      />
      {entry ? (
        <GrantDialog
          key={entry.key}
          row={entry.row}
          readOnlyReason={entry.readOnlyReason}
          companyId={entry.companyId}
          companyName={entry.companyName}
          today={todayIso()}
          onClose={closeEntry}
          onSaved={entrySaved}
        />
      ) : null}
      {copyFrom ? (
        <CopyGrantsDialog
          fromUserId={text(copyFrom, "taa_user_id")}
          fromName={text(copyFrom, "approver")}
          companyId={companyId}
          onClose={() => setCopyFrom(null)}
          onCopy={(to) => void copyTo(to)}
        />
      ) : null}
      {whoOpen ? (
        <WhoCanApproveDialog
          companyId={companyId}
          loginBranch={loginBranch}
          today={todayIso()}
          onClose={() => setWhoOpen(false)}
        />
      ) : null}
    </>
  );
}
