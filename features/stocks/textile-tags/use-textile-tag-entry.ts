"use client";

/**
 * The New tags tab's state and its round trips — what `TextileTagEntry` does
 * between its widgets and the server, with the widgets left to the components.
 *
 * The state is the pure reducer in `domain/textile-tag-lines.ts`. The reserve
 * chain (quick-add each unresolved name, then post) replays every step on a
 * LOCAL copy of the state with the same reducer while it also dispatches it,
 * so the payload it finally sends carries the ids just written back without
 * waiting on a render — React batches the dispatches behind an `await`.
 *
 * What degrades, and how, with the server's step B-1 not on the box yet:
 *  - a failed / 404 suggest-price: no rule, price by hand ("typed");
 *  - a failed item lookup: no signature, the server's reserve still decides;
 *  - the lists' dropdowns are unregistered (id 0): nothing fetched, every
 *    name resolves at reserve through the save route;
 *  - the reserve POST failing: the server's refusal, in plain words.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { toast } from "@/lib/notify";
import { confirm } from "@/lib/confirm";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store/store";
import {
  LIST_KINDS,
  num,
  type ListKind,
  type TagLineField,
} from "./domain/textile-tag-entity";
import {
  canReserve,
  createTagEntryState,
  discardQuestion,
  firstServerProblemKey,
  hasItem,
  isReserved,
  newTagLineKey,
  pendingLineCount,
  problemMessages,
  problemRows,
  reservePayload,
  sentLinesOf,
  tagEntryReducer,
  unresolvedNames,
  validationOf,
  type ListName,
  type SizeGridAdd,
  type TagEntryAction,
  type TagEntryState,
  type TagHeader,
} from "./domain/textile-tag-lines";
import { idOf, isLoaded, LIST_DROPDOWN_IDS } from "./domain/textile-tag-lists";
import {
  lookUpTagItem,
  readListDropdown,
  reserveTags,
  saveListName,
  serverErrorsOf,
  suggestTagPrice,
} from "./textile-tags.api";

export type TagEntryScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};

export type UseTextileTagEntryOptions = {
  scope: TagEntryScope;
  today: string;
  canCreate: boolean;
  /** Where a refusal lands focus: the named row's Item cell. */
  focusRow: (key: string) => void;
};

/**
 * Resolve one name to its id: known → at once; otherwise the save route
 * (created, or 409 with the existing row).
 */
async function resolveListName(
  dispatch: AppDispatch,
  state: TagEntryState,
  companyId: string,
  name: ListName,
): Promise<string> {
  const known = idOf(state.lists, name.kind, name.name, name.sizeSet);
  if (known) {
    return known;
  }
  return saveListName(dispatch, name.kind, {
    companyId,
    name: name.name.trim(),
    ...(name.kind === "size" ? { sizeSet: name.sizeSet || "FREE" } : {}),
  });
}

