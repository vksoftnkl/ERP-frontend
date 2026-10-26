"use client";

/**
 * One select in the header bar: a white tile with an optional leading icon
 * and a drawn chevron. The control itself stays a native `<select>` — the
 * keyboard, the option list and screen readers all behave as they always did.
 * The tile, not the select, takes the sizing class (`className`).
 */
import type { ReactNode, SelectHTMLAttributes } from "react";
import { LuChevronDown } from "react-icons/lu";

import styles from "./erp-header.module.css";

export type HeaderSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  className?: string;
  icon?: ReactNode;
  /** Bold value text — the company, which names everything below it. */
  strong?: boolean;
};

function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

export default function HeaderSelect({ className, icon, strong, children, ...selectProps }: HeaderSelectProps) {
  return (
    <span className={cx(styles.contextField, className)}>
      {icon ? (
        <span className={styles.contextFieldIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <select
        {...selectProps}
        className={cx(
          styles.contextSelect,
          Boolean(icon) && styles.contextSelectWithIcon,
          strong && styles.contextSelectStrong,
        )}
      >
        {children}
      </select>
      <LuChevronDown className={styles.contextFieldChevron} aria-hidden="true" />
    </span>
  );
}
