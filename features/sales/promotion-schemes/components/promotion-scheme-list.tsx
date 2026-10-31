"use client";

/**
 * Promotion Schemes (menu 247, Sales › Offers) — the campaign list. Port of Qt
 * `PromotionSchemeList` (NexERP): a thin master list on the house
 * `CrudMasterPage` shell; the interesting screen is the entry popup.
 *
 *  - Rows: the configured grid "MAIN LIST - PROMOTION SCHEMES" (24 columns),
 *    one token `iprm_state` from the toolbar's radio group — RUNNING (default,
 *    which deliberately includes drafts and future-dated schemes), INACTIVE,
 *    EXPIRED, DELETED. The token is bare in the SQL, so it is always sent.
 *  - Add / Edit open `PromotionSchemeEntry`; Delete is a soft delete that
 *    records WHO (`DELETE /promotion-scheme/delete?prm_id&prm_modified_by`).
 *  - History is the audit trail of audit screen "Promotion Scheme" (Qt
 *    `auditScreenId = 89`).
 *  - The server caches a grid run for about a second, so the list re-reads
 *    once that has turned over after a save or delete.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import CrudMasterPage from "@/components/master/crud-master-page";
import type {
  CrudMasterLookupKeys,
  CrudMasterRequestPayloadKeys,
  MasterTableRow,
} from "@/components/master/crud-master-page.types";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { gridRunEndpoint } from "@/lib/configured-grids";
import { getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import {
  PROMOTION_SCHEME_CREATE_ENDPOINT,
  PROMOTION_SCHEME_DELETE_ENDPOINT,
  PROMOTION_SCHEME_GET_ENDPOINT,
  useDeletePromotionSchemeMutation,
} from "../promotion-schemes.api";
import {
  LIST_GRID,
  LIST_STATE_FILTERS,
  PROMOTION_SCHEMES_MENU_ID,
  type PromotionListState,
} from "../promotion-schemes.vocab";
import { timeWindowText } from "../promotion-schemes.state";
import { useGridRefId } from "../use-grid-ref-id";
import { PromotionSchemeEntry } from "./promotion-scheme-entry";
import styles from "../page.module.scss";

const RELOAD_AFTER_SAVE_MS = 1200;

const LOOKUP_KEYS: CrudMasterLookupKeys = {
  id: ["prm_id"],
  code: ["prm_code"],
  name: ["prm_name"],
  short: [],
  alias: [],
  active: ["prm_is_active"],
  array: ["items", "data", "rows", "results", "list"],
};

const REQUEST_PAYLOAD_KEYS: CrudMasterRequestPayloadKeys = {
  id: "prm_id",
  name: "prm_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
};

function sourceOf(row: MasterTableRow | null | undefined): Record<string, unknown> {
  return row?.__source ?? {};
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Cells drawn from their own field. The shell's column heuristics would hand
 * "Status" (prm_status) its active accessor and print "Active" for every row.
 */
const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => ReactNode> = {
  prm_status: (row) => textOf(sourceOf(row).prm_status),
  prm_is_active: (row) => (sourceOf(row).prm_is_active === false ? "Inactive" : "Active"),
  prm_time_window: (row) => timeWindowText(sourceOf(row).prm_time_window),
};

type OpenEntry = { key: number; schemeId: string | null };

