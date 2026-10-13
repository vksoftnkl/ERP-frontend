"use client";

/**
 * The shell's till check, for React — Qt `MenuWindow::checkTillSession`,
 * called beside the session's settings read (`session-app-settings.tsx`), as
 * Qt calls it beside `fetchApplicationSettings` once the branch is known.
 * What the answer means is `till-session-check.ts`.
 *
 * Asked once per "<user>|<branch>" for the login; an answer that arrives
 * after the user or the branch moved on, or after a session was opened
 * meanwhile, is dropped. A refusal is silent: not a registered device, or no
 * till module — billing says so when it matters.
 */
import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import { useMenuPermissionIndex } from "@/hooks/useMenuPermissions";
import { getAuthSessionId } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { resolveMenuAccess } from "@/lib/permissions/menu-permissions";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectBusinessContext, selectIsAuthenticated } from "@/store/slices/authSlice";
import { useTillSessionClient } from "@/features/sales/till/shared/api/till-session-api";
import { OPEN_TILL_HREF } from "@/features/sales/till/shared/format";
import { getTillSessionId } from "@/features/sales/till/shared/session-store";
import { useTillSession } from "@/features/sales/till/shared/use-till-session";
import {
  TILL_CHECK_STORAGE_KEY,
  parseAskedKeys,
  serializeAskedKeys,
  tillCheckKey,
  tillCheckOutcome,
} from "./till-session-check";

/** The login, the persisted context and the branch correction land within a few frames: ask once they settle. */
const SETTLE_MS = 150;

/** `/` is the login-or-home switchboard: no shell, no check (the login redirect owns the navigation). */
function isLoginRoute(pathname: string): boolean {
  return !pathname || pathname === "/" || pathname === "/login" || pathname.startsWith("/login/");
}

function onRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function useTillSessionCheck(): void {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const client = useTillSessionClient();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const businessContext = useAppSelector(selectBusinessContext);
  const userId = useAppSelector(selectAuthUserId);
  const menu = useMenuPermissionIndex();
  const held = useTillSession();

  const companyId = businessContext?.companyId ?? null;
  const branchId = businessContext?.branchId ?? null;
  const key = isAuthenticated && !isLoginRoute(pathname) ? tillCheckKey({ userId, companyId, branchId }) : null;
  const scope = useMemo(
    () => (key && userId && companyId && branchId ? { key, userId, companyId, branchId } : null),
    [branchId, companyId, key, userId],
  );
  const settled = useDebounce(scope, SETTLE_MS);

  /** What an answer is judged against when it lands: where the user is now. */
  const latest = useRef({ key, pathname, menu, router });
  useEffect(() => {
    latest.current = { key, pathname, menu, router };
  });

  /** The keys asked under the login named — memory first, sessionStorage behind it. */
  const asked = useRef<{ loginId: string | null; keys: Set<string> } | null>(null);

  const heldId = held?.id ?? null;
  useEffect(() => {
    if (!settled || heldId) return;
    const loginId = getAuthSessionId();
    if (!asked.current || asked.current.loginId !== loginId) {
      asked.current = { loginId, keys: new Set(parseAskedKeys(storage()?.getItem(TILL_CHECK_STORAGE_KEY), loginId)) };
    }
    const keys = asked.current.keys;
    if (keys.has(settled.key)) return;
    const remember = () => {
      try {
        storage()?.setItem(TILL_CHECK_STORAGE_KEY, serializeAskedKeys(loginId, keys));
      } catch {
        /* storage unavailable: memory still holds it for this page */
      }
    };
    keys.add(settled.key);
    remember();

    void client
      .openCheck({ companyId: settled.companyId, branchId: settled.branchId })
      .then((data) => {
        const now = latest.current;
        if (now.key !== settled.key) {
          // The user or branch moved on before the answer: ask again on a return.
          keys.delete(settled.key);
          remember();
          return;
        }
        if (getTillSessionId()) return; // a session was opened meanwhile
        const outcome = tillCheckOutcome(data, settled.userId, {
          canOpenTill: resolveMenuAccess(OPEN_TILL_HREF, now.menu).status !== "denied",
          onOpenTill: onRoute(now.pathname, OPEN_TILL_HREF),
        });
        if (outcome.kind === "warn") {
          toast.warning(<span style={{ whiteSpace: "pre-line" }}>{outcome.text}</span>);
        } else if (outcome.kind === "info") {
          toast.info(outcome.text);
        } else if (outcome.kind === "open") {
          now.router.push(OPEN_TILL_HREF);
        }
      })
      .catch(() => undefined);
  }, [client, heldId, settled]);
}
