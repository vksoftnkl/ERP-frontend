"use client";

import { useMemo } from "react";

import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { SearchableSelect } from "@/components/design-system/ui";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  APPROVER_LEVELS,
  GRANT_NOTE,
  WHO_HINT,
  allEvents,
  gapText,
  grantId,
  text,
  type ApproverLine,
  type GrantLine,
  type WhoLine,
} from "../domain/approval-setup";
import type { AuthorityTabApi } from "../use-authority-tab";
import { Check, DataTable, DateBox, Field, NumberBox, Pill, advanceOnEnter, type Column } from "./form-bits";
import styles from "../page.module.scss";

const EVERY = "*";
const OWN_COMPANY = "own";
const LIVE_EVENTS = allEvents(false);
const LEVEL_OPTIONS = APPROVER_LEVELS.map((value) => ({ value, label: value }));
const WHO_EVENT_OPTIONS = LIVE_EVENTS.map((value) => ({ value, label: value }));

const APPROVER_COLUMNS: readonly Column<ApproverLine>[] = [
  { key: "user", label: "User", stretch: true, text: (row) => row.name },
  { key: "role", label: "Role", text: (row) => row.role || "—" },
  { key: "grants", label: "Grants", align: "right", text: (row) => String(row.live) },
  { key: "remote", label: "Remote", align: "center", text: (row) => (row.remote ? "✓" : "") },
];

const GRANT_COLUMNS: readonly Column<GrantLine>[] = [
  { key: "company", label: "Company", text: (row) => row.company },
  { key: "branch", label: "Branch", stretch: true, text: (row) => row.branch },
  { key: "event", label: "Event", text: (row) => row.event },
  { key: "level", label: "Level", text: (row) => row.level },
  { key: "max", label: "Max amount", align: "right", text: (row) => row.max },
  { key: "remote", label: "Remote", align: "center", text: (row) => (row.remote ? "✓" : "") },
  { key: "from", label: "Valid from", text: (row) => row.from },
  { key: "to", label: "Valid to", text: (row) => row.to },
  {
    key: "status",
    label: "Status",
    text: (row) => row.status,
    tone: (row) => (row.status === "Active" ? "success" : "muted"),
  },
];

const WHO_COLUMNS: readonly Column<WhoLine>[] = [
  { key: "name", label: "Approver", text: (row) => row.name },
  { key: "level", label: "Level", text: (row) => row.level },
  { key: "max", label: "Max", align: "right", text: (row) => row.max },
  { key: "pin", label: "Counter PIN", align: "center", text: (row) => (row.pin ? "✓" : "") },
  { key: "remote", label: "Remote", align: "center", text: (row) => (row.remote ? "✓" : "") },
  { key: "verdict", label: "Verdict", stretch: true, text: (row) => row.verdict, tone: (row) => (row.ok ? "success" : "danger") },
];

type Props = {
  t: AuthorityTabApi;
  companyId: string;
  companyName: string;
  loginBranch: string;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  canCreate: boolean;
  canEdit: boolean;
  hidden: boolean;
};

/**
 * Approval Authority — WHO may approve what, where, up to how much. Approvers
 * on the left; the selected one's grants, the grant form and the "Who can
 * approve?" preview on the right.
 */
