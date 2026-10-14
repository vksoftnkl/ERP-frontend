"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages } from "@/lib/notify";
import { useTillApprovalClient } from "./api/till-approval-api";
import { RulesTab } from "./components/rules-tab";
import { KEYS_HINT, rulesSubtitle } from "./domain/approval-setup";
import { useApprovalRows } from "./use-approval-rows";
import { useRulesTab } from "./use-rules-tab";
import styles from "./page.module.scss";

/** The route; menu 276 "Till Approval Rules" under 271 "Till" (was "Till Approval Setup"). */
export const TILL_APPROVAL_RULES_HREF = "/sales/till/approval-rules";

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
 * Till Approval Rules (menu 276, Sales › Till) — ported from the Qt
 * `TillApprovalSetupEntry` (NexERP d5c3637, 2026-10-09; mockup
 * share/till/till_approval_rules_ui_mockup.png).
 *
 * WHEN an exception needs a second person. Qt a449b8c split the old two-tab
 * Till Approval Setup: the grants (WHO may approve) are now Till Approval
 * Authority, menu 285 (`features/sales/till/approval-authority`), and this
 * screen keeps the rules — it still reads the grants, for the rule form's
 * "can anybody approve this?" warning only. Save (F5) needs CREATE for a new
 * row and EDIT for a saved one; Remove row needs DELETE. The server checks the
 * same rights on 276.
 */
export default function TillApprovalRulesScreen() {
  const { selectedCompanyId, selectedBranchId, activeCompany } = useBusinessContext();
  const companyId = selectedCompanyId ?? "";
  // A company change is a fresh screen: nothing selected or typed survives it.
  return (
    <ApprovalRules
      key={companyId}
      companyId={companyId}
      companyName={activeCompany?.name ?? ""}
      loginBranch={selectedBranchId ?? ""}
    />
  );
}

function ApprovalRules({
  companyId,
  companyName,
  loginBranch,
}: {
  companyId: string;
  companyName: string;
  /** The header's branch: the company layer's grant warning is probed at it. */
  loginBranch: string;
}) {
  const router = useRouter();
  const { permissions } = usePagePermissions({ href: TILL_APPROVAL_RULES_HREF });
  const [today] = useState(todayIso);
  const [stamp, setStamp] = useState("");

  const client = useTillApprovalClient();
  const rows = useApprovalRows(client, companyId);
  const rules = useRulesTab({ client, rows, companyId, loginBranch, today, stamp: setStamp });

  // The first read (Qt `reloadAll`): the rules on CASH_VARIANCE, and the grants for the warning.
  const { reload: reloadRules } = rules;
  const { loadGrants } = rows;
  useEffect(() => {
    if (!companyId) return;
    void reloadRules();
    void loadGrants();
  }, [companyId, reloadRules, loadGrants]);

  const mayWrite = rules.isNew ? permissions.canCreate : permissions.canEdit;
  const { saving, problem, dirty, save, revert } = rules;
  const canSave = !saving && mayWrite && !problem && Boolean(companyId);
  const canRevert = !saving && dirty;

  const close = useCallback(async () => {
    if (
      dirty &&
      !(await confirm({
        title: "Close",
        message: "Unsaved changes to the rule. Close and drop them?",
        confirmLabel: "Close",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    router.back();
  }, [dirty, router]);

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
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  let hint = stamp || KEYS_HINT;
  if (!permissions.canCreate && !permissions.canEdit) {
    hint += " · view only — no create or edit right on Till Approval Rules";
  }
  const saveTitle = problem && problem !== "Nothing changed." ? problem : "F5";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Till Approval Rules</h1>
        <p className={styles.subtitle}>{rows.rulesState === "ready" ? rulesSubtitle(rows.rules.length) : ""}</p>
      </header>

      {!companyId ? <p className={styles.warningBar}>Choose a company in the header first.</p> : null}

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
