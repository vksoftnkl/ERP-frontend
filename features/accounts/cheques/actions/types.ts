/**
 * The Qt panel contract, as data.
 *
 * Each Qt panel answered the same three questions — where the request goes,
 * what it sends, why it cannot go yet — so the screen never needed to know
 * which panel was showing. Here that is one plain object per verb, with no
 * class hierarchy. A seventh verb is one more spec (and its fields), with
 * nothing in the screen to change.
 *
 * Everything on a spec is PURE: no React, no API, no clock. `today` is passed
 * in, and it is the session's working date, never `new Date()` read here — a
 * branch keying yesterday's collections at 1 a.m. is routine.
 *
 * The fields a spec is edited through live beside the dialog
 * (`components/action-fields.tsx`), so these stay testable without a DOM.
 */
import { formatDate } from "../domain/chequeRow";
import { isIsoDate } from "../domain/dates";
import type { ChequeVocabulary } from "../domain/vocabulary";
import type { ChequeDetail, ChequeRow } from "../domain/types";
import type { ChequeVerb } from "../domain/stateMachine";

export type WritingVerb = Exclude<ChequeVerb, "printSlip" | "history">;

export type ActionSpec<F> = {
  id: WritingVerb;
  /** The dialog's title AND its OK button: "Deposit 3 cheques", never "OK". */
  verb: (rows: readonly ChequeRow[], form: F, words: ChequeVocabulary) => string;
  endpoint: string;
  /**
   * The form, fresh EVERY time the dialog opens. A panel that kept last
   * week's deposit date because it had been opened before is how a slip gets
   * back-dated by accident. `detail` is the current row's `/cheques/get`, when
   * it has loaded — a pre-fill, never a requirement.
   */
  initial: (rows: readonly ChequeRow[], today: string, detail?: ChequeDetail | null) => F;
  /** How an edit lands. Defaults to a merge; Clear's bank date overrides it. */
  apply?: (form: F, patch: Partial<F>) => F;
  /** The POST body. */
  build: (rows: readonly ChequeRow[], form: F) => Record<string, unknown>;
  /**
   * Why it cannot go yet, or null. Only what can be checked WITHOUT asking the
   * server — dates, required fields, amounts. Anything that needs the ledger
   * or the bill balances comes back as the server's own sentence.
   */
  validate: (rows: readonly ChequeRow[], form: F, today: string) => string | null;
  /** Names the money and the effect. Asked before the POST. */
  confirm: (rows: readonly ChequeRow[], form: F, words: ChequeVocabulary) => string;
  /** The one line under the fields naming what is acted on. Defaults to the row(s). */
  summary?: (rows: readonly ChequeRow[]) => string;
  /** What the verb does to the books — the OK button's tooltip. */
  hint?: string;
  /** A standing note in the dialog, when the operator must read it before acting. */
  note?: (rows: readonly ChequeRow[], form: F) => string | null;
};

export function applyPatch<F>(spec: ActionSpec<F>, form: F, patch: Partial<F>): F {
  return spec.apply ? spec.apply(form, patch) : { ...form, ...patch };
}

// ─── Shared checks ───────────────────────────────────────────────────────────


/** One cheque, and exactly one — every verb but Deposit. */
export function oneRow(rows: readonly ChequeRow[]): string | null {
  if (rows.length === 0) {
    return "Choose a cheque first.";
  }
  if (rows.length > 1) {
    return "This acts on one cheque at a time — untick the others.";
  }
  return null;
}

/** A date that is set, real, and not after today. */
export function pastDate(label: string, value: string, today: string): string | null {
  if (!value.trim()) {
    return `Enter the ${label}.`;
  }
  if (!isIsoDate(value)) {
    return `The ${label} is not a real date.`;
  }
  if (value > today) {
    return `The ${label} cannot be in the future (${formatDate(value)}).`;
  }
  return null;
}

export function tooLong(label: string, value: string, max: number): string | null {
  return value.trim().length > max ? `The ${label} is longer than ${max} characters.` : null;
}

/** An optional field goes only when filled: `""` on a nullable column is not NULL. */
export function optional(key: string, value: string): Record<string, string> {
  const trimmed = value.trim();
  return trimmed ? { [key]: trimmed } : {};
}

/** A typed amount, or NaN — never silently 0. */
export function parseAmount(value: string): number {
  const text = value.trim().replace(/,/g, "");
  if (!text) {
    return Number.NaN;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function first(errors: readonly (string | null)[]): string | null {
  return errors.find((error): error is string => Boolean(error)) ?? null;
}
