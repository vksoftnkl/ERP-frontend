"use client";

/**
 * GST Credentials (menu 270, Configuration) — the Qt `GstCredentialList`.
 *
 * One portal login per company / branch × service × environment. The list is
 * grid 131, which reads `gst_company_credential`'s NON-secret columns only, so
 * deleted rows can be listed for Restore (`vw_gst_credential` hides them).
 * Add / Edit (F1, F2, Enter) open the credential dialog; Delete and, in the
 * "Show Only Deleted" view, Restore post `{ gccId }`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { buildGridDeletedParam } from "@/lib/configured-grids";
import { useDeleteGstCredentialMutation, useRestoreGstCredentialMutation } from "@/store/api/gstConfigApi";
import { ActivePill, EnvironmentPill } from "../components/controls";
import { rowId, useGstSoftDelete } from "../components/use-gst-soft-delete";
import { formatShortStamp } from "../domain/format";
import { toBool } from "../domain/part-form";
import { GRID_CACHE_SETTLE_MS } from "../gst.constants";
import { CredentialDialog } from "./credential-dialog";
import styles from "../gst.module.scss";

const API_ENDPOINTS = {
  // The shell's own form never opens here; see the provider list.
  getById: "/gst/company-credentials/get",
  create: "/gst/company-credentials/create",
  delete: "/gst/company-credentials/delete",
} as const;

/**
 * Grid 131's own aliases. `code` MUST be `gpv_code`: the shell hands the first
 * `*_code` column (Provider) the row's `code` value, so pointing it at the
 * login put the login under Provider.
 */
const LOOKUP_KEYS = {
  id: ["gcc_id"],
  code: ["gpv_code"],
  name: ["comp_name"],
  short: [],
  alias: [],
  active: ["gcc_is_active"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "gccId",
  name: "gccLoginId",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

function source(row: MasterTableRow, key: string): string {
  const value = row.__source?.[key];
  return value === null || value === undefined ? "" : String(value);
}

/** "(all branches)" / "(all services)" are the grid's words for NULL — quiet them. */
function allOrValue(row: MasterTableRow, key: string) {
  const value = source(row, key);
  return value.startsWith("(all") ? <span className={styles.muted}>{value}</span> : value;
}

const COLUMN_RENDER_OVERRIDES = {
  br_name: (row: MasterTableRow) => allOrValue(row, "br_name"),
  gcc_service: (row: MasterTableRow) => allOrValue(row, "gcc_service"),
  gcc_environment: (row: MasterTableRow) => <EnvironmentPill environment={source(row, "gcc_environment")} />,
  // A successful Verify clears the stored error, so an error means the LAST
  // attempt failed.
  gcc_last_verified_on: (row: MasterTableRow) => {
    const error = source(row, "gcc_last_error_message");
    if (error) {
      return (
        <span className={styles.verifiedFail} title={error}>
          × {error}
        </span>
      );
    }
    const verified = formatShortStamp(source(row, "gcc_last_verified_on"));
    return verified ? (
      <span className={styles.verifiedOk}>✓ {verified}</span>
    ) : (
      <span className={styles.verifiedNever}>never verified</span>
    );
  },
  gcc_is_active: (row: MasterTableRow) => <ActivePill active={toBool(row.__source?.gcc_is_active)} />,
};

function describeCredential(row: MasterTableRow): string {
  const login = source(row, "gcc_login_id");
  const company = source(row, "comp_name");
  return login ? `login ${login} for "${company}"` : `for "${company}"`;
}

type DialogState = { gccId: string | null } | null;

export default function GstCredentialsPage() {
  const { permissions } = usePagePermissions();
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshTimer = useRef<number | null>(null);
  const [deleteCredential] = useDeleteGstCredentialMutation();
  const [restoreCredential] = useRestoreGstCredentialMutation();

  useEffect(
    () => () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }
    },
    [],
  );

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
    const id = rowId(row, "gcc_id");
    if (id) {
      setDialog({ gccId: id });
    }
  }, []);

  const softDeleteProps = useGstSoftDelete({
    showingDeleted: showDeleted,
    idColumn: "gcc_id",
    entity: "credential",
    describe: describeCredential,
    deleteNote: "Its live portal session is retired with it.",
    remove: (id) => deleteCredential(id).unwrap(),
    restore: (id) => restoreCredential(id).unwrap(),
    onOpen: openEntry,
  });

  const buildListQuery = useCallback(
    ({ searchTerm, currentPage, pageSize }: { searchTerm: string; currentPage: number; pageSize: number }) => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      // Grid 131 binds `gcc_is_deleted = igcc_is_deleted`: always sent.
      grid_param: JSON.stringify(buildGridDeletedParam("gstCredentialList", showDeleted)),
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
        title="GST Credentials"
        entityLabel="GST Credential"
        entityLabelPlural="GST Credentials"
        listTitleOverride="GST Credential List"
        listSubtitleOverride="One portal login per company / branch × service × environment."
        apiEndpoints={API_ENDPOINTS}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        gridKey="gstCredentialList"
        gridTableName="gst_company_credential"
        // Grid Master's columns, widths and order — not the legacy `styles` block.
        useConfiguredGridColumnsOnly
        listResponseStyleArrayKey=""
        enableGridSettingsContextMenu
        buildListQuery={buildListQuery}
        listStateResetKey={`${showDeleted}|${refreshNonce}`}
        toolbarContent={toolbarContent}
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        onCreateAction={() => setDialog({ gccId: null })}
        onEditAction={openEntry}
        {...softDeleteProps}
        enableListActionKeys={dialog === null}
        listHintMessage="Priority 1 is used first; priority 2 is the failover login. A branch with its own GSTIN gets its own row."
        searchPlaceholder="Search by company, GSTIN or login..."
      />
      {dialog ? (
        <CredentialDialog
          gccId={dialog.gccId}
          canCreate={permissions.canCreate}
          canEdit={permissions.canEdit}
          // Absent from the menu payload = not denied; the server still checks.
          canPost={permissions.canPost !== false}
          onClose={() => setDialog(null)}
          onSaved={refreshSoon}
        />
      ) : null}
    </>
  );
}
