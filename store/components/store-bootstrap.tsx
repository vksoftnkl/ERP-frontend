"use client";

import { useEffect } from "react";
import {
  AUTH_SESSION_EVENT,
  getAuthSession,
  getAuthUserId,
  type AuthSessionChangeDetail,
} from "@/lib/auth/session";
import { useAppDispatch } from "@/store/hooks";
import { authHydrated, authSessionChanged } from "@/store/slices/authSlice";

export default function StoreBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(
      authHydrated({
        token: getAuthSession(),
        userId: getAuthUserId(),
      }),
    );

    const handleSessionChange = (event: Event) => {
      const customEvent = event as CustomEvent<AuthSessionChangeDetail>;
      dispatch(
        authSessionChanged({
          token: customEvent.detail?.token ?? getAuthSession(),
          userId: customEvent.detail?.userId ?? getAuthUserId(),
        }),
      );
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleSessionChange as EventListener);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionChange as EventListener);
    };
  }, [dispatch]);

  return null;
}
