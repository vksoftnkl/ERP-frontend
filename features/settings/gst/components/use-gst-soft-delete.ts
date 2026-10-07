"use client";

/**
 * Delete and Restore on a GST list with a "Show Only Deleted" view — the
 * shared `useSoftDeleteActions`, for routes that take their id in a POST BODY
 * (`/gst/providers/delete { gpvId }`) rather than `DELETE ?id=`.
 *
 * Live view: the row button deletes. Deleted view: the same button restores,
 * and Edit / View are refused — restore first (Qt: "Restore it first").
 */
import { useCallback, useMemo, useRef } from "react";
import type { CrudMasterPageProps } from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { toast } from "@/lib/notify";
import { gstErrorText } from "../domain/format";

export type GstSoftDeleteOptions = {
  showingDeleted: boolean;
  /** The grid's id column: `gpv_id`, `gcc_id`. */
  idColumn: string;
  /** "provider", "credential" — for the messages. */
  entity: string;
  /** What a row is called in a question: its name, or a login and company. */
  describe: (row: MasterTableRow) => string;
  deleteNote?: string;
  remove: (id: string) => Promise<unknown>;
  restore: (id: string) => Promise<unknown>;
  /** Opens a live row (double click, Ctrl+Enter). */
  onOpen: (row: MasterTableRow) => void;
};

export type GstSoftDeleteProps = Pick<
  CrudMasterPageProps,
  | "onDeleteAction"
  | "deleteActionLabel"
  | "deleteConfirmMessage"
  | "deleteConfirmNote"
  | "isRowEditDisabled"
  | "rowEditDisabledReason"
  | "onViewAction"
>;

export function rowId(row: MasterTableRow | null, idColumn: string): string {
  const value = row?.__source?.[idColumn];
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function useGstSoftDelete({
  showingDeleted,
  idColumn,
  entity,
  describe,
  deleteNote,
  remove,
  restore,
  onOpen,
}: GstSoftDeleteOptions): GstSoftDeleteProps {
  // The shell's confirm can be answered twice by a fast double Enter.
  const busy = useRef(false);

  const act = useCallback(
    async (row: MasterTableRow, restoring: boolean): Promise<boolean> => {
      const id = rowId(row, idColumn);
      if (!id || busy.current) {
        return false;
      }
      busy.current = true;
      try {
        await (restoring ? restore(id) : remove(id));
        toast.success(`The ${entity} ${describe(row)} was ${restoring ? "restored" : "deleted"}.`);
        return true;
      } catch (error) {
        toast.error(gstErrorText(error, `Unable to ${restoring ? "restore" : "delete"} this ${entity}.`));
        return false;
      } finally {
        busy.current = false;
      }
    },
    [describe, entity, idColumn, remove, restore],
  );

  return useMemo<GstSoftDeleteProps>(() => {
    if (!showingDeleted) {
      return {
        onDeleteAction: (row) => act(row, false),
        deleteConfirmMessage: (row) => `Delete the ${entity} ${describe(row)}?`,
        deleteConfirmNote: deleteNote,
        onViewAction: onOpen,
      };
    }
    const cannotOpen = `A deleted ${entity} cannot be opened. Restore it first (the Restore button on this list).`;
    return {
      onDeleteAction: (row) => act(row, true),
      deleteActionLabel: "Restore",
      deleteConfirmMessage: (row) => `Restore the ${entity} ${describe(row)}?`,
      isRowEditDisabled: () => true,
      rowEditDisabledReason: cannotOpen,
      onViewAction: () => {
        toast.info(cannotOpen);
      },
    };
  }, [act, deleteNote, describe, entity, onOpen, showingDeleted]);
}
