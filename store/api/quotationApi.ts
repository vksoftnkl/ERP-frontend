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
  CONFIGURED_GRID_RUN_ENDPOINT,
  CUSTOMER_DETAIL_ENDPOINT,
  DROPDOWN_RUN_ENDPOINT,
  FREIGHT_CHARGE_ENDPOINT,
  ITEM_BY_BARCODE_ENDPOINT,
  ITEM_PICKER_GRID_ID,
  ITEM_PRICE_ENDPOINT,
  ITEM_SWITCH_UOM_ENDPOINT,
  ITEM_UNITS_ENDPOINT,
  QUOTATION_DELETE_ENDPOINT,
  QUOTATION_GET_ENDPOINT,
  QUOTATION_LIST_GRID_ID,
  QUOTATION_SAVE_ENDPOINT,
  UI_TABLE_MASTERS_ENDPOINT,
  USER_ADMINISTRATION_GET_ENDPOINT,
} from "@/features/sales/quotation/quotation.constants";
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
    // -- the browse list (there is no /quotations/list route; grid 84 is it) --
    listQuotations: builder.query<ConfiguredGridPage<QuotationListRow>, QuotationListQuery | void>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: QUOTATION_LIST_GRID_ID,
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          // `search` is deliberately NOT forwarded: grid 84 has no filterable
          // column, so the runner would inject `1 = 0` and answer with an empty
          // page. The caller filters what it fetched.
          ...(params?.sort_by ? { sort_by: params.sort_by } : {}),
          ...(params?.sort_dir ? { sort_dir: params.sort_dir } : {}),
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
  useListQuotationsQuery,
  useLazyListQuotationsQuery,
  useGetQuotationGridLayoutQuery,
  useSearchPickerItemsQuery,
  useLazySearchPickerItemsQuery,
  useGetSalesChargesQuery,
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