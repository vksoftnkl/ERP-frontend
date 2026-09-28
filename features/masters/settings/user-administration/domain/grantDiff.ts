/**
 * What a save changes against the set that was loaded — and, before it is
 * sent, the sentence that says what it takes away (§7.3).
 *
 * The revocation of 2026-09-19 (four menus came back all-false from a save
 * meant to grant one) happened because nothing said it was about to happen.
 */
import { COLUMN_BY_KEY } from "./columns";
import type { Grants } from "./grants";
import { GRANT_FLAG_KEYS, type GrantFlagKey } from "./wire";

export type FlagChange = { menuId: number; key: GrantFlagKey };

export type GrantDiff = {
  /** Menus now in the set that were not. */
  granted: number[];
  /** Menus that were in the set and are not any more. */
  revoked: number[];
  /** Flags turned on, on menus that stay in the set. */
  flagsAdded: FlagChange[];
  /** Flags turned off, on menus that stay in the set. */
  flagsRemoved: FlagChange[];
  changed: boolean;
};

export function grantDiff(loaded: Grants, current: Grants): GrantDiff {
  const granted: number[] = [];
  const revoked: number[] = [];
  const flagsAdded: FlagChange[] = [];
  const flagsRemoved: FlagChange[] = [];

  for (const [menuId, before] of loaded) {
    const after = current.get(menuId);
    if (!after) {
      revoked.push(menuId);
      continue;
    }
    for (const key of GRANT_FLAG_KEYS) {
      if (before.flags[key] && !after.flags[key]) flagsRemoved.push({ menuId, key });
      if (!before.flags[key] && after.flags[key]) flagsAdded.push({ menuId, key });
    }
  }
  for (const menuId of current.keys()) {
    if (!loaded.has(menuId)) granted.push(menuId);
  }

  const sortIds = (ids: number[]) => ids.sort((a, b) => a - b);
  return {
    granted: sortIds(granted),
    revoked: sortIds(revoked),
    flagsAdded,
    flagsRemoved,
    changed:
      granted.length > 0 ||
      revoked.length > 0 ||
      flagsAdded.length > 0 ||
      flagsRemoved.length > 0,
  };
}

/** True when the save takes something away — the case that needs a confirmation. */
export function revokesAnything(diff: GrantDiff): boolean {
  return diff.revoked.length > 0 || diff.flagsRemoved.length > 0;
}

const NAMED_MENUS_MAX = 6;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * "This save removes access to 4 menus: Received Cheques, Offers & Schemes,
 * Printing Assignments and Stock Track Policy, and removes Post on 2 menus
 * and Cancel on 1 menu. Continue?" — or null when nothing is revoked.
 */
export function describeRevocations(
  diff: GrantDiff,
  nameOf: (menuId: number) => string,
): string | null {
  if (!revokesAnything(diff)) return null;

  const clauses: string[] = [];

  if (diff.revoked.length > 0) {
    const names = diff.revoked.slice(0, NAMED_MENUS_MAX).map(nameOf);
    const rest = diff.revoked.length - names.length;
    const list = rest > 0 ? `${names.join(", ")} and ${rest} more` : joinList(names);
    clauses.push(`removes access to ${plural(diff.revoked.length, "menu")}: ${list}`);
  }

  if (diff.flagsRemoved.length > 0) {
    const perVerb = new Map<GrantFlagKey, Set<number>>();
    for (const change of diff.flagsRemoved) {
      const menus = perVerb.get(change.key) ?? new Set<number>();
      menus.add(change.menuId);
      perVerb.set(change.key, menus);
    }
    const parts = GRANT_FLAG_KEYS.filter((key) => perVerb.has(key)).map((key) => {
      const label = COLUMN_BY_KEY.get(key)?.label ?? key;
      return `${label} on ${plural(perVerb.get(key)!.size, "menu")}`;
    });
    clauses.push(`removes ${joinList(parts)}`);
  }

  return `This save ${clauses.join(", and ")}. Continue?`;
}
