/**
 * Element clipboard.
 *
 * In-memory by design: the system clipboard would need permission prompts and
 * text serialisation for a copy that never leaves the designer, and the plan's
 * A10 rules out web storage entirely. Cut/copy/paste therefore live for as long
 * as the tab does, which is exactly as long as the designer session.
 */

import type { ReportElement } from "@/features/print-designer/types/template-definition";

/** Offset applied to a paste so the copy is visibly not the original. */
export const PASTE_OFFSET_MM = 2;

let buffer: ReportElement[] = [];

export function setClipboard(elements: readonly ReportElement[]): void {
  // Deep clone on the way in: the source elements are Redux state and must not
  // be reachable by a later paste that mutates ids.
  buffer = elements.map((element) => structuredClone(element));
}

export function getClipboard(): ReportElement[] {
  return buffer.map((element) => structuredClone(element));
}

export const clipboardSize = (): number => buffer.length;

export function clearClipboard(): void {
  buffer = [];
}
