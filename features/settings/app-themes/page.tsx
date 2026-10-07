"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getConfirmations } from "@/lib/confirm";
import { getMessages } from "@/lib/notify";
import { useGetEffectiveAppThemeQuery } from "@/store/api/appThemeApi";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext, selectIsAuthenticated } from "@/store/slices/authSlice";
import PlaceholderTable from "./components/placeholder-table";
import PreviewCard from "./components/preview-card";
import TemplateEditor, { type TemplateEditorHandle } from "./components/template-editor";
import ThemeList from "./components/theme-list";
import TokenGrid from "./components/token-grid";
import { VALIDATION_LIST_LIMIT, formatSavedOn } from "./lib/template";
import { THEME_BASES, TOKEN_CATALOGUE } from "./lib/token-catalogue";
import { useTemplateTab } from "./use-template-tab";
import { useThemePreview } from "./use-theme-preview";
import { useThemesTab } from "./use-themes-tab";
import styles from "./page.module.scss";

type Tab = "themes" | "template";

/** A dialog or message is up: the screen's keys belong to it, not to us. */
function overlayOpen(): boolean {
  return getConfirmations().length > 0 || getMessages().length > 0;
}

/**
 * App Themes (menu 266) — the theme master, ported from the Qt
 * `AppThemeEntry` (src/modules/admin/theme).
 *
 * Two tabs, one screen, both writing to the theme master only:
 *
 *  Themes    a theme is a PALETTE — 38 colour keys. Pick one on the left,
 *            edit it in the middle, watch the card on the right paint it.
 *  Template  the one set of QSS rules every company's palette is filled
 *            into. It styles the desktop client; this browser paints from the
 *            colours alone (lib/app-theme.ts), so the tab edits but cannot
 *            preview it.
 *
 * Preview (F9) puts the edited colours on the whole app without saving;
 * Revert, a save or leaving the screen puts the company's own look back.
 */
