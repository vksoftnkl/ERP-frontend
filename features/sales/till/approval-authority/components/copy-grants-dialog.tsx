"use client";

/**
 * Copy grants — Qt `TillApprovalAuthorityList::copyGrants`' picker: who gets
 * the selected approver's open grants. Only the pick happens here; the list
 * reads the grants fresh, asks, and posts them (`onCopy`).
 */
import { useMemo, useState } from "react";

import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { COPY_NOTE, copyRefusal, copyTitle } from "../domain/approval-authority";
import { PopupFrame, popupStyles as styles } from "./popup-frame";

export function CopyGrantsDialog({
  fromUserId,
  fromName,
  companyId,
  onClose,
  onCopy,
}: {
  fromUserId: string;
  fromName: string;
  companyId: string;
  onClose: () => void;
  /** The pick is another user: the list takes it from here. */
  onCopy: (to: DropdownSelection) => void;
}) {
  const userDropdownId = useDropdownId("tillApproverUser");
  const userParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);
  const [to, setTo] = useState<DropdownSelection | null>(null);

  const copy = () => {
    const why = copyRefusal(fromUserId, to);
    if (why || !to) {
      toast.warn(why);
      return;
    }
    onCopy(to);
  };

  return (
    <PopupFrame
      icon="CG"
      title={copyTitle(fromName)}
      subtitle={COPY_NOTE}
      width={520}
      onClose={onClose}
      onSubmit={copy}
      footer={
        <>
          <span className={styles.footerHint}>Ctrl+Enter copy · Esc close</span>
          <button type="button" className={styles.secondaryButton} tabIndex={-1} onClick={onClose}>
            Close
          </button>
          <button type="button" className={styles.primaryButton} title="Copy (Ctrl+Enter)" onClick={copy}>
            Copy
          </button>
        </>
      }
    >
      <form
        className={styles.panelBody}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          copy();
        }}
      >
        <NexDropdownSingle
          dropdownId={userDropdownId}
          params={userParams}
          clearOnParamsChange={false}
          value={to}
          onChange={setTo}
          autoFocus
          advanceFocusOnSelect={false}
          placeholder="Give them to…"
          aria-label="Give them to"
          className={styles.dropdown}
        />
      </form>
    </PopupFrame>
  );
}
