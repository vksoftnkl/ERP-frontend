/**
 * The party card's ageing: labels + amounts from the server, one bar each.
 *
 * `Number()` here sizes a BAR and nothing else (plan §4.2): the figure printed
 * beside it is the server's string. An amount of zero prints "—" over an
 * empty track.
 */
import styles from "../page.module.scss";
import { formatAmount, isZeroAmount } from "@/features/reports/shared/wire/money";
import { bucketTone } from "../view/cells";

const FILL: Record<string, string> = {
  none: "#e8b4b4",
  amber: "#b26b00",
  orange: "#c2410c",
  danger: "#b42318",
};

function fillFor(index: number): string {
  if (index === 0) return FILL.none;
  if (index === 1) return "#c97070";
  return FILL[bucketTone(index) ?? "none"] ?? FILL.none;
}

export function AgeingBars({ labels, amounts }: { labels: readonly string[]; amounts: readonly string[] }) {
  // Bar width only. Never summed, never printed.
  const widths = amounts.map((amount) => Math.max(0, Number(amount)) || 0);
  const max = Math.max(0, ...widths);
  return (
    <div className={styles.ageing}>
      {labels.map((label, i) => {
        const amount = amounts[i] ?? "0.00";
        const zero = isZeroAmount(amount);
        return (
          <div key={label} style={{ display: "contents" }}>
            <span className={styles.ageLabel}>{label}</span>
            <span className={styles.ageTrack}>
              {!zero && max > 0 ? (
                <span
                  className={styles.ageFill}
                  style={{ width: `${(widths[i] / max) * 100}%`, background: fillFor(i) }}
                />
              ) : null}
            </span>
            <span className={styles.ageAmount}>{zero ? "—" : formatAmount(amount)}</span>
          </div>
        );
      })}
    </div>
  );
}
