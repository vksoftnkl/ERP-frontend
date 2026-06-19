import type { ListMeta as SharedListMeta } from "@/utils/types";

export type SortOrder = "Ascending" | "Descending";

export type Alignment = "Left" | "Center" | "Right";

export type GridDeviceType = "desktop" | "web" | "mobile";

export type GridDesignerForm = {
  gridId: string;
  gridName: string;
  gridDescription: string;
  sortColumn: string;
  sortOrder: SortOrder;
  gridSql: string;
  gridStatus: boolean;
  gridDeviceType: GridDeviceType;
};

export type GridColumnRow = {
  id: string;
  gridColumnId: string | null;
  columnNumber: number;
  columnName: string;
  sqlFieldName: string;
  width: string;
  position: string;
  alignment: Alignment;
  visible: boolean;
  filter: boolean;
  condition: string;
  conditionColor: string;
  grouping: boolean;
  total: boolean;
  dataType: string;
  columnColor: string;
  notes: string;
};

export type GridOption = {
  gridId: string;
  gridName: string;
  gridStatus: boolean;
};

export type GridDetailPayload = {
  grid_id: string;
  grid_name: string;
  grid_description: string | null;
  grid_sort_column: string | null;
  grid_sort_order: string | null;
  grid_sql: string | null;
  grid_status: boolean;
  grid_device_type?: string | null;
  grid_is_deleted: boolean;
  columns: GridColumnPayload[];
};

export type GridColumnPayload = {
  grid_column_id: string;
  grid_id: string;
  grid_column_number: number;
  grid_column_name: string;
  grid_column_width: number | null;
  grid_column_position: number | null;
  grid_column_alignment: string | null;
  grid_column_visibility: boolean;
  grid_column_filter: boolean;
  grid_column_condition: string | null;
  grid_column_condition_color: string | null;
  grid_column_group: boolean;
  grid_column_total: boolean;
  grid_column_data_type: string | null;
  grid_column_color: string | null;
  grid_column_notes: string | null;
  grid_column_sql_field_name: string | null;
  grid_column_is_deleted: boolean;
};

export type GridListMeta = SharedListMeta;

export type SaveGridColumnRequest = {
  grid_column_id?: string;
  grid_column_number: number;
  grid_column_name: string;
  grid_column_width: number | null;
  grid_column_position: number | null;
  grid_column_alignment: string | null;
  grid_column_visibility: boolean;
  grid_column_filter: boolean;
  grid_column_condition: string | null;
  grid_column_condition_color: string | null;
  grid_column_group: boolean;
  grid_column_total: boolean;
  grid_column_data_type: string | null;
  grid_column_color: string | null;
  grid_column_notes: string | null;
  grid_column_sql_field_name: string | null;
};

export type SaveGridDetailRequest = {
  grid_id?: string;
  grid_name: string;
  grid_description: string | null;
  grid_sort_column: string | null;
  grid_sort_order: string | null;
  grid_sql: string | null;
  grid_status: boolean;
  grid_device_type?: string;
  grid_columns?: SaveGridColumnRequest[];
};
