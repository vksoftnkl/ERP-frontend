"use client";

/**
 * User Administration — the user master (§1 of the port plan).
 *
 * The list is grid 62 through the shared master shell; Add / Edit / View open
 * `UserEntryDialog`, which owns the user AND the complete set of every menu
 * they may open. A save sends that whole set — any menu missing from it is
 * revoked — which is why the shell's generic modal is not used here.
 */
import { type ReactNode, useCallback, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page";
import styles from "@/app/master/state-master/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { type ConfiguredGridKey } from "@/lib/configured-grids";
import { toast } from "@/lib/notify";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAuthUserId } from "@/store/slices/authSlice";
import { useDeleteUserAdminMutation, userAdminErrorText, type UserAdminPayload } from "./api/userAdmin";
import type { EntryMode } from "./domain/entryModel";
import { UserEntryDialog } from "./user-entry-dialog";

/**
 * The Grid Master row this list reads — "MAIN LIST - COMPUTER USERS". The shell
 * resolves it to a grid id at runtime (lib/configured-grids) and uses it for
 * both the rows and the configured columns.
 */
const LIST_GRID_KEY = "userList" satisfies ConfiguredGridKey;

/**
 * `getById` and `create` are not called by the shell here (the dialog does
 * its own reads and writes); `delete` is, through `onDeleteAction`.
 */
const API_ENDPOINTS = {
  getById: "/user-administration/get",
  create: "/user-administration/create",
  delete: "/user-administration/delete",
} as const;
const GRID_TABLE_NAME = "user_master";

/** Grid 62's own aliases, one per position, so the shell can find the id and the name. */
const LOOKUP_KEYS = {
  id: ["usrId", "usr_id", "id", "_id"],
  code: ["usrLoginName", "usr_login_name", "loginName"],
  name: ["usrDisplayName", "usr_display_name", "displayName", "name"],
  short: ["usrEmail", "usr_email", "email"],
  alias: ["usrType", "usr_type", "type"],
  active: ["usrIsActive", "usr_is_active", "isActive", "is_active"],
  position: ["position", "sort"],
  description: ["usrNotes", "usr_notes", "notes"],
  array: ["data", "items", "results", "rows", "list", "users", "user_masters"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "usrId",
  name: "usrDisplayName",
  alias: "usrLoginName",
  short: "usrEmail",
  description: "usrNotes",
  sort: "position",
} as const;

type DialogState = { mode: EntryMode; usrId: string | null; readOnly: boolean };

function rowLabel(row: MasterTableRow): string {
  return row.masterCode || row.masterName || String(row.__recordId);
}

function sourceText(row: MasterTableRow, key: string): string {
  const value = row.__source?.[key];
  return value === null || value === undefined ? "" : String(value);
}

function whenText(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Cells the shell would otherwise get wrong. `usr_login_name` ends in "name",
 * so the shell's heuristic files it under the display name and every row
 * shows that instead (VKPOS read as "sfkdjfk"); the override renders the
 * row's own value and sorts and searches by it. The two others are only
 * friendlier than a raw boolean and an ISO timestamp.
 */
const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => ReactNode> = {
  usr_login_name: (row) => sourceText(row, "usr_login_name"),
  usr_is_locked: (row) => (sourceText(row, "usr_is_locked") === "true" ? "Locked" : "—"),
  usr_last_login_on: (row) => whenText(sourceText(row, "usr_last_login_on")) || "—",
};

export default function UserAdministrationPage() {
  const dispatch = useAppDispatch();
  const myUserId = useAppSelector(selectAuthUserId);
  const { permissions } = usePagePermissions();
  const [deleteUser] = useDeleteUserAdminMutation();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const openCreate = useCallback(() => setDialog({ mode: "create", usrId: null, readOnly: false }), []);
  const openEdit = useCallback(
    (row: MasterTableRow) => setDialog({ mode: "edit", usrId: String(row.__recordId), readOnly: false }),
    [],
  );
  // Double-click and Ctrl+Enter are the shell's "open to read"; here a reader
  // who may edit gets the editor, anyone else gets the same dialog inert.
  const openView = useCallback(
    (row: MasterTableRow) =>
      setDialog({ mode: "edit", usrId: String(row.__recordId), readOnly: !permissions.canEdit }),
    [permissions.canEdit],
  );

  const isSelf = useCallback(
    (row: MasterTableRow) => Boolean(myUserId) && String(row.__recordId) === myUserId,
    [myUserId],
  );

  const removeUser = useCallback(
    async (row: MasterTableRow): Promise<boolean> => {
      try {
        await deleteUser(String(row.__recordId)).unwrap();
        toast.success(`User "${rowLabel(row)}" deleted, with their menu rights.`);
        return true;
      } catch (error: unknown) {
        toast.error(userAdminErrorText(error));
        return false;
      }
    },
    [deleteUser],
  );

  /**
   * Permissions are read once at sign-in and cached for the session (§8): a
   * grant to yourself is refetched here so it takes effect without signing
   * out; anyone else's session stays as it was until they sign in again.
   */
  const afterSave = useCallback(
    (payload: UserAdminPayload) => {
      const name = payload.usrDisplayName || payload.usrLoginName;
      if (myUserId && payload.usrId === myUserId) {
        dispatch(baseApi.util.invalidateTags(["MenuMasters"]));
        toast.success("Saved. Your rights are refreshed.");
        return;
      }
      toast.success(`Saved. ${name} gets the new rights at the next sign-in.`);
    },
    [dispatch, myUserId],
  );

  const deleteConfirmMessage = useMemo(
    () => (row: MasterTableRow) => `Delete user "${rowLabel(row)}"? Their menu rights go with them.`,
    [],
  );

  return (
    <>
      <CrudMasterPage
        title="User Administration"
        iconName="user_admin"
        auditHistory={{ screenName: "User Administration" }}
        entityLabel="user"
        entityLabelPlural="users"
        apiEndpoints={API_ENDPOINTS}
        gridKey={LIST_GRID_KEY}
        gridTableName={GRID_TABLE_NAME}
        // Empty on purpose: left unset, the shell looks for a `styles` array in
        // the list response and, finding none in a configured-grid run, paints
        // the serial column alone. Empty sends it to grid 62's own columns.
        listResponseStyleArrayKey=""
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={styles}
        listTitle="User List"
        createLabel="Add User"
        codeColumnHeader="Login Name"
        nameColumnHeader="Display Name"
        searchPlaceholder="Search by login or name..."
        onCreateAction={openCreate}
        onEditAction={openEdit}
        onViewAction={openView}
        onDeleteAction={removeUser}
        isRowDeleteDisabled={isSelf}
        rowDeleteDisabledReason="You cannot delete your own login."
        deleteConfirmMessage={deleteConfirmMessage}
        deleteConfirmNote="The user is deactivated and every menu right they hold is removed."
        enableListActionKeys
      />
      <UserEntryDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        usrId={dialog?.usrId ?? null}
        readOnly={dialog?.readOnly ?? false}
        onClose={() => setDialog(null)}
        onSaved={afterSave}
      />
    </>
  );
}
