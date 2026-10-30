"use client";

/**
 * The parts every rebuilt purchase screen lays out the same way (Qt
 * `purchase/common/purchase_parts.*` + `invoice/purchase_invoice_parts.*`,
 * NexERP 2026-10-29, to the approved mockups share/purchase/purchase_*_ui_mockup.png).
 * Look = design-system tokens only. Props are listed in ../README.md.
 */
import type { ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import {
  purchaseIssueRows,
  purchaseStatusLabel,
  purchaseStatusTone,
  type PurchaseIssue,
  type PurchasePillTone,
} from "../purchase-parts";
import styles from "./purchase-parts.module.scss";

/** Qt tone words for a figure: "info" is the blue one (GST held, Replace qty due). */
export type PurchaseFigureTone = "good" | "warn" | "bad" | "muted" | "info";

const TONE_CLASS: Record<PurchasePillTone, string> = {
  neutral: styles["tone-neutral"],
  info: styles["tone-info"],
  success: styles["tone-success"],
  warning: styles["tone-warning"],
  danger: styles["tone-danger"],
};

const FIGURE_CLASS: Record<PurchaseFigureTone, string> = {
  good: styles["text-good"],
  warn: styles["text-warn"],
  bad: styles["text-bad"],
  muted: styles["text-muted"],
  info: styles["text-info"],
};

/** The class for a figure's tone — for grid cells outside these parts (Pending orange, …). */
export function purchaseFigureClass(tone: PurchaseFigureTone | null | undefined): string | undefined {
  return tone ? FIGURE_CLASS[tone] : undefined;
}

// ---------------------------------------------------------------------------

export type PurchaseSectionHeadingProps = {
  /** THE HEADER / THE LINES / CHARGES / TOTALS … */
  title: string;
  /** The grey mono hint after it ("as printed · batch / serial on the row …"). */
  hint?: string;
  /** Buttons on the right of the rule, if any. */
  actions?: ReactNode;
  className?: string;
};

/** Qt `PurchaseUi::sectionHeading`: title, grey hint, thin rule under. */
export function PurchaseSectionHeading({ title, hint, actions, className }: PurchaseSectionHeadingProps) {
  return (
    <div className={cx(styles.sectionHead, className)} data-purchase-section={title}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {hint ? <span className={styles.sectionHint}>{hint}</span> : null}
      {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export type PurchaseStatusPillProps = {
  /** The server's state word: DRAFT, POSTED, PART_RECEIVED, CANCELLED … */
  status: string | null | undefined;
  /** Text to show instead of the state ("POSTED · ON HOLD"). */
  label?: string;
  /** Force a tone (default from the state). */
  tone?: PurchasePillTone;
  title?: string;
  className?: string;
};

/** The coloured pill top-right of the title (mockups: DRAFT orange, PART RECEIVED blue). */
export function PurchaseStatusPill({ status, label, tone, title, className }: PurchaseStatusPillProps) {
  const text = label ?? purchaseStatusLabel(status);
  if (!text) return null;
  return (
    <span className={cx(styles.pill, TONE_CLASS[tone ?? purchaseStatusTone(status)], className)} title={title} data-purchase-status={status ?? ""}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------

export type PurchaseCheckChipProps = {
  text: string;
  tone?: PurchasePillTone;
  title?: string;
};

/** A small in-cell chip: OK / SHORT 2 / RATE +3.2% LAST / DONE / PART … */
export function PurchaseCheckChip({ text, tone = "neutral", title }: PurchaseCheckChipProps) {
  if (!text) return null;
  return (
    <span className={cx(styles.chip, TONE_CLASS[tone])} title={title}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------

export type PurchaseStripCell = {
  key: string;
  caption: string;
  /** Shown as is; "" / null shows "—" greyed. */
  value: string | null | undefined;
  tone?: PurchaseFigureTone;
  /** The big last figure (PO total). */
  strong?: boolean;
  /** The cell's tooltip (Qt `stripValue_<key>` setToolTip), e.g. how a figure is made up. */
  title?: string;
};

export type PurchaseTotalsStripProps = { cells: readonly PurchaseStripCell[]; className?: string };

/** Qt `PurchaseTotalsStrip`: one boxed row of cells, small grey caption over its figure. */
export function PurchaseTotalsStrip({ cells, className }: PurchaseTotalsStripProps) {
  return (
    <div className={cx(styles.strip, className)} data-purchase-strip="">
      {cells.map((cell) => {
        const empty = cell.value === null || cell.value === undefined || cell.value === "";
        return (
          <div key={cell.key} className={styles.stripCell} data-strip-cell={cell.key} title={cell.title || undefined}>
            <span className={styles.stripCap}>{cell.caption}</span>
            <span
              className={cx(
                styles.stripValue,
                cell.strong && styles.stripValueStrong,
                empty ? FIGURE_CLASS.muted : cell.tone && FIGURE_CLASS[cell.tone],
              )}
            >
              {empty ? "—" : cell.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

export type PurchasePanelRow = {
  key: string;
  caption: string;
  /** Text, or a node (the Supplier TCS input). */
  value: ReactNode;
  tone?: PurchaseFigureTone;
  strong?: boolean;
  /** Draw a thin rule above this row (the panel's second block). */
  ruleBefore?: boolean;
};

export type PurchaseTotalsPanelProps = { rows: readonly PurchasePanelRow[]; className?: string };

/** Qt `PurchaseTotalsPanel`: the boxed TOTALS, one row per figure, right-aligned. */
export function PurchaseTotalsPanel({ rows, className }: PurchaseTotalsPanelProps) {
  return (
    <div className={cx(styles.panel, className)} data-purchase-totals="">
      {rows.map((row) => {
        const empty = row.value === null || row.value === undefined || row.value === "";
        const valueClass = cx(styles.panelValue, row.strong && styles.panelStrong, empty ? FIGURE_CLASS.muted : row.tone && FIGURE_CLASS[row.tone]);
        return (
          <PanelRow key={row.key} row={row} valueClass={valueClass} />
        );
      })}
    </div>
  );
}

function PanelRow({ row, valueClass }: { row: PurchasePanelRow; valueClass: string }) {
  return (
    <>
      {row.ruleBefore ? <span className={styles.panelRule} aria-hidden /> : null}
      <span className={cx(styles.panelCap, row.strong && styles.panelStrong)}>{row.caption}</span>
      <span className={valueClass} data-total={row.key}>
        {row.value === null || row.value === undefined || row.value === "" ? "—" : row.value}
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------

export type PurchaseWarnStripProps = {
  /** `warnings[]` of /validate or /save. */
  warnings?: readonly PurchaseIssue[] | null;
  /** `refusals[]` — or a 422's `errors[]` (no level: a refusal). */
  refusals?: readonly PurchaseIssue[] | null;
  /** The Override right on the screen's menu (24 invoice, 196 GRN). */
  overrideAllowed: boolean;
  overrideTicked: boolean;
  onOverrideChange: (ticked: boolean) => void;
  /** Tooltip with the right / without it ("ask a supervisor …"). */
  hintAllowed?: string;
  hintNoRight?: string;
  /** Hide the tick (a screen with nothing to override, e.g. the PO). */
  noOverride?: boolean;
  className?: string;
};

const HINT_ALLOWED =
  "Post past the warnings that need a right (rate above the PO: no payment hold). The reason is kept on the document's trail.";

/**
 * Qt `PurchaseWarnStrip`: the yellow strip over the buttons, one row per server
 * issue (pill, code without PUR_, the server's sentence) and the
 * "override (logged)" tick. Nothing to say → renders nothing. The tick is
 * enabled only with the right AND a WARN that needs it; without the right it
 * stays greyed and its tooltip says who can.
 */
export function PurchaseWarnStrip({
  warnings,
  refusals,
  overrideAllowed,
  overrideTicked,
  onOverrideChange,
  hintAllowed = HINT_ALLOWED,
  hintNoRight,
  noOverride,
  className,
}: PurchaseWarnStripProps) {
  const summary = purchaseIssueRows(warnings, refusals);
  if (summary.rows.length === 0) return null;
  const enabled = overrideAllowed && summary.overridable > 0;
  return (
    <div className={cx(styles.warnStrip, className)} role="status" data-purchase-warn-strip="">
      <div className={styles.warnRows}>
        {summary.rows.map((row) => (
          <div key={row.key} className={styles.warnRow} data-issue-code={row.code} data-issue-level={row.refuse ? "REFUSE" : "WARN"}>
            <span className={cx(styles.pill, TONE_CLASS[row.refuse ? "danger" : "warning"])}>{row.refuse ? "REFUSE" : "WARN"}</span>
            <span className={cx(styles.warnCode, FIGURE_CLASS[row.refuse ? "bad" : "warn"])} title={row.code}>
              {row.shortCode}
            </span>
            <span className={styles.warnText}>{row.message}</span>
          </div>
        ))}
      </div>
      {noOverride ? null : (
        <label className={styles.override} title={overrideAllowed || !hintNoRight ? hintAllowed : hintNoRight}>
          <input
            type="checkbox"
            tabIndex={-1}
            disabled={!enabled}
            checked={enabled && overrideTicked}
            onChange={(event) => onOverrideChange(event.target.checked)}
          />
          override (logged)
        </label>
      )}
    </div>
  );
}

/** Whether the tick really counts (Qt `overrideTicked`: enabled AND ticked). */
export function purchaseOverrideActive(
  warnings: readonly PurchaseIssue[] | null | undefined,
  refusals: readonly PurchaseIssue[] | null | undefined,
  overrideAllowed: boolean,
  overrideTicked: boolean,
): boolean {
  return overrideAllowed && overrideTicked && purchaseIssueRows(warnings, refusals).overridable > 0;
}

// ---------------------------------------------------------------------------

export type PurchaseMoreColumn = {
  key: string;
  label: string;
  /** Shown but not pickable (Qt: the column is not registered on the ui_table yet). */
  disabled?: boolean;
  title?: string;
};

export type PurchaseMoreColumnsProps = {
  columns: readonly PurchaseMoreColumn[];
  /** Keys shown now. */
  shown: readonly string[];
  onToggle: (key: string) => void;
  /** Caption before the chips. */
  caption?: string;
  className?: string;
};

/** The "More columns" chooser row under the lines (mockup callout 10). Saved per user by the screen (`readMoreColumns`). */
export function PurchaseMoreColumns({
  columns,
  shown,
  onToggle,
  caption = "More columns (column chooser, saved per user):",
  className,
}: PurchaseMoreColumnsProps) {
  if (columns.length === 0) return null;
  return (
    <div className={cx(styles.more, className)} data-purchase-more-columns="">
      <span>{caption}</span>
      {columns.map((column) => {
        const on = shown.includes(column.key);
        return (
          <button
            key={column.key}
            type="button"
            tabIndex={-1}
            aria-pressed={on}
            disabled={column.disabled}
            title={column.title}
            className={cx(styles.moreChip, on && !column.disabled && styles.moreChipOn)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onToggle(column.key)}
          >
            {column.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

export type PurchasePickerBoxProps = {
  id: string;
  /** The choice as one line ("—" when none). */
  text: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  /** ▾ click, F4, Alt+↓, Space: open the picker. */
  onPick: () => void;
  /** Delete / Backspace: clear the choice (omit = cannot be cleared). */
  onClear?: () => void;
  className?: string;
};

/**
 * Qt `PurchasePickerCombo`: a box that drops no list — its ▾ (click, F4,
 * Alt+↓, Space) runs a picker (Agent: grid 194; Source: From GRN / PO;
 * Transport: its popup). It stays in the header's Enter walk
 * (`data-quotation-focus`); typing does nothing.
 */
export function PurchasePickerBox({ id, text, disabled, placeholder, title, onPick, onClear, className }: PurchasePickerBoxProps) {
  return (
    <span className={cx(styles.pickerBox, className)}>
      <input
        id={id}
        className={styles.input}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        title={title}
        autoComplete="off"
        data-quotation-focus={id}
        onChange={() => undefined}
        onClick={() => !disabled && onPick()}
        onKeyDown={(event) => {
          if (disabled) return;
          const bare = !event.ctrlKey && !event.metaKey && !event.shiftKey;
          if ((bare && !event.altKey && (event.key === "F4" || event.key === " ")) || (event.altKey && event.key === "ArrowDown")) {
            event.preventDefault();
            onPick();
          } else if (bare && !event.altKey && (event.key === "Delete" || event.key === "Backspace")) {
            event.preventDefault();
            onClear?.();
          } else if (event.key.length === 1 && bare && !event.altKey) {
            event.preventDefault();
          }
        }}
      />
      <button type="button" tabIndex={-1} className={styles.pickerButton} disabled={disabled} aria-label="Pick" onMouseDown={(event) => event.preventDefault()} onClick={onPick}>
        ▾
      </button>
    </span>
  );
}
