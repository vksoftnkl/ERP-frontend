/**
 * The till session for React: `useTillSession()` re-renders on every change
 * (Qt's `tillSessionChanged`), `revalidateTillSession` re-reads the held one
 * from the server the way the Qt till strip does on its refresh.
 */
import { useSyncExternalStore } from "react";
import { isSessionGone, tillErrorOf } from "./errors";
import { tillSessionStore, type TillSessionRef, type TillSessionStore } from "./session-store";
import type { TillSessionPayload } from "./wire/types";

const serverSnapshot = (): TillSessionRef | null => null;

/** The held session, live. Null when there is none (or before the browser is up). */
export function useTillSession(): TillSessionRef | null {
  return useSyncExternalStore(tillSessionStore.subscribe, tillSessionStore.get, serverSnapshot);
}

/** The ref a session payload adopts — Qt `TillOpenSessionDialog::adoptSession`. */
export function refFromPayload(payload: TillSessionPayload, fallbackScope: { companyId: string; branchId: string }): TillSessionRef {
  return {
    id: payload.tssId,
    accYear: payload.tssAccYear,
    sessionNo: payload.tssSessionNo,
    counterId: payload.tssCounterId,
    counterCode: payload.counterCode,
    status: payload.tssStatus,
    companyId: payload.tssCompanyId || fallbackScope.companyId,
    branchId: payload.tssBranchId || fallbackScope.branchId,
  };
}

/**
 * Re-read the held session (Qt `TillStrip::refresh` / `showSession`): still
 * OPEN or SUSPENDED → keep it, with the status the server says; counted,
 * closed or voided elsewhere → it no longer takes money here, drop it; gone
 * (404) → drop it. A network failure keeps it — the server judges every
 * money document anyway. Answers what is held afterwards.
 */
export async function revalidateTillSession(
  client: { get: (key: { companyId: string; branchId: string; accYear: string; tssId: string }) => Promise<TillSessionPayload> },
  store: TillSessionStore = tillSessionStore,
): Promise<TillSessionRef | null> {
  const held = store.get();
  if (!held) return null;
  try {
    const payload = await client.get({
      companyId: held.companyId,
      branchId: held.branchId,
      accYear: held.accYear,
      tssId: held.id,
    });
    const status = payload?.tssStatus ?? "";
    if (status === "OPEN" || status === "SUSPENDED") {
      store.patchStatus(held.id, status);
    } else {
      store.clear(held.id);
    }
  } catch (error) {
    if (isSessionGone(tillErrorOf(error))) store.clear(held.id);
  }
  return store.get();
}
