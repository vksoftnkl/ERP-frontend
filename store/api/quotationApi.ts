/**
 * Quotation Entry — server endpoints.
 *
 * Casing on the wire is deliberately inconsistent and is NOT normalised here:
 * `/quotations/*` and `/ui-table-masters/*` take camelCase params, the
 * configured-grid and dropdown runners take snake_case, `/master-lookups/*` is
 * snake_case for item-price / customer-detail and camelCase for the rest. Each
 * endpoint below spells out what its own route actually accepts — a generic
 * normalizer would be wrong for at least half of them.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  CHARGES_GET_ENDPOINT,
  CHARGE_MODULE_SALES,
  COMPANY_GET_ENDPOINT,
  HOLD_DEVICE_ID_HEADER,
  CONFIGURED_GRID_RUN_ENDPOINT,
  CUSTOMER_DETAIL_ENDPOINT,
  DROPDOWN_RUN_ENDPOINT,
  FREIGHT_CHARGE_ENDPOINT,
  ITEM_BY_BARCODE_ENDPOINT,
  ITEM_PICKER_GRID_ID,
  ITEM_PRICE_ENDPOINT,
  ITEM_SWITCH_UOM_ENDPOINT,
  ITEM_UNITS_ENDPOINT,
  PRICE_LEVEL_DROPDOWN_ID,
  QUOTATION_DELETE_ENDPOINT,
  QUOTATION_GET_ENDPOINT,
  QUOTATION_LIST_GRID_ID,
  QUOTATION_SAVE_ENDPOINT,
  TXN_HOLD_DELETE_ENDPOINT,
  TXN_HOLD_GET_ENDPOINT,
  TXN_HOLD_LIST_ENDPOINT,
  TXN_HOLD_SAVE_ENDPOINT,
  txnHoldLockEndpoint,
  UI_TABLE_COLUMN_WIDTH_ENDPOINT,
  UI_TABLE_MASTERS_ENDPOINT,
  UI_TABLE_VISIBILITY_ENDPOINT,
  USER_ADMINISTRATION_GET_ENDPOINT,
  QUOTATION_WIDGET_MENU_ID,
  QUOTATION_WIDGET_PLATFORM,
  WIDGET_MASTERS_GET_ENDPOINT,
  WIDGET_MASTERS_VISIBILITY_ENDPOINT,
} from "@/features/sales/quotation/quotation.constants";
import type { WidgetMasterSectionConfig } from "@/features/masters/shared/widget-config";
import type {
  BarcodeItemLookup,
  ChargeMasterRow,
  CustomerDetailPayload,
  FreightBand,
  ItemPickerRow,
  ItemPriceLookupPayload,
  ItemUnitOption,
  QuotationDocKey,
  QuotationListRow,
  QuotationPayload,
  SaveQuotationDto,
  SaveTxnHoldDto,
  TxnHoldConversion,
  TxnHoldLockScope,
  TxnHoldPayload,
  UiTableColumnRow,
} from "@/features/sales/quotation/quotation.types";
/** `/configured-grid-sql/run` — a page of rows plus a real total. */
export type ConfiguredGridPage<TRow> = {
  items: TRow[];
  meta: { page: number; limit: number; total: number };
};
type UiTableMasterRow = {
  uiTblId: string;
  uiTblName: string | null;
  columns?: UiTableColumnRow[];
};
export type ItemPriceQuery = {
  item_id: string;
  /** Required, 1-based: 1..4 = A..D, 5 = MRP, 6 = min, 7 = cost. */
  price_level: number;
  /** Accepts a raw `unit_id` or an `iuc_id`; the response always returns `iuc_id`. */
  unit_id?: string;
  company_id?: string;
  branch_id?: string;
  customer_id?: string;
  godown_id?: string;
  /** Note the spelling — three `c`s. Without it `stock` comes back null. */
  acccyear?: string;
  loading_type?: string;
  freight_type?: string;
  regional?: boolean;
};
export type QuotationListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  /**
   * The tenant grid 84's SQL scopes on. Required, not optional: its WHERE reads
   * `sq_company_id = 'icompany_id'::uuid`, and a token the request binds no
   * value for stays in the SQL as a literal the cast then rejects.
   */
  companyId: string;
  branchId: string;
  accYear: string;
};
/** A uuid that matches nothing, so an unresolved tenant lists no rows instead of failing the cast. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";
/**
 * What every lock transition needs: the hold, the device asking (which travels
 * as a header, not a body field) and the tenant scope the server keys its
 * conditional update on.
 */
