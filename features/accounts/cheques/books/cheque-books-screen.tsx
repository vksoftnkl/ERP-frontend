"use client";

/**
 * Cheque Books — menu 263, its own page (notes 58: the books as their own
 * menu, not only behind Issued Cheques).
 *
 * As in Qt, the page only hosts the panel Issued Cheques opens as a popup —
 * nothing is written twice — under menu 263's rights, and its Done closes the
 * screen. The scope is captured once, as on the cheque registers.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { ChequeBooksPanel } from "./cheque-books-panel";
import styles from "../cheques.module.scss";

/** Menu 263, "Cheque Books". */
export const CHEQUE_BOOKS_MENU_ID = 263;

export default function ChequeBooksScreen() {
  const router = useRouter();
  const { activeCompany, activeBranch } = useBusinessContext();
  const { permissions, isLoading } = usePagePermissions({ menuId: CHEQUE_BOOKS_MENU_ID });
  const [scope, setScope] = useState<{ companyId: string; branchId: string } | null>(null);
  if (!scope && activeCompany?.id && activeBranch?.id) {
    setScope({ companyId: activeCompany.id, branchId: activeBranch.id });
  }

  return (
    <div className={`${styles.page} ${styles.booksPage}`}>
      <header className={styles.booksTitleBar}>
        <h1 className={styles.booksTitle}>Cheque Books</h1>
      </header>
      {scope ? (
        <ChequeBooksPanel
          companyId={scope.companyId}
          branchId={scope.branchId}
          canCreate={!isLoading && permissions.canCreate}
          canEdit={!isLoading && permissions.canEdit}
          rightsLoading={isLoading}
          onDone={() => router.back()}
          fill
        />
      ) : (
        <p className={styles.mutedLine}>Choose a company and branch first.</p>
      )}
    </div>
  );
}
