import { describe, expect, it } from "vitest";

import { apiErrorStatus, apiErrorText } from "./api-error";
import {
  TEMPLATE_MAX_BYTES,
  blankComments,
  countPlaceholders,
  cursorPosition,
  findNext,
  formatSavedOn,
  highlightSegments,
  lineRange,
  templateFigures,
  validateTemplate,
} from "./template";
import { filterThemeRows, gridBool, initialThemeId, normaliseThemeRows } from "./theme-list";
import {
  BUILT_IN_TOKENS,
  KNOWN_PLACEHOLDER_KEYS,
  TOKEN_CATALOGUE,
  countChangedTokens,
  normaliseTypedColour,
  resolveTokens,
} from "./token-catalogue";

describe("token catalogue", () => {
  it("holds the server's 38 keys once each, every built-in a colour", () => {
    const keys = TOKEN_CATALOGUE.map((entry) => entry.key);
    expect(keys).toHaveLength(38);
    expect(new Set(keys).size).toBe(38);
    for (const entry of TOKEN_CATALOGUE) expect(entry.builtIn).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("knows the size placeholders as template keys", () => {
    expect(KNOWN_PLACEHOLDER_KEYS.has("size.font")).toBe(true);
    expect(KNOWN_PLACEHOLDER_KEYS.has("primary.soft")).toBe(true);
    expect(KNOWN_PLACEHOLDER_KEYS.size).toBe(41);
  });

  it("resolves a stored theme over the built-ins, dropping bad values", () => {
    const resolved = resolveTokens({ primary: " #0078d7 ", danger: "red", "not.a.key": "#000000" });
    expect(resolved.primary).toBe("#0078D7");
    expect(resolved.danger).toBe(BUILT_IN_TOKENS.danger);
    expect(resolved["menu.bg"]).toBe(BUILT_IN_TOKENS["menu.bg"]);
    expect(Object.keys(resolved)).toHaveLength(38);
    expect("not.a.key" in resolved).toBe(false);
  });

  it("takes a typed hex with or without #, with alpha, and refuses the rest", () => {
    expect(normaliseTypedColour("7b1113")).toBe("#7B1113");
    expect(normaliseTypedColour("#7b111380")).toBe("#7B111380");
    expect(normaliseTypedColour("#7b11")).toBeNull();
    expect(normaliseTypedColour("   ")).toBeNull();
  });

  it("counts the keys that moved", () => {
    const loaded = resolveTokens({});
    expect(countChangedTokens(loaded, loaded)).toBe(0);
    expect(countChangedTokens({ ...loaded, primary: "#000000", text: "#FFFFFF" }, loaded)).toBe(2);
  });
});

describe("validateTemplate", () => {
  it("passes a clean template", () => {
    const qss = "QWidget {\n  color: {{text}};\n  background: url(:/img/bg.png);\n}\n";
    expect(validateTemplate(qss)).toEqual([]);
  });

  it("names an unknown placeholder with its line", () => {
    expect(validateTemplate("QWidget {\n color: {{nope}};\n}")).toEqual([
      { line: 2, message: "unknown placeholder {{nope}} — not one of the theme keys" },
    ]);
  });

  it("refuses a url() that is not a :/ resource", () => {
    const problems = validateTemplate("A { image: url('https://x/y.png'); }");
    expect(problems).toEqual([{ line: 1, message: "url(https://x/y.png) — only :/ resources are allowed" }]);
  });

  it("finds an unclosed { at the line that opened it, and a stray }", () => {
    expect(validateTemplate("A {\n color: red;\n\nB { x: y; }")).toEqual([
      { line: 1, message: "a { that is never closed" },
    ]);
    expect(validateTemplate("A { }\n}")).toEqual([{ line: 2, message: "a } with no { before it" }]);
  });

  it("does not count the braces of a placeholder", () => {
    expect(validateTemplate("A { color: {{primary}}; }")).toEqual([]);
  });

  it("ignores what is inside a comment, keeping line numbers", () => {
    const qss = "/* {{nope}} {\n url(http://x) */\nA {\n color: {{bad}};\n}";
    expect(validateTemplate(qss)).toEqual([
      { line: 4, message: "unknown placeholder {{bad}} — not one of the theme keys" },
    ]);
    expect(blankComments(qss).split("\n")).toHaveLength(qss.split("\n").length);
  });

  it("refuses a template over 512 KB", () => {
    const big = "x".repeat(TEMPLATE_MAX_BYTES + 1);
    expect(validateTemplate(big)[0]).toEqual({ line: 0, message: "the template is 512 KB — at most 512 KB" });
  });
});

describe("template figures", () => {
  it("counts rules and distinct placeholders, not {{ as a rule", () => {
    const qss = "A { color: {{text}}; }\nB { color: {{text}}; background: {{surface}}; }";
    expect(templateFigures(qss)).toEqual({ kilobytes: 0, rules: 2, placeholders: 2 });
    expect(countPlaceholders(qss).get("text")).toBe(2);
  });

  it("formats the saved-on stamp, and leaves junk alone", () => {
    expect(formatSavedOn("2026-10-01T08:05:00")).toBe("01-10-2026 08:05");
    expect(formatSavedOn("not a date")).toBe("not a date");
    expect(formatSavedOn(null)).toBe("");
  });
});

describe("editor helpers", () => {
  const text = "one\ntwo\nthree";

  it("finds a line's range", () => {
    expect(lineRange(text, 2)).toEqual({ start: 4, end: 7 });
    expect(lineRange(text, 3)).toEqual({ start: 8, end: 13 });
    expect(lineRange(text, 4)).toBeNull();
  });

  it("reports line and column", () => {
    expect(cursorPosition(text, 0)).toEqual({ line: 1, column: 1 });
    expect(cursorPosition(text, 6)).toEqual({ line: 2, column: 3 });
  });

  it("finds the next match, wrapping once", () => {
    expect(findNext("a b a", "a", 1)).toBe(4);
    expect(findNext("a b a", "a", 5)).toBe(0);
    expect(findNext("a b a", "z", 0)).toBe(-1);
  });

  it("splits the text into highlight segments that rebuild it exactly", () => {
    const qss = "/* {{x}} */ A { c: {{text}}; d: {{nope}}; }";
    const segments = highlightSegments(qss);
    expect(segments.map((segment) => segment.text).join("")).toBe(qss);
    expect(segments.filter((segment) => segment.kind !== "plain").map((segment) => segment.kind)).toEqual([
      "comment",
      "known",
      "unknown",
    ]);
  });
});

describe("theme list", () => {
  const rows = normaliseThemeRows([
    { thm_id: "1", thm_name: "MAROON", thm_base: "LIGHT", thm_is_default: "t", thm_is_active: true, thm_is_deleted: false, thm_used_by: "2" },
    { thm_id: 3, thm_name: "Blue", thm_base: "LIGHT", thm_is_default: false, thm_is_active: "true", thm_is_deleted: "f", thm_used_by: 0 },
    { thm_id: 13, thm_name: "ZT-THEME", thm_base: "LIGHT", thm_is_default: false, thm_is_active: true, thm_is_deleted: "t", thm_used_by: null },
    { thm_id: null, thm_name: "broken" },
  ]);

  it("reads SQL-text booleans and numbers, dropping rows with no id", () => {
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ thmId: 1, isDefault: true, usedBy: 2 });
    expect(rows[2]).toMatchObject({ thmId: 13, isDeleted: true, usedBy: 0 });
    expect(gridBool("1")).toBe(true);
    expect(gridBool("false")).toBe(false);
  });

  it("hides deleted themes unless asked, and searches by name", () => {
    expect(filterThemeRows(rows, "", false).map((row) => row.thmId)).toEqual([1, 3]);
    expect(filterThemeRows(rows, "", true).map((row) => row.thmId)).toEqual([1, 3, 13]);
    expect(filterThemeRows(rows, "blu", false).map((row) => row.thmId)).toEqual([3]);
  });

  it("opens on the company's theme, else the default, else the first", () => {
    expect(initialThemeId(rows, 3)).toBe(3);
    expect(initialThemeId(rows, 99)).toBe(1);
    expect(initialThemeId(rows.slice(1), null)).toBe(3);
    expect(initialThemeId([], null)).toBe(0);
  });
});

describe("api errors", () => {
  it("lists the field errors under the head", () => {
    const error = {
      status: 400,
      message: "Validation failed",
      data: {
        message: "Validation failed",
        errors: [
          { field: "tokens.primary", message: "not a colour: #rrggbb or #rrggbbaa" },
          { field: "thmName", message: "thmName must not be empty" },
        ],
      },
    };
    expect(apiErrorStatus(error)).toBe(400);
    expect(apiErrorText(error, "x")).toBe(
      "Validation failed\ntokens.primary: not a colour: #rrggbb or #rrggbbaa\nthmName: thmName must not be empty",
    );
  });

  it("falls back to the message, then the fallback", () => {
    expect(apiErrorText({ status: 409, message: "Theme in use" }, "x")).toBe("Theme in use");
    expect(apiErrorText(undefined, "fallback")).toBe("fallback");
  });
});
