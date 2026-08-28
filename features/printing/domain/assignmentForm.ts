/**
 * The pure half of the assignment editor: what a form holds, what is wrong with
 * it, and the body that goes over the wire.
 *
 * It is a module rather than three closures inside `AssignmentEditor` because
 * EVERY RULE HERE IS SILENT WHEN IT IS WRONG. A dropped `ptaCompanyId` key
 * still saves -- as a 400 the operator reads as "something went wrong". A
 * `ptaPrinterId` left on a row whose mode moved to a bare queue name still
 * saves -- and the till then prints to the old profile. An omitted null still
 * saves -- and leaves the field it was meant to clear exactly as it was. None
 * of those show up in a render test; all of them show up here.
 *
 * The same argument as `buildSavePayload.ts` next door, for the same reason:
 * the request body is the contract, so the thing that builds it is the thing
 * worth pinning.
 *
 * WHAT IS NOT HERE: resolution. Narrowest-wins is a generated column and a
 * covering index on the server (`domain/ladder.ts` has the whole argument), and
 * this module never picks between rows -- it describes ONE.
 */

import { scopeIncoherence } from "./ladder";
import type {
  PrintTemplateAssignmentPayload,
  PrintTemplatePayload,
  PtaOutputMode,
  SavePrintTemplateAssignment,
} from "../types/printing";

/** `ck_pta_copies`, and the two varchar widths the columns actually have. */
export const ASSIGNMENT_COPIES_MIN = 1;
export const ASSIGNMENT_COPIES_MAX = 9;
export const ASSIGNMENT_REMARKS_MAX = 250;
export const ASSIGNMENT_PRINTER_NAME_MAX = 150;

/**
 * Where the paper comes out, as ONE choice rather than as two mutually
 * exclusive fields the operator has to keep apart themselves.
 *
 * `ck_pta_printer_one_of` refuses `pta_printer_id` and `pta_printer_name`
 * together, and the honest way to offer a constraint like that is a radio
 * group, not two inputs and a warning.
 */
export type PrinterMode = "DEFAULT" | "PROFILE" | "NAME";

export type AssignmentForm = {
  ptaCompanyId: string | null;
  ptaBranchId: string | null;
  ptaDeviceId: string | null;
  ptaPurposeId: string;
  ptaTemplateId: string;
  ptaOutputMode: PtaOutputMode;
  printerMode: PrinterMode;
  ptaPrinterName: string;
  /** "" = use the purpose's copy count. Kept as text so blank stays blank. */
  ptaCopies: string;
  ptaRemarks: string;
  ptaIsActive: boolean;
};

/** What the caller already knows: the cell that was clicked, or the toolbar's scope. */
export type AssignmentPrefill = {
  ptaCompanyId?: string | null;
  ptaBranchId?: string | null;
  ptaDeviceId?: string | null;
  ptaPurposeId?: string;
  ptaOutputMode?: PtaOutputMode;
};

/**
 * The form a row opens with, or an empty one shaped by where the operator
 * clicked.
 *
 * `printerMode` is READ BACK from which column is set, not stored: the row
 * carries the constraint's answer, and re-deriving it is what keeps a reopened
 * form saying the same thing the row does.
 */
export function assignmentFormFrom(
  editing: PrintTemplateAssignmentPayload | null,
  prefill: AssignmentPrefill = {},
): AssignmentForm {
  if (editing) {
    return {
      ptaCompanyId: editing.ptaCompanyId ?? null,
      ptaBranchId: editing.ptaBranchId ?? null,
      ptaDeviceId: editing.ptaDeviceId ?? null,
      ptaPurposeId: editing.ptaPurposeId,
      ptaTemplateId: editing.ptaTemplateId,
      ptaOutputMode: editing.ptaOutputMode,
      printerMode: editing.ptaPrinterId
        ? "PROFILE"
        : editing.ptaPrinterName
          ? "NAME"
          : "DEFAULT",
      ptaPrinterName: editing.ptaPrinterName ?? "",
      ptaCopies:
        editing.ptaCopies === null || editing.ptaCopies === undefined
          ? ""
          : String(editing.ptaCopies),
      ptaRemarks: editing.ptaRemarks ?? "",
      ptaIsActive: editing.ptaIsActive,
    };
  }

  return {
    // `undefined` in the prefill means "the caller did not say", and for the
    // company that is NOT the same as null -- null is a deliberate answer, the
    // widest rung. So it falls back to no company only when none was offered.
    ptaCompanyId: prefill.ptaCompanyId ?? null,
    ptaBranchId: prefill.ptaBranchId ?? null,
    ptaDeviceId: prefill.ptaDeviceId ?? null,
    ptaPurposeId: prefill.ptaPurposeId ?? "",
    ptaTemplateId: "",
    ptaOutputMode: prefill.ptaOutputMode ?? "PRINT",
    printerMode: "DEFAULT",
    ptaPrinterName: "",
    ptaCopies: "",
    ptaRemarks: "",
    ptaIsActive: true,
  };
}

