/**
 * The print template API.
 *
 * Every endpoint here already existed before the designer did — the backend's
 * fast path was "author JSON, POST it, iterate by PUT" — so this file adds no
 * server surface, only a typed client for it.
 *
 * Two endpoint URLs differ from the obvious guess and are worth stating: the
 * dataset catalogue is mounted UNDER templates (`/reports/templates/datasets/
 * catalogue`) because it is only ever consumed alongside one, and preview lives
 * on the print controller (`/reports/preview`), not the template controller.
 */

import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type {
  ProviderDescriptor,
  TemplateDefinition,
  TemplateExportPayload,
  TemplatePayload,
  TemplateRevisionPayload,
  TemplateSchemaVocabulary,
  TemplateSummaryPayload,
} from "@/features/print-designer/types/template-definition";

const TEMPLATES_ENDPOINT = "/reports/templates";
const PREVIEW_ENDPOINT = "/reports/preview";

/**
 * The list page runs on the shared `CrudMasterPage` shell, which fetches rows
 * through `mastersApi`'s generic list query rather than through
 * `listPrintTemplates`. That cache entry is tagged by its list URL, so every
 * mutation below has to invalidate it as well — otherwise a clone, an import or
 * a new default lands on the server and the table the user is looking at keeps
 * showing the old rows.
 */
const MASTER_LIST_TAG = { type: "MasterList" as const, id: TEMPLATES_ENDPOINT };
const TEMPLATE_LIST_TAGS = [{ type: "PrintTemplate" as const, id: "LIST" }, MASTER_LIST_TAG];

export type TemplateListQuery = {
  ptDocType?: string;
  ptOutputMode?: string;
  ptPaperCode?: string;
  ptCompanyId?: string;
  ptBranchId?: string;
  includeSystem?: boolean;
  activeOnly?: boolean;
};

export type CreateTemplateBody = {
  ptDocType: string;
  ptOutputMode: string;
  ptPaperCode: string;
  ptName: string;
  ptCompanyId?: string;
  ptBranchId?: string;
  ptIsDefault?: boolean;
  ptIsActive?: boolean;
  definition: TemplateDefinition;
};

export type UpdateTemplateBody = {
  ptName?: string;
  ptIsActive?: boolean;
  definition?: TemplateDefinition;
  note?: string;
};

export type CloneTemplateBody = {
  ptName?: string;
  ptCompanyId?: string;
  ptBranchId?: string;
  ptIsDefault?: boolean;
};

export type ImportTemplateBody = {
  payload: Record<string, unknown>;
  ptName?: string;
  ptCompanyId?: string;
  ptBranchId?: string;
};

export type PreviewRequest = {
  definition: TemplateDefinition;
  /** Omitted lets the server derive it: GRID -> ESCPOS, otherwise PDF. */
  mode?: string;
  useSampleData?: boolean;
  /** Render a real document instead of sample data. */
  docId?: string;
  accYear?: string;
  branchId?: string;
  printerProfile?: string;
  params?: Record<string, unknown>;
};

/**
 * A rendered preview, in a form Redux can hold.
 *
 * Deliberately NOT the Blob. A mutation's result travels through a dispatched
 * action and is kept in the store while the hook is mounted, and a Blob is
 * neither serialisable nor comparable — RTK's dev-time serialisability check
 * flags it, and any future state persistence would silently drop it. So the
 * response handler consumes the blob at the fetch boundary and passes on only
 * strings and numbers: an object URL for a PDF, decoded text for the raw
 * printer modes.
 *
 * The object URL's lifetime therefore belongs to the caller: whoever receives
 * one must revoke it when it is replaced or when the component unmounts. See
 * PreviewDialog's `replaceObjectUrl`.
 */
export type PreviewResult = {
  /** Set for PDF output; the caller owns revoking it. */
  objectUrl: string | null;
  /** Set for the raw printer modes, which have no viewer. */
  text: string | null;
  contentType: string;
  /** From `X-Report-Page-Count`; the engine is the only thing that knows. */
  pageCount: number | null;
  renderMs: number | null;
  byteLength: number;
};

/** Unwrap the module's `{ success, message, data }` envelope. */
const unwrap = <T>(response: ApiSuccessResponse<T>): T => response.data;

