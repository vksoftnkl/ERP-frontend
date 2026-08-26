import type { ResolveScopeQuery, ScopeTarget } from "../types";

/** The company, branch, counter and user this browser session is actually inside. */
export type SessionContext = {
  companyId: string | null;
  branchId: string | null;
  deviceId: string | null;
  userId: string | null;
};

/**
 * Is the scope bar pointed at the context this session is inside?
 *
 * Saving re-applies the new values to the running app so no setting needs a
 * sign-out that the catalog does not mark `asdNeedsRelogin`. That is only ever
 * right for the session's OWN context: an administrator editing another
 * company's settings must not have those values take hold in their own app.
 *
 * "All branches" and "all counters" are inside the session's context — a
 * company-wide change applies to the branch the session is in — so a blank
 * branch or counter on the bar passes, and a DIFFERENT one does not.
 */
export function isSessionScope(target: ScopeTarget, session: SessionContext): boolean {
  if (!session.companyId || !target.companyId || target.companyId !== session.companyId) {
    return false;
  }
  if (target.branchId && target.branchId !== session.branchId) {
    return false;
  }
  if (target.deviceId && target.deviceId !== session.deviceId) {
    return false;
  }
  return true;
}

/**
 * What this session resolves to — every layer down to the person, which is the
 * one read whose answer the running app should be holding.
 */
export function sessionQuery(session: SessionContext): ResolveScopeQuery {
  return {
    ...(session.companyId ? { companyId: session.companyId } : {}),
    ...(session.branchId ? { branchId: session.branchId } : {}),
    ...(session.deviceId ? { deviceId: session.deviceId } : {}),
    ...(session.userId ? { userId: session.userId } : {}),
  };
}
