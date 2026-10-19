/**
 * Textile Tags — the round trips, one typed function each, riding `baseApi`
 * for the bearer token and its refresh-on-401.
 *
 * Both endpoints are MUTATIONS, as the till client's are: a read is a mutation
 * that sends a GET (a query endpoint hands a second request for a pending key
 * the first one's promise), and every call is its own request with nothing
 * cached. The store's `announceMutations` ignores a GET, so a lookup does not
 * make the rest of the screen re-read.
 *
 * Every function returns the envelope's `data`. A refusal throws the RTK error
 * (`{ status, data }`); `serverErrorsOf` / `errorStatusOf` read it.
 */
import { baseApi } from "@/store/api/baseApi";
import type { AppDispatch } from "@/store/store";
import type { ListKind } from "./domain/textile-tag-entity";
import { listRowId, type ListRow } from "./domain/textile-tag-lists";
import {
  DROPDOWN_RUN_ENDPOINT,
  TEXTILE_TAG_ITEM_LOOKUP_ENDPOINT,
  TEXTILE_TAG_LIST_DUPLICATE_STATUS,
  TEXTILE_TAG_RESERVE_ENDPOINT,
  TEXTILE_TAG_SUGGEST_PRICE_ENDPOINT,
  textileTagListSaveEndpoint,
} from "./textile-tags.constants";
import type {
  ApiFieldError,
  ListSaveBody,
  ReserveAnswer,
  ReserveBodyDto,
  SuggestPriceAnswer,
  TagItemLookupAnswer,
} from "./textile-tags.types";

type Params = Record<string, string | number | boolean | undefined>;

export const textileTagsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    textileTagRead: builder.mutation<unknown, { url: string; params: Params }>({
      query: ({ url, params }) => ({ url, method: "GET", params }),
    }),
    textileTagWrite: builder.mutation<unknown, { url: string; body: Record<string, unknown> }>({
      query: ({ url, body }) => ({ url, method: "POST", body }),
    }),
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dataOf<T>(raw: unknown): T {
  return (isRecord(raw) ? raw.data : undefined) as T;
}

async function read<T>(dispatch: AppDispatch, url: string, params: Params): Promise<T> {
  const request = dispatch(textileTagsApi.endpoints.textileTagRead.initiate({ url, params }));
  try {
    return dataOf<T>(await request.unwrap());
  } finally {
    request.reset();
  }
}

async function write<T>(dispatch: AppDispatch, url: string, body: Record<string, unknown>): Promise<T> {
  const request = dispatch(textileTagsApi.endpoints.textileTagWrite.initiate({ url, body }));
  try {
    return dataOf<T>(await request.unwrap());
  } finally {
    request.reset();
  }
}

export type TagItemLookupArgs = {
  companyId: string;
  branchId: string;
  accYear: string;
  itemId: string;
  uomId: string;
  onDate: string;
};

/**
 * The item's tracking, so a line the server will refuse says so now: a tag
 * item is batch only (TEXTILE_TAG, signature B). The server is still the
 * rule — it also checks the MANUAL issue, which this lookup does not carry.
 */
export function lookUpTagItem(dispatch: AppDispatch, args: TagItemLookupArgs): Promise<TagItemLookupAnswer> {
  return read<TagItemLookupAnswer>(dispatch, TEXTILE_TAG_ITEM_LOOKUP_ENDPOINT, {
    companyId: args.companyId,
    branchId: args.branchId,
    accYear: args.accYear,
    itemId: args.itemId,
    ...(args.uomId ? { uomId: args.uomId } : {}),
    onDate: args.onDate,
  });
}

/** The markup rule's price for this cost: `{ rule | null, mrp?, salePrice? }`. */
export function suggestTagPrice(
  dispatch: AppDispatch,
  args: { companyId: string; itemId: string; brandId: string; cost: number },
): Promise<SuggestPriceAnswer> {
  return read<SuggestPriceAnswer>(dispatch, TEXTILE_TAG_SUGGEST_PRICE_ENDPOINT, {
    companyId: args.companyId,
    itemId: args.itemId,
    ...(args.brandId ? { brandId: args.brandId } : {}),
    cost: args.cost.toFixed(2),
  });
}

export function reserveTags(dispatch: AppDispatch, body: ReserveBodyDto): Promise<ReserveAnswer> {
  return write<ReserveAnswer>(dispatch, TEXTILE_TAG_RESERVE_ENDPOINT, body as unknown as Record<string, unknown>);
}

/**
 * One list name → its id: the save route creates it, or answers 409
 * TEXTILE_TAG_LIST_DUPLICATE with the existing row — the name is known after
 * all. Throws the RTK error on any other refusal, or an Error when the answer
 * carries no id.
 */
export async function saveListName(dispatch: AppDispatch, kind: ListKind, body: ListSaveBody): Promise<string> {
  let row: ListRow | undefined;
  try {
    row = await write<ListRow>(dispatch, textileTagListSaveEndpoint(kind), body);
  } catch (error) {
    if (errorStatusOf(error) !== TEXTILE_TAG_LIST_DUPLICATE_STATUS) {
      throw error;
    }
    row = dataOf<ListRow>(errorBodyOf(error));
  }
  const id = row ? listRowId(row, kind) : "";
  if (!id) {
    throw new Error("The list answer had no id.");
  }
  return id;
}

/** A list kind's dropdown rows (once its dropdown is registered — B-2). */
export async function readListDropdown(
  dispatch: AppDispatch,
  dropdownId: number,
  companyId: string,
): Promise<ListRow[]> {
  const data = await read<{ items?: unknown } | undefined>(dispatch, DROPDOWN_RUN_ENDPOINT, {
    dropdown_id: dropdownId,
    page: 1,
    limit: 100,
    dropdown_param: JSON.stringify({ icompany_id: companyId }),
  });
  const items = isRecord(data) ? data.items : undefined;
  return Array.isArray(items) ? items.filter(isRecord) : [];
}

// ---------------------------------------------------------------------------
// Reading a refusal
// ---------------------------------------------------------------------------

/** The HTTP status of a thrown RTK error, or null. */
export function errorStatusOf(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  const status = error.status;
  if (typeof status === "number") {
    return status;
  }
  if (typeof status === "string" && /^\d+$/.test(status)) {
    return Number(status);
  }
  return null;
}

/** The response body of a thrown RTK error (`error.data`), or null. */
export function errorBodyOf(error: unknown): Record<string, unknown> | null {
  if (!isRecord(error)) {
    return null;
  }
  const body = error.data ?? error.responseBody;
  return isRecord(body) ? body : null;
}

/** The body's `errors[]` — `{ field, message }` rows — or none. */
export function serverErrorsOf(error: unknown): ApiFieldError[] {
  const body = errorBodyOf(error);
  const errors = body?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.filter(isRecord).map((entry) => ({
    field: typeof entry.field === "string" ? entry.field : undefined,
    message: typeof entry.message === "string" ? entry.message : undefined,
  }));
}
