"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import type { MenuPermissions } from "@/lib/permissions/menu-permissions";
import {
  useDeleteAppThemeMutation,
  useGetAppThemeListQuery,
  useGetAppThemeQuery,
  useRestoreAppThemeMutation,
  useSaveAppThemeMutation,
  type AppTheme,
  type SaveAppThemeBody,
} from "@/store/api/appThemeApi";
import { apiErrorText } from "./lib/api-error";
import { filterThemeRows, initialThemeId, normaliseThemeRows, type ThemeListRow } from "./lib/theme-list";
import {
  BUILT_IN_TOKENS,
  THEME_BASES,
  countChangedTokens,
  resolveTokens,
} from "./lib/token-catalogue";

/** The server caches a grid run for about a second; re-read once it has turned over. */
const LIST_RELOAD_DELAY_MS = 1500;

export type ThemeForm = {
  name: string;
  base: string;
  active: boolean;
  remarks: string;
};

const NEW_FORM: ThemeForm = { name: "", base: "LIGHT", active: true, remarks: "" };

function formOf(theme: AppTheme): ThemeForm {
  return {
    name: theme.thmName ?? "",
    base: (THEME_BASES as readonly string[]).includes(theme.thmBase) ? theme.thmBase : "LIGHT",
    active: Boolean(theme.thmIsActive),
    remarks: theme.thmRemarks ?? "",
  };
}

/** What makes a /get answer worth re-showing: a save, a delete, a new default. */
function seedKey(theme: AppTheme): string {
  return [theme.thmId, theme.thmModifiedOn, theme.thmIsDeleted, theme.thmIsDefault, theme.usedByCount].join(":");
}

type Options = {
  permissions: MenuPermissions;
  /** The company's theme id (/effective) — the screen opens on it. */
  effectiveId: number | null;
  effectiveSettled: boolean;
  endPreview: () => void;
};

/**
 * The Themes tab — a theme is a PALETTE: 38 colour keys. The list is grid 125;
 * the right side edits one theme and `POST /app-themes/save` sends the whole
 * tokens object (it REPLACES the stored one). New starts from the shown
 * theme's colours. Delete / Restore / Set default are the server's rules: the
 * default and a theme in use cannot be deleted (409, shown as the server says).
 */
