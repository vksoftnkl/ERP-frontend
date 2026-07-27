"use client";

import { useEffect, useRef } from "react";

const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';

/**
 * True when a right-click belongs to the layer of the topmost open modal.
 *
 * The obvious test — `target.closest(MODAL_DIALOG_SELECTOR)` — misses two spots
 * a user can legitimately right-click while a create/update modal is open, and
 * both fell through to the browser's native menu:
 *
 *   - the dim backdrop, which is a *sibling* of the dialog inside the overlay
 *     rather than a descendant of it;
 *   - anything the modal portals to <body>: searchable-select dropdown lists,
 *     grid header/row context menus, tooltips. Those leave the dialog's subtree
 *     entirely, so `closest()` walks past <body> and returns null even though
 *     the popup is visually inside the modal.
 *
 * Both land outside every dialog *while a dialog is open*, so "inside no dialog
 * but some dialog is open" is attributed to the top one. A click that genuinely
 * is inside a dialog only counts when that dialog is the topmost, so a right-
 * click in a stacked child dialog is not credited to the form underneath it.
 */
function isTopModalLayerEvent(event: MouseEvent): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>(MODAL_DIALOG_SELECTOR);
  // Modals portal to <body> in the order they open and share a z-index tier
  // (see the overlay scale in app/globals.css), so paint order follows document
  // order and the last match is the one on top.
  const topDialog = dialogs[dialogs.length - 1];
  if (!topDialog) {
    return false;
  }
  const target = event.target as HTMLElement | null;
  const owningDialog = target?.closest<HTMLElement>(MODAL_DIALOG_SELECTOR) ?? null;
  return owningDialog === null || owningDialog === topDialog;
}

export type VisibleSettingsContextMenuOptions = {
  /** Warm this screen's widget config cache before the popup renders. */
  loadConfigTree: () => void | Promise<void>;
  /** Show the Visible Settings modal (typically the controller's openModal). */
  openVisibilitySettings: () => void;
};

/**
 * Hijacks right-clicks inside an open create/update modal to open that screen's
 * Visible Settings popup. Right-clicks anywhere else keep the browser's native
 * context menu.
 */
export function useVisibleSettingsContextMenu({
  loadConfigTree,
  openVisibilitySettings,
}: VisibleSettingsContextMenuOptions): void {
  // Held in a ref so the listener is attached once instead of resubscribing on
  // every render — callers routinely pass an inline arrow for openVisibilitySettings.
  const handlersRef = useRef({ loadConfigTree, openVisibilitySettings });
  useEffect(() => {
    handlersRef.current = { loadConfigTree, openVisibilitySettings };
  }, [loadConfigTree, openVisibilitySettings]);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (!isTopModalLayerEvent(event)) {
        return;
      }
      event.preventDefault();
      void handlersRef.current.loadConfigTree();
      handlersRef.current.openVisibilitySettings();
    };
    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, []);
}