/**
 * The designs a SCOPE may name, which is `ck_pta_template_scope` as a picker.
 *
 * The every-company rung may name only a SHIPPED design; a company may name a
 * shipped one or its own, and never another company's. The server enforces it
 * through the composite `fk_pta_template` and refuses the rest, but a picker
 * that offers what will be refused teaches the operator nothing -- the point of
 * filtering here is that the wrong answer is never on screen, not that the
 * check exists twice.
 *
 * Client-side because the endpoint has no "shipped only" flag: `onlyOwned`
 * cannot be sent as false (every query boolean is true-or-absent) and means the
 * opposite anyway.
 *
 * -- AND THE PURPOSE, WHICH NO CONSTRAINT CHECKS --------------------------
 *
 * `purposeId` narrows to the designs that declare THAT purpose, and this half
 * is the one worth reading twice: NOTHING IN THE DATABASE ENFORCES IT. There is
 * no constraint tying `pta_purpose_id` to the chosen design's
 * `ptl_purpose_id` -- assigning the Delivery Slip purpose an A4 Tax Invoice
 * design saves clean, 200, no warning anywhere.
 *
 * It then renders wrong at the till and nowhere else, because a design's
 * DATASETS are written for the document its purpose names: the invoice's
 * master query reads a sale bill, the slip's reads a delivery note, and the
 * bands bind by dataset number. The failure is a blank or wrong-document print
 * long after the person who chose it has left the screen.
 *
 * So this is a lint the schema does not have, which is exactly why it is here
 * and not merely on the server. Omit `purposeId` to keep every design -- the
 * caller that has not asked the question yet.
 */
export function templatesForScope(
  templates: PrintTemplatePayload[],
  companyId: string | null,
  purposeId?: string,
): PrintTemplatePayload[] {
  const allowed = companyId
    ? templates.filter(
        (template) =>
          template.ptlCompanyId === null || template.ptlCompanyId === companyId,
      )
    : templates.filter((template) => template.ptlCompanyId === null);

  const forPurpose = purposeId
    ? allowed.filter((template) => template.ptlPurposeId === purposeId)
    : allowed;

  return [...forPurpose].sort((left, right) =>
    left.ptlCode.localeCompare(right.ptlCode),
  );
}

/**
 * What is wrong with the form, by field, or an empty object.
 *
 * Every one of these is also a real constraint on the table. Saying them here
 * is about telling the operator WHERE the fault is -- a 400 carrying
 * `ck_pta_device_needs_branch` names a constraint, not a field -- and never
 * about being the only check.
 */
