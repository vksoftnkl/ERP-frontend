/**
 * Times on this screen are India's, whatever clock the browser runs on.
 *
 * The settlement routes send instants as UTC (`toISOString()`), the grids as
 * IST text with its offset (`2026-10-09T15:10:00+05:30`, server notes 99 §3).
 * Both are read to an instant and shown on the IST wall clock here — never
 * through `Date#getHours`, which is the browser's zone. Date-only values
 * (`2026-10-08`) are calendar days and are only re-ordered for display.
 */
import { clock12FromHhmm } from "@/lib/time-format";

const IST_OFFSET_MS = 330 * 60_000;

const STAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The instant a timestamp names, in ms; a stamp with no zone is read as IST. */
export function instantMs(value: string | null | undefined): number | null {
  const text = (value ?? "").trim();
  const match = STAMP.exec(text);
  if (!match) return null;
  const [, y, mo, d, hh, mi, ss = "0", zone] = match;
  const wall = Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss);
  if (!Number.isFinite(wall)) return null;
  if (!zone) return wall - IST_OFFSET_MS;
  if (zone.toUpperCase() === "Z") return wall;
  const sign = zone[0] === "-" ? -1 : 1;
  const digits = zone.slice(1).replace(":", "");
  const offset = (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60_000;
  return wall - sign * offset;
}

type IstParts = { y: number; m: number; d: number; hh: number; mi: number };

function istParts(value: string | null | undefined): IstParts | null {
  const ms = instantMs(value);
  if (ms === null) return null;
  const at = new Date(ms + IST_OFFSET_MS);
  return {
    y: at.getUTCFullYear(),
    m: at.getUTCMonth() + 1,
    d: at.getUTCDate(),
    hh: at.getUTCHours(),
    mi: at.getUTCMinutes(),
  };
}

/** Qt `clock()`: the time of day, "hh:mm AM" — blank when there is no time. */
export function istClock(value: string | null | undefined): string {
  const p = istParts(value);
  return p ? clock12FromHhmm(`${pad(p.hh)}:${pad(p.mi)}`) : "";
}

/** "dd-MM-yyyy hh:mm AM" on the IST clock. */
export function istDateTime(value: string | null | undefined): string {
  const p = istParts(value);
  return p ? `${pad(p.d)}-${pad(p.m)}-${p.y} ${clock12FromHhmm(`${pad(p.hh)}:${pad(p.mi)}`)}` : "";
}

/**
 * Qt `shortDate()`: a calendar day "dd-MM-yyyy". A full timestamp is read for
 * its IST day; anything unreadable is shown as sent.
 */
export function shortDate(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (STAMP.test(text)) {
    const p = istParts(text);
    return p ? `${pad(p.d)}-${pad(p.m)}-${p.y}` : text;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.slice(0, 10));
  return day ? `${day[3]}-${day[2]}-${day[1]}` : text;
}

/** Today's IST calendar day, "YYYY-MM-DD". */
export function istToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** A calendar day moved by `days` ("YYYY-MM-DD" in and out). */
export function addDays(isoDay: string, days: number): string {
  const at = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return isoDay;
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
