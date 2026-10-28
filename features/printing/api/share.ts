/**
 * `/api/v1/print-share/*` — a rendered document handed out as a link.
 *
 * `create` freezes what was just rendered (revision, document, company, year,
 * branch) under a random token; the server's public `GET /print-share/<token>/…`
 * renders it as a PDF for whoever holds the link, until it expires. The sale
 * bill's WhatsApp send puts one in the message.
 *
 * The answer carries a `path` under the API's version root, and a full `url`
 * only when the server was told its public address (`PRINT_SHARE_PUBLIC_BASE_URL`
 * — an offline site whose links are opened on the cloud). Otherwise the link is
 * this client's own API base plus the path: see `shareLinkUrl`.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

export type CreatePrintShareRequest = {
  /** The revision that was rendered — the one the preview showed. */
  versionId: string;
  docId: string;
  /** The DOCUMENT's company, off the row; left out, the token's. */
  companyId?: string;
  /** The DOCUMENT's year, frozen into the link. */
  accYear?: string;
  branchId?: string;
  /** File name stem the PDF is served under, without extension. */
  filename?: string;
};

export type PrintShareLink = {
  token: string;
  /** `/print-share/<token>/<file>.pdf`, under the API's version root. */
  path: string;
  url: string | null;
  /** ISO timestamp. */
  expiresAt: string;
};

/**
 * The link to put in a message.
 *
 * The server's own URL wins when it has one. Otherwise the path goes under the
 * API base this client already talks to — absolute in a split deployment,
 * relative (`/api/v1`) when nginx serves both on one origin, which is why the
 * page's origin is the fallback base.
 */
export function shareLinkUrl(link: PrintShareLink, apiBase: string, origin: string): string {
  if (link.url) {
    return link.url;
  }
  return new URL(`${apiBase.replace(/\/+$/, "")}${link.path}`, origin).toString();
}

export const printShareApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** `POST /print-share/create`. Writes no data any screen shows, so it purges nothing. */
    createPrintShareLink: builder.mutation<PrintShareLink, CreatePrintShareRequest>({
      query: (body) => ({ url: "/print-share/create", method: "POST", body }),
      transformResponse: (response: ApiSuccessResponse<PrintShareLink>) => response.data,
    }),
  }),
});

export const { useCreatePrintShareLinkMutation } = printShareApi;
