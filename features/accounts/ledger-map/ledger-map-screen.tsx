"use client";

/**
 * Posting Ledger Map — menu 250 ("Ledger mapping", under Settings →
 * Configuration). The React port of the desktop `accounts/ledger_map` dialog.
 *
 * Every posting engine turns a ROLE into a ledger through
 * `accounts.acc_ledger_map`. A wrong row does not fail — it posts money to the
 * wrong account, silently. A role with no ledger cannot post at all. The
 * screen's job is to make the mapping legible and a wrong one hard to save.
 *
 * THERE IS NO SCOPE ON THIS SCREEN, ON PURPOSE. The shared set only: one ledger
 * per role, the same for every company. The server 400s on a company, a branch
 * or a supply nature, so that nothing comes to depend on a half-built override —
 * no company picker, no branch, no year, unlike every other accounts screen.
 *
 * Layout and wiring only: the rules are in `domain.ts`, the server calls in
 * `state/use-ledger-map.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/notify";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { cx } from "@/components/design-system/cx";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import {
  focusCellAfterRender,
  focusGrid,
} from "@/features/accounts/opening-balance/components/grid-focus";
import { resolveRoleColumns } from "./columns";
import { healthPillText } from "./domain";
import type { PickedLedger } from "./ledger-map.types";
import { useLedgerMap } from "./state/use-ledger-map";
import { RoleGrid, ROLE_GRID_NAME } from "./components/role-grid";
import { RoleLedgerPicker } from "./components/role-ledger-picker";
import styles from "./page.module.scss";

/** Menu 250, "Ledger mapping", a child of Settings → Configuration (menu 60). */
export const LEDGER_MAP_MENU_ID = 250;

const SHORTCUTS_TITLE = [
  "Type / F4 in a Ledger cell — pick a ledger",
  "Enter — next cell",
  "Ctrl+Enter — save",
  "Alt+U — remove the current row's mapping",
  "F5 — reload",
  "Esc — close",
].join(" · ");

/** Everything this screen asks before it acts, with what confirming does. */
type PendingConfirm = {
  title: string;
  message: string;
  note?: string;
  confirmLabel: string;
  iconVariant: "delete" | "replace";
  run: () => void;
};

type PickerState = { role: string; initialSearch: string };

/** No control has focus, and nothing modal is up that the key belongs to. */
function caretIsNowhere(): boolean {
  const active = document.activeElement;
  const nowhere = !active || active === document.body || active === document.documentElement;
  return nowhere && document.querySelector('[aria-modal="true"], [role="dialog"]') === null;
}

