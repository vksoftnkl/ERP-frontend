/**
 * Business Day (menu 274) — the requests the screen and its two dialogs make,
 * through `baseApi` for the bearer token and its refresh-on-401.
 *
 *   GET  /till/days/get               today's business day, or one by tbdId + accYear
 *   POST /till/days/open              Day Open (Business Day 274 CREATE)
 *   GET  /till/days/close-check       the server's checklist of the day shown (notes 117)
 *   POST /till/days/close             Close day / Close with exception (274 EDIT)
 *   POST /till/days/reopen            Reopen day (274 EDIT)
 *   GET  /till/movements/supervisors  the exception's approvers
 *   GET  /till/denominations/list     the exception's drawer counts
 *   GET  /configured-grid-sql/run     TILL DAY SESSIONS · MAIN LIST - TILL BUSINESS DAYS ·
 *                                     MAIN LIST - TILL SAFES · MAIN LIST - TILL REASONS
 *
 * The GETs are QUERY endpoints dispatched as
 * `initiate(arg, { subscribe: false, forceRefetch: true })` — never a lazy
 * trigger (dead from a mount effect) — and NOT the GET-as-mutation of the
 * Party Outstanding screen, on purpose: every fulfilled RTK mutation goes
 * through the store's `announceMutations` → `notifyDataChanged`, which fires
 * every `useDataRefresh` subscriber in this tab at once and makes every OTHER
 * tab invalidate all its tags. This screen reads four or five times per load
 * and again on focus, so as mutations its own reads would keep the whole app
 * refetching. The trap the mutation form avoids (a second initiate for a
 * PENDING key gets the first one's promise) needs an abort to bite; nothing
 * here aborts — a superseded answer is dropped by generation in the hook, and
 * two identical reads in flight share one honest answer.
 *
 * Day Open, Close and Reopen are real mutations: they change data, and saying
 * so is right.
 *
 * Every function returns PARSED data, or throws the RTK error
 * (`{ status, data }`) that `tillDayErrorText` turns into a sentence.
 */
import { useMemo } from "react";
import { baseApi } from "@/store/api/baseApi";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store";
import type { CloseDayBody, ReopenDayBody } from "../domain/day-close";
import type { TillDenominationRow } from "../../shared/wire/types";
import {
  listOf,
  parseCloseCheck,
  parseCloseResult,
  parseDay,
  parseGridPage,
  parseReopenResult,
  parseSupervisors,
  type DayCloseResult,
  type DayKey,
  type GridRow,
  type Supervisor,
  type TillCloseCheck,
  type TillDay,
} from "../domain/wire";

const DAY_GET_ENDPOINT = "/till/days/get";
const DAY_OPEN_ENDPOINT = "/till/days/open";
const DAY_CLOSE_CHECK_ENDPOINT = "/till/days/close-check";
const DAY_CLOSE_ENDPOINT = "/till/days/close";
const DAY_REOPEN_ENDPOINT = "/till/days/reopen";
const SUPERVISORS_ENDPOINT = "/till/movements/supervisors";
const DENOMINATIONS_ENDPOINT = "/till/denominations/list";
const GRID_RUN_ENDPOINT = "/configured-grid-sql/run";
/** The runner caps `limit` at 100. */
const GRID_PAGE_LIMIT = 100;
/** A guard, not a business limit: a branch does not run 1,000 sessions a day. */
const GRID_MAX_PAGES = 10;

type GridRunArgs = { gridId: string; page: number; params: Record<string, string> };

export const businessDayApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    tillDayGet: builder.query<unknown, Record<string, string>>({
      query: (params) => ({ url: DAY_GET_ENDPOINT, params }),
      keepUnusedDataFor: 0,
    }),
    tillDayOpen: builder.mutation<unknown, { companyId: string; branchId: string }>({
      query: (body) => ({ url: DAY_OPEN_ENDPOINT, method: "POST", body }),
    }),
    tillDayCloseCheck: builder.query<unknown, DayKey>({
      query: (params) => ({ url: DAY_CLOSE_CHECK_ENDPOINT, params }),
      keepUnusedDataFor: 0,
    }),
    tillDayClose: builder.mutation<unknown, CloseDayBody>({
      query: (body) => ({ url: DAY_CLOSE_ENDPOINT, method: "POST", body }),
    }),
    tillDayReopen: builder.mutation<unknown, ReopenDayBody>({
      query: (body) => ({ url: DAY_REOPEN_ENDPOINT, method: "POST", body }),
    }),
    tillDaySupervisors: builder.query<unknown, { companyId: string; branchId: string; accYear: string; tssId: string }>({
      query: (params) => ({ url: SUPERVISORS_ENDPOINT, params }),
      keepUnusedDataFor: 0,
    }),
    tillDayDenominations: builder.query<unknown, { companyId: string }>({
      query: (params) => ({ url: DENOMINATIONS_ENDPOINT, params }),
      keepUnusedDataFor: 0,
    }),
    tillDayGridRun: builder.query<unknown, GridRunArgs>({
      query: ({ gridId, page, params }) => ({
        url: GRID_RUN_ENDPOINT,
        params: { grid_id: gridId, page, limit: GRID_PAGE_LIMIT, grid_param: JSON.stringify(params) },
      }),
      keepUnusedDataFor: 0,
    }),
  }),
});

