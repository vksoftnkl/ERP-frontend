/**
 * Settlement Reconciliation (menu 278) — `/tender-settlement/*`, the grid
 * runner for its lists, and the tender master list.
 *
 *   GET  format ?companyId&tenderId        a tender's column map           VIEW
 *   POST format {companyId,tenderId,format} set / clear (null) it          EDIT
 *   POST format/test  multipart             what the SAVED map reads        VIEW
 *   POST import       multipart             one import per payout           CREATE
 *   GET  get ?companyId&branchId&accYear&asiId                             VIEW
 *   POST match | confirm | unlink | ignore                                 EDIT
 *   POST post                                                              POST
 *   POST void                                                              CANCEL
 *   POST resolve | write-off                                               OVERRIDE
 *
 * Everything rides `baseApi` for the bearer token and the refresh-on-401
 * replay. Reads are MUTATIONS that send GET (memory: erp-rtk-pending-query-
 * dedupe-abort): each call is its own request and nothing is cached — the
 * screen owns its state, and a payout read straight after a write must be the
 * new one.
 *
 * MULTIPART: `fetchBaseQuery` hands a `FormData` body to fetch untouched — it
 * deletes any content-type for a non-JSON body, so the browser writes the
 * `multipart/form-data; boundary=…` header — and the 401 replay re-sends the
 * same FormData (not a stream, so it can be sent twice). The File rides in the
 * mutation's argument: RTK's serializability check ignores `meta.arg`, and a
 * mutation's store entry keeps no argument, so nothing non-serializable lands
 * in the store. The bytes go as read from disk, which is what the server's
 * duplicate-file hash (sha256) is taken over.
 */
import { useMemo } from "react";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { buildMultipart, type FormFields } from "../domain/import-read";
import {
  parseFormatPayload,
  parseFormatTest,
  parseGridPage,
  parseImportResult,
  parsePayout,
  parsePostedPayout,
  parseResolveResult,
  parseWriteOffResult,
  unwrapData,
} from "../domain/parse";
import type {
  FormatPayload,
  FormatTestResult,
  GridRow,
  Payout,
  PostedPayout,
  ResolveResult,
  StatementFormat,
  WriteOffResult,
} from "../domain/types";

const BASE = "/tender-settlement";
const GRID_RUN = "/configured-grid-sql/run";
const TENDER_LIST = "/tender-masters/list";
/** The runner caps `limit` at 100. */
const GRID_PAGE = 100;
/** A guard, not a business limit: 2,000 rows of one exception list is a month nobody worked. */
const GRID_MAX_PAGES = 20;

type Params = Record<string, string | number>;
type Body = Record<string, unknown>;
export type MultipartArgs = { route: "format/test" | "import"; fields: FormFields; file: Blob; fileName: string };

export const settlementApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    settlementRead: builder.mutation<unknown, { url: string; params: Params }>({
      query: ({ url, params }) => ({ url, method: "GET", params }),
    }),
    settlementWrite: builder.mutation<unknown, { route: string; body: Body }>({
      query: ({ route, body }) => ({ url: `${BASE}/${route}`, method: "POST", body }),
    }),
    settlementUpload: builder.mutation<unknown, MultipartArgs>({
      query: ({ route, fields, file, fileName }) => ({
        url: `${BASE}/${route}`,
        method: "POST",
        body: buildMultipart(fields, file, fileName),
      }),
    }),
  }),
});

type Request<T> = { unwrap: () => Promise<T>; reset: () => void };

async function run<T>(request: Request<unknown>, parse: (raw: unknown) => T): Promise<T> {
  try {
    return parse(unwrapData(await request.unwrap()));
  } finally {
    request.reset();
  }
}

function requirePayout(payout: Payout | null): Payout {
  if (!payout) throw new Error("The server answered without the payout.");
  return payout;
}

export type SettlementKey = { companyId: string; branchId: string; accYear: string; asiId: string };

export type SettlementClient = {
  getFormat: (companyId: string, tenderId: string) => Promise<FormatPayload>;
  saveFormat: (companyId: string, tenderId: string, format: StatementFormat | null) => Promise<FormatPayload>;
  testFormat: (fields: FormFields, file: Blob, fileName: string) => Promise<FormatTestResult>;
  importFile: (fields: FormFields, file: Blob, fileName: string) => Promise<Payout[]>;
  getPayout: (key: SettlementKey) => Promise<Payout>;
  /** match · confirm · unlink · ignore · void — each answers the payout. */
  payoutAction: (route: "match" | "confirm" | "unlink" | "ignore" | "void", body: Body) => Promise<Payout>;
  post: (key: SettlementKey) => Promise<PostedPayout>;
  resolve: (body: Body) => Promise<ResolveResult>;
  writeOff: (body: Body) => Promise<WriteOffResult>;
  /** Every row of one configured grid (every page of it). */
  gridRows: (grid: ConfiguredGridKey, params: Record<string, string>) => Promise<GridRow[]>;
  tenders: () => Promise<unknown[]>;
};

export function createSettlementClient(dispatch: AppDispatch): SettlementClient {
  const { settlementRead, settlementWrite, settlementUpload } = settlementApi.endpoints;
  const read = <T>(url: string, params: Params, parse: (raw: unknown) => T) =>
    run(dispatch(settlementRead.initiate({ url, params })), parse);
  const write = <T>(route: string, body: Body, parse: (raw: unknown) => T) =>
    run(dispatch(settlementWrite.initiate({ route, body })), parse);
  const upload = <T>(route: MultipartArgs["route"], fields: FormFields, file: Blob, fileName: string, parse: (raw: unknown) => T) =>
    run(dispatch(settlementUpload.initiate({ route, fields, file, fileName })), parse);

  return {
    getFormat: (companyId, tenderId) => read(`${BASE}/format`, { companyId, tenderId }, parseFormatPayload),
    saveFormat: (companyId, tenderId, format) =>
      write("format", { companyId, tenderId, format }, parseFormatPayload),
    testFormat: (fields, file, fileName) => upload("format/test", fields, file, fileName, parseFormatTest),
    importFile: (fields, file, fileName) => upload("import", fields, file, fileName, parseImportResult),
    getPayout: (key) => read(`${BASE}/get`, key, (raw) => requirePayout(parsePayout(raw))),
    payoutAction: (route, body) => write(route, body, (raw) => requirePayout(parsePayout(raw))),
    post: (key) =>
      write("post", key, (raw) => {
        const posted = parsePostedPayout(raw);
        if (!posted) throw new Error("The server answered without the payout.");
        return posted;
      }),
    resolve: (body) => write("resolve", body, parseResolveResult),
    writeOff: (body) => write("write-off", body, parseWriteOffResult),
    gridRows: async (grid, params) => {
      const rows: GridRow[] = [];
      for (let page = 1; page <= GRID_MAX_PAGES; page += 1) {
        const request = dispatch(
          settlementRead.initiate({
            url: GRID_RUN,
            params: { grid_id: getGridId(grid), page, limit: GRID_PAGE, grid_param: JSON.stringify(params) },
          }),
        );
        let items: GridRow[];
        let total: number | null;
        try {
          ({ items, total } = parseGridPage(await request.unwrap()));
        } finally {
          request.reset();
        }
        rows.push(...items);
        if (items.length < GRID_PAGE || (total !== null && rows.length >= total)) break;
      }
      return rows;
    },
    tenders: () => read(TENDER_LIST, {}, (raw) => (Array.isArray(raw) ? raw : [])),
  };
}

export function useSettlementClient(): SettlementClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createSettlementClient(dispatch), [dispatch]);
}
