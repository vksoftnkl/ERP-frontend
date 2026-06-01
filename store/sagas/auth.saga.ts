import { call, put, takeLatest } from "redux-saga/effects";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createAction } from "@reduxjs/toolkit";
import { toast } from "react-toastify";
import { clearAuthSession } from "@/lib/auth/session";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import { baseApi } from "@/store/api/baseApi";
import { authSessionChanged } from "@/store/slices/authSlice";

// ─── Public action creators ───────────────────────────────────────────────────

/** Dispatch this to trigger a clean, saga-orchestrated logout. */
export const logoutRequested = createAction<{ showToast?: boolean } | void>(
  "auth/logoutRequested",
);

// ─── Workers ─────────────────────────────────────────────────────────────────

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  const currentRoute = `${window.location.pathname}${window.location.search}`;
  notifyGlobalNavigationStart();
  window.location.replace(`/login?next=${encodeURIComponent(currentRoute)}`);
}

function* logoutWorker(
  action: PayloadAction<{ showToast?: boolean } | void>,
): Generator {
  try {
    // 1. Clear tokens from memory + session storage + emit AUTH_SESSION_EVENT
    yield call(clearAuthSession);

    // 2. Update Redux auth state (authSlice.businessContext is cleared automatically)
    yield put(authSessionChanged({ isAuthenticated: false }));

    // 3. Flush all RTK Query caches so stale data doesn't leak to the next user
    yield put(baseApi.util.resetApiState());

    // 4. Optionally notify the user
    const showToast =
      action.payload && typeof action.payload === "object"
        ? action.payload.showToast !== false
        : true;
    if (showToast) {
      toast.info("You have been logged out.");
    }
  } finally {
    // 5. Navigate to login regardless of any error above
    yield call(redirectToLogin);
  }
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

export default function* authSaga(): Generator {
  yield takeLatest(logoutRequested, logoutWorker);
}
