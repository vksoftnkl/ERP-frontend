/**
 * The theme list — grid "MAIN LIST - APP THEMES" (125) through
 * `/configured-grid-sql/run`. The server has no `/app-themes/list`; the grid
 * is the list, deleted themes included (its SQL has no deleted filter), so the
 * "Show deleted" box filters here.
 */

export type ThemeListRow = {
  thmId: number;
  name: string;
  base: string;
  isDefault: boolean;
  isActive: boolean;
  isDeleted: boolean;
  usedBy: number;
  remarks: string;
};

/** Grid values arrive as SQL text as often as JSON: `t`, `"true"`, `"1"`, `"3"`. */
export function gridBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "t" || text === "1";
}

export function gridInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function gridText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function normaliseThemeRows(items: ReadonlyArray<Record<string, unknown>> | undefined): ThemeListRow[] {
  return (items ?? [])
    .map((row) => ({
      thmId: gridInt(row.thm_id),
      name: gridText(row.thm_name),
      base: gridText(row.thm_base),
      isDefault: gridBool(row.thm_is_default),
      isActive: gridBool(row.thm_is_active),
      isDeleted: gridBool(row.thm_is_deleted),
      usedBy: gridInt(row.thm_used_by),
      remarks: gridText(row.thm_remarks),
    }))
    .filter((row) => row.thmId > 0);
}

export function filterThemeRows(
  rows: readonly ThemeListRow[],
  search: string,
  showDeleted: boolean,
): ThemeListRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter(
    (row) => (showDeleted || !row.isDeleted) && (!needle || row.name.toLowerCase().includes(needle)),
  );
}

/**
 * Which theme the screen opens on: the company's own (from /effective) when
 * the list has it, else the default, else the first.
 */
export function initialThemeId(rows: readonly ThemeListRow[], effectiveId: number | null): number {
  if (effectiveId && rows.some((row) => row.thmId === effectiveId)) return effectiveId;
  return rows.find((row) => row.isDefault)?.thmId ?? rows[0]?.thmId ?? 0;
}
