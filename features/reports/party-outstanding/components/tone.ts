/** A view tone → its class. Presentation only: the tones come from `view/cells.ts`. */
import styles from "../page.module.scss";
import type { Tone } from "../view/cells";

export function toneClass(tone: Tone | "teal" | null | undefined): string | undefined {
  switch (tone) {
    case "accent":
      return styles.tAccent;
    case "credit":
      return styles.tCredit;
    case "danger":
      return styles.tDanger;
    case "amber":
      return styles.tAmber;
    case "orange":
      return styles.tOrange;
    case "info":
    case "sales":
      return styles.tInfo;
    case "teal":
      return styles.tTeal;
    case "muted":
      return styles.tMuted;
    default:
      return undefined;
  }
}

export function chipClass(tone: Tone | null | undefined): string {
  switch (tone) {
    case "danger":
      return `${styles.chip} ${styles.chipDanger}`;
    case "credit":
      return `${styles.chip} ${styles.chipCredit}`;
    case "amber":
      return `${styles.chip} ${styles.chipAmber}`;
    case "orange":
      return `${styles.chip} ${styles.chipOrange}`;
    case "sales":
      return `${styles.chip} ${styles.chipSales}`;
    case "purchase":
      return `${styles.chip} ${styles.chipPurchase}`;
    case "info":
      return `${styles.chip} ${styles.chipInfo}`;
    default:
      return styles.chip;
  }
}
