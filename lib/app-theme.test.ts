import { describe, expect, it } from "vitest";

import {
  THEME_APPLIED_STORAGE_KEY,
  THEME_CSS_VARIABLES,
  THEME_TOKEN_KEYS,
  applyTheme,
  clearTheme,
  mixColour,
  themeBootstrapScript,
  themeCssVariables,
} from "./app-theme";

/** MAROON as seeded by migration 20260930190000_app_theme_tokens. */
const MAROON = {
  primary: "#7B1113",
  "primary.hover": "#611010",
  "on.primary": "#FFFFFF",
  surface: "#FFFFFF",
  "surface.alt": "#F3F4F6",
  text: "#111827",
  "text.muted": "#6B7280",
  border: "#E5E7EB",
  focus: "#2563EB",
  "title.bg": "#7B1113",
  "title.fg": "#FFFFFF",
  "menu.bg": "#7B1113",
  "menu.fg": "#FFFFFF",
  "table.header.bg": "#DDDDDD",
  "table.header.fg": "#000000",
  "table.row": "#FFFFFF",
  "table.row.alt": "#F5F5F5",
  "table.row.hover": "#F8FBFF",
  "table.selected": "#0078D7",
  "table.selected.fg": "#FFFFFF",
  "table.txn.selected": "#B9D8DF",
  "table.checked": "#98FB98",
  "table.free": "#FFF4D6",
  danger: "#C01C28",
  "danger.bg": "#FECACA",
  warning: "#92400E",
  "warning.bg": "#FEF3C7",
  success: "#15803D",
  "success.bg": "#DCFCE7",
  info: "#2563EB",
  "info.bg": "#EFF6FF",
  "rate.below": "#C62828",
  "rate.above": "#2E7D32",
};

/** A `style` stand-in: the tests run in node, with no DOM. */
function styleStub(initial: Record<string, string> = {}) {
  const props = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    props,
    writes,
    setProperty(name: string, value: string) {
      writes.push(name);
      props.set(name, value);
    },
    removeProperty(name: string) {
      const old = props.get(name) ?? "";
      props.delete(name);
      return old;
    },
    getPropertyValue(name: string) {
      return props.get(name) ?? "";
    },
  };
}

function runBootstrap(stored: string | null) {
  const style = styleStub();
  const windowStub = { localStorage: { getItem: (key: string) => (key === THEME_APPLIED_STORAGE_KEY ? stored : null) } };
  const documentStub = { documentElement: { style } };
  new Function("window", "document", themeBootstrapScript())(windowStub, documentStub);
  return Object.fromEntries(style.props);
}

describe("THEME_TOKEN_KEYS", () => {
  it("is the server's 33 v1 keys, once each", () => {
    expect(THEME_TOKEN_KEYS).toHaveLength(33);
    expect(new Set(THEME_TOKEN_KEYS).size).toBe(33);
    expect(Object.keys(MAROON).sort()).toEqual([...THEME_TOKEN_KEYS].sort());
  });
});

describe("themeCssVariables", () => {
  it("paints the plan's variables from MAROON", () => {
    const vars = themeCssVariables(MAROON);
    expect(vars).toMatchObject({
      "--primary": "#7B1113",
      "--primary-hover": "#611010",
      "--card-bg": "#FFFFFF",
      "--page-bg": "#F3F4F6",
      "--text-main": "#111827",
      "--text-muted": "#6B7280",
      "--border": "#E5E7EB",
      "--header-bg": "#DDDDDD",
      "--table-header-text": "#000000",
      "--row-hover": "#F8FBFF",
      "--danger": "#C01C28",
      "--danger-light": "#FECACA",
      "--success-text": "#15803D",
      "--success-bg": "#DCFCE7",
      "--erp-header-bar-top": "#7B1113",
      "--erp-header-bar-text": "#FFFFFF",
    });
    expect(Object.keys(vars).sort()).toEqual([...THEME_CSS_VARIABLES].sort());
  });

  it("paints the selected row from the pale entry-grid token, not the solid list highlight", () => {
    expect(themeCssVariables(MAROON)["--row-selected"]).toBe("#B9D8DF");
    expect(themeCssVariables({ "table.selected": "#0078D7" })["--row-selected"]).toBeUndefined();
  });

  it("derives the header bar's shades from menu.bg", () => {
    const vars = themeCssVariables({ "menu.bg": "#1D4ED8" });
    expect(vars["--erp-header-bar-top"]).toBe("#1D4ED8");
    expect(vars["--erp-header-bar-bottom"]).toBe(mixColour("#1D4ED8", 0, 0.18));
    expect(vars["--erp-header-bar-edge"]).toBe(mixColour("#1D4ED8", 0, 0.45));
    expect(vars["--erp-header-bar-tile"]).toBe(mixColour("#1D4ED8", 255, 0.25));
    expect(vars["--erp-header-bar-tile-edge"]).toBe(mixColour("#1D4ED8", 255, 0.7));
  });

  it("skips a missing, invalid or unknown token instead of painting it", () => {
    const vars = themeCssVariables({ primary: "red", border: "#abcdef", "made.up": "#000000" });
    expect(vars).toEqual({ "--border": "#ABCDEF" });
    expect(themeCssVariables(null)).toEqual({});
  });
});

describe("mixColour", () => {
  it("moves toward black or white and keeps the alpha pair", () => {
    expect(mixColour("#FF8000", 0, 0.5)).toBe("#804000");
    expect(mixColour("#000000", 255, 1)).toBe("#FFFFFF");
    expect(mixColour("#20406080", 0, 0)).toBe("#20406080");
  });
});

describe("applyTheme / clearTheme", () => {
  it("writes the theme and removes what the new theme does not cover", () => {
    const style = styleStub();
    applyTheme(MAROON, style);
    expect(style.props.get("--primary")).toBe("#7B1113");
    expect(style.props.size).toBe(THEME_CSS_VARIABLES.length);

    applyTheme({ primary: "#1D4ED8" }, style);
    expect(Object.fromEntries(style.props)).toEqual({ "--primary": "#1D4ED8" });
  });

  it("does not rewrite a value already in place", () => {
    const style = styleStub();
    applyTheme(MAROON, style);
    style.writes.length = 0;
    applyTheme(MAROON, style);
    expect(style.writes).toEqual([]);
  });

  it("leaves variables it does not own alone", () => {
    const style = styleStub({ "--erp-ui-scale": "1.15" });
    applyTheme(MAROON, style);
    clearTheme(style);
    expect(Object.fromEntries(style.props)).toEqual({ "--erp-ui-scale": "1.15" });
  });
});

describe("themeBootstrapScript", () => {
  it("paints the remembered variables before React runs", () => {
    const painted = themeCssVariables(MAROON);
    expect(runBootstrap(JSON.stringify(painted))).toEqual(painted);
  });

  it("writes only theme variables and only colours", () => {
    const stored = JSON.stringify({
      "--primary": "#1D4ED8",
      "--danger": "url(javascript:alert(1))",
      "--erp-ui-scale": "#000000",
    });
    expect(runBootstrap(stored)).toEqual({ "--primary": "#1D4ED8" });
  });

  it("does nothing with no memory or a corrupt one", () => {
    expect(runBootstrap(null)).toEqual({});
    expect(runBootstrap("{not json")).toEqual({});
  });
});
