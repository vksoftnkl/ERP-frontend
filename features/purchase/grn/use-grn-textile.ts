"use client";

/**
 * The GRN's textile pick-lists — Qt `GrnEntry::loadTextileChoices` (85cab40):
 * dropdowns 70 / 71 ITEM SIZES / ITEM COLOURS, every page (`/dropdown-details/run`
 * caps a page at 100), only while the company numbers its own batches
 * (stock.auto_batch_no). For the DOCUMENT's company. A failed read is silent,
 * as in Qt: the pick-list then offers no rows.
 *
 * "+ Add new size…/colour…" goes through the masters' own `/create` (the
 * Opening Stock quick-add) and lands on the list for the next line.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  useQuickAddOpeningStockChoiceMutation,
  useRunOpeningStockChoicePageMutation,
} from "@/features/stocks/opening-stock/opening-stock.api";
import { CHOICE_MAX_PAGES, CHOICE_PAGE_SIZE } from "@/features/stocks/opening-stock/opening-stock.constants";
import type { BatchDetailChoice } from "@/features/stocks/opening-stock/opening-stock.types";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { COLOUR_DROPDOWN_KEY, SIZE_DROPDOWN_KEY } from "./grn.constants";

export type TextileWord = "size" | "colour";

const PREFIX: Record<TextileWord, "isz" | "icl"> = { size: "isz", colour: "icl" };

function choiceOf(row: Record<string, unknown>, prefix: "isz" | "icl"): BatchDetailChoice | null {
  const id = String(row[`${prefix}_id`] ?? "").trim();
  const name = String(row[`${prefix}_name`] ?? "").trim();
  return id ? { id, name: name || id } : null;
}

/** The name an id stands for; "…" while the list has not brought it yet (Qt). */
export function choiceName(list: readonly BatchDetailChoice[], id: string): string {
  if (!id) {
    return "";
  }
  return list.find((choice) => choice.id === id)?.name ?? "…";
}

export function useGrnTextile(autoBatchNo: boolean, companyId: string) {
  const sizeDropdownId = useDropdownId(SIZE_DROPDOWN_KEY);
  const colourDropdownId = useDropdownId(COLOUR_DROPDOWN_KEY);
  const [runChoicePage] = useRunOpeningStockChoicePageMutation();
  const [quickAddMutation] = useQuickAddOpeningStockChoiceMutation();
  const [sizes, setSizes] = useState<BatchDetailChoice[]>([]);
  const [colours, setColours] = useState<BatchDetailChoice[]>([]);
  const listsRef = useRef({ size: sizes, colour: colours });
  useLayoutEffect(() => {
    listsRef.current = { size: sizes, colour: colours };
  });

  useEffect(() => {
    if (!autoBatchNo || !companyId) {
      return;
    }
    let active = true;
    const load = async (word: TextileWord, dropdownId: string) => {
      if (!dropdownId) {
        return;
      }
      const loaded: BatchDetailChoice[] = [];
      for (let page = 1; page <= CHOICE_MAX_PAGES; page += 1) {
        const rows = await runChoicePage({ dropdownId, companyId, page }).unwrap();
        if (!active) {
          return;
        }
        for (const row of rows) {
          const choice = choiceOf(row, PREFIX[word]);
          if (choice) {
            loaded.push(choice);
          }
        }
        if (rows.length < CHOICE_PAGE_SIZE) {
          break;
        }
      }
      (word === "size" ? setSizes : setColours)(loaded);
    };
    load("size", sizeDropdownId).catch(() => undefined);
    load("colour", colourDropdownId).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [autoBatchNo, colourDropdownId, companyId, runChoicePage, sizeDropdownId]);

  /** The master's own create; the new row joins the list. Throws the server's refusal. */
  const quickAdd = useCallback(
    async (word: TextileWord, name: string): Promise<BatchDetailChoice | null> => {
      const row = await quickAddMutation({ kind: word, name, companyId }).unwrap();
      const added = choiceOf(row, PREFIX[word]);
      if (added) {
        const list = listsRef.current[word];
        (word === "size" ? setSizes : setColours)([...list.filter((choice) => choice.id !== added.id), added]);
      }
      return added;
    },
    [companyId, quickAddMutation],
  );

  const names = useMemo(
    () => ({
      size: (id: string) => choiceName(sizes, id),
      colour: (id: string) => choiceName(colours, id),
    }),
    [colours, sizes],
  );

  return { sizes, colours, names, quickAdd };
}
