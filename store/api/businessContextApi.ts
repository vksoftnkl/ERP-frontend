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
const COMPANY_LIST_ENDPOINT = "/master-lookups/name-id/all-masters";
const BRANCH_BY_COMPANY_ENDPOINT = "/master-lookups/branches/by-company";
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
  }),
});
export const {
  useGetCompanyListQuery,
  useGetBranchesByCompanyQuery,
  useLazyGetBranchesByCompanyQuery,
} = businessContextApi;