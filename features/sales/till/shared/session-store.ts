/**
 * The cashier's live till session on this device — Qt `AppSession::TillSession`
 * plus `SessionEvents::tillSessionChanged`, framework-free.
 *
 *   set     by Open Till (S1) on an open or a resume
 *   patched by End Shift (status COUNTING …) and the Suspend / Resume verbs
 *   cleared by a close, by `revalidate` finding it gone, and by LOGOUT
 *
 * Empty = no session: the sale bill and sale order then send what they always
 * sent (the login's session id), and the server resolves the device's own
 * live session, or refuses money on a governed device.
 *
 * ── Where it lives, and how long ───────────────────────────────────────────
 * A module-level store (the `lib/notify` pattern: subscribers, no React
 * context, no Redux slice — nothing in the shared store setup changes) backed
 * by `sessionStorage`, exactly as long-lived as the login itself, which the
 * app also keeps in `sessionStorage`. A reload of the tab keeps it; a new tab,
 * like a second Qt instance, starts without one and resumes from Open Till.
 *
 * It is stamped with the user and the LOGIN (the access token's `sid`, minted
 * per login and carried across refreshes), so a logout — or a new login in the
 * same tab even when this module never heard the logout event — reads as "no
 * session". The auth event clears it eagerly as well.
 */
import { AUTH_SESSION_EVENT, getAuthSessionId, getAuthUserId } from "@/lib/auth/session";
import type { TillSessionStatus } from "./wire/types";

export type TillSessionRef = {
  /** tssId */
  id: string;
  /** tssAccYear — the session is partitioned by year. */
  accYear: string;
  /** C01-261009-01 */
  sessionNo: string;
  counterId: string;
  counterCode: string;
  /** OPEN / SUSPENDED / COUNTING … as last known. */
  status: TillSessionStatus | string;
  /** The tenant the session was opened in — its key for every later call. */
  companyId: string;
  branchId: string;
};

type Stored = {
  userId: string;
  loginId: string | null;
  session: TillSessionRef;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type TillSessionStoreDeps = {
  storage: () => StorageLike | null;
  currentUserId: () => string | null;
  currentLoginId: () => string | null;
};

export type TillSessionStore = {
  get: () => TillSessionRef | null;
  set: (session: TillSessionRef) => void;
  /** Change the status of the held session — only when `id` is the one held. */
  patchStatus: (id: string, status: TillSessionStatus | string) => void;
  /** Drop it; with an id, only when that is the one held. */
  clear: (id?: string) => void;
  subscribe: (listener: () => void) => () => void;
  /** The auth event: a logout or another user drops the session. */
  onAuthChange: (userId: string | null) => void;
};

export const TILL_SESSION_STORAGE_KEY = "erp.till.session";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.session)) return null;
    const s = parsed.session;
    const session: TillSessionRef = {
      id: str(s.id),
      accYear: str(s.accYear),
      sessionNo: str(s.sessionNo),
      counterId: str(s.counterId),
      counterCode: str(s.counterCode),
      status: str(s.status),
      companyId: str(s.companyId),
      branchId: str(s.branchId),
    };
    const userId = str(parsed.userId);
    if (!session.id || !session.accYear || !userId) return null;
    return { userId, loginId: str(parsed.loginId) || null, session };
  } catch {
    return null;
  }
}

export function createTillSessionStore(deps: TillSessionStoreDeps): TillSessionStore {
  let loaded = false;
  let current: Stored | null = null;
  const listeners = new Set<() => void>();

  const publish = () => {
    for (const listener of listeners) listener();
  };

  const write = (next: Stored | null) => {
    current = next;
    loaded = true;
    try {
      const storage = deps.storage();
      if (!storage) return;
      if (next) storage.setItem(TILL_SESSION_STORAGE_KEY, JSON.stringify(next));
      else storage.removeItem(TILL_SESSION_STORAGE_KEY);
    } catch {
      /* storage unavailable: the in-memory copy still holds for this page */
    }
  };

  const ensureLoaded = () => {
    if (loaded) return;
    loaded = true;
    try {
      current = parseStored(deps.storage()?.getItem(TILL_SESSION_STORAGE_KEY) ?? null);
    } catch {
      current = null;
    }
  };

  /** The held session, if it still belongs to the login on this tab. */
  const valid = (): Stored | null => {
    ensureLoaded();
    if (!current) return null;
    const userId = deps.currentUserId();
    if (!userId) return null; // signed out (or not yet known): nothing is held
    const loginId = deps.currentLoginId();
    if (userId !== current.userId || (loginId && current.loginId && loginId !== current.loginId)) {
      write(null);
      return null;
    }
    return current;
  };

  return {
    get: () => valid()?.session ?? null,
    set: (session) => {
      const userId = deps.currentUserId() ?? "";
      write({ userId, loginId: deps.currentLoginId(), session: { ...session } });
      publish();
    },
    patchStatus: (id, status) => {
      const held = valid();
      if (!held || held.session.id !== id || held.session.status === status) return;
      write({ ...held, session: { ...held.session, status } });
      publish();
    },
    clear: (id) => {
      ensureLoaded();
      if (!current) return;
      if (id && current.session.id !== id) return;
      write(null);
      publish();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onAuthChange: (userId) => {
      ensureLoaded();
      if (current && (!userId || userId !== current.userId)) {
        write(null);
        publish();
      }
    },
  };
}

/** The one store of this tab. */
export const tillSessionStore: TillSessionStore = createTillSessionStore({
  storage: () => (typeof window === "undefined" ? null : window.sessionStorage),
  currentUserId: () => (typeof window === "undefined" ? null : getAuthUserId()),
  currentLoginId: () => (typeof window === "undefined" ? null : getAuthSessionId()),
});

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_SESSION_EVENT, (event) => {
    const detail = (event as CustomEvent<{ userId?: string | null }>).detail;
    tillSessionStore.onAuthChange(detail?.userId ?? null);
  });
}

/** Qt `AppSession::tillSession()`. */
export function getTillSession(): TillSessionRef | null {
  return tillSessionStore.get();
}

/** Qt `hasTillSession() ? tillSession().id : …` — the id a money document names, or null. */
export function getTillSessionId(): string | null {
  return tillSessionStore.get()?.id ?? null;
}

export function setTillSession(session: TillSessionRef): void {
  tillSessionStore.set(session);
}

export function patchTillSessionStatus(id: string, status: TillSessionStatus | string): void {
  tillSessionStore.patchStatus(id, status);
}

export function clearTillSession(id?: string): void {
  tillSessionStore.clear(id);
}

/** Qt `SessionEvents::tillSessionChanged` — called on every set, patch and clear. */
export function subscribeTillSession(listener: () => void): () => void {
  return tillSessionStore.subscribe(listener);
}