export function PromotionSchemeList() {
  const listGridId = useGridRefId(LIST_GRID);
  const [state, setState] = useState<PromotionListState>("RUNNING");
  const [entry, setEntry] = useState<OpenEntry | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const entrySeq = useRef(0);
  const reloadTimer = useRef<number | null>(null);
  const [deleteScheme] = useDeletePromotionSchemeMutation();

  const apiEndpoints = useMemo(
    () => ({
      list: gridRunEndpoint(listGridId),
      getById: PROMOTION_SCHEME_GET_ENDPOINT,
      create: PROMOTION_SCHEME_CREATE_ENDPOINT,
      delete: PROMOTION_SCHEME_DELETE_ENDPOINT,
    }),
    [listGridId],
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
    }): Record<string, string> => {
      // A new tick is a new function, which is what makes the shell re-read.
      void reloadTick;
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
        // One token, not two: the DELETED bucket carries the soft-delete flag itself.
        grid_param: JSON.stringify({ iprm_state: state }),
      };
    },
    [reloadTick, state],
  );

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

  const openNew = useCallback(() => {
    entrySeq.current += 1;
    setEntry({ key: entrySeq.current, schemeId: null });
  }, []);

  // A deleted scheme is gone for /get and /delete alike (PROMO_SCHEME_NOT_FOUND):
  // in the Deleted view its rows are listed, not opened.
  const deletedView = state === "DELETED";

  const openRow = useCallback(
    (row: MasterTableRow) => {
      const id = textOf(sourceOf(row).prm_id);
      if (!id) return;
      if (deletedView) {
        toast.info("A deleted scheme cannot be opened.", { title: "Deleted" });
        return;
      }
      entrySeq.current += 1;
      setEntry({ key: entrySeq.current, schemeId: id });
    },
    [deletedView],
  );

  const closeEntry = useCallback(() => setEntry(null), []);
  const entrySaved = useCallback(() => {
    setEntry(null);
    reloadSoon();
  }, [reloadSoon]);

  const onDelete = useCallback(
    async (row: MasterTableRow): Promise<boolean> => {
      const id = textOf(sourceOf(row).prm_id);
      if (!id) return false;
      try {
        // Soft delete, and it records WHO.
        await deleteScheme({ prmId: id, modifiedBy: getUserInfo()?.userName ?? "" }).unwrap();
        reloadSoon();
        return true;
      } catch (error) {
        toast.apiError(error, { refusedTitle: "Cannot delete" });
        return false;
      }
    },
    [deleteScheme, reloadSoon],
  );

  const deleteConfirmMessage = useCallback(
    (row: MasterTableRow) =>
      `Delete promotion scheme "${textOf(sourceOf(row).prm_name)}"? Its branches, customers, items and bands go with it.`,
    [],
  );

  const toolbarContent = useMemo(
    () => (
      <div className={styles.stateFilter} role="radiogroup" aria-label="Which schemes">
        {LIST_STATE_FILTERS.map((filter) => (
          <label key={filter.state} className={styles.stateFilterOption}>
            <input
              type="radio"
              name="promotion-scheme-state"
              value={filter.state}
              checked={state === filter.state}
              tabIndex={-1}
              onChange={() => setState(filter.state)}
            />
            {filter.label}
          </label>
        ))}
      </div>
    ),
    [state],
  );

  const isRowLocked = useCallback(() => deletedView, [deletedView]);

  return (
    <>
      <CrudMasterPage
        title="Promotion Schemes"
        listTitleOverride="Promotion Scheme List"
        listSubtitleOverride="Campaigns, their scope and their offer bands."
        entityLabel="Promotion Scheme"
        entityLabelPlural="Promotion Schemes"
        searchPlaceholder="Search..."
        apiEndpoints={apiEndpoints}
        gridDetailId={Number(listGridId)}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        createLabel="New Promotion Scheme"
        listResponseStyleArrayKey=""
        gridTableName="promotion_scheme"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        buildListQuery={buildListQuery}
        listStateResetKey={state}
        listEmptyText="No promotion schemes in this view."
        enableListActionKeys
        permissionMenuId={PROMOTION_SCHEMES_MENU_ID}
        onCreateAction={openNew}
        onEditAction={openRow}
        onViewAction={openRow}
        isRowEditDisabled={isRowLocked}
        rowEditDisabledReason="A deleted scheme cannot be opened"
        isRowDeleteDisabled={isRowLocked}
        rowDeleteDisabledReason="This scheme is already deleted"
        onDeleteAction={onDelete}
        deleteConfirmMessage={deleteConfirmMessage}
        auditHistory={{
          screenName: "Promotion Scheme",
          getRecordId: (row) => textOf(sourceOf(row).prm_id) || null,
          getDisplayName: (row) => textOf(sourceOf(row).prm_name) || null,
        }}
      />
      {entry ? (
        <PromotionSchemeEntry key={entry.key} schemeId={entry.schemeId} onClose={closeEntry} onSaved={entrySaved} />
      ) : null}
    </>
  );
}