export default function LedgerMapScreen() {
  const router = useRouter();
  const { permissions, isLoading: permissionsLoading } = usePagePermissions({
    menuId: LEDGER_MAP_MENU_ID,
  });

  /**
   * "Unloaded" is not "denied": the desktop build once refused a user with every
   * right because its dialog had no menu id yet. While the menu loads the screen
   * is read-only rather than locked, and the server stays the authority.
   *
   * Unmapping is a DELETE, and it is the one action here that can stop a voucher
   * posting — so it takes the delete right, not the edit right.
   */
  const canWrite = !permissionsLoading && (permissions.canCreate || permissions.canEdit);
  const canDelete = !permissionsLoading && permissions.canDelete;

  const map = useLedgerMap();
  const { rows, dirty, health, busy } = map;
  const busyNow = busy !== "idle";
  const editable = canWrite && !busyNow;

  const uiTableId = useUiTableId("ledgerMapRoles");
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveRoleColumns(layout), [layout]);
  const resize = useColumnResize(columns, uiTableId);
  const settings = useGridSettings({
    label: "Posting roles",
    uiTableId,
    columns: resize.columns,
    pendingWidthCount: resize.pendingCount,
    savingWidths: resize.saving,
    onSaveWidths: resize.saveWidths,
    focusNote:
      "Focus is where the caret lands when Enter or an arrow key steps into a row; Enter itself stops at every editable cell.",
  });

  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const pickerRow = useMemo(
    () => (picker ? rows.find((row) => row.role === picker.role) ?? null : null),
    [picker, rows],
  );

  // The first row is current once the roles arrive, so Alt+U has a target and
  // the arrows have somewhere to start from before anything is clicked.
  const effectiveCurrentRole =
    currentRole !== null && rows.some((row) => row.role === currentRole)
      ? currentRole
      : rows[0]?.role ?? null;

  // The caret starts on the first row's Ledger cell, as the desktop screen's
  // did, so typing opens the picker straight away. Once, on the first load, and
  // only if the operator has not already put the caret somewhere else.
  const placedCaret = useRef(false);
  useEffect(() => {
    if (placedCaret.current || map.phase !== "ready" || rows.length === 0) {
      return;
    }
    placedCaret.current = true;
    if (caretIsNowhere()) {
      focusGrid(ROLE_GRID_NAME);
    }
  }, [map.phase, rows.length]);

  // ── Leaving with unsaved work, or mid-save ────────────────────────────────
  useEffect(() => {
    if (!dirty && busy !== "saving") {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, busy]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const requestLeave = useCallback(() => {
    if (busy === "saving") {
      // A save is a string of POSTs, each waiting for the last. Leaving mid-way
      // would leave the map half-written with nobody watching.
      toast.warn("The map is still being saved. Wait for it to finish.");
      return;
    }
    if (!dirty) {
      router.back();
      return;
    }
    setConfirm({
      title: "Close without saving?",
      message: "The map has unsaved changes, and closing discards them.",
      confirmLabel: "Close",
      iconVariant: "replace",
      run: () => router.back(),
    });
  }, [busy, dirty, router]);

  const requestReload = useCallback(() => {
    if (busy === "saving" || busy === "unmapping") {
      return;
    }
    if (!dirty) {
      void map.reload();
      return;
    }
    setConfirm({
      title: "Discard changes?",
      message: "The map has unsaved changes. Reload it from the server anyway?",
      confirmLabel: "Reload",
      iconVariant: "replace",
      run: () => void map.reload(),
    });
  }, [busy, dirty, map]);

  const requestSave = useCallback(() => {
    if (!canWrite) {
      toast.warn(
        permissionsLoading
          ? "Your permissions are still loading — try again in a moment."
          : "You do not have permission to change the posting map.",
      );
      return;
    }
    void map.save();
  }, [canWrite, map, permissionsLoading]);

  /**
   * Alt+U — the one action here that can stop a voucher posting, so it asks
   * first and then lets the SERVER refuse. Its refusal names the documents that
   * post the role, and nothing the client could compose is better: the client
   * does not know which engines are deployed, and `usedBy` is a snapshot.
   */
  const requestUnmap = useCallback(() => {
    if (busyNow) {
      return;
    }
    if (!canDelete) {
      toast.warn("You do not have permission to remove a posting mapping.");
      return;
    }
    const row = rows.find((candidate) => candidate.role === effectiveCurrentRole);
    if (!row) {
      return;
    }
    if (!row.almId) {
      toast.warn(`"${row.label}" has no mapping. Pick a ledger for it instead.`);
      return;
    }
    setConfirm({
      title: `Remove the mapping for "${row.label}"?`,
      message: `"${row.label}" will have no ledger, and anything that posts it will be refused until one is picked.`,
      note:
        row.usedBy.length > 0
          ? "A document posts this role today, so the server will refuse — point it at a different ledger instead."
          : "Nothing posts this role yet, so the server allows it.",
      confirmLabel: "Remove",
      iconVariant: "delete",
      run: () => void map.unmap(row.role),
    });
  }, [busyNow, canDelete, effectiveCurrentRole, map, rows]);

  const openPicker = useCallback(
    (role: string, initialSearch: string) => {
      if (!editable) {
        return;
      }
      setCurrentRole(role);
      setPicker({ role, initialSearch });
    },
    [editable],
  );

  const closePicker = useCallback(() => {
    const role = picker?.role;
    setPicker(null);
    if (role) {
      // Back where the operator was, so the arrows still work.
      focusCellAfterRender(ROLE_GRID_NAME, role, "ledger");
    }
  }, [picker]);

  const onPick = useCallback(
    (ledger: PickedLedger) => {
      const role = picker?.role;
      setPicker(null);
      if (!role) {
        return;
      }
      const changed = map.pickLedger(role, ledger);
      // A real pick steps on to the remark; a refused or no-op one leaves the
      // caret on the ledger it did not change.
      focusCellAfterRender(ROLE_GRID_NAME, role, changed ? "remarks" : "ledger");
    },
    [map, picker],
  );

  /**
   * The screen's keys. The grid owns Enter and the arrows inside a cell; these
   * act on the whole map.
   *
   *   Ctrl+Enter   save — from anywhere, including inside a cell
   *   F5           reload (asks when there are unsaved changes)
   *   Alt+U        remove the current row's mapping
   *   ↑ / ↓        with no cell focused, enter the grid
   *   Esc          close the screen
   *
   * F5 is ALWAYS prevented, picker open or not: the browser's own F5 reloads
   * the page, and an operator reaching for Reload would lose every edit without
   * being asked.
   */
  const shortcuts = {
    requestSave,
    requestReload,
    requestLeave,
    requestUnmap,
    modalOpen: picker !== null || confirm !== null,
  };
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = shortcutsRef.current;
      if (event.key === "F5") {
        event.preventDefault();
        if (!current.modalOpen && !event.repeat) {
          current.requestReload();
        }
        return;
      }
      if (current.modalOpen || event.repeat) {
        return;
      }
      if (event.key === "Escape") {
        // Anything layered over the screen owns Escape first.
        if (!event.defaultPrevented) {
          event.preventDefault();
          current.requestLeave();
        }
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        // Saves from inside a cell too. Unlike the desktop editor, a React cell
        // has no uncommitted text to flush first: every keystroke is already in
        // the rows the save reads.
        event.preventDefault();
        current.requestSave();
        return;
      }
      if (event.altKey && (event.key === "u" || event.key === "U")) {
        event.preventDefault();
        current.requestUnmap();
        return;
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.defaultPrevented) {
        if (caretIsNowhere() && focusGrid(ROLE_GRID_NAME, event.key === "ArrowDown" ? "first" : "last")) {
          event.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const resolveConfirm = useCallback(() => {
    const pending = confirm;
    setConfirm(null);
    pending?.run();
  }, [confirm]);

  const pillGood = health.broken === 0;
  const showPill = map.phase === "ready" && rows.length > 0;

  return (
    <div className={styles.page}>
      {/* ── Title block: what this is, and whether anything will fail ─────── */}
      <div className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            Posting Ledger Map
            {dirty ? <span className={styles.dirtyMark}> *</span> : null}
          </h1>
          <p className={styles.subtitle}>The same mapping for every company</p>
        </div>
        <div className={styles.titleActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canDelete || busyNow || rows.length === 0}
            title="Remove the current row's mapping (Alt+U)"
            onClick={requestUnmap}
          >
            Unmap (Alt+U)
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy === "saving" || busy === "unmapping"}
            title="Re-read the map from the server (F5)"
            onClick={requestReload}
          >
            {busy === "loading" ? "Loading…" : "Reload (F5)"}
          </button>
          {showPill ? (
            <span
              className={cx(styles.statusPill, pillGood ? styles.statusPillGood : styles.statusPillBad)}
              title={
                pillGood
                  ? "Every role resolves to a live ledger."
                  : "Roles that are unmapped, switched off, or pointed at a ledger that has gone — a posting that needs one is refused."
              }
            >
              {healthPillText(health)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Why this screen exists. Permanent, because the consequence of a
             wrong row is invisible and months away. ──────────────────────── */}
      <p className={styles.why}>
        Every voucher turns a posting role into a ledger through this table. A wrong row does not
        fail — it posts to the wrong account silently. A role with no ledger cannot post at all.
      </p>

      {/* ── The notice band: shown only when there is something to say ───── */}
      {health.brokenAndPosted.length > 0 ? (
        <p className={styles.bannerBad} role="alert">
          These roles are posted by a document today and have no ledger to post to:{" "}
          <strong>{health.brokenAndPosted.join(", ")}</strong>. A voucher that needs one will be
          refused.
        </p>
      ) : null}

      {map.phase === "failed" ? (
        <p className={styles.bannerBad} role="alert">
          The posting roles could not be loaded. {map.loadError}{" "}
          <button type="button" className={styles.linkButton} onClick={() => void map.reload()}>
            Try again
          </button>
        </p>
      ) : null}

      {!permissionsLoading && !canWrite ? (
        <p className={styles.bannerInfo}>
          Read only — you can see the map, but your menu rights do not allow changing it.
        </p>
      ) : null}

      <RoleGrid
        columns={resize.columns}
        rows={rows}
        dirtyRoles={map.dirtyRoles}
        currentRole={effectiveCurrentRole}
        editable={editable}
        loading={map.phase === "loading"}
        onCurrentRoleChange={setCurrentRole}
        onOpenPicker={openPicker}
        onSetRemarks={map.setRemarks}
        resizingKey={resize.resizingKey}
        onColumnResizeStart={resize.onResizeStart}
        onContextMenu={settings.onContextMenu}
      />

      {/* ── The hint, and the buttons ────────────────────────────────────── */}
      <footer className={styles.footerBar}>
        <span className={styles.footerHint} title={SHORTCUTS_TITLE}>
          Type in the Ledger cell to pick one · Ctrl+Enter saves · Alt+U removes a mapping · F5
          reloads
        </span>
        <span className={styles.footerActions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canWrite || busyNow}
            title="Save the changed rows (Ctrl+Enter)"
            onClick={requestSave}
          >
            {busy === "saving" ? "Saving…" : dirty ? `Save (${map.dirtyRoles.size})` : "Save"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            title="Close (Esc)"
            onClick={requestLeave}
          >
            Close
          </button>
        </span>
      </footer>

      {picker !== null && pickerRow ? (
        <RoleLedgerPicker
          key={picker.role}
          row={pickerRow}
          initialSearch={picker.initialSearch}
          onClose={closePicker}
          onPick={onPick}
        />
      ) : null}

      {settings.overlays}

      <DeleteConfirmModal
        isOpen={confirm !== null}
        title={confirm?.title}
        message={confirm?.message}
        note={confirm?.note}
        iconVariant={confirm?.iconVariant ?? "delete"}
        confirmLabel={confirm?.confirmLabel ?? "Confirm"}
        onConfirm={resolveConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
