"use client";

/**
 * The form over ONE `pta_` row -- the thing the matrix screen has been saying
 * is missing.
 *
 * -- WHAT A ROW IS --------------------------------------------------------
 *
 * One row is one CHOICE: at this scope, printing this purpose in this output
 * mode, use this design, on this printer, this many times. There is no
 * `is_default` flag anywhere in the subsystem and there must not be one here:
 * default-ness IS the row's existence, so "make this the default" is a create
 * and "stop using it" is a delete, never a boolean cleared on the siblings.
 *
 * -- THE FIVE RULES THIS FORM ENFORCES BEFORE THE ROUND TRIP ---------------
 *
 * All five are real constraints the server also states; saying them here is
 * about telling the operator WHERE the fault is, never about being the only
 * check.
 *
 *   1. `ptaCompanyId` IS ALWAYS A KEY IN THE BODY. Null is the widest rung --
 *      an assignment for every company -- and the server refuses an OMITTED
 *      company rather than defaulting to it. `JSON.stringify` drops `undefined`
 *      and keeps `null`, so the null case is built through
 *      `everyCompanyAssignment`, which is the one place that says it out loud.
 *   2. A counter needs its branch and a branch needs its company
 *      (`ck_pta_device_needs_branch`, `ck_pta_branch_needs_company`) --
 *      `scopeIncoherence` is that sentence.
 *   3. A design belongs to its owner: the every-company rung may only name a
 *      SHIPPED design, and a company may only name a shipped one or its own
 *      (`ck_pta_template_scope`). The picker therefore OFFERS only what the
 *      scope may have, rather than letting the 400 explain it.
 *   4. Printer is one answer or none, never two (`ck_pta_printer_one_of`): a
 *      registered profile, or a bare queue name, or the counter's default.
 *   5. Copies overrides the purpose's count and is 1..9; blank means "use the
 *      purpose's", which is not the same as 1.
 *
 * -- TWO ASYMMETRIES BETWEEN CREATE AND UPDATE ----------------------------
 *
 * `ptaIsActive: false` ON CREATE WRITES A DELETED ROW. The service reads it as
 * `isDeleted`, so a row created inactive is created already soft deleted and
 * never appears again. The toggle is therefore edit-only, and creating always
 * writes an active row.
 *
 * `ptaPrinterId` HAS NO PICKER, because `printer_profile` has no endpoint --
 * there is no controller for it on the server at all. An existing profile can
 * be KEPT or CLEARED here and its joined name shown, but not chosen; a scope
 * whose printer nobody has registered gets the bare queue name instead. When
 * that endpoint lands, this is the one field to grow a `<select>`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import ModalPortal from "@/components/ui/modal-portal";
import { getApiErrorMessage } from "@/store/api";
import {
  useGetBranchesByCompanyQuery,
  useGetCompanyListQuery,
} from "@/store/api/businessContextApi";
import { useGetCounterOptionsQuery } from "@/store/api/appSettingsApi";
import { useSavePrintingAssignmentMutation } from "@/features/printing/api/assignments";
import { useListPrintingTemplatesQuery } from "@/features/printing/api/templates";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import { RUNG_LABEL, rungOf } from "@/features/printing/domain/ladder";
import {
  ASSIGNMENT_PRINTER_NAME_MAX,
  ASSIGNMENT_REMARKS_MAX,
  assignmentFormFrom,
  buildAssignmentBody,
  templatesForScope,
  validateAssignmentForm,
  type AssignmentForm,
  type AssignmentPrefill,
  type PrinterMode,
} from "@/features/printing/domain/assignmentForm";
import { purposeLabel } from "@/features/printing/domain/purposes";
import {
  PTA_OUTPUT_MODE_VALUES,
  type PrintTemplateAssignmentPayload,
  type PtaOutputMode,
} from "@/features/printing/types/printing";
import { Note } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

/**
 * The shape, the rules and the body all live in `domain/assignmentForm.ts` --
 * every one of them is silent when it is wrong, so they are pinned by tests
 * rather than by this component's render.
 */
export type { AssignmentPrefill };

