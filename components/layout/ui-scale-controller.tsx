"use client";

/**
 * Keeps the global UI scale in step with the window.
 *
 * The scale is first written by the blocking bootstrap script in the document
 * head (see `uiScaleBootstrapScript`) so the very first paint is already at the
 * right size. This component owns it from there: window resizes, a monitor
 * change, and the header's size control all land here.
 *
 * It renders nothing — the scale lives on the root element, above React's tree,
 * because `zoom` has to apply to `<html>` for portaled overlays and fixed
 * layers to scale with everything else.
 */

import { useEffect } from "react";

import {
  UI_SCALE_PREFERENCE_EVENT,
  applyUiScale,
  readUiScalePreference,
  resolveUiScale,
} from "@/lib/ui-scale";

export default function UiScaleController() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      applyUiScale(
        resolveUiScale(window.innerWidth, window.innerHeight, readUiScalePreference()),
      );
    };

    // A drag of the window edge fires `resize` for every pixel; re-laying out
    // the whole document that often is what makes naive zoom implementations
    // feel broken. One recomputation per frame is plenty, and the scale is
    // quantised to 1% so most of those frames end up as no-ops anyway.
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(sync);
    };

    sync();

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener(UI_SCALE_PREFERENCE_EVENT, sync);
    // Another tab of the same app changing the preference.
    window.addEventListener("storage", sync);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener(UI_SCALE_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return null;
}
