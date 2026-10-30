"use client";

/**
 * The item strip under the lines (Qt `PurchaseItemStrip`, NexERP 8f2a1f4 /
 * e0c56ef, mockup callout 11): the item on the current line — its last
 * purchases from every supplier, the pending PO rate from this supplier, stock
 * here, the selling prices and MRP now, the supplier's own code and scheme.
 *
 * Read from `/purchase/lookup/item-context` through the screen's cache (per
 * item × unit × supplier; dropped whenever a bill is loaded or written), so the
 * line defaults and the scheme reuse the same answer. Nothing here is kept.
 */
import { useEffect, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { itemStripParts } from "../invoice-lines";
import type { InvoiceLine, PurchaseItemContext } from "../invoice.types";
import styles from "../page.module.scss";

export type ItemContextStripProps = {
  /** The current line — null / a blank line clears the strip. */
  line: InvoiceLine | null;
  supplierId: string;
  contextFor: (itemId: string, uomId: string) => Promise<PurchaseItemContext | null>;
  /** Bumped when the cache is dropped (after a save / post / cancel). */
  epoch: number;
};

type Answer = { key: string; context: PurchaseItemContext | null };

export function ItemContextStrip({ line, supplierId, contextFor, epoch }: ItemContextStripProps) {
  const itemId = line?.itemId ?? "";
  const uomId = line?.uomId ?? "";
  const key = itemId ? `${itemId}|${uomId}|${supplierId}|${epoch}` : "";
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!key) {
      return;
    }
    let active = true;
    void contextFor(itemId, uomId).then((context) => {
      if (active) {
        setAnswer({ key, context });
      }
    });
    return () => {
      active = false;
    };
  }, [contextFor, itemId, key, uomId]);

  let content: string;
  let tone: "empty" | "plain" = "plain";
  if (!key) {
    content = "Item context — put the cursor on a line: last purchases, PO rate, stock, prices.";
    tone = "empty";
  } else if (!answer || answer.key !== key) {
    // The last answer stays readable while the next one is asked (Qt keeps it too).
    content = answer?.context ? stripText(answer.context) : "Item context — reading…";
    tone = answer?.context ? "plain" : "empty";
  } else if (!answer.context) {
    content = "Item context not available.";
    tone = "empty";
  } else {
    content = stripText(answer.context);
  }

  return (
    <p className={cx(styles.itemStrip, tone === "empty" && styles.itemStripEmpty)} role="status" aria-label="Item context">
      {content}
    </p>
  );
}

function stripText(context: PurchaseItemContext): string {
  const name = (context.itemName ?? "").trim();
  const parts = itemStripParts(context).join("   ");
  return name ? `${name} — ${parts}` : parts;
}
