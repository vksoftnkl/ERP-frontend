"use client";
import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  useGetEffectiveSettingsQuery,
  useResetAppSettingMutation,
  useSaveAppSettingsMutation,
} from "@/store/api/appSettingsApi";
import { getApiErrorMessage } from "@/store/api/baseApi";
import {
  buildScopedOverride,
  findSessionBranchOverride,
  useSessionSettingContext,
  useSessionSettingQuery,
} from "../form-defaults-setting";
import type { TemplateScopeChoice } from "./template-scope-modal";

/** What an "All Branches" save should do about this branch's own template. */
export type SaveTemplateOptions = {
  /** Reset the branch override so the company template reaches this branch too. */
  clearBranchTemplate?: boolean;
};

/**
 * The write half of "Save as Default Template": one override row, from one
 * click, and nothing else.
 *
 * It fires from `save()` and from nowhere else — no effect, no debounce, no
 * unload handler, no `enabled` flag. Typing in the form writes nothing, and
 * this never touches the customer save (nor the customer save this). The
 * template is allowed to be an incomplete customer, so the form's own
 * validation is not run either.
 *
 * The one thing it does beyond the write is the DELETE that makes "All
 * Branches" mean what it says. `masters.*_form_defaults` layers GLOBAL <
 * COMPANY < BRANCH like every setting, so a company-wide save made from a
 * branch that has its own template is written, is confirmed, and then changes
 * nothing the operator can see: the branch row goes on winning the read the
 * create form is seeded from. That reads as "the template did not save". So the
 * branch override is looked up here (`branchTemplate`) for the prompt to warn
 * about, and reset on request once the company row is safely written.
 *
 * The write-back into the running app is the mutations' `AppSettings` tag
 * invalidation: the customer screen holds a standing `/effective` subscription,
 * so the next Add uses the new template without a reload or a re-login.
 */
export function useSaveFormDefaultsTemplate(settingKey: string, label: string) {
  const session = useSessionSettingContext();
  const settingScope = useSessionSettingQuery(session);
  // The same query the host screen already subscribes to, so this shares its
  // cache entry rather than issuing a second read of the catalog.
  const { data: effectiveSettings } = useGetEffectiveSettingsQuery(settingScope);
  const [saveSettings] = useSaveAppSettingsMutation();
  const [resetSetting] = useResetAppSettingMutation();
  const [isSaving, setIsSaving] = useState(false);

  /** This branch's own template, which outranks anything saved for the company. */
  const branchTemplate = useMemo(
    () => findSessionBranchOverride(effectiveSettings, settingKey, session),
    [effectiveSettings, session, settingKey],
  );

  const save = useCallback(
    async (
      scope: TemplateScopeChoice,
      value: string,
      { clearBranchTemplate = false }: SaveTemplateOptions = {},
    ): Promise<boolean> => {
      // The scope ids come from the session, never from a picker — the guard
      // stays anyway, so this holds if a company picker is ever added.
      const target = { companyId: session.companyId, branchId: session.branchId };
      if (scope === "COMPANY" && !target.companyId) {
        toast.warning("This session is not signed in to a company, so there is nothing to save the template against.");
        return false;
      }
      if (scope === "BRANCH" && !target.branchId) {
        toast.warning("This session is not signed in to a branch, so the template cannot be saved for one.");
        return false;
      }
      setIsSaving(true);
      try {
        await saveSettings([buildScopedOverride(settingKey, value, scope, target)]).unwrap();
        if (scope === "BRANCH") {
          toast.success(
            `${label} saved for this branch. It takes precedence over any company-wide template.`,
          );
          return true;
        }
        // Company-wide, with this branch's own template still on top of it: the
        // save took, and the operator would see no change at all if they were
        // not told why. Removing it is the operator's call — it is a template
        // somebody wrote — so an untouched one is reported, not hidden.
        if (!branchTemplate) {
          toast.success(
            `${label} saved for every branch that has no template of its own.`,
          );
          return true;
        }
        if (!clearBranchTemplate) {
          toast.warning(
            `${label} saved for every branch, but this branch keeps its own template, ` +
              `so new records here are unchanged.`,
          );
          return true;
        }
        // Only after the company row is safely written: a reset that ran first
        // and a save that then failed would leave the branch with no template
        // at all.
        await resetSetting(branchTemplate.asvId).unwrap();
        toast.success(
          `${label} saved for every branch. This branch's own template was removed, ` +
            `so it uses the company-wide one from now on.`,
        );
        return true;
      } catch (error) {
        toast.error(getApiErrorMessage(error as never) ?? `Could not save the ${label.toLowerCase()}.`);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [branchTemplate, label, resetSetting, saveSettings, session.branchId, session.companyId, settingKey],
  );

  return {
    save,
    isSaving,
    canSaveToBranch: Boolean(session.branchId),
    /** True when an "All Branches" save would be shadowed by this branch's row. */
    hasBranchTemplate: Boolean(branchTemplate),
    session,
  };
}
