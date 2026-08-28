"use client";

/**
 * The print dialog, as the counter staff already know it.
 *
 * -- WHY FIVE BUTTONS AND NOT ONE ------------------------------------------
 *
 * This is 3.0's dialog, kept because the people using it have pressed these
 * five buttons for years and the muscle memory is worth more than a tidier
 * design. What each one means, though, is now the printing module's:
 *
 *   Print    render through the assignment ladder and log it — real paper
 *   Preview  the ladder's WINNER, rendered against this document
 *   Format   pick which configured design to render
 *   Pdf      the first configured design, no question asked
 *   Cancel   nothing happens, and nothing is logged
 *
 * Only Print writes. The other three are readings of the same document through
 * a design, so they all end in the SAME popup and differ only by a template id.
 * Nothing navigates: the operator stays on the list they were working, and the
 * paper appears over it. Sending a till operator to the designer's canvas route
 * to look at one page would hand them a 1,000-element editor as a viewer.
 *
 * -- FORMAT LISTS DESIGNS; PDF TAKES THE CONFIGURED ONE --------------------
 *
 * Format reads `/print-templates/list?ptlPurposeId=` — every design drawn for
 * this purpose, whether or not a scope is wired to it. That is the whole point
 * of the button: "print this on something else". Pdf reads the ASSIGNMENTS and
 * takes the first, because "the usual way, without asking" is the opposite
 * question. `domain/printOptions.ts` keeps the two apart.
 *
 * -- IT ASKS FOR NOTHING IT CAN LOOK UP ------------------------------------
 *
 * Company, branch and counter come from the session; the purpose comes from the
 * screen as a CODE. Nothing here takes an id from a caller, because every id
 * this dialog needs is either resolved or configured.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import ModalPortal from "@/components/ui/modal-portal";
import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectUserInfo } from "@/store/slices/authSlice";
import {
  useListPrintingAssignmentsQuery,
  useResolvePrintingAssignmentQuery,
} from "@/features/printing/api/assignments";
import { useListPrintingTemplatesQuery } from "@/features/printing/api/templates";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import {
  findPurposeByCode,
  purposeNotConfigured,
  type DocumentPrintTarget,
} from "@/features/printing/domain/documentPrint";
import {
  firstAssignment,
  templateFormatOptions,
} from "@/features/printing/domain/printOptions";
import { purposeLabel } from "@/features/printing/domain/purposes";
import { useDocumentPrint } from "@/features/printing/hooks/useDocumentPrint";
import DocumentPreviewDialog from "@/features/printing/components/document-preview-dialog";
import styles from "@/features/printing/printing.module.scss";

export type PrintOptionsDialogProps = {
  open: boolean;
  onClose: () => void;
  /** `PURPOSE_CODE.SALE_QUOTATION` and friends — never an id. */
  purposeCode: string;
  companyId: string;
  branchId?: string | null;
  /** The document, and what to call the file. */
  target: DocumentPrintTarget;
  /** Overrides the "Godown Delivery Chit" in the question. Defaults to the purpose's name. */
  documentLabel?: string;
};

/** How many configured designs to offer before the list is a scrolling problem. */
const ASSIGNMENT_LIMIT = 100;
/** The server caps this at 100; a purpose with more designs is not a real one. */
const TEMPLATE_LIMIT = 100;

