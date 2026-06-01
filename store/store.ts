import { combineReducers, configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { baseApi } from "@/store/api/baseApi";
import authReducer, { type AuthState } from "@/store/slices/authSlice";
import gridColumnsReducer, {
  type GridColumnsState,
} from "@/store/slices/gridColumnsSlice";
import globalLoaderReducer from "@/store/slices/globalLoaderSlice";
import businessContextReducer from "@/store/slices/businessContextSlice";
import mastersReducer from "@/store/slices/mastersSlice";
import openingStockReducer from "@/store/slices/openingStockSlice";
import physicalStockReducer from "@/store/slices/physicalStockSlice";
export const REDUX_SESSION_STORAGE_KEY = "erp_client_redux_state";
const rootReducer = combineReducers({
  auth: authReducer,
  [baseApi.reducerPath]: baseApi.reducer,
  gridColumns: gridColumnsReducer,
  globalLoader: globalLoaderReducer,
  businessContextUi: businessContextReducer,
  masters: mastersReducer,
  openingStock: openingStockReducer,
  physicalStock: physicalStockReducer,
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
export const makeStore = () => {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware).concat(sagaMiddleware),
  });
  if (typeof window !== "undefined") {
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