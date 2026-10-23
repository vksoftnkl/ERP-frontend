"use client";

/**
 * Change Selling Price — Bulk. Menu 30; the Qt screen binds Ctrl+G.
 *
 * ONE price table: every grid row is a row of `inventory.item_price_master`
 * as the resolver answers it for this branch — a bucket (this item at THIS
 * MRP / sale price) or the headline. The screen edits the four price levels
 * and Min of any of them and saves the CHANGED rows in one
 * `POST /stock/price-bulk`.
 *
 * Src names the ROW, the switch decides where an edit LANDS:
 *   BUCKET·BR  this branch's own row       — Save updates it
 *   BUCKET·CH  the chain row (branch NULL) — This branch: Save creates the
 *                                            override; All branches: updates it
 *   MASTER     the headline (bucket NULL)  — Save updates it in place
 *   NEW        a bucket no row prices yet  — Save inserts it
 * The server decides from (switch, the row's loaded priceScope); this screen
 * echoes priceScope back unchanged and only EXPLAINS the outcome (the row card).
 *
 * Above MRP and below Min are red and keep Save off; below cost is amber and
 * the server decides (inventory.below_cost_price): restrict = 422, warning =
 * needsConfirm → "Price below cost" → re-post confirmed, allow = saved and
 * still reported. The toast NAMES the rows priced with no stock on hand.
 *
 * Notes 140 — "Price from" a later day SCHEDULES the new prices (Save reads
 * "Schedule"); today's stay on the shelf, and on the grid, till then. F9 lists
 * what is scheduled at this branch and cancels it. A level the company has not
 * switched on is not shown anywhere here. Under the grid, the profit line says
 * what the current row's prices earn before tax (the item card's line).
 *
 * The cursor lives in the grid: no button takes the focus (each has its key),
 * Enter walks the prices, and Tab goes grid ⇄ Price from.
 *
 * Edits left unsaved when the operator went to another screen are kept in
 * screen memory (lib/screen-memory), and the screen then reopens on them.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import qs from "@/features/sales/quotation/page.module.scss";
import { screenMemory } from "@/lib/screen-memory";
import { BelowCostDialog } from "./components/below-cost-dialog";
import { BucketListDialog } from "./components/bucket-list-dialog";
import { ProfitLineView, RowCardView, SrcLegendCard } from "./components/cards";
import { FilterDialog } from "./components/filter-dialog";
import { ItemPicker } from "./components/item-picker";
import { PriceFromField } from "./components/price-from-field";
import { PriceGrid } from "./components/price-grid";
import { ScheduledPricesDialog } from "./components/scheduled-prices-dialog";
import { PRICE_FROM_INPUT_ID, SELLING_PRICE_MEMORY_KEY } from "./selling-price.constants";
import { useSellingPriceScope, useSellingPriceScreen } from "./use-selling-price-screen";
import styles from "./page.module.scss";

const BRANCH_TIP =
  "An edit lands on THIS branch's row. A chain-priced row gets a branch override; the chain row and every other branch are untouched.";
const CHAIN_TIP =
  "An edit lands on the CHAIN row: every branch without its own override moves at once. A row that already has a branch override updates the override.";

/**
 * No button takes the focus — not by Tab, not by a click (Qt, 2026-10-22: "the
 * cursor stays in the grid"). The click still lands; each button has its key.
 */
