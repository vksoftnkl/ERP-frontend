/**
 * One GST row on a form — the Qt `GstPartForm` + `GstPartSpec`, as data and
 * pure functions.
 *
 * A form is a list of fields. Each field says how its value is SHOWN (text,
 * a select, a list edited one value per line, a write-only secret…) and how it
 * GOES OUT, which is where these rows differ from an ordinary master:
 *
 *  * a nullable field sends `""` as `null` — `""` fails the server's URL and
 *    JSONPath patterns, `null` clears;
 *  * an "(all …)" select item is `""` and goes out as `null` (= every service);
 *  * a JSON array (fallback URLs, redact paths, whitelisted IPs) is edited one
 *    value per line; a JSON object (endpoint headers) as `Name: value` lines;
 *  * a secret never arrives. The row says only whether one is stored (`has*`)
 *    and under which key version; an empty box keeps it, text replaces it, and
 *    × names it in `clear[]` (where the server lets it be cleared);
 *  * a row filled from a GRID rather than a /get (the error map has no /get,
 *    and grid 130 carries only part of the row) leaves the columns the grid
 *    did not carry OFF the body, so the update keeps what is stored — the Qt
 *    form sent its combo defaults for them and overwrote severity and the
 *    extract path on every edit.
 */
import type { CodedOption } from "../gst.constants";

type FieldBase = {
  key: string;
  label: string;
  /** Takes the whole row of the form's grid. */
  full?: boolean;
};

export type PartField =
  | (FieldBase & { kind: "heading"; note?: string })
  | (FieldBase & {
      kind: "text";
      /** The message when blank; absent = optional. */
      required?: string;
      /** `""` goes out as `null` (else it is left off). */
      nullable?: boolean;
      upper?: boolean;
      maxLength?: number;
      placeholder?: string;
      defaultValue?: string;
    })
  | (FieldBase & {
      kind: "lines";
      /** A JSON array (one value per line) or object (`Name: value` per line). */
      shape: "array" | "object";
      placeholder?: string;
    })
  | (FieldBase & {
      kind: "int";
      min: number;
      max: number;
      /** What a blank box sends: `null`, nothing at all, or a number. */
      blank: "null" | "omit" | number;
      required?: string;
      placeholder?: string;
      defaultValue?: string;
    })
  | (FieldBase & {
      kind: "select";
      options: readonly CodedOption[];
      required?: string;
      /** The `""` item is "(all …)" and goes out as `null`. */
      allIsNull?: boolean;
      defaultValue?: string;
    })
  | (FieldBase & { kind: "check"; defaultValue?: boolean })
  | (FieldBase & { kind: "date"; required?: string; nullable?: boolean })
  | (FieldBase & {
      kind: "secret";
      /** The GET's flag for this secret: `hasClientId`, … */
      hasFlag: string;
      /** The server lets `clear[]` name it (a password can be replaced, never cleared). */
      clearable: boolean;
      /** Asked for while nothing is stored — the credential's password on create. */
      requiredWhenUnset?: string;
    })
  /** An id picked from a dropdown; `textKey` is the row's label for it. */
  | (FieldBase & { kind: "lookup"; textKey: string; required?: string; nullable?: boolean })
  /** Drawn by the screen; contributes nothing to the body. */
  | (FieldBase & { kind: "custom" });

export type SecretValue = {
  /** A NEW value. Empty = keep what is stored. */
  text: string;
  /** × pressed: remove the stored value on save. */
  clear: boolean;
  /** What the row said — `has*`. */
  stored: boolean;
};

export type PartFormState = {
  values: Record<string, string | boolean>;
  /** Display text for lookups, by field key. */
  labels: Record<string, string>;
  secrets: Record<string, SecretValue>;
  keyVersion: number;
  /** Keys the loaded row did not carry. Left off the body until edited. */
  unknown: string[];
};

export type PartBodyContext = {
  idKey: string;
  /** Absent = create. */
  id?: string | null;
  /** The parent the row hangs from — not a field, the screen that opened the form knows it. */
  parentKey?: string;
  parentId?: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const text = toText(value).trim().toLowerCase();
  return text === "true" || text === "t" || text === "1" || text === "yes";
}

// ── lists edited as lines ──────────────────────────────────────────────────

export function arrayToLines(value: unknown): string {
  return Array.isArray(value) ? value.map(toText).join("\n") : "";
}

export function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function objectToLines(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  return Object.entries(value)
    .map(([name, entry]) => `${name}: ${toText(entry)}`)
    .join("\n");
}

