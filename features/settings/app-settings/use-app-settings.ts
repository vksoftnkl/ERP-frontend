"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useDebounce } from "@/hooks/useDebounce";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  useGetEffectiveSettingsQuery,
  useLazyGetEffectiveSettingsQuery,
  useResetAppSettingMutation,
  useSaveAppSettingsMutation,
} from "@/store/api/appSettingsApi";
import { getApiErrorMessage } from "@/store/api/baseApi";
import { appSettingsApplied } from "@/store/slices/appSettingsSlice";
import { selectAuthUserId, selectBusinessContext, selectUserInfo } from "@/store/slices/authSlice";
import { buildOverride } from "./lib/build-override";
import {
  deriveScope,
  hasOverrideAtScope,
  isEditableAtScope,
  maxScopeExplanation,
  resolveQuery,
} from "./lib/scope";
import { isSessionScope, sessionQuery, type SessionContext } from "./lib/session-scope";
import { currentText, isSameValue, toText, validateText } from "./lib/value-text";
import type { EditableScope, EffectiveSetting, ScopeTarget } from "./types";

/** Coalesces the burst of reads a company change causes — company repopulates
 * branch and counter, each of which fires its own change, and the Qt screen
 * fired three GETs for one company change with the last to arrive winning. */
const SCOPE_DEBOUNCE_MS = 80;

export type SettingRow = EffectiveSetting & {
  /** The text a control is showing: the pending edit if there is one, else the effective value. */
  draft: string;
  dirty: boolean;
  error: string | null;
  editable: boolean;
  /** Why the row is read-only — an operator hunting for a setting must be told where it lives. */
  readOnlyReason: string | null;
  /** An override sits at THIS layer, so it can be reset from here. */
  resettable: boolean;
};

export type SettingGroupView = {
  module: string;
  group: string;
  key: string;
  rows: SettingRow[];
};

export type ModuleTreeNode = {
  module: string;
  total: number;
  changed: number;
  groups: Array<{ group: string; key: string; total: number; changed: number }>;
};

/** Drafts are held per scope, so moving the bar to look at another layer and
 * coming back does not silently throw away what was typed. */
type DraftsByScope = Record<string, Record<string, string>>;

function scopeKey(target: ScopeTarget): string {
  const scope = deriveScope(target);
  if (scope === "DEVICE") return `DEVICE:${target.deviceId}`;
  if (scope === "BRANCH") return `BRANCH:${target.branchId}`;
  return `COMPANY:${target.companyId ?? ""}`;
}

