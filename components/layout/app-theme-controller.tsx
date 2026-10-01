"use client";

/**
 * Paints the session's company in its theme, and repaints on every company
 * switch.
 *
 * One apply path for both: the company the session starts in and a change in
 * the header's company combo both land as a new `businessContext.companyId`.
 * The company's remembered theme is painted at once, then the server's answer
 * replaces it if it differs — so a switch never waits on the network, and a
 * failed read is silent: the remembered (or compiled) colours stay in force.
 *
 * Sign-out keeps the last theme, as the Qt client does: the login screen of a
 * shop's own PC should look like that shop.
 *
 * Renders nothing; the colours live on `<html>` (see lib/app-theme.ts).
 */

import { useEffect } from "react";

import { applyTheme, readCachedTheme, rememberTheme } from "@/lib/app-theme";
import { useGetEffectiveAppThemeQuery } from "@/store/api/appThemeApi";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext, selectIsAuthenticated } from "@/store/slices/authSlice";

export default function AppThemeController() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const companyId = useAppSelector(selectBusinessContext)?.companyId ?? null;

  useEffect(() => {
    if (!companyId) return;
    const cached = readCachedTheme(companyId);
    if (cached) applyTheme(cached.tokens);
  }, [companyId]);

  // `currentData`, not `data`: while company B loads, `data` still holds
  // company A's theme and would paint it over B's remembered one.
  const { currentData } = useGetEffectiveAppThemeQuery(companyId ?? "", {
    skip: !isAuthenticated || !companyId,
  });

  useEffect(() => {
    if (!currentData || !companyId) return;
    rememberTheme(companyId, currentData, applyTheme(currentData.tokens));
  }, [currentData, companyId]);

  return null;
}
