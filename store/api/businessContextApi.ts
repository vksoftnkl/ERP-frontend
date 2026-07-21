import { baseApi } from "@/store/api/baseApi";
import { extractRows } from "@/features/masters/shared/normalizers";
export type CompanyRecord = {
  id: string;
  /** Alias for `id` — preserved for backward-compat with existing consumers. */
  compId: string;
  name: string;
};
export type BranchRecord = {
  id: string;
  /** Alias for `id` — preserved for backward-compat with existing consumers. */
  brId: string;
  name: string;
};
export type FiscalYearRecord = {
  id: string;
  name: string;
  beginDate: string | null;
  endDate: string | null;
  status: string;
  isCurrent: boolean;
};
const COMPANY_LIST_ENDPOINT = "/master-lookups/name-id/all-masters";
const BRANCH_BY_COMPANY_ENDPOINT = "/master-lookups/branches/by-company";
const FISCAL_YEAR_BY_COMPANY_ENDPOINT = "/master-lookups/fiscal-years/by-company";
const COMPANY_ID_KEYS = ["compId", "comp_id", "company_id", "companyId", "id", "_id"] as const;
const COMPANY_NAME_KEYS = [
  "compName",
  "comp_name",
  "company_name",
  "companyName",
  "name",
] as const;
const BRANCH_ID_KEYS = ["brId", "br_id", "branch_id", "branchId", "id", "_id"] as const;
const BRANCH_NAME_KEYS = [
  "brName",
  "br_name",
  "branch_name",
  "branchName",
  "name",
] as const;
function getFirstString(
  source: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const val = source[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return null;
}
function normalizeCompany(raw: Record<string, unknown>): CompanyRecord | null {
  const id = getFirstString(raw, COMPANY_ID_KEYS);
  const name = getFirstString(raw, COMPANY_NAME_KEYS);
  if (!id || !name) return null;
  return { id, compId: id, name };
}
function normalizeBranch(raw: Record<string, unknown>): BranchRecord | null {
  const id = getFirstString(raw, BRANCH_ID_KEYS);
  const name = getFirstString(raw, BRANCH_NAME_KEYS);
  if (!id || !name) return null;
  return { id, brId: id, name };
}
function normalizeFiscalYear(raw: Record<string, unknown>): FiscalYearRecord | null {
  const id = getFirstString(raw, ["id", "fyId", "fy_id"]);
  const name = getFirstString(raw, ["name", "fyYearName", "fy_year_name"]);
  if (!id || !name) return null;
  const beginDate = getFirstString(raw, ["beginDate", "fyBeginDate", "fy_begin_date"]);
  const endDate = getFirstString(raw, ["endDate", "fyEndDate", "fy_end_date"]);
  const status = getFirstString(raw, ["status", "fyStatus", "fy_status"]) ?? "";
  const isCurrent = raw.isCurrent === true || raw.fyIsCurrent === true || raw.fy_is_current === true;
  return { id, name, beginDate, endDate, status, isCurrent };
}
export const businessContextApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getCompanyList: builder.query<CompanyRecord[], void>({
      query: () => ({
        url: COMPANY_LIST_ENDPOINT,
        params: { module: "companies" },
      }),
      transformResponse: (payload: unknown) =>
        extractRows<Record<string, unknown>>(payload)
          .map(normalizeCompany)
          .filter((c): c is CompanyRecord => c !== null),
      providesTags: ["CompanyList"],
      keepUnusedDataFor: 300,
    }),
    getBranchesByCompany: builder.query<BranchRecord[], string>({
      query: (companyId) => ({
        url: `${BRANCH_BY_COMPANY_ENDPOINT}/${encodeURIComponent(companyId)}`,
      }),
      transformResponse: (payload: unknown) =>
        extractRows<Record<string, unknown>>(payload)
          .map(normalizeBranch)
          .filter((b): b is BranchRecord => b !== null),
      providesTags: (_, __, companyId) => [{ type: "BranchList", id: companyId }],
      keepUnusedDataFor: 60,
    }),
    getFiscalYearsByCompany: builder.query<FiscalYearRecord[], string>({
      query: (companyId) => ({
        url: `${FISCAL_YEAR_BY_COMPANY_ENDPOINT}/${encodeURIComponent(companyId)}`,
      }),
      transformResponse: (payload: unknown) =>
        extractRows<Record<string, unknown>>(payload)
          .map(normalizeFiscalYear)
          .filter((f): f is FiscalYearRecord => f !== null),
      providesTags: (_, __, companyId) => [{ type: "FiscalYearList", id: companyId }],
      keepUnusedDataFor: 60,
    }),
  }),
});
export const {
  useGetCompanyListQuery,
  useGetBranchesByCompanyQuery,
  useLazyGetBranchesByCompanyQuery,
  useGetFiscalYearsByCompanyQuery,
} = businessContextApi;