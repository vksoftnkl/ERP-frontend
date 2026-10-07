"use client";

import type { CSSProperties } from "react";

import { BUILT_IN_TOKENS } from "../lib/token-catalogue";
import styles from "../page.module.scss";

type Props = {
  tokens: Record<string, string>;
};

const ROWS: ReadonlyArray<readonly [string, string]> = [
  ["Soap 100g", "38.00"],
  ["Rice 1kg", "62.00"],
  ["Oil 1L", "145.00"],
  ["Salt", "22.00"],
];

const BADGES: ReadonlyArray<readonly [string, string, string]> = [
  ["REFUSED", "danger", "danger.bg"],
  ["WARN", "warning", "warning.bg"],
  ["POSTED", "success", "success.bg"],
  ["INFO", "info", "info.bg"],
];

/**
 * A menu bar, a title band, a button and its hover, a grid and four badges,
 * drawn from the colours being edited — what it shows is the unsaved palette,
 * not the look the app is wearing. The Qt card paints the same pieces.
 */
export default function PreviewCard({ tokens }: Props) {
  const c = (key: string) => tokens[key] ?? BUILT_IN_TOKENS[key];
  const box = (background: string, extra?: CSSProperties): CSSProperties => ({ background, ...extra });

  return (
    <div className={styles.previewCard} style={box(c("surface"), { borderColor: c("border") })}>
      <div className={styles.previewMenu} style={box(c("menu.bg"), { color: c("menu.fg") })}>
        <span>Sales</span>
        <span>Stock</span>
        <span>Accounts</span>
      </div>
      <div className={styles.previewTitle} style={box(c("title.bg"), { color: c("title.fg") })}>
        Sale Bill
      </div>
      <div className={styles.previewButtons}>
        <span className={styles.previewButton} style={box(c("primary"), { color: c("on.primary") })}>
          Save
        </span>
        <span
          className={styles.previewButton}
          style={box(c("primary.soft"), {
            color: c("primary"),
            border: `1px solid ${c("primary.soft.border")}`,
            fontWeight: 400,
          })}
        >
          hover
        </span>
      </div>
      <div className={styles.previewGrid} style={{ borderColor: c("border") }}>
        <div className={styles.previewGridRow} style={box(c("table.header.bg"), { color: c("table.header.fg"), fontWeight: 700 })}>
          <span>Item</span>
          <span>Price</span>
        </div>
        {ROWS.map(([item, price], index) => {
          const selected = index === 2;
          const background = selected ? c("table.selected") : index % 2 ? c("table.row.alt") : c("table.row");
          const color = selected ? c("table.selected.fg") : c("text");
          return (
            <div key={item} className={styles.previewGridRow} style={box(background, { color })}>
              <span>{item}</span>
              <span>{price}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.previewBadges}>
        {BADGES.map(([label, fg, bg]) => (
          <span key={label} className={styles.previewBadge} style={box(c(bg), { color: c(fg) })}>
            {label}
          </span>
        ))}
      </div>
      <p className={styles.previewNote} style={{ color: c("text.muted") }}>
        Drawn from the colours on the left, as you edit them. Preview (F9) shows them on the whole app until
        Revert, a save or leaving this screen puts the company&apos;s back.
      </p>
    </div>
  );
}
