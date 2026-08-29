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
 *   Print    the ladder's WINNER, with the print dialog opened on it
 *   Preview  the same design and the same document, without the print dialog
 *   Format   pick which design to render
 *   Pdf      the first configured design, no question asked
 *   Cancel   nothing happens
 *
 * All four render the same way, through `/print-render/preview`, and end in the
 * SAME popup. They differ by which template they pick and, for Print, by
 * whether the browser's print dialog opens on top. NONE of them writes to
 * `print_log` — see `onPrint` for what that costs and how to put it back.
 *
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
 *
 * That is now true of the WIRE too, not just of this component's props. The
 * render and resolve endpoints take company, branch, counter and accounting
 * year from the access token and the company's current fiscal year, so this
 * dialog sends none of them: a screen that stated the defaults would only be
 * restating, out of the same session, what the server already knows — and would
 * be free to state them wrong. The one thing still worth sending is a
 * DOCUMENT's own accounting year, and only where it may differ from the current
 * one: a reprint of last year's paper lives in last year's partition.
 *
 * The company IS still read here, from the business context, for the three
 * catalogue reads — purposes, designs, assignments. Those are pick lists being
 * narrowed for a human, not scope being claimed for a render.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import ModalPortal from "@/components/ui/modal-portal";
import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext } from "@/store/slices/authSlice";
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
  type FormatOption,
} from "@/features/printing/domain/printOptions";
import { purposeLabel } from "@/features/printing/domain/purposes";
import DocumentPreviewDialog from "@/features/printing/components/document-preview-dialog";
import styles from "@/features/printing/printing.module.scss";