export function useTextileTagEntry({ scope, today, canCreate, focusRow }: UseTextileTagEntryOptions) {
  const appDispatch = useAppDispatch();
  const [state, dispatch] = useReducer(tagEntryReducer, today, createTagEntryState);

  // The latest rendered state, for the handlers that read before they write.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  });
  // The reserve chain's working copy, so a second Reserve cannot start mid-chain.
  const reservingRef = useRef(false);
  const canCreateRef = useRef(canCreate);
  useLayoutEffect(() => {
    canCreateRef.current = canCreate;
  });

  // ── The lists ─────────────────────────────────────────────────────────
  // Each kind whose dropdown is registered is read once per company; the
  // rest stay unloaded and their names resolve at reserve.
  useEffect(() => {
    if (!scope.companyId) {
      return;
    }
    let cancelled = false;
    for (const kind of LIST_KINDS) {
      const dropdownId = LIST_DROPDOWN_IDS[kind];
      if (dropdownId <= 0) {
        continue;
      }
      void readListDropdown(appDispatch, dropdownId, scope.companyId)
        .then((rows) => {
          if (!cancelled) {
            dispatch({ type: "listsLoaded", kind, rows });
          }
        })
        .catch(() => {
          /* the list stays unloaded: names resolve at reserve */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [appDispatch, scope.companyId]);

  // ── Round trips per line ──────────────────────────────────────────────
  const lookUp = useCallback(
    (key: string, itemId: string, uomId: string) => {
      const current = scopeRef.current;
      void lookUpTagItem(appDispatch, {
        companyId: current.companyId,
        branchId: current.branchId,
        accYear: current.accYear,
        itemId,
        uomId,
        onDate: stateRef.current.header.docDate,
      })
        .then((answer) => {
          dispatch({
            type: "lookupAnswered",
            key,
            itemId,
            signature: String(answer?.trackSignature ?? "").trim(),
            uomId: String(answer?.uomId ?? "").trim(),
          });
        })
        .catch(() => {
          /* the server's reserve still decides */
        });
    },
    [appDispatch],
  );

  const requestSuggestion = useCallback(
    (key: string, itemId: string, cost: number, brandId: string, priceSrc: string) => {
      if (!itemId || cost <= 0 || priceSrc === "typed") {
        return;
      }
      void suggestTagPrice(appDispatch, { companyId: scopeRef.current.companyId, itemId, brandId, cost })
        .then((data) => {
          dispatch({ type: "suggestionAnswered", key, itemId, cost, data: data ?? {} });
        })
        .catch(() => {
          /* no rule, or the route is not on the box yet: price by hand */
        });
    },
    [appDispatch],
  );

  // ── The operator's ways in ────────────────────────────────────────────
  const setItemOnRow = useCallback(
    (key: string, itemId: string, itemName: string, uomId: string) => {
      const line = stateRef.current.lines.find((candidate) => candidate.key === key);
      if (!line || isReserved(line) || !itemId) {
        return;
      }
      dispatch({ type: "itemSet", key, itemId, itemName, uomId });
      lookUp(key, itemId, uomId);
      requestSuggestion(key, itemId, num(line.cost), line.brandId, line.priceSrc);
    },
    [lookUp, requestSuggestion],
  );

  const setBrandOnRow = useCallback(
    (key: string, brandId: string, brandName: string) => {
      const line = stateRef.current.lines.find((candidate) => candidate.key === key);
      if (!line || isReserved(line)) {
        return;
      }
      dispatch({ type: "brandSet", key, brandId, brandName });
      // A brand rule can beat the group rule.
      requestSuggestion(key, line.itemId, num(line.cost), brandId, line.priceSrc);
    },
    [requestSuggestion],
  );

  const typeCell = useCallback(
    (key: string, field: TagLineField, text: string) => {
      const line = stateRef.current.lines.find((candidate) => candidate.key === key);
      if (!line) {
        return;
      }
      dispatch({ type: "cellTyped", key, field, text });
      if (field === "price" && text.trim() === "") {
        // Clearing a typed price asks the rule again.
        requestSuggestion(key, line.itemId, num(line.cost), line.brandId, "");
      } else if (field === "cost") {
        requestSuggestion(key, line.itemId, num(text), line.brandId, line.priceSrc);
      }
    },
    [requestSuggestion],
  );

  const addSizeGridLines = useCallback(
    (add: Omit<SizeGridAdd, "keys">) => {
      const keys = add.sizes.map(() => newTagLineKey());
      dispatch({ type: "sizeGridAdded", add: { ...add, keys } });
      for (const key of keys) {
        lookUp(key, add.itemId, "");
        requestSuggestion(key, add.itemId, num(add.cost), add.brandId, "");
      }
    },
    [lookUp, requestSuggestion],
  );

  const removeLine = useCallback((key: string) => {
    dispatch({ type: "lineRemoved", key });
  }, []);

  const showHint = useCallback((text: string) => {
    dispatch({ type: "hintShown", text });
  }, []);

  const setHeader = useCallback((patch: Partial<Pick<TagHeader, "source" | "supplierId" | "supplierName">>) => {
    dispatch({ type: "headerChanged", patch });
  }, []);

  const setDate = useCallback((docDate: string) => {
    dispatch({ type: "dateChanged", docDate });
  }, []);

  const setSeasonText = useCallback((text: string) => {
    dispatch({ type: "seasonTyped", text });
  }, []);

  const pickSeason = useCallback((id: string, name: string) => {
    dispatch({ type: "seasonPicked", id, name });
  }, []);

  /** Asks before an action loses the pending lines; true when it may go ahead. */
  const confirmDiscard = useCallback(async (action: string): Promise<boolean> => {
    const pending = pendingLineCount(stateRef.current);
    if (pending === 0) {
      return true;
    }
    return confirm({
      title: action,
      message: discardQuestion(pending),
      confirmLabel: "Continue",
      iconVariant: "replace",
    });
  }, []);

  const clearLines = useCallback(async () => {
    if (await confirmDiscard("Clear the lines")) {
      dispatch({ type: "linesCleared" });
    }
  }, [confirmDiscard]);

  // ── Reserve ───────────────────────────────────────────────────────────
  const reserve = useCallback(async () => {
    if (reservingRef.current || stateRef.current.reserving) {
      return;
    }
    let working = stateRef.current;
    const apply = (action: TagEntryAction) => {
      working = tagEntryReducer(working, action);
      dispatch(action);
    };

    if (pendingLineCount(working) === 0) {
      toast.info("There is no line to reserve.", { title: "Reserve tags" });
      return;
    }
    // The key paths (F5, Ctrl+Enter) land here too: a key runs only what the button may.
    if (!canCreateRef.current) {
      toast.warn("You do not have the right to reserve tags on this screen.", { title: "Reserve tags" });
      return;
    }
    const problems = problemRows(working);
    if (problems.length > 0) {
      toast.warn(`Fix these lines first:\n${problemMessages(problems).join("\n")}`, { title: "Reserve tags" });
      return;
    }

    const names = unresolvedNames(working);
    // G5: a NEW name asks once. Only a list that is on the box can call a
    // name new; before that every name goes through the save route, which
    // answers the existing row for a known one.
    const fresh = names.filter((name) => isLoaded(working.lists, name.kind)).map((name) => `${name.kind} “${name.name}”`);
    if (fresh.length > 0) {
      const ok = await confirm({
        title: "Add to the lists",
        message: `Not in the lists yet:\n${fresh.join("\n")}\n\nAdd them for this company?`,
        confirmLabel: "Add",
      });
      if (!ok) {
        return;
      }
    }

    reservingRef.current = true;
    apply({ type: "reserveStarted" });
    const { companyId, branchId, deviceId } = scopeRef.current;

    // One name at a time: a refusal stops the chain with every earlier name
    // already written back, so a second Reserve only sends what is left.
    for (const name of names) {
      try {
        const id = await resolveListName(appDispatch, working, companyId, name);
        apply({ type: "nameResolved", kind: name.kind, name: name.name, sizeSet: name.sizeSet, id });
      } catch (error) {
        reservingRef.current = false;
        apply({ type: "reserveStopped", hint: `Could not add ${name.kind} “${name.name}” to its list.` });
        toast.apiError(error, { fallback: `Could not add ${name.kind} “${name.name}” to its list.` });
        return;
      }
    }

    const body = reservePayload(working, { companyId, branchId, deviceId });
    apply({ type: "reserveSent", sent: sentLinesOf(working) });
    try {
      const data = await reserveTags(appDispatch, body);
      reservingRef.current = false;
      apply({ type: "reserved", data: data ?? { tags: [] } });
    } catch (error) {
      reservingRef.current = false;
      apply({ type: "reserveRefused", errors: serverErrorsOf(error) });
      const problemKey = firstServerProblemKey(working);
      if (problemKey) {
        focusRow(problemKey);
      }
      toast.apiError(error, {
        kept: "Nothing was reserved. The lines are still on the screen.",
        fallback: "The tags could not be reserved.",
      });
    }
  }, [appDispatch, focusRow]);

  // ── Derived ───────────────────────────────────────────────────────────
  const validation = useMemo(() => validationOf(state), [state]);
  const reserveEnabled = useMemo(() => canReserve(state, canCreate), [canCreate, state]);
  const pending = useMemo(() => pendingLineCount(state), [state]);
  const problemKeys = useMemo(() => new Set(validation.problems.map((problem) => problem.key)), [validation]);

  return {
    state,
    validation,
    problemKeys,
    reserveEnabled,
    pending,
    hasAnyItem: state.lines.some(hasItem),
    setItemOnRow,
    setBrandOnRow,
    typeCell,
    addSizeGridLines,
    removeLine,
    showHint,
    setHeader,
    setDate,
    setSeasonText,
    pickSeason,
    confirmDiscard,
    clearLines,
    reserve,
  };
}

export type TextileTagEntryApi = ReturnType<typeof useTextileTagEntry>;

export type { ListKind };
