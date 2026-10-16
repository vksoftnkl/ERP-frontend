/**
 * Screen memory (lib/screen-memory) for Module Administration: the visibility
 * ticks left unsaved when the operator went to another menu screen, and the
 * rule that lets a fresh load of the menu tree land without wiping them.
 */
import type { ScreenScope } from "@/lib/screen-memory";

/** The slot the unsaved ticks wait in. */
export const MODULE_ADMINISTRATION_MEMORY_KEY = "masters/module-administration";

export type MenuVisibilityMaps = {
  /** The tick each menu shows on screen. */
  visibility: Map<number, boolean>;
  /** What the server last said for each menu. */
  original: Map<number, boolean>;
};

export type ModuleAdministrationSnapshot = MenuVisibilityMaps & {
  /** The header's tenant when it was taken. */
  tenant: ScreenScope;
};

/** Kept while any menu's tick differs from what the server last said. */
export function hasVisibilityChanges({ visibility, original }: MenuVisibilityMaps): boolean {
  for (const [menuId, value] of visibility) {
    if (original.get(menuId) !== value) {
      return true;
    }
  }
  return false;
}

/**
 * A freshly loaded tree over the ticks on screen: the server's values become the
 * new baseline, and every menu the operator changed keeps the operator's tick.
 * A menu gone from the tree drops out, and a tick the server now agrees with is
 * no longer a change.
 */
export function mergeLoadedVisibility(
  loaded: Map<number, boolean>,
  kept: MenuVisibilityMaps | null,
): MenuVisibilityMaps {
  const visibility = new Map(loaded);
  if (kept) {
    for (const [menuId, value] of kept.visibility) {
      if (kept.original.get(menuId) !== value && loaded.has(menuId)) {
        visibility.set(menuId, value);
      }
    }
  }
  return { visibility, original: new Map(loaded) };
}
