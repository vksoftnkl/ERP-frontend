/**
 * `/api/v1/print-template-assignments/*` -- WHICH design each branch and
 * counter uses, and `resolve`, which answers it.
 *
 * -- `resolve` IS THE ONLY RESOLVER ----------------------------------------
 *
 * Narrowest-wins is a generated column plus a covering index (`ix_pta_resolve`)
 * on the server. This client never re-derives it. `domain/ladder.ts` classifies
 * a row you already hold; `useResolvePrintingAssignmentQuery` is what says which
 * row actually wins, and it returns the printer, the copy count and the
 * published revision along with it.
 *
 * -- THE WRITE SIDE IS SOUND NOW -------------------------------------------
 *
 * This header used to list four reasons nothing here was safe to write. All
 * four were defects in the server's reconstruction of section 5, and
 * `20260827140000_correct_print_template_assignment` fixed every one of them.
 * Kept as a record of what changed, because each one changes what a form may
 * do:
 *
 *   * `ptaCompanyId` WAS required. It is now nullable, and null means the
 *     widest rung -- an assignment for EVERY company. On create the key must
 *     still be PRESENT: the server refuses an omitted company rather than
 *     defaulting to that rung. `null` is a deliberate answer; absent is not an
 *     answer at all. See `everyCompanyAssignment` below.
 *   * `ptaOutputMode` WAS PRINT | PREVIEW | EMAIL | FILE, against a CHECK that
 *     allowed neither FILE nor three modes the API could not send. Both sides
 *     now say PRINT | PREVIEW | PDF | EMAIL | WHATSAPP | ESCPOS, and the
 *     generated vocabulary is read from the document rather than typed here.
 *   * `ptaPrinterName` MEANT TWO THINGS. It is now only the schema's meaning:
 *     a FALLBACK bare queue name, mutually exclusive with `ptaPrinterId` via
 *     `ck_pta_printer_one_of`. The joined display name moved to
 *     `ptaPrinterProfileName`, which is read-only. A form that writes the
 *     fallback into the profile field, or both at once, gets a 400.
 *   * `ptaTemplateCompanyKey` and the composite `fk_pta_template` now exist, so
 *     the server refuses one company being assigned another's private design.
 *     THE CLIENT NEVER SENDS THAT COLUMN: the service reads the owner off the
 *     template itself, because a caller free to state it is free to state the
 *     wrong one. It is present on the payload as read-only evidence.
 */

import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type {
  PrintTemplateAssignmentPayload,
  PrintTemplateAssignmentResolution,
  PtaOutputMode,
  SavePrintTemplateAssignment,
} from "@/features/printing/types/printing";

const BASE = "/print-template-assignments";

export type AssignmentListQuery = {
  search?: string;
  page?: number;
  limit?: number;
  /** Matches this company exactly. Pair with `includeGlobal` to see what it inherits. */
  ptaCompanyId?: string;
  /**
   * With `ptaCompanyId`: also return the every-company rows the company
   * inherits where it has said nothing. Without it: no effect, because the
   * unfiltered list already contains them.
   *
   * Only ever send it as `true` -- see `toParams`.
   */
  includeGlobal?: boolean;
  /** Only the every-company rows. Same true-or-absent rule. */
  globalOnly?: boolean;
  ptaBranchId?: string;
  ptaDeviceId?: string;
  ptaPurposeId?: string;
  ptaTemplateId?: string;
  ptaOutputMode?: PtaOutputMode;
  ptaIsActive?: boolean;
};

/**
 * The resolution key, exactly. Every field of it is part of what a counter
 * gets: paper is NOT in the key, output mode IS -- a 3-inch thermal receipt
 * genuinely is a different artifact from an A4 tax invoice.
 */
export type ResolveQuery = {
  /**
   * Which scope is asking. All three are OPTIONAL and default, server-side, to
   * the session's own — a print button asking "what would I print" should not
   * have to describe itself, and company, branch and counter are all claims on
   * the access token.
   *
   * The Assignments screen still names them, because its question is the other
   * one: "what would a DIFFERENT counter print". That is what an effective-design
   * matrix is for, and it is the only caller with a reason to say.
   */
  companyId?: string;
  branchId?: string | null;
  deviceId?: string | null;
  purposeId: string;
  outputMode?: PtaOutputMode;
};

/**
 * `list` answers with `{ items, page, limit, total }` INSIDE `data` -- one level
 * shallower than the template list, which puts its counts in the envelope's
 * `meta`. The two modules genuinely differ; read each from where it is.
 */
