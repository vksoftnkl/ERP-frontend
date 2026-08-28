/**
 * `/api/v1/print-templates/*` -- the four routes the whole template side has.
 *
 * There is deliberately no per-version and no per-dataset endpoint: a revision
 * is added by posting the array it belongs to, and a dataset by posting the
 * array on the revision that owns it. One call carries all three tables.
 *
 * Two things about this client are worth knowing before using it.
 *
 * THE SAVE IS `create` FOR BOTH CREATE AND UPDATE. `ptlId` present updates,
 * absent creates. Everything about which keys to send is `domain/
 * buildSavePayload.ts`; nothing here builds a body, and nothing outside that
 * module should either.
 *
 * `get` RETURNS THE WHOLE HISTORY -- every revision and each revision's
 * datasets. The Designer renders one working revision and a read-only rail, so
 * it holds one `DesignerDraft`, not every revision's body, in component state.
 * That is why `keepUnusedDataFor` is 0 here: the Designer takes a copy the
 * moment it loads, and a cached second copy would only be a stale rival source
 * of truth.
 */

import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse, ListMeta } from "@/utils/types";
import type {
  PrintTemplateDeleteResult,
  PrintTemplatePayload,
  PtvEngine,
  SavePrintTemplate,
} from "@/features/printing/types/printing";

const BASE = "/print-templates";

export type TemplateListQuery = {
  search?: string;
  page?: number;
  /** The server caps this at 100. */
  limit?: number;
  ptlCompanyId?: string;
  /**
   * With `ptlCompanyId`: false (the default) returns that company's templates
   * AND the shipped ones it can use; true returns only its own.
   */
  onlyOwned?: boolean;
  ptlPurposeId?: string;
  /** Asks about the PUBLISHED revision, so a draft-only template matches neither. */
  engine?: PtvEngine;
  isPublished?: boolean;
  ptlIsActive?: boolean;
  /** false for a light pick list: header rows only, no versions and no datasets. */
  includeVersions?: boolean;
};

export type TemplateListResult = { items: PrintTemplatePayload[]; meta: ListMeta };

/**
 * Query parameters, with the one rule that matters more than the rest.
 *
 * -- A QUERY BOOLEAN CAN ONLY MEAN "TRUE" OR "ABSENT" ----------------------
 *
 * `false` MUST NEVER BE SENT. The server's global ValidationPipe runs with
 * `enableImplicitConversion: true`, so a query string is coerced to the DTO's
 * declared `boolean` BEFORE `@OptionalQueryBoolean`'s transform can read it --
 * and every non-empty string is truthy. Verified against the running API on
 * 27-08-2026: `isPublished=` true, false, 0, 1, no, off and FALSE ALL return
 * the published-only rows.
 *
 * So `onlyOwned=false` does not mean "include the shipped designs", it means
 * "exclude them" -- the exact opposite -- and there is no encoding that fixes
 * it. Omitting the key is the only way to say false, and it works because every
 * one of these filters defaults to the false-ish reading.
 *
 * `forbidNonWhitelisted: true` is also on, so an undeclared key is a 400 rather
 * than an ignored one, and `undefined` would be serialised as the string
 * "undefined".
 */
function toParams(query: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    // See above: `false` reaches the server as `true`. Omit it instead.
    if (value === false) continue;
    params[key] = String(value);
  }
  return params;
}

export const printingTemplatesApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    listPrintingTemplates: builder.query<TemplateListResult, TemplateListQuery | void>({
      query: (query) => ({ url: `${BASE}/list`, params: toParams({ ...(query ?? {}) }) }),
      /*
       * `total` lives in the envelope's `meta`, not beside the rows, and the
       * pager needs it -- reading it off `data.length` sticks the table at one
       * page. `total_pages` is computed server-side from the limit that was
       * actually applied.
       */
      transformResponse: (
        response: ApiSuccessResponse<PrintTemplatePayload[], ListMeta>,
      ): TemplateListResult => ({
        items: Array.isArray(response?.data) ? response.data : [],
        meta: response?.meta ?? { page: 1, limit: 20, total: 0, total_pages: 0 },
      }),
      providesTags: (result) => [
        { type: "PrintingTemplate" as const, id: "LIST" },
        ...(result?.items ?? []).map((template) => ({
          type: "PrintingTemplate" as const,
          id: template.ptlId,
        })),
      ],
    }),

    getPrintingTemplate: builder.query<PrintTemplatePayload, string>({
      query: (ptlId) => ({ url: `${BASE}/get`, params: { ptlId } }),
      transformResponse: (response: ApiSuccessResponse<PrintTemplatePayload>) => response.data,
      providesTags: (_result, _error, ptlId) => [{ type: "PrintingTemplate", id: ptlId }],
      // The Designer owns the draft the moment this lands. See the file note.
      keepUnusedDataFor: 0,
    }),

    /**
     * Create AND update. The body comes from `buildSavePayload`; passing a
     * hand-built object here is how a publish gets silently reverted (Trap 4).
     */
    savePrintingTemplate: builder.mutation<PrintTemplatePayload, SavePrintTemplate>({
      query: (body) => ({ url: `${BASE}/create`, method: "POST", body }),
      transformResponse: (response: ApiSuccessResponse<PrintTemplatePayload>) => response.data,
      invalidatesTags: (result) => [
        { type: "PrintingTemplate", id: "LIST" },
        ...(result ? [{ type: "PrintingTemplate" as const, id: result.ptlId }] : []),
        // A save can move the published pointer, and `/resolve` answers with it.
        { type: "PrintingAssignment" as const, id: "RESOLVED" },
      ],
    }),

    /**
     * Soft delete, with every revision and dataset.
     *
     * Soft because `print_log` still points at those revisions and "what did
     * this bill look like" has to keep answering after the design is withdrawn.
     * Refused while an assignment still points at the template -- a counter
     * would otherwise resolve to a design that is gone.
     */
    deletePrintingTemplate: builder.mutation<
      PrintTemplateDeleteResult,
      { ptlId: string; ptlModifiedBy?: string }
    >({
      query: ({ ptlId, ptlModifiedBy }) => ({
        url: `${BASE}/delete`,
        method: "DELETE",
        params: ptlModifiedBy ? { ptlId, ptlModifiedBy } : { ptlId },
      }),
      transformResponse: (response: ApiSuccessResponse<PrintTemplateDeleteResult>) => response.data,
      invalidatesTags: (_result, _error, { ptlId }) => [
        { type: "PrintingTemplate", id: "LIST" },
        { type: "PrintingTemplate", id: ptlId },
      ],
    }),
  }),
});

export const {
  useListPrintingTemplatesQuery,
  useGetPrintingTemplateQuery,
  useSavePrintingTemplateMutation,
  useDeletePrintingTemplateMutation,
} = printingTemplatesApi;
