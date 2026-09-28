"use client";

/**
 * The user entry dialog: two tabs, one save.
 *
 * All the rules live in `domain/entryModel.ts` and are dispatched from here;
 * this file loads, renders and confirms. The overlay follows the house
 * three-part structure (portal, isolated overlay, separate backdrop,
 * pre-promoted panel) so the page's grid cannot ghost through it.
 *
 * Nothing about a save is silent: a save that revokes anything asks first
 * (§7.3), and the page's toast says when the rights take effect (§8).
 */
import { type CSSProperties, useCallback, useEffect, useReducer, useRef, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { cx } from "@/components/design-system/cx";
import dynamicModalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import {
  readUserAdminError,
  useLoadUserAdminMutation,
  useSaveUserAdminMutation,
  type UserAdminPayload,
} from "./api/userAdmin";
import { useLoadMenuTreeMutation } from "./api/menuMasters";
import { CopyRightsPicker, type PickedUser } from "./components/copy-rights-picker";
import { buildSaveBody } from "./domain/body";
import {
  canSave,
  currentDiff,
  entryReducer,
  grantsForSave,
  initialEntryState,
  isDirty,
  permissionsHold,
  permissionsReady,
  saveHold,
  splitServerErrors,
  type EntryMode,
} from "./domain/entryModel";
import { describeRevocations, revokesAnything } from "./domain/grantDiff";
import { copyGrantsFrom, countGrants, grantsFromPayload } from "./domain/grants";
import { validateIdentity } from "./domain/identity";
import { parseMenuTree } from "./domain/menuTree";
import { NESTED_SURFACE_ATTR } from "./nested-surface";
import { IdentityTab } from "./tabs/identity-tab";
import { PermissionsTab } from "./tabs/permissions-tab";
import styles from "./user-administration.module.scss";

const PANEL_STYLE: CSSProperties = {
  width: "min(calc(94vw / var(--erp-ui-scale)), 72rem)",
  height: "min(calc(90vh / var(--erp-ui-scale)), 48rem)",
  maxHeight: "none",
};

export type UserEntryDialogProps = {
  open: boolean;
  mode: EntryMode;
  usrId: string | null;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (payload: UserAdminPayload) => void;
};

/** Mounted per opening, so every open starts from a fresh state. */
export function UserEntryDialog(props: UserEntryDialogProps) {
  if (!props.open) return null;
  return <EntryDialogBody {...props} />;
}

function EntryDialogBody({ mode, usrId, readOnly = false, onClose, onSaved }: UserEntryDialogProps) {
  const [state, dispatch] = useReducer(entryReducer, { mode, usrId, readOnly }, initialEntryState);
  const [loadUser] = useLoadUserAdminMutation();
  const [loadTree] = useLoadMenuTreeMutation();
  const [saveUser] = useSaveUserAdminMutation();
  const [confirm, setConfirm] = useState<"discard" | "revoke" | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [revokeSentence, setRevokeSentence] = useState<string | null>(null);
  const nestedOpen = confirm !== null || pickerOpen;
  const nestedOpenRef = useRef(nestedOpen);
  useEffect(() => {
    nestedOpenRef.current = nestedOpen;
  }, [nestedOpen]);

  // The tree and the user load in parallel; the grants apply when both have
  // arrived — a derived value, not a queue (§6.5).
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "tree/loading" });
    loadTree()
      .unwrap()
      .then((payload) => {
        if (!cancelled) dispatch({ type: "tree/loaded", tree: parseMenuTree(payload) });
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ type: "tree/failed", error: readUserAdminError(error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [loadTree]);

  useEffect(() => {
    if (mode !== "edit" || !usrId) return;
    let cancelled = false;
    dispatch({ type: "user/loading" });
    loadUser(usrId)
      .unwrap()
      .then((payload) => {
        if (!cancelled) dispatch({ type: "user/loaded", payload });
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ type: "user/failed", error: readUserAdminError(error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [loadUser, mode, usrId]);

  const requestClose = useCallback(() => {
    if (!state.readOnly && !state.saving && isDirty(state)) {
      setConfirm("discard");
      return;
    }
    onClose();
  }, [onClose, state]);

  // Escape closes the dialog — unless a nested surface (the picker, a confirm,
  // the row menu) is up, which owns it. Decided per EVENT, not from state: a
  // nested handler that runs first closes its surface, React commits that in
  // the microtask before the next listener, and a ref or a state read here
  // would already say "nothing nested" and close this dialog too. So a nested
  // handler marks the event (`preventDefault`), and this one also looks for a
  // nested surface still in the DOM, which covers the other listener order.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (nestedOpenRef.current || document.querySelector(`[${NESTED_SURFACE_ATTR}]`)) return;
      event.stopPropagation();
      requestClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose]);

  const performSave = useCallback(async () => {
    dispatch({ type: "save/started" });
    const body = buildSaveBody({
      mode: state.mode,
      usrId: state.usrId,
      identity: state.identity,
      grants: grantsForSave(state),
    });
    try {
      const payload = await saveUser(body).unwrap();
      dispatch({ type: "save/succeeded", payload });
      onSaved(payload);
      onClose();
    } catch (error: unknown) {
      const { status, message, errors } = readUserAdminError(error);
      const split =
        status === 400 || errors.length > 0
          ? splitServerErrors(errors, message)
          : { fieldErrors: {}, banner: message };
      dispatch({ type: "save/failed", ...split });
      if (Object.keys(split.fieldErrors).length > 0) dispatch({ type: "tab/changed", tab: "identity" });
    }
  }, [onClose, onSaved, saveUser, state]);

  const requestSave = useCallback(() => {
    if (!canSave(state)) return;
    const errors = validateIdentity(state.identity, state.mode);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: "errors/set", fieldErrors: errors, banner: null });
      dispatch({ type: "tab/changed", tab: "identity" });
      return;
    }
    if (permissionsReady(state)) {
      const diff = currentDiff(state);
      if (revokesAnything(diff)) {
        setRevokeSentence(
          describeRevocations(diff, (menuId) => state.tree.value.byId.get(menuId)?.label ?? `menu #${menuId}`),
        );
        setConfirm("revoke");
        return;
      }
    }
    void performSave();
  }, [performSave, state]);

  const copyFrom = useCallback(
    async (user: PickedUser) => {
      setCopyBusy(true);
      try {
        const payload = await loadUser(user.usrId).unwrap();
        const source = grantsFromPayload(payload.menus);
        dispatch({ type: "grants/changed", grants: copyGrantsFrom(source, state.loadedGrants) });
        const kept = countGrants(source, state.tree.value);
        setCopyHint(
          `${user.displayName || user.loginName}'s rights are in the form — ${kept.ticked} menus` +
            (kept.outsideTree > 0 ? ` and ${kept.outsideTree} not shown here` : "") +
            ". Review them, then Save.",
        );
        setPickerOpen(false);
      } catch (error: unknown) {
        dispatch({
          type: "errors/set",
          fieldErrors: state.fieldErrors,
          banner: `Could not read ${user.loginName}'s rights: ${readUserAdminError(error).message}`,
        });
        setPickerOpen(false);
      } finally {
        setCopyBusy(false);
      }
    },
    [loadUser, state.fieldErrors, state.loadedGrants, state.tree.value],
  );

  const title =
    state.mode === "create" ? "User Entry" : state.readOnly ? "User" : "Edit User Entry";
  const hold = saveHold(state);
  const grantCount = countGrants(state.grants, state.tree.value);
  const identityDisabled = state.readOnly || state.saving || state.user.status !== "loaded";
  const permissionHoldText = permissionsHold(state);

  return (
    <ModalPortal>
      <div className={cx(dynamicModalStyles.overlay, "erp-ms-modal-overlay")}>
        <div className={dynamicModalStyles.backdrop} onMouseDown={requestClose} />
        <section
          className={cx(dynamicModalStyles.panel, "erp-ms-modal", styles.panel)}
          // Inline, because the master-shell skin pins every `.erp-ms-modal` to
          // 460px with a two-class selector no module class outranks. Both axes
          // are fixed so the panel keeps one size across the two tabs.
          style={PANEL_STYLE}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <header className={cx(dynamicModalStyles.header, "erp-ms-modal-header", styles.fixedBand)}>
            <div className={dynamicModalStyles.headerRow}>
              <h3 className={cx(dynamicModalStyles.headerTitle, "erp-ms-modal-title")}>
                {title}
                {state.identity.loginName ? (
                  <span className="erp-ms-modal-mode"> — {state.identity.loginName}</span>
                ) : null}
                {state.readOnly ? <span className={styles.readOnlyTag}>read-only</span> : null}
              </h3>
              <button
                type="button"
                className={cx(dynamicModalStyles.closeButton, "erp-ms-modal-close")}
                aria-label="Close"
                onClick={requestClose}
              >
                ×
              </button>
            </div>
          </header>

          <div className={cx(dynamicModalStyles.sectionTabs, styles.fixedBand)} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={state.tab === "identity"}
              className={cx(dynamicModalStyles.sectionTab, state.tab === "identity" && dynamicModalStyles.sectionTabActive)}
              onClick={() => dispatch({ type: "tab/changed", tab: "identity" })}
            >
              Identity
              {Object.keys(state.fieldErrors).length > 0 ? (
                <span className={cx(dynamicModalStyles.sectionTabBadge, styles.tabBadge)}>
                  {Object.keys(state.fieldErrors).length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={state.tab === "permissions"}
              className={cx(dynamicModalStyles.sectionTab, state.tab === "permissions" && dynamicModalStyles.sectionTabActive)}
              onClick={() => dispatch({ type: "tab/changed", tab: "permissions" })}
            >
              Menu Permissions
              {permissionsReady(state) ? (
                <span className={cx(dynamicModalStyles.sectionTabBadge, styles.tabBadge)}>
                  {grantCount.ticked}
                </span>
              ) : null}
            </button>
          </div>

          <div className={styles.body}>
            {state.tab === "identity" ? (
              <IdentityTab
                identity={state.identity}
                errors={state.fieldErrors}
                facts={state.facts}
                mode={state.mode}
                disabled={identityDisabled}
                onChange={(patch) => dispatch({ type: "identity/changed", patch })}
              />
            ) : (
              <PermissionsTab
                tree={state.tree.value}
                grants={state.grants}
                loaded={state.loadedGrants}
                hold={permissionHoldText}
                disabled={state.readOnly || state.saving}
                hint={copyHint}
                onChange={(grants) => dispatch({ type: "grants/changed", grants })}
                onCopyFrom={() => setPickerOpen(true)}
              />
            )}
          </div>

          <footer className={cx(dynamicModalStyles.footer, "erp-ms-modal-footer", styles.fixedBand)}>
            {state.banner ? (
              <p className={styles.footerBanner} role="alert">
                {state.banner}
              </p>
            ) : (
              <p className={styles.footerHint}>
                {hold ??
                  (state.user.status === "loaded" && state.user.error === null && state.mode === "edit"
                    ? "Rights take effect at the user's next sign-in."
                    : "")}
              </p>
            )}
            <div className={cx(dynamicModalStyles.footerActions, "erp-ms-modal-footer-actions")}>
              <button
                type="button"
                className={cx(dynamicModalStyles.cancelButton, "erp-ms-modal-cancel")}
                onClick={requestClose}
                disabled={state.saving}
              >
                {state.readOnly ? "Close" : "Cancel"}
              </button>
              {state.readOnly ? null : (
                <button
                  type="button"
                  className={cx(dynamicModalStyles.submitButton, "erp-ms-modal-save")}
                  onClick={requestSave}
                  disabled={!canSave(state)}
                  title={hold ?? undefined}
                >
                  {state.saving ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </footer>
        </section>
      </div>

      <DeleteConfirmModal
        isOpen={confirm === "discard"}
        title="Discard changes?"
        message="This user has unsaved changes."
        note="Closing now throws them away."
        iconVariant="replace"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirm(null);
          onClose();
        }}
        onCancel={() => setConfirm(null)}
      />

      <DeleteConfirmModal
        isOpen={confirm === "revoke"}
        title="This save takes rights away"
        message={revokeSentence ?? ""}
        note="Anything not listed here is kept."
        confirmLabel="Save anyway"
        cancelLabel="Go back"
        loading={state.saving}
        loadingLabel="Saving…"
        onConfirm={() => {
          setConfirm(null);
          void performSave();
        }}
        onCancel={() => setConfirm(null)}
      />

      <CopyRightsPicker
        open={pickerOpen}
        excludeUsrId={state.usrId}
        busy={copyBusy}
        onPick={(user) => void copyFrom(user)}
        onClose={() => setPickerOpen(false)}
      />
    </ModalPortal>
  );
}
