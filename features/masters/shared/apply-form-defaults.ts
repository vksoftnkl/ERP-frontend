import type { FormDefaultsFieldSpec } from "./build-form-defaults";

/**
 * Read a `masters.*_form_defaults` document back into a blank form — the other
 * half of `buildFormDefaults`, and the only place the untyped JSON meets the
 * typed draft.
 *
 * Two rules decide everything here:
 *
 *  - **A partial template is a partial apply.** Only the keys the document
 *    carries come back; every other field keeps whatever the blank form had.
 *    (The Qt `fillFromJson` pushed a null into its Custom/Image widgets even
 *    when the key was absent, clearing them — a merge over present keys cannot
 *    do that.)
 *  - **Coerce at the boundary.** The document is untyped and written by more
 *    than one client, so a value is converted per field spec rather than
 *    trusted: "1" and 1 both appear in live data, and a checkbox the modal
 *    holds as "true"/"false" must not arrive as "yes".
 *
 * A key this build does not know is ignored, silently — a template written by a
 * newer build must not be an error — and a malformed document yields empty
 * defaults, because a mistyped template can never be the reason a master cannot
 * be added.
 */
export type FormDefaultsSeed = {
  /** The stored id, which is the select's value. */
  id: string;
  /** Its display text, so a lazy dropdown can show a label before it loads. */
  label: string;
};

export type AppliedFormDefaults = {
  /** Form values, in the string shape the modal holds. */
  values: Record<string, string>;
  /** Per id field, what to seed its dropdown with. */
  seeds: Record<string, FormDefaultsSeed>;
};

export const EMPTY_FORM_DEFAULTS: AppliedFormDefaults = { values: {}, seeds: {} };

// Postgres' boolean vocabulary, so a document written from SQL or by another
// client reads the same way here.
const TRUE_LITERALS = new Set(["true", "t", "yes", "y", "on", "1"]);

function toFormValue(raw: unknown, spec: FormDefaultsFieldSpec | undefined): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (Array.isArray(raw)) {
    // A multi-select: the document holds a list, the modal a comma string.
    const entries = raw.filter(
      (entry) => entry !== null && entry !== undefined && typeof entry !== "object",
    );
    return entries.length === raw.length ? entries.map((entry) => String(entry)).join(",") : null;
  }
  if (typeof raw === "object") {
    return null;
  }
  const text = String(raw).trim();
  if (spec?.kind === "boolean") {
    return String(TRUE_LITERALS.has(text.toLowerCase()));
  }
  return text;
}

export function applyFormDefaults(
  value: string | null | undefined,
  specs: readonly FormDefaultsFieldSpec[],
): AppliedFormDefaults {
  if (!value || !value.trim()) {
    return EMPTY_FORM_DEFAULTS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    // Never a throw: the column is TEXT and the server does not parse it, so a
    // document somebody mistyped is discovered here and nowhere else.
    console.warn("Ignoring an unreadable form-defaults template.");
    return EMPTY_FORM_DEFAULTS;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return EMPTY_FORM_DEFAULTS;
  }
  const document = parsed as Record<string, unknown>;
  const specByName = new Map(specs.map((spec) => [spec.name, spec]));
  const labelKeys = new Set(
    specs.map((spec) => spec.labelKey).filter((key): key is string => Boolean(key)),
  );
  const values: Record<string, string> = {};
  for (const [name, raw] of Object.entries(document)) {
    // A label is not a form field; it is read below, beside the id it belongs to.
    if (labelKeys.has(name)) {
      continue;
    }
    const formValue = toFormValue(raw, specByName.get(name));
    if (formValue !== null) {
      values[name] = formValue;
    }
  }
  const seeds: Record<string, FormDefaultsSeed> = {};
  for (const spec of specs) {
    if (!spec.labelKey) {
      continue;
    }
    const id = (values[spec.name] ?? "").trim();
    if (!id) {
      continue;
    }
    const label = toFormValue(document[spec.labelKey], undefined) ?? "";
    seeds[spec.name] = { id, label: label || id };
  }
  return { values, seeds };
}
