"use client";
import { useEffect, useRef } from "react";
import { Input, SearchableSelect } from "@/components/library/ui";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import type {
  DeleteDialogState,
  EditablePointRow,
  PointScopeDescriptor,
} from "../promotion-loyalty-points.local-types";
import { withFallbackOption } from "../promotion-loyalty-points.utils";
import { handleGridKeyboardNav } from "./promotion-loyalty-keyboard-events";

type PointsTabProps = {
  pointRows: EditablePointRow[];
  updatePointRow: (rowKey: string, patch: Partial<EditablePointRow>) => void;
  onPointScopeChange: (row: EditablePointRow, value: string) => void;
  addPointRow: () => void;
  removePointRow: (rowKey: string, rowId?: string) => void;
  setDeleteDialog: (dialog: DeleteDialogState) => void;
  pointScopeDescriptor: PointScopeDescriptor;
  pointScopeOptionsForPoint: ERPDynamicSelectOption[];
  pointScopeLabelMap: Map<string, string>;
  getUnitOptionsForPointRow: (row: EditablePointRow) => ERPDynamicSelectOption[];
  pointExceedsHeader: string;
  hideScopeColumn: boolean;
  showUnitColumn: boolean;
};

export function PointsTab({
  pointRows,
  updatePointRow,
  onPointScopeChange,
  addPointRow,
  removePointRow,
  setDeleteDialog,
  pointScopeDescriptor,
  pointScopeOptionsForPoint,
  pointScopeLabelMap,
  getUnitOptionsForPointRow,
  pointExceedsHeader,
  hideScopeColumn,
  showUnitColumn,
}: PointsTabProps) {
  const hasAutoAddedDefaultRowRef = useRef(false);

  useEffect(() => {
    if (pointRows.length === 0) {
      if (!hasAutoAddedDefaultRowRef.current) {
        hasAutoAddedDefaultRowRef.current = true;
        addPointRow();
      }
      return;
    }

    hasAutoAddedDefaultRowRef.current = false;
  }, [addPointRow, pointRows.length]);

  const handleScopeChange = (row: EditablePointRow, value: string) => {
    onPointScopeChange(row, value);

    const nextValue = value.trim();
    if (!nextValue || nextValue === row.lspt_item_id.trim()) {
      return;
    }

    const isLastRow = pointRows[pointRows.length - 1]?._rowKey === row._rowKey;
    if (isLastRow) {
      addPointRow();
    }
  };

  const handleUnitChange = (rowKey: string, value: string) => {
    updatePointRow(rowKey, { lspt_unit_id: value });
  };

  const getPointScopeOptionsForRow = (row: EditablePointRow) =>
    withFallbackOption(pointScopeOptionsForPoint, row.lspt_item_id, pointScopeLabelMap);

  const getRowIndex = (rowKey: string) =>
    pointRows.findIndex((entry) => entry._rowKey === rowKey);

  const interactiveColumnKeys = [
    ...(hideScopeColumn ? [] : ["scope"]),
    ...(showUnitColumn ? ["unit"] : []),  // ✅ fixed: was `showUnitColumn ? [] : ["unit"]`
    "exceeds",
    "each",
    "points",
    "active",
  ];

  const getColIndex = (key: string) => interactiveColumnKeys.indexOf(key);
  const maxRow = Math.max(pointRows.length - 1, 0);
  const maxCol = Math.max(interactiveColumnKeys.length - 1, 0);

  const scopeColumns: ReusableTableColumn<EditablePointRow>[] = hideScopeColumn
    ? []
    : [
        {
          key: "lspt_item_id",
          header: pointScopeDescriptor.headerLabel,
          width: "500px",
          render: (row) => {
            const rowIndex = getRowIndex(row._rowKey);
            const scopeOptions = getPointScopeOptionsForRow(row);

            return (
              <div
                data-kb-group="points"
                data-kb-row={rowIndex}
                data-kb-col={getColIndex("scope")}
                onKeyDown={(e) =>
                  handleGridKeyboardNav(e, {
                    group: "points",
                    row: rowIndex,
                    col: getColIndex("scope"),
                    maxRow,
                    maxCol,
                  })
                }
              >
                <SearchableSelect
                  value={row.lspt_item_id}
                  options={scopeOptions}
                  onChange={(value) => handleScopeChange(row, value)}
                  searchPlaceholder={`Search ${pointScopeDescriptor.headerLabel.toLowerCase()}`}
                />
              </div>
            );
          },
        },
      ];

  const unitColumn: ReusableTableColumn<EditablePointRow>[] = showUnitColumn
    ? [
        {
          key: "lspt_unit_id",
          header: "Unit",
          width: "120px",
          render: (row) => {
            const rowIndex = getRowIndex(row._rowKey);
            const unitOptions = getUnitOptionsForPointRow(row);

            return (
              <div
                data-kb-group="points"
                data-kb-row={rowIndex}
                data-kb-col={getColIndex("unit")}
                onKeyDown={(e) =>
                  handleGridKeyboardNav(e, {
                    group: "points",
                    row: rowIndex,
                    col: getColIndex("unit"),
                    maxRow,
                    maxCol,
                  })
                }
              >
                <SearchableSelect
                  value={row.lspt_unit_id}
                  options={unitOptions}
                  onChange={(value) => handleUnitChange(row._rowKey, value)}
                  disabled={!row.lspt_item_id.trim()}
                  searchPlaceholder="Search unit"
                />
              </div>
            );
          },
        },
      ]
    : [];

  const columns: ReusableTableColumn<EditablePointRow>[] = [
    {
  key: "actions",
  header: "",
  width: "10px",   // ✅ was "10px"
  align: "center",
},
{
  key: "serialNo",
  header: "Sl No",
  width: "15px",   // ✅ was "10px"
  render: (row) => <div className="px-3 py-2 text-center">{row.lspt_slno}</div>,
  align: "center",
},
    ...scopeColumns,
    ...unitColumn,
    {
      key: "lspt_exceeds",
      header: pointExceedsHeader,
      width: "500px",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="points"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("exceeds")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "points",
                row: rowIndex,
                col: getColIndex("exceeds"),
                maxRow,
                maxCol,
              })
            }
          >
            <Input
              className={dynamicFormStyles.control}
              type="text"
              inputMode="decimal"
              value={row.lspt_exceeds}
              onChange={(e) => updatePointRow(row._rowKey, { lspt_exceeds: e.target.value })}
            />
          </div>
        );
      },
    },
    {
      key: "lspt_each",
      header: "Each",
      width: "500px",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="points"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("each")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "points",
                row: rowIndex,
                col: getColIndex("each"),
                maxRow,
                maxCol,
              })
            }
          >
            <Input
              className={dynamicFormStyles.control}
              type="text"
              inputMode="decimal"
              value={row.lspt_each}
              onChange={(e) => updatePointRow(row._rowKey, { lspt_each: e.target.value })}
            />
          </div>
        );
      },
    },
    {
      key: "lspt_points",
      header: "Points",
      width: "100px",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="points"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("points")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "points",
                row: rowIndex,
                col: getColIndex("points"),
                maxRow,
                maxCol,
              })
            }
          >
            <Input
              className={dynamicFormStyles.control}
              type="text"
              inputMode="decimal"
              value={row.lspt_points}
              onChange={(e) => updatePointRow(row._rowKey, { lspt_points: e.target.value })}
            />
          </div>
        );
      },
    },
    {
      key: "lspt_is_active",
      header: "Active",
      width: "80px",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="points"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("active")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "points",
                row: rowIndex,
                col: getColIndex("active"),
                maxRow,
                maxCol,
              })
            }
          >
            <label className="flex items-center gap-2 min-h-9 whitespace-nowrap">
              <input
                className={dynamicFormStyles.checkboxControl}
                type="checkbox"
                checked={row.lspt_is_active}
                onChange={(e) => updatePointRow(row._rowKey, { lspt_is_active: e.target.checked })}
              />
              <span className={dynamicFormStyles.checkboxLabel}>
                {row.lspt_is_active ? "Yes" : "No"}
              </span>
            </label>
          </div>
        );
      },
    },
  ];

  return (
    <div
      className="grid gap-[18px]"
      id="loyalty-editor-panel-points"
      role="tabpanel"
      aria-labelledby="loyalty-editor-tab-points"
    >
      <div className="w-full">
        <ReusableTable<EditablePointRow>
          columns={columns}
          rows={pointRows}
          rowKey="_rowKey"
          emptyText="No point rows. Click Add Point Row."
          onDelete={(row) => {
            if (!row.lspt_id) {
              removePointRow(row._rowKey);
              return;
            }

            setDeleteDialog({
              kind: "point",
              id: row.lspt_id,
              rowKey: row._rowKey,
              label: `Point Rule ${row.lspt_slno || ""}`.trim(),
            });
          }}
          deleteLabel="Delete"
          fullViewHeight={false}
          tableMaxHeight="none"
          stickyHeader
          showPageSizeSelector
        />
      </div>
    </div>
  );
}