"use client";
import { useMemo } from "react";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectBusinessContext, selectUserInfo } from "@/store/slices/authSlice";
import {
  sessionQuery,
  type SessionContext,
} from "@/features/settings/app-settings/lib/session-scope";
import type {
  AppSettingOverride,
  AppSettingScope,
  EffectiveSetting,
  ResolveScopeQuery,
  SaveAppSettingValueDto,
} from "@/features/settings/app-settings/types";

/**
 * The "what a master form starts with" settings, read and written through the
 * app-settings catalog (`/app-setting-values/*`) rather than a bespoke store.
 *
 * A master template IS a setting: `public.app_setting_def` carries
 * `masters.customer_form_defaults` (and `masters.item_form_defaults`) as TEXT
 * rows with `asd_max_scope = BRANCH`, so the value layers GLOBAL < COMPANY <
 * BRANCH like every other setting and the App Settings screen can see and reset
 * it. The text is a JSON object of the create form's own field names — see
 * `parseCustomerFormDefaults` for the customer one.
 *
 * Reading and writing both follow the SESSION, and they have to agree or the
 * screen lies:
 *  - read `/effective` with the session's ids, so the value shown is the value
 *    the create form will actually use (a branch override beating the company
 *    row is the point of the layering);
 *  - write at the DEEPEST layer the session names — the branch the operator is
 *    signed in to, else its company, else GLOBAL. Writing GLOBAL from a session
 *    that sits under a COMPANY or BRANCH override would save a value the same
 *    screen then cannot show, because the deeper row keeps winning the read.
 */
export const CUSTOMER_FORM_DEFAULTS_SETTING_KEY = "masters.customer_form_defaults";
export const ITEM_FORM_DEFAULTS_SETTING_KEY = "masters.item_form_defaults";

/** The company, branch, counter and user this browser session is inside. */
export function useSessionSettingContext(): SessionContext {
  const businessContext = useAppSelector(selectBusinessContext);
  const userInfo = useAppSelector(selectUserInfo);
  const userId = useAppSelector(selectAuthUserId);
  return useMemo<SessionContext>(
    () => ({
      companyId: businessContext?.companyId ?? null,
      branchId: businessContext?.branchId ?? null,
      deviceId: userInfo?.deviceId ?? null,
      userId: userId ?? null,
    }),
    [businessContext?.companyId, businessContext?.branchId, userInfo?.deviceId, userId],
  );
}

/**
 * The `/effective` query for this session, with a stable identity so RTK Query
 * is keyed on the scope rather than on a new object every render (it also
 * shares the cache entry with the App Settings screen's own session read).
 */
export function useSessionSettingQuery(session: SessionContext): ResolveScopeQuery {
  return useMemo(
    () => sessionQuery(session),
    [session],
  );
}

/** The raw text of one setting out of an `/effective` read; null when unset. */
export function findEffectiveSettingValue(
  rows: EffectiveSetting[] | undefined,
  key: string,
): string | null {
  const row = rows?.find((setting) => setting.asdKey === key);
  const value = row?.value;
  return value == null || value.trim() === "" ? null : value;
}

/**
 * This session's own BRANCH override of one setting, when it has one.
 *
 * The layering that makes a branch template useful is the same layering that
 * makes an "All Branches" save look like it did nothing: the COMPANY row is
 * written, the read returns the BRANCH row that still sits on top of it, and
 * the create form goes on starting the way it did before. A caller about to
 * write COMPANY needs to know that row is there — to say so, and to offer to
 * take it away — so it is picked out here rather than guessed at.
 *
 * Only the row this session would actually be shadowed BY counts: an override
 * belonging to another branch never reaches this read, but the branch id is
 * compared anyway so a stale cache entry from a branch just switched away from
 * cannot be mistaken for the current one.
 */
export function findSessionBranchOverride(
  rows: EffectiveSetting[] | undefined,
  key: string,
  session: Pick<SessionContext, "branchId">,
): AppSettingOverride | null {
  if (!session.branchId) {
    return null;
  }
  const override = rows?.find((setting) => setting.asdKey === key)?.override;
  return override && override.asvScope === "BRANCH" && override.asvBranchId === session.branchId
    ? override
    : null;
}

/** The setting text as the JSON object it holds; null when it is not one. */
export function parseSettingObject(
  value: string | null | undefined,
): Record<string, unknown> | null {
  if (!value || !value.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The override to POST to `/app-setting-values/create`.
 *
 * No `asvId`: the server upserts on (setting, scope target), which is what Save
 * means here — the second save moves the row the first one wrote. A
 * client-minted uuid is by definition an id the server cannot find, and neither
 * screen reads the override list, so neither could supply a real one. If
 * `/create` ever stops upserting, both callers have to read `/effective` for
 * the key first and pass the stored `asvId` — the payload test is written so
 * that change is loud.
 *
 * Exactly one scope id is sent, the one the scope names; the deployed
 * `ck_asv_scope_ids` takes nothing else.
 */
export function buildScopedOverride(
  key: string,
  value: string,
  scope: AppSettingScope,
  target: { companyId: string | null; branchId: string | null },
): SaveAppSettingValueDto {
  return {
    asvSettingKey: key,
    asvScope: scope,
    asvCompanyId: scope === "COMPANY" ? target.companyId : null,
    asvBranchId: scope === "BRANCH" ? target.branchId : null,
    asvDeviceId: null,
    asvUserId: null,
    asvValue: value,
  };
}

/** The same, at the deepest layer this session names. */
export function buildSessionScopeOverride(
  key: string,
  value: string,
  session: SessionContext,
): SaveAppSettingValueDto {
  const scope: AppSettingScope = session.branchId
    ? "BRANCH"
    : session.companyId
      ? "COMPANY"
      : "GLOBAL";
  return buildScopedOverride(key, value, scope, session);
}

/** Where a save from this session lands, for the screen to say so out loud. */
export function describeSessionScope(session: SessionContext): string {
  if (session.branchId) {
    return "this branch";
  }
  if (session.companyId) {
    return "this company";
  }
  return "every company";
}
