/**
 * Company theme — the company's colours, painted onto the CSS variables every
 * screen already reads.
 *
 * A theme is a row of `app_theme_master`: named colour VALUES (tokens), never a
 * stylesheet. The Qt client fills its own template from the same row; this
 * client writes the values onto `<html>` as inline custom properties, which
 * outrank the `:root` defaults in globals.css. A company picks a theme in the
 * Company master; `GET /app-themes/effective` answers with that theme, or the
 * default one when the company has none (or a retired one).
 *
 * The token list mirrors the API's `APP_THEME_TOKENS`
 * (src/modules/settings/appTheme/types/app-theme.types.ts in the server). A key
 * missing from a row means "keep the compiled default": the variable is left
 * to the stylesheet, so old rows survive new builds and new rows old builds.
 *
 * Only CSS that reads a variable follows the theme. Colours written as
 * literals (a few dozen screens still hard-code the maroon) stay as they are
 * until they are moved onto the variables.
 */

/** The v1 colour tokens. Keep in step with the server's `APP_THEME_TOKENS`. */
export const THEME_TOKEN_KEYS = [
  "primary",
  "primary.hover",
  "on.primary",
  "surface",
  "surface.alt",
  "text",
  "text.muted",
  "border",
  "focus",
  "title.bg",
  "title.fg",
  "menu.bg",
  "menu.fg",
  "table.header.bg",
  "table.header.fg",
  "table.row",
  "table.row.alt",
  "table.row.hover",
  "table.selected",
  "table.selected.fg",
  "table.txn.selected",
  "table.checked",
  "table.free",
  "danger",
  "danger.bg",
  "warning",
  "warning.bg",
  "success",
  "success.bg",
  "info",
  "info.bg",
  "rate.below",
  "rate.above",
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];
export type ThemeTokens = Partial<Record<string, string>>;

/** `#rrggbb` or `#rrggbbaa` — the same rule as the server's ck_thm_tokens. */
export const THEME_COLOUR_PATTERN = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

/**
 * Which token paints which variable.
 *
 * `--row-selected` takes `table.txn.selected`, not `table.selected`: every
 * place that reads it draws a pale wash under ordinary dark text, which is
 * what the entry-grid token is. `table.selected` is Qt's solid list highlight
 * and is meant to sit under `table.selected.fg` (white).
 */
const DIRECT: ReadonlyArray<readonly [string, ThemeTokenKey]> = [
  ["--primary", "primary"],
  ["--primary-hover", "primary.hover"],
  ["--card-bg", "surface"],
  ["--page-bg", "surface.alt"],
  ["--text-main", "text"],
  ["--text-muted", "text.muted"],
  ["--border", "border"],
  ["--header-bg", "table.header.bg"],
  ["--table-header-text", "table.header.fg"],
  ["--row-hover", "table.row.hover"],
  ["--row-selected", "table.txn.selected"],
  ["--danger", "danger"],
  ["--danger-light", "danger.bg"],
  ["--success-text", "success"],
  ["--success-bg", "success.bg"],
  // The shell's header bar (components/layout/erp-header.module.css).
  ["--erp-header-bar-top", "menu.bg"],
  ["--erp-header-bar-text", "menu.fg"],
];

/**
 * The header bar's gradient, edge and calendar tile are shades of `menu.bg`,
 * so a theme names one colour for the bar rather than five.
 */
const FROM_MENU_BG: ReadonlyArray<readonly [string, 0 | 255, number]> = [
  ["--erp-header-bar-bottom", 0, 0.18],
  ["--erp-header-bar-edge", 0, 0.45],
  ["--erp-header-bar-tile", 255, 0.25],
  ["--erp-header-bar-tile-edge", 255, 0.7],
];

/** Every variable a theme may set — and so every one `clearTheme` removes. */
export const THEME_CSS_VARIABLES: readonly string[] = [
  ...DIRECT.map(([name]) => name),
  ...FROM_MENU_BG.map(([name]) => name),
];

/** localStorage: the variables last painted, for the pre-paint bootstrap. */
export const THEME_APPLIED_STORAGE_KEY = "erp.theme.applied";
/** localStorage: one company's last answer from `/app-themes/effective`. */
export const THEME_COMPANY_STORAGE_PREFIX = "erp.theme.company.";

function isColour(value: unknown): value is string {
  return typeof value === "string" && THEME_COLOUR_PATTERN.test(value);
}

