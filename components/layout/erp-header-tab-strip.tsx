"use client";
import { useCallback } from "react";
import styles from "./erp-header.module.css";
import { ARIA_LABELS } from "./constants";
import { MenuTree } from "./erp-header-menu";
import type { TabStripProps } from "./types";

export function TabStrip({
  quickTabs,
  billNumber,
  onBillNumberChange,
  billPlaceholder,
  onNavigate,
  onMenuClose,
  quickTabsRef,
}: TabStripProps) {
  const handleBillNumberChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onBillNumberChange?.(event.target.value);
    },
    [onBillNumberChange],
  );
  return (
    <section className={styles.tabStrip}>
      <div ref={quickTabsRef} className={styles.quickTabs}>
        <MenuTree
          items={quickTabs}
          rootListClassName={styles.quickTabsList}
          rootLinkClassName={styles.quickTab}
          onNavigate={onNavigate}
          onMenuClose={onMenuClose}
        />
      </div>
      <input
        className={styles.billInput}
        type="text"
        autoComplete="off"
        placeholder={billPlaceholder}
        aria-label={ARIA_LABELS.BILL_INPUT}
        value={billNumber}
        onChange={handleBillNumberChange}
      />
    </section>
  );
}
