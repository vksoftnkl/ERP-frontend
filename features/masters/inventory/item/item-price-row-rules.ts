import type { LinkedRecordRow } from "./item-linked-records-editor.shared";
export function normalizeItemPriceRowForEditor(
  row: LinkedRecordRow,
  rowIndex: number,
  baseUnitId: string,
): LinkedRecordRow {
  const normalizedBaseUnitId = baseUnitId.trim();
  const nextRow: LinkedRecordRow = {
    ...row,
  };
  if (rowIndex === 0) {
    nextRow.ipm_to_base_factor = "1";
    nextRow.ipm_unit_factor = "1";
    if (normalizedBaseUnitId) {
      nextRow.ipm_unit_id = normalizedBaseUnitId;
    }
  }
  return nextRow;
}
export function normalizeItemPriceRowsForRules(
  rows: LinkedRecordRow[],
  baseUnitId: string,
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
    const nextRow = normalizeItemPriceRowForEditor(row, index, baseUnitId);
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
