import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
type AuthSessionPayload = {
  token: string | null;
  userId: string | null;
};
type AuthState = {
  initialized: boolean;
  token: string | null;
  userId: string | null;
};
const initialState: AuthState = {
  initialized: false,
  token: null,
  userId: null,
};
function normalizeToken(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
function normalizeUserId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
function normalizeSession(payload: AuthSessionPayload): AuthSessionPayload {
  return {
    token: normalizeToken(payload.token),
    userId: normalizeUserId(payload.userId),
  };
}
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    authHydrated(state, action: PayloadAction<AuthSessionPayload>) {
      const session = normalizeSession(action.payload);
      state.initialized = true;
      state.token = session.token;
      state.userId = session.userId;
    },
    authSessionChanged(state, action: PayloadAction<AuthSessionPayload>) {
      const session = normalizeSession(action.payload);
      state.initialized = true;
      state.token = session.token;
      state.userId = session.userId;
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
export function selectAuthUserId(state: { auth: AuthState }): string | null {
  return state.auth.userId;
}
export function selectIsAuthenticated(state: { auth: AuthState }): boolean {
  return Boolean(state.auth.token);
}
export default authSlice.reducer;
