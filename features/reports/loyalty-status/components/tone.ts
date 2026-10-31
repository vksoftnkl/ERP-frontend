/** A view tone → its class. Presentation only: the tones come from `view/*`. */
import styles from "../page.module.scss";
import type { Tone } from "../view/cells";
import type { BarTone } from "../view/expiring";

const TEXT: Record<Tone, string> = {
  brand: styles.tBrand,
  green: styles.tGreen,
  amber: styles.tAmber,
  blue: styles.tBlue,
  red: styles.tRed,
  teal: styles.tTeal,
  violet: styles.tViolet,
  grey: styles.tGrey,
  muted: styles.tMuted,
};

const CHIP: Partial<Record<Tone, string>> = {
  green: styles.cGreen,
  amber: styles.cAmber,
  blue: styles.cBlue,
  red: styles.cRed,
  teal: styles.cTeal,
  violet: styles.cViolet,
};

const BAR: Record<BarTone, string> = {
  red: styles.bRed,
  amber: styles.bAmber,
  brand: styles.bBrand,
  faint: styles.bFaint,
  off: styles.bOff,
  green: styles.bGreen,
  blue: styles.bBlue,
  grey: styles.bGrey,
};

export function toneClass(tone: Tone | null | undefined): string | undefined {
  return tone ? TEXT[tone] : undefined;
}

/** Grey (and anything unnamed) is the plain chip. */
export function chipClass(tone: Tone | null | undefined): string {
  const extra = tone ? CHIP[tone] : undefined;
  return extra ? `${styles.chip} ${extra}` : styles.chip;
}

export function barClass(tone: BarTone): string {
  return `${styles.bar} ${BAR[tone]}`;
}

/** The legend's key: the series colour, without the bar's geometry. */
export function swatchClass(tone: BarTone): string {
  return `${styles.swatch} ${BAR[tone]}`;
}
