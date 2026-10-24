/**
 * The price change log grid as lines — Qt `PriceLogView::fill()` /
 * `rowObject()` / `headerRow()` (inventory/report/pricelog/price_log_view.cpp),
 * as pure functions. Shared by the report and its item-history popup.
 *
 * The rows are kept in the server's order (newest first); a header line opens
 * each day: "Fri 23-10-2026 · 5 changes · 3 items · 2 users". Its counts are
 * `/days`' when that answered for the day, else counted from the rows.
 */
import type { PriceLogDay, PriceLogRow } from "../wire/types";
import { countText, dayText } from "./words";

export type DayLine = {
  kind: "day";
  key: string;
  day: string;
  /** "Fri 23-10-2026". */
  dayLabel: string;
  /** "5 changes · 3 items · 2 users". */
  counts: string;
};

export type ChangeLine = {
  kind: "change";
  key: string;
  day: string;
  row: PriceLogRow;
};

export type GridLine = DayLine | ChangeLine;

/** A day header's counts, in words. */
export function dayCountsText(changes: number, items: number, users: number): string {
  return [
    countText(changes, "change", "changes"),
    countText(items, "item", "items"),
    countText(users, "user", "users"),
  ].join(" · ");
}

/** The header line's whole text (print, tests, the title tooltip). */
export function dayHeaderText(line: DayLine): string {
  return `${line.dayLabel} · ${line.counts}`;
}

/** The rows with a header line opening each day, the rows' order kept. */
export function buildLines(rows: readonly PriceLogRow[], days?: readonly PriceLogDay[] | null): GridLine[] {
  const info = new Map<string, PriceLogDay>();
  for (const day of days ?? []) {
    info.set(day.day, day);
  }
  const counted = new Map<string, { changes: number; items: Set<string>; users: Set<string> }>();
  for (const row of rows) {
    const entry = counted.get(row.day) ?? { changes: 0, items: new Set<string>(), users: new Set<string>() };
    entry.changes += 1;
    entry.items.add(row.itemId ?? "");
    entry.users.add(row.userId ?? "");
    counted.set(row.day, entry);
  }

  const lines: GridLine[] = [];
  let currentDay: string | null = null;
  for (const row of rows) {
    if (row.day !== currentDay) {
      currentDay = row.day;
      const server = info.get(row.day);
      const own = counted.get(row.day);
      const counts = server
        ? dayCountsText(Number(server.changes) || 0, Number(server.items) || 0, Number(server.users) || 0)
        : dayCountsText(own?.changes ?? 0, own?.items.size ?? 0, own?.users.size ?? 0);
      lines.push({ kind: "day", key: `day:${row.day}:${lines.length}`, day: row.day, dayLabel: dayText(row.day), counts });
    }
    lines.push({ kind: "change", key: row.ipclId, day: row.day, row });
  }
  return lines;
}

/** The header line of `day`, -1 when the day has no rows. */
export function dayLineIndex(lines: readonly GridLine[], day: string): number {
  return lines.findIndex((line) => line.kind === "day" && line.day === day);
}

/** The line of the change `ipclId`, -1 when it is not shown. */
export function changeLineIndex(lines: readonly GridLine[], ipclId: string | null | undefined): number {
  if (!ipclId) {
    return -1;
  }
  return lines.findIndex((line) => line.kind === "change" && line.row.ipclId === ipclId);
}

/** The first change line, -1 when there is none. */
export function firstChangeIndex(lines: readonly GridLine[]): number {
  return lines.findIndex((line) => line.kind === "change");
}

/** The last change line, -1 when there is none. */
export function lastChangeIndex(lines: readonly GridLine[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].kind === "change") return i;
  }
  return -1;
}

/**
 * ↑ / ↓ / PgUp / PgDn: `steps` change lines away from `from`, day headers
 * skipped, clamped to the first / last change. From nowhere (-1) it starts at
 * the first change.
 */
export function stepChange(lines: readonly GridLine[], from: number, steps: number): number {
  const first = firstChangeIndex(lines);
  if (first < 0) {
    return -1;
  }
  if (from < 0 || from >= lines.length) {
    return first;
  }
  const direction = steps < 0 ? -1 : 1;
  let remaining = Math.abs(steps);
  let at = from;
  let i = from;
  while (remaining > 0) {
    i += direction;
    if (i < 0 || i >= lines.length) break;
    if (lines[i].kind === "change") {
      at = i;
      remaining -= 1;
    }
  }
  return lines[at]?.kind === "change" ? at : first;
}

/** The first change of `day` (the line after its header), -1 when the day is not shown. */
export function firstChangeOfDay(lines: readonly GridLine[], day: string): number {
  const header = dayLineIndex(lines, day);
  if (header < 0) {
    return -1;
  }
  return lines[header + 1]?.kind === "change" ? header + 1 : -1;
}
