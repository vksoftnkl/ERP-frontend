/**
 * Client-side expression help: span scanning, a lint pass, and autocomplete.
 *
 * The server owns real validation — it compiles every expression through the
 * jexl sandbox at save time and reports the JSON path that failed. jexl is not a
 * client dependency and adding it to ship a second parser would guarantee the
 * two disagree, so this module deliberately does LESS: it catches the mistakes
 * that are cheap to catch locally (unbalanced braces, an empty span, an
 * identifier or transform that is not in the vocabulary) and leaves everything
 * else to the save.
 *
 * That split is why `lint` returns `severity` rather than blocking a save: a
 * construct this scanner does not understand must never stop a user from
 * saving work the server would have accepted.
 */

import {
  BUILTIN_ROOT_IDENTIFIERS,
  TRANSFORM_NAMES,
} from "@/features/print-designer/lib/vocabulary";

export type ExpressionSpan = {
  /** Index of the opening `{{` in the source string. */
  start: number;
  /** Index just past the closing `}}`. */
  end: number;
  /** The trimmed expression source, without the braces. */
  source: string;
};

const SPAN_PATTERN = /\{\{([\s\S]*?)\}\}/g;

export function expressionSpans(template: string): ExpressionSpan[] {
  const spans: ExpressionSpan[] = [];
  SPAN_PATTERN.lastIndex = 0;
  let match = SPAN_PATTERN.exec(template);
  while (match !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      source: match[1].trim(),
    });
    match = SPAN_PATTERN.exec(template);
  }
  return spans;
}

export const hasExpression = (template: string | undefined | null): boolean =>
  typeof template === "string" && template.includes("{{");

export type ExpressionIssue = {
  message: string;
  /** `error` is something the server will reject; `warning` is a suspicion. */
  severity: "error" | "warning";
  span?: ExpressionSpan;
};

/**
 * Identifier-ish tokens, with enough context to tell a root reference from a
 * property read. A token preceded by `.` is a property, one followed by `(` is
 * a function call, and one after `|` is a transform.
 */
