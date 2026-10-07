"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDebounce } from "@/hooks/useDebounce";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import type { MenuPermissions } from "@/lib/permissions/menu-permissions";
import {
  useGetAppThemeQuery,
  useGetAppThemeTemplateQuery,
  useSaveAppThemeTemplateMutation,
} from "@/store/api/appThemeApi";
import { apiErrorStatus, apiErrorText } from "./lib/api-error";
import { countPlaceholders, templateFigures, validateTemplate, type TemplateProblem } from "./lib/template";
import type { ThemeListRow } from "./lib/theme-list";
import { SIZE_PLACEHOLDERS, resolveTokens } from "./lib/token-catalogue";

/** The placeholder counts and header figures follow the edit after this pause. */
const RECOUNT_DEBOUNCE_MS = 400;

type Options = {
  permissions: MenuPermissions;
  /** Live themes, for "Fill with theme". */
  rows: readonly ThemeListRow[];
  effectiveId: number | null;
};

/**
 * The Template tab — the one set of QSS RULES every company's palette is
 * filled into (app_theme_template). It styles the desktop client; this browser
 * paints from the colours alone, so the tab edits the rules but cannot preview
 * them.
 *
 * Validate runs the server's three checks first and Save stays off while one
 * fails. Save posts tplModifiedOn as loaded; another user's save in between is
 * a 409 → Reload.
 */
export function useTemplateTab({ permissions, rows, effectiveId }: Options) {
  const templateQuery = useGetAppThemeTemplateQuery();
  const template = templateQuery.currentData ?? null;
  const [text, setText] = useState("");
  /** null: Validate has not spoken for the text on screen. */
  const [problems, setProblems] = useState<TemplateProblem[] | null>(null);
  const seededRef = useRef<string | null>(null);
  const forceSeedRef = useRef(false);

  const dirty = template !== null && text !== template.tplQss;

  // Show the template as loaded — never over unsaved edits (the freshness
  // bus refetches on focus); a 409's Reload forces it.
  useEffect(() => {
    if (!template) return;
    const key = `${template.tplId}:${template.tplModifiedOn}`;
    if (key === seededRef.current) return;
    if (dirty && seededRef.current !== null && !forceSeedRef.current) return;
    seededRef.current = key;
    forceSeedRef.current = false;
    setText(template.tplQss ?? "");
    setProblems(null);
  }, [template, dirty]);

  const editText = useCallback((next: string) => {
    setText(next);
    setProblems(null);
  }, []);

  const countedText = useDebounce(text, RECOUNT_DEBOUNCE_MS);
  const counts = useMemo(() => countPlaceholders(countedText), [countedText]);
  const figures = useMemo(() => templateFigures(countedText), [countedText]);

  // ── Fill with theme ──────────────────────────────────────────────────────
  const liveRows = useMemo(() => rows.filter((row) => !row.isDeleted), [rows]);
  // The chosen theme while it is live; else the company's, else the first.
  const [pickedFillId, setFillId] = useState(0);
  const isLive = (thmId: number | null) => Boolean(thmId) && liveRows.some((row) => row.thmId === thmId);
  const fillId = isLive(pickedFillId)
    ? pickedFillId
    : isLive(effectiveId)
      ? (effectiveId as number)
      : (liveRows[0]?.thmId ?? 0);
  const fillQuery = useGetAppThemeQuery(fillId, { skip: fillId <= 0 });
  const fillName = liveRows.find((row) => row.thmId === fillId)?.name ?? "";
  const fillValues = useMemo<Record<string, string>>(
    () => (fillQuery.currentData ? { ...resolveTokens(fillQuery.currentData.tokens), ...SIZE_PLACEHOLDERS } : {}),
    [fillQuery.currentData],
  );

  // ── Verbs ────────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    const found = validateTemplate(text);
    setProblems(found);
    return found;
  }, [text]);

  const [saveTemplate, saveState] = useSaveAppThemeTemplateMutation();
  const { refetch } = templateQuery;

  // Applied here, not left to the seeding effect: an answer equal to the one
  // held keeps its object identity (RTK's structural sharing), so the effect
  // would never re-run and the dropped edits would stay on screen.
  const reload = useCallback(async () => {
    forceSeedRef.current = true;
    try {
      const fresh = await refetch().unwrap();
      seededRef.current = `${fresh.tplId}:${fresh.tplModifiedOn}`;
      forceSeedRef.current = false;
      setText(fresh.tplQss ?? "");
      setProblems(null);
    } catch {
      // The read failed: loadError says so, with its own Try again.
    }
  }, [refetch]);

  const save = useCallback(async () => {
    if (!template) return;
    if (validate().length > 0) return;
    const ok = await confirm({
      title: "Save template",
      message: "Save the template? It replaces the stylesheet of EVERY company.",
      note: "Each one gets it at its next start or company switch.",
      confirmLabel: "Save",
      iconVariant: "replace",
    });
    if (!ok) return;
    try {
      const saved = await saveTemplate({
        tplId: template.tplId,
        tplQss: text,
        tplRemarks: template.tplRemarks,
        tplModifiedOn: template.tplModifiedOn,
      }).unwrap();
      seededRef.current = `${saved.tplId}:${saved.tplModifiedOn}`;
      setText(saved.tplQss);
      setProblems(null);
      toast.success("Template saved.");
    } catch (error) {
      if (apiErrorStatus(error) === 409) {
        const reloadIt = await confirm({
          title: "Template changed",
          message: "Another user saved the template after you opened it. Reload it?",
          note: "Your edits here are dropped — copy them first if you need them.",
          confirmLabel: "Reload",
          iconVariant: "replace",
        });
        if (reloadIt) await reload();
        return;
      }
      toast.error(apiErrorText(error, "The template could not be saved."));
    }
  }, [template, validate, saveTemplate, text, reload]);

  const revert = useCallback(async () => {
    if (!template) return;
    if (dirty) {
      const ok = await confirm({
        title: "Revert",
        message: "Drop your edits to the template and go back to the saved one?",
        confirmLabel: "Revert",
        iconVariant: "replace",
      });
      if (!ok) return;
    }
    setText(template.tplQss);
    setProblems(null);
  }, [template, dirty]);

  const failing = problems !== null && problems.length > 0;

  return {
    template,
    loading: templateQuery.isLoading,
    loadError: templateQuery.isError ? apiErrorText(templateQuery.error, "The template could not be read.") : null,
    text,
    editText,
    dirty,
    problems,
    failing,
    counts,
    figures,
    liveRows,
    fillId,
    setFillId,
    fillName,
    fillValues,
    readOnly: !permissions.canEdit,
    canSave: permissions.canEdit && dirty && !failing && !saveState.isLoading,
    isSaving: saveState.isLoading,
    validate,
    save,
    revert,
    reload,
  };
}

export type TemplateTab = ReturnType<typeof useTemplateTab>;
