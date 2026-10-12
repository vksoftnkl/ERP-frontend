"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { DropdownSelection } from "@/components/design-system/dropdown";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import type { TillApprovalClient } from "./api/till-approval-api";
import { normalizeAmount } from "./domain/amount";
import {
  approvalErrorText,
  approverIdentity,
  approverLines,
  canEndGrant,
  copyGrantBodies,
  effectiveRule,
  endGrantPlan,
  gapEvents,
  grantBody,
  grantFormFrom,
  grantId,
  grantLine,
  grantProblem,
  grantsNote,
  grantsOf,
  lowestOkLevel,
  ruleInForceText,
  sameGrant,
  text,
  whoCanApprove,
  type AddedApprover,
  type GrantForm,
  type GridRow,
} from "./domain/approval-setup";
import { RELOAD_AFTER_SAVE_MS, type ApprovalRows } from "./use-approval-rows";

type Context = {
  client: TillApprovalClient;
  rows: ApprovalRows;
  companyId: string;
  loginBranch: string;
  today: string;
  stamp: (text: string) => void;
};

/** "Who can approve?" as the Qt screen opens it: the login's branch, CASH_VARIANCE, 4,000. */
export const WHO_DEFAULT_EVENT = "CASH_VARIANCE";
export const WHO_DEFAULT_AMOUNT = "4000.00";

export type WhoInput = { branch: DropdownSelection | null; event: string; amount: string };

const BLANK_FORM = grantFormFrom(null, { userRole: "", today: "" });