/** Moves a colour `amount` (0..1) of the way to black (0) or white (255); alpha kept. */
export function mixColour(hex: string, target: 0 | 255, amount: number): string {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(value + (target - value) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}${hex.slice(7)}`.toUpperCase();
}

/**
 * The variables a set of tokens paints. A token that is missing, or is not a
 * colour, paints nothing — the stylesheet's default stays in force.
 */
export function themeCssVariables(tokens: ThemeTokens | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tokens || typeof tokens !== "object") return out;
  for (const [name, key] of DIRECT) {
    const value = tokens[key];
    if (isColour(value)) out[name] = value.toUpperCase();
  }
  const menuBg = tokens["menu.bg"];
  if (isColour(menuBg)) {
    for (const [name, target, amount] of FROM_MENU_BG) {
      out[name] = mixColour(menuBg, target, amount);
    }
  }
  return out;
}

type StyleTarget = Pick<CSSStyleDeclaration, "setProperty" | "removeProperty" | "getPropertyValue">;

function rootStyle(): StyleTarget | null {
  return typeof document === "undefined" ? null : document.documentElement.style;
}

/**
 * Paints a theme onto `<html>`. Variables the tokens do not cover are removed,
 * so switching from a full theme to a partial one never leaves the first
 * one's colours behind. A value already in place is not written again.
 * Returns what was painted.
 */
export function applyTheme(
  tokens: ThemeTokens | null | undefined,
  style: StyleTarget | null = rootStyle(),
): Record<string, string> {
  const vars = themeCssVariables(tokens);
  if (!style) return vars;
  for (const name of THEME_CSS_VARIABLES) {
    const value = vars[name];
    if (value === undefined) {
      style.removeProperty(name);
    } else if (style.getPropertyValue(name) !== value) {
      style.setProperty(name, value);
    }
  }
  return vars;
}

/** Back to the compiled colours of globals.css. */
export function clearTheme(style: StyleTarget | null = rootStyle()): void {
  if (!style) return;
  for (const name of THEME_CSS_VARIABLES) style.removeProperty(name);
}

/** The shape `/app-themes/effective` answers with (after the envelope). */
export type EffectiveAppTheme = {
  thmId: number;
  thmName: string;
  thmBase: string;
  thmIsDefault: boolean;
  thmIsActive: boolean;
  thmIsDeleted: boolean;
  thmRemarks: string | null;
  tokens: ThemeTokens;
  usedByCount: number;
  thmModifiedOn: string | null;
  /** COMPANY = the company's own choice; DEFAULT = it has none, or a retired one. */
  resolvedFrom: "COMPANY" | "DEFAULT";
};

/** What is kept per company so a switch paints before the network answers. */
export type CachedAppTheme = Pick<EffectiveAppTheme, "thmId" | "thmModifiedOn" | "tokens">;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCachedTheme(companyId: string): CachedAppTheme | null {
  try {
    const raw = storage()?.getItem(THEME_COMPANY_STORAGE_PREFIX + companyId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAppTheme> | null;
    return parsed && typeof parsed.tokens === "object" && parsed.tokens !== null
      ? {
          thmId: Number(parsed.thmId),
          thmModifiedOn: parsed.thmModifiedOn ?? null,
          tokens: parsed.tokens,
        }
      : null;
  } catch {
    // Unreadable or blocked storage: the fetch still paints the theme.
    return null;
  }
}

/** Keeps a company's theme and the painted variables for the next visit. */
export function rememberTheme(
  companyId: string,
  theme: CachedAppTheme,
  painted: Record<string, string>,
): void {
  try {
    const store = storage();
    if (!store) return;
    const entry: CachedAppTheme = {
      thmId: theme.thmId,
      thmModifiedOn: theme.thmModifiedOn,
      tokens: theme.tokens,
    };
    store.setItem(THEME_COMPANY_STORAGE_PREFIX + companyId, JSON.stringify(entry));
    store.setItem(THEME_APPLIED_STORAGE_KEY, JSON.stringify(painted));
  } catch {
    // Non-fatal: the theme is painted for this page, just not remembered.
  }
}

/**
 * Paints the last theme this browser used before the first frame, so a reload
 * does not show one frame of maroon and then snap to the company's colours.
 * React cannot do it — even a layout effect runs after the first paint — so
 * this is a blocking inline script, like `uiScaleBootstrapScript`.
 *
 * It stores the painted VARIABLES, not the tokens, so the token→variable
 * mapping above is not duplicated here. It writes only variables a theme may
 * set and only colour values. `lib/app-theme.test.ts` runs the string.
 */
export function themeBootstrapScript(): string {
  return `(function(){try{
var raw=window.localStorage.getItem(${JSON.stringify(THEME_APPLIED_STORAGE_KEY)});
if(!raw)return;
var v=JSON.parse(raw);
if(!v||typeof v!=="object")return;
var names=${JSON.stringify(THEME_CSS_VARIABLES)};
var re=${THEME_COLOUR_PATTERN.toString()};
var s=document.documentElement.style;
for(var i=0;i<names.length;i++){
var c=v[names[i]];
if(typeof c==="string"&&re.test(c))s.setProperty(names[i],c);
}
}catch(e){}})();`;
}
