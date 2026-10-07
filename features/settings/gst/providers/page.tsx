"use client";

/**
 * GST Providers (menu 269, Configuration) — the Qt `GstProviderList`.
 *
 * The list is grid 127 ("MAIN LIST - GST PROVIDERS"); Add / Edit (F1, F2,
 * Enter) open the provider dialog, where its services, endpoints, error map
 * and own accounts are kept. Delete and, in the "Show Only Deleted" view,
 * Restore post `{ gpvId }`. The server refuses to delete a provider a live
 * credential still points at (GST_PROVIDER_IN_USE) and says which.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { buildGridDeletedParam } from "@/lib/configured-grids";
import { useDeleteGstProviderMutation, useRestoreGstProviderMutation } from "@/store/api/gstConfigApi";
import { ActivePill } from "../components/controls";
import { rowId, useGstSoftDelete } from "../components/use-gst-soft-delete";
import { toBool } from "../domain/part-form";
import { GRID_CACHE_SETTLE_MS } from "../gst.constants";
import { ProviderDialog } from "./provider-dialog";

const API_ENDPOINTS = {
  // The shell's own form never opens here — Add / Edit open the provider
  // dialog, and Delete / Restore are the page's own requests.
  getById: "/gst/providers/get",
  create: "/gst/providers/create",
  delete: "/gst/providers/delete",
} as const;

/** Grid 127's own aliases. */
const LOOKUP_KEYS = {
  id: ["gpv_id"],
  code: ["gpv_code"],
  name: ["gpv_name"],
  short: [],
  alias: [],
  active: ["gpv_is_active"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "gpvId",
  name: "gpvName",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

const COLUMN_RENDER_OVERRIDES = {
  gpv_is_active: (row: MasterTableRow) => <ActivePill active={toBool(row.__source?.gpv_is_active)} />,
};

function describeProvider(row: MasterTableRow): string {
  return row.masterCode ? `${row.masterCode} (${row.masterName})` : `"${row.masterName}"`;
}

type DialogState = { gpvId: string | null } | null;

export default function GstProvidersPage() {
  const { permissions } = usePagePermissions();
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshTimer = useRef<number | null>(null);
  const [deleteProvider] = useDeleteGstProviderMutation();
  const [restoreProvider] = useRestoreGstProviderMutation();

  useEffect(
    () => () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }
    },
    [],
  );

  /** After a save, past the grid's one-second cache. */
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current);
    }
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      setRefreshNonce((nonce) => nonce + 1);
    }, GRID_CACHE_SETTLE_MS);
  }, []);

  const openEntry = useCallback((row: MasterTableRow) => {
    const id = rowId(row, "gpv_id");
    if (id) {
      setDialog({ gpvId: id });
    }
  }, []);

  const softDeleteProps = useGstSoftDelete({
    showingDeleted: showDeleted,
    idColumn: "gpv_id",
    entity: "provider",
    describe: describeProvider,
    deleteNote:
      "Its services, endpoints and maps are kept for Restore. A provider a live credential still uses cannot be deleted.",
    remove: (id) => deleteProvider(id).unwrap(),
    restore: (id) => restoreProvider(id).unwrap(),
    onOpen: openEntry,
  });

  const buildListQuery = useCallback(
    ({ searchTerm, currentPage, pageSize }: { searchTerm: string; currentPage: number; pageSize: number }) => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      // Grid 127 binds `gpv_is_deleted = igpv_is_deleted`: always sent.
      grid_param: JSON.stringify(buildGridDeletedParam("gstProviderList", showDeleted)),
    }),
    [showDeleted],
  );

  const toolbarContent = useMemo(
    () => (
      <div className={masterStyles.filterCheckGroup}>
        <label className={masterStyles.filterCheckLabel}>
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(event) => setShowDeleted(event.target.checked)}
          />
          Show Only Deleted
        </label>
      </div>
    ),
    [showDeleted],
  );

  return (
    <>
      <CrudMasterPage
        title="GST Providers"
        entityLabel="GST Provider"
        entityLabelPlural="GST Providers"
        listTitleOverride="GST Provider List"
        listSubtitleOverride="e-Invoice / e-Way Bill providers: their services, endpoints, error map and own account."
        apiEndpoints={API_ENDPOINTS}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        gridKey="gstProviderList"
        gridTableName="gst_provider"
        // Grid Master's columns, widths and order — not the legacy `styles` block.
        useConfiguredGridColumnsOnly
        listResponseStyleArrayKey=""
        enableGridSettingsContextMenu
        buildListQuery={buildListQuery}
        listStateResetKey={`${showDeleted}|${refreshNonce}`}
        toolbarContent={toolbarContent}
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        onCreateAction={() => setDialog({ gpvId: null })}
        onEditAction={openEntry}
        {...softDeleteProps}
        // The dialog owns the keyboard while it is up.
        enableListActionKeys={dialog === null}
        listHintMessage="Enter / F2 opens the provider with its services, endpoints, error map and accounts."
        searchPlaceholder="Search by code or name..."
      />
      {dialog ? (
        <ProviderDialog
          gpvId={dialog.gpvId}
          canCreate={permissions.canCreate}
          canEdit={permissions.canEdit}
          canDelete={permissions.canDelete}
          onClose={() => setDialog(null)}
          onSaved={refreshSoon}
        />
      ) : null}
    </>
  );
}