export function validateAssignmentForm(
  form: AssignmentForm,
): Partial<Record<keyof AssignmentForm, string>> {
  const found: Partial<Record<keyof AssignmentForm, string>> = {};

  // ck_pta_device_needs_branch / ck_pta_branch_needs_company. Reported against
  // the field that is MISSING rather than the one that is set: the operator
  // named a counter on purpose, and it is the branch they have to supply.
  const incoherent = scopeIncoherence(form);
  if (incoherent)
    found[form.ptaDeviceId ? "ptaBranchId" : "ptaCompanyId"] = incoherent;

  if (!form.ptaPurposeId)
    found.ptaPurposeId = "Say what this assignment prints.";
  if (!form.ptaTemplateId)
    found.ptaTemplateId = "Choose the design it prints with.";

  if (form.printerMode === "NAME") {
    const name = form.ptaPrinterName.trim();
    if (!name) {
      found.ptaPrinterName =
        "Name the queue, or fall back to the counter's default.";
    } else if (name.length > ASSIGNMENT_PRINTER_NAME_MAX) {
      found.ptaPrinterName = `At most ${ASSIGNMENT_PRINTER_NAME_MAX} characters.`;
    }
  }

  // Blank is a real answer -- "use the purpose's count" -- and is not 1.
  if (form.ptaCopies.trim()) {
    const copies = Number(form.ptaCopies);
    if (
      !Number.isInteger(copies) ||
      copies < ASSIGNMENT_COPIES_MIN ||
      copies > ASSIGNMENT_COPIES_MAX
    ) {
      found.ptaCopies = `${ASSIGNMENT_COPIES_MIN} to ${ASSIGNMENT_COPIES_MAX}, or blank to use the purpose's own count.`;
    }
  }

  if (form.ptaRemarks.length > ASSIGNMENT_REMARKS_MAX) {
    found.ptaRemarks = `At most ${ASSIGNMENT_REMARKS_MAX} characters.`;
  }

  return found;
}

/**
 * A save body on the widest rung, with the company stated as null rather than
 * left out.
 *
 * It exists because the difference is invisible at a glance and fatal at the
 * boundary: `{ ...base, ...(companyId ? { ptaCompanyId: companyId } : {}) }`
 * reads like "company, or every company" and means "company, or a 400". The
 * server refuses an OMITTED company on create rather than defaulting to the
 * widest rung -- "every company" is asked for, never arrived at.
 */
export function everyCompanyAssignment(
  body: Omit<SavePrintTemplateAssignment, "ptaCompanyId">,
): SavePrintTemplateAssignment {
  return { ...body, ptaCompanyId: null };
}

/**
 * The form as the request body.
 *
 * EVERY NULLABLE FIELD IS SENT EXPLICITLY, null included. The server merges a
 * patch by KEY PRESENCE (`applyPresentFields`), so an omitted key leaves the
 * old value in place -- "clear the printer" and "leave the printer alone" are
 * the same request unless the null is stated.
 *
 * `ptaTemplateCompanyKey` is NOT sent and never should be: the service reads
 * the owner off the template itself, which is the only reason the cross-company
 * lock means anything. A caller free to state the owner is free to state the
 * wrong one.
 *
 * Two asymmetries between create and update, both deliberate:
 *
 *   * `ptaIsActive: false` ON CREATE WRITES A DELETED ROW -- the service reads
 *     it as `isDeleted`, so the row is created already soft deleted and never
 *     appears again. The flag is therefore edit-only, and a create always
 *     writes an active row.
 *   * `ptaPrinterId` can be KEPT or CLEARED but not chosen, because
 *     `printer_profile` has no endpoint on the server at all. Keeping it means
 *     re-sending the id already on the row; every other mode clears it, which
 *     is what `ck_pta_printer_one_of` requires of the bare-name case.
 */
export function buildAssignmentBody(
  form: AssignmentForm,
  editing: PrintTemplateAssignmentPayload | null,
): SavePrintTemplateAssignment {
  const base = {
    ...(editing ? { ptaId: editing.ptaId } : {}),
    ptaBranchId: form.ptaBranchId,
    ptaDeviceId: form.ptaDeviceId,
    ptaPurposeId: form.ptaPurposeId,
    ptaTemplateId: form.ptaTemplateId,
    ptaOutputMode: form.ptaOutputMode,
    ptaPrinterId:
      form.printerMode === "PROFILE" ? (editing?.ptaPrinterId ?? null) : null,
    ptaPrinterName:
      form.printerMode === "NAME" ? form.ptaPrinterName.trim() : null,
    ptaCopies: form.ptaCopies.trim() ? Number(form.ptaCopies) : null,
    ptaRemarks: form.ptaRemarks.trim() || null,
    ...(editing ? { ptaIsActive: form.ptaIsActive } : {}),
  };

  return form.ptaCompanyId === null
    ? everyCompanyAssignment(base)
    : { ...base, ptaCompanyId: form.ptaCompanyId };
}
