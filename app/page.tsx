"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import { HOME_ROUTE, LOGIN_ROUTE } from "@/lib/navigation/routes";
import { useAppSelector } from "@/store/hooks";
import {
  selectAuthInitialized,
  selectIsAuthenticated,
} from "@/store/slices/authSlice";

/**
 * `/` renders nothing of its own. The landing screen is the login page, so a
 * signed-out visitor is forwarded there; a session that is already signed in
 * goes straight to the home screen instead of being asked to log in again.
 */
export default function RootPage() {
  const router = useRouter();
  const authInitialized = useAppSelector(selectAuthInitialized);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  useEffect(() => {
    if (!authInitialized) {
      return;
    }
    notifyGlobalNavigationStart();
    router.replace(isAuthenticated ? HOME_ROUTE : LOGIN_ROUTE);
  }, [authInitialized, isAuthenticated, router]);

  return null;
}