/** `Name: value` per line; a line with no name before its colon is dropped. Blank = null. */
export function linesToObject(text: string): Record<string, string> | null {
  if (!text.trim()) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) {
      continue;
    }
    const name = line.slice(0, colon).trim();
    if (name) {
      out[name] = line.slice(colon + 1).trim();
    }
  }
  return out;
}

/** A grid row (snake_case) under the DTO's keys (camelCase): gem_their_code → gemTheirCode. */
export function camelRow(snake: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(snake)) {
    const parts = key.split("_");
    const camel = parts
      .map((part, index) =>
        index === 0 || !part ? part : part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join("");
    out[camel] = value;
  }
  return out;
}

// ── state ──────────────────────────────────────────────────────────────────

function emptyValue(field: PartField): string | boolean | undefined {
  switch (field.kind) {
    case "check":
      return field.defaultValue ?? false;
    case "select":
      if (field.defaultValue !== undefined) {
        return field.defaultValue;
      }
      // A required choice starts on its first item (as the Qt combo did); an
      // optional "(all …)" one starts on "(all …)".
      return field.allIsNull ? "" : (field.options[0]?.value ?? "");
    case "text":
    case "int":
      return field.defaultValue ?? "";
    case "lines":
    case "date":
    case "lookup":
      return "";
    default:
      return undefined;
  }
}

/** A blank form for a new row. */
export function emptyPartState(fields: readonly PartField[]): PartFormState {
  const values: Record<string, string | boolean> = {};
  const secrets: Record<string, SecretValue> = {};
  for (const field of fields) {
    if (field.kind === "secret") {
      secrets[field.key] = { text: "", clear: false, stored: false };
      continue;
    }
    const value = emptyValue(field);
    if (value !== undefined) {
      values[field.key] = value;
    }
  }
  return { values, labels: {}, secrets, keyVersion: 0, unknown: [] };
}

function shownValue(field: PartField, raw: unknown): string | boolean {
  switch (field.kind) {
    case "check":
      return toBool(raw);
    case "lines":
      return field.shape === "array" ? arrayToLines(raw) : objectToLines(raw);
    case "date":
      // "2026-04-01" or an ISO stamp; the form edits the date.
      return toText(raw).slice(0, 10);
    default:
      return toText(raw);
  }
}

/**
 * The form for a row as the server sent it.
 *
 * `partial` — the row is a grid row, not a /get: a column it does not carry is
 * UNKNOWN, shown blank and left off the body, never a default that would
 * overwrite what is stored.
 */
export function fillPartState(
  fields: readonly PartField[],
  row: JsonRecord,
  options: { partial?: boolean } = {},
): PartFormState {
  const state = emptyPartState(fields);
  const unknown: string[] = [];
  const keyVersion = Number(row.keyVersion ?? 0);
  state.keyVersion = Number.isFinite(keyVersion) ? keyVersion : 0;
  for (const field of fields) {
    if (field.kind === "heading" || field.kind === "custom") {
      continue;
    }
    if (field.kind === "secret") {
      state.secrets[field.key] = { text: "", clear: false, stored: toBool(row[field.hasFlag]) };
      continue;
    }
    const raw = row[field.key];
    if (raw === undefined) {
      if (options.partial) {
        unknown.push(field.key);
        state.values[field.key] = field.kind === "check" ? false : "";
      }
      continue;
    }
    state.values[field.key] = shownValue(field, raw);
    if (field.kind === "lookup") {
      state.labels[field.key] = toText(row[field.textKey]);
    }
  }
  state.unknown = unknown;
  return state;
}

/** One field changed by the operator: it is known from now on. */
export function setPartValue(
  state: PartFormState,
  key: string,
  value: string | boolean,
  label?: string,
): PartFormState {
  return {
    ...state,
    values: { ...state.values, [key]: value },
    labels: label === undefined ? state.labels : { ...state.labels, [key]: label },
    unknown: state.unknown.includes(key) ? state.unknown.filter((k) => k !== key) : state.unknown,
  };
}

/** Typing a new value and clearing the old one are opposites. */
export function setSecretText(state: PartFormState, key: string, text: string): PartFormState {
  const current = state.secrets[key] ?? { text: "", clear: false, stored: false };
  return {
    ...state,
    secrets: { ...state.secrets, [key]: { ...current, text, clear: text ? false : current.clear } },
  };
}