export default function AssignmentEditor({
  editing,
  prefill = {},
  onClose,
  onSaved,
}: {
  /** The row being edited, or null to create one. */
  editing: PrintTemplateAssignmentPayload | null;
  prefill?: AssignmentPrefill;
  onClose: () => void;
  onSaved?: (saved: PrintTemplateAssignmentPayload) => void;
}) {
  const [form, setForm] = useState<AssignmentForm>(() => assignmentFormFrom(editing, prefill));
  const [submitted, setSubmitted] = useState(false);
  const [saveAssignment, { isLoading: isSaving }] = useSavePrintingAssignmentMutation();

  const patch = useCallback((next: Partial<AssignmentForm>) => {
    setForm((current) => ({ ...current, ...next }));
  }, []);

  const { data: companies = [] } = useGetCompanyListQuery();
  const { data: branches = [] } = useGetBranchesByCompanyQuery(form.ptaCompanyId ?? "", {
    skip: !form.ptaCompanyId,
  });
  const { data: counters = [] } = useGetCounterOptionsQuery();
  const { data: catalogue = [] } = useGetPrintPurposeOptionsQuery({
    companyId: form.ptaCompanyId,
  });

  /*
   * The designs this SCOPE may name. With a company the server already answers
   * "its own plus the shipped ones"; with no company the every-company rung may
   * only name a shipped design, and nothing but a client-side filter says so
   * because the endpoint has no "shipped only" flag -- `onlyOwned` cannot be
   * sent as false, and would mean the opposite anyway.
   */
  const { data: templatePage } = useListPrintingTemplatesQuery({
    limit: 100,
    includeVersions: false,
    ptlIsActive: true,
    ...(form.ptaCompanyId ? { ptlCompanyId: form.ptaCompanyId } : {}),
    // Narrowed server-side as well as in `templatesForScope`, and not only to
    // save a filter: the endpoint caps at 100 rows, so a site with more designs
    // than that would have the picker silently truncate — and the one it
    // dropped would be missing with no sign that anything was.
    ...(form.ptaPurposeId ? { ptlPurposeId: form.ptaPurposeId } : {}),
  });
  const templates = useMemo(
    () => templatesForScope(templatePage?.items ?? [], form.ptaCompanyId, form.ptaPurposeId),
    [templatePage, form.ptaCompanyId, form.ptaPurposeId],
  );

  const purposes = useMemo(
    () =>
      [...catalogue].sort((left, right) => purposeLabel(left).localeCompare(purposeLabel(right))),
    [catalogue],
  );

  const selectedTemplate = templates.find((template) => template.ptlId === form.ptaTemplateId);
  const rung = rungOf(form);

  /*
   * A purpose or design the picker cannot offer is still what the row SAYS.
   * That happens for a real reason -- an inactive design, another company's
   * purpose, a catalogue that failed to read -- and dropping the value silently
   * would rewrite the row on the next save.
   */
  const missingPurpose =
    Boolean(form.ptaPurposeId) &&
    purposes.every((purpose) => purpose.ppoId !== form.ptaPurposeId);
  /*
   * ...and now also because the PURPOSE changed under it. Switching purpose on
   * a half-filled form leaves the design that was chosen for the old one still
   * selected; it is kept rather than cleared, on the same argument, and this is
   * what says so out loud.
   */
  const missingTemplate = Boolean(form.ptaTemplateId) && !selectedTemplate;

  const errors = useMemo(() => validateAssignmentForm(form), [form]);

  const showError = (field: keyof AssignmentForm): string | null =>
    submitted ? (errors[field] ?? null) : null;

  const save = useCallback(async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    const body = buildAssignmentBody(form, editing);

    try {
      const saved = await saveAssignment(body).unwrap();
      toast.success(editing ? "Assignment updated." : "Assignment created.");
      onSaved?.(saved);
      onClose();
    } catch (thrown) {
      // The common refusals are a 409 -- one choice per scope already exists --
      // and a 400 naming the field, both of which the message carries.
      toast.error(getApiErrorMessage(thrown as never) ?? "Could not save the assignment.");
    }
  }, [editing, errors, form, onClose, onSaved, saveAssignment]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSaving, onClose]);

  const companyName =
    companies.find((company) => company.id === form.ptaCompanyId)?.name ?? "this company";

  return (
    <ModalPortal>
      {/* Overlay, backdrop and panel are three elements on purpose — see
          `modal-portal.tsx`: the scrim on the overlay itself ghosts over the
          panel on a GPU-composited Chromium. */}
      <div className={styles.overlay} role="presentation">
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close"
          onMouseDown={() => !isSaving && onClose()}
        />
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Edit assignment" : "New assignment"}
        >
          <header className={styles.modalHead}>
            <h2 className={styles.modalTitle}>
              {editing ? "Edit assignment" : "New assignment"}
            </h2>
            <span className={`${styles.chip} ${styles.chipBlue}`} title="Read off the scope columns">
              {RUNG_LABEL[rung]}
            </span>
          </header>

          <div className={styles.modalBody}>
            <section className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>
                Scope <span className={styles.mono}>pta_company_id / branch / device</span>
              </h3>

              <div className={styles.grid2}>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Company</span>
                  <select
                    className={styles.select}
                    value={form.ptaCompanyId ?? ""}
                    onChange={(event) =>
                      // A branch of the old company is not a branch of the new
                      // one, and a design private to it is not this one's to
                      // name. All three are dropped rather than left pointing
                      // somewhere the database will refuse.
                      patch({
                        ptaCompanyId: event.target.value || null,
                        ptaBranchId: null,
                        ptaDeviceId: null,
                        ptaTemplateId: "",
                      })
                    }
                  >
                    <option value="">Every company (shipped designs only)</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Branch</span>
                  <select
                    className={styles.select}
                    value={form.ptaBranchId ?? ""}
                    disabled={!form.ptaCompanyId}
                    title={
                      form.ptaCompanyId
                        ? undefined
                        : "A branch belongs to a company — name the company first"
                    }
                    onChange={(event) =>
                      patch({ ptaBranchId: event.target.value || null, ptaDeviceId: null })
                    }
                  >
                    <option value="">Every branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Counter</span>
                  <select
                    className={styles.select}
                    value={form.ptaDeviceId ?? ""}
                    disabled={!form.ptaBranchId}
                    title={
                      form.ptaBranchId
                        ? "Every till on the installation — the lookup takes no branch"
                        : "A counter belongs to a branch — name the branch first"
                    }
                    onChange={(event) => patch({ ptaDeviceId: event.target.value || null })}
                  >
                    <option value="">Every counter</option>
                    {counters.map((counter) => (
                      <option key={counter.id} value={counter.id}>
                        {counter.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {showError("ptaCompanyId") ? (
                <p className={styles.fieldError}>{showError("ptaCompanyId")}</p>
              ) : null}
              {showError("ptaBranchId") ? (
                <p className={styles.fieldError}>{showError("ptaBranchId")}</p>
              ) : null}

              {form.ptaCompanyId === null ? (
                <Note tone="amber">
                  The widest rung: every company that has not said otherwise prints this. Only a
                  design shipped with the product may sit here — one company&apos;s logo and
                  address must never reach another company&apos;s paper.
                </Note>
              ) : null}
            </section>

            <section className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>
                What prints <span className={styles.mono}>pta_purpose_id / template_id</span>
              </h3>

              <div className={styles.grid2}>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Purpose</span>
                  <select
                    className={styles.select}
                    value={form.ptaPurposeId}
                    onChange={(event) =>
                      // The design goes with it. A design written for the OLD
                      // purpose is the one mismatch the database accepts --
                      // there is no FK and no CHECK tying pta_purpose_id to the
                      // design's own -- so it would save clean and print the
                      // wrong document at the till. Same reasoning as dropping
                      // the design when the company changes, except that one
                      // the database would at least refuse.
                      patch({ ptaPurposeId: event.target.value, ptaTemplateId: "" })
                    }
                  >
                    <option value="">Choose…</option>
                    {missingPurpose ? (
                      <option value={form.ptaPurposeId}>
                        {editing?.ptaPurposeName ?? editing?.ptaPurposeCode ?? "(on this row)"}
                      </option>
                    ) : null}
                    {purposes.map((purpose) => (
                      <option key={purpose.ppoId} value={purpose.ppoId}>
                        {purposeLabel(purpose)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span
                    className={styles.fieldLabel}
                    title="Part of the resolution key — a 3-inch receipt is a different artifact from an A4 invoice"
                  >
                    Output mode
                  </span>
                  <select
                    className={styles.select}
                    value={form.ptaOutputMode}
                    onChange={(event) =>
                      patch({ ptaOutputMode: event.target.value as PtaOutputMode })
                    }
                  >
                    {PTA_OUTPUT_MODE_VALUES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fieldWide} ${styles.fieldSpan}`}>
                  <span className={styles.fieldLabel}>Design</span>
                  <select
                    className={styles.select}
                    value={form.ptaTemplateId}
                    onChange={(event) => patch({ ptaTemplateId: event.target.value })}
                  >
                    <option value="">Choose…</option>
                    {missingTemplate ? (
                      <option value={form.ptaTemplateId}>
                        {editing?.ptaTemplateName ??
                          editing?.ptaTemplateCode ??
                          "(chosen for another purpose)"}
                      </option>
                    ) : null}
                    {templates.map((template) => (
                      <option key={template.ptlId} value={template.ptlId}>
                        {template.ptlCode} · {template.ptlName}
                        {template.ptlCompanyId === null ? " · shipped" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {showError("ptaPurposeId") ? (
                <p className={styles.fieldError}>{showError("ptaPurposeId")}</p>
              ) : null}
              {showError("ptaTemplateId") ? (
                <p className={styles.fieldError}>{showError("ptaTemplateId")}</p>
              ) : null}

              {missingTemplate ? (
                <Note tone="amber">
                  This row names a design the picker cannot offer here — it is inactive, private to
                  another company, or written for a DIFFERENT purpose. The first two the database
                  refuses on save. The third it accepts: nothing ties a purpose to the design’s own,
                  so it saves clean and then prints the wrong document at the till. Choose one from
                  the list unless you know exactly why not.
                </Note>
              ) : null}

              {/*
               * The loud one. A design with no published revision resolves and
               * then prints NOTHING, and that is discovered at a till unless it
               * is said here.
               */}
              {selectedTemplate && !selectedTemplate.ptlPublishedRevId ? (
                <Note tone="red">
                  <span className={styles.mono}>{selectedTemplate.ptlCode}</span> has no published
                  revision. This assignment would resolve to it and the counter would print
                  nothing — publish a revision first.
                </Note>
              ) : null}

              {templates.length === 0 ? (
                <Note tone="amber">
                  No design is available to {form.ptaCompanyId ? companyName : "the every-company rung"}.
                  {form.ptaCompanyId
                    ? " Create one, or fork a shipped design, on the Templates screen."
                    : " Only designs shipped with the product may sit on this rung."}
                </Note>
              ) : null}
            </section>

            <section className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>
                How it prints <span className={styles.mono}>pta_printer_* / pta_copies</span>
              </h3>

              <div className={styles.grid2}>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Printer</span>
                  <select
                    className={styles.select}
                    value={form.printerMode}
                    onChange={(event) => patch({ printerMode: event.target.value as PrinterMode })}
                  >
                    <option value="DEFAULT">The counter&apos;s default queue</option>
                    <option value="NAME">A bare queue name</option>
                    {editing?.ptaPrinterId ? (
                      <option value="PROFILE">
                        Registered profile · {editing.ptaPrinterProfileName ?? "keep"}
                      </option>
                    ) : null}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Queue name</span>
                  <input
                    className={styles.input}
                    value={form.ptaPrinterName}
                    maxLength={ASSIGNMENT_PRINTER_NAME_MAX}
                    disabled={form.printerMode !== "NAME"}
                    placeholder={form.printerMode === "NAME" ? "e.g. \\\\SERVER\\TILL3" : "—"}
                    onChange={(event) => patch({ ptaPrinterName: event.target.value })}
                  />
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Copies</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    max={9}
                    value={form.ptaCopies}
                    placeholder="use the purpose's count"
                    onChange={(event) => patch({ ptaCopies: event.target.value })}
                  />
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span className={styles.fieldLabel}>Active</span>
                  <span className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={editing ? form.ptaIsActive : true}
                      disabled={!editing}
                      title={
                        editing
                          ? "An inactive row resolves for nobody; the next rung up takes over"
                          : "A new assignment is created active — an inactive one would be created already deleted"
                      }
                      onChange={(event) => patch({ ptaIsActive: event.target.checked })}
                    />
                    {editing ? "Resolves at this scope" : "Created active"}
                  </span>
                </label>
              </div>

              {showError("ptaPrinterName") ? (
                <p className={styles.fieldError}>{showError("ptaPrinterName")}</p>
              ) : null}
              {showError("ptaCopies") ? (
                <p className={styles.fieldError}>{showError("ptaCopies")}</p>
              ) : null}

              {form.printerMode === "NAME" ? (
                <Note>
                  A fallback for a printer nobody has registered. A render through a bare name
                  asserts nothing about paper, codepage or column count — never type a profile&apos;s
                  name here, because it goes stale the day the profile is renamed.
                </Note>
              ) : null}
            </section>

            <section className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>
                Remarks <span className={styles.mono}>pta_remarks</span>
              </h3>
              <input
                className={styles.input}
                value={form.ptaRemarks}
                maxLength={ASSIGNMENT_REMARKS_MAX}
                placeholder="why this scope prints differently…"
                onChange={(event) => patch({ ptaRemarks: event.target.value })}
              />
              {showError("ptaRemarks") ? (
                <p className={styles.fieldError}>{showError("ptaRemarks")}</p>
              ) : null}
            </section>

            <Note tone="blue">
              One row is one choice, so there is no “default” to tick: this assignment IS the
              default for {RUNG_LABEL[rung].toLowerCase()} until a narrower one beats it. Deleting
              it hands the scope back to the rung above.
            </Note>
          </div>

          <footer className={styles.modalFoot}>
            <span className={styles.footerNote}>
              {editing ? (
                <>
                  <span className={styles.mono}>{editing.ptaId.slice(0, 8)}</span> ·{" "}
                  {editing.ptaScope}
                </>
              ) : (
                "One choice per company, branch, counter, purpose and output mode."
              )}
            </span>
            <button type="button" className={styles.btn} disabled={isSaving} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={isSaving}
              onClick={() => void save()}
            >
              {isSaving ? "Saving…" : editing ? "Save changes" : "Create"}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
