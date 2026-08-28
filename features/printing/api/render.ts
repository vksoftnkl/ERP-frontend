/**
 * `/api/v1/print-render/*` — the renderer, which now exists.
 *
 * -- WHAT CHANGED -----------------------------------------------------------
 *
 * The canvas's Preview button was written against `POST /reports/preview`, and
 * that endpoint 404'd along with the rest of `/reports/*`. It was hidden rather
 * than left to fail on every click. The server-side renderer has since been
 * built on the printing module's own tables, so Preview is reachable again —
 * through a different route, with a different contract, and without reviving
 * anything of `/reports`.
 *
 * -- THE CONTRACT IS NOT THE OLD ONE ----------------------------------------
 *
 * `/reports/preview` took a DEFINITION and rendered whatever it was handed.
 * This takes a `versionId` and renders what the server has stored, because the
 * whole printing engine rests on `print_log.plg_version_id` pointing at the
 * exact bytes that were rendered — a claim the server cannot make about a
 * design it only saw in a request body.
 *
 * An unsaved `body` may stand in for the stored bands, and only against a DRAFT
 * revision. The paper and the datasets always come from the revision regardless,
 * so what Preview shows differs from what Print produces by exactly the bands
 * being edited, and by nothing else.
 *
 * -- THERE IS NO SAMPLE DATA --------------------------------------------------
 *
 * `/reports/preview` could render against provider sample rows with no database
 * access. Nothing here does: a preview runs the revision's real datasets, which
 * is what makes it worth looking at. A design whose datasets need a document
 * therefore needs a document id, and says so — the server's refusal names which
 * dataset and what it wanted.
 */

import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

const BASE = "/print-render";

/** What the dialog asks for. Company is NOT here: the server takes it from the session. */
export type RenderPreviewRequest = {
  /** The revision to render — print_template_version.ptv_id. */
  versionId: string;
  /**
   * The canvas's unsaved bands. Accepted only against a DRAFT revision; a
   * published one is frozen and the server refuses, naming the way through.
   */
  body?: Record<string, unknown>;
  /** Binds :doc_id. Required by any dataset that reads a document. */
  docId?: string;
  /** The DOCUMENT's accounting year — binds :acc_year. */
  accYear?: string;
  branchId?: string;
  deviceId?: string;
  /** Answers to the revision's own prompts (ptvParams), by prompt name. */
  params?: Record<string, unknown>;
  /** Normally omitted: a GRAPHIC design renders as PDF, a GRID one as ESCPOS. */
  outputMode?: string;
  copies?: number;
};

/**
 * A rendered preview, in a form Redux can hold.
 *
 * Deliberately NOT the Blob. A mutation's result travels through a dispatched
 * action and is kept in the store while the hook is mounted, and a Blob is
 * neither serialisable nor comparable. So the response handler consumes the
 * blob at the fetch boundary and passes on only strings and numbers.
 *
 * The object URL's lifetime therefore belongs to the caller: whoever receives
 * one must revoke it when it is replaced or when the component unmounts.
 */
export type RenderPreviewResult = {
  /** Set for PDF output; the caller owns revoking it. */
  objectUrl: string | null;
  /** Set for the raw printer modes, which have no viewer. */
  text: string | null;
  contentType: string;
  /** From `X-Print-Pages`. */
  pageCount: number | null;
  copies: number | null;
  /** The revision that actually drew this, as the server reports it back. */
  revNo: number | null;
  outputMode: string | null;
  /** How many warnings the render produced; the detail is in the server log. */
  warnings: number | null;
  byteLength: number;
};

/**
 * What `POST /print-render/print` needs to know.
 *
 * Company is absent for the same reason it is absent above: the server takes it
 * from the session, and a caller-supplied one would make this a cross-tenant
 * read with a friendly name. `deviceId` is absent for the reason given on the
 * endpoint.
 */
