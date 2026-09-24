"use client";

/**
 * Three things the operator has to be told about the set as a whole, stacked in
 * one area above the grid.
 *
 * None of them stops a save. Each of them changes what the trial balance below
 * actually means, which is why they are permanent text on the screen rather
 * than a popup that is dismissed once and forgotten.
 */
import Link from "next/link";
import type { LedgerRow } from "../opening-balance.types";
import styles from "../page.module.scss";

export type BannersProps = {
  /** Ledgers under a group with NO nature: not listed, and not in the totals. */
  unclassified: readonly string[];
  rows: readonly LedgerRow[];
  /** True under "All branches" — the company-level set. */
  companyLevel: boolean;
};

const NAMES_SHOWN = 6;

function names(values: readonly string[]): string {
  if (values.length <= NAMES_SHOWN) {
    return values.join(", ");
  }
  return `${values.slice(0, NAMES_SHOWN).join(", ")} and ${values.length - NAMES_SHOWN} more`;
}

export function Banners({ unclassified, rows, companyLevel }: BannersProps) {
  const stale = rows.filter((row) => row.isStale);
  const billWise = rows.filter((row) => row.ledId !== "" && row.isBillWise);

  if (unclassified.length === 0 && stale.length === 0 && !(companyLevel && billWise.length > 0)) {
    return null;
  }

  return (
    <div className={styles.banners}>
      {unclassified.length > 0 ? (
        <p className={styles.bannerWarn}>
          <strong>{unclassified.length} ledger(s)</strong> are under a group with no nature and are
          NOT listed or counted: {names(unclassified)}. Give their group a nature in the{" "}
          <Link className={styles.bannerLink} href="/master/account-ledger-groups-master">
            Ledger Group master
          </Link>{" "}
          — until then this trial balance is taken over an incomplete chart.
        </p>
      ) : null}

      {stale.length > 0 ? (
        <p className={styles.bannerWarn}>
          <strong>{stale.length} row(s)</strong> are stale: {names(stale.map((row) => row.ledName))}.
          Something moved under them after the figure was derived. They are flagged, never silently
          corrected — the figure may already have been reported, so regenerate rather than overwrite.
          Each row&apos;s Stale chip gives the date and the reason.
        </p>
      ) : null}

      {companyLevel && billWise.length > 0 ? (
        <p className={styles.bannerInfo}>
          This is the company-level set. <strong>{billWise.length} party(ies)</strong> here open
          bill-by-bill, and a bill always has a branch (<code>abl_branch_id</code> is NOT NULL) — so
          they can only be opened under &ldquo;This branch&rdquo;, and their figures are not in these
          totals.
        </p>
      ) : null}
    </div>
  );
}
