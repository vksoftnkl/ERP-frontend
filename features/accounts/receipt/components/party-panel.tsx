"use client";

/**
 * PARTY DETAIL — who the money is from, and what they owe.
 *
 * The customer picker lives here rather than in the header strip, beside the
 * eight figures it decides. Every one of them shows a DASH until the answer is
 * in: a zero would be a claim about the party's balance that nothing on the
 * screen has been told.
 *
 * ── AFTER THIS RECEIPT is not the Qt formula ─────────────────────────────
 * Qt computed `totalBalance − Σ bill.settled()`, which subtracts APPLIED
 * CREDITS — but spending a credit moves nothing between the party and us: the
 * bill and the credit both shrink and the net is unchanged. It also missed
 * settling deductions with no bill column (TDS, claims), which genuinely do
 * reduce what the party owes. `balanceAfterReceipt` derives it from the
 * identity instead.
 */
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { RECEIPT_FIELD_ATTR } from "../focus-walk";
import { balanceAfterReceipt, type ReceiptIdentity } from "../domain/identity";
import { formatTotal } from "../domain/money";
import type {
  OpenItemsSummary,
  PartyContextSummary,
  PartyFacts,
  ReceiptHeaderDraft,
} from "../receipt.types";
import styles from "../page.module.scss";

const DASH = "—";

/** See the picker below: blank is a real value for this one. */
const KEEP_EMPTY_AREA = ["iarea_id"] as const;

export type PartyPanelProps = {
  header: ReceiptHeaderDraft;
  party: PartyFacts;
  summary: OpenItemsSummary | null;
  context: PartyContextSummary | null;
  identity: ReceiptIdentity;
  mobile: string;
  address: string;
  editable: boolean;
  invalid: boolean;
  /**
   * Whether this receipt is still to be applied.
   *
   * `totalBalance` is what the party owes TODAY, so a POSTED receipt is
   * already inside it — subtracting it again would show the operator a
   * balance the party has never had. The figure only answers a question while
   * the receipt has not happened yet.
   */
  appliesToBalance: boolean;
  onPickParty: (partyId: string, partyName: string) => void;
};

function taxLine(party: PartyFacts): string {
  if (!party.loaded) {
    return DASH;
  }
  const parts: string[] = [];
  if (party.isTdsApplicable) {
    parts.push(`TDS${party.tdsDeducteeType ? ` ${party.tdsDeducteeType}` : ""}`);
  }
  if (party.isTcsApplicable) {
    parts.push(`TCS on ${party.tcsBasis}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "none";
}

export function PartyPanel(props: PartyPanelProps) {
  const {
    header,
    party,
    summary,
    context,
    identity,
    mobile,
    address,
    editable,
    invalid,
    appliesToBalance,
    onPickParty,
  } = props;
  const customerDropdownId = useDropdownId("customerByArea");
  const afterThis = appliesToBalance
    ? balanceAfterReceipt(context?.totalBalance ?? null, identity)
    : null;

  return (
    <section className={`${styles.panel} ${styles.panelParty}`} aria-label="Party detail">
      <h2 className={styles.panelTitle}>Party detail</h2>

      <div className={styles.partyPickerRow} {...{ [RECEIPT_FIELD_ATTR]: "party" }}>
        <span className={styles.partyPickerLabel}>Party *</span>
        <NexDropdownSingle
          dropdownId={customerDropdownId}
          value={header.partyId ? { id: header.partyId, text: header.partyName } : null}
          onChange={(selection) => onPickParty(selection?.id ?? "", selection?.text ?? "")}
          // Dropdown 54 names a bare `iarea_id` token. It is ALWAYS bound —
          // empty for "every beat" — or the literal word reaches Postgres and
          // choosing no beat returns no customers at all.
          // Dropdown 54's SQL GUARDS this token —
          // `NULLIF('iarea_id','') IS NULL OR cus_area_id = …` — so a blank
          // means "every beat" and must still be sent. Without
          // `keepEmptyParams` the dropdown drops the empty key, the literal
          // word `iarea_id` stays in the statement, and the run answers 400 —
          // which on screen looks like a customer list that is simply empty.
          params={{ iarea_id: header.areaId ?? "" }}
          keepEmptyParams={KEEP_EMPTY_AREA}
          // The screen's Enter walk moves on to the Amount box; a DOM-order
          // jump would land on the panel's table instead.
          advanceFocusOnSelect={false}
          // The beat narrows the list; a customer already chosen is not
          // dropped when it changes, because the receipt is theirs either way.
          clearOnParamsChange={false}
          disabled={!editable}
          invalid={invalid}
          aria-label="Party"
          className={styles.dropdownField}
        />
      </div>

      <div className={styles.partyFacts}>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Group</span>
          <span className={styles.factValue}>{party.groupName || DASH}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Mobile</span>
          <span className={styles.factValue}>{mobile || DASH}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>TDS / TCS</span>
          <span className={styles.factValue}>{taxLine(party)}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Address</span>
          <span className={styles.factValue} title={address}>
            {address || DASH}
          </span>
        </div>

        <div className={styles.fact}>
          <span className={styles.factLabel}>Outstanding</span>
          <span className={styles.factValue}>
            {summary ? formatTotal(summary.totalPending) : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Overdue</span>
          <span
            className={`${styles.factValue} ${
              summary && summary.overdueCount > 0 ? styles.factOverdue : styles.factMuted
            }`}
          >
            {summary ? `${summary.overdueCount} bill(s)` : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Credits held</span>
          <span
            className={`${styles.factValue} ${
              summary && summary.creditsHeld > 0 ? styles.factCredit : styles.factMuted
            }`}
          >
            {summary ? formatTotal(summary.creditsHeld) : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Cheques out</span>
          <span className={styles.factValue}>
            {context ? formatTotal(context.chequesOutstanding) : DASH}
          </span>
        </div>

        <div className={styles.fact}>
          <span className={styles.factLabel}>Total balance</span>
          <span className={styles.factValue}>
            {context ? formatTotal(context.totalBalance) : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>After this receipt</span>
          <span
            className={styles.factValue}
            title={
              appliesToBalance
                ? undefined
                : "This receipt has already been posted, so the balance beside it includes it."
            }
          >
            {afterThis === null ? DASH : formatTotal(afterThis)}
          </span>
        </div>

        {summary && summary.pdcHeld > 0 ? (
          <p className={styles.pdcNote}>
            {formatTotal(summary.pdcHeld)} is held in post-dated cheques — those bills do not
            settle until they mature.
          </p>
        ) : null}
      </div>
    </section>
  );
}