export function toggleSecretClear(state: PartFormState, key: string): PartFormState {
  const current = state.secrets[key] ?? { text: "", clear: false, stored: false };
  const clear = !current.clear;
  return {
    ...state,
    secrets: { ...state.secrets, [key]: { ...current, clear, text: clear ? "" : current.text } },
  };
}

// ── the secret's pill ──────────────────────────────────────────────────────

export type SecretBadgeTone = "green" | "amber" | "red" | "grey";

/** "set · key v2" / "not set" — and what a save is about to do to it. */
export function secretBadge(
  secret: SecretValue,
  keyVersion: number,
): { label: string; tone: SecretBadgeTone } {
  if (secret.clear) {
    return { label: "will be removed", tone: "red" };
  }
  if (secret.text) {
    return { label: secret.stored ? "will replace" : "will be set", tone: "amber" };
  }
  if (secret.stored) {
    return { label: keyVersion > 0 ? `set · key v${keyVersion}` : "set", tone: "green" };
  }
  return { label: "not set", tone: "grey" };
}

// ── validate + body ────────────────────────────────────────────────────────

export type PartFieldError = { key: string; message: string };

/** The first field the save cannot go without, in field order. */
export function validatePart(
  fields: readonly PartField[],
  state: PartFormState,
): PartFieldError | null {
  for (const field of fields) {
    if (state.unknown.includes(field.key)) {
      continue;
    }
    const value = state.values[field.key];
    const text = typeof value === "string" ? value.trim() : "";
    switch (field.kind) {
      case "text":
      case "select":
      case "date":
      case "lookup":
        if (field.required && !text) {
          return { key: field.key, message: field.required };
        }
        break;
      case "int": {
        if (!text) {
          if (field.required) {
            return { key: field.key, message: field.required };
          }
          break;
        }
        const number = Number(text);
        if (!Number.isInteger(number) || number < field.min || number > field.max) {
          return {
            key: field.key,
            message: `${field.label} must be a whole number from ${field.min} to ${field.max}.`,
          };
        }
        break;
      }
      case "secret": {
        const secret = state.secrets[field.key];
        if (field.requiredWhenUnset && secret && !secret.stored && !secret.text) {
          return { key: field.key, message: field.requiredWhenUnset };
        }
        break;
      }
      default:
        break;
    }
  }
  return null;
}

/** The body for `POST …/create` — an upsert: the id selects update. */
export function buildPartBody(
  fields: readonly PartField[],
  state: PartFormState,
  context: PartBodyContext,
): JsonRecord {
  const body: JsonRecord = {};
  const clear: string[] = [];
  for (const field of fields) {
    if (field.kind === "heading" || field.kind === "custom") {
      continue;
    }
    if (field.kind === "secret") {
      const secret = state.secrets[field.key];
      if (!secret) {
        continue;
      }
      if (secret.text) {
        // Never trimmed: a password may well end in a space.
        body[field.key] = secret.text;
      } else if (secret.clear && secret.stored && field.clearable) {
        clear.push(field.key);
      }
      // Empty and not cleared: absent, which is "keep what is stored".
      continue;
    }
    if (state.unknown.includes(field.key)) {
      continue;
    }
    const value = state.values[field.key];
    if (field.kind === "check") {
      body[field.key] = value === true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    switch (field.kind) {
      case "text": {
        if (text) {
          body[field.key] = field.upper ? text.toUpperCase() : text;
        } else if (field.nullable) {
          body[field.key] = null;
        }
        break;
      }
      case "lines":
        body[field.key] =
          field.shape === "array" ? linesToArray(String(value ?? "")) : linesToObject(String(value ?? ""));
        break;
      case "int": {
        if (text) {
          body[field.key] = Number.parseInt(text, 10);
        } else if (field.blank === "null") {
          body[field.key] = null;
        } else if (typeof field.blank === "number") {
          body[field.key] = field.blank;
        }
        break;
      }
      case "select":
        if (text) {
          body[field.key] = text;
        } else if (field.allIsNull) {
          body[field.key] = null;
        }
        break;
      case "date":
      case "lookup":
        if (text) {
          body[field.key] = text;
        } else if (field.nullable) {
          body[field.key] = null;
        }
        break;
      default:
        break;
    }
  }
  if (clear.length > 0) {
    body.clear = clear;
  }
  if (context.parentKey && context.parentId) {
    body[context.parentKey] = context.parentId;
  }
  if (context.id) {
    body[context.idKey] = context.id;
  }
  return body;
}
