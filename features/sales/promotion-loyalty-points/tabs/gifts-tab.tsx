"use client";
import { useEffect, useRef } from "react";
import { Input, SearchableSelect } from "@/components/library/ui";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import type {
  DeleteDialogState,
  EditableGiftRow,
} from "../promotion-loyalty-points.local-types";
import { handleGridKeyboardNav } from "./promotion-loyalty-keyboard-events";

type GiftsTabProps = {
  giftRows: EditableGiftRow[];
  updateGiftRow: (rowKey: string, patch: Partial<EditableGiftRow>) => void;
  onItemChange: (row: EditableGiftRow, value: string) => void;
  addGiftRow: () => void;
  removeGiftRow: (rowKey: string, rowId?: string) => void;
  setDeleteDialog: (dialog: DeleteDialogState) => void;
  itemOptionsForGift: ERPDynamicSelectOption[];
  getUnitOptionsForGiftRow: (row: EditableGiftRow) => ERPDynamicSelectOption[];
};

export function GiftsTab({
  giftRows,
  updateGiftRow,
  onItemChange,
  addGiftRow,
  removeGiftRow,
  setDeleteDialog,
  itemOptionsForGift,
  getUnitOptionsForGiftRow,
}: GiftsTabProps) {
  const hasAutoAddedDefaultRowRef = useRef(false);

  useEffect(() => {
    if (giftRows.length === 0) {
      if (!hasAutoAddedDefaultRowRef.current) {
        hasAutoAddedDefaultRowRef.current = true;
        addGiftRow();
      }
      return;
    }

    hasAutoAddedDefaultRowRef.current = false;
  }, [addGiftRow, giftRows.length]);

  const handleItemChange = (row: EditableGiftRow, value: string) => {
    onItemChange(row, value);

    const nextValue = value.trim();
    if (!nextValue || nextValue === row.lsg_item_id.trim()) {
      return;
    }

    const isLastRow = giftRows[giftRows.length - 1]?._rowKey === row._rowKey;
    if (isLastRow) {
      addGiftRow();
    }
  };

  const isUnitRequiredInvalid = (row: EditableGiftRow) =>
    Boolean(row.lsg_item_id.trim() && !row.lsg_unit_id.trim());

  const isQtyRequiredInvalid = (row: EditableGiftRow) => {
    if (!row.lsg_item_id.trim()) {
      return false;
    }

    const qtyValue = row.lsg_item_qty.trim();
    if (!qtyValue) {
      return true;
    }

    const qtyNumber = Number(qtyValue);
    return !Number.isFinite(qtyNumber) || qtyNumber <= 0;
  };

  const getRowIndex = (rowKey: string) =>
    giftRows.findIndex((entry) => entry._rowKey === rowKey);

  const getColIndex = (key: "item" | "unit" | "qty" | "redeemPoints" | "repeat" | "active") =>
    ["item", "unit", "qty", "redeemPoints", "repeat", "active"].indexOf(key);

  const maxRow = Math.max(giftRows.length - 1, 0);
  const maxCol = 5;

  const columns: ReusableTableColumn<EditableGiftRow>[] = [
    {
      key: "actions",
      header: "",
      width: "10px",
      align: "center",
    },
    {
      key: "serialNo",
      header: "Sl No",
      render: (row) => <div className="px-3 py-2 text-center">{row.lsg_slno}</div>,
      width: "10px",
      align: "center",
    },
    {
      key: "lsg_item_id",
      header: "Item",
      width: "300px",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="gifts"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("item")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "gifts",
                row: rowIndex,
                col: getColIndex("item"),
                maxRow,
                maxCol,
              })
            }
          >
            <SearchableSelect
              value={row.lsg_item_id}
              options={itemOptionsForGift}
              onChange={(value) => handleItemChange(row, value)}
              searchPlaceholder="Search item"
            />
          </div>
        );
      },
    },
    {
      key: "lsg_unit_id",
      header: (
        <span>
          Unit <span className="text-red-500">*</span>
        </span>
      ),
      width: "220px",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);
        const unitOptions = getUnitOptionsForGiftRow(row);

        return (
          <div
            data-kb-group="gifts"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("unit")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "gifts",
                row: rowIndex,
                col: getColIndex("unit"),
                maxRow,
                maxCol,
              })
            }
          >
            <SearchableSelect
              value={row.lsg_unit_id}
              options={unitOptions}
              onChange={(value) => updateGiftRow(row._rowKey, { lsg_unit_id: value })}
              disabled={!row.lsg_item_id.trim()}
              invalid={isUnitRequiredInvalid(row)}
              searchPlaceholder="Search unit"
            />
          </div>
        );
      },
    },
    {
      key: "lsg_item_qty",
      header: (
        <span>
          Qty <span className="text-red-500">*</span>
        </span>
      ),
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="gifts"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("qty")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "gifts",
                row: rowIndex,
                col: getColIndex("qty"),
                maxRow,
                maxCol,
              })
            }
          >
            <Input
              className={`${dynamicFormStyles.control} ${
                isQtyRequiredInvalid(row) ? dynamicFormStyles.controlInvalid : ""
              }`}
              type="text"
              inputMode="decimal"
              value={row.lsg_item_qty}
              aria-invalid={isQtyRequiredInvalid(row) ? true : undefined}
              onChange={(e) => updateGiftRow(row._rowKey, { lsg_item_qty: e.target.value })}
            />
          </div>
        );
      },
    },
    {
      key: "lsg_redeem_points",
      header: "Redeem Points",
      width: "80px",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="gifts"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("redeemPoints")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "gifts",
                row: rowIndex,
                col: getColIndex("redeemPoints"),
                maxRow,
                maxCol,
              })
            }
          >
            <Input
              className={dynamicFormStyles.control}
              type="text"
              inputMode="decimal"
              value={row.lsg_redeem_points}
              onChange={(e) => updateGiftRow(row._rowKey, { lsg_redeem_points: e.target.value })}
            />
          </div>
        );
      },
    },
    {
      key: "lsg_repeat",
      header: "Repeat",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="gifts"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("repeat")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "gifts",
                row: rowIndex,
                col: getColIndex("repeat"),
                maxRow,
                maxCol,
              })
            }
          >
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
          </div>
        );
      },
    },
    {
      key: "lsg_is_active",
      header: "Active",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            data-kb-group="gifts"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("active")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "gifts",
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
                checked={row.lsg_is_active}
                onChange={(e) => updateGiftRow(row._rowKey, { lsg_is_active: e.target.checked })}
              />
              <span className={dynamicFormStyles.checkboxLabel}>
                {row.lsg_is_active ? "Yes" : "No"}
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
      id="loyalty-editor-panel-gifts"
      role="tabpanel"
      aria-labelledby="loyalty-editor-tab-gifts"
    >
      <div className="w-full flex-1 min-h-0">
        <ReusableTable<EditableGiftRow>
          columns={columns}
          rows={giftRows}
          rowKey="_rowKey"
          emptyText="No gift rows. Click Add Gift Row."
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
          fullViewHeight={false}
          tableMaxHeight="none"
          stickyHeader
        />
      </div>
    </div>
  );
}