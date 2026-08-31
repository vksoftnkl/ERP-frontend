import { type CSSProperties, type ReactNode } from "react";
import { type ReusableTableColumn } from "@/components/ui/table";
import { type ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import { type MasterIconName } from "@/components/design-system/icons/master-icons";

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
  // Per-master modal icon shown in the create/update/view dialog header. Pass a
  // registered name (resolved against assets/icons) or a custom ReactNode. When
  // both are omitted the modal falls back to the generic placeholder icon.
  iconName?: MasterIconName;
  icon?: ReactNode;
  apiEndpoints: CrudMasterApiEndpoints;
  lookupKeys: CrudMasterLookupKeys;
  requestPayloadKeys: CrudMasterRequestPayloadKeys;
  requestPayloadExtra?: Record<string, unknown>;
  styles: Record<string, string>;
  listTitle?: string;
  listTitleOverride?: string;
  listSubtitleOverride?: string;
  createLabel?: string;
  codeColumnHeader?: string;
  nameColumnHeader?: string;
  tableColumnHeaders?: CrudMasterTableColumnHeaders;
  tableColumnLayout?: CrudMasterTableColumnLayout;
  customTableColumns?: ReusableTableColumn<MasterTableRow>[];
  appendTableColumns?: ReusableTableColumn<MasterTableRow>[];
  columnRenderOverrides?: Record<string, (row: MasterTableRow) => ReactNode>;
  /**
   * Extra class per row, for pages that paint a record's state on the whole
   * row rather than in one cell — a cancelled voucher struck through, say.
   * Forwarded to the table's own `rowClassName`.
   */
  rowClassName?: (row: MasterTableRow, rowIndex: number) => string | undefined;
  onCreateAction?: () => void;
  onEditAction?: (row: MasterTableRow) => void;
  /**
   * Rows this page refuses to edit. While such a row is selected the toolbar's
   * Edit button is inactive, and `onEditAction` / the update modal are not
   * reached at all — for records that are readable but not writable, e.g. a
   * soft-deleted voucher. Optional `reason` becomes the button's tooltip.
   */
  isRowEditDisabled?: (row: MasterTableRow) => boolean;
  rowEditDisabledReason?: string;
  /**
   * Rows this page refuses to delete — the mirror of `isRowEditDisabled` on the
   * write side that removes rather than edits. While such a row is selected the
   * toolbar's Delete button is inactive and the confirmation never opens, so a
   * record the server would refuse (a shipped print template, say) is refused
   * here instead of through an error box.
   */
  isRowDeleteDisabled?: (row: MasterTableRow) => boolean;
  rowDeleteDisabledReason?: string;
  /**
   * Print the selected row.
   *
   * OPT-IN, and the toolbar's Print button stays inactive without it — which is
   * every master page, because most of them list records that are not documents
   * and have nothing to send to a printer. A page that IS a document register
   * (quotations, orders, invoices) supplies this and gets the button.
   *
   * The shell owns only the button: the gate on `canPrint`, the busy label and
   * the "nothing selected" state. WHAT gets printed — which purpose, which
   * template, which copies — is the page's, because it is the printing module's
   * question and not this shell's.
   */
  onPrintAction?: (row: MasterTableRow) => void | Promise<void>;
  /**
   * Rows this page refuses to print — the read-side mirror of
   * `isRowEditDisabled`, for a record that is listed but has no paper (a
   * soft-deleted voucher). Optional `reason` becomes the button's tooltip.
   */
  isRowPrintDisabled?: (row: MasterTableRow) => boolean;
  rowPrintDisabledReason?: string;
  /** A render is in flight — the button says so and will not fire twice. */
  printBusy?: boolean;
  /**
   * Open a row for READING — Ctrl+Enter on the selection, and double-click.
   * Supplied by pages whose record does not fit the shell's view modal (a
   * voucher opens its own screen); without it both gestures fall back to that
   * modal, as they always have. A row `isRowEditDisabled` refuses is still
   * viewable through this: it is the read side, not the write side.
   */
  onViewAction?: (row: MasterTableRow) => void;
  useResponseTableColumns?: boolean;
  responseTableColumnExcludeKeys?: readonly string[];
  toolbarContent?: ReactNode;
  // Extra action buttons rendered at the end of the icon toolbar (alongside
  // Add/Edit/Delete/...). Lets a page add navigation/actions without forking
  // the shared toolbar.
  toolbarActions?: ReactNode;
  /**
   * Menu permissions (Settings → User Administration) gate this screen's Add /
   * Edit / Delete / Export buttons. By default the shell resolves the current
   * route against the signed-in user's menu; set `permissionMenuId` (or
   * `permissionHref`) when the page lives on a route the menu does not name,
   * and `disablePermissionGating` for a screen no menu governs.
   */
  permissionMenuId?: number;
  permissionHref?: string;
  disablePermissionGating?: boolean;
  listResponseStyleColumns?: CrudMasterListResponseStyleColumn[];
  listResponseStyleArrayKey?: string;
  nameFieldLabel?: string;
  nameFieldPlaceholder?: string;
  formTitle?: string;
  formDescription?: string;
  createModalTitle?: string;
  editModalTitle?: string;
  viewModalTitle?: string;
  customFields?: ERPDynamicModalField[];
  createInitialValues?: Record<string, string>;
  modalPanelStyle?: CSSProperties;
  /** Extra class on the create/update modal panel, for pages that carry their
   *  own skin (the panel renders outside the page's DOM subtree). */
  modalPanelClassName?: string;
  modalFormGridColumns?: number;
  modalFormDenseGrid?: boolean;
  modalStackLabels?: boolean;
  modalSectionNavigationMode?: "accordion" | "tabs";
  modalHideFieldHelperText?: boolean;
  modalHideFieldErrorText?: boolean;
  modalFocusFirstInvalidFieldOnValidationError?: boolean;
  modalEnableArrowKeyFieldNavigation?: boolean;
  /** Rendered at the far left of the create/update modal footer, called with
   *  the form as it stands. For a per-master action that acts on the draft
   *  without saving it (Customer's "Save as Default Template"). */
  modalFooterLeadingActions?: (context: {
    variantKey: string;
    values: Record<string, string>;
  }) => ReactNode;
  auditHistory?: CrudMasterAuditHistoryConfig;
  enableGridSettingsContextMenu?: boolean;
  gridDetailId?: number;
  gridTableName?: string;
  gridTableNameAliases?: readonly string[];
  uiTableId?: string | number;
  useConfiguredGridColumnsOnly?: boolean;
  getByIdMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * Builds the list request's query params. Return `null` to skip the request
   * altogether — for a configured grid whose SQL binds filter tokens the user
   * has not picked yet, sending a placeholder value is worse than sending
   * nothing (the run either 400s on an unbound token or quietly returns rows
   * for a filter nobody chose). While `null` is returned the table stays empty
   * and no request is made; see `listEmptyText` for the message to show.
   */
  buildListQuery?: (params: {
    searchTerm: string;
    currentPage: number;
    pageSize: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  }) => Record<string, string> | null;
  /**
   * The list endpoint answers with the whole collection at once and understands
   * neither `search` nor `page`/`limit` — a small resource API such as
   * `/reports/templates`, whose query DTO rejects any parameter it does not
   * declare. With this set the shell filters and paginates the fetched rows
   * itself, so the toolbar's search box and the pager keep meaning what they
   * say; without it both would be inert controls over a single unsliced page.
   */
  clientSideList?: boolean;
  /** Overrides the table's empty message ("No {entityLabel} data found"). */
  listEmptyText?: string;
  listStateResetKey?: string | number | null;
  /** Overrides the search box's placeholder ("Search by {entityLabel} name..."). */
  searchPlaceholder?: string;
  /**
   * Extra url/query for DELETE, for records keyed by more than one field — a
   * partitioned voucher wants its whole compound key, not just the id. The id
   * param the shell already sends is merged in unless the query restates it.
   * Mirrors `buildGetByIdRequest`.
   */
  buildDeleteRequest?: (params: {
    deleteId: string | number;
    rowSource: Record<string, unknown> | null;
  }) => {
    url?: string;
    query?: Record<string, string>;
  };
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
