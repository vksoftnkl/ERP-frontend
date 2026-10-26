"use client";

/**
 * The user menu's two account dialogs: My profile (read-only — the user's own
 * row; a change to it is User Administration's) and Change password.
 *
 * Change password goes through `/user-administration/create` with only the
 * user's id, login name and the new password: the server leaves every omitted
 * key as stored, so nothing else on the row moves. There is no self-service
 * route that checks the CURRENT password, which is why the form does not ask
 * for it.
 */
import { useCallback, useState, type FormEvent } from "react";
import { useSaveUserAdminMutation } from "@/store/api/userAdminApi";
import type { UserAdminPayload } from "@/features/masters/settings/user-administration/domain/wire";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { cx } from "@/components/design-system/cx";
import type { UserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { dateTime12Of } from "@/lib/time-format";
import {
  displayNameOf,
  initialsOf,
  roleLabelOf,
  validatePasswordChange,
  type PasswordChangeErrors,
} from "./user-account";
import styles from "./user-account-dialogs.module.scss";

const BLANK = "—";

type ProfileRow = { term: string; value: string | null | undefined };

export type UserProfileDialogProps = {
  open: boolean;
  onClose: () => void;
  profile: UserAdminPayload | null;
  loading: boolean;
  failed: boolean;
  sessionInfo: UserInfo | null;
  onChangePassword: () => void;
};

export function UserProfileDialog({
  open,
  onClose,
  profile,
  loading,
  failed,
  sessionInfo,
  onChangePassword,
}: UserProfileDialogProps) {
  const name = displayNameOf(profile, sessionInfo?.userName);
  const role = roleLabelOf(profile?.usrType ?? sessionInfo?.userType);
  const rows: ProfileRow[] = [
    { term: "Login name", value: profile?.usrLoginName ?? sessionInfo?.userName },
    { term: "Full name", value: profile?.usrFullName },
    { term: "Role", value: role },
    { term: "Email", value: profile?.usrEmail },
    { term: "Mobile", value: profile?.usrMobileNo },
    { term: "Company", value: profile?.usrCompanyName },
    { term: "Branch", value: profile?.usrBranchName },
    { term: "Employee", value: profile?.usrEmployeeName },
    { term: "Last login", value: dateTime12Of(profile?.usrLastLoginOn) },
    { term: "Password changed", value: dateTime12Of(profile?.usrPasswordChangedOn) },
    { term: "This device", value: sessionInfo?.deviceName },
  ];
  return (
    <ModalShell
      title="My profile"
      isOpen={open}
      narrow
      onClose={onClose}
      footer={
        <>
          <span className={quotationStyles.modalNote}>
            Details are kept in User Administration.
          </span>
          <span className={styles.actions}>
            <button type="button" className={quotationStyles.button} onClick={onChangePassword}>
              Change password
            </button>
            <button type="button" className={quotationStyles.button} autoFocus onClick={onClose}>
              Close · Esc
            </button>
          </span>
        </>
      }
    >
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          {initialsOf(name)}
        </span>
        <div className={styles.identityText}>
          <p className={styles.name}>{name}</p>
          {role ? <p className={styles.meta}>{role}</p> : null}
        </div>
      </div>
      {failed && !profile ? (
        <p className={styles.note}>Your full profile could not be read just now.</p>
      ) : null}
      {loading && !profile ? <p className={styles.note}>Loading…</p> : null}
      <dl className={styles.details}>
        {rows.map((row) => (
          <div key={row.term} className={styles.row}>
            <dt className={styles.term}>{row.term}</dt>
            <dd className={styles.value}>{row.value?.trim() ? row.value : BLANK}</dd>
          </div>
        ))}
      </dl>
    </ModalShell>
  );
}

const PASSWORD_FORM_ID = "erp-change-password-form";
const EMPTY_FORM = { password: "", confirm: "" };

export type ChangePasswordDialogProps = {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  loginName: string | null;
  /** The save's answer lacks the joined names (company, branch), so the caller re-reads. */
  onChanged: () => void;
};

export function ChangePasswordDialog({
  open,
  onClose,
  userId,
  loginName,
  onChanged,
}: ChangePasswordDialogProps) {
  // The caller mounts this only while it is open, so a closed dialog forgets
  // what was typed into it.
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [saveUser, { isLoading: saving }] = useSaveUserAdminMutation();

  const canSave = Boolean(userId && loginName?.trim()) && !saving;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId || !loginName?.trim() || saving) return;
      const found = validatePasswordChange(form);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
      try {
        await saveUser({
          usrId: userId,
          usrLoginName: loginName.trim(),
          usrPassword: form.password.trim(),
        }).unwrap();
        toast.success("Your password has been changed.");
        onChanged();
        onClose();
      } catch (error) {
        toast.apiError(error, { fallback: "The password could not be changed." });
      }
    },
    [form, loginName, onChanged, onClose, saveUser, saving, userId],
  );

  const setField = (key: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  return (
    <ModalShell
      title="Change password"
      isOpen={open}
      narrow
      onClose={onClose}
      footer={
        <>
          <span className={quotationStyles.modalNote}>You stay signed in on this device.</span>
          <span className={styles.actions}>
            <button type="button" className={quotationStyles.button} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              form={PASSWORD_FORM_ID}
              className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
              disabled={!canSave}
            >
              {saving ? "Saving…" : "Change password"}
            </button>
          </span>
        </>
      }
    >
      <form id={PASSWORD_FORM_ID} className={styles.form} onSubmit={handleSubmit} noValidate>
        {/* Lets password managers file the new password under the right account. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={loginName ?? ""}
          readOnly
          hidden
        />
        <PasswordField
          id="erp-new-password"
          label="New password"
          value={form.password}
          error={errors.password}
          onChange={setField("password")}
          autoFocus
        />
        <PasswordField
          id="erp-confirm-password"
          label="Confirm new password"
          value={form.confirm}
          error={errors.confirm}
          onChange={setField("confirm")}
        />
        {!userId || !loginName?.trim() ? (
          <p className={styles.error}>The signed-in user is not known — sign in again first.</p>
        ) : null}
      </form>
    </ModalShell>
  );
}

function PasswordField({
  id,
  label,
  value,
  error,
  onChange,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete="new-password"
        className={quotationStyles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoFocus={autoFocus}
      />
      {error ? (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