export function useThemesTab({ permissions, effectiveId, effectiveSettled, endPreview }: Options) {
  // ── The list ─────────────────────────────────────────────────────────────
  const listQuery = useGetAppThemeListQuery();
  const listData = listQuery.data;
  /** Local Delete / Restore marks, for the list answer they were made on — a fresh one supersedes them. */
  const [deletedPatch, setDeletedPatch] = useState<{ source: unknown; marks: Record<number, boolean> }>({
    source: null,
    marks: {},
  });
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const rows = useMemo<ThemeListRow[]>(() => {
    const marks = deletedPatch.source === listData ? deletedPatch.marks : {};
    return normaliseThemeRows(listData?.items).map((row) =>
      row.thmId in marks ? { ...row, isDeleted: marks[row.thmId] } : row,
    );
  }, [listData, deletedPatch]);
  const visibleRows = useMemo(() => filterThemeRows(rows, search, showDeleted), [rows, search, showDeleted]);

  const reloadTimer = useRef<number | null>(null);
  const { refetch: refetchList } = listQuery;
  const reloadListSoon = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      void refetchList();
    }, LIST_RELOAD_DELAY_MS);
  }, [refetchList]);
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    },
    [],
  );

  const markDeleted = useCallback(
    (thmId: number, deleted: boolean) => {
      setDeletedPatch((current) => ({
        source: listData,
        marks: { ...(current.source === listData ? current.marks : {}), [thmId]: deleted },
      }));
    },
    [listData],
  );

  // ── The theme on the right ───────────────────────────────────────────────
  const [shownId, setShownId] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const [loaded, setLoaded] = useState<AppTheme | null>(null);
  const [form, setForm] = useState<ThemeForm>(NEW_FORM);
  const [tokens, setTokens] = useState<Record<string, string>>(() => ({ ...BUILT_IN_TOKENS }));
  const [loadedTokens, setLoadedTokens] = useState<Record<string, string>>(() => ({ ...BUILT_IN_TOKENS }));
  const seededKeyRef = useRef<string | null>(null);
  /** The next /get answer is shown even over unsaved edits (after Delete / Restore). */
  const forceSeedRef = useRef(false);

  const themeQuery = useGetAppThemeQuery(shownId, { skip: shownId <= 0 });

  /** theme = a /get answer. isNew: that theme's colours, but nothing else. */
  const showTheme = useCallback(
    (theme: Pick<AppTheme, "tokens"> & Partial<AppTheme>, asNew: boolean) => {
      endPreview();
      const resolved = resolveTokens(theme.tokens);
      setTokens(resolved);
      // A new theme's "loaded" values are where it started, so its changed
      // count reads what the user altered since New.
      setLoadedTokens(resolved);
      setForm(asNew ? NEW_FORM : formOf(theme as AppTheme));
      setLoaded(asNew ? null : (theme as AppTheme));
      setIsNew(asNew);
    },
    [endPreview],
  );

  const changedCount = useMemo(() => countChangedTokens(tokens, loadedTokens), [tokens, loadedTokens]);

  const dirty = useMemo(() => {
    if (isNew) return true;
    if (!loaded) return false;
    return (
      changedCount > 0 ||
      form.name.trim() !== (loaded.thmName ?? "") ||
      form.remarks.trim() !== (loaded.thmRemarks ?? "") ||
      form.base !== loaded.thmBase ||
      form.active !== Boolean(loaded.thmIsActive)
    );
  }, [isNew, loaded, changedCount, form]);

  /** A New nobody has touched yet is not worth asking about. */
  const pristineNew = isNew && changedCount === 0 && !form.name.trim();
  const hasUnsavedChanges = dirty && !pristineNew;

  // Show the /get answer for the selected theme — but never over edits the
  // user has not saved: the data-freshness bus refetches on every tab focus,
  // and another user's save must not silently replace what is on screen.
  const current = themeQuery.currentData;
  useEffect(() => {
    if (isNew || !current || current.thmId !== shownId) return;
    const key = seedKey(current);
    if (key === seededKeyRef.current) return;
    if (dirty && seededKeyRef.current !== null && !forceSeedRef.current) return;
    seededKeyRef.current = key;
    forceSeedRef.current = false;
    showTheme(current, false);
  }, [current, shownId, isNew, dirty, showTheme]);

  // First load: open the company's theme (or the default, or the first).
  // Adjusted during render, once — later list answers never move the screen.
  if (shownId === 0 && !isNew && rows.length > 0 && effectiveSettled) {
    const id = initialThemeId(rows, effectiveId);
    if (id > 0) setShownId(id);
  }

  const confirmDiscard = useCallback(
    async (action: string) => {
      if (!hasUnsavedChanges) return true;
      return confirm({
        title: action,
        message: "The theme on screen has changes that are not saved. Drop them?",
        confirmLabel: "Drop changes",
        iconVariant: "replace",
      });
    },
    [hasUnsavedChanges],
  );

  const selectTheme = useCallback(
    async (thmId: number) => {
      if (thmId === shownId && !isNew) return;
      if (!(await confirmDiscard("Open another theme"))) return;
      seededKeyRef.current = null;
      setIsNew(false);
      setShownId(thmId);
    },
    [shownId, isNew, confirmDiscard],
  );

  // ── Derived state ────────────────────────────────────────────────────────
  const isDeleted = !isNew && Boolean(loaded?.thmIsDeleted);
  const isDefault = !isNew && Boolean(loaded?.thmIsDefault);
  const usedBy = isNew ? 0 : (loaded?.usedByCount ?? 0);
  /** The shown theme's /get has landed (false while another one loads). */
  const ready = isNew || (loaded !== null && loaded.thmId === shownId);
  const canWrite = ready && (isNew ? permissions.canCreate : permissions.canEdit && !isDeleted);

  const editedBody = useCallback((): SaveAppThemeBody => {
    const body: SaveAppThemeBody = {
      thmName: form.name.trim(),
      thmBase: form.base,
      thmIsActive: form.active,
      thmRemarks: form.remarks.trim() || null,
      tokens: { ...tokens },
    };
    if (!isNew && shownId > 0) {
      body.thmId = shownId;
      body.thmIsDefault = Boolean(loaded?.thmIsDefault);
    }
    return body;
  }, [form, tokens, isNew, shownId, loaded]);

  // ── Edits ────────────────────────────────────────────────────────────────
  const setToken = useCallback((key: string, value: string) => {
    setTokens((currentTokens) => ({ ...currentTokens, [key]: value.toUpperCase() }));
  }, []);

  const resetToken = useCallback((key: string) => {
    const builtIn = BUILT_IN_TOKENS[key];
    if (builtIn) setToken(key, builtIn);
  }, [setToken]);

  const updateForm = useCallback((patch: Partial<ThemeForm>) => {
    setForm((currentForm) => ({ ...currentForm, ...patch }));
  }, []);

  // ── Verbs ────────────────────────────────────────────────────────────────
  const [saveTheme, saveState] = useSaveAppThemeMutation();
  const [deleteThemeMutation, deleteState] = useDeleteAppThemeMutation();
  const [restoreThemeMutation, restoreState] = useRestoreAppThemeMutation();
  const busy = saveState.isLoading || deleteState.isLoading || restoreState.isLoading;

  const startNew = useCallback(async () => {
    if (!permissions.canCreate) return false;
    if (!(await confirmDiscard("Start a new theme"))) return false;
    seededKeyRef.current = null;
    showTheme({ tokens: loaded?.tokens ?? tokens }, true);
    return true;
  }, [permissions.canCreate, confirmDiscard, showTheme, loaded, tokens]);

  const save = useCallback(async (): Promise<"saved" | "no-name" | "failed"> => {
    const body = editedBody();
    if (!body.thmName) {
      toast.warn("A theme needs a name.");
      return "no-name";
    }
    endPreview();
    try {
      const saved = await saveTheme(body).unwrap();
      seededKeyRef.current = seedKey(saved);
      setShownId(saved.thmId);
      showTheme(saved, false);
      reloadListSoon();
      toast.success(`${saved.thmName} saved.`);
      return "saved";
    } catch (error) {
      toast.error(apiErrorText(error, "The theme could not be saved."));
      return "failed";
    }
  }, [editedBody, endPreview, saveTheme, showTheme, reloadListSoon]);

  const deleteTheme = useCallback(async () => {
    if (isNew || shownId <= 0 || !loaded) return;
    const ok = await confirm({
      title: "Delete theme",
      message: `Delete ${loaded.thmName}?`,
      note: "It can be restored later (Show deleted → Restore).",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const id = shownId;
    try {
      await deleteThemeMutation(id).unwrap();
      markDeleted(id, true);
      forceSeedRef.current = true;
      reloadListSoon();
    } catch (error) {
      toast.error(apiErrorText(error, "The theme could not be deleted."));
    }
  }, [isNew, shownId, loaded, deleteThemeMutation, markDeleted, reloadListSoon]);

  const restoreTheme = useCallback(async () => {
    if (isNew || shownId <= 0) return;
    const id = shownId;
    try {
      await restoreThemeMutation(id).unwrap();
      markDeleted(id, false);
      forceSeedRef.current = true;
      reloadListSoon();
    } catch (error) {
      toast.error(apiErrorText(error, "The theme could not be restored."));
    }
  }, [isNew, shownId, restoreThemeMutation, markDeleted, reloadListSoon]);

  const setDefault = useCallback(async () => {
    if (isNew || shownId <= 0 || !loaded || loaded.thmIsDefault) return;
    if (dirty) {
      toast.warn(
        `Save or Revert the changes to ${loaded.thmName} first — Set default saves the theme as it is stored.`,
      );
      return;
    }
    const ok = await confirm({
      title: "Set default",
      message: `Make ${loaded.thmName} the default theme?`,
      note: "Every company without its own theme takes it, and the present default loses the ★.",
      confirmLabel: "Set default",
      iconVariant: "replace",
    });
    if (!ok) return;
    try {
      const saved = await saveTheme({ ...editedBody(), thmIsDefault: true, thmIsActive: true }).unwrap();
      seededKeyRef.current = seedKey(saved);
      showTheme(saved, false);
      reloadListSoon();
    } catch (error) {
      toast.error(apiErrorText(error, "The default could not be changed."));
    }
  }, [isNew, shownId, loaded, dirty, saveTheme, editedBody, showTheme, reloadListSoon]);

  const revert = useCallback(() => {
    endPreview();
    if (isNew) {
      // Back to the theme that was shown before New.
      seededKeyRef.current = null;
      setIsNew(false);
      if (shownId <= 0) setLoaded(null);
    } else if (loaded) {
      showTheme(loaded, false);
    }
  }, [endPreview, isNew, shownId, loaded, showTheme]);

  // ── Words ────────────────────────────────────────────────────────────────
  const name = form.name.trim();
  let changedStrip: string | null = null;
  if (isNew) {
    changedStrip =
      "A new theme, starting from the shown theme's colours — name it and Save. " +
      `${changedCount} colour${changedCount === 1 ? "" : "s"} changed so far.`;
  } else if (dirty) {
    const count = `${changedCount} colour${changedCount === 1 ? "" : "s"} changed — not saved.`;
    changedStrip =
      usedBy > 0
        ? `${count} Save writes ${name} for the ${usedBy} compan${usedBy === 1 ? "y" : "ies"} that use it.`
        : `${count} No company uses ${name} yet.`;
  }

  // Why Delete is off, in words (the server would refuse with 409).
  let listNote = "";
  if (!isNew && loaded) {
    const companies = `${usedBy} compan${usedBy === 1 ? "y" : "ies"}`;
    if (isDeleted) listNote = `${name} is deleted — Restore brings it back.`;
    else if (isDefault)
      listNote =
        `Delete is off: ${name} is the default${usedBy > 0 ? ` and is used by ${companies}` : ""}. ` +
        "Make another theme the default first.";
    else if (usedBy > 0) listNote = `Delete is off: ${name} is used by ${companies}.`;
  }

  return {
    // list
    rows,
    visibleRows,
    listLoading: listQuery.isLoading,
    listError: listQuery.isError ? apiErrorText(listQuery.error, "The theme list could not be read.") : null,
    refetchList,
    search,
    setSearch,
    showDeleted,
    setShowDeleted,
    selectTheme,
    // the theme
    shownId,
    isNew,
    loaded,
    ready,
    themeLoading: !isNew && shownId > 0 && !ready,
    form,
    updateForm,
    tokens,
    loadedTokens,
    setToken,
    resetToken,
    changedCount,
    dirty,
    hasUnsavedChanges,
    isDeleted,
    isDefault,
    usedBy,
    canWrite,
    changedStrip,
    listNote,
    busy,
    isSaving: saveState.isLoading,
    // verbs
    startNew,
    save,
    deleteTheme,
    restoreTheme,
    setDefault,
    revert,
    confirmDiscard,
  };
}

export type ThemesTab = ReturnType<typeof useThemesTab>;
