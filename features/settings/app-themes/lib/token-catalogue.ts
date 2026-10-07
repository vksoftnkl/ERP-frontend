/**
 * The theme master's colour keys (menu 266) — every key once, in the order and
 * groups the screen shows, with what it MEANS and the app's built-in value.
 *
 * Mirrors the Qt client's `ThemeTokens::catalogue()` / `defaults()`
 * (src/core/theme/theme_tokens.h) and the server's `APP_THEME_TOKENS`
 * (src/modules/settings/appTheme/types/app-theme.types.ts): v1's 33 keys plus
 * v2's five brand tints. The server refuses a key outside this list (400
 * `tokens.<key>`), so a new key lands in all three places together.
 *
 * The built-ins are MAROON as the screens look today. "Delete on a row" puts
 * one back; a theme row that leaves a key out is painted with it.
 */

import { THEME_COLOUR_PATTERN } from "@/lib/app-theme";

export type TokenCatalogueEntry = {
  key: string;
  group: string;
  meaning: string;
  builtIn: string;
};

export const TOKEN_CATALOGUE: readonly TokenCatalogueEntry[] = [
  { key: "primary", group: "BRAND", meaning: "brand colour: buttons, tab line, selection", builtIn: "#7B1113" },
  { key: "primary.hover", group: "BRAND", meaning: "pressed / hover of primary", builtIn: "#611010" },
  { key: "on.primary", group: "BRAND", meaning: "text on primary", builtIn: "#FFFFFF" },
  { key: "primary.soft", group: "BRAND", meaning: "hover background of buttons and list items", builtIn: "#F8E8E8" },
  { key: "primary.softer", group: "BRAND", meaning: "hover background of master-list buttons", builtIn: "#FFF7F7" },
  { key: "primary.soft.border", group: "BRAND", meaning: "border of a hovered button or list item", builtIn: "#F1CFCF" },
  { key: "primary.pressed.bg", group: "BRAND", meaning: "pressed background of master-list buttons", builtIn: "#F4E7E7" },
  { key: "primary.pressed.border", group: "BRAND", meaning: "border of a pressed button", builtIn: "#D9B3B3" },
  { key: "menu.bg", group: "MENU · TITLE", meaning: "main window menu bar / module buttons", builtIn: "#7B1113" },
  { key: "menu.fg", group: "MENU · TITLE", meaning: "menu text", builtIn: "#FFFFFF" },
  { key: "title.bg", group: "MENU · TITLE", meaning: "entry-form title band", builtIn: "#7B1113" },
  { key: "title.fg", group: "MENU · TITLE", meaning: "entry-form title text", builtIn: "#FFFFFF" },
  { key: "surface", group: "SURFACES · TEXT", meaning: "dialog / card background", builtIn: "#FFFFFF" },
  { key: "surface.alt", group: "SURFACES · TEXT", meaning: "page / pane background", builtIn: "#F3F4F6" },
  { key: "text", group: "SURFACES · TEXT", meaning: "body text", builtIn: "#111827" },
  { key: "text.muted", group: "SURFACES · TEXT", meaning: "hints, captions", builtIn: "#6B7280" },
  { key: "border", group: "SURFACES · TEXT", meaning: "frames, inputs", builtIn: "#E5E7EB" },
  { key: "focus", group: "SURFACES · TEXT", meaning: "focused input border", builtIn: "#2563EB" },
  { key: "table.header.bg", group: "GRIDS", meaning: "grid header", builtIn: "#EEF1F5" },
  { key: "table.header.fg", group: "GRIDS", meaning: "grid header text", builtIn: "#8B1A1A" },
  { key: "table.row", group: "GRIDS", meaning: "grid row", builtIn: "#FFFFFF" },
  { key: "table.row.alt", group: "GRIDS", meaning: "alternate row", builtIn: "#FFFBFA" },
  { key: "table.row.hover", group: "GRIDS", meaning: "hovered row", builtIn: "#F8FBFF" },
  { key: "table.selected", group: "GRIDS", meaning: "selected cell / row in a list", builtIn: "#E8C4C4" },
  { key: "table.selected.fg", group: "GRIDS", meaning: "text of the selected row", builtIn: "#111827" },
  { key: "table.txn.selected", group: "GRIDS", meaning: "selected line in an entry grid", builtIn: "#B9D8DF" },
  { key: "table.checked", group: "GRIDS", meaning: "ticked row (pick dialogs)", builtIn: "#98FB98" },
  { key: "table.free", group: "GRIDS", meaning: "promotion free line", builtIn: "#FFF4D6" },
  { key: "danger", group: "STATES", meaning: "refusals, errors", builtIn: "#C01C28" },
  { key: "danger.bg", group: "STATES", meaning: "error strip background", builtIn: "#FECACA" },
  { key: "warning", group: "STATES", meaning: "warning strip text", builtIn: "#92400E" },
  { key: "warning.bg", group: "STATES", meaning: "warning strip background", builtIn: "#FEF3C7" },
  { key: "success", group: "STATES", meaning: "posted, cleared", builtIn: "#15803D" },
  { key: "success.bg", group: "STATES", meaning: "success strip background", builtIn: "#DCFCE7" },
  { key: "info", group: "STATES", meaning: "badges, hints", builtIn: "#2563EB" },
  { key: "info.bg", group: "STATES", meaning: "info strip background", builtIn: "#EFF6FF" },
  { key: "rate.below", group: "RATES", meaning: "rate moved below the price list", builtIn: "#C62828" },
  { key: "rate.above", group: "RATES", meaning: "rate moved above the price list", builtIn: "#2E7D32" },
];

