"use client";
import { Select } from "@/components/library/ui";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import type {
  DeleteDialogState,
  EditablePartyRow,
  PartyScopeType,
} from "../promotion-loyalty-points.local-types";
import { isUuid, withFallbackOption } from "../promotion-loyalty-points.utils";

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

  const columns: ReusableTableColumn<EditablePartyRow>[] = [
    {
      key: "lps_slno",
      header: "Sl No",
      render: (row) => <div className="px-3 py-2 text-center">{row.lps_slno}</div>,
      width: "80px",
    },
    {
      key: "lps_scope_id",
      header: partyScopeColumnHeader,
      render: (row) => {
        const effectiveType = getEffectiveScopeType(row);
        const options = getScopeOptions(row);
        return (
          <div className="px-3 py-2">
            <Select
              value={isUuid(row.lps_scope_id) ? row.lps_scope_id : ""}
              onChange={(e) => updatePartyRow(row._rowKey, { lps_scope_id: e.target.value })}
              disabled={!effectiveType || options.length <= 1}
            >
              {options.map((o) => (
                <option key={o.value || "__party-scope-default"} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        );
      },
      width: "260px",
    },
    {
      key: "lps_is_exclude",
      header: "Exclude",
      render: (row) => (
        <div className="px-3 py-2">
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
      ),
      width: "100px",
    },
    {
      key: "lps_is_active",
      header: "Active",
      render: (row) => (
        <div className="px-3 py-2">
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
      ),
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
      <div className="w-full flex-1 min-h-0 overflow-auto">
        <ReusableTable<EditablePartyRow>
          columns={columns}
          rows={partyRows}
          rowKey="_rowKey"
          emptyText={`No party rows. Click 'Add Party ${partyScopeColumnHeader}'.`}
          onCreate={addPartyRow}
          createLabel={`Add Party ${partyScopeColumnHeader}`}
          stickyHeader
          paginated
          pageSize={5}
          defaultPageSize={5}
          pageSizeOptions={[5, 10, 15]}
          totalEntries={partyRows.length}
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
          tableMaxHeight="400px"
        />
      </div>
    </div>
  );
}