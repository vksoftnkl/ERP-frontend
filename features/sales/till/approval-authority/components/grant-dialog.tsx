"use client";

/**
 * One approval grant — Qt `TillApprovalGrantEntry` (NexERP a449b8c): WHO may
 * approve which event, where, at what level, up to how much, and whether
 * remotely. Opened from the list with the grid row (no `/get`: the row is the
 * record), or empty for a new grant. Saves to `/till/approval-authorities/create`
 * — create, or change by `taaId` presence.
 *
 * The approver is fixed once the grant exists: a grant for someone else is a
 * new grant. On a new grant the level starts at the picked user's User Role
 * (Qt 425fa80), still changeable. "Every company" (group finance) has no
 * branch, so the branch is cleared and held while it is chosen.
 *
 * Keys, as the till master popups: Enter moves to the next field (a required
 * box left empty keeps the caret), Ctrl+Enter saves, Esc closes. Mounted fresh
 * per opening (keyed by the list), so nothing carries over from the last grant.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { Check, Field, Notes, NumberBox, SectionHeading } from "@/features/sales/till-masters/components/form-bits";
import { useTillApprovalClient } from "@/features/sales/till/approval-setup/api/till-approval-api";
import {
  APPROVER_LEVELS,
  approvalErrorText,
  type GridRow,
} from "@/features/sales/till/approval-setup/domain/approval-setup";
import {
  EVERY_BRANCH_LABEL,
  EVERY_COMPANY_LABEL,
  EVERY_EVENT_LABEL,
  grantEventChoices,
  grantFacts,
  grantFormBody,
  grantFormOf,
  grantFormProblem,
  grantHeading,
  grantRowId,
  sameGrantForm,
  withEveryCompany,
  withPickedUser,
  type GrantField,
  type GrantForm,
} from "../domain/approval-authority";
import { PopupFrame, popupStyles as styles } from "./popup-frame";

const EVERY = "*";
const OWN_COMPANY = "own";

/** What the Enter walk visits: the fields, then Save. Other buttons are skipped. */
const WALK_SELECTOR = [
  'input:not([type="hidden"]):not(:disabled)',
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "button[data-entry-save]:not(:disabled)",
].join(", ");

function fieldId(field: GrantField): string {
  return `till-grant-${field}`;
}

export type GrantDialogProps = {
  /** The grid row the popup opened on; null for a new grant. */
  row: GridRow | null;
  /** Set when the operator may look but not save (no right): the subtitle says so. */
  readOnlyReason: string | null;
  /** The company the list was read for — what Save posts. */
  companyId: string;
  companyName: string;
  today: string;
  onClose: () => void;
  /** Saved: the list re-reads once the server's grid cache has turned over. */
  onSaved: () => void;
};

