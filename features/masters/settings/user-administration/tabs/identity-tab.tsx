"use client";

/**
 * The Identity tab (§4): login, password, type, company / branch, the login
 * channels, the edit rights, active, notes — and on edit the read-only facts
 * (lock, failed logins, last login) the payload carries and the save never
 * echoes.
 *
 * Branch is scoped to the chosen company (Qt did not do this): it reads
 * `/master-lookups/branches/by-company/:id`, and the reducer drops the branch
 * whenever the company changes.
 */
import { useId, useState, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import dynamicModalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useGetBranchesByCompanyQuery } from "@/store/api/businessContextApi";
import type { EntryMode } from "../domain/entryModel";
import {
  IDENTITY_LIMITS,
  USER_TYPE_OPTIONS,
  type IdentityErrors,
  type IdentityForm,
  type UserFacts,
} from "../domain/identity";
import { isUserType } from "../domain/identity";
import styles from "../user-administration.module.scss";

export type IdentityTabProps = {
  identity: IdentityForm;
  errors: IdentityErrors;
  facts: UserFacts | null;
  mode: EntryMode;
  disabled: boolean;
  onChange: (patch: Partial<IdentityForm>) => void;
};

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(dynamicModalStyles.field, "erp-ms-modal-field")}>
      <label htmlFor={id} className={cx(dynamicModalStyles.label, "erp-ms-modal-label")}>
        {label}
        {required ? <span className={dynamicModalStyles.requiredMark}> *</span> : null}
      </label>
      {children}
      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={cx(styles.check, disabled && styles.checkDisabled)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function IdentityTab({ identity, errors, facts, mode, disabled, onChange }: IdentityTabProps) {
  const ids = useId();
  const [reveal, setReveal] = useState(false);
  const companyDropdownId = useDropdownId("company");
  const branches = useGetBranchesByCompanyQuery(identity.companyId, { skip: !identity.companyId });

  const controlClass = (invalid: boolean) =>
    cx(dynamicModalStyles.control, "erp-ms-modal-control", invalid && styles.controlInvalid);

  const branchOptions = branches.data ?? [];
  // A saved branch the list does not carry (another company's, or inactive)
  // still shows by name, so the admin sees what is stored before changing it.
  const branchKnown = branchOptions.some((branch) => branch.id === identity.branchId);

  return (
    <div className={cx(dynamicModalStyles.scrollArea, "erp-ms-modal-body", styles.identityBody)}>
      {facts ? (
        <div className={styles.facts} aria-label="Account status">
          <span>
            <span className={styles.factLabel}>Lock</span>
            <span className={cx(styles.factValue, facts.isLocked && styles.factLocked)}>
              {facts.isLocked ? `Locked${facts.lockedOn ? ` since ${when(facts.lockedOn)}` : ""}` : "Not locked"}
            </span>
          </span>
          <span>
            <span className={styles.factLabel}>Failed logins</span>
            <span className={styles.factValue}>
              {facts.failedLoginCount}
              {facts.lastFailedLoginOn ? ` (last ${when(facts.lastFailedLoginOn)})` : ""}
            </span>
          </span>
          <span>
            <span className={styles.factLabel}>Last login</span>
            <span className={styles.factValue}>{when(facts.lastLoginOn)}</span>
          </span>
          <span>
            <span className={styles.factLabel}>Password changed</span>
            <span className={styles.factValue}>{when(facts.passwordChangedOn)}</span>
          </span>
          {facts.isLocked ? (
            <p className={styles.factNote}>
              There is no unlock route yet — the lock can be seen here but not lifted.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.columns}>
        <section className={styles.group} aria-label="Login">
          <h4 className={styles.groupTitle}>Login</h4>
          <Field id={`${ids}-login`} label="Login name" required error={errors.loginName}>
            <input
              id={`${ids}-login`}
              className={controlClass(Boolean(errors.loginName))}
              value={identity.loginName}
              maxLength={IDENTITY_LIMITS.loginName}
              // A credential: the app-wide capitalisation rewrite leaves these alone.
              autoComplete="username"
              autoFocus={mode === "create"}
              disabled={disabled}
              onChange={(event) => onChange({ loginName: event.target.value })}
            />
          </Field>
          <Field
            id={`${ids}-password`}
            label={mode === "create" ? "Password" : "New password"}
            required={mode === "create"}
            error={errors.password}
          >
            <div className={styles.passwordRow}>
              <input
                id={`${ids}-password`}
                type={reveal ? "text" : "password"}
                className={controlClass(Boolean(errors.password))}
                value={identity.password}
                autoComplete="new-password"
                placeholder={mode === "edit" ? "Leave blank to keep the current password" : ""}
                disabled={disabled}
                onChange={(event) => onChange({ password: event.target.value })}
              />
              <button
                type="button"
                className={styles.revealButton}
                disabled={disabled}
                onClick={() => setReveal((value) => !value)}
                aria-pressed={reveal}
              >
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          <Field id={`${ids}-type`} label="User type" required error={errors.userType}>
            <select
              id={`${ids}-type`}
              className={cx(controlClass(Boolean(errors.userType)), styles.select)}
              value={identity.userType}
              disabled={disabled}
              onChange={(event) =>
                onChange({ userType: isUserType(event.target.value) ? event.target.value : "" })
              }
            >
              <option value="">Select user type</option>
              {USER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${ids}-must`} label="Password rule">
            <Check
              label="Must change password at next login"
              checked={identity.mustChangePassword}
              disabled={disabled}
              onChange={(value) => onChange({ mustChangePassword: value })}
            />
          </Field>
        </section>

        <section className={styles.group} aria-label="Person">
          <h4 className={styles.groupTitle}>Person</h4>
          <Field id={`${ids}-display`} label="Display name" error={errors.displayName}>
            <input
              id={`${ids}-display`}
              className={controlClass(Boolean(errors.displayName))}
              value={identity.displayName}
              maxLength={IDENTITY_LIMITS.displayName}
              placeholder="Shown in the header; defaults to the full name"
              disabled={disabled}
              onChange={(event) => onChange({ displayName: event.target.value })}
            />
          </Field>
          <Field id={`${ids}-full`} label="Full name" error={errors.fullName}>
            <input
              id={`${ids}-full`}
              className={controlClass(Boolean(errors.fullName))}
              value={identity.fullName}
              maxLength={IDENTITY_LIMITS.fullName}
              disabled={disabled}
              onChange={(event) => onChange({ fullName: event.target.value })}
            />
          </Field>
          <Field id={`${ids}-mobile`} label="Mobile" error={errors.mobileNo}>
            <input
              id={`${ids}-mobile`}
              type="tel"
              className={controlClass(Boolean(errors.mobileNo))}
              value={identity.mobileNo}
              maxLength={IDENTITY_LIMITS.mobileNo}
              disabled={disabled}
              onChange={(event) => onChange({ mobileNo: event.target.value })}
            />
          </Field>
          <Field id={`${ids}-email`} label="Email" error={errors.email}>
            <input
              id={`${ids}-email`}
              type="email"
              className={controlClass(Boolean(errors.email))}
              value={identity.email}
              maxLength={IDENTITY_LIMITS.email}
              disabled={disabled}
              onChange={(event) => onChange({ email: event.target.value })}
            />
          </Field>
        </section>

        <section className={styles.group} aria-label="Place">
          <h4 className={styles.groupTitle}>Company &amp; branch</h4>
          <Field id={`${ids}-company`} label="Company" error={errors.companyId}>
            <NexDropdownSingle
              id={`${ids}-company`}
              dropdownId={companyDropdownId}
              value={identity.companyId ? { id: identity.companyId, text: identity.companyName } : null}
              onChange={(selection) =>
                onChange({ companyId: selection?.id ?? "", companyName: selection?.text ?? "" })
              }
              disabled={disabled}
              placeholder="Any company"
              aria-label="Company"
              className={styles.dropdownField}
              advanceFocusOnSelect={false}
            />
          </Field>
          <Field id={`${ids}-branch`} label="Branch" error={errors.branchId}>
            <select
              id={`${ids}-branch`}
              className={cx(controlClass(Boolean(errors.branchId)), styles.select)}
              value={identity.branchId}
              disabled={disabled || !identity.companyId}
              onChange={(event) => {
                const branch = branchOptions.find((option) => option.id === event.target.value);
                onChange({ branchId: branch?.id ?? "", branchName: branch?.name ?? "" });
              }}
            >
              <option value="">
                {!identity.companyId
                  ? "Choose a company first"
                  : branches.isFetching && branchOptions.length === 0
                    ? "Loading branches…"
                    : "Any branch of the company"}
              </option>
              {identity.branchId && !branchKnown ? (
                <option value={identity.branchId}>{identity.branchName || identity.branchId}</option>
              ) : null}
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className={styles.group} aria-label="Access">
          <h4 className={styles.groupTitle}>Access</h4>
          <Field id={`${ids}-channels`} label="May sign in on">
            <div className={styles.checks}>
              <Check
                label="Desktop"
                checked={identity.desktopLogin}
                disabled={disabled}
                onChange={(value) => onChange({ desktopLogin: value })}
              />
              <Check
                label="Web"
                checked={identity.webLogin}
                disabled={disabled}
                onChange={(value) => onChange({ webLogin: value })}
              />
              <Check
                label="Mobile"
                checked={identity.mobileLogin}
                disabled={disabled}
                onChange={(value) => onChange({ mobileLogin: value })}
              />
            </div>
          </Field>
          <Field id={`${ids}-edits`} label="May edit">
            <div className={styles.checks}>
              <Check
                label="Date"
                checked={identity.editDate}
                disabled={disabled}
                onChange={(value) => onChange({ editDate: value })}
              />
              <Check
                label="Entry"
                checked={identity.editEntry}
                disabled={disabled}
                onChange={(value) => onChange({ editEntry: value })}
              />
              <Check
                label="Rate"
                checked={identity.editRate}
                disabled={disabled}
                onChange={(value) => onChange({ editRate: value })}
              />
            </div>
          </Field>
          <Field id={`${ids}-active`} label="Status">
            <Check
              label="Active"
              checked={identity.isActive}
              disabled={disabled}
              onChange={(value) => onChange({ isActive: value })}
            />
          </Field>
        </section>

        <section className={cx(styles.group, styles.groupWide)} aria-label="Notes">
          <Field id={`${ids}-notes`} label="Admin notes" error={errors.notes}>
            <textarea
              id={`${ids}-notes`}
              className={cx(dynamicModalStyles.control, "erp-ms-modal-control")}
              value={identity.notes}
              rows={3}
              disabled={disabled}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </Field>
        </section>
      </div>
    </div>
  );
}
