import { combineReducers, configureStore, isFulfilled, type Middleware } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import createSagaMiddleware from "redux-saga";
import { API_TAG_TYPES, baseApi } from "@/store/api/baseApi";
import { notifyDataChanged, subscribeDataRefresh } from "@/lib/data-freshness";
import authReducer, { type AuthState } from "@/store/slices/authSlice";
import appSettingsReducer from "@/store/slices/appSettingsSlice";
import gridColumnsReducer, {
  type GridColumnsState,
} from "@/store/slices/gridColumnsSlice";
import globalLoaderReducer from "@/store/slices/globalLoaderSlice";
import businessContextReducer from "@/store/slices/businessContextSlice";
import mastersReducer from "@/store/slices/mastersSlice";
import openingStockReducer from "@/store/slices/openingStockSlice";
import physicalStockReducer from "@/store/slices/physicalStockSlice";
import quotationReducer from "@/store/slices/quotationSlice";
import saleOrderReducer from "@/store/slices/saleOrderSlice";
import printDesignerReducer from "@/features/print-designer/store/designerSlice";
export const REDUX_SESSION_STORAGE_KEY = "erp_client_redux_state";
const rootReducer = combineReducers({
  auth: authReducer,
  appSettings: appSettingsReducer,
  [baseApi.reducerPath]: baseApi.reducer,
  gridColumns: gridColumnsReducer,
  globalLoader: globalLoaderReducer,
  businessContextUi: businessContextReducer,
  masters: mastersReducer,
  openingStock: openingStockReducer,
  physicalStock: physicalStockReducer,
  quotation: quotationReducer,
  saleOrder: saleOrderReducer,
  printDesigner: printDesignerReducer,
});
export type RootState = ReturnType<typeof rootReducer>;
type PersistedReduxState = {
  auth?: AuthState;
  [baseApi.reducerPath]?: ReturnType<typeof baseApi.reducer>;
  gridColumns?: GridColumnsState;
};
function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}
function sanitizeGridColumnsState(state: GridColumnsState | undefined): GridColumnsState | undefined {
  if (!state?.byGridId || typeof state.byGridId !== "object") {
    return undefined;
  }
  return {
    byGridId: Object.fromEntries(
      Object.entries(state.byGridId).map(([gridId, entry]) => [
        gridId,
        {
          items: Array.isArray(entry?.items) ? entry.items : [],
          loading: false,
          error: null,
          requested: Boolean(entry?.requested),
        },
      ]),
    ) as GridColumnsState["byGridId"],
  };
}
function sanitizeAuthState(state: AuthState | undefined): AuthState | undefined {
  if (!state || typeof state !== "object") {
    return undefined;
  }
  const token = typeof state.token === "string" && state.token.trim() ? state.token.trim() : null;
  const refreshToken =
    typeof state.refreshToken === "string" && state.refreshToken.trim()
      ? state.refreshToken.trim()
      : null;
  const userId = typeof state.userId === "string" && state.userId.trim() ? state.userId.trim() : null;
  return {
    initialized: Boolean(state.initialized),
    isAuthenticated: Boolean(token),
    token,
    refreshToken: token ? refreshToken : null,
    userId,
    recentPages: Array.isArray(state.recentPages) ? state.recentPages : [],
    businessContext: state.businessContext && typeof state.businessContext === "object"
      ? state.businessContext
      : null,
    userInfo: state.userInfo && typeof state.userInfo === "object" ? state.userInfo : null,
  };
}
export function loadPersistedReduxState(): PersistedReduxState | undefined {
  if (!canUseSessionStorage()) {
    return undefined;
  }
  try {
    const rawState = window.sessionStorage.getItem(REDUX_SESSION_STORAGE_KEY);
    if (!rawState) {
      return undefined;
    }
    const parsedState = JSON.parse(rawState) as PersistedReduxState;
    const auth = sanitizeAuthState(parsedState.auth);
    const gridColumns = sanitizeGridColumnsState(parsedState.gridColumns);
    return auth || gridColumns ? { auth, gridColumns } : undefined;
  } catch {
    window.sessionStorage.removeItem(REDUX_SESSION_STORAGE_KEY);
    return undefined;
  }
}
function persistReduxState(state: RootState): void {
  if (!canUseSessionStorage()) {
    return;
  }
  const persistedAuth = state.auth.initialized
    ? sanitizeAuthState(state.auth)
    : loadPersistedReduxState()?.auth;
  const persistedState: PersistedReduxState = {
    auth: persistedAuth,
    gridColumns: sanitizeGridColumnsState(state.gridColumns),
  };
  try {
    window.sessionStorage.setItem(REDUX_SESSION_STORAGE_KEY, JSON.stringify(persistedState));
  } catch {
    // Session storage may be blocked or full; Redux can continue without persistence.
  }
}
// A completed RTK Query mutation is a write like any other: announce it so the
// screens that fetch outside RTK Query refresh, and so other tabs of this app
// re-read. The "rtk:" scope tells the subscriber below that this tab's cache has
// already been invalidated by the endpoint's own invalidatesTags.
const announceMutations: Middleware = () => (next) => (action) => {
  const result = next(action);
  if (isFulfilled(action)) {
    const meta = (action as { meta?: { arg?: { type?: string; endpointName?: string } } }).meta;
    if (meta?.arg?.type === "mutation") {
      notifyDataChanged(`rtk:${meta.arg.endpointName ?? "mutation"}`);
    }
  }
  return result;
};
export const makeStore = () => {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .concat(baseApi.middleware)
        .concat(announceMutations)
        .concat(sagaMiddleware),
  });
  if (typeof window !== "undefined") {
    // Tab focus / network reconnect revalidate every query that is currently on
    // screen (see the refetchOn* defaults in baseApi).
    setupListeners(store.dispatch);
    // A write - here or in another tab - can touch anything, so drop the whole
    // cache rather than guessing tags. Queries with live subscribers refetch at
    // once; the rest refetch the next time a screen asks for them. Focus and
    // reconnect are left out: setupListeners already handles those.
    subscribeDataRefresh((event) => {
      if (event.reason === "focus" || event.reason === "visible" || event.reason === "reconnect") {
        return;
      }
      // This tab's own RTK Query mutation already invalidated the tags it declares.
      if (event.reason === "mutation" && event.scope?.startsWith("rtk:")) {
        return;
      }
      store.dispatch(baseApi.util.invalidateTags([...API_TAG_TYPES]));
    });
    let pendingPersist: number | null = null;
    store.subscribe(() => {
      if (pendingPersist !== null) {
        return;
      }
      pendingPersist = window.setTimeout(() => {
        pendingPersist = null;
        persistReduxState(store.getState());
      }, 250);
    });
    // Lazily import and run rootSaga to avoid circular dependency at module init
    void import("@/store/sagas/rootSaga").then(({ default: rootSaga }) => {
      sagaMiddleware.run(rootSaga);
    });
  }
  return store;
};
export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];