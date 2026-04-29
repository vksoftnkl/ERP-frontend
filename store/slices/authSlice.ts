import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
export type PersistedRecentPage = {
  path: string;
  label: string;
};

export type PersistedBusinessContext = {
  companyId: string | null;
  companyName: string | null;
  compFinYearFrom: string | null;
  compFinYearTo: string | null;
  branchId: string | null;
  branchName: string | null;
};

type AuthSessionPayload = {
  token?: string | null;
  userId?: string | null;
  isAuthenticated?: boolean;
  recentPages?: PersistedRecentPage[];
  businessContext?: PersistedBusinessContext | null;
};

export type AuthState = {
  initialized: boolean;
  isAuthenticated: boolean;
  token: string | null;
  userId: string | null;
  recentPages: PersistedRecentPage[];
  businessContext: PersistedBusinessContext | null;
};

const initialState: AuthState = {
  initialized: false,
  isAuthenticated: false,
  token: null,
  userId: null,
  recentPages: [],
  businessContext: null,
};

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function applyAuthSession(state: AuthState, payload: AuthSessionPayload): void {
  const nextToken = Object.prototype.hasOwnProperty.call(payload, "token")
    ? normalizeString(payload.token)
    : state.token;
  const nextUserId = Object.prototype.hasOwnProperty.call(payload, "userId")
    ? normalizeString(payload.userId)
    : state.userId;
  const isAuthenticated =
    payload.isAuthenticated ?? Boolean(nextToken);

  state.initialized = true;
  state.isAuthenticated = isAuthenticated;
  state.token = isAuthenticated ? nextToken : null;
  state.userId = isAuthenticated ? nextUserId : null;

  if (!isAuthenticated) {
    state.recentPages = [];
    state.businessContext = null;
    return;
  }

  if (Array.isArray(payload.recentPages)) {
    state.recentPages = payload.recentPages;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "businessContext")) {
    state.businessContext = payload.businessContext ?? null;
  }
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    authHydrated(state, action: PayloadAction<AuthSessionPayload>) {
      applyAuthSession(state, action.payload);
    },
    authSessionChanged(state, action: PayloadAction<AuthSessionPayload>) {
      applyAuthSession(state, action.payload);
    },
    recentPagesChanged(state, action: PayloadAction<PersistedRecentPage[]>) {
      state.recentPages = action.payload;
    },
    businessContextChanged(state, action: PayloadAction<PersistedBusinessContext | null>) {
      state.businessContext = action.payload;
    },
  },
});
export const {
  authHydrated,
  authSessionChanged,
  businessContextChanged,
  recentPagesChanged,
} = authSlice.actions;
export function selectAuthInitialized(state: { auth: AuthState }): boolean {
  return state.auth.initialized;
}
export function selectAuthToken(state: { auth: AuthState }): string | null {
  return state.auth.token;
}
export function selectAuthUserId(state: { auth: AuthState }): string | null {
  return state.auth.userId;
}
export function selectIsAuthenticated(state: { auth: AuthState }): boolean {
  return state.auth.isAuthenticated;
}
export function selectRecentPages(state: { auth: AuthState }): PersistedRecentPage[] {
  return state.auth.recentPages;
}
export function selectBusinessContext(state: { auth: AuthState }): PersistedBusinessContext | null {
  return state.auth.businessContext;
}
export default authSlice.reducer;
