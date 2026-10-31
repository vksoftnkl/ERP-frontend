/**
 * "How to fill this" under each grid — Qt's `lblHelptbl*` labels, word for word.
 */
import type { ReactNode } from "react";
import type { GridName } from "../promotion-schemes.state";
import styles from "../page.module.scss";

function Example({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line) => (
        <code key={line} className={styles.helpExample}>
          {line}
        </code>
      ))}
    </>
  );
}

const HELP: Record<GridName, ReactNode> = {
  branches: (
    <>
      <b>How to fill this</b>
      <br />
      One row per branch. Set <b>Exclude</b> only when you mean &quot;everywhere but here&quot;.
      <br />
      <br />
      <b>Example — every branch except two:</b>
      <Example lines={["Chennai   Exclude Y", "Madurai   Exclude Y"]} />
      Two rows, not thirty-eight — an <b>Exclude</b> row always beats an include row for the same branch.
      <br />
      <br />
      Read only while <b>Branch scope</b> is LIST.
    </>
  ),
  parties: (
    <>
      <b>How to fill this</b>
      <br />
      Each row is a <b>Kind</b> and the <b>Target</b> it names; the Kind decides which master the Target picker
      searches. A promotion follows the geography, so AREA and CITY are offered here as well as customers and groups.
      <br />
      <br />
      <b>Example — 10% across one city, but not for one bad payer:</b>
      <Example
        lines={[
          "CITY          Coimbatore  Exclude –  Priority 0",
          "CUSTOMER GROUP  Members      Exclude –  Priority 1",
          "CUSTOMER      R. Kumar    Exclude Y  Priority 9",
        ]}
      />
      <b>Priority</b> settles a customer matched by two rows — the higher number wins, so name the customer more
      strongly than their city.
      <br />
      <br />
      Read only while <b>Customer scope</b> is LIST.
    </>
  ),
  items: (
    <>
      <b>How to fill this</b>
      <br />
      Each row is a <b>Kind</b> (ITEM, GROUP, CATEGORY, BRAND or SECTION) and the <b>Target</b> it names. Leave the
      discount trio at 0 in the normal case — the band states the rate, and fifty items in scope do not mean fifty
      rates typed. Fill one only to <i>override</i> the band for these lines.
      <br />
      <br />
      <b>Example — 20% off own-brand, nothing on tobacco:</b>
      <Example
        lines={["BRAND    Nex Fresh  Disc% 20  Exclude –  Priority 3", "CATEGORY Tobacco    Disc%  0  Exclude Y  Priority 2"]}
      />
      <b>Most specific wins:</b> ITEM 4, BRAND 3, CATEGORY 2, SECTION 1, GROUP 0 is the usual order, and it is data —
      reorder it to suit the shop. An <b>Exclude</b> row kills the line however broad the rule above it.{" "}
      <b>Factor</b> only means anything on a percentage or amount scheme, where it scales what the band computed;{" "}
      <b>Max benefit</b> caps one line (0 = uncapped). A <b>Unit</b> may be set on ITEM rows only.
      <br />
      <br />
      Read only while <b>Item scope</b> is LIST.
    </>
  ),
  slabs: (
    <>
      <b>How to fill this</b>
      <br />
      One row is one offer band: <i>when the measured value falls between</i> <b>Exceeds</b> <i>and</i>{" "}
      <b>Upto</b>
      <i>, give the benefit</i>. The measured value is rupees when <b>Apply on</b> is an AMOUNT and quantity when it
      is a QTY. Bands are rows, not columns.
      <br />
      <br />
      <b>Example — the more they spend, the better the rate:</b>
      <Example lines={["Exceeds 0     Upto 999   Disc% 2", "Exceeds 999   Upto 4999  Disc% 5", "Exceeds 4999  Upto –     Disc% 8"]} />
      Leave <b>Upto</b> blank on the last row for an open-ended top band. <b>Repeat</b> gives the benefit once per{" "}
      <b>Each</b> above Exceeds instead of once in total, and <b>Max repeats</b> caps that (0 = unlimited).
      <br />
      <br />
      <b>Only the header&apos;s benefit may be typed here.</b> The band&apos;s benefit is locked to <b>Benefit</b> on
      the Scheme tab by a composite foreign key, so a percentage scheme physically cannot hold a free-item band.
      Changing the benefit on a scheme that already has bands is rejected — retype the bands first.
    </>
  ),
};

export function GridHelp({ grid }: { grid: GridName }) {
  return <div className={styles.gridHelp}>{HELP[grid]}</div>;
}
