import type { LinkedRecordRow } from "./item-linked-records-editor.shared";
// A price row's factors mirror the Unit Conversion Table row for the unit the
// operator picked (syncItemPriceRowsWithUnitConversions) — any row, including
// the first, may carry a non-base unit, so nothing is forced here any more.
// Forcing row 0 to factor 1 (the old row-0-is-base model) fought that mirror:
// each pass flip-flopped the factor, which the change detector then read as an
// operator factor edit and mis-dispatched every recalculation.
export function normalizeItemPriceRowForEditor(
  row: LinkedRecordRow,
  rowIndex: number,
): LinkedRecordRow {
  void rowIndex;
  return { ...row };
}
export function normalizeItemPriceRowsForRules(
  rows: LinkedRecordRow[],
  preferredDefaultRowIndex: number | null = null,
): LinkedRecordRow[] {
  if (rows.length === 0) {
    return rows;
  }
  const resolvedDefaultRowIndex =
    typeof preferredDefaultRowIndex === "number" &&
    preferredDefaultRowIndex > 0 &&
    preferredDefaultRowIndex < rows.length &&
    (rows[preferredDefaultRowIndex]?.ipm_is_default_unit ?? "false") === "true"
      ? preferredDefaultRowIndex
      : (() => {
          const discoveredDefaultRowIndex = rows.findIndex(
            (row) => (row.ipm_is_default_unit ?? "false") === "true",
          );
          return discoveredDefaultRowIndex >= 0 ? discoveredDefaultRowIndex : null;
        })();
  const resolvedBaseRowIndex = (() => {
    const discoveredBaseRowIndex = rows.findIndex(
      (row) => (row.ipm_is_base_unit ?? "false") === "true",
    );
    return discoveredBaseRowIndex >= 0 ? discoveredBaseRowIndex : null;
  })();
  return rows.map((row, index) => {
    const nextRow = normalizeItemPriceRowForEditor(row, index);
    nextRow.ipm_is_default_unit =
      resolvedDefaultRowIndex !== null && index === resolvedDefaultRowIndex
        ? "true"
        : "false";
    nextRow.ipm_is_base_unit =
      resolvedBaseRowIndex !== null && index === resolvedBaseRowIndex
        ? "true"
        : "false";
    return nextRow;
  });
}