export type HoldLockArgs = {
  txhId: string;
  /** `fixed.device_master.dev_id` — the lease is held by a registered device. */
  deviceId: string;
  scope: TxnHoldLockScope;
};
export type HoldConvertArgs = HoldLockArgs & {
  conversion: TxnHoldConversion;
};
export const quotationApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // -- the document -----------------------------------------------------
    getQuotation: builder.query<QuotationPayload, QuotationDocKey>({
      // The voucher's own company/branch/year, not the session's: an admin can
      // open another company's document and every later lookup must quote that
      // one. `sqAccYear` has no server-side pipe — omitting it silently drops
      // the filter, so it is always sent.
      query: (key) => ({ url: QUOTATION_GET_ENDPOINT, params: key }),
      transformResponse: (payload: ApiSuccessResponse<QuotationPayload>) => payload.data,
      providesTags: (_result, _error, key) => [{ type: "Quotation", id: key.sqId }],
      keepUnusedDataFor: 0,
    }),
    saveQuotation: builder.mutation<QuotationPayload, SaveQuotationDto>({
      // One route for create and update; `sqId`'s presence selects which.
      query: (body) => ({ url: QUOTATION_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<QuotationPayload>) => payload.data,
      invalidatesTags: ["Quotation"],
    }),
    deleteQuotation: builder.mutation<{ sqId: string; deleted: boolean }, string>({
      query: (sqId) => ({
        url: QUOTATION_DELETE_ENDPOINT,
        method: "DELETE",
        params: { sqId },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ sqId: string; deleted: boolean }>) =>
        payload.data,
      invalidatesTags: ["Quotation"],
    }),
    // -- held carts (F9 / F10) --------------------------------------------
    /**
     * One route for create and update, `txhId`'s presence selecting which —
     * the same contract as `/quotations/create`.
     */
    saveTxnHold: builder.mutation<TxnHoldPayload, SaveTxnHoldDto>({
      query: (body) => ({ url: TXN_HOLD_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<TxnHoldPayload>) => payload.data,
      invalidatesTags: ["TxnHold"],
    }),
    /**
     * The held list, newest first, soft-deleted rows already excluded.
     *
     * Unlike the quotation browse list this route filters properly — but only
     * off the module's own Prisma query, which it takes ONLY when a structured
     * filter is present. Sending the tenant scope is therefore doing two jobs:
     * narrowing the list, and keeping it off the configured-grid path whose
     * stored SQL knows none of these filters and would answer with every
     * company's holds.
     *
     * `txhKind` matters as much as the scope: `txn_hold` is shared with the
     * till, and AUTOSAVE snapshots and TEMPLATEs sit in the same table as the
     * carts an operator parked.
     */
    listTxnHolds: builder.query<
      { items: TxnHoldPayload[]; total: number },
      {
        txhCompanyId: string;
        txhBranchId: string;
        txhAccYear?: string;
        txhKind?: string;
        txhSrcModule?: string;
        txhDocType?: string;
        txhStatus?: string;
        search?: string;
        page?: number;
        limit?: number;
      }
    >({
      query: ({ page = 1, limit = 100, search, ...filters }) => ({
        url: TXN_HOLD_LIST_ENDPOINT,
        params: {
          ...filters,
          page,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: (
        payload: ApiSuccessResponse<TxnHoldPayload[], { total?: number | null }>,
      ) => ({
        items: payload.data ?? [],
        total: payload.meta?.total ?? payload.data?.length ?? 0,
      }),
      providesTags: ["TxnHold"],
      keepUnusedDataFor: 0,
    }),
    /**
     * Take the edit lease — `HELD` → `LOCKED`, leased to `deviceId` until it
     * expires.
     *
     * A 409 means another device has it under a LIVE lease (the message names
     * which); one that has already lapsed is taken over without a force-release.
     * The same device asking twice is a no-op that answers 200, so a retried
     * request or a double-press costs nothing. The response carries
     * `txhPayload`, which is the cart to redraw.
     */
    resumeTxnHold: builder.mutation<TxnHoldPayload, HoldLockArgs>({
      query: ({ txhId, deviceId, scope }) => ({
        url: txnHoldLockEndpoint(txhId, "resume"),
        method: "POST",
        headers: { [HOLD_DEVICE_ID_HEADER]: deviceId },
        body: scope,
      }),
      transformResponse: (payload: ApiSuccessResponse<TxnHoldPayload>) => payload.data,
      invalidatesTags: ["TxnHold"],
    }),
    /** Give the lease back — `LOCKED` → `HELD`. 403 if this device is not the holder. */
    releaseTxnHold: builder.mutation<TxnHoldPayload, HoldLockArgs>({
      query: ({ txhId, deviceId, scope }) => ({
        url: txnHoldLockEndpoint(txhId, "release"),
        method: "POST",
        headers: { [HOLD_DEVICE_ID_HEADER]: deviceId },
        body: scope,
      }),
      transformResponse: (payload: ApiSuccessResponse<TxnHoldPayload>) => payload.data,
      invalidatesTags: ["TxnHold"],
    }),
    /**
     * Take the lease away from whichever device holds it.
     *
     * The escape hatch, not an alternative release: a lease lapses on its own,
     * but not before its TTL is up, and the floor sometimes needs the cart back
     * sooner. `deviceId` is this device — the one doing the taking — and the
     * server's audit entry names both sides. It also clears a `RESUMED` row,
     * which nothing else can move.
     */
    forceReleaseTxnHold: builder.mutation<TxnHoldPayload, HoldLockArgs>({
      query: ({ txhId, deviceId, scope }) => ({
        url: txnHoldLockEndpoint(txhId, "force-release"),
        method: "POST",
        headers: { [HOLD_DEVICE_ID_HEADER]: deviceId },
        body: scope,
      }),
      transformResponse: (payload: ApiSuccessResponse<TxnHoldPayload>) => payload.data,
      invalidatesTags: ["TxnHold"],
    }),
    /**
     * Close the hold onto the document it became — `LOCKED` → `CONVERTED`, which
     * is terminal. Only the device holding the lease may, and afterwards nothing
     * can resume the cart and bill it twice.
     */
    convertTxnHold: builder.mutation<TxnHoldPayload, HoldConvertArgs>({
      query: ({ txhId, deviceId, scope, conversion }) => ({
        url: txnHoldLockEndpoint(txhId, "convert"),
        method: "POST",
        headers: { [HOLD_DEVICE_ID_HEADER]: deviceId },
        body: { ...scope, ...conversion },
      }),
      transformResponse: (payload: ApiSuccessResponse<TxnHoldPayload>) => payload.data,
      invalidatesTags: ["TxnHold"],
    }),
    /**
     * One hold. `txhAccYear` is optional — the table is partitioned by it, so
     * naming it prunes the lookup to one partition instead of scanning every
     * year on record.
     */
    getTxnHold: builder.query<TxnHoldPayload, { txhId: string; txhAccYear?: string }>({
      query: ({ txhId, txhAccYear }) => ({
        url: TXN_HOLD_GET_ENDPOINT,
        params: { txhId, ...(txhAccYear ? { txhAccYear } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<TxnHoldPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),
    /** Soft delete: the row stays, flagged, and frees its hold number and serial. */
    deleteTxnHold: builder.mutation<
      { txhId: string; deleted: boolean },
      { txhId: string; txhAccYear?: string }
    >({
      query: ({ txhId, txhAccYear }) => ({
        url: TXN_HOLD_DELETE_ENDPOINT,
        method: "DELETE",
        params: { txhId, ...(txhAccYear ? { txhAccYear } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ txhId: string; deleted: boolean }>) =>
        payload.data,
      invalidatesTags: ["TxnHold"],
    }),
    // -- the browse list (there is no /quotations/list route; grid 84 is it) --
    listQuotations: builder.query<ConfiguredGridPage<QuotationListRow>, QuotationListQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: QUOTATION_LIST_GRID_ID,
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          // `search` is deliberately NOT forwarded: the caller filters what it
          // fetched, over more fields than the grid marks filterable.
          ...(params.sort_by ? { sort_by: params.sort_by } : {}),
          ...(params.sort_dir ? { sort_dir: params.sort_dir } : {}),
          // Grid 84's own WHERE. Every token it names must be bound — the dates
          // travel empty, which its `NULLIF('ifrom_date', '') IS NULL OR …`
          // guards read as "no bound", and an absent key would not.
          grid_param: JSON.stringify({
            icompany_id: params.companyId || NO_TENANT_ID,
            ibranch_id: params.branchId || NO_TENANT_ID,
            iacc_year: params.accYear,
            ifrom_date: "",
            ito_date: "",
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<QuotationListRow>>) =>
        payload.data,
      providesTags: ["Quotation"],
      keepUnusedDataFor: 30,
    }),
    // -- grid layouts ------------------------------------------------------
    getQuotationGridLayout: builder.query<UiTableColumnRow[], { uiTableId: string }>({
      // `uiTableId` is camelCase here, and it is the ONLY accepted param —
      // `uiTblClmTableId` is rejected outright by `forbidNonWhitelisted`.
      query: (params) => ({ url: UI_TABLE_MASTERS_ENDPOINT, params }),
      transformResponse: (
        payload: ApiSuccessResponse<UiTableMasterRow[]>,
        _meta,
        arg,
      ): UiTableColumnRow[] => {
        const tables = payload.data ?? [];
        const table = tables.find((row) => row.uiTblId === arg.uiTableId) ?? tables[0];
        return table?.columns ?? [];
      },
      keepUnusedDataFor: 300,
    }),
    /**
     * The columns the operator dragged, saved together from the grid's
     * "save column width" menu item. Widths are stored in the layout's own unit
     * (see `configWidthFromPx`), and the cached layout is patched in place so
     * re-entering the screen keeps them without a refetch.
     */
    saveQuotationColumnWidths: builder.mutation<
      { updated: number },
      { uiTableId: string; columns: Array<{ columnId: string; configWidth: number }> }
    >({
      query: ({ columns }) => ({
        url: UI_TABLE_COLUMN_WIDTH_ENDPOINT,
        method: "PUT",
        body: {
          columns: columns.map((column) => ({
            uiTblClmId: column.columnId,
            uiTblClmColumnWidth: column.configWidth,
          })),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ updated: number }>) => payload.data,
      async onQueryStarted({ uiTableId, columns }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          quotationApi.util.updateQueryData("getQuotationGridLayout", { uiTableId }, (rows) => {
            for (const column of columns) {
              const row = rows.find((candidate) => candidate.uiTblClmId === column.columnId);
              if (row) {
                row.uiTblClmColumnWidth = column.configWidth;
              }
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          // The grid keeps the local widths either way; only the cache rolls back.
          patch.undo();
        }
      },
    }),
    /**
     * The layout the screen's "Admin settings" dialog owns: which columns the
     * grid shows, in what order, and the two flags the layout carries.
     *
     * Only the fields that changed are sent — the route writes a column's field
     * only when the body names it, so an omitted `uiTblClmColumnWidth` leaves a
     * saved width alone rather than nulling it.
     */
    saveQuotationColumnLayout: builder.mutation<
      { updated: number },
      {
        uiTableId: string;
        columns: Array<{
          columnId: string;
          visible?: boolean;
          focus?: boolean;
          necessity?: boolean;
          position?: number;
        }>;
      }
    >({
      query: ({ columns }) => ({
        url: UI_TABLE_VISIBILITY_ENDPOINT,
        method: "PUT",
        body: {
          columns: columns.map((column) => ({
            uiTblClmId: column.columnId,
            ...(column.visible === undefined
              ? {}
              : { uiTblClmColumnVisibility: column.visible }),
            ...(column.focus === undefined ? {} : { uiTblClmColumnFocus: column.focus }),
            ...(column.necessity === undefined
              ? {}
              : { uiTblClmColumnNecessity: column.necessity }),
            ...(column.position === undefined
              ? {}
              : { uiTblClmColumnPosition: column.position }),
          })),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ updated: number }>) => payload.data,
      async onQueryStarted({ uiTableId, columns }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          quotationApi.util.updateQueryData("getQuotationGridLayout", { uiTableId }, (rows) => {
            for (const column of columns) {
              const row = rows.find((candidate) => candidate.uiTblClmId === column.columnId);
              if (!row) {
                continue;
              }
              if (column.visible !== undefined) {
                row.uiTblClmColumnVisibility = column.visible;
              }
              if (column.focus !== undefined) {
                row.uiTblClmColumnFocus = column.focus;
              }
              if (column.necessity !== undefined) {
                row.uiTblClmColumnNecessity = column.necessity;
              }
              if (column.position !== undefined) {
                row.uiTblClmColumnPosition = column.position;
              }
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    /**
     * The header panel's field config — which of the three header blocks' fields
     * this deployment shows, and what it calls them. Shared with the master
     * screens' "Visible Settings", so the shape is theirs: sections, each with
     * its fields, for one menu id and platform.
     */
    getQuotationWidgetConfig: builder.query<WidgetMasterSectionConfig[], void>({
      query: () => ({
        url: WIDGET_MASTERS_GET_ENDPOINT,
        // camelCase here; the sibling `/widget-masters/config` route spells the
        // same two filters `menu_id` / `platform`.
        params: {
          sectionMenuId: QUOTATION_WIDGET_MENU_ID,
          sectionPlatform: QUOTATION_WIDGET_PLATFORM,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<WidgetMasterSectionConfig[]>) =>
        payload.data ?? [],
      providesTags: [{ type: "WidgetConfig", id: QUOTATION_WIDGET_MENU_ID }],
      keepUnusedDataFor: 300,
    }),
    /**
     * Saves the Visible Settings dialog. Every section is sent whole — the
     * server updates by `sectionId` / `fieldId` and rolls the batch back if any
     * id is missing, so a partial body would not be a partial save.
     */
    saveQuotationWidgetVisibility: builder.mutation<
      unknown,
      {
        data: Array<{
          sectionId: number;
          sectionGuiName: string;
          sectionVisibility: boolean;
          fields: Array<{
            fieldId: number;
            fieldSecondaryText: string;
            fieldVisibility: boolean;
          }>;
        }>;
      }
    >({
      query: (body) => ({
        url: WIDGET_MASTERS_VISIBILITY_ENDPOINT,
        method: "PATCH",
        body,
      }),
      invalidatesTags: [{ type: "WidgetConfig", id: QUOTATION_WIDGET_MENU_ID }],
    }),
    // -- pickers -----------------------------------------------------------
    /**
     * Configured grid 71 returns one row per item × unit conversion, so a pick
     * settles both the item and its unit. `item_uom_id` is an `iuc_id`.
     * Only `item_name_en` is searchable server-side.
     */
    searchPickerItems: builder.query<
      ConfiguredGridPage<ItemPickerRow>,
      { search?: string; page?: number; limit?: number }
    >({
      query: ({ search, page = 1, limit = 20 }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: ITEM_PICKER_GRID_ID,
          page,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<ItemPickerRow>>) =>
        payload.data,
      keepUnusedDataFor: 60,
    }),
    /**
     * The whole sales charge master in one call: `chgModule=S` widens to
     * `('S','B')`, returns only active non-deleted rows, and is unpaginated by
     * design ("the master is small"). Everything the charge grid needs to build
     * a `cd*` snapshot — including `chgLedgerCode`, which is NOT NULL on the
     * line — is on these rows, which is why the configured picker grid 82 is not
     * used: it carries only `chg_id` and `chg_name`.
     */
    getSalesCharges: builder.query<ChargeMasterRow[], void>({
      query: () => ({ url: CHARGES_GET_ENDPOINT, params: { chgModule: CHARGE_MODULE_SALES } }),
      transformResponse: (payload: ApiSuccessResponse<ChargeMasterRow[]>) => payload.data ?? [],
      keepUnusedDataFor: 300,
    }),
    /**
     * A configured dropdown, paged and searched server-side. Used for the
     * customer, place-of-supply, agent and salesman comboboxes.
     *
     * The rows come back with the stored SQL's own column names, so the caller
     * says which key is the value and which is the label. `dropdown_param` is
     * never sent: none of these dropdowns' SQL has a placeholder, and the
     * substitution is textual, so a stray key could corrupt the query.
     */
    runDropdown: builder.query<
      ConfiguredGridPage<Record<string, unknown>>,
      { dropdownId: string; search?: string; limit?: number }
    >({
      query: ({ dropdownId, search, limit = 25 }) => ({
        url: DROPDOWN_RUN_ENDPOINT,
        params: {
          dropdown_id: dropdownId,
          page: 1,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: (
        payload: ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>,
      ) => payload.data,
      keepUnusedDataFor: 120,
    }),
    /**
     * The price-level master, as select options. The value is the level NUMBER
     * (`ipl_id` 1..7) the voucher stores and `/item-price` expects — only the
     * label is configurable, so a deployment can call level 1 "WS Price".
     */
    getPriceLevels: builder.query<Array<{ value: string; label: string }>, void>({
      query: () => ({
        url: DROPDOWN_RUN_ENDPOINT,
        params: { dropdown_id: PRICE_LEVEL_DROPDOWN_ID, page: 1, limit: 50 },
      }),
      transformResponse: (
        payload: ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>,
      ) =>
        (payload.data?.items ?? [])
          .map((row) => ({
            value: String(row.ipl_id ?? ""),
            label: String(row.ipl_name ?? ""),
          }))
          .filter((option) => option.value && option.label),
      keepUnusedDataFor: 300,
    }),
    // -- line + header lookups --------------------------------------------
    getCustomerDetail: builder.query<
      CustomerDetailPayload,
      { cus_id: string; company_id: string; branch_id: string; regional?: boolean }
    >({
      query: (params) => ({ url: CUSTOMER_DETAIL_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<CustomerDetailPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),
    getItemPrice: builder.query<ItemPriceLookupPayload, ItemPriceQuery>({
      query: (params) => ({ url: ITEM_PRICE_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<ItemPriceLookupPayload>) => payload.data,
      keepUnusedDataFor: 60,
    }),
    /**
     * Returns the NEXT `iuc_id` in the item's own unit cycle and nothing else —
     * no price. The caller re-runs `getItemPrice` with it. The backend owns the
     * cycle; nothing is scaled client-side.
     */
    switchItemUom: builder.query<{ item_id: string; iuc_id: string }, { item_id: string; iuc_id: string }>({
      query: (params) => ({ url: ITEM_SWITCH_UOM_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<{ item_id: string; iuc_id: string }>) =>
        payload.data,
      keepUnusedDataFor: 0,
    }),
    getItemUnits: builder.query<ItemUnitOption[], string>({
      query: (itemId) => ({ url: `${ITEM_UNITS_ENDPOINT}/${itemId}` }),
      transformResponse: (payload: ApiSuccessResponse<ItemUnitOption[]>) => payload.data ?? [],
      keepUnusedDataFor: 300,
    }),
    /**
     * Named for this feature, not generically: `lookupsApi` already injects a
     * `getItemByBarcode` into the same `baseApi` with a different argument shape,
     * and both modules pass `overrideExisting: true` — so a generic name here
     * would silently replace whichever endpoint happened to be injected first and
     * break the other feature's barcode field.
     */
    getQuotationItemByBarcode: builder.query<BarcodeItemLookup, string>({
      query: (barcode) => ({ url: ITEM_BY_BARCODE_ENDPOINT, params: { barcode } }),
      transformResponse: (payload: ApiSuccessResponse<BarcodeItemLookup>) => payload.data,
      keepUnusedDataFor: 0,
    }),
    /**
     * Distance-banded freight slabs. Several bands can match one distance (they
     * differ by weight), and the endpoint returns all of them — the client picks
     * by voucher weight.
     */
    getFreightBands: builder.query<FreightBand[], number>({
      query: (distance) => ({ url: FREIGHT_CHARGE_ENDPOINT, params: { distance } }),
      transformResponse: (payload: ApiSuccessResponse<FreightBand[]>) => payload.data ?? [],
      keepUnusedDataFor: 300,
    }),
    /**
     * The company's GST state code, which decides local vs inter-state supply
     * against the place of supply. The business-context payload does not carry
     * it, so it is read from the company master.
     */
    getCompanyStateCode: builder.query<string, string>({
      query: (compId) => ({ url: COMPANY_GET_ENDPOINT, params: { compId } }),
      transformResponse: (payload: ApiSuccessResponse<{ compStateCode?: string | null }>) =>
        (payload.data?.compStateCode ?? "").trim(),
      keepUnusedDataFor: 300,
    }),
    /**
     * The two operator capabilities this screen gates on: `usrEditRate` decides
     * whether the rate and price-level cells are editable, and `usrLanguage`
     * decides whether names come back in the regional language. Neither is in
     * the login response, and there is no "skip MRP" column anywhere — that one
     * stays a constant (see `SESSION_CAPABILITIES`).
     *
     * `usrId` must be a v7 uuid: the route's pipe rejects anything else, so a
     * failed fetch is treated as "no restriction", matching how every other
     * screen behaves today.
     */
    getUserCapabilities: builder.query<{ editRate: boolean; language: string | null }, string>({
      query: (usrId) => ({ url: USER_ADMINISTRATION_GET_ENDPOINT, params: { usrId } }),
      transformResponse: (
        payload: ApiSuccessResponse<{ usrEditRate?: boolean | null; usrLanguage?: string | null }>,
      ) => ({
        editRate: payload.data?.usrEditRate !== false,
        language: payload.data?.usrLanguage ?? null,
      }),
      keepUnusedDataFor: 300,
    }),
  }),
});
export const {
  useGetQuotationQuery,
  useLazyGetQuotationQuery,
  useSaveQuotationMutation,
  useDeleteQuotationMutation,
  useSaveTxnHoldMutation,
  useListTxnHoldsQuery,
  useLazyGetTxnHoldQuery,
  useDeleteTxnHoldMutation,
  useResumeTxnHoldMutation,
  useReleaseTxnHoldMutation,
  useForceReleaseTxnHoldMutation,
  useConvertTxnHoldMutation,
  useListQuotationsQuery,
  useLazyListQuotationsQuery,
  useGetQuotationGridLayoutQuery,
  useSaveQuotationColumnWidthsMutation,
  useSaveQuotationColumnLayoutMutation,
  useGetQuotationWidgetConfigQuery,
  useSaveQuotationWidgetVisibilityMutation,
  useSearchPickerItemsQuery,
  useLazySearchPickerItemsQuery,
  useGetSalesChargesQuery,
  useGetPriceLevelsQuery,
  useLazyGetCustomerDetailQuery,
  useLazyGetItemPriceQuery,
  useLazySwitchItemUomQuery,
  useGetItemUnitsQuery,
  useLazyGetItemUnitsQuery,
  useLazyGetQuotationItemByBarcodeQuery,
  useLazyGetFreightBandsQuery,
  useGetCompanyStateCodeQuery,
  useGetUserCapabilitiesQuery,
  useRunDropdownQuery,
  useLazyRunDropdownQuery,
} = quotationApi;