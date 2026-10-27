/**
 * Ageing Slabs (menu 294) — the pure ladder rules of Qt `AgeingSlabEntry`
 * (NexERP d27045b), server notes 159 §3 (`src/modules/stocks/ageing-slabs`).
 *
 * ONE LADDER, saved whole: a company uses the shared default ladder or its
 * own, and its own is replaced as a set. Each slab starts the day after the
 * previous one ends — the From day is worked out, never typed — so a gap or an
 * overlap cannot be keyed at all. What is typed is the label and the To day;
 * the last slab's To is blank (open ended).
 */

export const AGEING_SLAB_MENU_ID = 294;
/** The server's ceiling on a ladder (`AGEING_SLAB_MAX`). */
export const MAX_SLABS = 20;
export const LABEL_MAX_LENGTH = 50;

/** A rung as the server sends and takes it. `toDays` null = open ended. */
export type ServerSlab = { slabNo: number; label: string; fromDays: number; toDays: number | null };

export type AgeingLadder = { usingOwn: boolean; slabs: ServerSlab[] };

/** What the grid holds: the two typed cells. `to` blank = open ended. */
export type SlabRow = { id: number; label: string; to: string };

/** A row with its worked-out From day; `to` null = open ended. */
export type Slab = { label: string; from: number; to: number | null };

let nextRowId = 1;
export function newRowId(): number {
  nextRowId += 1;
  return nextRowId;
}

export function rowsFromLadder(slabs: readonly ServerSlab[]): SlabRow[] {
  return slabs.map((s) => ({
    id: newRowId(),
    label: s.label,
    to: s.toDays === null || s.toDays === undefined ? "" : String(s.toDays),
  }));
}

/** A To cell's text as a day; anything that is not a whole number is "open". */
export function parseTo(text: string): number | null {
  const t = text.trim();
  return /^-?\d+$/.test(t) ? Number.parseInt(t, 10) : null;
}

/** Qt `readTable`: labels and To days off the grid; every From follows the previous To. */
export function slabsOf(rows: readonly SlabRow[]): Slab[] {
  const slabs: Slab[] = [];
  rows.forEach((row, i) => {
    const prev = slabs[i - 1];
    const from = i === 0 ? 0 : prev.to !== null ? prev.to + 1 : prev.from + 1;
    slabs.push({ label: row.label.replace(/\s+/g, " ").trim(), from, to: parseTo(row.to) });
  });
  return slabs;
}

/** "" = the ladder is sound; otherwise the first fault, in the Qt words. */
export function ladderFault(slabs: readonly Slab[]): string {
  if (slabs.length === 0) return "The ladder needs at least one slab.";
  const labels = new Set<string>();
  for (let r = 0; r < slabs.length; r += 1) {
    const s = slabs[r];
    const last = r === slabs.length - 1;
    if (!s.label) return `Slab ${r + 1} has no label.`;
    if (labels.has(s.label.toLowerCase())) return `Two slabs are both called "${s.label}".`;
    labels.add(s.label.toLowerCase());
    if (!last && s.to === null) return `Slab ${r + 1} has no To day — only the last slab may be open ended.`;
    if (s.to !== null && s.to < s.from) return `Slab ${r + 1} ends (day ${s.to}) before it starts (day ${s.from}).`;
  }
  const end = slabs[slabs.length - 1];
  if (end.to !== null) {
    return `The last slab must be open ended — blank its To day, so stock older than day ${end.to} still has a slab.`;
  }
  return "";
}

/** The "Covers" cell. */
export function coversText(slab: Slab, last: boolean): string {
  if (slab.to === null) return last ? "open ended" : "—";
  const days = slab.to - slab.from + 1;
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Qt `addSlab`: a new slab goes before the open-ended last one and takes the
 * 30 days after the slab before it; the last one then starts after it.
 */
export function addSlab(rows: readonly SlabRow[]): { rows: SlabRow[]; at: number } {
  if (rows.length >= MAX_SLABS) return { rows: [...rows], at: Math.max(0, rows.length - 1) };
  const slabs = slabsOf(rows);
  const at = Math.max(0, rows.length - 1);
  const from = at === 0 ? 0 : (slabs[at - 1].to ?? slabs[at - 1].from) + 1;
  const to = from + 29;
  const fresh: SlabRow = { id: newRowId(), label: `${from}-${to} days`, to: String(to) };
  const next = [...rows];
  next.splice(at, 0, fresh);
  return { rows: next, at };
}

/** Qt `removeSlab`: whatever is last afterwards runs open ended. */
export function removeSlab(rows: readonly SlabRow[], index: number): SlabRow[] {
  if (rows.length <= 1) return [...rows];
  const at = index >= 0 && index < rows.length ? index : rows.length - 2;
  const next = rows.filter((_, i) => i !== at);
  next[next.length - 1] = { ...next[next.length - 1], to: "" };
  return next;
}

/** The save body: `slabNo` 1..n, `toDays` null for the open end. */
export function buildSavePayload(companyId: string, slabs: readonly Slab[]) {
  return {
    companyId,
    slabs: slabs.map((s, i) => ({ slabNo: i + 1, label: s.label, fromDays: s.from, toDays: s.to })),
  };
}

export type CoverageBand = { label: string; left: number; width: number; open: boolean };
export type CoverageTick = { day: number; left: number };

/** The ladder on a day axis (Qt `AgeingCoverageBar`), as percentages of the track. */
export function coverageLayout(slabs: readonly Slab[]): { bands: CoverageBand[]; ticks: CoverageTick[] } {
  let maxDay = 30;
  for (const s of slabs) maxDay = Math.max(maxDay, s.to !== null ? s.to : s.from);
  maxDay = Math.floor(maxDay * 1.15) + 1;
  const pct = (day: number) => (day / maxDay) * 100;
  const bands = slabs.map((s) => {
    const left = pct(s.from);
    const right = s.to !== null ? pct(s.to + 1) : 100;
    return { label: s.label, left, width: Math.max(0.4, right - left), open: s.to === null };
  });
  const step = maxDay > 400 ? 90 : maxDay > 150 ? 30 : 15;
  const ticks: CoverageTick[] = [];
  // Keep clear of the "days →" caption at the right edge.
  for (let d = 0; d <= maxDay && pct(d) <= 92; d += step) ticks.push({ day: d, left: pct(d) });
  return { bands, ticks };
}
