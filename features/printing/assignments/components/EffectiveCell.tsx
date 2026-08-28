"use client";

/**
 * "Effective here" -- what this counter ACTUALLY gets, straight from
 * `GET /print-template-assignments/resolve`.
 *
 * THE LADDER IS NOT RE-DERIVED HERE. Narrowest-wins is a generated column plus
 * a covering index on the server, and a front-end that recomputed it would
 * drift from the thing that actually prints. The scope label is the server's
 * own decoded `scope` field, which is also why `ptaSpecificity` -- whose
 * numbering the correction migration rewrote from underneath every reader --
 * is never read.
 *
 * A 404 is a real answer and the most important one on the screen: NOTHING is
 * configured for that scope, so the till prints nothing. It is rendered as a
 * warning, not as an error.
 */

import Link from "next/link";

import { useResolvePrintingAssignmentQuery } from "@/features/printing/api/assignments";
import { RUNG_LABEL, rungOfServerScope } from "@/features/printing/domain/ladder";
import { printingDesignerRoute } from "@/features/printing/routes";
import type { PtaOutputMode } from "@/features/printing/types/printing";
import styles from "@/features/printing/printing.module.scss";

export default function EffectiveCell({
  companyId,
  branchId,
  deviceId,
  purposeId,
  outputMode,
}: {
  companyId: string;
  branchId: string | null;
  deviceId: string | null;
  purposeId: string;
  outputMode: PtaOutputMode;
}) {
  const { data, error, isFetching } = useResolvePrintingAssignmentQuery({
    companyId,
    branchId,
    deviceId,
    purposeId,
    outputMode,
  });

  if (isFetching && !data) {
    return <span className={styles.cellEmpty}>…</span>;
  }

  if (error || !data) {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 404) {
      return (
        <span
          className={styles.effectiveNone}
          title="No assignment matches this scope at any rung, so nothing prints here."
        >
          ⚠ none set — this till prints nothing
        </span>
      );
    }
    return <span className={styles.cellEmpty}>—</span>;
  }

  const rung = rungOfServerScope(data.scope);

  return (
    <span className={styles.effective}>
      <Link href={printingDesignerRoute(data.ptaTemplateId)} className={styles.effectiveWinner}>
        {data.ptaTemplateName ?? data.ptaTemplateCode ?? "the winning design"}
      </Link>
      <span className={styles.effectiveFrom}>
        ← {RUNG_LABEL[rung].toLowerCase()}
        {/*
         * Whose design won. A shipped one is the product's, not this company's,
         * and saying so is what stops "why did my edit not show up" — the edit
         * was to a fork nothing points at.
         */}
        {data.ptaTemplateIsShipped ? " · shipped" : ""} · {data.copies} cop
        {data.copies === 1 ? "y" : "ies"}
        {data.copyLabels.length > 0 && data.copyLabels[0] !== "NA"
          ? ` (${data.copyLabels.join(", ")})`
          : ""}
      </span>
      {/*
       * The winner resolving to a design with nothing published is the failure
       * this whole subsystem is arranged to make visible: the assignment is
       * correct, and the till still prints nothing.
       */}
      {data.publishedRevId === null ? (
        <span className={styles.effectiveNone}>⚠ that design publishes nothing</span>
      ) : null}
      {/*
       * WHERE the paper comes out, and how much can be asserted about it.
       *
       * A registered profile carries the paper code, the codepage and the
       * column count, so the render can refuse an A4 invoice sent to an 80mm
       * roll. A bare queue name carries none of that -- it is the fallback for
       * a printer nobody has registered -- and saying only its name would make
       * the two look like the same answer. `printerSource` is the server's own
       * reading of `ck_pta_printer_one_of`, so this never guesses from which
       * field happens to be set.
       */}
      {data.printerSource === "PROFILE" ? (
        <span className={styles.effectiveFrom}>🖨 {data.ptaPrinterName}</span>
      ) : null}
      {data.printerSource === "NAME" ? (
        <span
          className={styles.effectiveFrom}
          title="A bare queue name, not a registered profile: paper, codepage and column count are unknown here, so nothing can be checked against the design."
        >
          🖨 {data.ptaPrinterName} · unregistered
        </span>
      ) : null}
    </span>
  );
}
