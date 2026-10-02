"use client";

/**
 * Cancel — the same steps from the entry's "Cancel document" and the list's
 * F3 (`confirmAndCancelStockAdjustment`): the reason is asked for, the
 * consequence is spelled out, and only then is the one route called. A DRAFT
 * can be cancelled as well as a POSTED document, and the question says which
 * it is doing.
 */
import { useEffect, useState } from "react";
import { CancelReasonDialog } from "./cancel-reason-dialog";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";

export type CancelTarget = {
  /** The refno, else the id. */
  label: string;
  /** A POSTED document is reversed; a DRAFT is only marked. */
  posted: boolean;
};

export function cancelConsequence(posted: boolean): string {
  return posted
    ? "This writes a mirror row for every row the document posted, and a reversing accounts voucher. " +
        "Nothing is deleted.\n\nIt is refused if the stock it brought in has since gone out."
    : "This draft moved no stock. It is marked CANCELLED with the reason and stays in the list.";
}

export function CancelFlow({
  target,
  onClose,
  onCancelDocument,
}: {
  target: CancelTarget | null;
  onClose: () => void;
  onCancelDocument: (reason: string) => void;
}) {
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setAsking(target !== null);
    setConfirm(null);
  }, [target]);

  if (!target) {
    return null;
  }

  return (
    <>
      <CancelReasonDialog
        isOpen={asking}
        title={`Cancel ${target.label}`}
        onClose={() => {
          setAsking(false);
          onClose();
        }}
        onSubmit={(reason) => {
          setAsking(false);
          setConfirm({
            title: `Cancel ${target.label}?`,
            message: cancelConsequence(target.posted),
            onConfirm: () => {
              onClose();
              onCancelDocument(reason);
            },
            onCancel: onClose,
          });
        }}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
