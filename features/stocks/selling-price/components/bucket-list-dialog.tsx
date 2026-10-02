"use client";

/**
 * F12 — "Bucket list — <item>" (Qt `PriceBucketListDialog`).
 *
 * Every live price row of ONE item this branch can see: the headline first,
 * then by MRP and sale price, the chain row before this branch's override of
 * the same bucket — and every stock bucket with no row of its own. The grid
 * shows only the row that WINS here; this list shows both, so the operator
 * sees what an edit hides. Picking a row loads it into the grid line and
 * resets that line's before-values.
 */
import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import qs from "@/features/sales/quotation/page.module.scss";
import { chipColours, LEVEL_COUNT, LEVEL_LETTERS } from "../selling-price.constants";
import { DASH, moneyText, stockText } from "../selling-price.display";
import { toNum, toNullableNum } from "../selling-price.math";
import { srcText } from "../selling-price.state";
import type { SellingPriceRow } from "../selling-price.types";
import styles from "../page.module.scss";

function moneyOrDash(value: number | null): string {
  return value === null || value <= 0 ? DASH : moneyText(value);
}

/** One list row's cells, as the Qt dialog fills them. */
export function bucketListCells(
  o: SellingPriceRow,
  branchName: string,
): {
  src: string;
  mrp: string;
  salePrice: string;
  onHand: string;
  cost: string;
  levels: string[];
  min: string;
  scope: string;
} {
  const mrp = toNullableNum(o.mrp);
  const salePrice = toNullableNum(o.salePrice);
  const bucketRow = mrp !== null || salePrice !== null;
  const source = String(o.priceSource ?? "");
  const scope = String(o.priceScope ?? "");
  const maxPrice = toNum(o.maxPrice);
  const levels: string[] = [];
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    let price = 0;
    for (const value of o.levels ?? []) {
      if (toNum(value?.level) === level + 1) price = toNum(value.price);
    }
    levels.push(moneyText(price));
  }
  return {
    // A bucket with stock but no row of its own answers MASTER with a
    // dimension set: the grid calls that NEW, and so does this list.
    src: srcText(source, scope, bucketRow && source === "MASTER"),
    // An unpriced stock bucket answers maxPrice 0 — its own MRP is the one to show.
    mrp: moneyOrDash(maxPrice > 0 ? maxPrice : mrp),
    salePrice: moneyOrDash(salePrice),
    onHand: bucketRow ? stockText(toNum(o.stockQty)) : DASH,
    cost: moneyText(toNum(o.costRate)),
    levels,
    min: moneyText(toNum(o.minPrice)),
    scope: scope === "BRANCH" ? branchName : "chain",
  };
}

export type BucketListDialogProps = {
  itemName: string;
  rows: readonly SellingPriceRow[];
  levelShorts: readonly string[];
  branchName: string;
  selectedBucketId: string;
  onCancel: () => void;
  onPick: (row: SellingPriceRow) => void;
};

/** Mounted only while open, on the list the screen fetched for it. */
export function BucketListDialog(props: BucketListDialogProps) {
  const { itemName, rows, levelShorts, branchName, selectedBucketId, onCancel, onPick } = props;
  // Pre-selects the grid line's own row (its ipm_id); else the headline at the top.
  const [active, setActive] = useState(() => {
    const preselected = selectedBucketId
      ? rows.findIndex((row) => (row.bucketId ?? "") === selectedBucketId)
      : -1;
    return preselected >= 0 ? preselected : 0;
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => viewportRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    viewportRef.current
      ?.querySelector<HTMLTableRowElement>(`tr[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const accept = (index: number) => {
    const row = rows[index];
    if (row) {
      onPick(row);
    }
  };

  return (
    <ModalShell
      title={`Bucket list — ${itemName} · F12`}
      isOpen
      wide
      onClose={onCancel}
      footer={
        <div className={styles.dialogButtons}>
          <span className={styles.dialogButtonsSpacer} />
          <button type="button" className={qs.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${qs.button} ${qs.buttonPrimary}`}
            disabled={rows.length === 0}
            onClick={() => accept(active)}
          >
            Use this row
          </button>
        </div>
      }
    >
      <p className={styles.dlgMuted}>
        every live price row of this item at this branch, headline first · Enter picks, no default
        button
      </p>
      <div
        ref={viewportRef}
        className={styles.dlgViewport}
        tabIndex={0}
        role="listbox"
        aria-label="Price rows"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Home") {
            event.preventDefault();
            setActive(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setActive(Math.max(rows.length - 1, 0));
          } else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            accept(active);
          }
        }}
      >
        <table className={styles.dlgTable}>
          <thead>
            <tr>
              <th scope="col">Src</th>
              <th scope="col">MRP</th>
              <th scope="col">Sale Px</th>
              <th scope="col">On hand</th>
              <th scope="col">Cost</th>
              {LEVEL_LETTERS.map((letter, level) => (
                <th key={letter} scope="col">
                  {levelShorts[level] || letter}
                </th>
              ))}
              <th scope="col">Min</th>
              <th scope="col">Scope</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const cells = bucketListCells(row, branchName);
              const colours = chipColours(cells.src);
              return (
                <tr
                  key={`${row.bucketId ?? "none"}-${row.uomId}-${index}`}
                  data-index={index}
                  data-selected={index === active ? "true" : undefined}
                  aria-selected={index === active}
                  onClick={() => setActive(index)}
                  onDoubleClick={() => accept(index)}
                >
                  <td style={{ textAlign: "center", color: colours.fg, background: colours.bg, fontWeight: 700 }}>
                    {cells.src}
                  </td>
                  <td style={{ textAlign: "right" }}>{cells.mrp}</td>
                  <td style={{ textAlign: "right" }}>{cells.salePrice}</td>
                  <td style={{ textAlign: "right" }}>{cells.onHand}</td>
                  <td style={{ textAlign: "right" }}>{cells.cost}</td>
                  {cells.levels.map((text, level) => (
                    <td key={LEVEL_LETTERS[level]} style={{ textAlign: "right" }}>
                      {text}
                    </td>
                  ))}
                  <td style={{ textAlign: "right" }}>{cells.min}</td>
                  <td>{cells.scope}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7 + LEVEL_COUNT} className={styles.emptyGrid}>
                  No price row for this item at this branch.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className={styles.dlgMuted}>
        The grid shows only the row that WINS at this branch; this list shows the chain row it hides
        too. The headline (MASTER) is at the top — it is what stock with no bucket row sells at.
      </p>
      <p className={styles.dlgNote}>
        Picking a row loads it into the grid line and resets that line&apos;s before-values, so the
        delta chips measure against THIS row. On hand is per bucket, summed over the branch&apos;s
        godowns.
      </p>
    </ModalShell>
  );
}
