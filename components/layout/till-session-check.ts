/**
 * The shell's till check — Qt `MenuWindow::checkTillSession` without the
 * window: a till device needs a session to take money, so once the company,
 * the branch and the user are known (a login, or a branch switch) and no till
 * session is held, `GET /till/sessions/open-check` says whether this device
 * takes money, and what stands in the way.
 *
 *   requireSession false          → nothing (a back-office device)
 *   someone else's session here   → say who holds the counter
 *   my session on another device  → say where to end it
 *   otherwise                     → Open Till Session (272) opens by itself
 *                                    — Open, or Resume for the user's own
 *                                    live session; it says the rest.
 *
 * Once per user + branch for the login, so switching back does not ask again
 * (`use-till-session-check.ts` keeps the keys asked). What it decides is here.
 */
import type { TillOpenCheck, TillOpenCheckSession } from "@/features/sales/till/shared/wire/types";

export type TillCheckScope = {
  userId: string | null | undefined;
  companyId: string | null | undefined;
  branchId: string | null | undefined;
};

/** `"<user>|<branch>"` — the key asked once; null until all three are known. */
export function tillCheckKey(scope: TillCheckScope): string | null {
  if (!scope.userId || !scope.companyId || !scope.branchId) return null;
  return `${scope.userId}|${scope.branchId}`;
}

export type TillCheckOutcome =
  | { kind: "none" }
  | { kind: "warn"; text: string }
  | { kind: "open" }
  | { kind: "info"; text: string };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** An ISO instant as the local `dd-MM HH:mm`; blank when it is not one. */
export function openedAtText(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${pad(at.getDate())}-${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function sameId(left: unknown, right: string): boolean {
  return text(left).toLowerCase() === right.toLowerCase();
}

export const OPEN_TILL_FIRST =
  "This device takes money: open a till session first (Open Till Session, menu 272).";

/**
 * What the answer means for this user.
 *
 * `canOpenTill` — the menu lets the user open Open Till (272);
 * `onOpenTill` — the user is already on it, and it says the rest.
 */
export function tillCheckOutcome(
  data: TillOpenCheck | null | undefined,
  me: string,
  options: { canOpenTill: boolean; onOpenTill: boolean },
): TillCheckOutcome {
  if (!data?.requireSession) return { kind: "none" }; // not a till device: nothing to open
  // Someone else's live session on this counter: say who, and that this user
  // cannot take money here until it is closed.
  const here: TillOpenCheckSession | null = data.deviceSession ?? null;
  if (here && !sameId(here.operatorId, me)) {
    const operator = text(here.operatorName);
    return {
      kind: "warn",
      text:
        `Counter ${text(here.counterCode)} has ${operator}'s session ${text(here.sessionNo)} open ` +
        `(since ${openedAtText(here.openedOn)}, ${text(here.status)}).\n\nYou cannot bill on this counter ` +
        `until ${operator} ends the shift, or a supervisor force-closes it.`,
    };
  }
  // This user's session on another device: one drawer at a time.
  const elsewhere: TillOpenCheckSession | null = data.userSessionElsewhere ?? null;
  if (elsewhere) {
    return {
      kind: "warn",
      text:
        `Your session ${text(elsewhere.sessionNo)} is still open on ${text(elsewhere.deviceName) || "another device"} ` +
        `(since ${openedAtText(elsewhere.openedOn)}).\n\nEnd that shift there before you open one on this counter.`,
    };
  }
  // Open Till Session says the rest (open / resume / why not).
  if (options.onOpenTill) return { kind: "none" };
  return options.canOpenTill ? { kind: "open" } : { kind: "info", text: OPEN_TILL_FIRST };
}

// ─── the keys already asked, for this login ──────────────────────────────────

export const TILL_CHECK_STORAGE_KEY = "erp.till.openCheck";

/**
 * The keys asked under this login. A tab reload keeps the login, so it keeps
 * them too (Qt asks once per MenuWindow, which is once per login); another
 * login — another `sid` — starts with none.
 */
export function parseAskedKeys(raw: string | null | undefined, loginId: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const record = parsed as { loginId?: unknown; keys?: unknown };
    if ((typeof record.loginId === "string" ? record.loginId : null) !== loginId) return [];
    return Array.isArray(record.keys) ? record.keys.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function serializeAskedKeys(loginId: string | null, keys: Iterable<string>): string {
  return JSON.stringify({ loginId, keys: [...keys] });
}
