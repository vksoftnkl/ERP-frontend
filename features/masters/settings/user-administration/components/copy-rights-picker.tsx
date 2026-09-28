"use client";

/**
 * "Copy rights from …" (§6.6) — pick another user, and their whole set is
 * loaded into the FORM, not saved. The admin reviews and saves. This is the
 * practical substitute for roles, and the cure for granting 200 × 11 boxes by
 * hand.
 *
 * The list is grid 62, the same one the page lists, searched server-side.
 */
import { type CSSProperties, useEffect, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import dynamicModalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { Z_MODAL_NESTED } from "@/lib/z-index";
import { useSearchUsersQuery, type UserListRow } from "../api/userAdmin";
import { NESTED_SURFACE_ATTR } from "../nested-surface";
import styles from "../user-administration.module.scss";

const SEARCH_DEBOUNCE_MS = 250;
const PAGE_LIMIT = 25;

const NESTED_OVERLAY_STYLE = { "--erp-modal-overlay-z-index": Z_MODAL_NESTED } as CSSProperties;
// Inline: the master-shell skin pins every `.erp-ms-modal` to 460px.
const PANEL_STYLE: CSSProperties = {
  width: "min(calc(90vw / var(--erp-ui-scale)), 34rem)",
  height: "min(calc(70vh / var(--erp-ui-scale)), 30rem)",
  maxHeight: "none",
};

export type PickedUser = { usrId: string; loginName: string; displayName: string };

export type CopyRightsPickerProps = {
  open: boolean;
  /** The user being edited — offering them their own rights would be a no-op. */
  excludeUsrId: string | null;
  busy: boolean;
  onPick: (user: PickedUser) => void;
  onClose: () => void;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowToUser(row: UserListRow): PickedUser | null {
  const usrId = text(row.usr_id);
  if (!usrId) return null;
  return {
    usrId,
    loginName: text(row.usr_login_name),
    displayName: text(row.usr_display_name) || text(row.usr_full_name) || text(row.usr_login_name),
  };
}

export function CopyRightsPicker({ open, excludeUsrId, busy, onPick, onClose }: CopyRightsPickerProps) {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(typed.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [typed]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        // Marks the event as taken, so the dialog underneath leaves it alone
        // whichever of the two listeners runs first.
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  const { data, isFetching, isError } = useSearchUsersQuery(
    { search, page: 1, limit: PAGE_LIMIT },
    { skip: !open },
  );

  if (!open) return null;

  const users = (data?.items ?? [])
    .map(rowToUser)
    .filter((user): user is PickedUser => user !== null && user.usrId !== excludeUsrId);

  return (
    <ModalPortal>
      <div className={cx(dynamicModalStyles.overlay, "erp-ms-modal-overlay")} style={NESTED_OVERLAY_STYLE}>
        <div className={dynamicModalStyles.backdrop} onMouseDown={onClose} />
        <section
          className={cx(dynamicModalStyles.panel, "erp-ms-modal")}
          style={PANEL_STYLE}
          {...{ [NESTED_SURFACE_ATTR]: "" }}
          role="dialog"
          aria-modal="true"
          aria-label="Copy rights from another user"
        >
          <header className={cx(dynamicModalStyles.header, "erp-ms-modal-header", styles.fixedBand)}>
            <div className={dynamicModalStyles.headerRow}>
              <h3 className={cx(dynamicModalStyles.headerTitle, "erp-ms-modal-title")}>
                Copy rights from…
              </h3>
              <button
                type="button"
                className={cx(dynamicModalStyles.closeButton, "erp-ms-modal-close")}
                aria-label="Close"
                onClick={onClose}
              >
                ×
              </button>
            </div>
          </header>
          <div className={cx(dynamicModalStyles.scrollArea, "erp-ms-modal-body", styles.identityBody)}>
            <input
              type="search"
              className={styles.pickerSearch}
              placeholder="Search by login or name"
              value={typed}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              aria-label="Find the user to copy from"
            />
            {isError ? (
              <p className={styles.pickerEmpty}>The user list could not be loaded.</p>
            ) : users.length === 0 ? (
              <p className={styles.pickerEmpty}>{isFetching ? "Looking…" : "No other user matches."}</p>
            ) : (
              <ul className={styles.pickerList}>
                {users.map((user) => (
                  <li key={user.usrId}>
                    <button
                      type="button"
                      className={styles.pickerRow}
                      disabled={busy}
                      onClick={() => onPick(user)}
                    >
                      <span className={styles.pickerRowName}>{user.displayName}</span>
                      <span className={styles.pickerRowMeta}>{user.loginName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <footer className={cx(dynamicModalStyles.footer, "erp-ms-modal-footer", styles.fixedBand)}>
            <p className={styles.footerHint}>
              Their menus and rights replace this form&apos;s — nothing is saved until you Save.
            </p>
            <div className={cx(dynamicModalStyles.footerActions, "erp-ms-modal-footer-actions")}>
              <button
                type="button"
                className={cx(dynamicModalStyles.cancelButton, "erp-ms-modal-cancel")}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
