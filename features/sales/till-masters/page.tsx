"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/components/design-system/cx";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages } from "@/lib/notify";
import { useGetTillDenominationsQuery } from "@/store/api/tillApi";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext } from "@/store/slices/authSlice";
import { CountersTab } from "./components/counters-tab";
import { DenominationsTab } from "./components/denominations-tab";
import { ReasonsTab } from "./components/reasons-tab";
import { SafesTab } from "./components/safes-tab";
import {
  FIRST_REASON_CATEGORY,
  TILL_TABS,
  TILL_TAB_LABELS,
  subtitleOf,
  tabReadOnly,
  type TillTab,
} from "./domain/till-masters";
import { useTillTab } from "./use-till-tab";
import styles from "./page.module.scss";

/** The server caches a list for about a second; the preview re-reads after it. */
const PREVIEW_RELOAD_DELAY_MS = 1500;

/** A dialog or message is up: the screen's keys belong to it, not to us. */
function overlayOpen(): boolean {
  return (
    getConfirmations().length > 0 || getMessages().length > 0 || document.querySelector('[aria-modal="true"]') !== null
  );
}

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const TAB_NOUNS: Record<TillTab, string> = {
  counters: "the counter",
  safes: "the safe",
  reasons: "the reason",
  denominations: "the denomination",
};

/**
 * Till Masters (menu 275, Sales › Till) — counters, safes, reasons and
 * denominations on one screen, four tabs. Ported from the Qt
 * `TillMastersEntry` (NexERP 09274cd, 2026-10-08; mockups
 * share/till/till_*_master_ui_mockup.png).
 *
 * Deactivate / Reactivate are saves of the Active flag (the EDIT right): a
 * master with history is never deleted from here. Save is CREATE on a new row
 * and EDIT on a saved one — the server checks the same rights on menu 275.
 */
export default function TillMastersScreen() {
  const router = useRouter();
  const { permissions } = usePagePermissions();
  const business = useAppSelector(selectBusinessContext);
  const companyId = business?.companyId ?? "";
  const branchId = business?.branchId ?? "";
  const companyName = business?.companyName ?? "";
  const [today] = useState(todayIso);

  const [tab, setTab] = useState<TillTab>("counters");
  const [reasonCategory, setReasonCategory] = useState(FIRST_REASON_CATEGORY);

  const preview = useGetTillDenominationsQuery(companyId, { skip: !companyId });
  const previewTimer = useRef<number | null>(null);
  const { refetch: refetchPreview } = preview;
  useEffect(
    () => () => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    },
    [],
  );

  const counters = useTillTab("counters", { companyId, branchId, today });
  const { reloadSoon: reloadCountersSoon } = counters;
  const onSaved = useCallback(
    (saved: TillTab) => {
      // A counter's list shows its safe's name.
      if (saved === "safes") reloadCountersSoon();
      if (saved === "denominations" && companyId) {
        if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null;
          void refetchPreview();
        }, PREVIEW_RELOAD_DELAY_MS);
      }
    },
    [companyId, refetchPreview, reloadCountersSoon],
  );
  const safes = useTillTab("safes", { companyId, branchId, today, onSaved });
  const reasons = useTillTab("reasons", { companyId, branchId, today, category: reasonCategory, onSaved });
  const denominations = useTillTab("denominations", { companyId, branchId, today, onSaved });

  const tabs = { counters, safes, reasons, denominations };
  const current = tabs[tab];
  const readOnly = tabReadOnly(tab, current.shown);
  const canWrite = current.isNew ? permissions.canCreate : permissions.canEdit;
  const canSave = canWrite && !readOnly && current.dirty && !current.saving;
  const canRevert = !current.isNew && current.dirty && !current.saving;

  const changeCategory = useCallback(
    (next: string) => {
      setReasonCategory(next);
      reasons.followCategory(next);
    },
    [reasons],
  );

  const dirtyNouns = TILL_TABS.filter((key) => tabs[key].dirty).map((key) => TAB_NOUNS[key]).join(", ");
  const close = useCallback(async () => {
    if (
      dirtyNouns &&
      !(await confirm({
        title: "Close",
        message: `Unsaved changes to ${dirtyNouns}. Close and drop them?`,
        confirmLabel: "Close",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    router.back();
  }, [dirtyNouns, router]);

  // ── Keys: F5 save · F2 new · Esc close ──────────────────────────────────
  const keysRef = useRef({ canSave, current, close });
  useLayoutEffect(() => {
    keysRef.current = { canSave, current, close };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const keys = keysRef.current;
      if (event.key === "F5") {
        // Never the browser's reload: it would drop the edit on screen.
        event.preventDefault();
        if (keys.canSave) void keys.current.save();
      } else if (event.key === "F2") {
        event.preventDefault();
        if (permissions.canCreate) void keys.current.startNew();
      } else if (event.key === "Escape") {
        // A dropdown's open list takes Escape first (and prevents it).
        event.preventDefault();
        void keys.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [permissions.canCreate]);

  // A reload or a closed tab with edits on screen asks first.
  useEffect(() => {
    if (!dirtyNouns) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyNouns]);

  let keysHint = current.stamp || "Save F5 · New F2 · Esc close";
  if (!permissions.canCreate && !permissions.canEdit) keysHint += " · view only — no create or edit right on Till Masters";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Till Masters</h1>
        <p className={styles.subtitle}>{subtitleOf(tab, current.rows, companyName)}</p>
      </header>

      <div className={styles.tabs} role="tablist">
        {TILL_TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={cx(styles.tab, tab === key && styles.tabActive)}
            onClick={() => setTab(key)}
          >
            {TILL_TAB_LABELS[key]}
            {tabs[key].dirty ? <span className={styles.tabDot} title="Unsaved changes" /> : null}
          </button>
        ))}
      </div>

      {!branchId && (tab === "counters" || tab === "safes") ? (
        <p className={styles.warning}>Counters and safes belong to a branch — choose one in the header first.</p>
      ) : null}

      <CountersTab
        t={counters}
        companyId={companyId}
        branchId={branchId}
        canCreate={permissions.canCreate}
        canEdit={permissions.canEdit}
        hidden={tab !== "counters"}
      />
      <SafesTab
        t={safes}
        companyId={companyId}
        canCreate={permissions.canCreate}
        canEdit={permissions.canEdit}
        hidden={tab !== "safes"}
      />
      <ReasonsTab
        t={reasons}
        companyId={companyId}
        category={reasonCategory}
        onCategoryChange={changeCategory}
        canCreate={permissions.canCreate}
        canEdit={permissions.canEdit}
        hidden={tab !== "reasons"}
      />
      <DenominationsTab
        t={denominations}
        preview={preview.data ?? []}
        previewLoading={preview.isFetching}
        canCreate={permissions.canCreate}
        canEdit={permissions.canEdit}
        hidden={tab !== "denominations"}
      />

      <footer className={styles.footer}>
        <span className={styles.footerHint}>{keysHint}</span>
        <button type="button" className={styles.secondaryButton} disabled={!canRevert} onClick={current.revert}>
          Revert
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!canSave}
          title="F5"
          onClick={() => void current.save()}
        >
          {current.saving ? "Saving…" : "Save"}
          <span className={styles.keyHint}>F5</span>
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => void close()}>
          Close<span className={styles.keyHint}>Esc</span>
        </button>
      </footer>
    </div>
  );
}
