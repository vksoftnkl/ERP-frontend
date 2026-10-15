/**
 * Clock times as the operator reads them: 12-hour with AM / PM.
 *
 * Qt c77f3f1 moved every time of day the desktop shows from `HH:mm` to
 * `hh:mm AP` — `02:05 PM`, the hour zero-padded like the minutes. These are
 * that format for the web, so a screen never builds one by hand.
 *
 * DISPLAY ONLY. A value the server reads, an `<input type="time">` /
 * `datetime-local` value, a sort key or a comparison stays 24-hour ISO: this
 * is the last step before text reaches the screen.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

function instantOf(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** A local time of day as `hh:mm AM` — `00:30` → `12:30 AM`, `14:05` → `02:05 PM`. */
export function formatClock12(at: Date): string {
  const hours = at.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(hour12)}:${pad(at.getMinutes())} ${hours < 12 ? "AM" : "PM"}`;
}

/** `HH:mm` (or `HH:mm:ss`) of a 24-hour wall clock as `hh:mm AM`; anything else as it came. */
export function clock12FromHhmm(text: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec((text ?? "").trim());
  if (!match) return text ?? "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return text ?? "";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(hour12)}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

/** An ISO instant (or a Date) as the local `hh:mm AM`; blank when it is not one. */
export function clock12Of(value: string | Date | null | undefined): string {
  const at = instantOf(value);
  return at ? formatClock12(at) : "";
}

/** An ISO instant (or a Date) as the local `dd-MM-yyyy hh:mm AM`; blank when it is not one. */
export function dateTime12Of(value: string | Date | null | undefined): string {
  const at = instantOf(value);
  if (!at) return "";
  return `${pad(at.getDate())}-${pad(at.getMonth() + 1)}-${at.getFullYear()} ${formatClock12(at)}`;
}

/** An ISO instant (or a Date) as the local `dd-MM hh:mm AM` (no year); blank when it is not one. */
export function dayMonthTime12Of(value: string | Date | null | undefined): string {
  const at = instantOf(value);
  if (!at) return "";
  return `${pad(at.getDate())}-${pad(at.getMonth() + 1)} ${formatClock12(at)}`;
}
