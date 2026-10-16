/**
 * Screen memory (lib/screen-memory) for the opening set: an edited set outlives
 * a trip to another menu screen, and the route reopens on it.
 *
 * The slot is the HEADER's tenant, not the set's own scope: "All branches" has
 * no branch, and the page has to find the slot before it knows which of the
 * two sets was on screen — so the scope combo is remembered with the set.
 *
 * Kept: a set with unsaved changes. Not kept: one that is clean — a save, a
 * reload (F7) or a scope switch leaves nothing the server does not already
 * have.
 */
import type { ScreenScope } from "@/lib/screen-memory";
import type { ScopeMode } from "../scope";
import type { OpeningDraft } from "./draft";

export const OPENING_BALANCE_MEMORY_KEY = "accounts/opening-balance";

export type OpeningMemory = {
  mode: ScopeMode;
  draft: OpeningDraft;
  /** The header's company, branch and year — the slot this set lives in. */
  tenant: ScreenScope;
};

export function isOpeningWorthRemembering(memory: OpeningMemory): boolean {
  return memory.draft.dirty;
}

export type ListAnswerAction = "ignore" | "keep-restored" | "load";

/**
 * What a `/list` answer does to the set on screen.
 *
 *   ignore         no answer, the one already taken, or one for another scope;
 *   keep-restored  the first answer for a set brought back from screen memory
 *                  with unsaved changes. RTK hands the cached answer over at
 *                  once, and LOADED would repaint the set from it — throwing
 *                  away the very edits that were restored. Taken, not applied;
 *   load           LOADED: the server's answer becomes the set.
 */
export function listAnswerAction(input: {
  payload: unknown;
  /** The answer last taken. */
  seeded: unknown;
  forThisScope: boolean;
  /** A restored set with unsaved changes that has not met its first answer yet. */
  keepRestored: boolean;
}): ListAnswerAction {
  if (!input.payload || input.payload === input.seeded || !input.forThisScope) {
    return "ignore";
  }
  return input.keepRestored ? "keep-restored" : "load";
}
