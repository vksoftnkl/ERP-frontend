"use client";
import { Input, Select } from "@/components/library/ui";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import type {
  DeleteDialogState,
  EditablePointRow,
  PointScopeDescriptor,
} from "../promotion-loyalty-points.local-types";
import { withFallbackOption } from "../promotion-loyalty-points.utils";

type PointsTabProps = {
  pointRows: EditablePointRow[];
  updatePointRow: (rowKey: string, patch: Partial<EditablePointRow>) => void;
  addPointRow: () => void;
  removePointRow: (rowKey: string, rowId?: string) => void;
  setDeleteDialog: (dialog: DeleteDialogState) => void;
  pointScopeDescriptor: PointScopeDescriptor;
  pointScopeOptionsForPoint: ERPDynamicSelectOption[];
  pointScopeLabelMap: Map<string, string>;
  unitOptionsForPoint: ERPDynamicSelectOption[];
  pointExceedsHeader: string;
};

export function PointsTab({
  pointRows,
  updatePointRow,
  addPointRow,
  removePointRow,
  setDeleteDialog,
  pointScopeDescriptor,
  pointScopeOptionsForPoint,
  pointScopeLabelMap,
  unitOptionsForPoint,
  pointExceedsHeader,
}: PointsTabProps) {
  const getPointScopeOptionsForRow = (row: EditablePointRow) =>
    withFallbackOption(pointScopeOptionsForPoint, row.lspt_item_id, pointScopeLabelMap);

  const columns: ReusableTableColumn<EditablePointRow>[] = [
    {
      key: "serialNo",
      header: "Sl No",
      render: (row) => <div className="px-3 py-2 text-center">{row.lspt_slno}</div>,
      width: "80px",
      align: "center",
    },
    {
      key: "lspt_item_id",
      header: pointScopeDescriptor.headerLabel,
      render: (row) => {
        const scopeOptions = getPointScopeOptionsForRow(row);
        return (
          <Select
            value={row.lspt_item_id}
            onChange={(e) => updatePointRow(row._rowKey, { lspt_item_id: e.target.value })}
          >
            {scopeOptions.map((o) => (
              <option key={o.value || "__point-scope-all"} value={o.value}>{o.label}</option>
            ))}
          </Select>
        );
      },
    },
    {
      key: "lspt_unit_id",
      header: "Unit",
      render: (row) => (
        <Select
          value={row.lspt_unit_id}
          onChange={(e) => updatePointRow(row._rowKey, { lspt_unit_id: e.target.value })}
        >
          {unitOptionsForPoint.map((o) => (
            <option key={o.value || "__any-unit"} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ),
    },
    {
      key: "lspt_exceeds",
      header: pointExceedsHeader,
      render: (row) => (
        <Input
          type="text"
          inputMode="decimal"
          value={row.lspt_exceeds}
          onChange={(e) => updatePointRow(row._rowKey, { lspt_exceeds: e.target.value })}
        />
      ),
    },
    {
      key: "lspt_each",
      header: "Each",
      render: (row) => (
        <Input
          type="text"
          inputMode="decimal"
          value={row.lspt_each}
          onChange={(e) => updatePointRow(row._rowKey, { lspt_each: e.target.value })}
        />
      ),
    },
    {
      key: "lspt_factor",
      header: "Factor",
      render: (row) => (
        <Input
          type="text"
          inputMode="decimal"
          value={row.lspt_factor}
          onChange={(e) => updatePointRow(row._rowKey, { lspt_factor: e.target.value })}
        />
      ),
    },
    {
      key: "lspt_points",
      header: "Points",
      render: (row) => (
        <Input
          type="text"
          inputMode="decimal"
          value={row.lspt_points}
          onChange={(e) => updatePointRow(row._rowKey, { lspt_points: e.target.value })}
        />
      ),
    },
    {
      key: "lspt_notes",
      header: "Notes",
      render: (row) => (
        <Input
          value={row.lspt_notes}
          onChange={(e) => updatePointRow(row._rowKey, { lspt_notes: e.target.value })}
          placeholder="Notes"
        />
      ),
    },
    {
      key: "lspt_is_active",
      header: "Active",
      render: (row) => (
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
      ),
    },
  ];

  return (
    <div
      className="grid gap-[18px]"
      id="loyalty-editor-panel-points"
      role="tabpanel"
      aria-labelledby="loyalty-editor-tab-points"
    >
      <div className="w-full flex-1 min-h-0 overflow-auto">
        <ReusableTable<EditablePointRow>
          columns={columns}
          rows={pointRows}
          rowKey="_rowKey"
          emptyText="No point rows. Click Add Point Row."
          onCreate={addPointRow}
          createLabel="Add Point Row"
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
          tableMaxHeight="400px"
          stickyHeader
          paginated
          pageSize={5}
          defaultPageSize={5}
          pageSizeOptions={[5, 10, 15]}
          totalEntries={pointRows.length}
          showPageSizeSelector
        />
      </div>
    </div>
  );
}