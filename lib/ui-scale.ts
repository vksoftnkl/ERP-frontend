/**
 * Global UI scale — one factor that resizes the entire application.
 *
 * The app is written almost entirely in absolute lengths: ~5,400 `px` literals
 * against ~1,200 `rem` ones, plus column widths that arrive from the database
 * as raw pixels (`ui_tbl_clm_column_width`). Scaling by moving the root
 * font-size would therefore reach less than a fifth of the interface and would
 * leave the DB-driven table columns at a fixed width while their text grew —
 * the worst of both worlds.
 *
 * So the scale is applied as `zoom` on the root element (see
 * `html { zoom: var(--erp-ui-scale) }` in globals.css). `zoom` re-runs layout
 * at the new size — unlike `transform: scale()`, which paints a stretched
 * bitmap of a mis-sized layout — and it multiplies EVERY length in the
 * subtree: px, rem, borders, shadows, inline styles, and the DB column widths
 * alike. One declaration, whole application.
 *
 * `zoom` has exactly two blind spots, and both are handled deliberately:
 *
 *   1. Viewport units. `100dvh` keeps meaning "the real viewport", so under
 *      zoom 1.25 it lays out 25% taller than the screen. Every `vw`/`vh`/`dvh`
 *      in the codebase is therefore divided by `var(--erp-ui-scale)`. At scale
 *      1 that division is the identity, so the correction is invisible today.
 *
 *   2. Geometry measured in JavaScript. `getBoundingClientRect()`, `clientX`
 *      and `window.innerHeight` report *visual* pixels (post-zoom), but a CSS
 *      length written back into the zoomed document is a *layout* pixel and
 *      gets multiplied again. Any code that measures the screen and then
 *      positions something from that measurement — portaled dropdowns, context
 *      menus, persisted column widths — must convert with `toLayoutPx`,
 *      `layoutRect` or `layoutViewportSize` below.
 *
 * Code that only compares one measurement against another (does the menu fit
 * below? is the pointer past the midpoint of this cell?) stays in visual space
 * throughout and needs no conversion — the factor cancels.
 */

/** Custom property the whole design system reads. Mirrored in globals.css. */
export const UI_SCALE_CSS_VAR = "--erp-ui-scale";

/** localStorage key holding the user's override, if any. */
export const UI_SCALE_STORAGE_KEY = "erp.ui.scale";

/**
 * The viewport the application is drawn for. At exactly this size the scale is
 * 1 and every screen renders pixel-identical to how it did before the scale
 * existed — a laptop at 1920×1080 with Windows at 125%, or a 1536-wide browser
 * window, which is what these screens were built and tuned on.
 */
export const UI_SCALE_REFERENCE_WIDTH = 1536;
export const UI_SCALE_REFERENCE_HEIGHT = 864;

/**
 * Floor and ceiling. The floor stops a small laptop from shrinking the grids
 * into illegibility; the ceiling stops a 4K panel from turning a dense ERP
 * table into six visible rows.
 */
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.35;

/**
 * How much of the *surplus* screen is spent on size rather than on content.
 *
 * Shrinking is linear — if the window is 10% short of the reference, the UI
 * has to give back the whole 10% or it will not fit. Growing is not
 * symmetrical: a user who bought a bigger monitor mostly wants to *see more
 * rows*, not the same rows drawn larger. So above the reference only 60% of
 * the extra room becomes size (1920×1080 → 1.15, not 1.25) and the remaining
 * 40% stays as extra visible content.
 */
export const UI_SCALE_GROWTH = 0.6;

/** `"auto"` follows the screen; a number pins the scale for this browser. */
export type UiScalePreference = "auto" | number;

/** Choices offered by the header control, alongside `"auto"`. */
export const UI_SCALE_PRESETS = [0.8, 0.9, 1, 1.1, 1.25, 1.35] as const;

/**
 * Fired on `window` whenever the user changes the preference, so the
 * controller that owns the applied value can pick it up without the header and
 * the controller having to know about each other.
 */
export const UI_SCALE_PREFERENCE_EVENT = "erp:ui-scale-preference";

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Quantised to whole percentage points. A continuous value would re-lay-out
 * the entire document on every pixel of a window drag; snapping to 1% turns
 * that into a handful of reflows across a resize.
 */
const quantise = (scale: number): number => Math.round(scale * 100) / 100;

/**
 * The scale for a viewport, before any user override.
 *
 * Both axes are considered and the smaller wins: an ERP screen is a fixed
 * chrome (header, toolbar, totals bar) wrapped around a table, so a viewport
 * that is wide but short must scale to the short dimension or the table loses
 * its rows to the fold.
 */
export function computeUiScale(viewportWidth: number, viewportHeight: number): number {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return 1;
  }

  const ratio = Math.min(
    viewportWidth / UI_SCALE_REFERENCE_WIDTH,
    viewportHeight / UI_SCALE_REFERENCE_HEIGHT,
  );
  const damped = ratio > 1 ? 1 + (ratio - 1) * UI_SCALE_GROWTH : ratio;

  return quantise(clamp(damped, UI_SCALE_MIN, UI_SCALE_MAX));
}