export type AssignmentListResult = {
  items: PrintTemplateAssignmentPayload[];
  page: number;
  limit: number;
  total: number;
};

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

export const printingAssignmentsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    listPrintingAssignments: builder.query<AssignmentListResult, AssignmentListQuery | void>({
      query: (query) => ({ url: `${BASE}/list`, params: toParams(query ?? {}) }),
      transformResponse: (
        response: ApiSuccessResponse<AssignmentListResult>,
      ): AssignmentListResult => ({
        items: Array.isArray(response?.data?.items) ? response.data.items : [],
        page: response?.data?.page ?? 1,
        limit: response?.data?.limit ?? 20,
        total: response?.data?.total ?? 0,
      }),
      providesTags: [{ type: "PrintingAssignment", id: "LIST" }],
    }),

    /**
     * "For this counter, printing this purpose, which design wins?"
     *
     * A 404 is a real and important answer: NOTHING is configured for that
     * scope, which means the till prints nothing. The matrix shows it as a
     * warning row rather than as an error, which is why the caller checks the
     * status rather than surfacing the message.
     */
    resolvePrintingAssignment: builder.query<PrintTemplateAssignmentResolution, ResolveQuery>({
      query: (query) => ({ url: `${BASE}/resolve`, params: toParams(query) }),
      transformResponse: (response: ApiSuccessResponse<PrintTemplateAssignmentResolution>) =>
        response.data,
      providesTags: [{ type: "PrintingAssignment", id: "RESOLVED" }],
    }),

    getPrintingAssignment: builder.query<PrintTemplateAssignmentPayload, string>({
      query: (ptaId) => ({ url: `${BASE}/get`, params: { ptaId } }),
      transformResponse: (response: ApiSuccessResponse<PrintTemplateAssignmentPayload>) =>
        response.data,
      providesTags: (_result, _error, ptaId) => [{ type: "PrintingAssignment", id: ptaId }],
    }),

    /**
     * Create or update by `ptaId` presence.
     *
     * ONE ROW IS ONE CHOICE. There is no `is_default` flag anywhere in this
     * subsystem and there must not be one in the client either: default-ness IS
     * the existence of a `pta_` row. A boolean would reintroduce the
     * clear-then-set bug the schema removed, which is why 3.0's live data holds
     * several defaults for one group.
     *
     * ON CREATE, `ptaCompanyId` MUST BE A KEY IN THE BODY. `JSON.stringify`
     * drops `undefined` and keeps `null`, so building the object with a
     * conditional spread silently produces the request the server refuses.
     * `everyCompanyAssignment` below is the one that says null out loud.
     */
    savePrintingAssignment: builder.mutation<
      PrintTemplateAssignmentPayload,
      SavePrintTemplateAssignment
    >({
      query: (body) => ({ url: `${BASE}/create`, method: "POST", body }),
      transformResponse: (response: ApiSuccessResponse<PrintTemplateAssignmentPayload>) =>
        response.data,
      invalidatesTags: [
        { type: "PrintingAssignment", id: "LIST" },
        { type: "PrintingAssignment", id: "RESOLVED" },
      ],
    }),

    /**
     * Soft delete. Removing the row removes the CHOICE for that scope, and the
     * resolver then falls back to the next rung up -- which is the point, and
     * why this is not the same as pointing the row at a different template.
     */
    deletePrintingAssignment: builder.mutation<{ ptaId: string; deleted: true }, string>({
      query: (ptaId) => ({ url: `${BASE}/delete`, method: "DELETE", params: { ptaId } }),
      transformResponse: (response: ApiSuccessResponse<{ ptaId: string; deleted: true }>) =>
        response.data,
      invalidatesTags: [
        { type: "PrintingAssignment", id: "LIST" },
        { type: "PrintingAssignment", id: "RESOLVED" },
      ],
    }),
  }),
});

/**
 * Re-exported, not defined here: it is pure, it is the thing the editor's tests
 * pin, and a domain module must not import this file -- `baseApi` would drag
 * the whole store into a unit test. `domain/assignmentForm.ts` owns it.
 */
export { everyCompanyAssignment } from "@/features/printing/domain/assignmentForm";

export const {
  useListPrintingAssignmentsQuery,
  useResolvePrintingAssignmentQuery,
  useGetPrintingAssignmentQuery,
  useSavePrintingAssignmentMutation,
  useDeletePrintingAssignmentMutation,
} = printingAssignmentsApi;