export function PrintOptionsDialog(props: PrintOptionsDialogProps) {
  const {
    open,
    onClose,
    purposeCode,
    companyId,
    branchId,
    target,
    documentLabel,
  } = props;

  const userInfo = useAppSelector(selectUserInfo);
  /*
   * The COUNTER, and a real `fixed.device_master` row — the id the login
   * response carries, not `getOrCreateClientDeviceId()`, which is a localStorage
   * uuid minted for the transaction-hold lock and names no device anywhere.
   * Getting these two confused resolves the ladder one rung too wide and, on a
   * print, fails `fk_plg_device` after the paper has already been rendered.
   */
  const deviceId = userInfo?.deviceId?.trim() || undefined;

  /** Which step: the five buttons, the format list, or the rendered paper. */
  const [step, setStep] = useState<"ask" | "format">("ask");
  const [chosenPtlId, setChosenPtlId] = useState<string>("");
  /** The design the popup is showing, once one of the three has picked it. */
  const [previewing, setPreviewing] = useState<{
    ptlId: string;
    ptvId: string | null;
  } | null>(null);

  const { data: purposes, isLoading: purposesLoading } =
    useGetPrintPurposeOptionsQuery(
      { companyId: companyId.trim() ? companyId : null },
      { skip: !open },
    );
  const purpose = findPurposeByCode(purposes, purposeCode);

  const { print, isPrinting } = useDocumentPrint({ companyId, purposeCode });

  /*
   * The ladder's winner, for Preview — asked TWICE, on purpose.
   *
   * Output mode is part of the resolution key, not a rendering detail: a
   * counter may be assigned one design for the paper it prints and another for
   * the PDF it mails, and PREVIEW is a mode of its own. So Preview asks for the
   * PREVIEW design first, which is what an installation that has bothered to
   * assign one means by the word.
   *
   * The second call is the same question with no mode, which the server reads
   * as PRINT — the design this document would actually come out on. It is the
   * honest fallback for the common installation that never assigned a separate
   * preview design, and it is a WIDENING rather than a second opinion: both
   * answers come from `/resolve`, and nothing here re-derives narrowest-wins.
   * `domain/ladder.ts` says at length why that rule matters.
   *
   * Both run together rather than in sequence — they are two cheap indexed GETs
   * and chaining them would put a round trip between the click and the paper.
   * A 404 from both is a real answer: nothing is configured for this counter.
   */
  const resolveArgs = {
    companyId,
    purposeId: purpose?.ppoId ?? "",
    ...(branchId?.trim() ? { branchId } : {}),
    ...(deviceId ? { deviceId } : {}),
  };
  const skipResolve = { skip: !open || !purpose };
  const previewResolution = useResolvePrintingAssignmentQuery(
    { ...resolveArgs, outputMode: "PREVIEW" },
    skipResolve,
  );
  const printResolution = useResolvePrintingAssignmentQuery(
    resolveArgs,
    skipResolve,
  );

  /** Everything configured for this purpose — what Pdf takes the first of. */
  const assignmentList = useListPrintingAssignmentsQuery(
    {
      ptaCompanyId: companyId,
      includeGlobal: true,
      ptaPurposeId: purpose?.ppoId ?? "",
      limit: ASSIGNMENT_LIMIT,
    },
    { skip: !open || !purpose },
  );

  /*
   * Every design drawn for this purpose — the Format list.
   *
   * Scoped by company rather than left unfiltered: with `ptlCompanyId` the
   * server returns this company's designs AND the shipped ones it may use,
   * which is the set an operator is allowed to print on. Without it the list
   * would reach across tenants.
   *
   * `includeVersions: false` IS NOT SENT, and asking for it would be a lie.
   * That parameter defaults to TRUE server-side, and it is the one case where
   * the module's query-boolean rule bites in reverse: `enableImplicitConversion`
   * coerces the string "false" to `true`, so no encoding can express it and
   * omission means the default rather than false. Verified on 28-08-2026 — the
   * response is byte-identical with the key absent, `=false` and `=0`.
   *
   * So this pick list arrives with every version and dataset attached, ~360 KB
   * for four designs. It is cached by RTK Query for the dialog's lifetime and
   * only the id and name are read. Closing it properly is a server change.
   */
  const templateList = useListPrintingTemplatesQuery(
    {
      ptlPurposeId: purpose?.ppoId ?? "",
      limit: TEMPLATE_LIMIT,
      ...(companyId.trim() ? { ptlCompanyId: companyId } : {}),
    },
    { skip: !open || !purpose },
  );

  const options = useMemo(
    () => templateFormatOptions(templateList.data?.items),
    [templateList.data?.items],
  );

  const hasAssignment = Boolean(
    firstAssignment(assignmentList.data?.items, purpose?.ppoId ?? ""),
  );

  // Back to the five buttons whenever the dialog is reopened, so it never
  // reappears halfway through a choice the operator has since abandoned.
  useEffect(() => {
    if (open) {
      setStep("ask");
      setChosenPtlId("");
      setPreviewing(null);
    }
  }, [open]);

  // Something is always selected when the list opens, so OK is never a dead
  // button waiting for a choice the operator did not know they had to make.
  useEffect(() => {
    if (step === "format" && !chosenPtlId && options[0]) {
      setChosenPtlId(options[0].ptlId);
    }
  }, [chosenPtlId, options, step]);

  if (!open) {
    return null;
  }

  const heading =
    documentLabel ?? (purpose ? purposeLabel(purpose) : purposeCode);

  /** All three preview paths end here: one design, this document, rendered on open. */
  const showPreview = (ptlId: string, ptvId?: string | null): void => {
    setPreviewing({ ptlId, ptvId: ptvId ?? null });
  };

  const onPreview = (): void => {
    if (previewResolution.isFetching || printResolution.isFetching) {
      toast.info("Still working out which design this counter uses…");
      return;
    }
    // A design assigned for PREVIEW is what this button means; the printing
    // design is the fallback for an installation that assigned only one.
    const winner = previewResolution.data ?? printResolution.data;
    if (!winner) {
      // The server's own sentence names the scope that resolved nothing, which
      // is what an administrator has to go and fix. The PRINT refusal is the
      // one worth showing: "nothing assigned for PREVIEW" would send them off
      // to configure a mode they may never have wanted.
      toast.error(
        getApiErrorMessage(printResolution.error as never) ??
          "Nothing is assigned to print this document at this counter.",
      );
      return;
    }
    // `publishedRevId` is null until something is published. The canvas then
    // opens the newest revision, and a DRAFT is previewable — which is the only
    // way a design still being drawn can be looked at against real data.
    showPreview(winner.ptaTemplateId, winner.publishedRevId);
  };

  const onPdf = (): void => {
    const first = firstAssignment(
      assignmentList.data?.items,
      purpose?.ppoId ?? "",
    );
    if (!first) {
      toast.error("No design is configured for this document yet.");
      return;
    }
    showPreview(first.ptaTemplateId);
  };

  const onFormatConfirm = (): void => {
    const chosen = options.find((option) => option.ptlId === chosenPtlId);
    if (!chosen) {
      toast.error("Choose a format first.");
      return;
    }
    // No revision named: the popup takes the published one, else the newest.
    showPreview(chosen.ptlId);
  };

  const onPrint = async (): Promise<void> => {
    // The only button that writes. `useDocumentPrint` owns the ladder, the
    // print log and getting the bytes to a printer; a refusal is its own toast.
    const printed = await print(target);
    if (printed) {
      onClose();
    }
  };

  if (previewing) {
    /*
     * The popup REPLACES this dialog rather than stacking on it: two modals
     * deep is a scrim over a scrim, and closing the paper should put the
     * operator back on the list they came from, not on the question they have
     * already answered.
     */
    return (
      <DocumentPreviewDialog
        onClose={onClose}
        ptlId={previewing.ptlId}
        ptvId={previewing.ptvId}
        docId={target.docId}
        accYear={target.accYear}
        branchId={target.branchId ?? branchId}
        deviceId={deviceId}
        title={heading}
      />
    );
  }

  return (
    <ModalPortal>
      <div className={styles.overlay}>
        <div className={styles.backdrop} onClick={onClose} />
        <div
          className={styles.modal}
          style={{ width: "min(100%, 460px)" }}
          role="dialog"
          aria-modal="true"
        >
          {step === "ask" ? (
            <>
              <header className={styles.modalHead}>
                <h2 className={styles.modalTitle}>Print</h2>
              </header>
              <div className={styles.modalBody}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {`Make sure, Do you want to print "${heading}"?`}
                </p>
                {purposesLoading ? (
                  <p className={styles.muted}>
                    Loading what this installation can print…
                  </p>
                ) : purpose ? null : (
                  <p className={styles.muted}>
                    {purposeNotConfigured(purposeCode)}
                  </p>
                )}
              </div>
              <footer className={styles.modalFoot}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!purpose || isPrinting}
                  onClick={() => void onPrint()}
                >
                  {isPrinting ? "Printing…" : "Print"}
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={!purpose}
                  onClick={onPreview}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={!purpose || options.length === 0}
                  title={
                    options.length === 0
                      ? "No design has been drawn for this document yet"
                      : "Choose which design to print on"
                  }
                  onClick={() => setStep("format")}
                >
                  Format
                </button>
                {/* Gated on ASSIGNMENTS, not on the design list — Pdf prints
                    the configured design, and a purpose can have designs drawn
                    for it with none of them wired to this counter. */}
                <button
                  type="button"
                  className={styles.btn}
                  disabled={!purpose || !hasAssignment}
                  title={
                    hasAssignment
                      ? "Print the design configured for this counter"
                      : "No design is assigned to this counter yet"
                  }
                  onClick={onPdf}
                >
                  Pdf
                </button>
                <button type="button" className={styles.btn} onClick={onClose}>
                  Cancel
                </button>
              </footer>
            </>
          ) : (
            <>
              <header className={styles.modalHead}>
                <h2 className={styles.modalTitle}>Choose Printing Format</h2>
              </header>
              <div className={styles.modalBody}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Format Name:</span>
                  <select
                    className={styles.select}
                    value={chosenPtlId}
                    autoFocus
                    onChange={(event) => setChosenPtlId(event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option.ptlId} value={option.ptlId}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <footer className={styles.modalFoot}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => setStep("ask")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!chosenPtlId}
                  onClick={onFormatConfirm}
                >
                  OK
                </button>
              </footer>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

export default PrintOptionsDialog;
