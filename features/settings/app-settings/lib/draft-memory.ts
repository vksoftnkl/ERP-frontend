import type { ScreenScope } from "@/lib/screen-memory";
import type { ScopeTarget } from "../types";

/**
 * Screen memory (lib/screen-memory) for Application Settings: the edits typed
 * and left unsaved when the operator went to another menu screen.
 *
 * Only the edits come back, never the values under them: the catalog is read
 * again on the way back and the edits lie over it, exactly as they did before —
 * an edit the server now agrees with simply stops counting as a change.
 */

/** The slot the unsaved edits wait in. */
export const APP_SETTINGS_MEMORY_KEY = "settings/app-settings";

/** Pending edits per scope-bar layer, keyed as the screen keys them. */
export type DraftsByScope = Record<string, Record<string, string>>;

export type AppSettingsSnapshot = {
  /** The header's tenant when it was taken. */
  tenant: ScreenScope;
  /** The layer the bar pointed at — the edits on screen are that layer's. */
  target: ScopeTarget;
  draftsByScope: DraftsByScope;
  selectedGroup: string | null;
};

/** Kept while any layer holds a pending edit; Save and Discard clear their layer's. */
export function hasPendingDrafts(snapshot: Pick<AppSettingsSnapshot, "draftsByScope">): boolean {
  return Object.values(snapshot.draftsByScope).some((drafts) => Object.keys(drafts).length > 0);
}
