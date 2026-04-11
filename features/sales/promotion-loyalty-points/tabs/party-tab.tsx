"use client";
import { useEffect, useRef } from "react";
import { SearchableSelect } from "@/components/library/ui";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import type {
  DeleteDialogState,
  EditablePartyRow,
  PartyScopeType,
} from "../promotion-loyalty-points.local-types";
import { isUuid, withFallbackOption } from "../promotion-loyalty-points.utils";
import { handleGridKeyboardNav } from "./promotion-loyalty-keyboard-events";

type PartyTabProps = {
  partyRows: EditablePartyRow[];
  updatePartyRow: (rowKey: string, patch: Partial<EditablePartyRow>) => void;
  addPartyRow: () => void;
  removePartyRow: (rowKey: string) => void;
  setDeleteDialog: (dialog: DeleteDialogState) => void;
  partyScopeColumnHeader: string;
  schemePartyScopeType: PartyScopeType | null;
  customerOptionsForParty: ERPDynamicSelectOption[];
  customerGroupOptionsForParty: ERPDynamicSelectOption[];
  customerLabelMap: Map<string, string>;
  customerGroupLabelMap: Map<string, string>;
};

export function PartyTab({
  partyRows,
  updatePartyRow,
  addPartyRow,
  removePartyRow,
  setDeleteDialog,
  partyScopeColumnHeader,
  schemePartyScopeType,
  customerOptionsForParty,
  customerGroupOptionsForParty,
  customerLabelMap,
  customerGroupLabelMap,
}: PartyTabProps) {
  const hasAutoAddedDefaultRowRef = useRef(false);

  useEffect(() => {
    if (partyRows.length === 0) {
      if (!hasAutoAddedDefaultRowRef.current) {
        hasAutoAddedDefaultRowRef.current = true;
        addPartyRow();
      }
      return;
    }

    hasAutoAddedDefaultRowRef.current = false;
  }, [addPartyRow, partyRows.length]);

  const getEffectiveScopeType = (row: EditablePartyRow): PartyScopeType | null => {
    if (schemePartyScopeType) return schemePartyScopeType;
    const t = row.lps_scope_type;
    return t === "CUSTOMER_GROUP" || t === "CUSTOMER" ? t : null;
  };

  const getScopeOptions = (row: EditablePartyRow): ERPDynamicSelectOption[] => {
    const effectiveType = getEffectiveScopeType(row);
    const base =
      effectiveType === "CUSTOMER_GROUP"
        ? customerGroupOptionsForParty
        : effectiveType === "CUSTOMER"
          ? customerOptionsForParty
          : [{ value: "", label: "Select customer scope in Scheme tab" }];

    if (!isUuid(row.lps_scope_id)) return base;

    return withFallbackOption(
      base,
      row.lps_scope_id,
      effectiveType === "CUSTOMER_GROUP" ? customerGroupLabelMap : customerLabelMap,
    );
  };

  const handleScopeChange = (row: EditablePartyRow, value: string) => {
    updatePartyRow(row._rowKey, { lps_scope_id: value });

    const nextValue = value.trim();
    if (!nextValue || nextValue === row.lps_scope_id.trim()) {
      return;
    }

    const isLastRow = partyRows[partyRows.length - 1]?._rowKey === row._rowKey;
    if (isLastRow) {
      addPartyRow();
    }
  };

  const getRowIndex = (rowKey: string) =>
    partyRows.findIndex((entry) => entry._rowKey === rowKey);

  const getColIndex = (key: "scope" | "exclude" | "active") =>
    ["scope", "exclude", "active"].indexOf(key);

  const maxRow = Math.max(partyRows.length - 1, 0);
  const maxCol = 2;

  const columns: ReusableTableColumn<EditablePartyRow>[] = [
    {
      key: "actions",
      header: "",
      width: "5px",
      align: "center",
    },
    {
      key: "lps_slno",
      header: "Sl No",
      render: (row) => <div className="px-3 py-2 text-center">{row.lps_slno}</div>,
      width: "5px",
      align: "center",
    },
    {
      key: "lps_scope_id",
      header: partyScopeColumnHeader,
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);
        const effectiveType = getEffectiveScopeType(row);
        const options = getScopeOptions(row);

        return (
          <div
            className="px-3 py-2"
            data-kb-group="party"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("scope")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "party",
                row: rowIndex,
                col: getColIndex("scope"),
                maxRow,
                maxCol,
              })
            }
          >
            <SearchableSelect
              value={isUuid(row.lps_scope_id) ? row.lps_scope_id : ""}
              options={options}
              onChange={(value) => handleScopeChange(row, value)}
              disabled={!effectiveType || options.length <= 1}
              searchPlaceholder={`Search ${partyScopeColumnHeader.toLowerCase()}`}
            />
          </div>
        );
      },
      width: "700px",
    },
    {
      key: "lps_is_exclude",
      header: "Exclude",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            className="px-3 py-2"
            data-kb-group="party"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("exclude")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "party",
                row: rowIndex,
                col: getColIndex("exclude"),
                maxRow,
                maxCol,
              })
            }
          >
            <label className="flex items-center gap-2 min-h-9 whitespace-nowrap">
              <input
                className={dynamicFormStyles.checkboxControl}
                type="checkbox"
                checked={row.lps_is_exclude}
                onChange={(e) => updatePartyRow(row._rowKey, { lps_is_exclude: e.target.checked })}
              />
              <span className={dynamicFormStyles.checkboxLabel}>
                {row.lps_is_exclude ? "Yes" : "No"}
              </span>
            </label>
          </div>
        );
      },
      width: "100px",
    },
    {
      key: "lps_is_active",
      header: "Active",
      render: (row) => {
        const rowIndex = getRowIndex(row._rowKey);

        return (
          <div
            className="px-3 py-2"
            data-kb-group="party"
            data-kb-row={rowIndex}
            data-kb-col={getColIndex("active")}
            onKeyDown={(e) =>
              handleGridKeyboardNav(e, {
                group: "party",
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
                checked={row.lps_is_active}
                onChange={(e) => updatePartyRow(row._rowKey, { lps_is_active: e.target.checked })}
              />
              <span className={dynamicFormStyles.checkboxLabel}>
                {row.lps_is_active ? "Yes" : "No"}
              </span>
            </label>
          </div>
        );
      },
      width: "100px",
    },
  ];

  return (
    <div
      className="grid gap-[18px]"
      id="loyalty-editor-panel-party"
      role="tabpanel"
      aria-labelledby="loyalty-editor-tab-party"
    >
      <div className="w-full flex-1 min-h-0">
        <ReusableTable<EditablePartyRow>
          columns={columns}
          rows={partyRows}
          rowKey="_rowKey"
          emptyText={`No party rows. Click 'Add Party ${partyScopeColumnHeader}'.`}
          stickyHeader
          showPageSizeSelector
          onDelete={(row) => {
            if (!row.lps_id) {
              removePartyRow(row._rowKey);
              return;
            }

            setDeleteDialog({
              kind: "party",
              rowKey: row._rowKey,
              label: `${partyScopeColumnHeader} ${row.lps_scope_id || ""}`.trim(),
            });
          }}
          deleteLabel="Delete"
          fullViewHeight={false}
          tableMaxHeight="none"
        />
      </div>
    </div>
  );
}