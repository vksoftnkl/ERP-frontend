/**
 * The Template tab's pure half: what Validate finds, what the placeholder grid
 * counts, and the figures in the header line.
 *
 * `validateTemplate` runs the server's three checks before Save
 * (`POST /app-themes/template/save` repeats them and answers 400 on tplQss):
 * every `{{key}}` known, braces balanced, `url()` only to `:/` resources —
 * plus the 512 KB cap. Comments are blanked first, so a placeholder or brace
 * inside one counts for nothing, with newlines kept so line numbers still
 * match the editor. Ported from `AppThemeEntry::validateTemplate`.
 */

import { KNOWN_PLACEHOLDER_KEYS } from "./token-catalogue";

/** The largest template the server takes, in UTF-8 bytes. */
export const TEMPLATE_MAX_BYTES = 512 * 1024;

/** How many problems the validation strip lists before "… and N more". */
export const VALIDATION_LIST_LIMIT = 12;

export type TemplateProblem = {
  /** 1-based; 0 for a problem with the whole text (its size). */
  line: number;
  message: string;
};

const PLACEHOLDER_SOURCE = String.raw`\{\{\s*([A-Za-z0-9_.]+)\s*\}\}`;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const URL_PATTERN = /url\(\s*['"]?([^'")\s]*)/gi;
/** One `{` that is not half of a `{{` — a rule's opening brace. */
const RULE_PATTERN = /(?<!\{)\{(?!\{)/g;

function placeholderPattern(): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, "g");
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Comments replaced by spaces, newlines kept, so offsets and lines still match. */
export function blankComments(text: string): string {
  return text.replace(COMMENT_PATTERN, (comment) => comment.replace(/[^\n]/g, " "));
}

export function validateTemplate(
  qss: string,
  known: ReadonlySet<string> = KNOWN_PLACEHOLDER_KEYS,
): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const bytes = utf8Bytes(qss);
  if (bytes > TEMPLATE_MAX_BYTES) {
    problems.push({
      line: 0,
      message: `the template is ${Math.floor(bytes / 1024)} KB — at most ${TEMPLATE_MAX_BYTES / 1024} KB`,
    });
  }

  const lines = blankComments(qss).split("\n");
  let depth = 0;
  let openedAt = 0;
  lines.forEach((line, index) => {
    const lineNo = index + 1;
    for (const match of line.matchAll(placeholderPattern())) {
      if (!known.has(match[1])) {
        problems.push({
          line: lineNo,
          message: `unknown placeholder {{${match[1]}}} — not one of the theme keys`,
        });
      }
    }
    for (const match of line.matchAll(URL_PATTERN)) {
      if (!match[1].startsWith(":/")) {
        problems.push({ line: lineNo, message: `url(${match[1]}) — only :/ resources are allowed` });
      }
    }
    // Braces, with the placeholders taken out.
    for (const ch of line.replace(placeholderPattern(), "")) {
      if (ch === "{") {
        if (depth === 0) openedAt = lineNo;
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth < 0) {
          problems.push({ line: lineNo, message: "a } with no { before it" });
          depth = 0;
        }
      }
    }
  });
  if (depth > 0) {
    problems.push({ line: openedAt, message: "a { that is never closed" });
  }
  return problems;
}

/** How often each `{{key}}` appears, comments included (as the Qt grid counts). */
export function countPlaceholders(qss: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of qss.matchAll(placeholderPattern())) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return counts;
}

export type TemplateFigures = {
  kilobytes: number;
  rules: number;
  placeholders: number;
};

export function templateFigures(qss: string): TemplateFigures {
  return {
    kilobytes: Math.floor(utf8Bytes(qss) / 1024),
    rules: qss.match(RULE_PATTERN)?.length ?? 0,
    placeholders: countPlaceholders(qss).size,
  };
}

/** `dd-MM-yyyy HH:mm` in local time; the raw text when it is not a date. */
export function formatSavedOn(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The 0-based character offsets where `line` (1-based) starts and ends. */
export function lineRange(text: string, line: number): { start: number; end: number } | null {
  if (line < 1) return null;
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf("\n", start);
    if (next < 0) return null;
    start = next + 1;
  }
  const newline = text.indexOf("\n", start);
  return { start, end: newline < 0 ? text.length : newline };
}

/** 1-based line and column of a character offset. */
export function cursorPosition(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, offset));
  const lastNewline = before.lastIndexOf("\n");
  let line = 1;
  for (let index = before.indexOf("\n"); index >= 0; index = before.indexOf("\n", index + 1)) {
    line += 1;
  }
  return { line, column: before.length - lastNewline };
}

/**
 * The next occurrence of `needle` after `from`, wrapping to the top once —
 * the editor's Find. Case-sensitive, like QPlainTextEdit::find's default.
 */
export function findNext(text: string, needle: string, from: number): number {
  if (!needle) return -1;
  const ahead = text.indexOf(needle, from);
  return ahead >= 0 ? ahead : text.indexOf(needle);
}

export type HighlightSegment = {
  text: string;
  kind: "plain" | "comment" | "known" | "unknown";
};

/**
 * The editor's colouring: comments muted, a known `{{key}}` tinted, an unknown
 * one marked. A placeholder inside a comment stays part of the comment.
 */
export function highlightSegments(
  text: string,
  known: ReadonlySet<string> = KNOWN_PLACEHOLDER_KEYS,
): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  const pattern = new RegExp(`(/\\*[\\s\\S]*?\\*/)|${PLACEHOLDER_SOURCE}`, "g");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ text: text.slice(last, at), kind: "plain" });
    if (match[1] !== undefined) {
      segments.push({ text: match[0], kind: "comment" });
    } else {
      segments.push({ text: match[0], kind: known.has(match[2]) ? "known" : "unknown" });
    }
    last = at + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), kind: "plain" });
  return segments;
}
