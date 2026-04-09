"use client";
import { Input, Select } from "@/components/library/ui";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import type {
  DeleteDialogState,
  EditableGiftRow,
} from "../promotion-loyalty-points.local-types";

type GiftsTabProps = {
  giftRows: EditableGiftRow[];
  updateGiftRow: (rowKey: string, patch: Partial<EditableGiftRow>) => void;
  addGiftRow: () => void;
  removeGiftRow: (rowKey: string, rowId?: string) => void;
  setDeleteDialog: (dialog: DeleteDialogState) => void;
  itemOptionsForGift: ERPDynamicSelectOption[];
  unitOptionsForGift: ERPDynamicSelectOption[];
};

export function GiftsTab({
  giftRows,
  updateGiftRow,
  addGiftRow,
  removeGiftRow,
  setDeleteDialog,
  itemOptionsForGift,
  unitOptionsForGift,
}: GiftsTabProps) {
  const columns: ReusableTableColumn<EditableGiftRow>[] = [
    {
      key: "serialNo",
      header: "Sl No",
      render: (row) => <div className="px-3 py-2 text-center">{row.lsg_slno}</div>,
      width: "80px",
      align: "center",
    },
    {
      key: "lsg_item_id",
      header: "Item",
      render: (row) => (
        <Select
          value={row.lsg_item_id}
          onChange={(e) => updateGiftRow(row._rowKey, { lsg_item_id: e.target.value })}
        >
          {itemOptionsForGift.map((o) => (
            <option key={o.value || "__gift-item"} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ),
    },
    {
      key: "lsg_unit_id",
      header: "Unit",
      render: (row) => (
        <Select
          value={row.lsg_unit_id}
          onChange={(e) => updateGiftRow(row._rowKey, { lsg_unit_id: e.target.value })}
        >
          {unitOptionsForGift.map((o) => (
            <option key={o.value || "__gift-unit"} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ),
    },
    {
      key: "lsg_item_qty",
      header: "Qty",
      render: (row) => (
        <Input
          type="text"
          inputMode="decimal"
          value={row.lsg_item_qty}
          onChange={(e) => updateGiftRow(row._rowKey, { lsg_item_qty: e.target.value })}
        />
      ),
    },
    {
      key: "lsg_redeem_points",
      header: "Redeem Points",
      render: (row) => (
        <Input
          type="text"
          inputMode="decimal"
          value={row.lsg_redeem_points}
          onChange={(e) => updateGiftRow(row._rowKey, { lsg_redeem_points: e.target.value })}
        />
      ),
    },
    {
      key: "lsg_notes",
      header: "Notes",
      render: (row) => (
        <Input
          value={row.lsg_notes}
          onChange={(e) => updateGiftRow(row._rowKey, { lsg_notes: e.target.value })}
          placeholder="Notes"
        />
      ),
    },
    {
      key: "lsg_repeat",
      header: "Repeat",
      render: (row) => (
        <label className="flex items-center gap-2 min-h-9 whitespace-nowrap">
          <input
            className={dynamicFormStyles.checkboxControl}
            type="checkbox"
            checked={row.lsg_repeat}
            onChange={(e) => updateGiftRow(row._rowKey, { lsg_repeat: e.target.checked })}
          />
          <span className={dynamicFormStyles.checkboxLabel}>
            {row.lsg_repeat ? "Yes" : "No"}
          </span>
        </label>
      ),
    },
    {
      key: "lsg_is_active",
      header: "Active",
      render: (row) => (
        <label className="flex items-center gap-2 min-h-9 whitespace-nowrap">
          <input
            className={dynamicFormStyles.checkboxControl}
            type="checkbox"
            checked={row.lsg_is_active}
            onChange={(e) => updateGiftRow(row._rowKey, { lsg_is_active: e.target.checked })}
          />
          <span className={dynamicFormStyles.checkboxLabel}>
            {row.lsg_is_active ? "Yes" : "No"}
          </span>
        </label>
      ),
    },
  ];

  return (
    <div
      className="grid gap-[18px]"
      id="loyalty-editor-panel-gifts"
      role="tabpanel"
      aria-labelledby="loyalty-editor-tab-gifts"
    >
      <div className="w-full flex-1 min-h-0 overflow-auto">
        <ReusableTable<EditableGiftRow>
          columns={columns}
          rows={giftRows}
          rowKey="_rowKey"
          emptyText="No gift rows. Click Add Gift Row."
          onCreate={addGiftRow}
          createLabel="Add Gift Row"
          onDelete={(row) => {
            if (!row.lsg_id) {
              removeGiftRow(row._rowKey);
              return;
            }
            setDeleteDialog({
              kind: "gift",
              id: row.lsg_id,
              rowKey: row._rowKey,
              label: `Gift Rule ${row.lsg_slno || ""}`.trim(),
            });
          }}
          deleteLabel="Delete"
          tableMaxHeight="400px"
          stickyHeader
          paginated
          pageSize={5}
          defaultPageSize={5}
          pageSizeOptions={[5, 10, 15]}
          totalEntries={giftRows.length}
          showPageSizeSelector
        />
      </div>
    </div>
  );
}