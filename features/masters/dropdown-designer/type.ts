import type { ListMeta as SharedListMeta } from "@/utils/types";

export type SortOrder = "ASC" | "DESC";

export type Alignment = "Left" | "Center" | "Right";

export type DropdownDesignerForm = {
  dropdownId: string;
  dropdownName: string;
  dropdownDescription: string;
  sortColumn: string;
  sortOrder: SortOrder;
  dropdownCompletion: string;
  dropdownSql: string;
  dropdownSqlRegional: string;
  maxVisibleItems: string;
  showHeader: boolean;
  dropdownWidth: string;
};

export type DropdownColumnRow = {
  id: string;
  serialId: string | null;
  columnNumber: number;
  columnName: string;
  columnAlias: string;
  dataType: string;
  width: string;
  alignment: Alignment;
  visible: boolean;
  filter: boolean;
};

export type DropdownOption = {
  dropdownId: string;
  dropdownName: string;
  showHeader: boolean;
};

export type DropdownColumnPayload = {
  dropdown_columns_id: string;
  dropdown_columns_dropdown_id: string;
  dropdown_columns_no: number;
  dropdown_columns_data_type: string;
  dropdown_columns_name: string;
  dropdown_columns_alias: string | null;
  dropdown_columns_width: number | null;
  dropdown_columns_visiblity: boolean;
  dropdown_columns_allignment: string | null;
  dropdown_columns_filter: boolean;
};

export type DropdownDetailPayload = {
  dropdown_id: string;
  dropdown_name: string;
  dropdown_description: string | null;
  dropdown_sql: string;
  dropdown_sort_order: string | null;
  dropdown_sort_column: string | null;
  dropdown_completion: string | null;
  dropdown_sql_regional: string | null;
  dropdown_max_visible_items: number;
  dropdown_show_header: boolean;
  dropdown_width: number | null;
  dropdown_device_type: string | null;
  columns: DropdownColumnPayload[];
};

export type DropdownListMeta = SharedListMeta;

export type SaveDropdownColumnRequest = {
  dropdown_columns_id?: string;
  dropdown_columns_no: number;
  dropdown_columns_data_type: string;
  dropdown_columns_name: string;
  dropdown_columns_alias: string | null;
  dropdown_columns_width: number | null;
  dropdown_columns_visiblity: boolean;
  dropdown_columns_allignment: string | null;
  dropdown_columns_filter: boolean;
};

export type SaveDropdownDetailRequest = {
  dropdown_id?: string;
  dropdown_name: string;
  dropdown_description: string | null;
  dropdown_sql: string;
  dropdown_sort_order: string | null;
  dropdown_sort_column: string | null;
  dropdown_completion: string | null;
  dropdown_sql_regional: string | null;
  dropdown_max_visible_items: number;
  dropdown_show_header: boolean;
  dropdown_width: number | null;
  dropdown_device_type?: string | null;
  dropdown_columns?: SaveDropdownColumnRequest[];
  replace_columns?: boolean;
};
