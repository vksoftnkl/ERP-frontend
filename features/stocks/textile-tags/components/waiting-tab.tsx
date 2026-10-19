"use client";

/**
 * The four tabs that wait for the server — what each needs from it, in the
 * words of notes 136 (`TextileTagEntry::setupTabs`).
 */
import type { ReactNode } from "react";
import styles from "../page.module.scss";

export type WaitingTabKey = "register" | "markdown" | "markup" | "series";

const WAITS: Record<WaitingTabKey, ReactNode> = {
  register: (
    <>
      <b>Register</b> — every tag issued: search, reprint, hold, void, orphans and remnants.
      <br />
      Waits for the server&apos;s step <b>B-2</b> (the tag register grid and the price / hold / print routes).
      Reserved tags are safe meanwhile: their barcodes are kept on the server.
    </>
  ),
  markdown: (
    <>
      <b>Markdown</b> — reprice tags; the lot and every posted bill stay as they are.
      <br />
      Waits for the server&apos;s step <b>B-2</b> (<code>/textile-tags/price</code> and the register grid it
      filters from).
    </>
  ),
  markup: (
    <>
      <b>Markup</b> — the rules that suggest a price from the cost on New tags.
      <br />
      The save route comes with step <b>B-1</b>; the rule list is a grid of step <b>B-2</b>. New tags already
      asks for the suggestion: a line priced by a rule shows <i>auto</i>.
    </>
  ),
  series: (
    <>
      <b>Series</b> — one short tag code per device, assigned once by an admin, so offline tills never collide.
      <br />
      The save route comes with step <b>B-1</b>; the device list is a grid of step <b>B-2</b>. Until a device
      has a code the server refuses its reserve: <i>This counter cannot print tags yet.</i>
    </>
  ),
};

export function WaitingTab({ tab }: { tab: WaitingTabKey }) {
  return (
    <div className={styles.waitingTab} role="status">
      <p className={styles.waitingText}>{WAITS[tab]}</p>
    </div>
  );
}
