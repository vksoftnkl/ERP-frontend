"use client";

/**
 * The identity strip (§6.1, §13.6, §21): the title, the source list, the
 * status pill, the audit line and the GST badges.
 *
 * The source list names every source document once, first-seen order: a
 * coloured tag per kind (SO · DC · QT), the refno and "n line(s) · X taken"
 * (from `/get` `sources[]`, or what the imports kept client-side). Empty
 * reads "none — a hand-keyed bill"; an older bill with only a header trail
 * shows the header's.
 *
 * Badges (POSTED or CANCELLED only): IRN · EWB · "COGS X · voucher V", with
 * GENERATED green · FAILED/REJECTED red · PENDING amber · the rest grey.
 */
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { SOURCE_KIND_COLOURS, SOURCE_KIND_TAGS } from "@/features/sales/testbill/constants";
import type { BillSourceSummary, SaleBillDraft } from "@/features/sales/testbill/types";
import styles from "@/features/sales/testbill/page.module.scss";

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "statusDraft",
  POSTED: "statusAccepted",
  CANCELLED: "statusCancelled",
};

const GST_BADGE_CLASS: Record<string, string> = {
  GENERATED: styles.postingBadgeGenerated,
  FAILED: styles.postingBadgeFailed,
  REJECTED: styles.postingBadgeFailed,
  PENDING: styles.postingBadgePending,
};

function ddMMHHmm(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The chips: `/get`'s `sources[]` first, else the header trail. */
export function sourceChips(draft: SaleBillDraft): BillSourceSummary[] {
  if (draft.sources.length > 0) {
    return draft.sources;
  }
  if (draft.source) {
    return [
      {
        kind: draft.source.docType === "SALES_ORDER" ? "ORDER" : draft.source.docType === "DELIVERY_CHALLAN" ? "DC" : "QUOTATION",
        docId: draft.source.docId,
        accYear: draft.source.accYear ?? "",
        refno: draft.source.refno,
        date: draft.source.date,
        lines: 0,
        takenQty: 0,
        openQtyAfter: null,
      },
    ];
  }
  return [];
}

export type IdentityStripProps = {
  draft: SaleBillDraft;
  onBack: () => void;
};

export function IdentityStrip({ draft, onBack }: IdentityStripProps) {
  const chips = sourceChips(draft);
  const posting = draft.posting;
  const showBadges = draft.status !== "DRAFT" && posting !== null;
  return (
    <header className={quotationStyles.titleBar}>
      <span className={quotationStyles.gridHeadActions}>
        <button type="button" className={quotationStyles.button} onClick={onBack}>
          ‹ Bills
        </button>
        <h1 className={cx(quotationStyles.title, styles.entryTitle)}>
          Sales Bill Entry{draft.billRefno ? ` — ${draft.billRefno}` : ""}
        </h1>
      </span>
      <span className={cx(quotationStyles.statusBadge, quotationStyles[STATUS_BADGE_CLASS[draft.status] ?? "statusDraft"])}>
        {draft.status}
      </span>
      <span className={styles.sourceList} aria-label="Source documents">
        {chips.length === 0 ? (
          <span className={styles.factGrey}>none — a hand-keyed bill</span>
        ) : (
          chips.map((chip) => (
            <span key={`${chip.kind}|${chip.docId}`} className={styles.sourceChip} title={chip.date ? `${chip.kind} · ${toDisplayDate(chip.date)}` : chip.kind}>
              <span className={styles.sourceTag} style={{ background: SOURCE_KIND_COLOURS[chip.kind] ?? "#475569" }}>
                {SOURCE_KIND_TAGS[chip.kind] ?? chip.kind}
              </span>
              {chip.refno ?? chip.docId.slice(0, 8)}
              {chip.lines > 0 ? (
                <>
                  <span className={styles.sourceChipDivider}>·</span>
                  {chip.lines} line{chip.lines === 1 ? "" : "s"} · {chip.takenQty} taken
                </>
              ) : null}
            </span>
          ))
        )}
      </span>
      {showBadges ? (
        <>
          <span
            className={cx(styles.postingBadge, GST_BADGE_CLASS[posting.irn.status] ?? styles.postingBadgeMuted)}
            title={posting.irn.message ?? (posting.irn.number ? `IRN ${posting.irn.number}` : undefined)}
          >
            IRN {posting.irn.status}
            {posting.irn.ackNo ? ` · ack ${posting.irn.ackNo}${posting.irn.ackOn ? ` · ${ddMMHHmm(posting.irn.ackOn)}` : ""}` : ""}
            {posting.irn.status !== "GENERATED" && posting.irn.message ? ` · ${posting.irn.message}` : ""}
          </span>
          <span
            className={cx(styles.postingBadge, GST_BADGE_CLASS[posting.ewb.status] ?? styles.postingBadgeMuted)}
            title={posting.ewb.message ?? undefined}
          >
            EWB {posting.ewb.status}
            {posting.ewb.number ? ` · ${posting.ewb.number}` : ""}
            {posting.ewb.validUpto ? ` · valid to ${toDisplayDate(posting.ewb.validUpto.slice(0, 10))}` : ""}
          </span>
          {posting.voucherRefno ? (
            <span
              className={cx(styles.postingBadge, styles.postingBadgeGenerated)}
              title={posting.postedOn ? `Posted ${toDisplayDate(posting.postedOn.slice(0, 10))}` : undefined}
            >
              COGS {formatCurrency(posting.cogsAmt, 2, true)} · voucher {posting.voucherRefno}
            </span>
          ) : null}
        </>
      ) : null}
      <div className={quotationStyles.titleMeta}>
        {draft.amending ? (
          <span className={quotationStyles.readOnlyBadge}>Amending · rev {draft.revisionNo}</span>
        ) : draft.mode === "browse" ? (
          <span className={quotationStyles.readOnlyBadge}>Read only</span>
        ) : null}
        {draft.pricing === "stored" ? <span>showing saved figures</span> : null}
        {draft.isDirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
        <span>
          Year <strong>{draft.accYear || "—"}</strong>
        </span>
        <span title={`Place of supply ${draft.header.posStateCode || "—"}`}>{draft.isLocalSale ? "CGST + SGST" : "IGST"}</span>
        <span className={styles.factGrey}>{draft.header.billMode}</span>
      </div>
    </header>
  );
}
