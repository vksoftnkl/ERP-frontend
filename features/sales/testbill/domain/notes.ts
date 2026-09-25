/**
 * Sale Bill Entry — the warning strip's parser (§16.1) and the verdict on a
 * lifecycle answer.
 *
 * The same guard run serves `/validate`, `/post` and `/amend`, and its notes
 * arrive in more than one envelope: the success body's `data.{refusals,
 * warnings}`, a 422's `errors[]` (each carrying a `code`), and the older
 * `details` / `error.details` / bare holders the Qt client learned to read.
 * **Every holder is read**, refusals first. Missing one of them was the bug this
 * parser exists to prevent.
 *
 * Pure, and the only place that knows those shapes: the hook asks "what did the
 * server say?" and gets `ValidationNote[]` back, whichever way it was said.
 */
import type { BillRights, ChargeCarryProposal, StatutoryRef, ValidationNote } from "@/features/sales/testbill/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statutoryOf(value: unknown): StatutoryRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const code = text(value.code);
  if (!code) {
    return null;
  }
  const raw = value.value;
  return {
    code,
    value: typeof raw === "number" || typeof raw === "string" ? raw : null,
    effectiveFrom: text(value.effectiveFrom) ?? "",
    isCompanyOverride: value.isCompanyOverride === true,
  };
}

function noteOf(raw: unknown, level: ValidationNote["level"]): ValidationNote | null {
  if (!isRecord(raw)) {
    return null;
  }
  const message = text(raw.message);
  const code = text(raw.code);
  if (!message && !code) {
    return null;
  }
  const declaredLevel = text(raw.level)?.toUpperCase();
  const effectiveLevel: ValidationNote["level"] =
    declaredLevel === "REFUSE" || declaredLevel === "WARN" || declaredLevel === "INFO"
      ? declaredLevel
      : level;
  const isRefusal = effectiveLevel === "REFUSE";
  return {
    code: code ?? "",
    level: effectiveLevel,
    message: message ?? code ?? "",
    field: text(raw.field),
    line: typeof raw.line === "number" && Number.isFinite(raw.line) ? raw.line : null,
    // A refusal is never tickable, whatever the flag says (§16.2 rule 1).
    overridable: !isRefusal && raw.overridable === true,
    isRefusal,
    statutory: statutoryOf(raw.statutory),
  };
}

function notesFromHolder(holder: unknown): ValidationNote[] {
  if (!isRecord(holder)) {
    return [];
  }
  const refusals = Array.isArray(holder.refusals) ? holder.refusals : [];
  const warnings = Array.isArray(holder.warnings) ? holder.warnings : [];
  return [
    ...refusals.map((raw) => noteOf(raw, "REFUSE")),
    ...warnings.map((raw) => noteOf(raw, "WARN")),
  ].filter((note): note is ValidationNote => note !== null);
}

/**
 * The 422 envelope: `errors[{field, message, code?, line?, statutory?}]`. An
 * entry WITH a code is a refusal the guard raised; one without is a
 * class-validator message about the request itself, which is a 400 in practice
 * and is not a note — it is reported as the generic error instead.
 */
function notesFromErrors(errors: unknown): ValidationNote[] {
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .filter((entry) => isRecord(entry) && text(entry.code) !== null)
    .map((entry) => noteOf(entry, "REFUSE"))
    .filter((note): note is ValidationNote => note !== null);
}