export const printTemplateApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    listPrintTemplates: builder.query<TemplateSummaryPayload[], TemplateListQuery | void>({
      query: (params) => ({ url: TEMPLATES_ENDPOINT, params: params ?? undefined }),
      transformResponse: unwrap<TemplateSummaryPayload[]>,
      providesTags: (result) => [
        { type: "PrintTemplate" as const, id: "LIST" },
        ...(result ?? []).map((template) => ({
          type: "PrintTemplate" as const,
          id: template.ptId,
        })),
      ],
    }),

    getPrintTemplate: builder.query<TemplatePayload, string>({
      query: (ptId) => ({ url: `${TEMPLATES_ENDPOINT}/${ptId}` }),
      transformResponse: unwrap<TemplatePayload>,
      providesTags: (_result, _error, ptId) => [{ type: "PrintTemplate", id: ptId }],
      // The designer holds the definition in its own store the moment it loads.
      // A cached copy would only be a stale second source of truth.
      keepUnusedDataFor: 0,
    }),

    /**
     * The palette vocabulary. Cached for the session: bands, papers and
     * transforms change when the server is redeployed, not while a user designs.
     */
    getPrintTemplateSchema: builder.query<TemplateSchemaVocabulary, void>({
      query: () => ({ url: `${TEMPLATES_ENDPOINT}/schema` }),
      transformResponse: unwrap<TemplateSchemaVocabulary>,
      providesTags: ["PrintTemplateVocabulary"],
      keepUnusedDataFor: 3_600,
    }),

    getPrintDatasets: builder.query<ProviderDescriptor[], string | void>({
      query: (docType) => ({
        url: `${TEMPLATES_ENDPOINT}/datasets/catalogue`,
        params: docType ? { docType } : undefined,
      }),
      transformResponse: unwrap<ProviderDescriptor[]>,
      providesTags: ["PrintDatasetCatalogue"],
      keepUnusedDataFor: 3_600,
    }),

    createPrintTemplate: builder.mutation<TemplatePayload, CreateTemplateBody>({
      query: (body) => ({ url: TEMPLATES_ENDPOINT, method: "POST", body }),
      transformResponse: unwrap<TemplatePayload>,
      invalidatesTags: TEMPLATE_LIST_TAGS,
    }),

    updatePrintTemplate: builder.mutation<
      TemplatePayload,
      { ptId: string; body: UpdateTemplateBody }
    >({
      query: ({ ptId, body }) => ({ url: `${TEMPLATES_ENDPOINT}/${ptId}`, method: "PUT", body }),
      transformResponse: unwrap<TemplatePayload>,
      invalidatesTags: (_result, _error, { ptId }) => [
        { type: "PrintTemplate", id: ptId },
        { type: "PrintTemplate", id: "LIST" },
        { type: "PrintTemplateRevision", id: ptId },
        MASTER_LIST_TAG,
      ],
    }),

    clonePrintTemplate: builder.mutation<
      TemplatePayload,
      { ptId: string; body?: CloneTemplateBody }
    >({
      query: ({ ptId, body }) => ({
        url: `${TEMPLATES_ENDPOINT}/${ptId}/clone`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: unwrap<TemplatePayload>,
      invalidatesTags: TEMPLATE_LIST_TAGS,
    }),

    setPrintTemplateDefault: builder.mutation<TemplateSummaryPayload, string>({
      query: (ptId) => ({ url: `${TEMPLATES_ENDPOINT}/${ptId}/set-default`, method: "PUT" }),
      transformResponse: unwrap<TemplateSummaryPayload>,
      // Promoting one template demotes another, so the whole list is stale.
      invalidatesTags: TEMPLATE_LIST_TAGS,
    }),

    deletePrintTemplate: builder.mutation<{ ptId: string; deleted: boolean }, string>({
      query: (ptId) => ({ url: `${TEMPLATES_ENDPOINT}/${ptId}`, method: "DELETE" }),
      transformResponse: unwrap<{ ptId: string; deleted: boolean }>,
      invalidatesTags: TEMPLATE_LIST_TAGS,
    }),

    listPrintTemplateRevisions: builder.query<TemplateRevisionPayload[], string>({
      query: (ptId) => ({ url: `${TEMPLATES_ENDPOINT}/${ptId}/revisions` }),
      transformResponse: unwrap<TemplateRevisionPayload[]>,
      providesTags: (_result, _error, ptId) => [{ type: "PrintTemplateRevision", id: ptId }],
    }),

    rollbackPrintTemplate: builder.mutation<
      TemplatePayload,
      { ptId: string; version: number }
    >({
      query: ({ ptId, version }) => ({
        url: `${TEMPLATES_ENDPOINT}/${ptId}/rollback/${version}`,
        method: "POST",
      }),
      transformResponse: unwrap<TemplatePayload>,
      invalidatesTags: (_result, _error, { ptId }) => [
        { type: "PrintTemplate", id: ptId },
        { type: "PrintTemplate", id: "LIST" },
        { type: "PrintTemplateRevision", id: ptId },
        MASTER_LIST_TAG,
      ],
    }),

    exportPrintTemplate: builder.query<TemplateExportPayload, string>({
      query: (ptId) => ({ url: `${TEMPLATES_ENDPOINT}/${ptId}/export` }),
      transformResponse: unwrap<TemplateExportPayload>,
      keepUnusedDataFor: 0,
    }),

    importPrintTemplate: builder.mutation<TemplatePayload, ImportTemplateBody>({
      query: (body) => ({ url: `${TEMPLATES_ENDPOINT}/import`, method: "POST", body }),
      transformResponse: unwrap<TemplatePayload>,
      invalidatesTags: TEMPLATE_LIST_TAGS,
    }),

    /**
     * Render the in-memory definition through the real engine.
     *
     * `responseHandler` must return the blob itself — the default JSON handler
     * would corrupt a PDF — and `keepUnusedDataFor: 0` keeps rendered documents
     * out of the RTK cache, where they would pin megabytes per preview and
     * could serve yesterday's render after an edit.
     *
     * `pageCount` and `renderMs` come from response headers, and the API sends
     * no `Access-Control-Expose-Headers`. They therefore read as null whenever
     * the client is served from a different origin than the API — which is the
     * local dev setup (client :3000, API :3011) but NOT production, where nginx
     * puts both behind one origin. Both are diagnostics; the PDF itself is the
     * response body and is always readable.
     */
    renderPrintPreview: builder.mutation<PreviewResult, PreviewRequest>({
      query: (body) => ({
        url: PREVIEW_ENDPOINT,
        method: "POST",
        body,
        responseHandler: async (response) => {
          const blob = await response.blob();
          const contentType = response.headers.get("Content-Type") ?? blob.type;
          const isPdf = contentType.includes("pdf");
          /*
           * A MISSING header is null, not zero.
           *
           * `Number(null)` is 0, which would have the dialog cheerfully report
           * "0ms" for a render whose timing it simply could not read — and it
           * cannot read it whenever the page and the API are on different
           * origins, because the API sends no `Access-Control-Expose-Headers`.
           * Null is the honest answer, and the dialog hides the badge for it.
           */
          const readNumber = (name: string): number | null => {
            const raw = response.headers.get(name);
            if (raw === null || raw.trim() === "") {
              return null;
            }
            const value = Number(raw);
            return Number.isFinite(value) ? value : null;
          };
          const pageCount = readNumber("X-Report-Page-Count");

          return {
            // Consume the blob here so nothing non-serialisable reaches the store.
            objectUrl: isPdf ? URL.createObjectURL(blob) : null,
            text: isPdf ? null : await blob.text(),
            contentType,
            pageCount: pageCount !== null && pageCount > 0 ? pageCount : null,
            renderMs: readNumber("X-Report-Render-Ms"),
            byteLength: blob.size,
          } satisfies PreviewResult;
        },
      }),
    }),
  }),
});

export const {
  useListPrintTemplatesQuery,
  useGetPrintTemplateQuery,
  useGetPrintTemplateSchemaQuery,
  useGetPrintDatasetsQuery,
  useCreatePrintTemplateMutation,
  useUpdatePrintTemplateMutation,
  useClonePrintTemplateMutation,
  useSetPrintTemplateDefaultMutation,
  useDeletePrintTemplateMutation,
  useListPrintTemplateRevisionsQuery,
  useRollbackPrintTemplateMutation,
  useLazyExportPrintTemplateQuery,
  useImportPrintTemplateMutation,
  useRenderPrintPreviewMutation,
} = printTemplateApi;
