/**
 * Turn the form an operator is looking at into a `masters.*_form_defaults`
 * document — the pure half of "Save as Default Template".
 *
 * Generic over a field-spec list on purpose: `masters.item_form_defaults`
 * exists in the catalog with nothing writing it, and Item Entry should get this
 * for the price of a different exclusion list.
 *
 * Two things about the document decide the whole shape of this file:
 *
 *  - **It seeds a FORM, not a save payload.** Every dropdown id is written with
 *    its display text beside it (`cusAreaId` + `cusAreaName`), because the form
 *    that reads it back has no options loaded yet and would otherwise render a
 *    box that looks empty. A template built from the submit payload — which
 *    strips exactly those — is what "the template did nothing" looks like.
 *  - **Empty is NOT SET, not "set to nothing".** A blank field is dropped
 *    rather than stored, or every Add would start by blanking it. `false` and
 *    `0` are kept, deliberately: they are the only way a template can say
 *    "off", and the author was looking at the form when they pressed the
 *    button.
 */

export type FormDefaultsFieldKind = "text" | "id" | "number" | "boolean" | "numberList";

export type FormDefaultsFieldSpec = {
  /** The form field name, which is also the document key. */
  name: string;
  kind: FormDefaultsFieldKind;
  /** Companion key carrying this id's display text (`cusAreaId` → `cusAreaName`). */
  labelKey?: string;
};

export type BuildFormDefaultsOptions = {
  specs: readonly FormDefaultsFieldSpec[];
  /** What identifies ONE record and can never be a default. */
  excluded: readonly string[];
  /** Whole families of fields that can never be a default — a master's linked-row
   *  editors, whose draft fields are generated per table, so a new column must not
   *  leak into every template just because nobody listed it. */
  excludedPrefixes?: readonly string[];
  /** Display text for the id fields, keyed by the FIELD name, not the label key. */
  labels?: Record<string, string>;
};

/** Ids in this system are not all one type ("1" and a uuid both appear), so a
 *  value is round-tripped as whatever the field holds and never "normalised". */
function toDocumentValue(raw: string, kind: FormDefaultsFieldKind): unknown {
  const text = (raw ?? "").trim();
  switch (kind) {
    case "boolean":
      // The modal holds checkboxes as "true"/"false"; anything else is not a
      // decision and is left out rather than guessed at as false.
      return text === "true" ? true : text === "false" ? false : undefined;
    case "number": {
      if (!text) {
        return undefined;
      }
      const numeric = Number(text);
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    case "numberList":
      return text
        .split(",")
        .map((entry) => Number.parseInt(entry.trim(), 10))
        .filter((entry) => Number.isInteger(entry) && entry >= 0);
    case "id":
    case "text":
    default:
      return text;
  }
}

/** Not set: nothing, a blank string, an empty list or an empty object. */
function isNotSet(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * The document, as the compact JSON text that goes into `asv_value`.
 *
 * A label is written only where its id survived, so the document can never
 * carry a name with nothing behind it; and a label sitting in the draft (put
 * there by the template this form was seeded from) is re-derived from `labels`
 * rather than copied, so a changed selection cannot keep the old name.
 */
export function buildFormDefaults(
  values: Record<string, string>,
  { specs, excluded, excludedPrefixes, labels }: BuildFormDefaultsOptions,
): string {
  const specByName = new Map(specs.map((spec) => [spec.name, spec]));
  const excludedNames = new Set(excluded);
  const ownerByLabelKey = new Map(
    specs.filter((spec) => spec.labelKey).map((spec) => [spec.labelKey as string, spec.name]),
  );
  const document: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(values)) {
    if (
      excludedNames.has(name) ||
      ownerByLabelKey.has(name) ||
      excludedPrefixes?.some((prefix) => name.startsWith(prefix))
    ) {
      continue;
    }
    const spec = specByName.get(name);
    const value = toDocumentValue(raw, spec?.kind ?? "text");
    if (isNotSet(value)) {
      continue;
    }
    document[name] = value;
    if (spec?.labelKey) {
      const label = (labels?.[name] ?? "").trim() || (values[spec.labelKey] ?? "").trim();
      if (label) {
        document[spec.labelKey] = label;
      }
    }
  }
  // Compact: it is a text column and nobody diffs it.
  return JSON.stringify(document);
}
