export type UiTableDeviceType = "web" | "mobile" | "desktop";

export type UiTableForm = {
  uiTableId: string;
  uiTblName: string;
  uiTblDeviceType: UiTableDeviceType;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
};

export type UiTableColumnRow = {
  id: string;
  uiTblClmId: string | null;
  columnNumber: number;
  columnName: string;
  width: string;
  visible: boolean;
  focus: boolean;
  position: string;
  necessity: boolean;
  nextColumn: string;
  previousColumn: string;
  isActive: boolean;
};

export type UiTableOption = {
  uiTableId: string;
  uiTblName: string;
  uiTblDeviceType: UiTableDeviceType;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
};

export type UiTableColumnPayload = {
  uiTblClmId: string;
  uiTblClmNo: string;
  uiTblClmName: string | null;
  uiTblClmTableId: string | null;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean | null;
  uiTblClmColumnFocus: boolean | null;
  uiTblClmColumnPosition: number;
  uiTblClmColumnNecessity: boolean;
  uiTblClmNextColumn: number | null;
  uiTblClmPreviousColumn: number | null;
  uiTblClmIsActive: boolean;
  uiTblClmIsDeleted: boolean;
  uiTblClmSyncDate: string | null;
  uiTblClmCreatedOn: string;
  uiTblClmCreatedBy: string | null;
  uiTblClmModifiedOn: string;
  uiTblClmModifiedBy: string | null;
};

export type UiTablePayload = {
  uiTblId: string;
  uiTableId?: string;
  uiTblName: string | null;
  uiTblDeviceType: string | null;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
  uiTblIsDeleted: boolean;
  uiTblSyncDate: string | null;
  uiTblCreatedOn: string;
  uiTblCreatedBy: string | null;
  uiTblModifiedOn: string;
  uiTblModifiedBy: string | null;
  columns: UiTableColumnPayload[];
};

export type SaveUiTableColumnRequest = {
  uiTblClmId?: string;
  uiTblClmNo?: string;
  uiTblClmName: string;
  uiTblClmColumnWidth: number | null;
  uiTblClmColumnVisibility: boolean;
  uiTblClmColumnFocus: boolean;
  uiTblClmColumnPosition: number;
  uiTblClmColumnNecessity: boolean;
  uiTblClmNextColumn: number | null;
  uiTblClmPreviousColumn: number | null;
  uiTblClmIsActive: boolean;
};

export type SaveUiTableMasterRequest = {
  uiTblId?: string;
  uiTblName: string;
  uiTblDeviceType: UiTableDeviceType;
  uiTblEditable: boolean;
  uiTblIsActive: boolean;
  uiTblColumns?: SaveUiTableColumnRequest[];
  replaceColumns?: boolean;
};

