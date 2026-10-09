"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { useGetTillGridRowsQuery, useSaveTillMasterMutation } from "@/store/api/tillApi";
import { tillErrorText } from "./domain/api-error";
import {
  TAB_WIRE,
  bodyOf,
  formFromRow,
  newForm,
  problemOf,
  reasonReadOnly,
  rowId,
  rowText,
  type GridRow,
  type TillForms,
  type TillTab,
} from "./domain/till-masters";

/** The server caches a grid run for about a second; re-read once it has turned over. */
const RELOAD_DELAY_MS = 1500;

const EMPTY_ROWS: GridRow[] = [];

type Options = {
  companyId: string;
  branchId: string;
  /** `YYYY-MM-DD`. */
  today: string;
  /** Reasons: the category on the side list — a new reason starts in it. */
  category?: string;
  /** After a successful save of this tab (another tab may show its names). */
  onSaved?: (tab: TillTab) => void;
};

function now(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

/**
 * One tab of Till Masters: its grid's rows, the row on the form, the form, and
 * the verbs. The form is compared with the form as it was filled — through
 * the body Save would post, so "2000" and "2000.00" are the same — and that is
 * what "dirty" means.
 *
 * A row on the form is the grid row itself (the grid carries every field), so
 * there is no /get. After a save the list is re-read once the server's grid
 * cache has turned over, and the saved row is re-shown from it — unless the
 * operator has started editing meanwhile.
 */
export function useTillTab<T extends TillTab>(tab: T, { companyId, branchId, today, category = "", onSaved }: Options) {
  const wire = TAB_WIRE[tab];
  const params = useMemo(() => {
    const tokens: Record<string, string> = { icompany_id: companyId };
    if (wire.perBranch) tokens.ibranch_id = branchId;
    return tokens;
  }, [wire.perBranch, companyId, branchId]);
  const skip = !companyId || (wire.perBranch && !branchId);
  const query = useGetTillGridRowsQuery({ grid: wire.grid, params }, { skip });
  const rows = query.data ?? EMPTY_ROWS;
  const [saveMaster] = useSaveTillMasterMutation();

  const [shown, setShown] = useState<GridRow | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  /** Reasons: the shipped code a "Copy shipped to edit" form came from. */
  const [copyOf, setCopyOf] = useState<string | null>(null);
  const [form, setForm] = useState<TillForms[T]>(() => newForm(tab, { rows: EMPTY_ROWS, category, today }));
  /** The form as filled or saved — Revert's target and the dirty baseline. */
  const [baseForm, setBaseForm] = useState<TillForms[T]>(form);
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState("");

  const isNew = shownId === null;
  const bodyContext = useMemo(() => ({ companyId, branchId, id: shownId }), [companyId, branchId, shownId]);
  const dirty = useMemo(
    () => JSON.stringify(bodyOf(tab, form, bodyContext)) !== JSON.stringify(bodyOf(tab, baseForm, bodyContext)),
    [tab, form, baseForm, bodyContext],
  );

  const latest = useRef({ rows, dirty, shownId, copyOf, category, saving });
  useLayoutEffect(() => {
    latest.current = { rows, dirty, shownId, copyOf, category, saving };
  });

  /** Put a grid row on the form (null = a new, blank one). */
  const fill = useCallback(
    (row: GridRow | null, rowsForNew?: readonly GridRow[]) => {
      const next = row
        ? formFromRow(tab, row, today)
        : newForm(tab, { rows: rowsForNew ?? latest.current.rows, category: latest.current.category, today });
      setShown(row);
      setShownId(row ? rowId(tab, row) : null);
      setCopyOf(null);
      setForm(next);
      setBaseForm(next);
    },
    [tab, today],
  );

  // Fresh rows: re-show the row on the form from them, or re-make a blank new
  // form with the defaults the rows decide (sort order, first safe = default).
  // An edit in progress is never overwritten.
  useEffect(() => {
    if (!query.data) return;
    const state = latest.current;
    if (state.dirty || state.copyOf || state.saving) return;
    if (state.shownId) {
      const row = query.data.find((candidate) => rowId(tab, candidate) === state.shownId);
      if (row) fill(row);
      return;
    }
    fill(null, query.data);
  }, [query.data, fill, tab]);

  const reloadTimer = useRef<number | null>(null);
  const { refetch } = query;
  const reloadSoon = useCallback(() => {
    if (skip) return;
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      void refetch();
    }, RELOAD_DELAY_MS);
  }, [refetch, skip]);
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    },
    [],
  );

  const confirmDiscard = useCallback(async (title: string) => {
    if (!latest.current.dirty) return true;
    return confirm({
      title,
      message: "The form has changes that are not saved. Drop them?",
      confirmLabel: "Drop changes",
      iconVariant: "replace",
    });
  }, []);

  const update = useCallback((patch: Partial<TillForms[T]>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const select = useCallback(
    async (id: string) => {
      if (id === latest.current.shownId) return;
      if (!(await confirmDiscard("Open another row"))) return;
      const row = latest.current.rows.find((candidate) => rowId(tab, candidate) === id);
      if (row) fill(row);
    },
    [confirmDiscard, fill, tab],
  );

  const startNew = useCallback(async () => {
    if (!(await confirmDiscard("New"))) return false;
    fill(null);
    return true;
  }, [confirmDiscard, fill]);

  /** A blank new form follows the category; a half-typed one keeps its own. */
  const followCategory = useCallback(
    (nextCategory: string) => {
      const state = latest.current;
      if (state.shownId !== null || state.dirty || state.copyOf) return;
      const next = newForm(tab, { rows: state.rows, category: nextCategory, today });
      setForm(next);
      setBaseForm(next);
    },
    [tab, today],
  );

  const revert = useCallback(() => {
    setForm(baseForm);
  }, [baseForm]);

  const post = useCallback(
    async (payload: Record<string, unknown>, done: string, nextForm: TillForms[T]) => {
      setSaving(true);
      try {
        const saved = await saveMaster({ master: wire.master, body: payload }).unwrap();
        const id = rowText(saved, wire.bodyId) || latest.current.shownId;
        // Stay on the saved row: the re-read list re-shows it, with its facts.
        setShownId(id);
        setCopyOf(null);
        setForm(nextForm);
        setBaseForm(nextForm);
        setStamp(`${done} · ${now()}`);
        reloadSoon();
        onSaved?.(tab);
        return true;
      } catch (error) {
        toast.error(tillErrorText(error, "The save failed."));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [onSaved, reloadSoon, saveMaster, tab, wire.bodyId, wire.master],
  );

  const save = useCallback(async () => {
    const why = problemOf(tab, form, shown);
    if (why) {
      toast.warn(why);
      return false;
    }
    return post(bodyOf(tab, form, bodyContext), "Saved", form);
  }, [bodyContext, form, post, shown, tab]);

  /** Deactivate / Reactivate: the row as it is stored, with only Active changed. */
  const setActive = useCallback(
    async (active: boolean) => {
      if (isNew) return false;
      if (!(await confirmDiscard(active ? "Reactivate" : "Deactivate"))) return false;
      const stored = shown ? formFromRow(tab, shown, today) : baseForm;
      const next = { ...stored, active } as TillForms[T];
      // An inactive safe cannot stay the branch default.
      if (tab === "safes" && !active && "isDefault" in next) {
        (next as TillForms["safes"]).isDefault = false;
      }
      return post(bodyOf(tab, next, bodyContext), active ? "Reactivated" : "Deactivated", next);
    },
    [baseForm, bodyContext, confirmDiscard, isNew, post, shown, tab, today],
  );

  /** Safes: Set default is this safe's own save with the flag; the server moves the star. */
  const setDefaultSafe = useCallback(async () => {
    if (tab !== "safes" || isNew) return false;
    if (!(await confirmDiscard("Set default"))) return false;
    const stored = (shown ? formFromRow("safes", shown, today) : baseForm) as TillForms["safes"];
    const next = { ...stored, isDefault: true } as TillForms[T];
    return post(bodyOf(tab, next, bodyContext), "Default safe set", next);
  }, [baseForm, bodyContext, confirmDiscard, isNew, post, shown, tab, today]);

  /**
   * Reasons: a company row with the shipped row's category + code. The till
   * then shows the copy in its place. The form starts as the shipped row and is
   * dirty against a blank one, so Save is lit straight away.
   */
  const copyShipped = useCallback(() => {
    if (tab !== "reasons" || !reasonReadOnly(shown) || !shown) return;
    const copied = formFromRow(tab, shown, today);
    const blank = newForm(tab, { rows: latest.current.rows, category: rowText(shown, "trs_category"), today });
    setShown(null);
    setShownId(null);
    setCopyOf(rowText(shown, "trs_code"));
    setBaseForm(blank);
    setForm(copied);
  }, [shown, tab, today]);

  /**
   * Active as stored — from the form as filled or saved, so Deactivate and
   * Reactivate flip at once rather than when the re-read list arrives.
   */
  const storedActive = !isNew && Boolean((baseForm as { active?: boolean }).active);

  return {
    tab,
    rows,
    loading: query.isLoading || (query.isFetching && !query.data),
    error: query.isError,
    refetch: skip ? () => undefined : () => void refetch(),
    shown,
    shownId,
    storedActive,
    isNew,
    copyOf,
    form,
    update,
    dirty,
    saving,
    stamp,
    select,
    startNew,
    followCategory,
    revert,
    save,
    setActive,
    setDefaultSafe,
    copyShipped,
    reloadSoon,
  };
}

export type TillTabApi<T extends TillTab> = ReturnType<typeof useTillTab<T>>;
