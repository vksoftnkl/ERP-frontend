"use client";

/**
 * User id -> display name, for the uuid actor columns (`ptvCreatedBy`,
 * `ptvApprovedBy`). The ids are real references to user_master, but no read
 * joins a name, so the names come from the active-user lookup instead.
 *
 * The session user is folded in from the login block when the lookup does not
 * carry them (an inactive account can still be signed in), so "Sign as me"
 * always shows a name.
 */

import { useMemo } from "react";

import { useGetUserOptionsQuery } from "@/store/api/lookupsApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectUserInfo } from "@/store/slices/authSlice";

export function useUserNames(): Map<string, string> {
  const { data: options } = useGetUserOptionsQuery();
  const sessionUserId = useAppSelector(selectAuthUserId);
  const sessionUserName = useAppSelector(selectUserInfo)?.userName ?? null;

  return useMemo(() => {
    const names = new Map<string, string>();
    for (const option of options ?? []) {
      if (option.value) names.set(option.value, option.label);
    }
    if (sessionUserId && !names.has(sessionUserId)) {
      names.set(sessionUserId, sessionUserName ?? sessionUserId);
    }
    return names;
  }, [options, sessionUserId, sessionUserName]);
}
