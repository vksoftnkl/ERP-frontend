"use client";

/**
 * The F12 inline panel's slot on a purchase screen (Qt `openAllocs` /
 * `closeAllocPanel` on GRN, Shortage Receipt and Purchase Entry): which line it
 * is open on, and the rules for moving it —
 *
 * - F12 again on the same line puts the cursor back in the panel;
 * - on another line, while the panel's rows do not add up on a draft, it stays
 *   (the hint says so); otherwise it moves there, the first line keeping what
 *   last added up;
 * - each opening is a fresh mount (`seq` — key the panel by it), so it starts
 *   from the line's own rows.
 *
 * The need and read-only state are the screen's, read from the line live, so the
 * panel follows an edit of Received / Damaged / Free while it is open (Qt setNeed).
 */
import { useCallback, useRef, useState } from "react";
import { focusAllocPanel } from "./components/purchase-alloc-dialog";
import type { PurchaseAllocEntry } from "./purchase-dialogs.types";

export type PurchaseAllocPanelTarget = {
  /** The line's key. */
  key: string;
  title: string;
  /** The rows it opens with (the line's split, or what is typed on the row). */
  rows: PurchaseAllocEntry[];
  /** The line's item (Qt: the panel's tooltip). */
  tip?: string;
  /** One per opening: the panel's React key. */
  seq: number;
};

export type OpenAllocPanelOptions = {
  /** The line number (1-based) of a key, for the hint. */
  lineNoOf: (key: string) => number;
  /** A draft being keyed: only then does an unbalanced split hold the panel on its line. */
  editable: boolean;
  /** "split" (GRN, Shortage) or "batches" / "serials" (Purchase Entry), for the hint. */
  noun?: string;
};

/** The hint when the panel may not move: Qt "Line 2's split does not add up yet — … Fix it, or Esc there to drop the change." */
export function allocPanelHeldHint(lineNo: number, problem: string, noun = "split"): string {
  const plural = noun !== "split";
  return `Line ${lineNo}'s ${noun} ${plural ? "do" : "does"} not add up yet — ${problem} Fix ${plural ? "them" : "it"}, or Esc there to drop the change.`;
}

export function usePurchaseAllocPanel() {
  const [target, setTarget] = useState<PurchaseAllocPanelTarget | null>(null);
  const targetRef = useRef<PurchaseAllocPanelTarget | null>(null);
  const problemRef = useRef("");
  const seqRef = useRef(0);

  /** Opens (or moves) the panel. Returns the hint to show — "" when it opened or took the cursor. */
  const open = useCallback((next: Omit<PurchaseAllocPanelTarget, "seq">, options: OpenAllocPanelOptions): string => {
    const current = targetRef.current;
    if (current && current.key === next.key) {
      focusAllocPanel();
      return "";
    }
    if (current && options.editable && problemRef.current) {
      focusAllocPanel();
      return allocPanelHeldHint(options.lineNoOf(current.key), problemRef.current, options.noun);
    }
    problemRef.current = "";
    seqRef.current += 1;
    const opened = { ...next, seq: seqRef.current };
    targetRef.current = opened;
    setTarget(opened);
    return "";
  }, []);

  const close = useCallback(() => {
    problemRef.current = "";
    targetRef.current = null;
    setTarget(null);
  }, []);

  const onProblem = useCallback((problem: string) => {
    problemRef.current = problem;
  }, []);

  return { target, open, close, onProblem };
}
