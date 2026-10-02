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
 */
import { cx } from "@/components/design-system/cx";
import qs from "@/features/sales/quotation/page.module.scss";
import { BelowCostDialog } from "./components/below-cost-dialog";
import { BucketListDialog } from "./components/bucket-list-dialog";
import { FourNumberCard, RowCardView, SrcLegendCard } from "./components/cards";
import { FilterDialog } from "./components/filter-dialog";
import { ItemPicker } from "./components/item-picker";
import { PriceGrid } from "./components/price-grid";
import { useSellingPriceScreen } from "./use-selling-price-screen";
import styles from "./page.module.scss";

const BRANCH_TIP =
  "An edit lands on THIS branch's row. A chain-priced row gets a branch override; the chain row and every other branch are untouched.";
const CHAIN_TIP =
  "An edit lands on the CHAIN row: every branch without its own override moves at once. A row that already has a branch override updates the override.";

export default function ChangeSellingPricePage() {
  const screen = useSellingPriceScreen();
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
    four,
    fourTarget,
    onFourEdit,
    hint,
    loading,
    saveEnabled,
    saveTooltip,
    save,
    clearGrid,
    openFilterDialog,
    openBucketList,
    removeCurrentRow,
    close,
  } = screen;

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
            onClick={() => void onScopeClick("CHAIN")}
          >
            All branches
          </button>
        </div>
        <span className={styles.scopeNote}>
          All branches is an HQ action (403 otherwise) — a branch user&apos;s switch is fixed to This
          branch
        </span>
      </div>

      <div className={styles.filterStrip}>
        <span className={styles.filterSummary}>{summary}</span>
        <span className={styles.rowsHint}>rows: item × unit × live bucket</span>
      </div>

      <PriceGrid screen={screen} />

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
        <FourNumberCard four={four} target={fourTarget} onEdit={onFourEdit} />
        <RowCardView card={card} />
      </div>

      <div className={styles.hint} role="status" aria-live="polite">
        {hint}
      </div>

      <div className={styles.buttonBar}>
        <button
          type="button"
          className={qs.button}
          title="- (minus) on the grid — take the current row off the grid. Nothing is deleted."
          onClick={() => void removeCurrentRow()}
        >
          Remove row
        </button>
        <button
          type="button"
          className={qs.button}
          title="F12 — every live price row of the current item, chain and branch."
          onClick={() => void openBucketList()}
        >
          Bucket list<span className={qs.buttonHint}>F12</span>
        </button>
        <button
          type="button"
          className={qs.button}
          title="F7 — empty the grid."
          onClick={() => void clearGrid()}
        >
          Clear<span className={qs.buttonHint}>F7</span>
        </button>
        <button
          type="button"
          className={qs.button}
          disabled={loading}
          title="F8 — filter the items Load brings (group, category, brand, section, supplier, tracked as, tax, contains, active)."
          onClick={openFilterDialog}
        >
          Filter<span className={qs.buttonHint}>F8</span>
        </button>
        <button
          type="button"
          className={cx(qs.button, qs.buttonPrimary)}
          disabled={!saveEnabled}
          title={saveTooltip}
          onClick={save}
        >
          Save<span className={qs.buttonHint}>F5</span>
        </button>
        <button type="button" className={qs.button} onClick={() => void close()}>
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
