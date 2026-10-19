"use client";

/**
 * Textile Tags — the screen (Qt NexERP 3b5069d, mockup REV 3,
 * share/schema/stock/textile/textile_tag_ui_mockup_rev3.png).
 *
 * Textile shops keep GENERIC items ("Silk Saree", "Shirt"). Each purchase
 * line gets a TAG: an automatic barcode on a label carrying brand, size,
 * colour, fabric, season, model, MRP and the selling price. The barcode is
 * the lot's batch no, so the engine sees an ordinary batch; the price lives
 * on the tag only, the cost stays on the lot.
 *
 * Five tabs. Built so far — server step B-1 (notes 136):
 *   New tags  key the lines (or a size grid), reserve the barcodes.
 * Waiting for the server (each tab says which step):
 *   Register, Markdown (B-2 grids + price / hold / print), Markup and
 *   Series (B-1 save routes; their lists are B-2 grids).
 *
 * No menu row yet, so the route is reached by its address and is ungoverned
 * (every right granted) until the menu names it.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { TextileTagsEntry } from "./components/textile-tags-entry";
import { WaitingTab, type WaitingTabKey } from "./components/waiting-tab";
import styles from "./page.module.scss";

type TabKey = WaitingTabKey | "new";

const TABS: readonly { key: TabKey; label: string; hint: string }[] = [
  {
    key: "register",
    label: "Register",
    hint: "Every label issued — search, reprint, hold, void, find orphans and remnants",
  },
  {
    key: "new",
    label: "New tags",
    hint: "Key the lines (or a size grid), reserve numbers, print the labels — then post the Opening / Purchase that carries them",
  },
  {
    key: "markdown",
    label: "Markdown",
    hint: "Reprice tags — the lot and every posted bill stay as they are",
  },
  {
    key: "markup",
    label: "Markup",
    hint: "Selling price from cost — rules used to suggest Price on new tags",
  },
  {
    key: "series",
    label: "Series",
    hint: "One short code per device, assigned once by an admin — offline tills never collide",
  },
];

export default function TextileTagsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("new");
  const hint = TABS.find((candidate) => candidate.key === tab)?.hint ?? "";

  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }, [router]);

  return (
    <div className={cx(quotationStyles.page, styles.page)}>
      <header className={quotationStyles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={quotationStyles.title}>Textile Tags</h1>
          <span className={styles.tabHint}>{hint}</span>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Textile tags">
        {TABS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            role="tab"
            id={`textile-tab-${candidate.key}`}
            aria-selected={tab === candidate.key}
            aria-controls={`textile-panel-${candidate.key}`}
            className={cx(styles.tab, tab === candidate.key && styles.tabActive)}
            onClick={() => setTab(candidate.key)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {TABS.map((candidate) => (
        <div
          key={candidate.key}
          role="tabpanel"
          id={`textile-panel-${candidate.key}`}
          aria-labelledby={`textile-tab-${candidate.key}`}
          className={styles.tabPanel}
          hidden={tab !== candidate.key}
        >
          {candidate.key === "new" ? (
            // Mounted whichever tab is up: the lines keyed here survive a look
            // at the other tabs, as the Qt tab widget keeps them.
            <TextileTagsEntry active={tab === "new"} onClose={close} />
          ) : (
            <WaitingTab tab={candidate.key} />
          )}
        </div>
      ))}
    </div>
  );
}
