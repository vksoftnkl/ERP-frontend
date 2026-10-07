"use client";

/**
 * The rows, the copy the server last described, and the three jobs that talk
 * to the server: load, save, unmap.
 *
 * Every rule lives in `../domain.ts`; this file only sequences calls.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "@/lib/notify";
import {
  useDeleteLedgerMapMutation,
  useLoadLedgerMapRolesMutation,
  useSaveLedgerMapMutation,
} from "@/store/api/ledgerMapApi";
import {
  applyPick,
  fitsLocally,
  isMapped,
  isRowDirty,
  mapHealth,
  rowFromPayload,
  serverSentence,
  toSaveBody,
} from "../domain";
import type { LedgerMapRolePayload, LedgerMapRow, PickedLedger } from "../ledger-map.types";

/** What an operator typed into a row, carried across a reload. */
type RowEdit = Pick<LedgerMapRow, "ledgerId" | "ledgerName" | "ledgerType" | "remarks">;

type State = {
  /** The working copy, in the server's order. */
  rows: LedgerMapRow[];
  /** What `/roles` last said, by role — what "changed" is measured against. */
  loaded: Record<string, LedgerMapRow>;
  phase: "loading" | "ready" | "failed";
  loadError: string;
};

type Action =
  | { type: "LOADING" }
  | { type: "LOADED"; payload: LedgerMapRolePayload[]; keep: Record<string, RowEdit> }
  | { type: "LOAD_FAILED"; message: string }
  | { type: "REPLACE_ROW"; row: LedgerMapRow }
  | { type: "SET_REMARKS"; role: string; remarks: string };

const INITIAL: State = { rows: [], loaded: {}, phase: "loading", loadError: "" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOADING":
      return { ...state, phase: state.rows.length === 0 ? "loading" : state.phase, loadError: "" };

    case "LOADED": {
      // The server sorts by (alr_sort_order, alr_role), and that order is the
      // screen's: revenue, then output tax, purchase, input tax and so on.
      // Re-sorting here would break the one thing that makes a flat list of
      // role codes readable.
      const loaded: Record<string, LedgerMapRow> = {};
      const rows = action.payload.map((payload) => {
        const fresh = rowFromPayload(payload);
        loaded[fresh.role] = fresh;
        const edit = action.keep[fresh.role];
        // The fresh row keeps the SERVER's almId and flags — a delete followed
        // by a create issues a new almId, and a stale one is a 409 on the next
        // save. Only what the operator typed is laid back over it.
        if (!edit) {
          return fresh;
        }
        const mine = { ...fresh, remarks: edit.remarks };
        if (edit.ledgerId !== "" && edit.ledgerId !== fresh.ledgerId) {
          return { ...mine, ...edit, ledgerIsActive: true, ledgerIsDeleted: false };
        }
        return mine;
      });
      return { rows, loaded, phase: "ready", loadError: "" };
    }

    case "LOAD_FAILED":
      // A failed RELOAD leaves the rows on screen as they were — the operator's
      // edits included. Only a first load has nothing to fall back to.
      return {
        ...state,
        phase: state.rows.length === 0 ? "failed" : "ready",
        loadError: action.message,
      };

    case "REPLACE_ROW":
      return {
        ...state,
        rows: state.rows.map((row) => (row.role === action.row.role ? action.row : row)),
      };

    case "SET_REMARKS":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.role === action.role ? { ...row, remarks: action.remarks } : row,
        ),
      };

    default:
      return state;
  }
}

export type LedgerMapBusy = "idle" | "loading" | "saving" | "unmapping";

export type UseLedgerMap = ReturnType<typeof useLedgerMap>;

