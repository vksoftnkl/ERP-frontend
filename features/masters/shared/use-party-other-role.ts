"use client";
/**
 * Is the party open on this form also the other role (plan §5 D4-7)?
 *
 * A customer's id IS its ledger's id, and a supplier row may share it. The
 * other master's `/get` answers 200 (it is) or 404 (it is not); a save then
 * also changes the other row's party details (`data.partySync`). The answer
 * is kept with the party it is about, so a probe of one record never shows
 * the note on the next. Any other failure says nothing either way: no note.
 *
 * Not gated by rights: the note is information, and the sync writes the
 * other row whatever the user may do on its master (Q8).
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useApi } from "@/hooks/useApi";
import { PARTY_ROLE_INFO } from "./party-role-link";
import type { PartyRole } from "./party-master-rules";

export type UsePartyOtherRoleResult = {
  /** true / false once answered for `partyId`; null while unknown. */
  otherRoleLive: boolean | null;
  /** After a save that linked the two (or a delete-check said so). */
  markLive: (partyId: string, live: boolean) => void;
};

/**
 * @param role the form's own role ("customer" probes `/suppliers/get`).
 * @param partyId the saved record open in the form, or null.
 */
export function usePartyOtherRole(role: PartyRole, partyId: string | null): UsePartyOtherRoleResult {
  const other = PARTY_ROLE_INFO[role === "customer" ? "supplier" : "customer"];
  const { getAll: probe } = useApi<unknown>(other.getEndpoint, {
    toast: { error: false, success: false },
  });
  const [answer, setAnswer] = useState<{ partyId: string; live: boolean } | null>(null);

  useEffect(() => {
    if (!partyId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      let live: boolean | null;
      try {
        const response = await probe({ [other.idKey]: partyId });
        // undefined: a newer probe superseded this one and will answer instead.
        if (response === undefined) {
          return;
        }
        live = true;
      } catch (error) {
        live = axios.isAxiosError(error) && error.response?.status === 404 ? false : null;
      }
      if (!cancelled && live !== null) {
        setAnswer({ partyId, live });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [other.idKey, partyId, probe]);

  const markLive = useCallback((id: string, live: boolean) => {
    setAnswer({ partyId: id, live });
  }, []);

  return {
    otherRoleLive: partyId && answer?.partyId === partyId ? answer.live : null,
    markLive,
  };
}
