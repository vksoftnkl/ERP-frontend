/**
 * Unsaved entry work that outlives its screen — the web stand-in for Qt's
 * QMdiArea, where a half-entered bill sat in its own window while the operator
 * looked something up in another.
 *
 * Every menu click is a client-side navigation that UNMOUNTS the page, so a
 * screen whose entry lives in a `useReducer` loses it, and one whose entry lives
 * in a Redux slice clears it on the next mount. A screen that opts in writes its
 * in-progress entry here on every change and, when the operator comes back,
 * reopens on it instead of on a blank form or the register.
 *
 * ── Where it lives, and how long ───────────────────────────────────────────
 * A module-level map (the `lib/notify` / till session store pattern: no React
 * context, no Redux slice). Values are held BY REFERENCE — nothing is
 * serialised, so a write on every keystroke is one `Map.set`. It lasts as long
 * as the tab's JavaScript: a reload or a closed tab forgets everything (the
 * sale bill's IndexedDB autosave still covers a crash), and so does a logout or
 * another user signing in, through the auth event.
 *
 * ── Keys ───────────────────────────────────────────────────────────────────
 * One slot per user × screen × company × branch × accounting year. A bill
 * started in branch A never surfaces in branch B, and switching back to A brings
 * A's bill back. A write without a user or with an incomplete tenant scope is
 * dropped: the screen has not resolved its context yet, so there is nothing it
 * could be restored into.
 */
import { AUTH_SESSION_EVENT, getAuthUserId } from "@/lib/auth/session";

export type ScreenScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

export type ScreenMemoryDeps = {
  currentUserId: () => string | null;
  /** Oldest-written entries beyond this are dropped. */
  maxEntries?: number;
};

export type ScreenMemory = {
  /** Store `value` for this screen and tenant. No-op without a user or a complete scope. */
  remember: <T>(screenKey: string, scope: ScreenScope, value: T) => void;
  /**
   * The value stored for this screen and tenant, or null. READ-ONLY: React may
   * call a lazy initialiser twice (StrictMode), so reading must never consume.
   */
  recall: <T>(screenKey: string, scope: ScreenScope) => T | null;
  has: (screenKey: string, scope: ScreenScope) => boolean;
  /** Drop this tenant's slot; without a scope, every tenant's slot for the screen. */
  forget: (screenKey: string, scope?: ScreenScope) => void;
  forgetAll: () => void;
  /** The auth event: a logout or another user drops everything. */
  onAuthChange: (userId: string | null) => void;
};

type Entry = {
  userId: string;
  screenKey: string;
  value: unknown;
};

export const SCREEN_MEMORY_MAX_ENTRIES = 40;

/**
 * The one notice a screen raises when it reopens on a remembered entry. It
 * closes itself: it explains why the screen is not blank, and an operator
 * coming back to work must not have to dismiss it first.
 */
export const RESTORED_MESSAGE_OPTIONS = {
  autoClose: 2500,
  toastId: "screen-memory-restored",
} as const;

/** "Your unsaved bill was restored." */
export function restoredMessage(noun: string): string {
  return `Your unsaved ${noun} was restored.`;
}

const SEPARATOR = "\u0001";

export function isCompleteScope(scope: ScreenScope | null | undefined): scope is ScreenScope {
  return Boolean(scope?.companyId && scope.branchId && scope.accYear);
}

function slotKey(userId: string, screenKey: string, scope: ScreenScope): string {
  return [userId, screenKey, scope.companyId, scope.branchId, scope.accYear].join(SEPARATOR);
}

export function createScreenMemory(deps: ScreenMemoryDeps): ScreenMemory {
  const maxEntries = Math.max(1, deps.maxEntries ?? SCREEN_MEMORY_MAX_ENTRIES);
  // A Map iterates in insertion order, and every write re-inserts — so the
  // first entry is always the one written longest ago.
  const entries = new Map<string, Entry>();

  const keyFor = (screenKey: string, scope: ScreenScope): string | null => {
    const userId = deps.currentUserId();
    if (!userId || !screenKey || !isCompleteScope(scope)) {
      return null;
    }
    return slotKey(userId, screenKey, scope);
  };

  return {
    remember: (screenKey, scope, value) => {
      const key = keyFor(screenKey, scope);
      if (!key) {
        return;
      }
      entries.delete(key);
      entries.set(key, { userId: deps.currentUserId() ?? "", screenKey, value });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        entries.delete(oldest);
      }
    },
    recall: <T>(screenKey: string, scope: ScreenScope): T | null => {
      const key = keyFor(screenKey, scope);
      if (!key) {
        return null;
      }
      const entry = entries.get(key);
      return entry ? (entry.value as T) : null;
    },
    has: (screenKey, scope) => {
      const key = keyFor(screenKey, scope);
      return key ? entries.has(key) : false;
    },
    forget: (screenKey, scope) => {
      if (scope) {
        const key = keyFor(screenKey, scope);
        if (key) {
          entries.delete(key);
        }
        return;
      }
      for (const [key, entry] of entries) {
        if (entry.screenKey === screenKey) {
          entries.delete(key);
        }
      }
    },
    forgetAll: () => {
      entries.clear();
    },
    onAuthChange: (userId) => {
      // A token refresh re-fires the event for the same user: keep.
      for (const [key, entry] of entries) {
        if (!userId || entry.userId !== userId) {
          entries.delete(key);
        }
      }
    },
  };
}

/** The one memory of this tab. */
export const screenMemory: ScreenMemory = createScreenMemory({
  currentUserId: () => (typeof window === "undefined" ? null : getAuthUserId()),
});

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_SESSION_EVENT, (event) => {
    const detail = (event as CustomEvent<{ userId?: string | null }>).detail;
    screenMemory.onAuthChange(detail?.userId ?? null);
  });
}
