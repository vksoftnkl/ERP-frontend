/**
 * Sale Bill — re-tender (§22): change how a posted bill was paid, not what
 * was sold. Pure: the dialog computes nothing this does not.
 *
 *  - **Void reasons** include `OTHER` — the server accepts it, Qt left it out.
 *  - **Row notes**: `pdcMoved` disables the tick ("cheque already deposited /
 *    cleared — a bounce, not a re-tender"); `isLoyalty` restores the points;
 *    `isTempCredit` clears the temp-credit entry; `tdIsPdc` is a post-dated
 *    cheque not yet deposited.
 *  - **OK** only when ≥ 1 void is ticked, |voided − new| < 0.005, a remark is
 *    keyed and `canRetender`.
 *  - **New rows are numbered after ALL existing rows, voided included** —
 *    numbering from 1 collides and gives a 500 (§27 RT-500).
 *  - Each new row is built with the full §15.10 builder: surcharge, bank,
 *    cheque date and details, `tdIsPdc`, device and user (G2).
 */
import { money } from "@/domain/pricing";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import type { TenderContext, TenderContextRow, RetenderBillDto } from "@/features/sales/testbill/api/bills";
import { RETENDER_VOID_REASONS } from "@/features/sales/testbill/constants";
import { buildBillTenderDto } from "@/features/sales/testbill/payload/build-tenders";
import { settleRows } from "@/features/sales/testbill/engines/settle";
import type { BillKey, BillTenderRow, SaleBillDraft, SaveBillTenderDto } from "@/features/sales/testbill/types";

const EPSILON = 0.005;

export type VoidReason = (typeof RETENDER_VOID_REASONS)[number]["value"];

export type VoidPick = { tdId: string; reason: VoidReason | "" };

/** Why a bill cannot be re-tendered, in the operator's words, or null. */
export function retenderRefusal(context: TenderContext): string | null {
  if (context.canRetender) {
    return null;
  }
  const reason = (context.reason ?? "").trim().toLowerCase();
  if (reason.includes("day closed")) {
    return "The day is closed — the drawer was counted with this figure. That is a day-book correction, not a re-tender.";
  }
  return `This bill cannot be re-tendered: ${context.reason ?? "unknown reason"}`;
}

/** The rows the "as it was tendered" table shows: voided rows are skipped. */
export function liveTenderRows(context: TenderContext): TenderContextRow[] {
  return context.tenders.filter((row) => !row.isVoided);
}

/** The red / grey note under a row (§22 step 4). */
export function tenderRowNote(row: TenderContextRow): { text: string; tone: "red" | "grey" } | null {
  if (row.pdcMoved) {
    return { text: "cheque already deposited / cleared — a bounce, not a re-tender", tone: "red" };
  }
  if (row.isLoyalty) {
    return { text: "voiding restores the points to the member", tone: "grey" };
  }
  if (row.isTempCredit) {
    return { text: "voiding clears the temp-credit entry behind the balance", tone: "grey" };
  }
  if (row.tdIsPdc) {
    return { text: "post-dated cheque, not yet deposited", tone: "grey" };
  }
  return null;
}

/** "What really happened" excludes ADJUST, LOYALTY, CREDIT and TEMP_CR (§22). */
export function replacementTenderAllowed(typeCode: string, typeId: number): boolean {
  if (typeId === 7 || typeId === 8 || typeId === 9 || typeId === 10) {
    return false;
  }
  return !["RRN", "LOYALTY", "CREDIT", "TEMP_CR"].includes(typeCode);
}

export type RetenderFigures = { voided: number; replaced: number; matched: boolean };

/** Footer: "Voided X · New Y", green when they match (§22). */
export function retenderFigures(
  context: TenderContext,
  voids: readonly VoidPick[],
  replacements: readonly BillTenderRow[],
): RetenderFigures {
  const voidedIds = new Set(voids.filter((pick) => pick.reason).map((pick) => pick.tdId));
  const voided = money(
    context.tenders.filter((row) => voidedIds.has(row.tdId)).reduce((sum, row) => sum + row.tdAmount, 0),
  );
  const replaced = money(replacements.reduce((sum, row) => sum + Math.max(0, row.keyed), 0));
  return { voided, replaced, matched: Math.abs(voided - replaced) < EPSILON };
}

/** The OK gate (§22 step 4). Returns the first blocker or null. */
export function retenderBlocker(
  context: TenderContext,
  voids: readonly VoidPick[],
  replacements: readonly BillTenderRow[],
  remark: string,
): string | null {
  if (!context.canRetender) {
    return retenderRefusal(context);
  }
  const ticked = voids.filter((pick) => pick.reason);
  if (ticked.length === 0) {
    return "Tick at least one tender that did not happen.";
  }
  const figures = retenderFigures(context, voids, replacements);
  if (!figures.matched) {
    return `The new tenders (${figures.replaced.toFixed(2)}) must equal what was voided (${figures.voided.toFixed(2)}).`;
  }
  if (!remark.trim()) {
    return "Say what happened — the remark is stored with the re-tender.";
  }
  return null;
}

/**
 * The `/bills/retender` body (§22 step 5). `tdRowNo` continues after EVERY
 * existing row, voided ones included; each new row goes through the full
 * tender builder against the bill's own scope.
 */
export function buildRetenderBody(
  key: BillKey,
  context: TenderContext,
  voids: readonly VoidPick[],
  replacements: readonly BillTenderRow[],
  remark: string,
  draft: SaleBillDraft,
  actor: SaveActor,
): RetenderBillDto {
  const kept = replacements.filter((row) => row.keyed > EPSILON);
  const settled = settleRows(kept, Number.POSITIVE_INFINITY).rows;
  const offset = context.tenders.length;
  const tenders: SaveBillTenderDto[] = kept.map((row, index) => {
    const dto = buildBillTenderDto(row, settled[index], 0, offset + index, draft, actor);
    // A replacement is a fresh row: never `tdId`, never the old row's audit.
    const { tdId: _tdId, tdModifiedBy: _modified, ...fresh } = dto as SaveBillTenderDto & { tdModifiedBy?: string | null };
    void _tdId;
    void _modified;
    return fresh;
  });
  return {
    ...key,
    voids: voids
      .filter((pick) => pick.reason)
      .map((pick) => ({ tdId: pick.tdId, reason: pick.reason as string })),
    tenders: tenders as unknown as Record<string, unknown>[],
    remark: remark.trim().slice(0, 250),
  };
}