export const TOKEN_KEYS: readonly string[] = TOKEN_CATALOGUE.map((entry) => entry.key);

export const BUILT_IN_TOKENS: Readonly<Record<string, string>> = Object.fromEntries(
  TOKEN_CATALOGUE.map((entry) => [entry.key, entry.builtIn]),
);

/**
 * Template placeholders that are not colours: sizes, which come from the
 * settings catalogue (system.ui_font_pt / ui_icon_px / ui_table_header_px).
 * The value is the Qt client's default, shown in the placeholder grid.
 */
export const SIZE_PLACEHOLDERS: Readonly<Record<string, string>> = {
  "size.font": "10pt",
  "size.icon": "20px",
  "size.header": "26px",
};

/** Every `{{key}}` a template may use — the server's own list (400 otherwise). */
export const KNOWN_PLACEHOLDER_KEYS: ReadonlySet<string> = new Set([
  ...TOKEN_KEYS,
  ...Object.keys(SIZE_PLACEHOLDERS),
]);

export const THEME_BASES = ["LIGHT", "DARK"] as const;
export type ThemeBase = (typeof THEME_BASES)[number];

export function isColour(value: unknown): value is string {
  return typeof value === "string" && THEME_COLOUR_PATTERN.test(value);
}

/**
 * A stored theme's tokens over the built-ins: every catalogue key present,
 * uppercased, with an absent or malformed value replaced by the built-in.
 * What the editor starts from, and what "Fill with theme" shows.
 */
export function resolveTokens(tokens: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of TOKEN_CATALOGUE) {
    const raw = tokens?.[entry.key];
    const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    out[entry.key] = isColour(value) ? value : entry.builtIn;
  }
  return out;
}

/**
 * A typed hex as the grid takes it: trimmed, uppercased, `#` prefixed.
 * Returns null when the result is not `#rrggbb` / `#rrggbbaa`.
 */
export function normaliseTypedColour(typed: string): string | null {
  let value = typed.trim().toUpperCase();
  if (!value) return null;
  if (!value.startsWith("#")) value = `#${value}`;
  return isColour(value) ? value : null;
}

/** How many keys differ between two resolved token sets. */
export function countChangedTokens(
  tokens: Record<string, string>,
  loaded: Record<string, string>,
): number {
  let changed = 0;
  for (const key of TOKEN_KEYS) {
    if (tokens[key] !== loaded[key]) changed += 1;
  }
  return changed;
}