export function GrantDialog({ row, readOnlyReason, companyId, companyName, today, onClose, onSaved }: GrantDialogProps) {
  const client = useTillApprovalClient();
  const userDropdownId = useDropdownId("tillApproverUser");
  const branchDropdownId = useDropdownId("branchByCompany");
  const userParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);

  const panelRef = useRef<HTMLElement | null>(null);
  const savingRef = useRef(false);
  const [initial] = useState(() => grantFormOf(row, today));
  const [form, setForm] = useState<GrantForm>(initial);
  const [saving, setSaving] = useState(false);

  const isNew = row === null;
  const readOnly = readOnlyReason !== null;
  const editable = !readOnly && !saving;
  const off = (field: GrantField) => !editable || (field === "userId" && !isNew);
  const heading = grantHeading(row);
  const facts = grantFacts(row);
  const dirty = !readOnly && !sameGrantForm(form, initial);
  const eventChoices = useMemo(() => grantEventChoices(form.event), [form.event]);

  const update = useCallback((patch: Partial<GrantForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const submit = useCallback(async () => {
    if (readOnly || savingRef.current) return;
    const problem = grantFormProblem(form);
    if (problem) {
      toast.warn(problem.message);
      document.getElementById(fieldId(problem.field))?.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await client.saveAuthority(grantFormBody(form, { rowId: row ? grantRowId(row) : null, companyId }));
      onSaved();
    } catch (error) {
      toast.error(approvalErrorText(error, "The grant could not be saved."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [client, companyId, form, onSaved, readOnly, row]);

  const close = useCallback(async () => {
    if (savingRef.current) return;
    if (
      dirty &&
      !(await confirm({
        title: "Discard changes?",
        message: "The grant has changes that are not saved. Close and drop them?",
        confirmLabel: "Discard",
        iconVariant: "replace",
      }))
    ) {
      return;
    }
    onClose();
  }, [dirty, onClose]);

  /** Enter-as-Tab; true when the key was this walk's. */
  const walkEnter = useCallback((target: EventTarget) => {
    if (!(target instanceof HTMLElement) || target instanceof HTMLButtonElement) return false;
    if (target instanceof HTMLTextAreaElement) return false;
    const panel = panelRef.current;
    if (!panel) return false;
    // A required box left empty keeps the caret (NexDialog's `textNecessary`).
    if (target instanceof HTMLInputElement && target.dataset.required === "true" && !target.value.trim()) return true;
    const stops = Array.from(panel.querySelectorAll<HTMLElement>(WALK_SELECTOR)).filter(
      (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
    );
    const at = stops.indexOf(target);
    const next = at >= 0 ? stops[at + 1] : undefined;
    if (!next) return false;
    next.focus();
    if (next instanceof HTMLInputElement && /^(text|search|)$/.test(next.type)) next.select();
    return true;
  }, []);

  return (
    <PopupFrame
      icon="AG"
      title={heading.title}
      subtitle={readOnlyReason ?? heading.subtitle}
      panelRef={panelRef}
      onClose={() => void close()}
      onSubmit={() => void submit()}
      onEnter={walkEnter}
      footer={
        <>
          <span className={styles.footerHint}>
            Enter next · Ctrl+Enter {heading.submitLabel.toLowerCase()} · Esc close
          </span>
          <button
            type="button"
            className={styles.secondaryButton}
            // Qt's Cancel takes no focus; it does when nothing else can.
            tabIndex={readOnly ? 0 : -1}
            autoFocus={readOnly}
            onClick={() => void close()}
          >
            Cancel
          </button>
          <button
            type="button"
            data-entry-save
            className={styles.primaryButton}
            disabled={readOnly || saving}
            title={`${heading.submitLabel} (Ctrl+Enter)`}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : heading.submitLabel}
          </button>
        </>
      }
    >
      <form className={styles.panelBody} noValidate onSubmit={(event) => event.preventDefault()}>
        <SectionHeading>Approver</SectionHeading>
        <div className={styles.fieldGrid}>
          <Field id={fieldId("userId")} label="User" required>
            <NexDropdownSingle
              id={fieldId("userId")}
              dropdownId={userDropdownId}
              params={userParams}
              clearOnParamsChange={false}
              value={form.userId ? { id: form.userId, text: form.userName } : null}
              onChange={(picked, pickedRow) => setForm((current) => withPickedUser(current, picked, pickedRow, isNew))}
              // A grant belongs to one approver; for someone else, add a new grant.
              disabled={off("userId")}
              autoFocus={isNew && !readOnly}
              placeholder="The user who may approve"
              aria-label="User"
              className={styles.dropdown}
            />
          </Field>
          <Field id={fieldId("level")} label="Level">
            <select
              id={fieldId("level")}
              className={styles.selectInput}
              value={form.level}
              disabled={off("level")}
              autoFocus={!isNew && !readOnly}
              onChange={(event) => update({ level: event.target.value })}
            >
              {APPROVER_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <SectionHeading>Where and what</SectionHeading>
        <div className={styles.fieldGrid}>
          <Field id={fieldId("everyCompany")} label="Company">
            <select
              id={fieldId("everyCompany")}
              className={styles.selectInput}
              value={form.everyCompany ? EVERY : OWN_COMPANY}
              disabled={off("everyCompany")}
              onChange={(event) => setForm((current) => withEveryCompany(current, event.target.value === EVERY))}
            >
              <option value={OWN_COMPANY}>{companyName || "This company"}</option>
              <option value={EVERY}>{EVERY_COMPANY_LABEL}</option>
            </select>
          </Field>
          <Field id={fieldId("branchId")} label="Branch">
            <NexDropdownSingle
              id={fieldId("branchId")}
              dropdownId={branchDropdownId}
              params={branchParams}
              clearOnParamsChange={false}
              value={form.branchId ? { id: form.branchId, text: form.branchName } : null}
              onChange={(picked) => update({ branchId: picked?.id ?? "", branchName: picked?.text ?? "" })}
              // A branch narrows a company: every company has none.
              disabled={off("branchId") || form.everyCompany}
              placeholder={EVERY_BRANCH_LABEL}
              aria-label="Branch"
              className={styles.dropdown}
            />
          </Field>
          <Field id={fieldId("event")} label="Event">
            <select
              id={fieldId("event")}
              className={styles.selectInput}
              value={form.event || EVERY}
              disabled={off("event")}
              onChange={(event) => update({ event: event.target.value === EVERY ? "" : event.target.value })}
            >
              <option value={EVERY}>{EVERY_EVENT_LABEL}</option>
              {eventChoices.map((event) => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
          </Field>
          <Field id={fieldId("max")} label="Max Amount">
            <NumberBox
              id={fieldId("max")}
              value={form.max}
              max={999999999.99}
              placeholder="blank = no ceiling"
              disabled={off("max")}
              onChange={(max) => update({ max })}
            />
          </Field>
          <Check
            id={fieldId("remote")}
            label="May approve remotely (away from the counter)"
            checked={form.remote}
            disabled={off("remote")}
            onChange={(remote) => update({ remote })}
          />
        </div>

        <SectionHeading>Validity</SectionHeading>
        <div className={styles.fieldGrid}>
          <Field id={fieldId("validFrom")} label="Valid From" required>
            <input
              id={fieldId("validFrom")}
              type="date"
              className={styles.textInput}
              data-required="true"
              value={form.validFrom}
              disabled={off("validFrom")}
              onChange={(event) => update({ validFrom: event.target.value })}
            />
          </Field>
          <Field id={fieldId("validTo")} label="Valid To">
            <input
              id={fieldId("validTo")}
              type="date"
              className={styles.textInput}
              title="blank = no end"
              value={form.validTo}
              disabled={off("validTo")}
              onChange={(event) => update({ validTo: event.target.value })}
            />
          </Field>
          <Check
            id={fieldId("active")}
            label="Active"
            checked={form.active}
            disabled={off("active")}
            onChange={(active) => update({ active })}
          />
          <Field id={fieldId("remarks")} label="Remarks" wide>
            <textarea
              id={fieldId("remarks")}
              className={styles.textArea}
              rows={2}
              maxLength={250}
              value={form.remarks}
              disabled={off("remarks")}
              onChange={(event) => update({ remarks: event.target.value })}
            />
          </Field>
        </div>
        <Notes facts={facts} warnings={[]} />
      </form>
    </PopupFrame>
  );
}
