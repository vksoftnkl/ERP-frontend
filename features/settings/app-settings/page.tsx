"use client";

import ModuleTree from "./components/module-tree";
import ScopeBar from "./components/scope-bar";
import SettingGroup from "./components/setting-group";
import { useAppSettings } from "./use-app-settings";
import styles from "./page.module.scss";

/**
 * Application Settings — a two-pane editor over the setting CATALOG.
 *
 * There is no list of settings in this file and there must never be one. Every
 * row — its label, its control, its permitted values, how deep it may be
 * overridden — comes from `app_setting_def` through `/app-setting-values/effective`.
 * Adding a setting is one INSERT and a one-line binding; it is not a front-end
 * change, and a `SETTINGS = [...]` array anywhere here would mean this screen
 * had failed.
 */
export default function AppSettingsScreen() {
  const settings = useAppSettings();
  const busy = settings.isSaving || settings.isResetting || settings.isFetching;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Application Settings</h1>
          <p className={styles.subtitle}>
            Every setting comes from the catalog. Choose the layer to edit above; a value not set
            here falls back to the layer over it.
          </p>
        </div>
        <div className={styles.headerActions}>
          {settings.dirtyCount > 0 ? (
            <span className={styles.dirtyCount}>
              {settings.dirtyCount} unsaved change{settings.dirtyCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={settings.dirtyCount === 0 || busy}
            onClick={settings.discardDrafts}
          >
            Discard
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={settings.dirtyCount === 0 || settings.isSaving}
            onClick={() => void settings.save()}
          >
            {settings.isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <ScopeBar
        target={settings.target}
        scope={settings.scope}
        search={settings.search}
        changedOnly={settings.changedOnly}
        onTargetChange={settings.setTarget}
        onSearchChange={settings.setSearch}
        onChangedOnlyChange={settings.setChangedOnly}
      />

      {!settings.isSessionScope && settings.dirtyCount > 0 ? (
        <p className={styles.foreignScopeNote}>
          This is not the company, branch or counter you are signed in to — the values will be
          saved, but they will not take hold in this session.
        </p>
      ) : null}

      {settings.readError ? (
        <div className={styles.errorPanel}>
          <span>{settings.readError}</span>
          <button type="button" className={styles.secondaryButton} onClick={() => void settings.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <ModuleTree
            tree={settings.tree}
            activeKey={settings.activeGroupKey}
            onSelect={settings.selectGroup}
          />
        </aside>

        <main className={styles.content}>
          {settings.isLoading ? (
            <p className={styles.contentEmpty}>Loading the catalog…</p>
          ) : settings.groupView ? (
            <SettingGroup
              view={settings.groupView}
              scope={settings.scope}
              busy={busy}
              onChange={(row, value) => settings.setDraft(row.asdKey, value)}
              onReset={(row) => void settings.reset(row)}
            />
          ) : (
            <p className={styles.contentEmpty}>
              {settings.rows.length === 0
                ? "The catalog is empty for this scope."
                : "No settings match the search."}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
