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
  drop_columns_id: string;
  dropdown_id: string;
  drop_columns_column_no: number;
  drop_columns_data_type: string;
  drop_columns_column_name: string;
  drop_columns_column_alias: string | null;
  drop_columns_column_width: number | null;
  drop_columns_column_visiblity: boolean;
  drop_columns_column_allignment: string | null;
  drop_columns_column_filter: boolean;
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
  columns: DropdownColumnPayload[];
};

export type DropdownListMeta = SharedListMeta;

export type SaveDropdownColumnRequest = {
  drop_columns_id?: string;
  drop_columns_column_no: number;
  drop_columns_data_type: string;
  drop_columns_column_name: string;
  drop_columns_column_alias: string | null;
  drop_columns_column_width: number | null;
  drop_columns_column_visiblity: boolean;
  drop_columns_column_allignment: string | null;
  drop_columns_column_filter: boolean;
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
  dropdown_columns?: SaveDropdownColumnRequest[];
  replace_columns?: boolean;
};
