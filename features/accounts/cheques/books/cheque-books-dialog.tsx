"use client";

/**
 * The Cheque Books panel as a popup over Issued Cheques — its "Cheque books"
 * button, as in Qt. The panel's own Done closes it.
 *
 * Judged on menu 263's rights, not the register's: that is the menu the
 * server checks for every `/cheque-books` route.
 */
import { useRef } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { ChequeBooksPanel } from "./cheque-books-panel";
import { CHEQUE_BOOKS_MENU_ID } from "./cheque-books-screen";
import styles from "../cheques.module.scss";

export type ChequeBooksDialogProps = {
  companyId: string;
  branchId: string;
  /** `changed` is true when a book was opened, saved or closed — re-read the tiles. */
  onClose: (changed: boolean) => void;
};

export function ChequeBooksDialog({ companyId, branchId, onClose }: ChequeBooksDialogProps) {
  const { permissions, isLoading } = usePagePermissions({ menuId: CHEQUE_BOOKS_MENU_ID });
  const changed = useRef(false);
  return (
    <ModalShell
      title="Cheque books"
      isOpen
      wide
      panelClassName={styles.booksDialog}
      onClose={() => onClose(changed.current)}
    >
      <ChequeBooksPanel
        companyId={companyId}
        branchId={branchId}
        canCreate={!isLoading && permissions.canCreate}
        canEdit={!isLoading && permissions.canEdit}
        rightsLoading={isLoading}
        onChanged={() => {
          changed.current = true;
        }}
        onDone={() => onClose(changed.current)}
      />
    </ModalShell>
  );
}