export type PrintOptionsDialogProps = {
  open: boolean;
  onClose: () => void;
  /** `PURPOSE_CODE.SALE_QUOTATION` and friends — never an id. */
  purposeCode: string;
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
  const { open, onClose, purposeCode, target, documentLabel } = props;

  /*
   * The company the CATALOGUES are narrowed to, and nothing else.
   *
   * Not sent to `/resolve` and not sent to a render: both take the company from
   * the access token, and the two can legitimately differ — the header picker is
   * client state that auto-selects the first company, while the server always
   * acts as the token's. What this narrows is which purposes, designs and
   * assignments are offered to a human, where showing another tenant's list
   * would be the actual fault.
   */
  const companyId = useAppSelector(selectBusinessContext)?.companyId?.trim() ?? "";

  /** Which step: the five buttons, or the format list. */
  const [step, setStep] = useState<"ask" | "format">("ask");
  /** The dropdown's working value, before OK confirms it. */
  const [chosenPtlId, setChosenPtlId] = useState<string>("");
  /*
   * The design the operator CHOSE, once OK has confirmed it.
   *
   * Format picks a design; it does not print one. Choosing a format and being
   * shown paper in the same gesture makes it impossible to say "print it on
   * this" — the operator would have to go back through the chooser for every
   * one of Print, Preview and Pdf. So OK comes back to the buttons, and this is
   * what they then act on.
   *
   * Null means "whatever this counter is configured to use", which is what the
   * buttons did before a format was ever chosen and what they go back to when
   * the dialog is reopened.
   */
  const [selectedFormat, setSelectedFormat] = useState<FormatOption | null>(
    null,
  );
  /** The design the popup is showing, once one of the three has picked it. */
  const [previewing, setPreviewing] = useState<{
    ptlId: string;
    ptvId: string | null;
    /** Print asked for paper, not just a look. */
    autoPrint: boolean;
  } | null>(null);

  const { data: purposes, isLoading: purposesLoading } =
    useGetPrintPurposeOptionsQuery({ companyId: companyId || null }, { skip: !open });
  const purpose = findPurposeByCode(purposes, purposeCode);

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
   *
   * WHICH counter is not stated. Company, branch and device are optional on
   * `/resolve` and default to the session's own, so the purpose and the output
   * mode are the whole question this asks.
   */
  const resolveArgs = { purposeId: purpose?.ppoId ?? "" };
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
      ...(companyId ? { ptaCompanyId: companyId } : {}),
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
      ...(companyId ? { ptlCompanyId: companyId } : {}),
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
      setSelectedFormat(null);
      setPreviewing(null);
    }
  }, [open]);

  // Something is always selected when the list opens, so OK is never a dead
  // button waiting for a choice the operator did not know they had to make.
  // Reopening the chooser lands on the format already in force, not on the top
  // of the list — otherwise OK would silently change the choice.
  useEffect(() => {
    if (step === "format" && !chosenPtlId && options[0]) {
      setChosenPtlId(selectedFormat?.ptlId ?? options[0].ptlId);
    }
  }, [chosenPtlId, options, selectedFormat, step]);

  if (!open) {
    return null;
  }

  const heading =
    documentLabel ?? (purpose ? purposeLabel(purpose) : purposeCode);

  /** Every button ends here: one design, this document, rendered on open. */
  const showPreview = (
    ptlId: string,
    ptvId?: string | null,
    autoPrint = false,
  ): void => {
    setPreviewing({ ptlId, ptvId: ptvId ?? null, autoPrint });
  };

  /**
   * Which design Preview and Print both show.
   *
   * They ask the same question and must not answer it differently — an operator
   * who checks the paper and then prints it has to get the paper they checked.
   * So the resolution lives here once, and the two buttons differ by a single
   * boolean: whether the print dialog opens on top of it.
   */
  const resolveForViewing = (): {
    ptlId: string;
    ptvId: string | null;
  } | null => {
    if (previewResolution.isFetching || printResolution.isFetching) {
      toast.info("Still working out which design this counter uses…");
      return null;
    }
    // A design assigned for PREVIEW is what these buttons mean; the printing
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
      return null;
    }
    // `publishedRevId` is null until something is published. The popup then
    // takes the newest revision, and a DRAFT is renderable — which is the only
    // way a design still being drawn can be looked at against real data.
    return {
      ptlId: winner.ptaTemplateId,
      ptvId: winner.publishedRevId ?? null,
    };
  };

  /**
   * The design the action buttons act on.
   *
   * A chosen format wins over the ladder — that is the entire point of having
   * chosen one. No revision is named with it, so the popup takes the design's
   * published revision, else its newest.
   */
  const designForAction = (): { ptlId: string; ptvId: string | null } | null =>
    selectedFormat
      ? { ptlId: selectedFormat.ptlId, ptvId: null }
      : resolveForViewing();

  const onPreview = (): void => {
    const design = designForAction();
    if (design) showPreview(design.ptlId, design.ptvId);
  };

  /**
   * Print — the same document Preview shows, with the print dialog on top.
   *
   * -- IT NO LONGER WRITES TO `print_log` -----------------------------------
   *
   * It used to go through `POST /print-render/print`, which resolves the
   * ladder, renders every copy the purpose calls for, and appends one
   * `print_log` row per copy. It now renders through `/print-render/preview`
   * like the other three buttons, so nothing is logged and the copy count and
   * copy labels (ORIGINAL / DUPLICATE / TRIPLICATE) are not applied — one copy
   * of the paper, and no record that it came out.
   *
   * That is a deliberate instruction, not an oversight, and it is reversible:
   * `useDocumentPrint` still exists, unchanged and fully wired, though no screen
   * calls it any more — every way into a quotation's paper (the list page, the
   * entry screen's Save & print, and its F8 picker) now comes through here.
   * Restoring the logging is swapping this back for that hook.
   */
  const onPrint = (): void => {
    const design = designForAction();
    if (design) showPreview(design.ptlId, design.ptvId, true);
  };

  const onPdf = (): void => {
    // A chosen format wins here too; without one this is "the usual design,
    // without asking" — the first assignment.
    if (selectedFormat) {
      showPreview(selectedFormat.ptlId);
      return;
    }
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

  /**
   * OK on the chooser goes BACK to the buttons, not to paper.
   *
   * Choosing a format answers "on what", and Print / Preview / Pdf answer "and
   * then what" — two questions, asked in that order. Rendering here would
   * answer the second one on the operator's behalf, and pick the wrong answer
   * for anyone who came to Format in order to PRINT on something else.
   */
  const onFormatConfirm = (): void => {
    const chosen = options.find((option) => option.ptlId === chosenPtlId);
    if (!chosen) {
      toast.error("Choose a format first.");
      return;
    }
    setSelectedFormat(chosen);
    setStep("ask");
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
        autoPrint={previewing.autoPrint}
        docId={target.docId}
        accYear={target.accYear}
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
                {/* What the buttons will act on. Shown only once a format has
                    been chosen: before that they use whatever this counter is
                    configured for, and naming that would be stating the
                    default as though it were a decision. */}
                {selectedFormat ? (
                  <p className={styles.muted} style={{ margin: 0 }}>
                    Format: <strong>{selectedFormat.label}</strong>{" "}
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => setSelectedFormat(null)}
                    >
                      use the default
                    </button>
                  </p>
                ) : null}
              </div>
              <footer className={styles.modalFoot}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!purpose}
                  onClick={onPrint}
                >
                  Print
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
                  onClick={() => {
                    // Land on the format in force, not the top of the list.
                    setChosenPtlId(selectedFormat?.ptlId ?? "");
                    setStep("format");
                  }}
                >
                  Format
                </button>
                {/* Gated on ASSIGNMENTS, not on the design list — Pdf prints
                    the configured design, and a purpose can have designs drawn
                    for it with none of them wired to this counter. */}
                <button
                  type="button"
                  className={styles.btn}
                  disabled={!purpose || !(selectedFormat || hasAssignment)}
                  title={
                    selectedFormat
                      ? `Open ${selectedFormat.label}`
                      : hasAssignment
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
