"use client";

/**
 * The GST forms' own controls: the state pill, the write-only secret box
 * (Qt `GstSecretField`) and the whitelisted-IP chips.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { secretBadge, type SecretBadgeTone, type SecretValue } from "../domain/part-form";
import styles from "../gst.module.scss";

export type PillTone = SecretBadgeTone | "blue";

export function Pill({ tone, title, children }: { tone: PillTone; title?: string; children: ReactNode }) {
  return (
    <span className={cx(styles.pill, styles[`pill_${tone}`])} title={title}>
      {children}
    </span>
  );
}

/** SANDBOX is amber (look at it), PRODUCTION blue. */
export function EnvironmentPill({ environment }: { environment: string }) {
  if (!environment) {
    return null;
  }
  return <Pill tone={environment === "SANDBOX" ? "amber" : "blue"}>{environment}</Pill>;
}

export function ActivePill({ active, upper }: { active: boolean; upper?: boolean }) {
  const label = active ? "Active" : "Inactive";
  return <Pill tone={active ? "green" : "red"}>{upper ? label.toUpperCase() : label}</Pill>;
}

/**
 * One secret. The box never holds a stored value — the server never sends one
 * back, plain or encrypted. It says whether one is stored ("set · key v2" /
 * "not set") and takes a NEW one: typed text replaces, an empty box keeps,
 * × (only on a stored, clearable secret) removes it on save.
 */
export function SecretInput({
  id,
  label,
  value,
  keyVersion,
  clearable,
  autoFocus,
  disabled,
  invalid,
  onText,
  onToggleClear,
}: {
  id: string;
  label: string;
  value: SecretValue;
  keyVersion: number;
  clearable: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onText: (text: string) => void;
  onToggleClear: () => void;
}) {
  const badge = secretBadge(value, keyVersion);
  return (
    <div className={styles.secret}>
      <input
        id={id}
        type="password"
        autoFocus={autoFocus}
        className={cx(styles.input, invalid && styles.inputInvalid)}
        value={value.text}
        placeholder={value.clear ? "" : value.stored ? "type to replace" : "type to set"}
        autoComplete="new-password"
        // Never re-cased by the app-wide capitalisation listener.
        data-uppercase="off"
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(event) => onText(event.target.value)}
      />
      <Pill tone={badge.tone}>{badge.label}</Pill>
      {clearable && value.stored ? (
        <button
          type="button"
          className={cx(styles.secretClear, value.clear && styles.secretClearOn)}
          title={value.clear ? "Keep the stored value" : "Remove the stored value when saving"}
          aria-pressed={value.clear}
          aria-label={`Remove the stored ${label.toLowerCase()}`}
          tabIndex={-1}
          disabled={disabled}
          onClick={onToggleClear}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/**
 * Whitelisted IPs, one chip each. The value is the form's line list ("a\nb"),
 * so the body builder treats it like any other array field. Enter, a comma
 * or a space ends an address; Backspace in an empty box takes the last chip.
 */
export function IpChips({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const ips = value.split("\n").map((ip) => ip.trim()).filter(Boolean);

  const commit = (text: string) => {
    const additions = text
      .split(/[\s,]+/)
      .map((ip) => ip.trim())
      .filter((ip) => ip && !ips.includes(ip));
    if (additions.length > 0) {
      onChange([...ips, ...additions].join("\n"));
    }
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === " ") {
      if (draft.trim()) {
        event.preventDefault();
        commit(draft);
      }
      // An empty box lets Enter walk on to the next field.
      return;
    }
    if (event.key === "Backspace" && !draft && ips.length > 0) {
      onChange(ips.slice(0, -1).join("\n"));
    }
  };

  return (
    <div className={styles.chips}>
      {ips.map((ip) => (
        <span key={ip} className={styles.chip}>
          {ip}
          {disabled ? null : (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove ${ip}`}
              onClick={() => onChange(ips.filter((other) => other !== ip).join("\n"))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        id={id}
        className={styles.chipInput}
        value={draft}
        disabled={disabled}
        placeholder={disabled ? "" : "type an IP and press Enter"}
        data-uppercase="off"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
          }
        }}
      />
    </div>
  );
}
