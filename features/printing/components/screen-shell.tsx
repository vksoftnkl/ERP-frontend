"use client";

/**
 * The frame every printing screen shares, from `printing_ui_mockup`.
 *
 *   title + subtitle -> tab strip -> body -> footer bar
 *
 * It is one component rather than a copied layout because the mockup's whole
 * argument is that these screens are the SAME screen over different tables: a
 * name, the table it edits, the slice of the payload it fills, and one save.
 * Five copies of the frame would drift apart on the first change.
 */

import type { ReactNode } from "react";

import styles from "@/features/printing/printing.module.scss";

export type ScreenTab<T extends string> = { id: T; label: string };

export function ScreenShell<T extends string>({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  footerNote,
  footer,
  children,
}: {
  title: string;
  /** The `·`-separated line under the title. Nulls are dropped. */
  subtitle: (string | null | undefined)[];
  tabs: ScreenTab<T>[];
  activeTab: T;
  onTabChange?: (tab: T) => void;
  footerNote?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const parts = subtitle.filter((part): part is string =>
    Boolean(part && part.trim()),
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        {parts.length > 0 ? (
          <p className={styles.subtitle}>
            {parts.map((part, index) => (
              <span key={`${part}-${index}`}>
                {index > 0 ? (
                  <span className={styles.subtitleSep}>·</span>
                ) : null}
                {part}
              </span>
            ))}
          </p>
        ) : null}

        <nav className={styles.tabStrip}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${tab.id === activeTab ? styles.tabActive : ""}`}
              // A single-tab strip is a label, not a control — the mockup draws
              // one on every list screen so the Designer's three do not read as
              // a different kind of thing.
              disabled={!onTabChange || tabs.length === 1}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className={styles.body}>{children}</div>

      {footer ? (
        <div className={styles.footerBar}>
          {footerNote ? (
            <span className={styles.footerNote}>{footerNote}</span>
          ) : null}
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A section heading: what it is, the TABLE it edits, and the payload slice it
 * fills, right-aligned.
 *
 * The pairing is load-bearing. Three tabs over one save only read as one thing
 * if every section says which part of the body it is; without the slice, the
 * Designer looks like three forms that happen to share a Save button.
 */
export function SectionHead({
  title,
  table,
  qualifier,
  slice,
}: {
  title: string;
  /** e.g. `print_template_version` */
  table?: string;
  /** e.g. `rev 3 · DRAFT`, or `they belong to rev 3, not to the design` */
  qualifier?: string;
  /** e.g. `versions[0].ptv*` */
  slice?: string;
}) {
  return (
    <div className={styles.sectionHead}>
      <h2 className={styles.sectionTitle}>
        {title}
        {table ? (
          <>
            {" — "}
            <span className={styles.sectionTable}>{table}</span>
          </>
        ) : null}
        {qualifier ? (
          <span className={styles.sectionQualifier}>
            {table ? " · " : " — "}
            {qualifier}
          </span>
        ) : null}
      </h2>
      {slice ? <span className={styles.sectionSlice}>{slice}</span> : null}
    </div>
  );
}

export type NoteTone = "plain" | "amber" | "red" | "blue" | "green";

const NOTE_CLASS: Record<NoteTone, string> = {
  plain: styles.notePlain,
  amber: styles.noteAmber,
  red: styles.noteRed,
  blue: styles.noteBlue,
  green: styles.noteGreen,
};

/**
 * A tinted note. The tones carry meaning and are used consistently:
 * amber warns, red refuses, blue explains a design decision, green states a
 * fact the reader can rely on, plain is an aside.
 */
export function Note({
  tone = "plain",
  children,
  action,
}: {
  tone?: NoteTone;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <p className={`${styles.note} ${NOTE_CLASS[tone]}`}>
      {action ? (
        <span className={styles.noteRow}>
          <span>{children}</span>
          {action}
        </span>
      ) : (
        children
      )}
    </p>
  );
}

export type ChipTone = "plain" | "amber" | "red" | "blue" | "green";

const CHIP_CLASS: Record<ChipTone, string> = {
  plain: "",
  amber: styles.chipAmber,
  red: styles.chipRed,
  blue: styles.chipBlue,
  green: styles.chipGreen,
};

export function Chip({
  tone = "plain",
  mono,
  title,
  children,
}: {
  tone?: ChipTone;
  mono?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`${styles.chip} ${CHIP_CLASS[tone]} ${mono ? styles.chipMono : ""}`}
      title={title}
    >
      {children}
    </span>
  );
}