export type PrintDocumentRequest = {
  /** WHAT is being printed OF the document — `print_purpose.ppo_id`. */
  purposeId: string;
  /** The document. Binds :doc_id. */
  docId: string;
  /** The DOCUMENT's accounting year — the partition it lives in, `2026-2027`. */
  accYear: string;
  /** Binds :branch_id and narrows the ladder. */
  branchId?: string;
  /**
   * The COUNTER — `fixed.device_master.dev_id`, and the narrowest rung of the
   * ladder. See the endpoint's note for which id this is and which it is not.
   */
  deviceId?: string;
  /** Recorded on the print log's source quad; each defaults to the purpose's own. */
  srcModule?: string;
  srcDocType?: string;
  /** Answers to the resolved revision's own prompts, by prompt name. */
  params?: Record<string, unknown>;
  /** Overrides the copy count the assignment and the purpose agree on. */
  copies?: number;
  /**
   * Log this as a REPRINT rather than a PRINT.
   *
   * Not a status transition — it is another row in the print log, which IS the
   * record of printing. Refused outright when the purpose sets
   * `ppoAllowReprint` false.
   */
  isReprint?: boolean;
  /** Filename stem for the download, without extension. */
  filename?: string;
};

/** A render, plus the two facts only a real print produces. */
export type PrintDocumentResult = RenderPreviewResult & {
  /** One `print_log` id per copy, from `X-Print-Log-Ids`. Empty when CORS hides it. */
  printLogIds: string[];
  /** Which rung of the ladder won, from `X-Print-Scope`. */
  scope: string | null;
};

/**
 * Read a render response — bytes, or a refusal, or the inspect payload.
 *
 * Shared by both endpoints because both have the same two jobs, and the second
 * is the one that is easy to get wrong. The default JSON handler would corrupt
 * a PDF, so the body is read as a blob — but a REFUSAL is json, and reading
 * that as a blob would strip the very thing worth showing. The server's
 * refusals are specific ("band references unknown dataset 'lines'",
 * "sales.bill.header reads a table partitioned by accounting year, and the
 * render named none"), and they carry a path into the design. So this branches
 * on the content type and lets a json error through unchanged, where
 * `getApiErrorMessage` can find it.
 */
