"use client";

/**
 * The chip colours, and what each one MEANS — not what it looks like.
 *
 *   green   the party HOLDS this            CREDIT · ADVANCE · CR NOTE · OPEN
 *   amber   look at it                      PARTIAL · PDC · SEEDED · DRAFT
 *   red     it is gone or overdue           CANCELLED · OVERDUE
 *   blue    the system derived it           POSTED · numbered
 *   grey    unrecognised                    anything else, shown verbatim
 *
 * An unknown value is shown AS IT ARRIVED rather than mapped to a default: the
 * server's vocabularies grow, and a chip that silently paints a new status as
 * "OPEN" is worse than one that admits it does not know the word.
 */
import styles from "../page.module.scss";

export type ChipTone = "amber" | "blue" | "green" | "grey" | "red";

const TONES: Record<string, ChipTone> = {
  CREDIT: "green",
  ADVANCE: "green",
  "CR NOTE": "green",
  SALES_RETURN: "green",
  OPEN: "green",
  PARTIAL: "amber",
  PDC: "amber",
  SEEDED: "amber",
  DRAFT: "amber",
  OVERDUE: "red",
  CANCELLED: "red",
  POSTED: "blue",
  CLOSED: "grey",
};

/**
 * What a bill TYPE is called on a credit row.
 *
 * This matters more than it looks. Deepan's credit is
 * `abl_bill_type = 'OPENING'` — the same word as his nine DR bills — so both
 * sides showed "OPENING" with nothing to say which was owed and which was
 * held. A credit is chipped by what it IS to the party, never by its raw type.
 */
export function creditChipLabel(billType: string, srcDocType: string | null): string {
  const type = (billType ?? "").trim().toUpperCase();
  if (type === "ADVANCE") {
    return "ADVANCE";
  }
  if (type === "SALES_RETURN") {
    return "CR NOTE";
  }
  const source = (srcDocType ?? "").trim().toUpperCase();
  if (source.includes("RETURN") || source.includes("NOTE")) {
    return "CR NOTE";
  }
  return "CREDIT";
}

export function toneOf(value: string): ChipTone {
  return TONES[value.trim().toUpperCase()] ?? "grey";
}

export type ChipProps = {
  value: string | null | undefined;
  /** Overrides the derived label. */
  label?: string;
  tone?: ChipTone;
  title?: string;
};

export function Chip({ value, label, tone, title }: ChipProps) {
  const raw = (value ?? "").trim();
  if (!raw) {
    return null;
  }
  const resolved = tone ?? toneOf(raw);
  const toneClass = `chip${resolved[0].toUpperCase()}${resolved.slice(1)}` as keyof typeof styles;
  return (
    <span className={`${styles.chip} ${styles[toneClass]}`} title={title}>
      {label ?? raw.replace(/_/g, " ")}
    </span>
  );
}
