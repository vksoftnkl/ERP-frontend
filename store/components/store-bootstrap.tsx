"use client";

import { useEffect } from "react";
import {
  AUTH_SESSION_EVENT,
  getAuthSession,
  getAuthUserId,
  getRefreshToken,
  type AuthSessionChangeDetail,
} from "@/lib/auth/session";
import { hydrateClientCache } from "@/lib/cache/client-cache";
import { useAppDispatch } from "@/store/hooks";
import { loadPersistedReduxState } from "@/store/store";
import { authHydrated, authSessionChanged } from "@/store/slices/authSlice";
import { gridColumnsHydrated } from "@/store/slices/gridColumnsSlice";

export default function StoreBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let active = true;

    void hydrateClientCache().finally(() => {
      if (!active) {
        return;
      }
      const persistedState = loadPersistedReduxState();
      if (persistedState?.gridColumns) {
        dispatch(gridColumnsHydrated(persistedState.gridColumns));
      }
      dispatch(
        authHydrated({
          token: persistedState?.auth?.token ?? getAuthSession(),
          refreshToken: persistedState?.auth?.refreshToken ?? getRefreshToken(),
          userId: persistedState?.auth?.userId ?? getAuthUserId(),
          recentPages: persistedState?.auth?.recentPages,
          businessContext: persistedState?.auth?.businessContext,
        }),
      );
    });

    const handleSessionChange = (event: Event) => {
      const customEvent = event as CustomEvent<AuthSessionChangeDetail>;
      dispatch(
        authSessionChanged({
          token: customEvent.detail?.token ?? null,
          refreshToken: customEvent.detail?.refreshToken ?? null,
          userId: customEvent.detail?.userId ?? null,
        }),
      );
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleSessionChange as EventListener);
    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionChange as EventListener);
    };
  }, [dispatch]);

  return null;
}
