"use client";

/**
 * The provider's own account per environment — "credential #1" — from
 * `/gst/providers/get` → `accounts[]`. Secret-free: each secret is a pill
 * ("set · key v1" / "not set"), never a value. A direct-to-NIC provider needs
 * no account; a GSP needs one per environment.
 */
import type { GstProviderAccountPayload } from "../gst.types";
import { ActivePill, EnvironmentPill, Pill } from "../components/controls";
import styles from "../gst.module.scss";

export type AccountsColumnProps = {
  accounts: readonly GstProviderAccountPayload[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** The provider is not saved yet. */
  disabled: boolean;
  onAdd: () => void;
  onOpen: (account: GstProviderAccountPayload) => void;
  onDelete: (account: GstProviderAccountPayload) => void;
};

function SecretRow({ label, set, keyVersion }: { label: string; set: boolean; keyVersion: number }) {
  return (
    <>
      <span className={styles.label}>{label}</span>
      <span>
        <Pill tone={set ? "green" : "grey"}>{set ? `set · key v${keyVersion}` : "not set"}</Pill>
      </span>
    </>
  );
}

export function AccountsColumn({
  accounts,
  canCreate,
  canEdit,
  canDelete,
  disabled,
  onAdd,
  onOpen,
  onDelete,
}: AccountsColumnProps) {
  return (
    <div className={`${styles.splitPane} ${disabled ? styles.splitPaneDisabled : ""}`}>
      <div className={styles.listBar}>
        <div className={styles.caption}>
          Provider account <span className={styles.captionNote}>· credential #1, per environment</span>
        </div>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonSmall}`}
          disabled={disabled || !canCreate}
          onClick={onAdd}
        >
          + Add account
        </button>
      </div>
      <div className={styles.accounts}>
        {accounts.length === 0 ? (
          <p className={styles.hint}>
            No account yet. A direct-to-NIC provider needs none; a GSP needs one per environment.
          </p>
        ) : (
          accounts.map((account) => (
            <div key={account.gpaId} className={styles.accountCard}>
              <div className={styles.accountTop}>
                <EnvironmentPill environment={account.gpaEnvironment} />
                <span className={styles.hint}>
                  {account.gpaService ? `only ${account.gpaService}` : "covers every service"}
                </span>
                <ActivePill active={account.gpaIsActive} />
              </div>
              <span className={styles.label}>Account ref</span>
              <span className={styles.accountRef}>{account.gpaAccountRef || "—"}</span>
              <SecretRow label="Client ID" set={account.hasClientId} keyVersion={account.keyVersion} />
              <SecretRow label="Secret" set={account.hasClientSecret} keyVersion={account.keyVersion} />
              <SecretRow label="API key" set={account.hasApiKey} keyVersion={account.keyVersion} />
              <div className={styles.accountButtons}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonSmall}`}
                  onClick={() => onOpen(account)}
                >
                  {canEdit ? "Edit…" : "View…"}
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonSmall}`}
                  disabled={!canDelete}
                  onClick={() => onDelete(account)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
        <div className={styles.noteInfo}>
          Secrets are <b>write-only</b>. The form never shows a stored value — only «set · key vN» or «not
          set» — and typing a new one replaces it. The server encrypts with its own key; no secret ever
          reaches this screen. Service blank = one account for every service (the gateway case).
        </div>
        <div className={styles.noteWarn}>
          NIC 2150 / 2172 and EWB 312 are «treat as SUCCESS»: the existing IRN / EWB number is read out of
          the error reply. Without those rows a retry after a lost reply makes a duplicate. 1005 / GSP102 =
          re-authenticate; 429 / GSP501 = retry later.
        </div>
      </div>
    </div>
  );
}
