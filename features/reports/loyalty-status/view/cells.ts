/**
 * What a grid cell reads like — the web form of Qt `LoyaltyStatusDelegate`.
 *
 * The view functions (members / statement / expiring / schemes) decide every
 * cell's text and tone here, as plain data, so the screen's look is asserted
 * in node; the grid component only paints it. A tone names a role, never a
 * colour: the stylesheet maps it (page.module.scss `.t*` / `.chip*`).
 */

export type Tone = "brand" | "green" | "amber" | "blue" | "red" | "teal" | "violet" | "grey" | "muted";

export type Cell = {
  text: string;
  /** Text colour; none = the grid's ink. */
  tone?: Tone | null;
  bold?: boolean;
  /** Paint the text as a pill of this tone (Qt `paintChip`). */
  chip?: Tone | null;
  /** A small figure at the cell's right end (Next expiry's "n pts"). */
  aside?: { text: string; tone?: Tone | null } | null;
  /** A pill after the text (In stock's LOW). */
  badge?: { text: string; tone: Tone } | null;
};

export type Column = {
  title: string;
  /** Minimum width in `u` (the report screens' fluid unit, ~15px). */
  min: number;
  /** Share of the spare width, for the text columns that may grow. */
  fr?: number;
  /** Right-aligned figures. */
  num?: boolean;
};

export const blank: Cell = { text: "" };

export function plain(text: string, extra: Omit<Cell, "text"> = {}): Cell {
  return { text, ...extra };
}

/**
 * The chip colours by word — Qt `LoyaltyStatusDelegate::chipColours`.
 * EXPIRE, CLOSED, DRAFT, LAPSED and anything new read grey.
 */
export function chipTone(word: string): Tone {
  const w = word.trim().toUpperCase();
  if (w === "ACTIVE" || w === "APPROVED" || w === "EARN" || w === "REDEEMABLE") return "green";
  if (w === "SUSPENDED" || w === "OPENING" || w === "COOLING") return "amber";
  if (w === "REDEEM" || w === "TRANSFER") return "blue";
  if (w === "GIFT") return "teal";
  if (w === "ADJUST" || w === "MERGED") return "violet";
  if (w === "DELETED" || w === "REVERSAL" || w === "LOW" || w === "BLOCKED") return "red";
  return "grey";
}

export function chip(word: string): Cell {
  return { text: word, chip: word ? chipTone(word) : null };
}
