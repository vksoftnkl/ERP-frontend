/**
 * Column templates for the div grids. Widths are in `u` (the fluid unit), so
 * a column grows with the font. Every bucket column shares ONE width, so a
 * change in the number of buckets never scrambles the others (plan §8.1).
 */

export type Col = { min: number; fr?: number };

const U = "var(--erp-q-u, 1rem)";

export function template(cols: readonly Col[]): string {
  return cols
    .map((col) => (col.fr ? `minmax(calc(${col.min} * ${U}), ${col.fr}fr)` : `calc(${col.min} * ${U})`))
    .join(" ");
}

/** The table is never narrower than its columns: past that, it scrolls sideways. */
export function minWidth(cols: readonly Col[]): string {
  const total = cols.reduce((sum, col) => sum + col.min, 0);
  return `max(100%, calc(${total.toFixed(2)} * ${U}))`;
}

export const BUCKET_COL: Col = { min: 6.6 };

/** caret · Party · Area · Cr days · Bills · Pending · On-acct · Net · buckets… · Overdue · Oldest · PDC */
export function partyColumns(bucketCount: number): Col[] {
  return [
    { min: 1.4 },
    { min: 13, fr: 2.4 },
    { min: 5.2, fr: 0.8 },
    { min: 3.8 },
    { min: 3.4 },
    { min: 7.4 },
    { min: 6.6 },
    { min: 8.4 },
    ...Array.from({ length: bucketCount }, () => BUCKET_COL),
    { min: 7.4 },
    { min: 4.2 },
    { min: 6.6 },
  ];
}

/** Date · Type · Bill no · Branch · Due · Bill amt · Adjusted · Pending · Age · Overdue · Remarks */
export const BILL_COLUMNS: Col[] = [
  { min: 5.6 },
  { min: 6.2 },
  { min: 6.4, fr: 0.6 },
  { min: 5.6, fr: 0.5 },
  { min: 5.8 },
  { min: 6.6 },
  { min: 6.2 },
  { min: 7.6 },
  { min: 3.2 },
  { min: 4.2 },
  { min: 9, fr: 1.4 },
];

/** Party · Area · then the bills columns. */
export const BILL_WISE_COLUMNS: Col[] = [{ min: 11, fr: 1.6 }, { min: 5.2, fr: 0.5 }, ...BILL_COLUMNS];