/** Normalises anything that may have been written to storage. */
export function normaliseUiScalePreference(raw: string | null): UiScalePreference {
  if (!raw || raw === "auto") return "auto";
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return "auto";
  return quantise(clamp(parsed, UI_SCALE_MIN, UI_SCALE_MAX));
}

export function readUiScalePreference(): UiScalePreference {
  if (typeof window === "undefined") return "auto";
  try {
    return normaliseUiScalePreference(window.localStorage.getItem(UI_SCALE_STORAGE_KEY));
  } catch {
    // Private mode / blocked storage: the automatic scale is a fine fallback.
    return "auto";
  }
}

export function writeUiScalePreference(preference: UiScalePreference): void {
  if (typeof window === "undefined") return;
  try {
    if (preference === "auto") {
      window.localStorage.removeItem(UI_SCALE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(UI_SCALE_STORAGE_KEY, String(preference));
    }
  } catch {
    // Non-fatal: the scale still applies for this session.
  }
  window.dispatchEvent(new CustomEvent(UI_SCALE_PREFERENCE_EVENT));
}

export function resolveUiScale(
  viewportWidth: number,
  viewportHeight: number,
  preference: UiScalePreference,
): number {
  return preference === "auto"
    ? computeUiScale(viewportWidth, viewportHeight)
    : quantise(clamp(preference, UI_SCALE_MIN, UI_SCALE_MAX));
}

/**
 * Cached so the conversion helpers below — which run inside pointer handlers
 * and dropdown openings — never have to reach for `getComputedStyle`, which
 * would flush layout on a hot path.
 */
let appliedScale: number | null = null;

export function applyUiScale(scale: number): void {
  if (typeof document === "undefined") return;
  appliedScale = scale;
  document.documentElement.style.setProperty(UI_SCALE_CSS_VAR, String(scale));
}

/** The scale currently in force. 1 on the server and before the bootstrap runs. */
export function getUiScale(): number {
  if (appliedScale !== null) return appliedScale;
  if (typeof document === "undefined") return 1;
  // The pre-paint bootstrap sets this as an inline style, so reading the
  // element's own style attribute is both cheap and authoritative.
  const parsed = Number.parseFloat(
    document.documentElement.style.getPropertyValue(UI_SCALE_CSS_VAR),
  );
  appliedScale = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return appliedScale;
}

/**
 * Visual pixels (what the DOM measures) → layout pixels (what CSS consumes).
 *
 * Use this on any number that came out of a measurement and is going back in
 * as a CSS length or a stored width.
 */
export function toLayoutPx(visualPx: number): number {
  return visualPx / getUiScale();
}

/** The viewport in layout pixels — the space a positioned overlay actually has. */
export function layoutViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  const scale = getUiScale();
  return { width: window.innerWidth / scale, height: window.innerHeight / scale };
}

export type LayoutRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

/** `getBoundingClientRect()` restated in layout pixels. */
export function layoutRect(element: Element): LayoutRect {
  const rect = element.getBoundingClientRect();
  const scale = getUiScale();
  return {
    top: rect.top / scale,
    right: rect.right / scale,
    bottom: rect.bottom / scale,
    left: rect.left / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

/** A pointer event's viewport coordinates in layout pixels. */
export function layoutPointer(event: { clientX: number; clientY: number }): {
  x: number;
  y: number;
} {
  const scale = getUiScale();
  return { x: event.clientX / scale, y: event.clientY / scale };
}

/**
 * The scale has to be on the root element before the first paint, otherwise
 * every navigation starts with a frame of unscaled UI and visibly snaps. That
 * rules out React — even a layout effect runs after the first paint — so the
 * formula is duplicated here as a blocking inline script.
 *
 * `lib/ui-scale.test.ts` executes this string against `computeUiScale` across
 * a range of viewports and fails if the two ever disagree, which is what keeps
 * the duplication honest.
 */
export function uiScaleBootstrapScript(): string {
  return `(function(){try{
var d=document.documentElement;
var pref=null;try{pref=window.localStorage.getItem(${JSON.stringify(UI_SCALE_STORAGE_KEY)});}catch(e){}
var s;
var pinned=pref&&pref!=="auto"?parseFloat(pref):NaN;
if(isFinite(pinned)&&pinned>0){s=pinned;}
else{
var w=window.innerWidth,h=window.innerHeight;
if(!(w>0&&h>0)){s=1;}
else{
var r=Math.min(w/${UI_SCALE_REFERENCE_WIDTH},h/${UI_SCALE_REFERENCE_HEIGHT});
s=r>1?1+(r-1)*${UI_SCALE_GROWTH}:r;
}
}
s=Math.min(Math.max(s,${UI_SCALE_MIN}),${UI_SCALE_MAX});
s=Math.round(s*100)/100;
d.style.setProperty(${JSON.stringify(UI_SCALE_CSS_VAR)},String(s));
}catch(e){}})();`;
}
