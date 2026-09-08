"use client";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import {
  getDropdownMaster,
  type DropdownMasterMode,
} from "./masters";

export type UseDropdownMasterArgs = {
  dropdownId: string;
  /**
   * The master saved. `saved` carries the record when the screen reported one, so
   * the field can select it rather than only refreshing its list.
   */
  onSaved: (saved?: { id?: string; text?: string }) => void;
};

export type DropdownMasterState = {
  /** Whether anything is registered for this dropdown at all. */
  registered: boolean;
  canCreate: boolean;
  canEdit: boolean;
  /** Alt+C. Silent when nothing is registered; refuses out loud without the right. */
  requestCreate: (query: string) => void;
  /** Alt+A. A no-op when no record is selected — that is not an error. */
  requestEdit: (selectionId: string | null, query: string) => void;
  /** The master's own UI, to render inside the field. Null when closed. */
  entry: ReactNode | null;
};

type OpenState = {
  mode: DropdownMasterMode;
  selectionId: string | null;
  query: string;
};

/**
 * The master screen behind a dropdown, opened from the field with Alt+C / Alt+A.
 *
 * Permission comes from the MASTER's own menu id, not from the screen the field
 * happens to sit on — a field must never be a back door into a master the user was
 * not granted. A refusal is spoken: a silently dead shortcut is indistinguishable
 * from a broken one.
 */
export function useDropdownMaster({
  dropdownId,
  onSaved,
}: UseDropdownMasterArgs): DropdownMasterState {
  const registration = getDropdownMaster(dropdownId);
  const [open, setOpen] = useState<OpenState | null>(null);

  const { permissions } = usePagePermissions({
    menuId: registration?.menuId,
    disabled: !registration,
  });

  const canCreate = Boolean(registration) && permissions.canCreate;
  const canEdit = Boolean(registration) && permissions.canEdit;

  const requestCreate = useCallback(
    (query: string) => {
      if (!registration) {
        return;
      }
      if (!permissions.canCreate) {
        toast.error("You do not have permission to add records here.");
        return;
      }
      setOpen({ mode: "create", selectionId: null, query });
    },
    [permissions.canCreate, registration],
  );

  const requestEdit = useCallback(
    (selectionId: string | null, query: string) => {
      if (!registration || !selectionId) {
        return;
      }
      if (!permissions.canEdit) {
        toast.error("You do not have permission to amend records here.");
        return;
      }
      setOpen({ mode: "edit", selectionId, query });
    },
    [permissions.canEdit, registration],
  );

  const close = useCallback(() => setOpen(null), []);

  const handleSaved = useCallback(
    (saved?: { id?: string; text?: string }) => {
      setOpen(null);
      onSaved(saved);
    },
    [onSaved],
  );

  const entry =
    registration && open
      ? registration.render({
          mode: open.mode,
          selectionId: open.selectionId,
          query: open.query,
          onSaved: handleSaved,
          onClose: close,
        })
      : null;

  return {
    registered: Boolean(registration),
    canCreate,
    canEdit,
    requestCreate,
    requestEdit,
    entry,
  };
}