export function useLedgerMap() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [busy, setBusy] = useState<LedgerMapBusy>("loading");
  /**
   * The same value as `busy`, readable synchronously: a second Ctrl+Enter
   * pressed before the first one's render has landed must still see "saving".
   */
  const busyRef = useRef<LedgerMapBusy>("loading");
  const setBusyNow = useCallback((next: LedgerMapBusy) => {
    busyRef.current = next;
    setBusy(next);
  }, []);

  const [loadRoles] = useLoadLedgerMapRolesMutation();
  const [saveRow] = useSaveLedgerMapMutation();
  const [deleteRow] = useDeleteLedgerMapMutation();

  const dirtyRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const row of state.rows) {
      if (isRowDirty(row, state.loaded[row.role])) {
        roles.add(row.role);
      }
    }
    return roles;
  }, [state.rows, state.loaded]);

  const health = useMemo(() => mapHealth(state.rows), [state.rows]);

  // The latest rows for the async jobs below, which outlive the render that
  // started them.
  const stateRef = useRef(state);
  const dirtyRef = useRef(dirtyRoles);
  useEffect(() => {
    stateRef.current = state;
    dirtyRef.current = dirtyRoles;
  });

  /** The edits on these roles, to lay back over a reload. */
  const editsOf = useCallback((roles: Iterable<string>): Record<string, RowEdit> => {
    const keep: Record<string, RowEdit> = {};
    const byRole = new Map(stateRef.current.rows.map((row) => [row.role, row]));
    for (const role of roles) {
      const row = byRole.get(role);
      if (row) {
        keep[role] = {
          ledgerId: row.ledgerId,
          ledgerName: row.ledgerName,
          ledgerType: row.ledgerType,
          remarks: row.remarks,
        };
      }
    }
    return keep;
  }, []);

  /**
   * Generation-guarded: a reload asked for twice (a double press, StrictMode's
   * double mount) lands only its LAST answer, so an older one arriving late
   * cannot repaint over a newer one.
   */
  const generation = useRef(0);
  const load = useCallback(
    async (keep: Record<string, RowEdit> = {}): Promise<void> => {
      const mine = ++generation.current;
      dispatch({ type: "LOADING" });
      try {
        const payload = await loadRoles().unwrap();
        if (mine === generation.current) {
          dispatch({ type: "LOADED", payload, keep });
        }
      } catch (error: unknown) {
        if (mine === generation.current) {
          const message = serverSentence(error, "The posting roles could not be loaded.");
          dispatch({ type: "LOAD_FAILED", message });
          toast.error(`The posting map could not be loaded. ${message}`);
        }
      }
    },
    [loadRoles],
  );

  /** F5 / Reload — throws every edit away. The screen asks first when there are any. */
  const reload = useCallback(async () => {
    if (busyRef.current === "saving" || busyRef.current === "unmapping") {
      return;
    }
    setBusyNow("loading");
    try {
      await load();
    } finally {
      setBusyNow("idle");
    }
  }, [load, setBusyNow]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ── Editing ───────────────────────────────────────────────────────────────

  /**
   * A ledger picked into a row. Returns whether the row changed, so the screen
   * knows whether to step the caret on to Remarks.
   */
  const pickLedger = useCallback((role: string, picked: PickedLedger): boolean => {
    const row = stateRef.current.rows.find((candidate) => candidate.role === role);
    if (!row) {
      return false;
    }
    // The backstop. Grid 105 filters on the role's wanted type, duty head and
    // nature, so this cannot normally fire — and that is why it is worth
    // having: if it DOES fire, the grid has drifted from the catalogue, and
    // seeing that here beats a 400 from a server that was right. The type is
    // named, because "wrong ledger" is not actionable.
    if (!fitsLocally(row, picked.ledgerType)) {
      toast.warn(
        `That ledger cannot hold this role. "${row.label}" needs a ${row.expectedLedgerType} ledger, ` +
          `but "${picked.ledgerName}" is "${picked.ledgerType}". The picker should not have offered it — ` +
          "it filters by the role, so the picker grid and the role catalogue disagree.",
      );
      return false;
    }
    const next = applyPick(row, picked);
    if (!next) {
      return false;
    }
    dispatch({ type: "REPLACE_ROW", row: next });
    return true;
  }, []);

  const setRemarks = useCallback((role: string, remarks: string) => {
    dispatch({ type: "SET_REMARKS", role, remarks });
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  /**
   * One POST per TOUCHED row, one after another.
   *
   * Serial rather than parallel because the answers are reported as one message
   * and a race would deliver it in pieces. One refused row does not abandon the
   * others: each is its own role, and stopping at the first failure would leave
   * the operator to work out which of the rest had been tried.
   *
   * The map is re-read afterwards whatever happened — the server owns the
   * almIds — and the rows that did NOT land keep what the operator typed, so a
   * refusal costs a re-try, not the work.
   */
  const save = useCallback(async () => {
    if (busyRef.current !== "idle") {
      return;
    }
    const { rows } = stateRef.current;
    const pending = rows.filter((row) => dirtyRef.current.has(row.role));
    if (pending.length === 0) {
      toast.info("Nothing to save — no mapping has been changed.");
      return;
    }

    // A remark typed on a role that still has no ledger has nothing to be
    // written against: `alm_ledger_id` is NOT NULL. Say which, and save the rest
    // rather than sending a row that is certain to 400.
    const sendable = pending.filter(isMapped);
    const remarkOnly = pending.filter((row) => !isMapped(row));
    if (remarkOnly.length > 0) {
      const names = remarkOnly.map((row) => `"${row.label}"`).join(", ");
      toast.warn(
        `${names} ${remarkOnly.length === 1 ? "has" : "have"} a remark and no ledger. ` +
          "A mapping is a role AND a ledger — pick one, or the remark has nothing to be written against.",
      );
    }
    if (sendable.length === 0) {
      return;
    }

    setBusyNow("saving");
    const failures: { role: string; line: string }[] = [];
    let saved = 0;
    try {
      for (const row of sendable) {
        try {
          await saveRow(toSaveBody(row)).unwrap();
          saved += 1;
        } catch (error: unknown) {
          failures.push({ role: row.role, line: `${row.label}: ${serverSentence(error)}` });
        }
      }

      if (failures.length === 0) {
        toast.success(`${saved} mapping${saved === 1 ? "" : "s"} saved.`);
      } else {
        toast.warn(
          `${saved > 0 ? `${saved} saved. ` : "Nothing was saved. "}` +
            `${failures.length === 1 ? "This was" : "These were"} refused — ${failures
              .map((failure) => failure.line)
              .join(" · ")}`,
        );
      }

      setBusyNow("loading");
      await load(editsOf([...failures.map((failure) => failure.role), ...remarkOnly.map((row) => row.role)]));
    } finally {
      setBusyNow("idle");
    }
  }, [editsOf, load, saveRow, setBusyNow]);

  // ── Unmap ─────────────────────────────────────────────────────────────────

  /**
   * Remove a role's mapping. The screen has already asked; the SERVER has the
   * last word, and refuses while a deployed engine posts the role — naming the
   * documents, in a sentence nothing the client could compose would better.
   *
   * Read back rather than edited in place: `/delete` is soft and a later create
   * issues a NEW almId. Every OTHER row's edits survive the re-read.
   */
  const unmap = useCallback(
    async (role: string) => {
      if (busyRef.current !== "idle") {
        return;
      }
      const row = stateRef.current.rows.find((candidate) => candidate.role === role);
      if (!row?.almId) {
        return;
      }
      setBusyNow("unmapping");
      try {
        try {
          await deleteRow(row.almId).unwrap();
        } catch (error: unknown) {
          toast.warn(`"${row.label}" was not removed. ${serverSentence(error)}`);
          return;
        }
        const others = [...dirtyRef.current].filter((candidate) => candidate !== role);
        setBusyNow("loading");
        await load(editsOf(others));
      } finally {
        setBusyNow("idle");
      }
    },
    [deleteRow, editsOf, load, setBusyNow],
  );

  return {
    rows: state.rows,
    phase: state.phase,
    loadError: state.loadError,
    dirtyRoles,
    dirty: dirtyRoles.size > 0,
    health,
    busy,
    reload,
    pickLedger,
    setRemarks,
    save,
    unmap,
  };
}
