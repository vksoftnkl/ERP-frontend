/**
 * Sale Bill Entry — the verb bar as a pure function (§17.1), and the reasons a
 * verb is greyed (§17.2).
 *
 * **Hidden** = never applicable in this state. **Greyed** = applicable but
 * blocked now, and the tooltip says why. In plain words:
 *
 *  - Tender route: Tender (F5) only.
 *  - Plain route:  Save (F5) · Save & Print (F6).
 *  - Posted:       Edit · Cancel bill · Copy · Clear.
 *  - Amending:     Tender (tender route) or Save changes / Save changes & Print · Clear.
 *
 * Rights and locks are READ from `/bills/get`, never computed: the client never
 * derives "can I amend" from the status. `locks.editable.document` is false on
 * every posted bill and drives read-only only — Amend is never gated on it.
 * Lock 2 (a live IRN or EWB) removes Amend entirely; no right brings it back.
 *
 * Do not port the Qt habit of routing F5 by checking whether a button is
 * visible: one keymap reads this state.
 */
import type { BillLocks, BillRights } from "./salebill.types";

export type VerbInput = {
  status: string;
  isNew: boolean;
  /** The fields are open: entry mode, not deleted, and the screen permission. */
  editable: boolean;
  amending: boolean;
  autoPost: boolean;
  tenderRoute: boolean;
  /** A NEW bill has no rights yet, and Post is not refused on `!canPost` for one. */
  rights: BillRights | null;
  locks: BillLocks | null;
  /** The generic screen permission — the DRAFT edit gate, which knows nothing of posting. */
  canEditScreen: boolean;
  canDeleteScreen: boolean;
};

export type Verb = {
  visible: boolean;
  enabled: boolean;
  label: string;
  /** Why it is greyed, or a hint on an enabled verb. */
  tooltip: string | null;
};

export type VerbState = {
  tender: Verb;
  save: Verb;
  saveAndPrint: Verb;
  hold: Verb;
  pickHeld: Verb;
  clear: Verb;
  delete: Verb;
  edit: Verb;
  copy: Verb;
  list: Verb;
  cancelBill: Verb;
  close: Verb;
  /** Save (F5) and F6 are one verb each; this is which one they are right now. */
  saveRoute: "tender" | "amend" | "autoPost" | "draft";
};

const hidden: Verb = { visible: false, enabled: false, label: "", tooltip: null };
function verb(label: string, enabled = true, tooltip: string | null = null): Verb {
  return { visible: true, enabled, label, tooltip };
}

/**
 * Why Cancel is greyed, in the order the operator must act (§17.2), or `null`
 * when it may go ahead.
 */
export function cancelBlockedReason(rights: BillRights | null, locks: BillLocks | null): string | null {
  if (rights && !rights.cancel) {
    return "You don't have permission to cancel bills.";
  }
  if (locks?.irnLive) {
    return (
      "An e-invoice (IRN) is live on this bill. Cancel the IRN first — the GST document " +
      "always goes before the bill. Past the portal's window it cannot be cancelled at all, " +
      "and the correction is a credit note."
    );
  }
  if (locks?.ewbLive) {
    return "An e-way bill is live on this bill. Cancel it first, or wait for it to expire.";
  }
  if (locks && locks.returns > 0) {
    return `${locks.returns} sale return${locks.returns === 1 ? "" : "s"} point at this bill. Cancel those first.`;
  }
  if (locks && locks.allocations > 0) {
    return `${locks.allocations} receipt allocation${locks.allocations === 1 ? "" : "s"} are set against this bill. Release them first.`;
  }
  if (locks?.dayClosed) {
    return "The day is closed. A drawer already counted with this bill in it is a day-book correction, not a cancel.";
  }
  return null;
}

/**
 * Why Amend is unavailable (§17.2, §17.8), or `null`. A live IRN / EWB HIDES
 * the verb (the caller checks `amendHidden`); the right only greys it.
 */
export function amendBlockedReason(rights: BillRights | null, locks: BillLocks | null): string | null {
  if (locks?.irnLive) {
    return "This bill has an IRN, so it cannot be edited. Cancel it and make a new bill.";
  }
  if (locks?.ewbLive) {
    return "This bill has an e-way bill, so it cannot be edited. Cancel it and make a new bill.";
  }
  if (rights && !rights.amend) {
    return "You don't have permission to edit posted bills.";
  }
  return null;
}

/** Lock 2 removes Amend entirely; no right brings it back. */
export function amendHidden(locks: BillLocks | null): boolean {
  return Boolean(locks?.irnLive || locks?.ewbLive);
}

export function verbState(input: VerbInput): VerbState {
  const { status, isNew, editable, amending, autoPost, tenderRoute, rights, locks } = input;
  const posted = status === "POSTED";
  const draft = status === "DRAFT";
  const cancelled = status === "CANCELLED";

  const keying = draft && editable && !amending;
  const saveVerbs = keying || amending;
  const canPost = isNew || rights === null || rights.post;

  const saveRoute: VerbState["saveRoute"] = amending
    ? "amend"
    : tenderRoute
      ? "tender"
      : autoPost
        ? "autoPost"
        : "draft";

  const tender = saveVerbs && tenderRoute ? verb("Tender - F5") : hidden;

  let save: Verb = hidden;
  if (saveVerbs && (!tenderRoute || amending)) {
    save = amending
      ? verb(tenderRoute ? "Save changes" : "Save changes - F5")
      : autoPost
        ? verb("Save - F5")
        : verb("Save draft - F5");
  }

  let saveAndPrint: Verb = hidden;
  if (saveVerbs && !tenderRoute) {
    const label = amending
      ? "Save changes & Print - F6"
      : autoPost
        ? "Save & Print - F6"
        : "Post & Print - F6";
    const enabled = amending || canPost;
    saveAndPrint = verb(
      label,
      enabled,
      !enabled
        ? "You don't have permission to post bills."
        : !amending && !autoPost
          ? "Post without printing: Ctrl+Shift+Enter"
          : null,
    );
  }

  const hold = keying ? verb("Hold - F9") : hidden;
  const pickHeld = keying ? verb("Held - F10") : hidden;
  const clear = verb("Clear - F7");

  const del =
    draft && !isNew && !amending
      ? verb("Delete - F3", input.canDeleteScreen, input.canDeleteScreen ? null : "You don't have permission to delete bills.")
      : hidden;

  let edit: Verb = hidden;
  if (posted && !amending) {
    if (!amendHidden(locks)) {
      const reason = amendBlockedReason(rights, locks);
      edit = verb("Edit - F2", reason === null, reason ?? "Correct this bill. It keeps its number and date.");
    }
  } else if (draft && !editable && !amending) {
    edit = verb(
      "Edit - F2",
      input.canEditScreen,
      input.canEditScreen ? null : "You don't have permission to edit bills.",
    );
  }

  const copy = !isNew && !amending ? verb("Copy - Alt+Y") : hidden;
  const list = !amending ? verb("Bill List - F8") : hidden;

  let cancelBill: Verb = hidden;
  if (posted && !amending) {
    const reason = cancelBlockedReason(rights, locks);
    cancelBill = verb("Cancel bill", reason === null, reason ?? "Reverse this bill. It keeps its number.");
  }

  // A cancelled bill offers only what any read-only bill does.
  void cancelled;

  return {
    tender,
    save,
    saveAndPrint,
    hold,
    pickHeld,
    clear,
    delete: del,
    edit,
    copy,
    list,
    cancelBill,
    close: verb("Close - Esc"),
    saveRoute,
  };
}
