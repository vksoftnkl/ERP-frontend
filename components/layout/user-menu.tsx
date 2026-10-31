"use client";

/**
 * The header's account menu: who is signed in (name, role, email, last
 * login), My profile, Change password, the app-wide key sheet, Switch user and Logout.
 * Switch user is a sign-out that lands on the login page (same path as Logout).
 *
 * The session only knows the login name and the role, so the rest comes from
 * the user's own `/user-administration/get` row — read once per page load and
 * again whenever My profile opens. If that read is refused the menu still
 * works from the session's fields alone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { LuChevronDown, LuKeyboard, LuLock, LuLogOut, LuUser, LuUsers } from "react-icons/lu";
import { useLoadUserAdminMutation } from "@/store/api/userAdminApi";
import type { UserAdminPayload } from "@/features/masters/settings/user-administration/domain/wire";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectUserInfo } from "@/store/slices/authSlice";
import { dateTime12Of } from "@/lib/time-format";
import { ChangePasswordDialog, UserProfileDialog } from "./user-account-dialogs";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { displayNameOf, initialsOf, isShortcutSheetKey, roleLabelOf } from "./user-account";
import styles from "./erp-header.module.css";

const APP_NAME = "VK Nex ERP";
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

type AccountDialog = "profile" | "password" | "shortcuts";

/** Where a typed `?` belongs to the field, not to the key sheet. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest("input, textarea, select, [role='combobox'], [role='textbox']") !== null;
}

function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

export type UserMenuProps = {
  logoutLabel: string;
  onLogout: () => void;
};

export default function UserMenu({ logoutLabel, onLogout }: UserMenuProps) {
  const userId = useAppSelector(selectAuthUserId);
  const sessionInfo = useAppSelector(selectUserInfo);
  const [loadUser, { isLoading: profileLoading }] = useLoadUserAdminMutation();
  const [profile, setProfile] = useState<UserAdminPayload | null>(null);
  const [profileFailed, setProfileFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<AccountDialog | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const focusFirstOnOpenRef = useRef(false);
  const requestedForRef = useRef<string | null>(null);

  const refreshProfile = useCallback(() => {
    if (!userId) return;
    loadUser(userId)
      .unwrap()
      .then((loaded) => {
        // A late answer for a user who has since signed out is dropped.
        if (loaded.usrId !== userId) return;
        setProfile(loaded);
        setProfileFailed(false);
      })
      .catch(() => setProfileFailed(true));
  }, [loadUser, userId]);

  // Once per signed-in user; the ref also absorbs StrictMode's second mount,
  // since a GET mutation is a fresh request every time it fires.
  useEffect(() => {
    if (!userId || requestedForRef.current === userId) return;
    requestedForRef.current = userId;
    setProfile(null);
    refreshProfile();
  }, [refreshProfile, userId]);

  const displayName = displayNameOf(profile, sessionInfo?.userName);
  const initials = initialsOf(displayName);
  const role = roleLabelOf(profile?.usrType ?? sessionInfo?.userType);
  const email = profile?.usrEmail?.trim() ?? "";
  const lastLogin = dateTime12Of(profile?.usrLastLoginOn);
  const metaLine = [role, email].filter(Boolean).join(" · ");

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const handleTriggerClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    // `detail === 0` is a keyboard click (Enter / Space): carry focus into the menu.
    focusFirstOnOpenRef.current = event.detail === 0;
    setOpen((value) => !value);
  }, []);

  const handleTriggerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    focusFirstOnOpenRef.current = true;
    setOpen(true);
  }, []);

  const menuItems = useCallback(
    () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    [],
  );

  useEffect(() => {
    if (!open || !focusFirstOnOpenRef.current) return;
    focusFirstOnOpenRef.current = false;
    menuItems()[0]?.focus();
  }, [menuItems, open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (shellRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [close, open]);

  const handleShellKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key === "Tab") {
        close();
        return;
      }
      const items = menuItems();
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      let next: number | null = null;
      if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
      else if (event.key === "ArrowUp") next = index <= 0 ? items.length - 1 : index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      if (next === null) return;
      event.preventDefault();
      items[next]?.focus();
    },
    [close, menuItems, open],
  );

  const openDialog = useCallback(
    (next: AccountDialog) => {
      close();
      if (next === "profile") refreshProfile();
      setDialog(next);
    },
    [close, refreshProfile],
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  const handleLogoutClick = useCallback(() => {
    close();
    onLogout();
  }, [close, onLogout]);

  // `?` anywhere outside a field opens the key sheet — unless a dialog is up.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isShortcutSheetKey(event)) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      setOpen(false);
      setDialog("shortcuts");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The dialogs sit outside the shell: their portals still bubble React events
  // to React ancestors, and the menu's arrow-key handling is not for them.
  return (
    <>
      <div ref={shellRef} className={styles.userMenu} onKeyDown={handleShellKeyDown}>
        <button
          ref={triggerRef}
          type="button"
          className={cx(styles.userMenuTrigger, open && styles.userMenuTriggerOpen)}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`User menu — ${displayName}`}
          title={displayName}
        >
          <span className={styles.userMenuAvatar} aria-hidden="true">
            {initials || <LuUser />}
          </span>
          <span className={styles.userMenuName}>{displayName}</span>
          <LuChevronDown className={styles.userMenuChevron} aria-hidden="true" />
        </button>
        {open && (
          <div ref={panelRef} className={styles.userMenuPanel} role="menu" aria-label="Account">
            <div className={styles.userMenuIdentity}>
              <span className={styles.userMenuPanelAvatar} aria-hidden="true">
                {initials || <LuUser />}
              </span>
              <div className={styles.userMenuIdentityText}>
                <div className={styles.userMenuIdentityName}>{displayName}</div>
                {metaLine ? <div className={styles.userMenuIdentityMeta}>{metaLine}</div> : null}
              </div>
              {lastLogin ? <div className={styles.userMenuLastLogin}>Last login: {lastLogin}</div> : null}
            </div>
            <div className={styles.userMenuSection}>
              <button
                type="button"
                role="menuitem"
                className={styles.userMenuItem}
                onClick={() => openDialog("profile")}
              >
                <LuUser className={styles.userMenuItemIcon} aria-hidden="true" />
                <span className={styles.userMenuItemLabel}>My profile</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.userMenuItem}
                onClick={() => openDialog("password")}
              >
                <LuLock className={styles.userMenuItemIcon} aria-hidden="true" />
                <span className={styles.userMenuItemLabel}>Change password</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.userMenuItem}
                onClick={() => openDialog("shortcuts")}
              >
                <LuKeyboard className={styles.userMenuItemIcon} aria-hidden="true" />
                <span className={styles.userMenuItemLabel}>Keyboard shortcuts</span>
                <kbd className={styles.userMenuItemKey}>?</kbd>
              </button>
            </div>
            <div className={styles.userMenuSection}>
              <button
                type="button"
                role="menuitem"
                className={styles.userMenuItem}
                onClick={handleLogoutClick}
              >
                <LuUsers className={styles.userMenuItemIcon} aria-hidden="true" />
                <span className={styles.userMenuItemLabel}>Switch user</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className={cx(styles.userMenuItem, styles.userMenuLogout)}
                onClick={handleLogoutClick}
              >
                <LuLogOut className={styles.userMenuItemIcon} aria-hidden="true" />
                <span className={styles.userMenuItemLabel}>{logoutLabel}</span>
              </button>
            </div>
            <div className={styles.userMenuFooter}>
              <span>{APP_NAME}</span>
              {APP_VERSION ? <span className={styles.userMenuVersion}>v{APP_VERSION}</span> : null}
            </div>
          </div>
        )}
      </div>
      <UserProfileDialog
        open={dialog === "profile"}
        onClose={closeDialog}
        profile={profile}
        loading={profileLoading}
        failed={profileFailed}
        sessionInfo={sessionInfo}
        onChangePassword={() => setDialog("password")}
      />
      {dialog === "password" ? (
        <ChangePasswordDialog
          open
          onClose={closeDialog}
          userId={userId}
          loginName={profile?.usrLoginName ?? sessionInfo?.userName ?? null}
          onChanged={refreshProfile}
        />
      ) : null}
      <KeyboardShortcutsDialog open={dialog === "shortcuts"} onClose={closeDialog} />
    </>
  );
}
