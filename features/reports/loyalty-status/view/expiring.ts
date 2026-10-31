/**
 * Tab 2 — expiring lots, their tiles, the note and the expiry calendar
 * (Qt `fillExpiring()`, `applyWeekFilter()`, `fillCalendar()` and the
 * delegate's Expiring branch).
 *
 * A click on a calendar bar narrows the grid to that week (client-side, over
 * the rows already in); a second click on it shows every week again. A new
 * load clears the week.
 */
import { addIsoDays, daysBetween, withinDaysOf } from "../query/params";
import { blank, plain, type Cell, type Column, type Tone } from "./cells";
import { dayMonth, money, num, pts, showDate, txt } from "./format";
import { totalLabel, type Tile } from "./members";
import type { CalendarWeek, ExpiringItem, ExpiringSummary } from "../wire/types";

/** Expires · Left · Customer · Card no · Mobile · Scheme · Expiring · Value ₹ · Balance · After · Last visit */
export const EXPIRING_COLUMNS: Column[] = [
  { title: "Expires", min: 6.4 },
  { title: "Left", min: 5.6 },
  { title: "Customer", min: 11, fr: 2 },
  { title: "Card no", min: 6.7 },
  { title: "Mobile", min: 7.3 },
  { title: "Scheme", min: 9, fr: 1.2 },
  { title: "Expiring", min: 6, num: true },
  { title: "Value ₹", min: 6, num: true },
  { title: "Balance", min: 6, num: true },
  { title: "After", min: 5.6, num: true },
  { title: "Last visit", min: 6.4 },
];

/** The Left chip: red ≤ 7 days, amber ≤ 15, grey after. */
export function daysLeftCell(daysLeft: number): Cell {
  const n = Math.trunc(daysLeft);
  const tone: Tone = n <= 7 ? "red" : n <= 15 ? "amber" : "grey";
  return { text: n === 1 ? "1 DAY" : `${n} DAYS`, chip: tone };
}

export function expiringCells(o: ExpiringItem): Cell[] {
  const dim = txt(o.status) !== "ACTIVE";
  const ink: Tone | null = dim ? "grey" : null;
  const after = num(o.balanceAfter);
  return [
    plain(showDate(o.expiresOn), { tone: ink }),
    daysLeftCell(num(o.daysLeft)),
    plain(txt(o.customerName), { tone: ink }),
    plain(txt(o.cardNo), { tone: ink }),
    plain(txt(o.mobile) || "—", { tone: ink }),
    plain(txt(o.schemeName), { tone: ink }),
    plain(pts(o.points), { tone: dim ? "grey" : "amber", bold: true }),
    plain(money(o.value), { tone: ink }),
    plain(pts(o.balance), { tone: ink }),
    after === 0 ? plain(pts(after), { tone: "red", bold: true }) : plain(pts(after), { tone: ink }),
    plain(showDate(o.lastActivityOn), { tone: ink }),
  ];
}

/** The rows of the clicked week (Monday … Sunday), or all of them. */
export function rowsOfWeek(items: readonly ExpiringItem[], weekStart: string | null): ExpiringItem[] {
  if (!weekStart) return [...items];
  const to = addIsoDays(weekStart, 6);
  return items.filter((o) => {
    const day = txt(o.expiresOn).slice(0, 10);
    return day >= weekStart && day <= to;
  });
}

export function expiringTotals(loaded: number, summary: ExpiringSummary | null, total: number): Cell[] {
  const cells: Cell[] = EXPIRING_COLUMNS.map(() => blank);
  cells[2] = plain(totalLabel(loaded, total));
  cells[6] = plain(pts(summary?.points));
  cells[7] = plain(money(summary?.valueAtRisk));
  return cells;
}

/** The three bucket tiles and Value at risk — the buckets shrink with "within N days". */
export function expiringTiles(summary: ExpiringSummary | null): Tile[] {
  const buckets = summary?.buckets ?? [];
  const tones: Array<Tone | null> = ["red", "amber", null];
  const fallbacks = ["EXPIRING ≤ 7 DAYS", "8 – 15 DAYS", "16 – 30 DAYS"];
  const tiles: Tile[] = [0, 1, 2].map((i) => {
    const b = buckets[i];
    if (!summary) return { id: `bucket${i}`, caption: fallbacks[i], value: "—", sub: "", tone: tones[i] };
    const caption = !b || !txt(b.label)
      ? "—"
      : i === 0
        ? `EXPIRING ≤ ${Math.trunc(num(b.toDay))} DAYS`
        : `${Math.trunc(num(b.fromDay))} – ${Math.trunc(num(b.toDay))} DAYS`;
    return { id: `bucket${i}`, caption, value: pts(b?.points), sub: `${pts(b?.members)} members`, tone: tones[i] };
  });
  tiles.push({
    id: "value",
    caption: "VALUE AT RISK",
    value: summary ? `₹ ${money(summary.valueAtRisk)}` : "—",
    sub: summary ? `${pts(summary.points)} pts · ${pts(summary.members)} members` : "",
    tone: "brand",
  });
  return tiles;
}

export const EXPIRING_LEGEND =
  "Soonest first.  Enter opens the member on the Members tab.  SMS reminders come with the SMS module (later).";

export function expiringNote(count: number, weekStart: string | null): string {
  if (weekStart) return `Week of ${showDate(weekStart)} only — click the bar again to show every week.`;
  return count === 0 ? "Nothing lapses in this window." : EXPIRING_LEGEND;
}

/* ------------------------------------------------------------ calendar */

export type BarTone = "red" | "amber" | "brand" | "faint" | "off" | "green" | "blue" | "grey";

export type Bar = { label: string; values: number[]; tones: BarTone[]; title: string };

/**
 * One bar a week: red when it starts within 7 days, amber within 15, the
 * brand colour inside "expiring within", faint after; the other weeks grey
 * out while one is picked.
 */
export function calendarBars(
  weeks: readonly CalendarWeek[],
  today: string,
  withinDaysText: string,
  picked: number,
): Bar[] {
  const within = withinDaysOf(withinDaysText);
  return weeks.map((w, i) => {
    const start = txt(w.weekStart);
    const d = daysBetween(today, start);
    let tone: BarTone = d <= 7 ? "red" : d <= 15 ? "amber" : d <= within ? "brand" : "faint";
    if (picked >= 0 && i !== picked) tone = "off";
    const points = num(w.points);
    return {
      label: dayMonth(start),
      values: [points],
      tones: [tone],
      title: `Week of ${showDate(start)}: ${pts(points)} pts · ${pts(w.members)} members`,
    };
  });
}
