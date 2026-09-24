/**
 * Dates: ISO `YYYY-MM-DD` on the wire, `dd-MM-yyyy` on screen.
 *
 * The Qt screen needed this pair because `NexTable` stored cell text verbatim,
 * so a typed "31-03-2026" would have reached `abl_doc_date` as that literal
 * string. Here the grids use real `<input type="date">`, which speaks ISO
 * natively — so the wire helpers are trivial and `toDisplayDate` exists only
 * for the read-only captions (the tie band, a confirmation, an error message).
 *
 * What does port is the rule underneath: a date the operator entered that
 * cannot be parsed is reported BY NAME. It is never dropped silently.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today, as the value a `<input type="date">` holds. */
export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * A wire date as the date input's value. Anything that is not an ISO date —
 * including the full timestamps a JSON column can hand back — is narrowed to
 * its date part, and anything else becomes empty rather than a broken input.
 */
export function toDateInput(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "";
  }
  const head = text.slice(0, 10);
  return ISO_DATE.test(head) && isRealDate(head) ? head : "";
}

/** Whether an ISO date names a day that exists (2026-02-31 does not). */
export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** `2026-01-12` → `12-01-2026`. Empty stays empty. */
export function toDisplayDate(value: string | null | undefined): string {
  const iso = toDateInput(value);
  if (!iso) {
    return "";
  }
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

/** A date input's value on the wire, or `null` for an unset optional date. */
export function toWireDate(value: string | null | undefined): string | null {
  const iso = toDateInput(value);
  return iso === "" ? null : iso;
}

/** Calendar comparison, for "due before invoice". Empty compares as unknown. */
export function isBefore(left: string, right: string): boolean {
  const a = toDateInput(left);
  const b = toDateInput(right);
  return a !== "" && b !== "" && a < b;
}
