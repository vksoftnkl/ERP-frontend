import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type AuthState = {
  initialized: boolean;
  token: string | null;
};

const initialState: AuthState = {
  initialized: false,
  token: null,
};

function normalizeToken(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    authHydrated(state, action: PayloadAction<string | null>) {
      state.initialized = true;
      state.token = normalizeToken(action.payload);
    },
    authSessionChanged(state, action: PayloadAction<string | null>) {
      state.initialized = true;
      state.token = normalizeToken(action.payload);
    },
  },
});

export const { authHydrated, authSessionChanged } = authSlice.actions;

export function selectAuthInitialized(state: { auth: AuthState }): boolean {
  return state.auth.initialized;
}

export function selectAuthToken(state: { auth: AuthState }): string | null {
  return state.auth.token;
}

export function selectIsAuthenticated(state: { auth: AuthState }): boolean {
  return Boolean(state.auth.token);
}

export default authSlice.reducer;