function now(): string {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Approval Authority — approvers on the left, the selected one's grants and the
 * grant form on the right, and the "Who can approve?" preview under them.
 * Grants are never deleted: End grant is a save of the grant AS SAVED.
 */
export function useAuthorityTab({ client, rows, companyId, loginBranch, today, stamp }: Context) {
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<AddedApprover[]>([]);
  const [userId, setUserId] = useState("");
  /** The grant on the form as it was loaded; null = a new grant. */
  const [grant, setGrant] = useState<GridRow | null>(null);
  const [form, setForm] = useState<GrantForm>(BLANK_FORM);
  const [snapshot, setSnapshot] = useState<GrantForm>(BLANK_FORM);
  const [addPick, setAddPick] = useState<DropdownSelection | null>(null);
  const [copyPick, setCopyPick] = useState<DropdownSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [whoInput, setWhoInput] = useState<WhoInput>({
    branch: null,
    event: WHO_DEFAULT_EVENT,
    amount: WHO_DEFAULT_AMOUNT,
  });
  const [whoChecked, setWhoChecked] = useState<WhoInput>(whoInput);

  const grants = rows.grants;

  const approvers = useMemo(() => approverLines(grants, added, { search, today }), [grants, added, search, today]);
  const identity = useMemo(() => approverIdentity(grants, added, userId), [grants, added, userId]);
  const userGrants = useMemo(() => grantsOf(grants, userId), [grants, userId]);
  const grantLines = useMemo(() => userGrants.map((row) => grantLine(row, today)), [userGrants, today]);
  const note = useMemo(() => grantsNote(userGrants, today), [userGrants, today]);

  const changed = Boolean(userId) && !sameGrant(form, snapshot);
  /** A new grant is saveable as it stands: its defaults are a real grant. */
  const dirty = Boolean(userId) && (!grant || changed);
  const problem = grantProblem({ userId, dirty, form });
  const isNew = !grant;
  const endable = canEndGrant(grant, today);

  // ── Who can approve? ────────────────────────────────────────────────────
  const whoBranch = whoChecked.branch?.id || loginBranch;
  const who = useMemo(
    () =>
      whoCanApprove(rows.rules, grants, {
        companyId,
        branchId: whoBranch,
        event: whoChecked.event,
        amount: whoChecked.amount,
        today,
      }),
    [rows.rules, grants, companyId, whoBranch, whoChecked.event, whoChecked.amount, today],
  );
  const ruleLine = useMemo(() => {
    const rule = effectiveRule(rows.rules, { event: whoChecked.event, branchId: whoBranch, companyId, today });
    return ruleInForceText(rule, { event: whoChecked.event, amount: whoChecked.amount, lowest: lowestOkLevel(who) });
  }, [rows.rules, whoChecked.event, whoChecked.amount, whoBranch, companyId, today, who]);
  // The check runs once both lists are in (Qt runs it after the grants load).
  const ready = rows.rulesLoaded && rows.grantsLoaded;
  const gaps = useMemo(
    () => (ready ? gapEvents(rows.rules, grants, { companyId, branchId: whoBranch, today }) : []),
    [ready, rows.rules, grants, companyId, whoBranch, today],
  );

  const latest = useRef({ changed, userId, grant, grants, added, search, form, snapshot, identity, copyPick, whoInput });
  useLayoutEffect(() => {
    latest.current = { changed, userId, grant, grants, added, search, form, snapshot, identity, copyPick, whoInput };
  });

  /** Put a grant on the form, or a new one (Qt `showGrant`). */
  const showGrant = useCallback(
    (next: GridRow | null, userRole: string) => {
      const filled = grantFormFrom(next, { userRole, today });
      setGrant(next);
      setForm(filled);
      setSnapshot(filled);
    },
    [today],
  );

  const dropOk = useCallback(async () => {
    if (!latest.current.changed) return true;
    return confirm({
      title: "Approval Authority",
      message: "The grant has changes that are not saved. Drop them?",
      confirmLabel: "Drop changes",
      iconVariant: "replace",
    });
  }, []);

  /** Show an approver and their first grant (or a new one). */
  const openApprover = useCallback(
    (id: string, from: readonly GridRow[], addedNow: readonly AddedApprover[]) => {
      setUserId(id);
      const first = grantsOf(from, id)[0] ?? null;
      showGrant(first, approverIdentity(from, addedNow, id).role);
    },
    [showGrant],
  );

  /**
   * After a read (Qt `loadGrants`): keep the approver on screen, or open the
   * first one; re-show `selectId` when a save or an end asked for it, and
   * refresh an unedited grant from its new row.
   */
  const afterLoad = useCallback(
    (fresh: readonly GridRow[], selectId?: string) => {
      const state = latest.current;
      let id = state.userId;
      if (!id) {
        id = approverLines(fresh, state.added, { search: state.search, today })[0]?.userId ?? "";
        if (!id) return;
      }
      const role = approverIdentity(fresh, state.added, id).role;
      const mine = grantsOf(fresh, id);
      const selected = selectId ? mine.find((row) => grantId(row) === selectId) : undefined;
      if (selected) {
        setUserId(id);
        showGrant(selected, role);
        return;
      }
      if (state.userId !== id) {
        setUserId(id);
        showGrant(mine[0] ?? null, role);
        return;
      }
      if (state.grant) {
        const again = mine.find((row) => grantId(row) === grantId(state.grant));
        if (!again) showGrant(mine[0] ?? null, role);
        else if (!state.changed) showGrant(again, role);
        else setGrant(again);
      } else if (!state.changed && mine.length > 0) {
        // An untouched new-grant form gives way to the grants just copied in.
        showGrant(mine[0], role);
      }
    },
    [showGrant, today],
  );

  const { loadGrants } = rows;
  const reload = useCallback(
    async (selectId?: string, delayMs = 0) => {
      const fresh = await loadGrants(delayMs);
      if (fresh) afterLoad(fresh, selectId);
      return fresh !== null;
    },
    [afterLoad, loadGrants],
  );

  const selectApprover = useCallback(
    async (id: string) => {
      const state = latest.current;
      if (!id || id === state.userId) return;
      if (!(await dropOk())) return;
      openApprover(id, state.grants, state.added);
    },
    [dropOk, openApprover],
  );

  const selectGrant = useCallback(
    async (id: string) => {
      const state = latest.current;
      if (id === grantId(state.grant)) return;
      const row = grantsOf(state.grants, state.userId).find((candidate) => grantId(candidate) === id);
      if (!row) return;
      if (!(await dropOk())) return;
      showGrant(row, state.identity.role);
    },
    [dropOk, showGrant],
  );

  /** Add approver: any user, on screen until they have a grant. Starts a new grant. */
  const addApprover = useCallback(async () => {
    const pick = addPick;
    if (!pick?.id) {
      toast.warn("Pick the user first.");
      return;
    }
    if (!(await dropOk())) return;
    const state = latest.current;
    const nextAdded = state.added.some((approver) => approver.id === pick.id)
      ? state.added
      : [...state.added, { id: pick.id, name: pick.text }];
    setAdded(nextAdded);
    setUserId(pick.id);
    showGrant(null, approverIdentity(state.grants, nextAdded, pick.id).role);
    setAddPick(null);
  }, [addPick, dropOk, showGrant]);

  const addGrant = useCallback(async () => {
    const state = latest.current;
    if (!state.userId) return;
    if (!(await dropOk())) return;
    showGrant(null, state.identity.role);
  }, [dropOk, showGrant]);

  const update = useCallback((patch: Partial<GrantForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const revert = useCallback(() => {
    const state = latest.current;
    showGrant(state.grant, state.identity.role);
  }, [showGrant]);

  const save = useCallback(async () => {
    const state = latest.current;
    const why = grantProblem({
      userId: state.userId,
      dirty: Boolean(state.userId) && (!state.grant || state.changed),
      form: state.form,
    });
    if (why) {
      toast.warn(why);
      return false;
    }
    setSaving(true);
    try {
      const saved = await client.saveAuthority(
        grantBody(state.form, { grant: state.grant, userId: state.userId, companyId }),
      );
      stamp(`${String(saved.message || "Approval authority saved")} · ${now()}`);
      setSnapshot(state.form);
      const id = text(saved, "taaId") || grantId(state.grant);
      await reload(id, RELOAD_AFTER_SAVE_MS);
      return true;
    } catch (error) {
      toast.error(approvalErrorText(error, "The grant could not be saved."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [client, companyId, reload, stamp]);

  /** End grant: valid-to today, or switched off when it has not started. */
  const endGrant = useCallback(async () => {
    const state = latest.current;
    if (!state.grant) return;
    const saved = grantBody(state.snapshot, { grant: state.grant, userId: state.userId, companyId });
    const plan = endGrantPlan(saved, state.grant, today);
    const yes = await confirm({
      title: "End grant",
      message: plan.message,
      confirmLabel: plan.future ? "Switch off" : "End grant",
      iconVariant: "replace",
    });
    if (!yes) return;
    setSaving(true);
    try {
      const done = await client.saveAuthority(plan.body);
      stamp(`${plan.future ? "Grant switched off" : "Grant ended"} · ${String(done.message || "")} · ${now()}`);
      await reload(grantId(state.grant), RELOAD_AFTER_SAVE_MS);
    } catch (error) {
      toast.error(approvalErrorText(error, "The grant could not be ended."));
    } finally {
      setSaving(false);
    }
  }, [client, companyId, reload, stamp, today]);

  /** Copy from user: the other approver's live grants, re-made for this one from today. */
  const copyFrom = useCallback(async () => {
    const state = latest.current;
    const from = state.copyPick;
    if (!from?.id || !state.userId || from.id === state.userId) {
      toast.warn("Pick another approver to copy from.");
      return;
    }
    const bodies = copyGrantBodies(grantsOf(state.grants, from.id), { userId: state.userId, today });
    if (bodies.length === 0) {
      toast.warn(`${from.text} has no active grant to copy.`);
      return;
    }
    const yes = await confirm({
      title: "Copy from user",
      message: `Give ${state.identity.name} the same ${bodies.length} active grant(s) as ${from.text}?`,
      confirmLabel: "Copy",
      iconVariant: "replace",
    });
    if (!yes) return;
    setSaving(true);
    try {
      const results = await Promise.allSettled(bodies.map((body) => client.saveAuthority(body)));
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      for (const failure of failed) toast.error(approvalErrorText(failure.reason, "A grant could not be copied."));
      const copied = results.length - failed.length;
      if (copied > 0) stamp(`${copied} grant(s) copied from ${from.text} · ${now()}`);
      setCopyPick(null);
      await reload(undefined, RELOAD_AFTER_SAVE_MS);
    } finally {
      setSaving(false);
    }
  }, [client, reload, stamp, today]);

  /** Check: the preview follows what was asked, not each keystroke (Qt `runCheck`). */
  const runCheck = useCallback(() => {
    const input = latest.current.whoInput;
    const checked = { ...input, amount: normalizeAmount(input.amount) || "0.00" };
    setWhoInput(checked);
    setWhoChecked(checked);
  }, []);

  return {
    search,
    setSearch,
    approvers,
    userId,
    identity,
    grantLines,
    note,
    grant,
    form,
    changed,
    dirty,
    problem,
    isNew,
    endable,
    saving,
    addPick,
    setAddPick,
    copyPick,
    setCopyPick,
    whoInput,
    setWhoInput,
    who,
    ruleLine: ready ? ruleLine : "",
    gaps,
    reload,
    selectApprover,
    selectGrant,
    addApprover,
    addGrant,
    update,
    revert,
    save,
    endGrant,
    copyFrom,
    runCheck,
  };
}

export type AuthorityTabApi = ReturnType<typeof useAuthorityTab>;
