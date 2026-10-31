/**
 * `/api/v1/delivery-challans/*` — the Qt `ApiEndpoints::DeliveryChallans`
 * verbs, on the challan's own routes (header prefix `sdc`).
 *
 *   create           DRAFT upsert by sdcId presence; `post: true` saves and
 *                    posts in ONE transaction (a refusal leaves nothing)
 *   validate         the whole payload, dry run: refusals[] / warnings[]
 *   cancel           keys + reason (refused once billed / returned)
 *   amend            whole payload + baseRevision + editRemark
 *   delete           DRAFT only — a POST with the four keys
 *   get              header FLAT + items / charges / transport / posting /
 *                    locks / rights — a GET-MUTATION: every open is its own
 *                    request and can be aborted (no pending-key dedupe)
 *   convert-purpose  POSTED only; keys + purpose + remark
 *   transport        PUT, keys + nested band (its own verb once posted)
 *
 * Endpoint names carry a `dc` prefix: every `store/api` module injects into the
 * one `baseApi` with `overrideExisting`, so a generic name would replace
 * another screen's.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type { TransportBandDto } from "@/features/sales/testbill/api/bills";
import {
  DC_AMEND_ENDPOINT,
  DC_CANCEL_ENDPOINT,
  DC_CONVERT_PURPOSE_ENDPOINT,
  DC_CREATE_ENDPOINT,
  DC_DELETE_ENDPOINT,
  DC_GET_ENDPOINT,
  DC_TRANSPORT_ENDPOINT,
  DC_VALIDATE_ENDPOINT,
} from "./dc.constants";
import type { DcDocKey, DcPayload } from "./dc.types";

type Body = Record<string, unknown>;

export type DcValidateAnswer = {
  ok: boolean;
  refusals: unknown[];
  warnings: unknown[];
  rights?: Record<string, boolean>;
};

const unwrap = <T>(payload: ApiSuccessResponse<T>) => payload.data;

export const deliveryChallanApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    dcGet: builder.mutation<DcPayload, DcDocKey>({
      query: (key) => ({ url: DC_GET_ENDPOINT, method: "GET", params: key }),
      transformResponse: unwrap<DcPayload>,
    }),
    dcSave: builder.mutation<DcPayload, Body>({
      query: (body) => ({ url: DC_CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: unwrap<DcPayload>,
    }),
    /** The success envelope is kept whole: its `data` holds the notes the strip paints. */
    dcValidate: builder.mutation<ApiSuccessResponse<DcValidateAnswer>, Body>({
      query: (body) => ({ url: DC_VALIDATE_ENDPOINT, method: "POST", body }),
    }),
    dcCancel: builder.mutation<DcPayload, DcDocKey & { reason: string }>({
      query: (body) => ({ url: DC_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: unwrap<DcPayload>,
    }),
    dcAmend: builder.mutation<DcPayload, Body>({
      query: (body) => ({ url: DC_AMEND_ENDPOINT, method: "POST", body }),
      transformResponse: unwrap<DcPayload>,
    }),
    dcDelete: builder.mutation<{ sdcId: string; deleted: boolean }, DcDocKey>({
      query: (body) => ({ url: DC_DELETE_ENDPOINT, method: "POST", body }),
      transformResponse: unwrap<{ sdcId: string; deleted: boolean }>,
    }),
    dcConvertPurpose: builder.mutation<DcPayload, DcDocKey & { purpose: string; remark: string }>({
      query: (body) => ({ url: DC_CONVERT_PURPOSE_ENDPOINT, method: "POST", body }),
      transformResponse: unwrap<DcPayload>,
    }),
    dcTransport: builder.mutation<Body, DcDocKey & { transport: TransportBandDto }>({
      query: (body) => ({ url: DC_TRANSPORT_ENDPOINT, method: "PUT", body }),
      transformResponse: unwrap<Body>,
    }),
  }),
});

export const {
  useDcGetMutation,
  useDcSaveMutation,
  useDcValidateMutation,
  useDcCancelMutation,
  useDcAmendMutation,
  useDcDeleteMutation,
  useDcConvertPurposeMutation,
  useDcTransportMutation,
} = deliveryChallanApi;
