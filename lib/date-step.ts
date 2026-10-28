/**
 * ↑ / ↓ in a date box: the next / previous day (Qt NexDateEdit, 4ae6575). An
 * empty or unreadable box starts from today. A step is the operator editing
 * the date, so the box reports it as a change like typing would.
 *
 * For the TEXT date boxes (`dd/mm/yyyy`: the shared design-system `DateInput`,
 * the quotation `DateField`, the expense `DateInput`), where the arrows
 * otherwise do nothing.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type StepKeyEvent = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/** +1 for a bare ↑, −1 for a bare ↓, 0 for anything else. */
export function dateStepOf(event: StepKeyEvent): -1 | 0 | 1 {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return 0;
  }
  if (event.key === "ArrowUp") {
    return 1;
  }
  if (event.key === "ArrowDown") {
    return -1;
  }
  return 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `iso` moved by `days` (`yyyy-mm-dd`, across months and years); today's local
 * date when `iso` is empty or not a real date.
 */
export function stepIsoDate(
  iso: string | null | undefined,
  days: number,
  today: Date = new Date(),
): string {
  const match = ISO_DATE.exec((iso ?? "").trim());
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const base = new Date(Date.UTC(year, month - 1, day));
    // A real date only: 2026-02-30 rolls over in Date.UTC and must not count.
    if (
      base.getUTCFullYear() === year &&
      base.getUTCMonth() === month - 1 &&
      base.getUTCDate() === day
    ) {
      base.setUTCDate(base.getUTCDate() + days);
      return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
    }
  }
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
