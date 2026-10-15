"use client";

/**
 * X read — Qt `TillXReadDialog` (c77f3f1, notes 117 §6): the answer of POST
 * /till/sessions/x-report, read only — every tender's expected figures at
 * this moment, the server's X number and time, the cash the drawer should
 * hold now. Print renders purpose TILL_SESSION_X (the 80 mm X read) for the
 * session the cockpit names. What it shows is `x-read.ts`.
 *
 * Keys: Esc closes (the print dialog first, when it is up).
 */
import { useState } from "react";
import { cx } from "@/components/design-system/cx";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE, type DocumentPrintTarget } from "@/features/printing/domain/documentPrint";
import { TillDialog } from "../shared/till-dialog";
import type { TillXReport } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import local from "./sessions.module.scss";
import { X_CASH_CAPTION, X_FIGURES, X_NOTE, xReadView } from "./x-read";

export type XReadRequest = {
  report: TillXReport;
  /** The session as a print document (`sessionPrintTarget(…, "x")`). */
  target: DocumentPrintTarget;
  /** "X read <session no>" */
  label: string;
};

export type XReadDialogProps = {
  request: XReadRequest | null;
  onClose: () => void;
};

export function XReadDialog({ request, onClose }: XReadDialogProps) {
  return request ? <XReadBody request={request} onClose={onClose} /> : null;
}

function XReadBody({ request, onClose }: { request: XReadRequest; onClose: () => void }) {
  const [view] = useState(() => xReadView(request.report));
  const [printOpen, setPrintOpen] = useState(false);
  const printable = Boolean(request.target.docId);

  return (
    <TillDialog
      open
      size="wide"
      title={view.title}
      subtitle={view.sub}
      // The print dialog owns no Escape of its own: the first Esc closes it.
      onClose={() => (printOpen ? setPrintOpen(false) : onClose())}
      footer={
        <>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!printable}
            title="Print the X read (80 mm): purpose TILL_SESSION_X"
            onClick={() => setPrintOpen(true)}
          >
            Print
          </button>
          <button type="button" className={styles.secondaryButton} autoFocus onClick={onClose}>
            Esc  Close
          </button>
        </>
      }
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Tender</th>
              <th scope="col">Mode</th>
              {X_FIGURES.map(([field, caption]) => (
                <th key={field} scope="col" className={styles.right}>
                  {caption}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.key}>
                <td>{row.tender}</td>
                <td>{row.mode}</td>
                {row.cells.map((cell, index) => (
                  <td key={index} className={cx(styles.right, cell === "—" && styles.toneMuted)}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {view.rows.length === 0 ? (
              <tr>
                <td colSpan={2 + X_FIGURES.length} className={styles.emptyCell}>
                  No tender in this session yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className={local.xFoot}>
        <p className={styles.muted}>{X_NOTE}</p>
        <span className={styles.spacer} />
        <span className={styles.cap}>{X_CASH_CAPTION}</span>
        <span className={styles.figure}>{view.cash}</span>
      </div>

      {printOpen ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintOpen(false)}
          purposeCode={PURPOSE_CODE.TILL_SESSION_X}
          documentLabel={request.label}
          targets={[request.target]}
        />
      ) : null}
    </TillDialog>
  );
}
