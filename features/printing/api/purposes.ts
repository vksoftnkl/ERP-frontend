/**
 * WHAT can be printed -- the real list, from `print_purpose`.
 *
 * -- WHY A CONFIGURED DROPDOWN AND NOT AN ENDPOINT -------------------------
 *
 * `print_purpose` has no controller of its own, and writing one is a server
 * release. This codebase already has the mechanism for exactly this case:
 * `fixed.dropdown_details` holds SQL, `GET /dropdown-details/run` executes it
 * with server-side search and pagination, and adding one is a row rather than a
 * deploy. The same table already backs the state, company, branch and item
 * pickers.
 *
 * So the purposes come from dropdown 47, provisioned as data. That keeps
 * section 12's rule intact -- there is still no hard-coded list of purposes
 * anywhere in this client, and a site that adds a Kitchen Order Ticket sees it
 * without a front-end change.
 *
 * -- THE ROW IS CONFIGURATION, SO IT CAN BE ABSENT -------------------------
 *
 * A dropdown id is runtime data, not a migration: an environment that has not
 * been provisioned answers 404 or an empty list. That is why `PURPOSE_DROPDOWN_ID`
 * is a single constant, why the query never throws, and why the picker keeps the
 * derived list (`domain/purposes.ts`) as its fallback. The screen degrades to
 * what it did before rather than losing the field.
 *
 * -- THE PARAMETER IS NOT OPTIONAL ----------------------------------------
 *
 * The stored SQL scopes to `ppo_company_id IS NULL OR ppo_company_id =
 * prm_company_id` -- shipped purposes plus the caller's own. `dropdown_param`
 * is substituted by NAME into the SQL text, so a request that omits it leaves
 * the bare token `prm_company_id` in the query and errors. It is always sent,
 * `null` included, which resolves to `= NULL` and yields the shipped rows alone.
 * This is also why `useLazyConfiguredDropdown` is not used here: it documents
 * that it never sends `dropdown_param`.
 */

import { baseApi } from "@/store/api/baseApi";
import type { PrintPurposeRef } from "@/features/printing/types/printing";

const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";

/**
 * `fixed.dropdown_details.dropdown_id` for PRINT PURPOSES.
 *
 * Provisioned as data, so it must exist in every environment. The SQL that
 * creates it is in the module's manual; if it is missing here the picker falls
 * back to the purposes other rows already reference.
 */
export const PURPOSE_DROPDOWN_ID = "47";

/** How many purposes to show before the operator has to search. Twelve ship. */
const PURPOSE_PAGE_SIZE = 50;

type PurposeRow = {
  ppo_id?: unknown;
  ppo_code?: unknown;
  ppo_name?: unknown;
  ppo_src_module?: unknown;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function toPurposes(payload: unknown): PrintPurposeRef[] {
  const items = (payload as { data?: { items?: unknown } } | undefined)?.data?.items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((row): PrintPurposeRef[] => {
    if (typeof row !== "object" || row === null) return [];
    const record = row as PurposeRow;
    const ppoId = text(record.ppo_id);
    if (!ppoId) return [];
    return [{ ppoId, ppoCode: text(record.ppo_code), ppoName: text(record.ppo_name) }];
  });
}

export type PurposeQuery = {
  /** Shipped purposes plus this company's. Null yields the shipped ones alone. */
  companyId: string | null;
  search?: string;
};

export const printingPurposesApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getPrintPurposeOptions: builder.query<PrintPurposeRef[], PurposeQuery>({
      query: ({ companyId, search }) => ({
        url: DROPDOWN_RUN_ENDPOINT,
        params: {
          dropdown_id: PURPOSE_DROPDOWN_ID,
          page: "1",
          limit: String(PURPOSE_PAGE_SIZE),
          // Always sent — see the note above.
          dropdown_param: JSON.stringify({ prm_company_id: companyId }),
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: toPurposes,
      providesTags: (_result, _error, arg) => [
        { type: "PrintingPurpose" as const, id: arg.search?.trim() || "all" },
      ],
      // The twelve shipped rows change when somebody adds a printable thing,
      // not while a design is being drawn.
      keepUnusedDataFor: 600,
    }),
  }),
});

export const { useGetPrintPurposeOptionsQuery } = printingPurposesApi;
