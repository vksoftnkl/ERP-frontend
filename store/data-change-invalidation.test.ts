import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetDataRefreshBusForTests,
  subscribeDataRefresh,
  type DataRefreshEvent,
} from "@/lib/data-freshness/refresh-bus";
import { baseApi } from "@/store/api/baseApi";
import { announceMutations, invalidateCacheOnDataChange } from "@/store/store";

// Two screens' worth of endpoints: a list tagged by its own save, a dropdown
// nobody's save names, a save that tags only its list, and a read modelled as a
// mutation (the till/report screens' pattern).
const testApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    testList: builder.query<unknown, void>({
      query: () => "/test-list",
      providesTags: ["MasterList"],
    }),
    testDropdown: builder.query<unknown, void>({
      query: () => "/test-dropdown",
      providesTags: ["DropdownRows"],
    }),
    testSave: builder.mutation<unknown, void>({
      query: () => ({ url: "/test-save", method: "POST", body: {} }),
      invalidatesTags: ["MasterList"],
    }),
    testUntaggedSave: builder.mutation<unknown, void>({
      query: () => ({ url: "/test-untagged-save", method: "PUT", body: {} }),
    }),
    testReadAsMutation: builder.mutation<unknown, void>({
      query: () => ({ url: "/test-read", method: "GET" }),
    }),
  }),
  overrideExisting: true,
});

function makeTestStore() {
  return configureStore({
    reducer: combineReducers({ [baseApi.reducerPath]: baseApi.reducer }),
    middleware: (getDefault) => getDefault().concat(baseApi.middleware).concat(announceMutations),
  });
}

const fetchedPaths: string[] = [];
let unsubscribeInvalidation: (() => void) | null = null;

function countFetches(fragment: string): number {
  return fetchedPaths.filter((path) => path.endsWith(fragment)).length;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  fetchedPaths.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      fetchedPaths.push(new URL(input.url).pathname);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  unsubscribeInvalidation?.();
  unsubscribeInvalidation = null;
  resetDataRefreshBusForTests();
  vi.unstubAllGlobals();
});

describe("data-change cache invalidation", () => {
  it("does not announce a GET sent as a mutation", async () => {
    const store = makeTestStore();
    const events: DataRefreshEvent[] = [];
    subscribeDataRefresh((event) => events.push(event));

    await store.dispatch(testApi.endpoints.testReadAsMutation.initiate());

    expect(events).toEqual([]);
  });

  it("announces a real save", async () => {
    const store = makeTestStore();
    const events: DataRefreshEvent[] = [];
    subscribeDataRefresh((event) => events.push(event));

    await store.dispatch(testApi.endpoints.testUntaggedSave.initiate());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason: "mutation", scope: "rtk:testUntaggedSave" });
  });

  it("refreshes everything on screen after an untagged save, each query once", async () => {
    const store = makeTestStore();
    unsubscribeInvalidation = invalidateCacheOnDataChange(store.dispatch);
    store.dispatch(testApi.endpoints.testList.initiate());
    store.dispatch(testApi.endpoints.testDropdown.initiate());
    await settle();
    expect(countFetches("/test-list")).toBe(1);
    expect(countFetches("/test-dropdown")).toBe(1);

    await store.dispatch(testApi.endpoints.testUntaggedSave.initiate());
    await settle();

    expect(countFetches("/test-list")).toBe(2);
    expect(countFetches("/test-dropdown")).toBe(2);
  });

  it("refetches the save's own tagged list once, not twice, alongside everything else", async () => {
    const store = makeTestStore();
    unsubscribeInvalidation = invalidateCacheOnDataChange(store.dispatch);
    store.dispatch(testApi.endpoints.testList.initiate());
    store.dispatch(testApi.endpoints.testDropdown.initiate());
    await settle();

    await store.dispatch(testApi.endpoints.testSave.initiate());
    await settle();

    expect(countFetches("/test-list")).toBe(2);
    // Not named by the save's invalidatesTags - stale before this change.
    expect(countFetches("/test-dropdown")).toBe(2);
  });
});