export function AuthorityTab({
  t,
  companyId,
  companyName,
  loginBranch,
  loading,
  failed,
  onRetry,
  canCreate,
  canEdit,
  hidden,
}: Props) {
  const branchDropdownId = useDropdownId("branchByCompany");
  const userDropdownId = useDropdownId("tillApproverUser");
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);
  const userParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  const form = t.form;
  const editable = Boolean(t.userId) && (t.isNew ? canCreate : canEdit) && !t.saving;
  const ids = "till-grant";

  const companyOptions = useMemo(
    () => [
      { value: OWN_COMPANY, label: companyName || "This company" },
      { value: EVERY, label: "(every company)" },
    ],
    [companyName],
  );
  // A grant on an event this list leaves out (the void module's) keeps it.
  const eventOptions = useMemo(() => {
    const events = form.event && !LIVE_EVENTS.includes(form.event) ? [...LIVE_EVENTS, form.event] : LIVE_EVENTS;
    return [{ value: EVERY, label: "(every event)" }, ...events.map((value) => ({ value, label: value }))];
  }, [form.event]);

  const whoBranchValue = t.whoInput.branch ?? (loginBranch ? { id: loginBranch, text: "this branch (login)" } : null);

  const approversEmpty = failed ? (
    <>
      The grants could not be read.{" "}
      <button type="button" className={styles.secondaryButton} onClick={onRetry}>
        Try again
      </button>
    </>
  ) : loading ? (
    "Loading…"
  ) : t.search ? (
    "No approver matches."
  ) : (
    "No approver yet — pick a user below and Add approver."
  );

  return (
    <div className={styles.authorityBody} hidden={hidden} role="tabpanel" aria-label="Approval Authority">
      <section className={styles.pane} aria-label="Approvers">
        <div className={styles.capRow}>
          <span className={styles.sectionCap}>Approvers</span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search…"
            value={t.search}
            onChange={(event) => t.setSearch(event.target.value)}
            aria-label="Search approvers"
          />
        </div>
        <DataTable
          label="Approvers"
          columns={APPROVER_COLUMNS}
          rows={t.approvers}
          rowKey={(row) => row.userId}
          selectedId={t.userId}
          onSelect={(id) => void t.selectApprover(id)}
          emptyText={approversEmpty}
        />
        <div className={styles.inlineRow}>
          <div className={styles.grow}>
            <NexDropdownSingle
              dropdownId={userDropdownId}
              params={userParams}
              clearOnParamsChange={false}
              value={t.addPick}
              onChange={t.setAddPick}
              disabled={!companyId}
              placeholder="Pick a user"
              aria-label="Add approver"
              className={styles.dropdown}
              advanceFocusOnSelect={false}
            />
          </div>
          <button type="button" className={styles.secondaryButton} disabled={t.saving} onClick={() => void t.addApprover()}>
            Add approver
          </button>
        </div>
        <p className={styles.mutedNote}>lists users with at least one grant; Add picks any user</p>
      </section>

      <section className={styles.sidePane} aria-label="Grants">
        <div className={styles.capRow}>
          <span className={styles.sectionCap}>{t.identity.name ? `${t.identity.name} · grants` : "Grants"}</span>
          {t.identity.role ? <Pill tone="info">{t.identity.role}</Pill> : null}
        </div>
        <DataTable
          label="Grants"
          columns={GRANT_COLUMNS}
          rows={t.grantLines}
          rowKey={(row) => row.id}
          selectedId={t.grant ? grantId(t.grant) : null}
          onSelect={(id) => void t.selectGrant(id)}
          emptyText={t.userId ? "No grant yet." : "Pick an approver."}
          short
        />
        {t.userId && t.note ? <p className={styles.mutedNote}>{t.note}</p> : null}
        <div className={styles.inlineRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canCreate || !t.userId || t.saving}
            onClick={() => void t.addGrant()}
          >
            Add grant
          </button>
          <div className={styles.grow}>
            <NexDropdownSingle
              dropdownId={userDropdownId}
              params={userParams}
              clearOnParamsChange={false}
              value={t.copyPick}
              onChange={t.setCopyPick}
              disabled={!companyId}
              placeholder="Copy whose grants?"
              aria-label="Copy whose grants?"
              className={styles.dropdown}
              advanceFocusOnSelect={false}
            />
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canCreate || !t.userId || t.saving}
            onClick={() => void t.copyFrom()}
          >
            Copy from user…
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canEdit || !t.endable || t.saving}
            onClick={() => void t.endGrant()}
          >
            End grant
          </button>
        </div>

        <div className={styles.capRow}>
          <span className={styles.sectionCap}>{t.isNew ? "New grant" : "Edit grant"}</span>
          {t.grant && text(t.grant, "taa_event_code") ? (
            <span className={styles.codeHint}>{text(t.grant, "taa_event_code")}</span>
          ) : null}
        </div>
        <form
          className={styles.grantFields}
          noValidate
          onSubmit={(event) => event.preventDefault()}
          onKeyDown={advanceOnEnter}
        >
          <Field id={`${ids}-company`} label="Company">
            <SearchableSelect
              id={`${ids}-company`}
              value={form.everyCompany ? EVERY : OWN_COMPANY}
              options={companyOptions}
              onChange={(value) => t.update({ everyCompany: value === EVERY })}
              disabled={!editable}
            />
          </Field>
          <Field id={`${ids}-branch`} label="Branch">
            <NexDropdownSingle
              id={`${ids}-branch`}
              dropdownId={branchDropdownId}
              params={branchParams}
              clearOnParamsChange={false}
              value={form.branchId ? { id: form.branchId, text: form.branchName } : null}
              onChange={(selection) => t.update({ branchId: selection?.id ?? "", branchName: selection?.text ?? "" })}
              // Every company has no branch of its own.
              disabled={!editable || form.everyCompany}
              placeholder="(every branch)"
              aria-label="Branch"
              className={styles.dropdown}
            />
          </Field>
          <Field id={`${ids}-event`} label="Event">
            <SearchableSelect
              id={`${ids}-event`}
              value={form.event || EVERY}
              options={eventOptions}
              onChange={(value) => t.update({ event: value === EVERY ? "" : value })}
              disabled={!editable}
            />
          </Field>
          <Field id={`${ids}-level`} label="Level">
            <SearchableSelect
              id={`${ids}-level`}
              value={form.level}
              options={LEVEL_OPTIONS}
              onChange={(level) => t.update({ level })}
              disabled={!editable}
            />
          </Field>
          <Field id={`${ids}-max`} label="Max amount">
            <NumberBox
              id={`${ids}-max`}
              value={form.max}
              max={999999999.99}
              placeholder="no ceiling"
              disabled={!editable}
              onChange={(max) => t.update({ max })}
            />
          </Field>
          <Check
            className={styles.span2}
            label="May approve remotely"
            checked={form.remote}
            disabled={!editable}
            onChange={(remote) => t.update({ remote })}
          />
          <Field id={`${ids}-from`} label="Valid from">
            <DateBox id={`${ids}-from`} value={form.from} disabled={!editable} onChange={(from) => t.update({ from })} />
          </Field>
          <Field id={`${ids}-to`} label="Valid to">
            <div className={styles.inlineRow}>
              <input
                type="checkbox"
                aria-label="Has a valid-to date"
                checked={form.hasTo}
                disabled={!editable}
                onChange={(event) => t.update({ hasTo: event.target.checked })}
              />
              <div className={styles.grow}>
                <DateBox
                  id={`${ids}-to`}
                  value={form.to}
                  disabled={!editable || !form.hasTo}
                  onChange={(to) => t.update({ to })}
                />
              </div>
            </div>
          </Field>
          <p className={`${styles.mutedNote} ${styles.fieldFull}`}>{GRANT_NOTE}</p>
        </form>

        <div className={styles.capRow}>
          <span className={styles.sectionCap}>Who can approve?</span>
          <span className={styles.codeHint}>{WHO_HINT}</span>
        </div>
        <form
          className={styles.whoBar}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            t.runCheck();
          }}
        >
          <label className={styles.fieldCap} htmlFor="till-who-branch">
            Branch
          </label>
          <NexDropdownSingle
            id="till-who-branch"
            dropdownId={branchDropdownId}
            params={branchParams}
            clearOnParamsChange={false}
            value={whoBranchValue}
            onChange={(branch) => t.setWhoInput({ ...t.whoInput, branch })}
            disabled={!companyId}
            placeholder="Pick a branch"
            aria-label="Who can approve — branch"
            className={styles.dropdown}
            advanceFocusOnSelect={false}
          />
          <label className={styles.fieldCap} htmlFor="till-who-event">
            Event
          </label>
          <SearchableSelect
            id="till-who-event"
            value={t.whoInput.event}
            options={WHO_EVENT_OPTIONS}
            onChange={(event) => t.setWhoInput({ ...t.whoInput, event })}
          />
          <label className={styles.fieldCap} htmlFor="till-who-amount">
            Amount
          </label>
          <NumberBox
            id="till-who-amount"
            value={t.whoInput.amount}
            max={999999999.99}
            onChange={(amount) => t.setWhoInput({ ...t.whoInput, amount })}
          />
          <button type="submit" className={styles.primaryButton}>
            Check
          </button>
        </form>
        <DataTable
          label="Who can approve"
          columns={WHO_COLUMNS}
          rows={t.who}
          rowKey={(row) => row.userId}
          emptyText="No approver has a grant yet."
          short
        />
        <p className={styles.ruleLine}>{t.ruleLine}</p>
        {t.gaps.length > 0 ? (
          <div className={styles.gap}>
            <Pill tone="warning">GAP</Pill>
            <span>{gapText(t.gaps)}</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
