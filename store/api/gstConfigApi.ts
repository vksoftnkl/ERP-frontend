/**
 * GST Providers (menu 269) and GST Credentials (menu 270) — the `/gst/*`
 * config routes, notes 79 R1–R9 (server `src/modules/gst`).
 *
 * House rules the screens lean on: `create` is an upsert (the id selects
 * update), `get` answers deleted rows too, delete / restore / verify take their
 * id in a JSON BODY, and there is no `/list` — the lists are configured grids
 * (127–131), read here through `runGstGrid`.
 *
 * Every read is a GET-shaped MUTATION, as in `ledgerMapApi`: the dialogs hold
 * an edited copy of what they read, and a cached query refetched on window
 * focus would hand them a fresh answer in the middle of an edit. Each call
 * here is its own request.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type {
  GstCompanyCredentialPayload,
  GstCredentialStatus,
  GstCredentialVerifyResult,
  GstGridRow,
  GstProviderPayload,
} from "@/features/settings/gst/gst.types";

const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** The run's own cap; no child list of one provider comes near it. */
const CHILD_GRID_LIMIT = 100;

type JsonRecord = Record<string, unknown>;

export type GstGridRunArgs = {
  grid: ConfiguredGridKey;
  /** Every token the grid's SQL binds — always sent, "" when unset. */
  params: Record<string, string>;
};

export type GstPartLoadArgs = { url: string; idKey: string; id: string };
export type GstPartSaveArgs = { url: string; body: JsonRecord };

export const gstConfigApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // ── R1 providers ────────────────────────────────────────────────────────
    /** Header + services[] + accounts[] (secret-free) + the counts. */
    loadGstProvider: builder.mutation<GstProviderPayload, string>({
      query: (gpvId) => ({ url: "/gst/providers/get", method: "GET", params: { gpvId } }),
      transformResponse: (payload: ApiSuccessResponse<GstProviderPayload>) => payload.data,
    }),
    saveGstProvider: builder.mutation<GstProviderPayload, JsonRecord>({
      query: (body) => ({ url: "/gst/providers/create", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<GstProviderPayload>) => payload.data,
    }),
    /** 409 GST_PROVIDER_IN_USE while a live credential names it. */
    deleteGstProvider: builder.mutation<unknown, string>({
      query: (gpvId) => ({ url: "/gst/providers/delete", method: "POST", body: { gpvId } }),
    }),
    restoreGstProvider: builder.mutation<unknown, string>({
      query: (gpvId) => ({ url: "/gst/providers/restore", method: "POST", body: { gpvId } }),
    }),

    // ── R2–R6 the rows under a provider ─────────────────────────────────────
    /** An endpoint (with fieldMaps[]) or an account — the two children with a /get. */
    loadGstPart: builder.mutation<JsonRecord, GstPartLoadArgs>({
      query: ({ url, idKey, id }) => ({ url, method: "GET", params: { [idKey]: id } }),
      transformResponse: (payload: ApiSuccessResponse<JsonRecord>) => payload.data ?? {},
    }),
    saveGstPart: builder.mutation<JsonRecord, GstPartSaveArgs>({
      query: ({ url, body }) => ({ url, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<JsonRecord>) => payload.data ?? {},
    }),
    /** Soft, and cascading: a service takes its endpoints, an endpoint its field map. */
    deleteGstPart: builder.mutation<unknown, GstPartSaveArgs>({
      query: ({ url, body }) => ({ url, method: "POST", body }),
    }),

    // ── R7–R9 company credentials ───────────────────────────────────────────
    loadGstCredential: builder.mutation<GstCompanyCredentialPayload, string>({
      query: (gccId) => ({ url: "/gst/company-credentials/get", method: "GET", params: { gccId } }),
      transformResponse: (payload: ApiSuccessResponse<GstCompanyCredentialPayload>) => payload.data,
    }),
    saveGstCredential: builder.mutation<GstCompanyCredentialPayload, JsonRecord>({
      query: (body) => ({ url: "/gst/company-credentials/create", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<GstCompanyCredentialPayload>) => payload.data,
    }),
    deleteGstCredential: builder.mutation<unknown, string>({
      query: (gccId) => ({ url: "/gst/company-credentials/delete", method: "POST", body: { gccId } }),
    }),
    restoreGstCredential: builder.mutation<unknown, string>({
      query: (gccId) => ({ url: "/gst/company-credentials/restore", method: "POST", body: { gccId } }),
    }),
    /**
     * ONE sign-in at the portal, through the server's lease. A refusal by the
     * portal is `{ ok: false }` data; a refusal before it (lease held, sign-in
     * budget, switched off, incomplete) is an HTTP error.
     */
    verifyGstCredential: builder.mutation<GstCredentialVerifyResult, string>({
      query: (gccId) => ({ url: "/gst/company-credentials/verify", method: "POST", body: { gccId } }),
      transformResponse: (payload: ApiSuccessResponse<GstCredentialVerifyResult>) => payload.data,
    }),
    /** No portal call: gst_auth_session + the credential. */
    loadGstCredentialStatus: builder.mutation<GstCredentialStatus, string>({
      query: (gccId) => ({ url: "/gst/company-credentials/status", method: "GET", params: { gccId } }),
      transformResponse: (payload: ApiSuccessResponse<GstCredentialStatus>) => payload.data,
    }),

    // ── the child lists (grids 128–130) ─────────────────────────────────────
    /**
     * One provider's services / one service's endpoints / one provider's error
     * map. The tokens are QUOTED in the grids' SQL (`'igpv_id'`), so an unsent
     * one stays a literal and the list is silently empty — they are always sent.
     */
    runGstGrid: builder.mutation<GstGridRow[], GstGridRunArgs>({
      query: ({ grid, params }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        method: "GET",
        params: {
          grid_id: getGridId(grid),
          page: 1,
          limit: CHILD_GRID_LIMIT,
          grid_param: JSON.stringify(params),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<GstGridRow>>) =>
        Array.isArray(payload.data?.items) ? payload.data.items : [],
    }),
  }),
});

export const {
  useLoadGstProviderMutation,
  useSaveGstProviderMutation,
  useDeleteGstProviderMutation,
  useRestoreGstProviderMutation,
  useLoadGstPartMutation,
  useSaveGstPartMutation,
  useDeleteGstPartMutation,
  useLoadGstCredentialMutation,
  useSaveGstCredentialMutation,
  useDeleteGstCredentialMutation,
  useRestoreGstCredentialMutation,
  useVerifyGstCredentialMutation,
  useLoadGstCredentialStatusMutation,
  useRunGstGridMutation,
} = gstConfigApi;
