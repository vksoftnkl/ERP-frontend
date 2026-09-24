"use client";

/**
 * Status and due-bucket pills: operator words, colour keyed off the raw
 * value. The label map lives in `domain/bucket.ts`; this only draws it.
 */
import { bucketPill, statusPill, type Tone } from "../domain/bucket";
import type { ChequeStatus, DueBucket } from "../domain/types";
import styles from "../cheques.module.scss";

const TONE_CLASS: Record<Tone, string> = {
  amber: styles.pillAmber,
  blue: styles.pillBlue,
  red: styles.pillRed,
  green: styles.pillGreen,
  grey: styles.pillGrey,
  slate: styles.pillSlate,
};

export function StatusPill({ status }: { status: ChequeStatus }) {
  const pill = statusPill(status);
  return (
    <span
      className={`${styles.pill} ${TONE_CLASS[pill.tone]} ${pill.dimmed ? styles.pillDimmed : ""}`}
      title={String(status)}
    >
      {pill.label}
    </span>
  );
}

export function BucketPill({ bucket }: { bucket: DueBucket | null }) {
  const pill = bucketPill(bucket);
  if (!pill) {
    return null;
  }
  return (
    <span className={`${styles.pill} ${TONE_CLASS[pill.tone]}`} title={pill.hint}>
      {pill.label}
    </span>
  );
}