export default function AppThemesScreen() {
  const { permissions } = usePagePermissions();
  const business = useAppSelector(selectBusinessContext);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const companyId = business?.companyId ?? null;

  const effectiveQuery = useGetEffectiveAppThemeQuery(companyId ?? "", {
    skip: !isAuthenticated || !companyId,
  });
  const effective = effectiveQuery.currentData ?? null;
  const effectiveSettled = !companyId || !effectiveQuery.isLoading;

  const { previewing, preview, endPreview } = useThemePreview(companyId, effective);
  const themes = useThemesTab({
    permissions,
    effectiveId: effective?.thmId ?? null,
    effectiveSettled,
    endPreview,
  });
  const tpl = useTemplateTab({ permissions, rows: themes.rows, effectiveId: effective?.thmId ?? null });

  const [tab, setTab] = useState<Tab>("themes");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<TemplateEditorHandle | null>(null);
  const findRef = useRef<HTMLInputElement | null>(null);
  const [findText, setFindText] = useState("");
  const [cursorNote, setCursorNote] = useState("");

  // A live preview follows the edit.
  useEffect(() => {
    if (previewing && tab === "themes") preview(themes.tokens);
  }, [previewing, tab, themes.tokens, preview]);

  // New: the name is the first thing to type.
  useEffect(() => {
    if (themes.isNew) nameRef.current?.focus();
  }, [themes.isNew]);

  // ── Verbs (both tabs) ────────────────────────────────────────────────────
  const onTemplate = tab === "template";
  const canSave = onTemplate ? tpl.canSave : themes.canWrite && themes.dirty && !themes.busy;
  const canRevert = onTemplate ? tpl.dirty || previewing : themes.dirty || previewing;
  const canPreview = !onTemplate && themes.ready;

  const runSave = useCallback(async () => {
    if (onTemplate) {
      endPreview();
      await tpl.save();
      return;
    }
    if ((await themes.save()) === "no-name") nameRef.current?.focus();
  }, [onTemplate, endPreview, tpl, themes]);

  const runPreview = useCallback(() => {
    if (!onTemplate && themes.ready) preview(themes.tokens);
  }, [onTemplate, themes.ready, themes.tokens, preview]);

  const runRevert = useCallback(() => {
    if (onTemplate) {
      endPreview();
      void tpl.revert();
    } else {
      themes.revert();
    }
  }, [onTemplate, endPreview, tpl, themes]);

  const runFind = useCallback(() => {
    if (!findText) return;
    // A hit reports its own line and column through onCursorChange.
    if (!editorRef.current?.findNext(findText)) setCursorNote("not found");
  }, [findText]);

  // ── Keys ─────────────────────────────────────────────────────────────────
  const keysRef = useRef({ onTemplate, canSave, canPreview, runSave, runPreview, themes, tpl });
  useLayoutEffect(() => {
    keysRef.current = { onTemplate, canSave, canPreview, runSave, runPreview, themes, tpl };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      const k = keysRef.current;
      const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      if (event.key === "F5" && plain) {
        // Never the browser's reload: it would drop the edit on screen.
        event.preventDefault();
        if (k.canSave) void k.runSave();
      } else if (event.key === "F9" && plain) {
        event.preventDefault();
        if (k.canPreview) k.runPreview();
      } else if (event.key === "F2" && plain && !k.onTemplate) {
        event.preventDefault();
        void k.themes.startNew();
      } else if (event.key === "F6" && plain && k.onTemplate) {
        event.preventDefault();
        k.tpl.validate();
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f" && k.onTemplate) {
        event.preventDefault();
        findRef.current?.focus();
        findRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A reload or a closed tab with edits on screen asks first.
  const unsaved = themes.hasUnsavedChanges || tpl.dirty;
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  // ── Words ────────────────────────────────────────────────────────────────
  const subtitle: string[] = [];
  if (business?.companyName) subtitle.push(business.companyName);
  if (effective) {
    subtitle.push(
      `this company uses ${effective.thmName} (${effective.resolvedFrom === "COMPANY" ? "its own" : "the default"})`,
    );
  }
  const defaultRow = themes.rows.find((row) => row.isDefault && !row.isDeleted);
  if (defaultRow) subtitle.push(`default theme ${defaultRow.name}`);
  if (themes.rows.length > 0) {
    const deleted = themes.rows.filter((row) => row.isDeleted).length;
    subtitle.push(`${themes.rows.length - deleted} themes, ${deleted} deleted`);
  }

  let keysHint = onTemplate
    ? "Save F5 · Validate F6 · Ctrl+F find · Save stays off while Validate has a problem"
    : "Save F5 · Preview F9 · New F2 · Delete on a colour row puts the built-in value back · click a swatch to pick";
  if (!permissions.canEdit && !permissions.canCreate) keysHint += " · view only — no edit right on App Themes";

  const tplMeta: string[] = [];
  if (tpl.template) {
    const remarks = tpl.template.tplRemarks ?? "";
    if (remarks) tplMeta.push(remarks.split(":")[0]);
    tplMeta.push(
      `${tpl.figures.kilobytes.toLocaleString()} KB`,
      `${tpl.figures.rules.toLocaleString()} rules`,
      `${tpl.figures.placeholders} placeholder${tpl.figures.placeholders === 1 ? "" : "s"}`,
      `saved ${formatSavedOn(tpl.template.tplModifiedOn)}`,
    );
  }

  const shownName = themes.isNew ? "NEW THEME" : themes.form.name.trim().toUpperCase();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>App Themes</h1>
          <p className={styles.subtitle}>{subtitle.join(" · ") || " "}</p>
        </div>
        <div className={styles.headerActions}>
          {previewing ? <span className={styles.previewingBadge}>Previewing — not saved</span> : null}
          {onTemplate ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!tpl.template}
              onClick={() => tpl.validate()}
              title="F6 — the server's checks, run here first"
            >
              Validate<span className={styles.keyHint}>F6</span>
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canPreview}
            onClick={runPreview}
            title={
              onTemplate
                ? "The template styles the desktop app; this browser paints from the colours alone, so there is nothing to preview here."
                : "F9 — the edited colours on the whole app, nothing saved"
            }
          >
            Preview<span className={styles.keyHint}>F9</span>
          </button>
          <button type="button" className={styles.secondaryButton} disabled={!canRevert} onClick={runRevert}>
            Revert
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canSave}
            onClick={() => void runSave()}
          >
            {themes.isSaving || tpl.isSaving ? "Saving…" : "Save"}
            <span className={styles.keyHint}>F5</span>
          </button>
        </div>
      </header>

      <div className={styles.tabs} role="tablist">
        {(
          [
            ["themes", "Themes"],
            ["template", "Template"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab(key)}
          >
            {label}
            {(key === "themes" ? themes.hasUnsavedChanges : tpl.dirty) ? <span className={styles.tabDot} /> : null}
          </button>
        ))}
      </div>

      {tab === "themes" ? (
        <div className={styles.themesBody}>
          <ThemeList
            rows={themes.visibleRows}
            selectedId={themes.isNew ? null : themes.shownId || null}
            loading={themes.listLoading}
            error={themes.listError}
            search={themes.search}
            onSearchChange={themes.setSearch}
            showDeleted={themes.showDeleted}
            onShowDeletedChange={themes.setShowDeleted}
            onSelect={(id) => void themes.selectTheme(id)}
            onRetry={() => void themes.refetchList()}
            canNew={permissions.canCreate}
            canDelete={
              permissions.canDelete &&
              !themes.isNew &&
              themes.ready &&
              themes.shownId > 0 &&
              !themes.isDeleted &&
              !themes.isDefault &&
              themes.usedBy === 0 &&
              !themes.busy
            }
            canRestore={permissions.canEdit && themes.isDeleted && !themes.busy}
            showRestore={themes.showDeleted || themes.isDeleted}
            canSetDefault={
              permissions.canEdit &&
              !themes.isNew &&
              themes.ready &&
              themes.shownId > 0 &&
              !themes.isDeleted &&
              !themes.isDefault &&
              !themes.busy
            }
            onNew={() => void themes.startNew()}
            onDelete={() => void themes.deleteTheme()}
            onRestore={() => void themes.restoreTheme()}
            onSetDefault={() => void themes.setDefault()}
            note={themes.listNote}
          />

          <section className={styles.editorPane} aria-label="Theme">
            <div className={styles.paneHead}>
              <span className={styles.sectionCap}>{themes.themeLoading ? "Loading…" : shownName || " "}</span>
              {themes.isDefault ? <span className={`${styles.pill} ${styles.pillPrimary}`}>DEFAULT</span> : null}
              {!themes.isNew && themes.loaded ? <span className={styles.pill}>USED BY {themes.usedBy}</span> : null}
            </div>

            <div className={styles.fields}>
              <label className={styles.fieldCap} htmlFor="app-theme-name">
                Name
              </label>
              <input
                id="app-theme-name"
                ref={nameRef}
                className={styles.textInput}
                maxLength={100}
                value={themes.form.name}
                disabled={!themes.canWrite}
                onChange={(event) => themes.updateForm({ name: event.target.value })}
              />
              <label className={styles.fieldCap} htmlFor="app-theme-base">
                Base
              </label>
              <select
                id="app-theme-base"
                className={styles.selectInput}
                value={themes.form.base}
                disabled={!themes.canWrite}
                onChange={(event) => themes.updateForm({ base: event.target.value })}
              >
                {THEME_BASES.map((base) => (
                  <option
                    key={base}
                    value={base}
                    title={base === "DARK" ? "DARK is reserved — the template has no dark rules yet." : undefined}
                  >
                    {base}
                  </option>
                ))}
              </select>
              <label
                className={styles.checkLine}
                title={themes.isDefault ? "The default theme is always active." : undefined}
              >
                <input
                  type="checkbox"
                  checked={themes.form.active}
                  // The default cannot be made inactive (400) — say so on the box.
                  disabled={!themes.canWrite || themes.isDefault}
                  onChange={(event) => themes.updateForm({ active: event.target.checked })}
                />
                Active
              </label>
              <label className={styles.fieldCap} htmlFor="app-theme-remarks">
                Remarks
              </label>
              <input
                id="app-theme-remarks"
                className={`${styles.textInput} ${styles.fieldWide}`}
                maxLength={250}
                value={themes.form.remarks}
                disabled={!themes.canWrite}
                onChange={(event) => themes.updateForm({ remarks: event.target.value })}
              />
            </div>

            <div className={styles.paneHead}>
              <span className={styles.sectionCap}>Colours</span>
              <span className={styles.mutedNote}>
                {TOKEN_CATALOGUE.length} keys · Delete on a row puts back the app&apos;s built-in value · click a swatch to
                pick
              </span>
            </div>
            <TokenGrid
              tokens={themes.tokens}
              loadedTokens={themes.loadedTokens}
              editable={themes.canWrite}
              onChange={themes.setToken}
              onReset={themes.resetToken}
            />
            {themes.changedStrip ? <p className={styles.warningStrip}>{themes.changedStrip}</p> : null}
          </section>

          <section className={styles.previewPane} aria-label="Preview">
            <span className={styles.sectionCap}>Preview</span>
            <PreviewCard tokens={themes.tokens} />
          </section>
        </div>
      ) : (
        <div className={styles.templateBody}>
          <div className={styles.paneHead}>
            <span className={styles.sectionCap}>Template {tpl.template?.tplName ?? ""}</span>
            <span className={styles.pill}>USED BY EVERY COMPANY</span>
            <span className={styles.mutedNote} title={tpl.template?.tplRemarks ?? undefined}>
              {tplMeta.join(" · ")}
            </span>
            <span className={styles.spacer} />
            <label className={styles.fieldCap} htmlFor="app-theme-fill">
              Fill with theme
            </label>
            <select
              id="app-theme-fill"
              className={styles.selectInput}
              value={tpl.fillId || ""}
              onChange={(event) => tpl.setFillId(Number(event.target.value))}
            >
              {tpl.liveRows.map((row) => (
                <option key={row.thmId} value={row.thmId}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>

          {tpl.loadError ? (
            <div className={styles.errorPanel}>
              <span>{tpl.loadError}</span>
              <button type="button" className={styles.secondaryButton} onClick={() => void tpl.reload()}>
                Try again
              </button>
            </div>
          ) : null}

          <div className={styles.templateColumns}>
            <div className={styles.editorColumn}>
              {tpl.loading ? (
                <p className={styles.tableEmpty}>Loading the template…</p>
              ) : (
                <TemplateEditor
                  ref={editorRef}
                  value={tpl.text}
                  onChange={tpl.editText}
                  readOnly={tpl.readOnly}
                  onCursorChange={({ line, column }) => setCursorNote(`line ${line}, col ${column}`)}
                />
              )}
              <div className={styles.findRow} data-uppercase="off">
                <span className={styles.spacer} />
                <input
                  ref={findRef}
                  type="search"
                  className={styles.findInput}
                  placeholder="Find  Ctrl+F"
                  value={findText}
                  onChange={(event) => setFindText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runFind();
                    }
                  }}
                  aria-label="Find in template"
                />
                <span className={styles.mutedNote}>{cursorNote}</span>
              </div>
              {tpl.problems !== null ? (
                tpl.problems.length === 0 ? (
                  <p className={styles.goodStrip}>Validate: no problems.</p>
                ) : (
                  <div className={styles.dangerStrip}>
                    <strong>
                      Validate: {tpl.problems.length} problem{tpl.problems.length === 1 ? "" : "s"} — nothing is saved
                      until fixed
                    </strong>
                    <ul className={styles.problemList}>
                      {tpl.problems.slice(0, VALIDATION_LIST_LIMIT).map((problem, index) => (
                        <li key={`${problem.line}-${index}`}>
                          {problem.line > 0 ? (
                            <button
                              type="button"
                              className={styles.lineLink}
                              onClick={() => editorRef.current?.goToLine(problem.line)}
                            >
                              line {problem.line}
                            </button>
                          ) : null}
                          {problem.line > 0 ? ": " : ""}
                          {problem.message}
                        </li>
                      ))}
                    </ul>
                    {tpl.problems.length > VALIDATION_LIST_LIMIT ? (
                      <span>… and {tpl.problems.length - VALIDATION_LIST_LIMIT} more</span>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>
            <PlaceholderTable
              counts={tpl.counts}
              values={tpl.fillValues}
              fillName={tpl.fillName}
              readOnly={tpl.readOnly}
              onInsert={(key) => editorRef.current?.insertAtCursor(`{{${key}}}`)}
            />
          </div>

          <p className={styles.warningStrip}>
            Save replaces the stylesheet of EVERY company. Validate runs first (and the server repeats it); a template
            another user saved since you opened it is refused (409) — Reload, re-apply, Save.
          </p>
        </div>
      )}

      <footer className={styles.footer}>{keysHint}</footer>
    </div>
  );
}
