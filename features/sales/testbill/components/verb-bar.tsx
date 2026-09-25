"use client";

/**
 * The verb bar (§17.1): a pure rendering of `verbState`.
 *
 * Nothing here decides what is possible. The state says which verbs exist in
 * this lifecycle state (hidden otherwise), which are blocked right now (greyed,
 * with the reason as the tooltip) and what each is called — "Save draft - F5"
 * on the plain route, "Tender - F5" on the tender route, "Save changes - F5"
 * while amending. One keymap in the entry view reads the same state, so a key
 * and its button can never disagree.
 *
 * Two verbs the plan lists have no button: re-tender is Ctrl+F6 only (the user
 * has not picked one, §28 Q11), and "post without printing" is
 * Ctrl+Shift+Enter, named in Post & Print's tooltip.
 */
import { cx } from "@/components/design-system/cx";
import styles from "@/features/sales/quotation/page.module.scss";
import type { Verb, VerbState } from "@/features/sales/testbill/state/verbs";
import type { SaleBillBusy } from "@/features/sales/testbill/state/use-bill-draft";

export type SaleBillToolbarProps = {
  verbs: VerbState;
  busy: SaleBillBusy;
  onTender: () => void;
  onSave: () => void;
  onSaveAndPrint: () => void;
  onHold: () => void;
  onShowHeld: () => void;
  onClear: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onCopyAsNew: () => void;
  onShowList: () => void;
  onCancelBill: () => void;
  onClose: () => void;
};

/** "Save draft - F5" → label "Save draft", hint "F5". */
function splitLabel(label: string): { text: string; hint: string | null } {
  const at = label.lastIndexOf(" - ");
  if (at < 0) {
    return { text: label, hint: null };
  }
  return { text: label.slice(0, at), hint: label.slice(at + 3) };
}

function VerbButton({
  verb,
  working,
  primary,
  busyLabel,
  onClick,
}: {
  verb: Verb;
  working: boolean;
  primary?: boolean;
  busyLabel?: string;
  onClick: () => void;
}) {
  if (!verb.visible) {
    return null;
  }
  const { text, hint } = splitLabel(verb.label);
  return (
    <button
      type="button"
      className={cx(styles.button, primary && styles.buttonPrimary)}
      disabled={working || !verb.enabled}
      title={verb.tooltip ?? undefined}
      onClick={onClick}
    >
      {working && busyLabel ? busyLabel : text}
      {hint ? <span className={styles.buttonHint}> {hint}</span> : null}
    </button>
  );
}

export function SaleBillToolbar(props: SaleBillToolbarProps) {
  const { verbs, busy } = props;
  const working = busy !== "idle";
  const saving = busy === "saving";
  return (
    <div className={styles.buttonBar}>
      <VerbButton verb={verbs.tender} working={working} primary onClick={props.onTender} />
      <VerbButton
        verb={verbs.save}
        working={working}
        primary={!verbs.tender.visible}
        busyLabel={saving ? "Saving…" : undefined}
        onClick={props.onSave}
      />
      <VerbButton verb={verbs.saveAndPrint} working={working} onClick={props.onSaveAndPrint} />
      <VerbButton
        verb={verbs.hold}
        working={working}
        busyLabel={busy === "holding" ? "Holding…" : undefined}
        onClick={props.onHold}
      />
      <VerbButton verb={verbs.pickHeld} working={working} onClick={props.onShowHeld} />
      <VerbButton verb={verbs.edit} working={working} onClick={props.onEdit} />
      <VerbButton verb={verbs.delete} working={working} onClick={props.onDelete} />
      <VerbButton verb={verbs.copy} working={working} onClick={props.onCopyAsNew} />
      <VerbButton verb={verbs.list} working={working} onClick={props.onShowList} />
      <VerbButton verb={verbs.cancelBill} working={working} onClick={props.onCancelBill} />
      <VerbButton verb={verbs.clear} working={working} onClick={props.onClear} />
      <VerbButton verb={verbs.close} working={working} onClick={props.onClose} />
    </div>
  );
}
