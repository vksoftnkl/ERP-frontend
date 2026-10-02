"use client";
/**
 * Delete and Restore for a master whose list has a "Show deleted records"
 * view (notes 72 B1 — company and branch).
 *
 * In the live view the row button deletes (`DELETE <delete>?<id>=`); in the
 * deleted view the SAME button is Restore (`POST <restore>?<id>=`, a DELETE on
 * a deleted row is a 404), and Edit / View are refused because `/get` serves
 * live rows only. Both requests raise their refusals (409: the default
 * company, a branch still in use, its company deleted …) with the server's
 * reason, not only its title — see `server-error-text.ts`.
 */
import { useCallback, useMemo } from "react";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import type { CrudMasterPageProps } from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import { toast } from "@/lib/notify";
import { describeServerError } from "./server-error-text";
import { getFirstDefinedValue, toDisplayValue } from "./value-mappers";

export type SoftDeleteActionsOptions = {
  /** Shown deleted rows rather than live ones. */
  showingDeleted: boolean;
  deleteEndpoint: string;
  restoreEndpoint: string;
  /** The id's query-parameter name on both routes: `compId`, `brId`. */
  idParam: string;
  /** Where the id sits on a list row's source (the grid's raw SQL aliases). */
  idKeys: readonly string[];
  /** "Company", "Branch" — for the messages. */
  entityTitle: string;
};

export type SoftDeleteListProps = Pick<
  CrudMasterPageProps,
  | "onDeleteAction"
  | "deleteActionLabel"
  | "deleteConfirmMessage"
  | "isRowEditDisabled"
  | "rowEditDisabledReason"
  | "onViewAction"
>;

/** The record id the shell itself would use for this row. */
function rowRecordId(row: MasterTableRow, idKeys: readonly string[]): string {
  const fromSource = row.__source ? toDisplayValue(getFirstDefinedValue(row.__source, idKeys)) : "";
  return fromSource || String(row.__recordId ?? "").trim();
}

export function useSoftDeleteActions({
  showingDeleted,
  deleteEndpoint,
  restoreEndpoint,
  idParam,
  idKeys,
  entityTitle,
}: SoftDeleteActionsOptions): SoftDeleteListProps {
  const entityLower = entityTitle.toLowerCase();
  const { run: runDelete } = useApi<unknown>(deleteEndpoint, {
    method: "DELETE",
    toast: { error: false, successMessage: `${entityTitle} deleted successfully` },
  });
  const { run: runRestore } = useApi<unknown>(restoreEndpoint, {
    method: "POST",
    toast: { error: false, successMessage: `${entityTitle} restored successfully` },
  });
  const act = useCallback(
    async (
      run: typeof runDelete,
      row: MasterTableRow,
      fallback: string,
    ): Promise<boolean> => {
      const id = rowRecordId(row, idKeys);
      if (!id) {
        return false;
      }
      try {
        const response = await run({ query: { [idParam]: id } });
        // undefined: a newer request superseded this one; nothing changed here.
        return response !== undefined;
      } catch (error) {
        toast.error(describeServerError(error, fallback));
        return false;
      }
    },
    [idKeys, idParam],
  );
  const deleteRow = useCallback(
    (row: MasterTableRow) => act(runDelete, row, `Unable to delete this ${entityLower}.`),
    [act, entityLower, runDelete],
  );
  const restoreRow = useCallback(
    (row: MasterTableRow) => act(runRestore, row, `Unable to restore this ${entityLower}.`),
    [act, entityLower, runRestore],
  );
  return useMemo<SoftDeleteListProps>(() => {
    if (!showingDeleted) {
      return { onDeleteAction: deleteRow };
    }
    const cannotOpen = `A deleted ${entityLower} cannot be opened. Restore it first.`;
    return {
      onDeleteAction: restoreRow,
      deleteActionLabel: "Restore",
      deleteConfirmMessage: (row: MasterTableRow) =>
        `Restore "${row.masterName || `this ${entityLower}`}"?`,
      isRowEditDisabled: () => true,
      rowEditDisabledReason: cannotOpen,
      onViewAction: () => {
        toast.info(cannotOpen);
      },
    };
  }, [deleteRow, entityLower, restoreRow, showingDeleted]);
}
