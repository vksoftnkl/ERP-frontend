/**
 * The print template API.
 *
 * Every endpoint here already existed before the designer did — the backend's
 * fast path was "author JSON, POST it, iterate by PUT" — so this file adds no
 * server surface, only a typed client for it.
 *
 * The dataset catalogue is mounted UNDER templates (`/reports/templates/
 * datasets/catalogue`) rather than at `/reports/datasets`, because it is only
 * ever consumed alongside one.
 *
 * PREVIEW IS NOT HERE ANY MORE. It was `POST /reports/preview`, which took a
 * definition and rendered it. That endpoint is gone with the rest of
 * `/reports/*`, and its replacement is not a like-for-like move: the renderer
 * in `features/printing/api/render.ts` takes a saved REVISION id, so it can
 * only be called by a host that has one. See `host/canvas-host`.
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
} = printTemplateApi;
