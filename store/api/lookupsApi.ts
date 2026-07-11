import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import {
  buildLookupOptions,
  DEFAULT_LOOKUP_ARRAY_KEYS,
  extractDetailSource,
  extractRows,
} from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";
import type { StockLookupOption } from "@/features/stocks/_shared/types";
import { baseApi } from "@/store/api/baseApi";
const ITEM_LIST_ENDPOINT = "/dropdown-details/run";
const MASTER_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const ITEM_PRICE_DETAILS_ENDPOINT = "/item-price-details/get";
const ITEM_PRICE_DETAILS_BY_BARCODE_ENDPOINT = "/item-price-details/get-by-barcode";
const ITEM_TAX_LIST_ENDPOINT = "/configured-grid-sql/run";
const ITEM_TAX_GET_ENDPOINT = "/item-taxes/get";
// `dropdown_details.dropdown_id` for the configured items dropdown. The seeded
// items dropdown is id 6 (`SELECT item_id, ..., item_name_en ... FROM inventory.item_master`).
const ITEM_DROPDOWN_ID = "6";
// Dynamic filter values substituted into the dropdown SQL. The items SQL has no
// placeholders today, so these pass through harmlessly but are kept in one place
// for when the branch/company scope is needed.
const ITEM_DROPDOWN_PARAM = JSON.stringify({ branch_id: 1, company_id: 2 });
const ITEM_LOOKUP_QUERY = {
  dropdown_id: ITEM_DROPDOWN_ID,
  page: "1",
  dropdown_param: ITEM_DROPDOWN_PARAM,
} as const;
const UNIT_LOOKUP_QUERY = {
  module: "units",
} as const;
const GODOWN_LOOKUP_QUERY = {
  module: "godownLocations",
} as const;
const BRANCH_LOOKUP_QUERY = {
  module: "branches",
} as const;
const COMPANY_LOOKUP_QUERY = {
  module: "companies",
} as const;
const USER_LOOKUP_QUERY = {
  module: "userMasters",
} as const;
const ITEM_TAX_LIST_QUERY = {
  grid_id: "5",
} as const;
const DEFAULT_ITEM_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Branch",
};
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
const DEFAULT_USER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select User",
};
const DEFAULT_UNIT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "",
};
const DEFAULT_TAX_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const ITEM_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "item_masters", "items"],
  idKeys: ["item_id", "itemId", "id", "_id", "value"],
  labelKeys: ["item_name_en", "itemNameEn", "name", "label"],
} as const;
// The configured items dropdown (dropdown_id 6) selects `item_code`, so each
// option also carries it as `code` for the tabular lookup dropdown.
const ITEM_CODE_KEYS = ["item_code", "itemCode", "code"] as const;
function buildItemLookupOptions(payload: unknown): StockLookupOption[] {
  const rows = extractRows(payload, ITEM_LOOKUP_KEYS.arrayKeys);
  const optionMap = new Map<string, StockLookupOption>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ITEM_LOOKUP_KEYS.idKeys));
    if (!id) {
      continue;
    }
    const label = toDisplayValue(getFirstDefinedValue(source, ITEM_LOOKUP_KEYS.labelKeys)) || id;
    const code = toDisplayValue(getFirstDefinedValue(source, ITEM_CODE_KEYS));
    if (!optionMap.has(id)) {
      optionMap.set(id, code ? { value: id, label, code } : { value: id, label });
    }
  }
  const sortedOptions = Array.from(optionMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
  return [DEFAULT_ITEM_OPTION, ...sortedOptions];
}
const UNIT_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "units", "itemUnits"],
  idKeys: ["unit_id", "unitId", "item_unit_id", "itemUnitId", "uom_id", "id", "_id", "value"],
  labelKeys: ["unit_name", "unitName", "item_unit_name", "itemUnitName", "uom_name", "name", "label"],
} as const;
const GODOWN_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "godowns", "godown_locations"],
  idKeys: [
    "gdl_id",
    "gdlId",
    "gdl_location_id",
    "godown_id",
    "godownId",
    "id",
    "_id",
    "value",
  ],
  labelKeys: [
    "gdl_name",
    "gdlName",
    "godown_name",
    "godownName",
    "name",
    "label",
  ],
} as const;
const BRANCH_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
  idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
  labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
} as const;
const COMPANY_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "company_masters"],
  idKeys: ["compId", "comp_id", "company_id", "companyId", "id", "_id", "value"],
  labelKeys: ["compName", "comp_name", "company_name", "companyName", "name", "label"],
} as const;
const USER_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS],
  idKeys: ["id", "usrId", "usr_id", "userId", "user_id", "_id", "value"],
  labelKeys: ["name", "usrDisplayName", "usrLoginName", "usr_display_name", "displayName", "label"],
} as const;
const ITEM_TAX_LOOKUP_KEYS = {
  arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "itemTaxes"],
  idKeys: ["taxId", "tax_id", "id", "_id", "value"],
  labelKeys: ["taxName", "tax_name", "name", "label"],
} as const;
export type LookupSearchArg = {
  search?: string;
};
export type ItemPriceDetailsQueryArg = {
  itemId: string;
};
export type ItemPriceDetailsByBarcodeQueryArg = {
  barcode: string;
};
export type ItemTaxQueryArg = {
  taxId: string;
};
export type ItemPriceDetailsItem = {
  item_id: string;
  item_code: string | null;
  item_name_en: string;
  item_default_barcode: string | null;
  item_base_unit_id: string | null;
  item_default_tax_id: string | null;
  item_is_batch_based: boolean;
  item_is_expiry_item: boolean;
  item_batch_config:number;
  item_notes?: string | null;
};
export type ItemPriceDetailsPrice = {
  ipm_id: string;
  ipm_unit_id: string;
  ipm_godown_id: string;
  ipm_base_unit_id: string | null;
  ipm_to_base_factor: number;
  ipm_unit_factor: number;
  ipm_is_default_unit: boolean;
  ipm_cost_price: number;
  ipm_cost_wot: number;
  ipm_sales_price_a: number;
  ipm_sales_price_b: number;
  ipm_sales_price_c: number;
  ipm_sales_price_d: number;
  ipm_price_a_wot: number;
  ipm_price_b_wot: number;
  ipm_price_c_wot: number;
  ipm_price_d_wot: number;
  ipm_price_a_markup_perc: number;
  ipm_price_b_markup_perc: number;
  ipm_price_c_markup_perc: number;
  ipm_price_d_markup_perc: number;
  ipm_max_price: number;
  ipm_min_price: number;
  ipm_profit_type: string;
  ipm_round_off: number;
  ipm_uom_remarks: string | null;
  ipm_cost_remarks: string | null;
};
export type ItemPriceDetailsTax = {
  tax_id: string;
  tax_name: string;
  tax_gst_rate_total: number;
  tax_cess_type: string;
  tax_cess_perc: number;
  tax_cess_unit: number;
};
export type ItemTaxDetailPayload = {
  tax_id: string;
  tax_name: string;
  tax_gst_rate_total: number;
  tax_cess_type: string;
  tax_cess_perc: number;
  tax_cess_unit: number;
};
export type ItemPriceDetailsPayload = {
  item: ItemPriceDetailsItem;
  item_prices: ItemPriceDetailsPrice[];
  item_tax: ItemPriceDetailsTax | null;
  
};
export const lookupsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getItemOptions: builder.query<StockLookupOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: ITEM_LIST_ENDPOINT,
        params: arg?.search ? { ...ITEM_LOOKUP_QUERY, search: arg.search.trim() } : ITEM_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) => buildItemLookupOptions(payload),
      providesTags: (_result, _error, arg) => [{ type: "ItemLookup", id: arg?.search?.trim() || "default" }],
      keepUnusedDataFor: 300,
    }),
    getUnitOptions: builder.query<ERPDynamicSelectOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: MASTER_LOOKUP_ENDPOINT,
        params: arg?.search ? { ...UNIT_LOOKUP_QUERY, search: arg.search.trim() } : UNIT_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_UNIT_OPTION, UNIT_LOOKUP_KEYS),
      keepUnusedDataFor: 300,
    }),
    getTaxOptions: builder.query<ERPDynamicSelectOption[], void>({
      query: () => ({
        url: ITEM_TAX_LIST_ENDPOINT,
        params: ITEM_TAX_LIST_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_TAX_OPTION, ITEM_TAX_LOOKUP_KEYS),
      keepUnusedDataFor: 300,
    }),
    getGodownOptions: builder.query<ERPDynamicSelectOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: MASTER_LOOKUP_ENDPOINT,
        params: arg?.search
          ? { ...GODOWN_LOOKUP_QUERY, search: arg.search.trim() }
          : GODOWN_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_GODOWN_OPTION, GODOWN_LOOKUP_KEYS),
      providesTags: (_result, _error, arg) => [
        { type: "GodownLookup", id: arg?.search?.trim() || "default" },
      ],
      keepUnusedDataFor: 300,
    }),
    getBranchOptions: builder.query<ERPDynamicSelectOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: MASTER_LOOKUP_ENDPOINT,
        params: arg?.search
          ? { ...BRANCH_LOOKUP_QUERY, search: arg.search.trim() }
          : BRANCH_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_BRANCH_OPTION, BRANCH_LOOKUP_KEYS),
      keepUnusedDataFor: 300,
    }),
    getCompanyOptions: builder.query<ERPDynamicSelectOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: MASTER_LOOKUP_ENDPOINT,
        params: arg?.search
          ? { ...COMPANY_LOOKUP_QUERY, search: arg.search.trim() }
          : COMPANY_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_COMPANY_OPTION, COMPANY_LOOKUP_KEYS),
      keepUnusedDataFor: 300,
    }),
    getUserOptions: builder.query<ERPDynamicSelectOption[], LookupSearchArg | void>({
      query: (arg) => ({
        url: MASTER_LOOKUP_ENDPOINT,
        params: arg?.search
          ? { ...USER_LOOKUP_QUERY, search: arg.search.trim() }
          : USER_LOOKUP_QUERY,
      }),
      transformResponse: (payload: unknown) =>
        buildLookupOptions(payload, DEFAULT_USER_OPTION, USER_LOOKUP_KEYS),
      keepUnusedDataFor: 300,
    }),
    getItemPriceDetails: builder.query<ItemPriceDetailsPayload, ItemPriceDetailsQueryArg>({
      query: ({ itemId }) => ({
        url: ITEM_PRICE_DETAILS_ENDPOINT,
        params: { item_id: itemId.trim() },
      }),
      transformResponse: (payload: unknown) =>
        extractDetailSource(payload) as ItemPriceDetailsPayload,
      keepUnusedDataFor: 300,
    }),
    getItemPriceDetailsByBarcode: builder.query<ItemPriceDetailsPayload, ItemPriceDetailsByBarcodeQueryArg>({
      query: ({ barcode }) => ({
        url: ITEM_PRICE_DETAILS_BY_BARCODE_ENDPOINT,
        params: { barcode: barcode.trim() },
      }),
      transformResponse: (payload: unknown) =>
        extractDetailSource(payload) as ItemPriceDetailsPayload,
      keepUnusedDataFor: 60,
    }),
    getItemTaxById: builder.query<ItemTaxDetailPayload, ItemTaxQueryArg>({
      query: ({ taxId }) => ({
        url: ITEM_TAX_GET_ENDPOINT,
        params: { tax_id: taxId.trim() },
      }),
      transformResponse: (payload: unknown) =>
        extractDetailSource(payload) as ItemTaxDetailPayload,
      keepUnusedDataFor: 300,
    }),
  }),
});
export const {
  useGetBranchOptionsQuery,
  useGetCompanyOptionsQuery,
  useGetUserOptionsQuery,
  useLazyGetGodownOptionsQuery,
  useLazyGetItemOptionsQuery,
  useLazyGetItemPriceDetailsQuery,
  useLazyGetItemPriceDetailsByBarcodeQuery,
  useLazyGetItemTaxByIdQuery,
  useLazyGetTaxOptionsQuery,
  useLazyGetUnitOptionsQuery,
} = lookupsApi;
