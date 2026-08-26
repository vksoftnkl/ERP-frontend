import type {
  AppSettingScope,
  EditableScope,
  EffectiveSetting,
  ResolveScopeQuery,
  ScopeTarget,
} from "../types";

/**
 * Narrowest wins: USER > DEVICE > BRANCH > COMPANY > GLOBAL > the catalog
 * default. `fn_app_settings_effective` resolves this server-side and returns
 * one flat answer per key — the client never merges layers, it only needs to
 * know how deep it is pointing.
 */
export const SCOPE_DEPTH: Record<AppSettingScope, number> = {
  GLOBAL: 1,
  COMPANY: 2,
  BRANCH: 3,
  DEVICE: 4,
  USER: 5,
};

export const SCOPE_LABEL: Record<AppSettingScope, string> = {
  GLOBAL: "installation",
  COMPANY: "company",
  BRANCH: "branch",
  DEVICE: "counter",
  USER: "user",
};

/**
 * Which layer the scope bar is pointed at.
 *
 * There is no "level" control and there must not be one: the level IS which of
 * branch and counter are set, so a bar that also carried a level could contradict
 * itself.
 *
 *   company + all branches + all counters -> COMPANY
 *   company + a branch     + all counters -> BRANCH
 *   company + a branch     + a counter    -> DEVICE
 *
 * A counter with no branch is incoherent — a till belongs to a branch — so the
 * counter is ignored rather than believed, and the caller warns. `resolveQuery`
 * below drops the same id, so what is drawn and what is edited stay the same
 * answer.
 */
export function deriveScope(target: ScopeTarget): EditableScope {
  if (!target.branchId) {
    return "COMPANY";
  }
  return target.deviceId ? "DEVICE" : "BRANCH";
}

/** True when a counter is selected but no branch is — the incoherent bar `deriveScope` ignores. */
export function isCounterWithoutBranch(target: ScopeTarget): boolean {
  return Boolean(target.deviceId) && !target.branchId;
}

/**
 * The `/effective` query for a scope bar.
 *
 * Every id is additive, so the ids sent are exactly the layers allowed to win:
 * reading COMPANY sends only the company, and a branch override cannot then
 * leak into a value the operator is about to edit company-wide. `userId` is
 * never sent — a person's own preferences must not colour an administrator's
 * view of the company's.
 */
export function resolveQuery(target: ScopeTarget): ResolveScopeQuery {
  const scope = deriveScope(target);
  return {
    ...(target.companyId ? { companyId: target.companyId } : {}),
    ...(scope !== "COMPANY" && target.branchId ? { branchId: target.branchId } : {}),
    ...(scope === "DEVICE" && target.deviceId ? { deviceId: target.deviceId } : {}),
  };
}

/**
 * May this setting be edited at this depth? `asdMaxScope` caps how deep each
 * setting goes, so a company-wide setting is read-only on a branch bar — shown
 * and explained, never hidden, because an operator hunting for it has to be
 * told where it lives rather than left wondering where it went.
 */
export function isEditableAtScope(
  setting: Pick<EffectiveSetting, "asdMaxScope">,
  scope: AppSettingScope,
): boolean {
  return SCOPE_DEPTH[scope] <= SCOPE_DEPTH[setting.asdMaxScope];
}

/** Why a row is read-only, in words an operator can act on. */
export function maxScopeExplanation(
  setting: Pick<EffectiveSetting, "asdMaxScope">,
  scope: AppSettingScope,
): string | null {
  if (isEditableAtScope(setting, scope)) {
    return null;
  }
  if (SCOPE_DEPTH[setting.asdMaxScope] < SCOPE_DEPTH.COMPANY) {
    return "Set for the whole installation — it cannot be changed from here.";
  }
  return `Set at ${SCOPE_LABEL[setting.asdMaxScope]} level — switch the bar to ${
    SCOPE_LABEL[setting.asdMaxScope]
  } to change it.`;
}

/**
 * Does an override sit at the layer the bar is pointed at?
 *
 * This is NOT `override != null`: an override showing here may sit at a broader
 * layer, where editing means creating a new row rather than moving that one,
 * and where Reset would be resetting somebody else's decision.
 */
export function hasOverrideAtScope(
  setting: Pick<EffectiveSetting, "override">,
  scope: AppSettingScope,
): boolean {
  return setting.override?.asvScope === scope;
}

/** Where the shown value came from, for the badge. */
export function sourceLabel(setting: Pick<EffectiveSetting, "source" | "override">): string {
  if (setting.source === "DEFAULT" || !setting.override) {
    return "Default";
  }
  return `Set on ${SCOPE_LABEL[setting.override.asvScope]}`;
}
