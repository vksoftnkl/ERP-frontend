"use client";

/**
 * Holds the settings the RUNNING session is under.
 *
 * The settings screen resolves whatever scope its bar is pointed at; this reads
 * the one scope the app itself is inside — the session's company, branch,
 * counter and user, every layer down to the person — and pushes the answer into
 * the store, where any screen can read a setting without a fetch of its own.
 *
 * Mounted once, above the routes, because a setting is not the property of the
 * screen that happens to use it: `system.font_capitalization` governs typing
 * everywhere, and a per-screen read would leave the first field the user
 * touches after a sign-in behaving differently from the rest.
 *
 * The read carries the `AppSettings` tag, so saving an override invalidates it
 * and the new values arrive here on their own — which is what makes a setting
 * the catalog marks `asdNeedsRelogin: false` genuinely need no sign-in.
 */

import { useEffect, useMemo } from "react";

import { useDebounce } from "@/hooks/useDebounce";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { appSettingsApplied, appSettingsCleared } from "@/store/slices/appSettingsSlice";
import {
  selectAuthUserId,
  selectBusinessContext,
  selectIsAuthenticated,
  selectUserInfo,
} from "@/store/slices/authSlice";
import { sessionQuery, type SessionContext } from "@/features/settings/app-settings/lib/session-scope";

/**
 * Auth, the persisted business context and the provider that corrects the
 * branch to one the company owns all land within a few frames of each other,
 * and each of them moves the scope. Without this the boot fired three reads for
 * one session — the same burst the settings screen coalesces on its scope bar.
 */
const SESSION_DEBOUNCE_MS = 150;

export default function SessionAppSettings() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const businessContext = useAppSelector(selectBusinessContext);
  const userInfo = useAppSelector(selectUserInfo);
  const userId = useAppSelector(selectAuthUserId);

  const session = useMemo<SessionContext>(
    () => ({
      companyId: businessContext?.companyId ?? null,
      branchId: businessContext?.branchId ?? null,
      deviceId: userInfo?.deviceId ?? null,
      userId: userId ?? null,
    }),
    [businessContext?.companyId, businessContext?.branchId, userInfo?.deviceId, userId],
  );

  // Every id is optional and additive: a layer whose id is absent never
  // matches, so a session that has not picked a company yet still resolves —
  // it simply resolves to the defaults, and re-resolves when the company lands.
  const settledSession = useDebounce(session, SESSION_DEBOUNCE_MS);
  const query = useMemo(() => sessionQuery(settledSession), [settledSession]);

  const { data } = useGetEffectiveSettingsQuery(query, { skip: !isAuthenticated });

  useEffect(() => {
    if (!isAuthenticated) {
      // Sign-out: the next person at this browser must not inherit the last
      // one's settings, not even for the moment before their own read lands.
      dispatch(appSettingsCleared());
      return;
    }
    if (data) {
      dispatch(appSettingsApplied(data));
    }
  }, [data, isAuthenticated, dispatch]);

  return null;
}