function keepFocus(event: ReactMouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

export default function ChangeSellingPricePage() {
  // Reopened on edits left here unsaved? Decided once, at mount: the business
  // context lives in the root layout, so on the way back it is already resolved.
  const tenant = useSellingPriceScope();
  const [resume] = useState(() => screenMemory.has(SELLING_PRICE_MEMORY_KEY, tenant));
  const memory = useMemo(() => ({ key: SELLING_PRICE_MEMORY_KEY, resume }), [resume]);
  const screen = useSellingPriceScreen({ memory });
  const {
    scope,
    isHq,
    userType,
    onScopeClick,
    subtitle,
    changedChip,
    summary,
    validation,
    card,
    profit,
    hint,
    loading,
    saving,
    saveEnabled,
    saveTooltip,
    save,
    clearGrid,
    openFilterDialog,
    openBucketList,
    openScheduled,
    close,
    finishResume,
    today,
    priceFrom,
    setPriceFrom,
    priceFromLine,
    scheduling,
    backToGrid,
  } = screen;

  // The restored edits are already on the grid; all that is left is to say so — once.
  const announceResume = useRef(resume && screen.resumed);
  useEffect(() => {
    if (!announceResume.current) {
      return;
    }
    announceResume.current = false;
    void finishResume();
  }, [finishResume]);

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Change Selling Price — Bulk</h1>
          <div className={styles.subtitle}>{subtitle}</div>
        </div>
        {changedChip ? <span className={styles.changedChip}>{changedChip}</span> : null}
      </header>

      <div className={styles.scopeRow}>
        <span className={styles.scopeCap}>Edit prices for</span>
        <div className={styles.scopeGroup} role="radiogroup" aria-label="Edit prices for">
          <button
            type="button"
            role="radio"
            aria-checked={scope === "BRANCH"}
            className={cx(styles.scopeButton, scope === "BRANCH" && styles.scopeButtonOn)}
            title={BRANCH_TIP}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() => void onScopeClick("BRANCH")}
          >
            This branch
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === "CHAIN"}
            className={cx(styles.scopeButton, scope === "CHAIN" && styles.scopeButtonOn)}
            disabled={!isHq}
            title={
              isHq
                ? CHAIN_TIP
                : `All branches is an HQ action. Your user type (${userType}) edits this branch's prices only.`
            }
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() => void onScopeClick("CHAIN")}
          >
            All branches
          </button>
        </div>
        <span className={styles.scopeNote}>
          All branches is an HQ action (403 otherwise) — a branch user&apos;s switch is fixed to This
          branch
        </span>
        <span className={styles.priceFrom}>
          <label className={styles.scopeCap} htmlFor={PRICE_FROM_INPUT_ID}>
            Price from
          </label>
          <PriceFromField
            value={priceFrom}
            today={today}
            disabled={saving}
            onChange={setPriceFrom}
            onLeave={backToGrid}
          />
          {priceFromLine ? <span className={styles.priceFromNote}>{priceFromLine}</span> : null}
        </span>
      </div>

      <div className={styles.filterStrip}>
        <span className={styles.filterSummary}>{summary}</span>
        <span className={styles.rowsHint}>rows: item × unit × live bucket</span>
      </div>

      <PriceGrid screen={screen} />

      <ProfitLineView line={profit} />

      {validation.text ? (
        <div
          className={cx(
            styles.validation,
            validation.tone === "red" ? styles.validationRed : styles.validationAmber,
          )}
          role="status"
        >
          {validation.text}
        </div>
      ) : null}

      <div className={styles.cards}>
        <SrcLegendCard />
        <RowCardView card={card} />
      </div>

      <div className={styles.hint} role="status" aria-live="polite">
        {hint}
      </div>

      {/* Remove row went in Qt 4ae6575: − on the grid does it. */}
      <div className={styles.buttonBar}>
        <button
          type="button"
          className={qs.button}
          title="F9 — prices saved to start on a later day; cancel one here."
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => void openScheduled()}
        >
          Scheduled<span className={qs.buttonHint}>F9</span>
        </button>
        <button
          type="button"
          className={qs.button}
          title="F12 — every live price row of the current item, chain and branch."
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => void openBucketList()}
        >
          Bucket list<span className={qs.buttonHint}>F12</span>
        </button>
        <button
          type="button"
          className={qs.button}
          title="F7 — empty the grid."
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => void clearGrid()}
        >
          Clear<span className={qs.buttonHint}>F7</span>
        </button>
        <button
          type="button"
          className={qs.button}
          disabled={loading}
          title="F8 — filter the items Load brings (group, category, brand, section, supplier, tracked as, tax, contains, active)."
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={openFilterDialog}
        >
          Filter<span className={qs.buttonHint}>F8</span>
        </button>
        <button
          type="button"
          className={cx(qs.button, qs.buttonPrimary)}
          disabled={!saveEnabled}
          title={saveTooltip}
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={save}
        >
          {scheduling ? "Schedule" : "Save"}
          <span className={qs.buttonHint}>F5</span>
        </button>
        <button
          type="button"
          className={qs.button}
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={() => void close()}
        >
          Close
        </button>
      </div>

      {screen.filterOpen ? (
        <FilterDialog
          current={screen.filter}
          onCancel={screen.closeFilterDialog}
          onApply={screen.applyFilter}
        />
      ) : null}
      {screen.bucketDialog ? (
        <BucketListDialog
          itemName={screen.bucketDialog.itemName}
          rows={screen.bucketDialog.rows}
          levelShorts={screen.levelShorts}
          branchName={screen.branchName}
          selectedBucketId={screen.bucketDialog.selectedBucketId}
          onCancel={screen.closeBucketDialog}
          onPick={(row) => void screen.pickBucketRow(row)}
        />
      ) : null}
      {screen.belowCost ? (
        <BelowCostDialog
          lines={screen.belowCost.lines}
          policy={screen.belowCost.policy}
          onBack={screen.cancelBelowCost}
          onSaveAnyway={screen.confirmBelowCost}
        />
      ) : null}
      {screen.scheduled ? (
        <ScheduledPricesDialog
          rows={screen.scheduled}
          levelNames={screen.levelNames}
          levelActive={screen.levelActive}
          branchName={screen.branchName || "This branch"}
          canCancel={screen.canCancelSchedule}
          onClose={screen.closeScheduled}
        />
      ) : null}
      {screen.picker ? (
        <ItemPicker
          initialQuery={screen.picker.initialQuery}
          companyId={screen.companyId}
          branchId={screen.branchId}
          onClose={screen.closePicker}
          onPick={screen.onPickItem}
        />
      ) : null}
    </div>
  );
}
