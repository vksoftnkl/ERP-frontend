import { type CSSProperties, type ReactNode } from "react";
import { type ReusableTableColumn } from "@/components/ui/table";
import { type ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";

export type MasterTableRow = {
  __rowId: string | number;
  __recordId: string | number;
  __source: Record<string, unknown> | null;
  serialNo: number;
  masterId: string;
  masterCode: string;
  masterName: string;
  masterShort: string;
  masterAlias: string;
  masterDescription: string;
  masterActive: string;
  position: string;
};

export type CrudMasterTableRow = MasterTableRow;

export type MasterColumnAccessor =
  | "serialNo"
  | "masterCode"
  | "masterName"
  | "masterAlias"
  | "masterShort"
  | "masterDescription"
  | "position"
  | "masterActive";

export type MasterFormState = {
  masterName: string;
  searchCode: string;
  masterAlias: string;
  masterShortName: string;
  masterDescription: string;
  position: string;
};

export type CrudMasterFormValues = MasterFormState & Record<string, string>;

export type PaginationInfo = {
  totalEntries: number | null;
  currentPage: number | null;
  pageSize: number | null;
};

export type CrudMasterApiEndpoints = {
  list: string;
  getById: string;
  create: string;
  delete: string;
};

export type CrudMasterLookupKeys = {
  id: readonly string[];
  code: readonly string[];
  name: readonly string[];
  short: readonly string[];
  alias: readonly string[];
  active?: readonly string[];
  position?: readonly string[];
  description?: readonly string[];
  array?: readonly string[];
};

export type CrudMasterRequestPayloadKeys = {
  id: string;
  name: string;
  alias: string;
  short: string;
  description: string;
  sort: string;
};

export type CrudMasterTableColumnHeaders = {
  serialNo?: string;
  masterCode?: string;
  masterName?: string;
  masterAlias?: string;
  masterShort?: string;
  masterDescription?: string;
  position?: string;
  masterActive?: string;
};

export type CrudMasterTableColumnLayout = {
  serialNo?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterCode?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterName?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterAlias?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterShort?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterDescription?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
  masterActive?: {
    width?: string;
    align?: ReusableTableColumn<Record<string, unknown>>["align"];
  };
};

export type CrudMasterListResponseStyleColumn = {
  accessor: MasterColumnAccessor;
  styleIndex: number;
  fallbackHeader?: string;
};

export type CrudMasterAuditHistoryConfig = {
  screenName: string;
  getRecordId?: (row: MasterTableRow) => string | number | null;
  getDisplayName?: (row: MasterTableRow) => string | null;
};

export type CrudMasterPageController = {
  closeModal: () => void;
  openCreate: (options?: { values?: Record<string, string> }) => void;
  openUpdateById: (recordId: string | number) => Promise<void>;
};

export type CrudMasterPageProps = {
  title: string;
  entityLabel: string;
  entityLabelPlural: string;
  apiEndpoints: CrudMasterApiEndpoints;
  lookupKeys: CrudMasterLookupKeys;
  requestPayloadKeys: CrudMasterRequestPayloadKeys;
  requestPayloadExtra?: Record<string, unknown>;
  styles: Record<string, string>;
  listTitle?: string;
  createLabel?: string;
  codeColumnHeader?: string;
  nameColumnHeader?: string;
  tableColumnHeaders?: CrudMasterTableColumnHeaders;
  tableColumnLayout?: CrudMasterTableColumnLayout;
  customTableColumns?: ReusableTableColumn<MasterTableRow>[];
  columnRenderOverrides?: Record<string, (row: MasterTableRow) => ReactNode>;
  useResponseTableColumns?: boolean;
  responseTableColumnExcludeKeys?: readonly string[];
  toolbarContent?: ReactNode;
  listResponseStyleColumns?: CrudMasterListResponseStyleColumn[];
  listResponseStyleArrayKey?: string;
  nameFieldLabel?: string;
  nameFieldPlaceholder?: string;
  formTitle?: string;
  formDescription?: string;
  customFields?: ERPDynamicModalField[];
  createInitialValues?: Record<string, string>;
  modalPanelStyle?: CSSProperties;
  modalFormGridColumns?: number;
  modalFormDenseGrid?: boolean;
  modalStackLabels?: boolean;
  modalSectionNavigationMode?: "accordion" | "tabs";
  modalHideFieldHelperText?: boolean;
  modalHideFieldErrorText?: boolean;
  modalFocusFirstInvalidFieldOnValidationError?: boolean;
  modalEnableArrowKeyFieldNavigation?: boolean;
  auditHistory?: CrudMasterAuditHistoryConfig;
  enableGridSettingsContextMenu?: boolean;
  gridDetailId?: number;
  gridTableName?: string;
  gridTableNameAliases?: readonly string[];
  getByIdMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  buildListQuery?: (params: {
    searchTerm: string;
    currentPage: number;
    pageSize: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => Record<string, string>;
  listStateResetKey?: string | number | null;
  buildGetByIdRequest?: (params: {
    recordId: string | number;
    action: "view" | "update";
    rowSource: Record<string, unknown> | null;
  }) => {
    url?: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  mapFormValues?: (params: {
    source: Record<string, unknown> | null;
    defaults: MasterFormState;
  }) => Record<string, string>;
  augmentDetailSource?: (params: {
    recordId: string | number;
    action: "view" | "update";
    source: Record<string, unknown> | null;
    rowSource: Record<string, unknown> | null;
  }) =>
    | Record<string, unknown>
    | null
    | Promise<Record<string, unknown> | null>;
  buildRequestPayload?: (params: {
    values: CrudMasterFormValues;
    shouldUpdate: boolean;
    editingItemId: string | number | null;
    files: Record<string, File | null>;
    sectionExpandedState: Record<string, boolean>;
  }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterSubmitSuccess?: (params: {
    response: unknown;
    payload: Record<string, unknown>;
    values: CrudMasterFormValues;
    shouldUpdate: boolean;
    editingItemId: string | number | null;
    files: Record<string, File | null>;
    sectionExpandedState: Record<string, boolean>;
  }) => void | Promise<void>;
  afterDeleteSuccess?: (params: {
    deleteId: string | number;
    rowSource: Record<string, unknown> | null;
  }) => void | Promise<void>;
  onCrudControllerReady?: (
    controller: CrudMasterPageController | null,
  ) => void;
  hideListPage?: boolean;
  hideRowsWhenAllGridColumnFiltersDisabled?: boolean;
  onModalOpenChange?: (open: boolean, variantKey: string | null) => void;
};
