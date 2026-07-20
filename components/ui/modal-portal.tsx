"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders modal/popup overlays into `document.body` instead of leaving them
 * inline in the page tree.
 *
 * Why this exists: our pages are full-height flex shells whose grids live in an
 * `overflow: auto` scroll container with `position: sticky` headers. Chromium
 * promotes that scroller to its own compositing layer. A `position: fixed`
 * overlay declared as a *sibling* of it inside the same page wrapper is not
 * promoted, and Chromium's layer overlap testing can then order the scroller's
 * layer above it — so grid rows bleed through on top of an open modal as a
 * translucent ghost block, most visibly on the rows that repaint (hover,
 * re-render) while the modal is up.
 *
 * Portaling to `document.body` makes the overlay a top-level layer, which is
 * what actually fixes it. Raising z-index does not: paint order already put the
 * overlay on top, and the compositor is what disagreed.
 *
 * CAVEAT for adopters: an overlay portaled out of the page loses every CSS
 * custom property scoped to the page wrapper. Our page skins declare their
 * tokens on `.page`, so `background: var(--paper)` silently collapses to
 * transparent once portaled. Hoist the token block into a mixin (or `:root`)
 * and apply it to the overlay too — and check the result in a browser.
 */
export default function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Portals need a real DOM node, which does not exist during SSR/first render.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null;
  }
  return createPortal(children, document.body);
}