async function readRenderResponse(
  response: Response,
  options: { logIds?: boolean } = {},
): Promise<unknown> {
  const contentType = response.headers.get("Content-Type") ?? "";

  // Errors, and the inspect payload, are json. Hand them back as json so RTK's
  // error path and the envelope unwrapper both work.
  if (contentType.includes("json")) {
    return (await response.json()) as unknown;
  }

  const blob = await response.blob();
  const isPdf = contentType.includes("pdf");

  /*
   * A MISSING header is null, not zero.
   *
   * `Number(null)` is 0, which would have a caller report "0 pages" for a
   * render whose headers it simply could not read — and it cannot read them
   * whenever the page and the API are on different origins, because the API
   * sends no `Access-Control-Expose-Headers`. That is the local dev setup
   * (client :3000, API :3011) but not production, where nginx puts both behind
   * one origin. Null is the honest answer, and callers hide the badge for it.
   */
  const readNumber = (name: string): number | null => {
    const raw = response.headers.get(name);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  const rendered: RenderPreviewResult = {
    // Consumed here so nothing non-serialisable reaches the store.
    objectUrl: isPdf ? URL.createObjectURL(blob) : null,
    text: isPdf ? null : await blob.text(),
    contentType: contentType || blob.type,
    pageCount: readNumber("X-Print-Pages"),
    copies: readNumber("X-Print-Copies"),
    revNo: readNumber("X-Print-Rev-No"),
    outputMode: response.headers.get("X-Print-Output-Mode"),
    warnings: readNumber("X-Print-Warnings"),
    byteLength: blob.size,
  };

  if (!options.logIds) return rendered;

  // Same CORS caveat as the numbers above: an unreadable header is no ids
  // rather than one empty-string id, so `split` never runs on a null.
  const rawLogIds = response.headers.get("X-Print-Log-Ids") ?? "";
  return {
    ...rendered,
    printLogIds: rawLogIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
    scope: response.headers.get("X-Print-Scope"),
  } satisfies PrintDocumentResult;
}

export const printRenderApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /**
     * Render one revision and hand back something displayable.
     *
     * `responseHandler` has to do two jobs, and the second is the one that is
     * easy to get wrong. The default JSON handler would corrupt a PDF, so the
     * body is read as a blob — but a REFUSAL is json, and reading that as a
     * blob would strip the very thing worth showing. The server's refusals are
     * specific ("band references unknown dataset 'lines'", "sales.bill.header
     * reads a table partitioned by accounting year, and the render named
     * none"), and they carry a path into the design. So the handler branches on
     * the content type and lets a json error through unchanged, where
     * `getApiErrorMessage` can find it.
     */
    renderPrintPreview: builder.mutation<RenderPreviewResult, RenderPreviewRequest>({
      query: (body) => ({
        url: `${BASE}/preview`,
        method: "POST",
        body,
        responseHandler: (response) => readRenderResponse(response),
      }),
    }),

    /**
     * Print a real document, through the assignment ladder.
     *
     * -- WHY THERE IS NO templateId HERE ---------------------------------
     *
     * Deliberately absent, and the server refuses to grow one. Which design a
     * counter gets is a row in `print_template_assignment` — "one row IS one
     * choice" — so a caller able to name a template would be a second place
     * that decides it, and the two would drift. A screen that wants a NAMED
     * revision is previewing, and that is the endpoint above.
     *
     * So a print button carries the document and WHAT is being printed of it
     * (the purpose), and nothing about how. Counter, branch, company and
     * every-company are resolved server-side, in that order.
     *
     * -- `deviceId` IS A COUNTER, AND THERE ARE TWO OF THEM ----------------
     *
     * `plg_device_id` carries `fk_plg_device` into `fixed.device_master`, so
     * only a REGISTERED counter may be named. This client holds two ids and
     * only one of them is that:
     *
     *   `userInfo.deviceId`            the login response's `device_id` — a
     *                                  real `dev_id` row. THIS ONE.
     *   `getOrCreateClientDeviceId()`  a localStorage `crypto.randomUUID`
     *                                  minted for the transaction-hold lock,
     *                                  matching no row anywhere. NEVER THIS ONE.
     *
     * Sending the wrong one resolves no counter rung and then fails the print
     * log's foreign key AFTER the paper has been rendered. Sending none at all
     * resolves the ladder from the branch up, which is the honest reading of a
     * session that was never registered as a counter.
     *
     * -- A REFUSAL IS OFTEN CONFIGURATION, NOT A FAULT ---------------------
     *
     * "The assigned template has no published revision" and "nothing is
     * assigned for this purpose" are 404s that mean the printing module has not
     * been finished for this purpose yet. They are shown to the operator as
     * written: they name what an administrator has to go and do.
     */
    printDocument: builder.mutation<PrintDocumentResult, PrintDocumentRequest>({
      query: (body) => ({
        url: `${BASE}/print`,
        method: "POST",
        body,
        responseHandler: (response) => readRenderResponse(response, { logIds: true }),
      }),
    }),

    /**
     * The dataset providers this build carries.
     *
     * What a `ptdProviderCode` may name. A provider is CODE, so a template
     * naming one the server does not have cannot be fixed by editing data —
     * which is exactly why the Data tab should be able to show the list rather
     * than let an author type a code and find out at print time.
     */
    listPrintDataProviders: builder.query<PrintDataProvider[], void>({
      query: () => ({ url: `${BASE}/providers` }),
      transformResponse: (response: ApiSuccessResponse<PrintDataProvider[]>) => response.data,
    }),
  }),
});

export type PrintDataProvider = {
  code: string;
  label: string;
  cardinality: "one" | "many";
};

export const {
  useRenderPrintPreviewMutation,
  usePrintDocumentMutation,
  useListPrintDataProvidersQuery,
} = printRenderApi;
