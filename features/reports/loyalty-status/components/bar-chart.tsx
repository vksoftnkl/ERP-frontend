"use client";
/**
 * The two small charts — Qt `LoyaltyBarChart`.
 *
 * Expiring soon: ONE series, a bar per week, each bar its own tone and its
 * value on top; a click on a week narrows the grid to it. Scheme summary:
 * THREE series a month (earned / redeemed + gift / expired) side by side,
 * with a legend line. No axis: the figures are in the grids and tiles beside
 * it, and every group carries its figures as a tooltip. A zero draws nothing.
 */
import styles from "../page.module.scss";
import { shortValue } from "../view/format";
import type { Bar, BarTone } from "../view/expiring";
import { barClass, swatchClass } from "./tone";

type Props = {
  bars: readonly Bar[];
  legend?: ReadonlyArray<{ name: string; tone: BarTone }>;
  showValues?: boolean;
  onBarClick?: (index: number) => void;
  emptyText?: string;
  ariaLabel: string;
};

export function BarChart({ bars, legend, showValues, onBarClick, emptyText = "", ariaLabel }: Props) {
  let max = 0;
  for (const bar of bars) for (const v of bar.values) max = Math.max(max, v);
  if (max <= 0) max = 1;

  return (
    <div className={styles.chart} role="figure" aria-label={ariaLabel}>
      {legend && legend.length > 1 ? (
        <div className={styles.chartLegend}>
          {legend.map((item) => (
            <span key={item.name} className={styles.legendItem}>
              <span className={swatchClass(item.tone)} aria-hidden="true" />
              {item.name}
            </span>
          ))}
        </div>
      ) : null}
      {bars.length === 0 ? (
        <div className={styles.chartEmpty}>{emptyText}</div>
      ) : (
        <>
          <div className={styles.plot}>
            {bars.map((bar, g) => {
              const content = bar.values.map((v, k) => {
                const tone = bar.tones[k] ?? "grey";
                return (
                  <span key={k} className={styles.barSlot}>
                    {showValues && v > 0 ? <span className={styles.barValue}>{shortValue(v)}</span> : null}
                    {v > 0 ? <span className={barClass(tone)} style={{ height: `${(v / max) * 82}%` }} /> : null}
                  </span>
                );
              });
              return onBarClick ? (
                <button
                  key={`${bar.label}-${g}`}
                  type="button"
                  tabIndex={-1}
                  className={styles.group}
                  title={bar.title}
                  aria-label={bar.title}
                  onClick={() => onBarClick(g)}
                >
                  {content}
                </button>
              ) : (
                <div key={`${bar.label}-${g}`} className={styles.group} title={bar.title}>
                  {content}
                </div>
              );
            })}
          </div>
          <div className={styles.labels} aria-hidden="true">
            {bars.map((bar, g) => (
              <span key={`${bar.label}-${g}`}>{bar.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
