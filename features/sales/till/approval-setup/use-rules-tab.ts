"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { DropdownSelection } from "@/components/design-system/dropdown";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import type { TillApprovalClient } from "./api/till-approval-api";
import {
  RELOAD_AFTER_SAVE_MS,
  approvalErrorText,
  effectiveRule,
  removeRowMessage,
  ruleBody,
  ruleEditCaption,
  ruleFormFrom,
  ruleId,
  ruleLayers,
  ruleMatrix,
  ruleProblem,
  ruleWarning,
  sameRule,
  scopeRow,
  withRuleMode,
  type GridRow,
  type RuleForm,
} from "./domain/approval-setup";
import type { ApprovalRows } from "./use-approval-rows";

/** The event the screen opens on (Qt `reloadAll`). */
export const FIRST_EVENT = "CASH_VARIANCE";

type Context = {
  client: TillApprovalClient;
  rows: ApprovalRows;
  companyId: string;
  loginBranch: string;
  today: string;
  stamp: (text: string) => void;
};

const BLANK_FORM = ruleFormFrom(null, { ownRow: false, today: "" });

function now(): string {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Approval Rules — one scope at a time ("" = the company layer). The form edits
 * THIS scope's own row; a scope with no row of its own starts a new one from
 * the layer in force, and is "dirty" only once something differs from it.
 */
export function useRulesTab({ client, rows, companyId, loginBranch, today, stamp }: Context) {
  const [scope, setScope] = useState<DropdownSelection | null>(null);
  const [showReserved, setShowReserved] = useState(false);
  const [event, setEvent] = useState("");
  const [form, setForm] = useState<RuleForm>(BLANK_FORM);
  const [snapshot, setSnapshot] = useState<RuleForm>(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  const scopeBranch = scope?.id ?? "";
  const rules = rows.rules;

  /** Fill the form for `nextEvent` at a scope, from the given rows (Qt `showEvent`). */
  const show = useCallback(
    (nextEvent: string, branch: string, from: readonly GridRow[]) => {
      if (!nextEvent) return;
      const own = scopeRow(from, { event: nextEvent, companyId, scopeBranch: branch });
      const inForce = effectiveRule(from, { event: nextEvent, branchId: branch, companyId, today });
      const filled = ruleFormFrom(own ?? inForce, { ownRow: Boolean(own), today });
      setEvent(nextEvent);
      setForm(filled);
      setSnapshot(filled);
    },
    [companyId, today],
  );

  const own = useMemo(
    () => (event ? scopeRow(rules, { event, companyId, scopeBranch }) : null),
    [rules, event, companyId, scopeBranch],
  );
  const inForce = useMemo(
    () => (event ? effectiveRule(rules, { event, branchId: scopeBranch, companyId, today }) : null),
    [rules, event, scopeBranch, companyId, today],
  );
  const layers = useMemo(() => ruleLayers(rules, event, scopeBranch), [rules, event, scopeBranch]);
  const matrix = useMemo(
    () => ruleMatrix(rules, { companyId, scopeBranch, today, showReserved }),
    [rules, companyId, scopeBranch, today, showReserved],
  );
  const dirty = Boolean(event) && !sameRule(form, snapshot);
  // Not before the grants have been read: an empty list would say "nobody" about everything.
  const { grants, grantsLoaded } = rows;
  const warning = useMemo(
    () => (grantsLoaded ? ruleWarning(form, { event, grants, companyId, scopeBranch, loginBranch }) : ""),
    [grantsLoaded, form, event, grants, companyId, scopeBranch, loginBranch],
  );
  const problem = ruleProblem({ event, dirty });
  const isNew = !own;

  const latest = useRef({ dirty, event, scopeBranch, rules, own, inForce });
  useLayoutEffect(() => {
    latest.current = { dirty, event, scopeBranch, rules, own, inForce };
  });

  const dropOk = useCallback(async () => {
    if (!latest.current.dirty) return true;
    return confirm({
      title: "Approval Rules",
      message: "The rule has changes that are not saved. Drop them?",
      confirmLabel: "Drop changes",
      iconVariant: "replace",
    });
  }, []);

  /**
   * Re-read the rules, then re-show the event on screen from them (Qt
   * `loadRules`) — read when the rows land, since the operator may have moved
   * while a save waited out the server's cache.
   */
  const { loadRules } = rows;
  const reload = useCallback(
    async (delayMs = 0) => {
      const fresh = await loadRules(delayMs);
      if (fresh) show(latest.current.event || FIRST_EVENT, latest.current.scopeBranch, fresh);
      return fresh !== null;
    },
    [loadRules, show],
  );

  const selectEvent = useCallback(
    async (next: string) => {
      const state = latest.current;
      if (!next || next === state.event) return;
      if (!(await dropOk())) return;
      show(next, state.scopeBranch, state.rules);
    },
    [dropOk, show],
  );

  const changeScope = useCallback(
    async (next: DropdownSelection | null) => {
      const state = latest.current;
      if ((next?.id ?? "") === state.scopeBranch) {
        setScope(next);
        return;
      }
      if (!(await dropOk())) return;
      setScope(next);
      show(state.event || FIRST_EVENT, next?.id ?? "", state.rules);
    },
    [dropOk, show],
  );

  const update = useCallback((patch: Partial<RuleForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const setMode = useCallback((mode: string) => {
    setForm((current) => withRuleMode(current, mode));
  }, []);

  /**
   * Override at company: what is in force at this branch, as a company row.
   * The scope moves to the company layer; with no company row yet, the form is
   * pre-filled from the branch's rule and compared against the company layer's
   * own rule in force, so Save is live whenever the two differ.
   */
  const overrideAtCompany = useCallback(async () => {
    const state = latest.current;
    if (!state.event || !state.scopeBranch) return;
    if (!(await dropOk())) return;
    const branchRule = effectiveRule(state.rules, {
      event: state.event,
      branchId: state.scopeBranch,
      companyId,
      today,
    });
    setScope(null);
    const companyRow = scopeRow(state.rules, { event: state.event, companyId, scopeBranch: "" });
    if (companyRow) {
      show(state.event, "", state.rules);
      return;
    }
    const companyInForce = effectiveRule(state.rules, { event: state.event, branchId: "", companyId, today });
    setForm(ruleFormFrom(branchRule, { ownRow: false, today }));
    setSnapshot(ruleFormFrom(companyInForce, { ownRow: false, today }));
  }, [companyId, dropOk, show, today]);

  const revert = useCallback(() => {
    const state = latest.current;
    show(state.event, state.scopeBranch, state.rules);
  }, [show]);

  const save = useCallback(async () => {
    const state = latest.current;
    const why = ruleProblem({ event: state.event, dirty: state.dirty });
    if (why) {
      toast.warn(why);
      return false;
    }
    const body = ruleBody(form, {
      ownId: state.own ? ruleId(state.own) : null,
      companyId,
      scopeBranch: state.scopeBranch,
      event: state.event,
    });
    setSaving(true);
    try {
      const saved = await client.saveRule(body);
      stamp(`${String(saved.message || "Approval rule saved")} · ${now()}`);
      // The form keeps what was posted until the re-read re-shows it from the rows.
      setSnapshot(form);
      await reload(RELOAD_AFTER_SAVE_MS);
      return true;
    } catch (error) {
      toast.error(approvalErrorText(error, "The approval rule could not be saved."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [client, companyId, form, reload, stamp]);

  /** Remove this scope's row: the next layer down is in force again. */
  const removeRow = useCallback(async () => {
    const state = latest.current;
    if (!state.own) return;
    const below = effectiveRule(state.rules, {
      event: state.event,
      branchId: state.scopeBranch,
      companyId,
      today,
      excludeId: ruleId(state.own),
    });
    const yes = await confirm({
      title: "Remove row",
      message: removeRowMessage(state.scopeBranch, state.event, below),
      confirmLabel: "Remove",
      iconVariant: "delete",
    });
    if (!yes) return;
    setSaving(true);
    try {
      const done = await client.deleteRule(ruleId(state.own), companyId);
      stamp(`${String(done.message || "Approval rule deleted")} · ${now()}`);
      await reload(RELOAD_AFTER_SAVE_MS);
    } catch (error) {
      toast.error(approvalErrorText(error, "The approval rule could not be removed."));
    } finally {
      setSaving(false);
    }
  }, [client, companyId, reload, stamp, today]);

  return {
    scope,
    scopeBranch,
    showReserved,
    setShowReserved,
    event,
    form,
    own,
    inForce,
    layers,
    matrix,
    dirty,
    warning,
    problem,
    isNew,
    saving,
    editCaption: ruleEditCaption(Boolean(own), scopeBranch),
    reload,
    selectEvent,
    changeScope,
    update,
    setMode,
    overrideAtCompany,
    revert,
    save,
    removeRow,
  };
}

export type RulesTabApi = ReturnType<typeof useRulesTab>;
