"use client";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useSaveAppSettingsMutation } from "@/store/api/appSettingsApi";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { buildScopedOverride, useSessionSettingContext } from "../form-defaults-setting";
import type { TemplateScopeChoice } from "./template-scope-modal";

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
 * The write-back into the running app is the mutation's `AppSettings` tag
 * invalidation: the customer screen holds a standing `/effective` subscription,
 * so the next Add uses the new template without a reload or a re-login.
 */
export function useSaveFormDefaultsTemplate(settingKey: string, label: string) {
  const session = useSessionSettingContext();
  const [saveSettings] = useSaveAppSettingsMutation();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(
    async (scope: TemplateScopeChoice, value: string): Promise<boolean> => {
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
        toast.success(
          scope === "BRANCH"
            ? `${label} saved for this branch. It takes precedence over any company-wide template.`
            : `${label} saved for every branch that has no template of its own.`,
        );
        return true;
      } catch (error) {
        toast.error(getApiErrorMessage(error as never) ?? `Could not save the ${label.toLowerCase()}.`);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [label, saveSettings, session.branchId, session.companyId, settingKey],
  );

  return { save, isSaving, canSaveToBranch: Boolean(session.branchId), session };
}