function matchesSearch(setting: EffectiveSetting, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${setting.asdLabel} ${setting.asdKey} ${setting.asdDescription ?? ""}`;
  return haystack.toLowerCase().includes(needle);
}

export function useAppSettings() {
  const dispatch = useAppDispatch();
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

  // The floor read: the bar opens on the session's own company, so the first
  // GET goes out without waiting on the company lookup. The Qt port regressed
  // exactly here — the read was chained off the lookup, and a lookup that
  // failed or came back empty left a screen showing nothing, for ever.
  const [target, setTarget] = useState<ScopeTarget>(() => ({
    companyId: session.companyId,
    branchId: null,
    deviceId: null,
  }));
  const companyTouchedRef = useRef(false);

  // Auth hydrates asynchronously; adopt the session's company when it lands,
  // unless the operator has already chosen one.
  useEffect(() => {
    if (companyTouchedRef.current || !session.companyId) return;
    setTarget((current) =>
      current.companyId === session.companyId ? current : { ...current, companyId: session.companyId },
    );
  }, [session.companyId]);

  const debouncedTarget = useDebounce(target, SCOPE_DEBOUNCE_MS);
  const scope: EditableScope = deriveScope(debouncedTarget);
  // `useDebounce` holds one object until the timer fires, so this identity is
  // exactly the coalesced scope — which is what RTK Query should be keyed on.
  const query = useMemo(() => resolveQuery(debouncedTarget), [debouncedTarget]);

  const {
    data: settings,
    isFetching,
    isLoading,
    error: readError,
    refetch,
  } = useGetEffectiveSettingsQuery(query);
  const [readSessionSettings] = useLazyGetEffectiveSettingsQuery();
  const [saveSettings, { isLoading: isSaving }] = useSaveAppSettingsMutation();
  const [resetSetting, { isLoading: isResetting }] = useResetAppSettingMutation();

  const [draftsByScope, setDraftsByScope] = useState<DraftsByScope>({});
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const activeScopeKey = scopeKey(debouncedTarget);
  const drafts = useMemo(() => draftsByScope[activeScopeKey] ?? {}, [draftsByScope, activeScopeKey]);

  /**
   * The effective value and the pending edit are kept apart, always: the badge
   * and the Reset button both need to know what the server currently says, and
   * overwriting one with the other would lose that.
   */
  const rows = useMemo<SettingRow[]>(() => {
    const catalog = settings ?? [];
    return catalog.map((setting) => {
      const pending = drafts[setting.asdKey];
      const effective = currentText(setting);
      const draft = pending ?? effective;
      const dirty = pending !== undefined && !isSameValue(pending, effective, setting.asdDataType);
      const editable = isEditableAtScope(setting, scope);
      return {
        ...setting,
        draft,
        dirty,
        error: dirty ? validateText(draft, setting) : null,
        editable,
        readOnlyReason: maxScopeExplanation(setting, scope),
        resettable: editable && hasOverrideAtScope(setting, scope),
      };
    });
  }, [settings, drafts, scope]);

  const dirtyRows = useMemo(() => rows.filter((row) => row.dirty), [rows]);
  const invalidRows = useMemo(() => dirtyRows.filter((row) => row.error), [dirtyRows]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesSearch(row, needle)) return false;
      if (changedOnly && row.source !== "OVERRIDE" && !row.dirty) return false;
      return true;
    });
  }, [rows, search, changedOnly]);

  /** module -> group, with the counts that tell an operator where to look. */
  const tree = useMemo<ModuleTreeNode[]>(() => {
    const modules = new Map<string, Map<string, { total: number; changed: number }>>();
    for (const row of visibleRows) {
      const groups = modules.get(row.asdModule) ?? new Map();
      const entry = groups.get(row.asdGroup) ?? { total: 0, changed: 0 };
      entry.total += 1;
      if (row.source === "OVERRIDE" || row.dirty) entry.changed += 1;
      groups.set(row.asdGroup, entry);
      modules.set(row.asdModule, groups);
    }
    return [...modules.entries()]
      .map(([module, groups]) => {
        const groupNodes = [...groups.entries()]
          .map(([group, counts]) => ({ group, key: `${module}/${group}`, ...counts }))
          .sort((a, b) => a.group.localeCompare(b.group));
        return {
          module,
          total: groupNodes.reduce((sum, node) => sum + node.total, 0),
          changed: groupNodes.reduce((sum, node) => sum + node.changed, 0),
          groups: groupNodes,
        };
      })
      .sort((a, b) => a.module.localeCompare(b.module));
  }, [visibleRows]);

  // A group that has gone away — filtered out, or never there for this
  // catalog — must not leave the right-hand pane empty with no explanation.
  const activeGroupKey = useMemo(() => {
    const keys = tree.flatMap((node) => node.groups.map((group) => group.key));
    if (selectedGroup && keys.includes(selectedGroup)) return selectedGroup;
    return keys[0] ?? null;
  }, [tree, selectedGroup]);

  const groupView = useMemo<SettingGroupView | null>(() => {
    if (!activeGroupKey) return null;
    const [module, group] = activeGroupKey.split("/");
    const groupRows = visibleRows
      .filter((row) => row.asdModule === module && row.asdGroup === group)
      .sort((a, b) => a.asdSortOrder - b.asdSortOrder || a.asdLabel.localeCompare(b.asdLabel));
    return { module, group, key: activeGroupKey, rows: groupRows };
  }, [activeGroupKey, visibleRows]);

  const setDraft = useCallback(
    (key: string, value: string) => {
      setDraftsByScope((current) => ({
        ...current,
        [activeScopeKey]: { ...(current[activeScopeKey] ?? {}), [key]: value },
      }));
    },
    [activeScopeKey],
  );

  const discardDrafts = useCallback(() => {
    setDraftsByScope((current) => {
      if (!current[activeScopeKey]) return current;
      const next = { ...current };
      delete next[activeScopeKey];
      return next;
    });
  }, [activeScopeKey]);

  /**
   * Push the saved values into the running app so nothing needs a sign-out that
   * the catalog does not say needs one — but only when the bar is pointed at
   * the context this session is actually inside.
   */
  const reapplyToSession = useCallback(async () => {
    if (!isSessionScope(debouncedTarget, session)) return;
    try {
      const applied = await readSessionSettings(sessionQuery(session), false).unwrap();
      dispatch(appSettingsApplied(applied));
    } catch {
      // The save itself stood; the running app simply keeps the values it had.
    }
  }, [debouncedTarget, session, readSessionSettings, dispatch]);

  const save = useCallback(async () => {
    if (invalidRows.length > 0) {
      setSelectedGroup(`${invalidRows[0].asdModule}/${invalidRows[0].asdGroup}`);
      toast.error(`${invalidRows[0].asdLabel}: ${invalidRows[0].error}`);
      return;
    }
    const writable = dirtyRows.filter((row) => row.editable);
    if (writable.length === 0) {
      toast.info("Nothing to save.");
      return;
    }
    const payload = writable.map((row) =>
      buildOverride(row, scope, debouncedTarget, toText(row.draft, row.asdDataType)),
    );
    try {
      await saveSettings(payload).unwrap();
      discardDrafts();
      // Re-read rather than patch in place: the server decides what the
      // effective value now is and at which layer it sits, and a local guess
      // about the fallback will eventually be wrong.
      await refetch();
      await reapplyToSession();
      const needsRelogin = writable.filter((row) => row.asdNeedsRelogin);
      const saved = `${writable.length} setting${writable.length === 1 ? "" : "s"} saved`;
      toast.success(
        needsRelogin.length === 0
          ? `${saved}, and in effect now.`
          : `${saved}. ${needsRelogin.map((row) => row.asdLabel).join(", ")} need${
              needsRelogin.length === 1 ? "s" : ""
            } a sign-in to take effect.`,
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error as never) ?? "Could not save the settings.");
    }
  }, [
    invalidRows,
    dirtyRows,
    scope,
    debouncedTarget,
    saveSettings,
    discardDrafts,
    refetch,
    reapplyToSession,
  ]);

  const reset = useCallback(
    async (row: SettingRow) => {
      // Only an override at THIS layer can be reset from here — you cannot undo
      // a decision made somewhere else from a screen pointed somewhere else.
      if (!row.override || !row.resettable) return;
      try {
        await resetSetting(row.override.asvId).unwrap();
        setDraftsByScope((current) => {
          const scopeDrafts = current[activeScopeKey];
          if (!scopeDrafts || !(row.asdKey in scopeDrafts)) return current;
          const next = { ...scopeDrafts };
          delete next[row.asdKey];
          return { ...current, [activeScopeKey]: next };
        });
        await refetch();
        await reapplyToSession();
        toast.success(`${row.asdLabel} reset — it inherits again.`);
      } catch (error) {
        toast.error(getApiErrorMessage(error as never) ?? "Could not reset the setting.");
      }
    },
    [resetSetting, refetch, reapplyToSession, activeScopeKey],
  );

  return {
    target,
    setTarget: (next: ScopeTarget) => {
      if (next.companyId !== target.companyId) companyTouchedRef.current = true;
      setTarget(next);
    },
    scope,
    session,
    isSessionScope: isSessionScope(debouncedTarget, session),
    rows,
    tree,
    groupView,
    activeGroupKey,
    selectGroup: setSelectedGroup,
    search,
    setSearch,
    changedOnly,
    setChangedOnly,
    dirtyCount: dirtyRows.length,
    setDraft,
    discardDrafts,
    save,
    reset,
    refetch,
    isLoading,
    isFetching,
    isSaving,
    isResetting,
    readError: getApiErrorMessage(readError as never),
  };
}
