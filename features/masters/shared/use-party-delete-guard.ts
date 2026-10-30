"use client";
/**
 * The party masters' delete guard (plan-party-master-rules §5, D1): before the
 * delete confirm opens, ask `GET /customers/delete-check?cusId=` (or
 * `/suppliers/delete-check?supId=`).
 *
 * - `canDelete: false` → the server's own words (the refusal's `user` block:
 *   "This customer still has ₹7,500.00 Dr in …") and no confirm.
 * - otherwise the confirm opens, and its note carries the warnings (unposted
 *   drafts, open bills, cheques) and, on a shared party, that the other role
 *   keeps the ledger.
 * - a failed check (403 `*_RIGHT_DELETE`, 404, network) is shown in plain
 *   words and nothing opens.
 *
 * The DELETE itself still raises its own refusal, in case something changed
 * between the check and the confirm.
 */
import { useCallback, useMemo, useState } from "react";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useApi } from "@/hooks/useApi";
import { toast } from "@/lib/notify";
import {
  PARTY_DELETE_CHECK_ENDPOINT,
  deleteCheckNotes,
  deleteCheckRefusalEnvelope,
  parsePartyDeleteCheck,
  type PartyRole,
} from "./party-master-rules";
import { toApiErrorShape } from "./server-error-text";

/** DeleteConfirmModal's default note; a page-given note replaces it. */
const DEFAULT_DELETE_NOTE = "This action cannot be undone.";

export type PartyDeleteGuard = {
  beforeDeleteConfirm: (row: MasterTableRow) => Promise<boolean>;
  deleteConfirmNote: (row: MasterTableRow) => string;
};

/**
 * @param role whose master this is.
 * @param idOf the party id of a list row (the shell's own record id).
 */
export function usePartyDeleteGuard(
  role: PartyRole,
  idOf: (row: MasterTableRow) => string,
): PartyDeleteGuard {
  const endpoint = PARTY_DELETE_CHECK_ENDPOINT[role];
  const { getAll: runCheck } = useApi<unknown>(endpoint.url, {
    toast: { error: false, success: false },
  });
  // The notes of the row whose confirm is open, keyed by its id.
  const [notes, setNotes] = useState<{ id: string; text: string } | null>(null);

  const beforeDeleteConfirm = useCallback(
    async (row: MasterTableRow): Promise<boolean> => {
      const id = idOf(row);
      setNotes(null);
      if (!id) {
        return false;
      }
      try {
        const response = await runCheck({ [endpoint.idParam]: id });
        if (response === undefined) {
          return false;
        }
        const check = parsePartyDeleteCheck(response);
        if (!check) {
          toast.error("The delete check gave no answer. Try again.");
          return false;
        }
        const refusal = deleteCheckRefusalEnvelope(check);
        if (refusal) {
          toast.apiError(refusal, { refusedTitle: "Cannot delete" });
          return false;
        }
        setNotes({ id, text: deleteCheckNotes(check, role).join(" ") });
        return true;
      } catch (error) {
        toast.apiError(toApiErrorShape(error), {
          refusedTitle: "Cannot delete",
          fallback: `Could not check whether this ${role} can be deleted.`,
        });
        return false;
      }
    },
    [endpoint.idParam, idOf, role, runCheck],
  );

  const deleteConfirmNote = useCallback(
    (row: MasterTableRow): string => {
      // Nothing to warn about: the dialog's own line, as on every other master.
      return notes && notes.id === idOf(row) && notes.text ? notes.text : DEFAULT_DELETE_NOTE;
    },
    [idOf, notes],
  );

  return useMemo(() => ({ beforeDeleteConfirm, deleteConfirmNote }), [beforeDeleteConfirm, deleteConfirmNote]);
}