/** A fresh read every time, held by nothing once it has answered. */
const READ = { subscribe: false, forceRefetch: true } as const;

/** Wait for a write and drop its result from the store. */
async function settle<T>(request: { unwrap(): Promise<T>; reset(): void }): Promise<T> {
  try {
    return await request.unwrap();
  } finally {
    request.reset();
  }
}

export type BusinessDayClient = {
  /** `query` is `dayQuery(...)`; a 404 for today means "not opened yet". */
  getDay: (query: Record<string, string>) => Promise<TillDay>;
  openDay: (scope: { companyId: string; branchId: string }) => Promise<TillDay>;
  /** The server's close-check of one day. */
  closeCheck: (key: DayKey) => Promise<TillCloseCheck>;
  /** Close day, or (with `exception`) close over the live sessions, counted. */
  closeDay: (body: CloseDayBody) => Promise<DayCloseResult>;
  /** The day as reopened, when the body carried it. */
  reopenDay: (body: ReopenDayBody) => Promise<TillDay | null>;
  /** Who may sign for a session (Till Sessions 273 OVERRIDE), its cashier left out by the server. */
  supervisors: (key: { companyId: string; branchId: string; accYear: string; tssId: string }) => Promise<Supervisor[]>;
  /** The company's notes and coins, for a drawer count. */
  denominations: (companyId: string) => Promise<TillDenominationRow[]>;
  /** Every page of one configured grid. */
  gridRows: (grid: ConfiguredGridKey, gridId: string | null, params: Record<string, string>) => Promise<GridRow[]>;
};

/** A body that is not a TillDayPayload is a server change, said plainly. */
export class DayParseError extends Error {
  constructor() {
    super("The server's business day could not be read.");
    this.name = "DayParseError";
  }
}

function dayOrThrow(raw: unknown): TillDay {
  const day = parseDay(raw);
  if (!day) throw new DayParseError();
  return day;
}

/** A body that is not a close-check is a server change, said plainly (on the grey row). */
export class CloseCheckParseError extends Error {
  constructor() {
    super("The server's close-check could not be read");
    this.name = "CloseCheckParseError";
  }
}

function checkOrThrow(raw: unknown): TillCloseCheck {
  const check = parseCloseCheck(raw);
  if (!check) throw new CloseCheckParseError();
  return check;
}

export function createBusinessDayClient(dispatch: AppDispatch): BusinessDayClient {
  return {
    getDay: async (query) =>
      dayOrThrow(await dispatch(businessDayApi.endpoints.tillDayGet.initiate(query, READ)).unwrap()),
    openDay: async ({ companyId, branchId }) =>
      dayOrThrow(await settle(dispatch(businessDayApi.endpoints.tillDayOpen.initiate({ companyId, branchId })))),
    closeCheck: async ({ companyId, branchId, accYear, tbdId }) =>
      checkOrThrow(
        await dispatch(
          businessDayApi.endpoints.tillDayCloseCheck.initiate({ companyId, branchId, accYear, tbdId }, READ),
        ).unwrap(),
      ),
    closeDay: async (body) =>
      parseCloseResult(await settle(dispatch(businessDayApi.endpoints.tillDayClose.initiate(body)))),
    reopenDay: async (body) =>
      parseReopenResult(await settle(dispatch(businessDayApi.endpoints.tillDayReopen.initiate(body)))),
    supervisors: async ({ companyId, branchId, accYear, tssId }) =>
      parseSupervisors(
        await dispatch(
          businessDayApi.endpoints.tillDaySupervisors.initiate({ companyId, branchId, accYear, tssId }, READ),
        ).unwrap(),
      ),
    denominations: async (companyId) =>
      listOf(
        await dispatch(businessDayApi.endpoints.tillDayDenominations.initiate({ companyId }, READ)).unwrap(),
      ) as TillDenominationRow[],
    gridRows: async (grid, gridId, params) => {
      const id = gridId || getGridId(grid);
      const rows: GridRow[] = [];
      for (let page = 1; page <= GRID_MAX_PAGES; page += 1) {
        const raw = await dispatch(
          businessDayApi.endpoints.tillDayGridRun.initiate({ gridId: id, page, params }, READ),
        ).unwrap();
        const { items, total } = parseGridPage(raw);
        rows.push(...items);
        if (items.length < GRID_PAGE_LIMIT || (total !== null && rows.length >= total)) break;
      }
      return rows;
    },
  };
}

export function useBusinessDayClient(): BusinessDayClient {
  const dispatch = useAppDispatch();
  return useMemo(() => createBusinessDayClient(dispatch), [dispatch]);
}