const TOKEN_PATTERN = /(\.)?\b([A-Za-z_][A-Za-z0-9_]*)\b\s*(\()?/g;

/** jexl keywords and literals that look like identifiers but are not roots. */
const RESERVED = new Set(["true", "false", "null", "undefined", "in", "and", "or", "not"]);

function lintSpanSource(
  source: string,
  allowedRoots: ReadonlySet<string>,
  transforms: ReadonlySet<string>,
): string[] {
  const messages: string[] = [];

  const parenBalance = (source.match(/\(/g) ?? []).length - (source.match(/\)/g) ?? []).length;
  if (parenBalance !== 0) {
    messages.push(
      parenBalance > 0 ? "unclosed '(' in expression" : "unmatched ')' in expression",
    );
  }

  const singleQuotes = (source.match(/'/g) ?? []).length;
  const doubleQuotes = (source.match(/"/g) ?? []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
    messages.push("unterminated string literal");
  }

  // Strip string literals before scanning identifiers: a mask like '#,##0.00'
  // or a label like 'Tax Invoice' must not be read as code.
  const code = source.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');

  TOKEN_PATTERN.lastIndex = 0;
  let match = TOKEN_PATTERN.exec(code);
  while (match !== null) {
    const [, dotPrefix, name, callSuffix] = match;
    const precedingText = code.slice(0, match.index);
    const afterPipe = /\|\s*$/.test(precedingText);

    if (afterPipe) {
      if (!transforms.has(name)) {
        messages.push(`unknown transform '${name}'`);
      }
    } else if (callSuffix) {
      // `fmt(row.qty, '#0')` — a call in the functions pool, same name set.
      if (!transforms.has(name)) {
        messages.push(`unknown function '${name}'`);
      }
    } else if (!dotPrefix && !RESERVED.has(name) && !/^\d/.test(name)) {
      if (!allowedRoots.has(name)) {
        messages.push(
          `unknown identifier '${name}' — declare a dataset or use one of ${[...allowedRoots]
            .sort()
            .join(", ")}`,
        );
      }
    }

    match = TOKEN_PATTERN.exec(code);
  }

  return messages;
}

/**
 * Lint one template string. `datasetNames` are the definition's declared
 * datasets, which the server adds to the built-in roots.
 */
export function lintTemplateString(
  template: string | undefined | null,
  datasetNames: readonly string[],
  transforms: readonly string[] = TRANSFORM_NAMES,
): ExpressionIssue[] {
  if (typeof template !== "string" || !template.includes("{{")) {
    return [];
  }

  const openCount = (template.match(/\{\{/g) ?? []).length;
  const closeCount = (template.match(/\}\}/g) ?? []).length;
  if (openCount !== closeCount) {
    return [
      {
        severity: "error",
        message: `unbalanced expression delimiters (${openCount} '{{' vs ${closeCount} '}}')`,
      },
    ];
  }

  const allowedRoots = new Set<string>([...BUILTIN_ROOT_IDENTIFIERS, ...datasetNames]);
  const transformSet = new Set(transforms);
  const issues: ExpressionIssue[] = [];

  for (const span of expressionSpans(template)) {
    if (!span.source) {
      issues.push({ severity: "error", message: "empty expression", span });
      continue;
    }
    for (const message of lintSpanSource(span.source, allowedRoots, transformSet)) {
      issues.push({ severity: "error", message, span });
    }
  }

  return issues;
}

// ─── Autocomplete ────────────────────────────────────────────────────────────

export type CompletionItem = {
  label: string;
  /** Text inserted in place of the token being completed. */
  insert: string;
  detail?: string;
  kind: "root" | "field" | "transform";
};

export type CompletionContext = {
  /** Roots available here: built-ins plus the definition's dataset names. */
  roots: readonly string[];
  /** Field names by root, e.g. `row` -> the band dataset's fields. */
  fieldsByRoot: Readonly<Record<string, ReadonlyArray<{ name: string; detail?: string }>>>;
  transforms?: readonly string[];
};

/**
 * Completions for a caret position inside a template string.
 *
 * Three cases, in the order the user hits them: right after a `|` they want a
 * transform, right after a `.` they want that root's fields, and otherwise they
 * are starting a root.
 */
export function completionsAt(
  template: string,
  caret: number,
  context: CompletionContext,
): CompletionItem[] {
  const before = template.slice(0, caret);

  // Only complete inside an unclosed `{{` span; outside one the user is typing
  // literal text.
  const lastOpen = before.lastIndexOf("{{");
  const lastClose = before.lastIndexOf("}}");
  if (lastOpen === -1 || lastClose > lastOpen) {
    return [];
  }

  const spanText = before.slice(lastOpen + 2);
  const transforms = context.transforms ?? TRANSFORM_NAMES;

  const pipeMatch = /\|\s*([A-Za-z_][A-Za-z0-9_]*)?$/.exec(spanText);
  if (pipeMatch) {
    const prefix = (pipeMatch[1] ?? "").toLowerCase();
    return transforms
      .filter((name) => name.toLowerCase().startsWith(prefix))
      .map((name) => ({ label: name, insert: name, kind: "transform" as const }));
  }

  const dotMatch = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)$/.exec(spanText);
  if (dotMatch) {
    const [, root, partial] = dotMatch;
    const fields = context.fieldsByRoot[root] ?? [];
    const prefix = partial.toLowerCase();
    return fields
      .filter((field) => field.name.toLowerCase().startsWith(prefix))
      .map((field) => ({
        label: field.name,
        insert: field.name,
        detail: field.detail,
        kind: "field" as const,
      }));
  }

  const rootMatch = /([A-Za-z_][A-Za-z0-9_]*)?$/.exec(spanText);
  const prefix = (rootMatch?.[1] ?? "").toLowerCase();
  return context.roots
    .filter((root) => root.toLowerCase().startsWith(prefix))
    .map((root) => ({ label: root, insert: root, kind: "root" as const }));
}

/**
 * Replace the token under the caret with a completion, returning the new
 * template and where the caret should land.
 */
export function applyCompletion(
  template: string,
  caret: number,
  item: CompletionItem,
): { text: string; caret: number } {
  const before = template.slice(0, caret);
  const tokenMatch = /[A-Za-z0-9_]*$/.exec(before);
  const tokenStart = caret - (tokenMatch?.[0].length ?? 0);
  const text = template.slice(0, tokenStart) + item.insert + template.slice(caret);
  return { text, caret: tokenStart + item.insert.length };
}

// ─── Format masks ────────────────────────────────────────────────────────────

/**
 * A number/date mask is not a field on the element — it lives inside the value
 * expression as `fmt(row.qty, '#,##0.00')`. The format section therefore reads
 * and rewrites that call rather than storing a parallel `format` property that
 * the engine would ignore.
 */
const FORMAT_CALL = /\b(fmt|fmtIntl|date)\(\s*([^,()]*(?:\([^()]*\))?[^,]*?)\s*,\s*'([^']*)'\s*\)/;

export type FormatMask = {
  fn: "fmt" | "fmtIntl" | "date";
  subject: string;
  mask: string;
};

export function readFormatMask(template: string): FormatMask | null {
  const match = FORMAT_CALL.exec(template);
  if (!match) {
    return null;
  }
  return { fn: match[1] as FormatMask["fn"], subject: match[2].trim(), mask: match[3] };
}

/** The bare value an expression is about, for wrapping it in a format call. */
export function readSubject(template: string): string | null {
  const existing = readFormatMask(template);
  if (existing) {
    return existing.subject;
  }
  const spans = expressionSpans(template);
  return spans.length === 1 ? spans[0].source : null;
}

/**
 * Apply a mask, replacing an existing format call or wrapping the expression.
 * Returns null when the template is something this cannot safely rewrite — two
 * spans, or literal text mixed with an expression — so the caller can leave the
 * user's own expression alone instead of mangling it.
 */
export function applyFormatMask(
  template: string,
  fn: FormatMask["fn"],
  mask: string,
): string | null {
  const existing = readFormatMask(template);
  if (existing) {
    return template.replace(FORMAT_CALL, `${fn}(${existing.subject}, '${mask}')`);
  }
  const subject = readSubject(template);
  if (!subject) {
    return null;
  }
  return `{{ ${fn}(${subject}, '${mask}') }}`;
}

/** Strip a format call back to the bare value. */
export function clearFormatMask(template: string): string | null {
  const existing = readFormatMask(template);
  return existing ? `{{ ${existing.subject} }}` : null;
}
