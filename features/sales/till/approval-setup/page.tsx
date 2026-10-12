"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages } from "@/lib/notify";
import { useTillApprovalClient } from "./api/till-approval-api";
import { AuthorityTab } from "./components/authority-tab";
import { RulesTab } from "./components/rules-tab";
import { KEYS_HINT, rulesSubtitle } from "./domain/approval-setup";
import { useApprovalRows } from "./use-approval-rows";
import { useAuthorityTab } from "./use-authority-tab";
import { useRulesTab } from "./use-rules-tab";
import styles from "./page.module.scss";

/** The route; menu 276 "Till Approval Setup" under 271 "Till". */
export const TILL_APPROVAL_SETUP_HREF = "/sales/till/approval-setup";

type Tab = "rules" | "authority";

const TABS: readonly { key: Tab; label: string }[] = [
  { key: "rules", label: "Approval Rules" },
  { key: "authority", label: "Approval Authority" },
];

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

/**
 * Till Approval Setup (menu 276, Sales › Till) — ported from the Qt
 * `TillApprovalSetupEntry` (NexERP d5c3637, 2026-10-09; mockups
 * share/till/till_approval_rules_ui_mockup.png and
 * till_approval_authority_ui_mockup.png).
 *
 * Two tabs: Approval Rules (WHEN an exception needs a second person) and
 * Approval Authority (WHO may approve what, where, up to how much). Save (F5)
 * saves the current tab's form — CREATE for a new row or grant, EDIT for a
 * saved one; Remove row needs DELETE. The server checks the same rights on 276.
 */
export default function TillApprovalSetupScreen() {
  const { selectedCompanyId, selectedBranchId, activeCompany } = useBusinessContext();
  const companyId = selectedCompanyId ?? "";
  // A company change is a fresh screen: nothing selected, typed or added survives it.
  return (
    <ApprovalSetup
      key={companyId}
      companyId={companyId}
      companyName={activeCompany?.name ?? ""}
      loginBranch={selectedBranchId ?? ""}
    />
  );
}

function ApprovalSetup({
  companyId,
  companyName,
  loginBranch,
}: {
  companyId: string;
  companyName: string;
  /** The header's branch: "Who can approve?" opens on it, and the company layer is probed at it. */
  loginBranch: string;
}) {
  const router = useRouter();
  const { permissions } = usePagePermissions({ href: TILL_APPROVAL_SETUP_HREF });
  const [today] = useState(todayIso);
  const [tab, setTab] = useState<Tab>("rules");
  const [stamp, setStamp] = useState("");

  const client = useTillApprovalClient();
  const rows = useApprovalRows(client, companyId);
  const rules = useRulesTab({ client, rows, companyId, loginBranch, today, stamp: setStamp });
  const authority = useAuthorityTab({ client, rows, companyId, loginBranch, today, stamp: setStamp });

  // The first read (Qt `reloadAll`): rules on CASH_VARIANCE, grants on the first approver.
  const { reload: reloadRules } = rules;
  const { reload: reloadAuthority } = authority;
  useEffect(() => {
    if (!companyId) return;
    void reloadRules();
    void reloadAuthority();
  }, [companyId, reloadRules, reloadAuthority]);

  const onRules = tab === "rules";
  const isNew = onRules ? rules.isNew : authority.isNew;
  const mayWrite = isNew ? permissions.canCreate : permissions.canEdit;
  const saving = onRules ? rules.saving : authority.saving;
  const problem = onRules ? rules.problem : authority.problem;
  const canSave = !saving && mayWrite && !problem && Boolean(companyId);
  const canRevert = !saving && (onRules ? rules.dirty : authority.changed);

  const unsaved = [rules.dirty ? "the rule" : "", authority.changed ? "the grant" : ""].filter(Boolean).join(" and ");

  const save = onRules ? rules.save : authority.save;
  const revert = onRules ? rules.revert : authority.revert;

  const close = useCallback(async () => {
    if (
      unsaved &&
      !(await confirm({
        title: "Close",
        message: `Unsaved changes to ${unsaved}. Close and drop them?`,
        confirmLabel: "Close",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    router.back();
  }, [router, unsaved]);

  // ── Keys: F5 save · Esc close ───────────────────────────────────────────
  const keysRef = useRef({ canSave, save, close });
  useLayoutEffect(() => {
    keysRef.current = { canSave, save, close };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const keys = keysRef.current;
      if (event.key === "F5") {
        // Never the browser's reload: it would drop the edit on screen.
        event.preventDefault();
        if (keys.canSave) void keys.save();
      } else if (event.key === "Escape") {
        // An open list (dropdown, select) takes Escape first and prevents it.
        event.preventDefault();
        void keys.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // A reload or a closed browser tab with edits on screen asks first.
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  let hint = stamp || KEYS_HINT;
  if (!permissions.canCreate && !permissions.canEdit) {
    hint += " · view only — no create or edit right on Till Approval Setup";
  }
  const saveTitle = problem && problem !== "Nothing changed." ? problem : "F5";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Till Approval Setup</h1>
        <p className={styles.subtitle}>{rows.rulesState === "ready" ? rulesSubtitle(rows.rules.length) : ""}</p>
      </header>

      {!companyId ? <p className={styles.warningBar}>Choose a company in the header first.</p> : null}

      <div className={styles.tabs} role="tablist">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={cx(styles.tab, tab === key && styles.tabActive)}
            onClick={() => setTab(key)}
          >
            {label}
            {(key === "rules" ? rules.dirty : authority.changed) ? (
              <span className={styles.tabDot} title="Unsaved changes" />
            ) : null}
          </button>
        ))}
      </div>

      <RulesTab
        t={rules}
        companyId={companyId}
        companyName={companyName}
        loading={rows.rulesState === "loading" && rows.rules.length === 0}
        failed={rows.rulesState === "error" && rows.rules.length === 0}
        onRetry={() => void reloadRules()}
        canCreate={permissions.canCreate}
        canEdit={permissions.canEdit}
        canDelete={permissions.canDelete}
        hidden={tab !== "rules"}
      />
      <AuthorityTab
        t={authority}
        companyId={companyId}
        companyName={companyName}
        loginBranch={loginBranch}
        loading={rows.grantsState === "loading" && rows.grants.length === 0}
        failed={rows.grantsState === "error" && rows.grants.length === 0}
        onRetry={() => void reloadAuthority()}
        canCreate={permissions.canCreate}
        canEdit={permissions.canEdit}
        hidden={tab !== "authority"}
      />

      <footer className={styles.footer}>
        <span className={styles.footerHint}>{hint}</span>
        <button type="button" className={styles.secondaryButton} disabled={!canRevert} onClick={revert}>
          Revert
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!canSave}
          title={saveTitle}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
          <span className={styles.keyHint}>F5</span>
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => void close()}>
          Close<span className={styles.keyHint}>Esc</span>
        </button>
      </footer>
    </div>
  );
}