function dedupe(notes: ValidationNote[]): ValidationNote[] {
  const seen = new Set<string>();
  const out: ValidationNote[] = [];
  for (const note of notes) {
    const key = `${note.level}|${note.code}|${note.field ?? ""}|${note.line ?? ""}|${note.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(note);
  }
  // Refusals first, whatever order the holders came in.
  return [...out.filter((note) => note.isRefusal), ...out.filter((note) => !note.isRefusal)];
}

/**
 * Every note in a body, from every holder it could be in (§16.1):
 *
 *  - `data.{refusals, warnings}` — the success envelope;
 *  - `details.{…}`, `error.details.{…}`;
 *  - a bare `{refusals, warnings}`;
 *  - the 422 envelope's `errors[]` (each with a `code`).
 *
 * `body` may be the success envelope, its `data`, or an error's `data`.
 */
export function parseValidationNotes(body: unknown): ValidationNote[] {
  if (!isRecord(body)) {
    return [];
  }
  const holders: unknown[] = [body, body.data, body.details];
  if (isRecord(body.error)) {
    holders.push(body.error.details, body.error);
  }
  if (isRecord(body.data)) {
    holders.push(body.data.details);
  }
  const notes = holders.flatMap((holder) => notesFromHolder(holder));
  const errors = [
    ...notesFromErrors(body.errors),
    ...(isRecord(body.data) ? notesFromErrors(body.data.errors) : []),
  ];
  return dedupe([...notes, ...errors]);
}

/** The `rights` block a successful validate carries (§16.1). */
export function parseValidateRights(body: unknown): Partial<BillRights> | null {
  if (!isRecord(body)) {
    return null;
  }
  const holder = isRecord(body.data) ? body.data : body;
  if (!isRecord(holder.rights)) {
    return null;
  }
  const rights = holder.rights;
  const flag = (key: string) => (typeof rights[key] === "boolean" ? (rights[key] as boolean) : undefined);
  return {
    post: flag("post"),
    cancel: flag("cancel"),
    amend: flag("amend"),
    override: flag("override"),
    retender: flag("retender"),
  };
}

/** The charge carry proposals a validate answers with (§12.4). */
export function parseCarryProposals(body: unknown): ChargeCarryProposal[] {
  if (!isRecord(body)) {
    return [];
  }
  const holder = isRecord(body.data) ? body.data : body;
  const proposals = isRecord(holder.proposals) ? holder.proposals : null;
  const charges = proposals && Array.isArray(proposals.charges) ? proposals.charges : [];
  return charges.filter(isRecord).map((row) => ({
    cdSrcCdId: text(row.cdSrcCdId) ?? "",
    cdSrcAccYear: text(row.cdSrcAccYear) ?? "",
    chgName: text(row.chgName),
    orderAmount: Number(row.orderAmount) || 0,
    carriedSoFar: Number(row.carriedSoFar) || 0,
    proposed: Number(row.proposed) || 0,
    basis: text(row.basis) ?? "PRORATA",
    isFinalBill: row.isFinalBill === true,
  }));
}

// ---------------------------------------------------------------------------
// The RTK error, read once
// ---------------------------------------------------------------------------

/** The HTTP status of a failed RTK call, when there is one. */
export function errorStatusOf(error: unknown): number | null {
  if (isRecord(error) && typeof error.status === "number") {
    return error.status;
  }
  return null;
}

/** The error's body — `{success:false, message, errors[]}` on this module. */
export function errorBodyOf(error: unknown): Record<string, unknown> | null {
  return isRecord(error) && isRecord(error.data) ? error.data : null;
}

/** The `code` of the first coded error in a failed answer, e.g. `SALES_REVISION_STALE`. */
export function errorCodeOf(error: unknown): string | null {
  const body = errorBodyOf(error);
  if (!body || !Array.isArray(body.errors)) {
    return null;
  }
  for (const entry of body.errors) {
    if (isRecord(entry)) {
      const code = text(entry.code);
      if (code) {
        return code;
      }
    }
  }
  return null;
}

/**
 * The server's own words for a failure, shown as they arrive. The per-field
 * messages are the ones written for the operator; the envelope's `message` is
 * often only "Validation failed", so the field list is read first.
 */
export function errorMessageOf(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const body = errorBodyOf(error);
  if (body) {
    if (Array.isArray(body.errors)) {
      const messages = body.errors
        .map((entry) => (isRecord(entry) ? text(entry.message) : null))
        .filter((message): message is string => message !== null);
      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
    const message = body.message;
    if (Array.isArray(message)) {
      const joined = message.map((entry) => text(entry) ?? "").filter(Boolean).join(", ");
      if (joined) {
        return joined;
      }
    }
    const single = text(message);
    if (single) {
      return single;
    }
  }
  if (isRecord(error) && text(error.message)) {
    return text(error.message) as string;
  }
  return fallback;
}

/**
 * Notes from a FAILED call (§16.1, §16.4). A 422 is the answer, not an error:
 * its refusals are painted in the strip and the generic box stays shut.
 */
export function notesFromError(error: unknown): ValidationNote[] {
  const body = errorBodyOf(error);
  return body ? parseValidationNotes(body) : [];
}

// ---------------------------------------------------------------------------
// Summaries the strip and the popup paint
// ---------------------------------------------------------------------------

export function refusalCount(notes: ValidationNote[]): number {
  return notes.filter((note) => note.isRefusal).length;
}

export function warningCount(notes: ValidationNote[]): number {
  return notes.filter((note) => !note.isRefusal && note.level === "WARN").length;
}

/** "N refused · M warning(s)", or "" when there is nothing to say. */
export function notesSummary(notes: ValidationNote[]): string {
  const refused = refusalCount(notes);
  const warned = warningCount(notes);
  const info = notes.length - refused - warned;
  const parts: string[] = [];
  if (refused > 0) {
    parts.push(`${refused} refused`);
  }
  if (warned > 0) {
    parts.push(`${warned} warning${warned === 1 ? "" : "s"}`);
  }
  if (info > 0) {
    parts.push(`${info} note${info === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

/**
 * The override ticks that still make sense against a NEW answer: only codes
 * that are overridable in it, and only when the user holds the right. Ticks
 * reset on every answer (§16.2 rule 4) — a code that is no longer raised is
 * dropped, and losing the right clears them all.
 */
export function overridesAgainst(
  notes: ValidationNote[],
  overrides: string[],
  canOverride: boolean,
): string[] {
  if (!canOverride) {
    return [];
  }
  const allowed = new Set(notes.filter((note) => note.overridable).map((note) => note.code));
  return Array.from(new Set(overrides.filter((code) => allowed.has(code))));
}

/**
 * The WARNs that will become refusals on `/post` or `/amend` unless overridden
 * (§16.3). Empty means the verb can go ahead without a question.
 */
export function unresolvedWarnings(notes: ValidationNote[], overrides: string[]): ValidationNote[] {
  const ticked = new Set(overrides);
  return notes.filter(
    (note) => !note.isRefusal && note.level === "WARN" && !(note.overridable && ticked.has(note.code)),
  );
}

/**
 * The note that acts on the screen (§16.5): a missing transport band is a WARN
 * that cannot be overridden, and the shipping dialog opens on it.
 */
export function transportMissingNote(notes: ValidationNote[]): ValidationNote | null {
  return (
    notes.find(
      (note) =>
        note.code === "SALES_EWAY_TRANSPORT_MISSING" || note.code === "GST_EWB_TRANSPORT_MISSING",
    ) ?? null
  );
}
