"use client";

/**
 * Report page tabs -- QtRPT's "New Report Page" / "Delete Report Page".
 *
 * Every band carries the report page it prints on; the canvas shows one page
 * at a time and these tabs switch between them. Page 1 is the report itself.
 * Each further page prints after it as a run of its own, with its own page
 * header, footer and numbering: a terms-and-conditions sheet, a delivery
 * challan, a covering letter.
 */

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  reportPageAdded,
  reportPageRemoved,
  reportPageSelected,
} from "@/features/print-designer/store/designerSlice";
import {
  selectActiveReportPage,
  selectBands,
  selectReportPages,
} from "@/features/print-designer/store/selectors";
import { MAX_REPORT_PAGES } from "@/features/print-designer/lib/vocabulary";
import { confirm } from "@/lib/confirm";
import styles from "@/features/print-designer/components/designer.module.scss";

export function ReportPageTabs() {
  const dispatch = useAppDispatch();
  const pages = useAppSelector(selectReportPages);
  const active = useAppSelector(selectActiveReportPage);
  const bands = useAppSelector(selectBands);

  const bandCount = (page: number) => bands.filter((band) => (band.reportPage ?? 0) === page).length;
  const atLimit = pages[pages.length - 1] + 1 >= MAX_REPORT_PAGES;

  return (
    <div className={styles.pageTabs} role="tablist" aria-label="Report pages">
      {pages.map((page, position) => (
        <div
          key={page}
          role="tab"
          aria-selected={page === active}
          className={`${styles.pageTab} ${page === active ? styles.pageTabActive : ""}`}
          title={`${bandCount(page)} band(s)${page === 0 ? " — the report itself" : " — prints after the report"}`}
          onClick={() => dispatch(reportPageSelected(page))}
        >
          {`Page ${position + 1}`}
          {page > 0 ? (
            <button
              type="button"
              className={styles.pageTabClose}
              title="Delete this report page and its bands"
              aria-label={`Delete report page ${position + 1}`}
              onClick={async (event) => {
                event.stopPropagation();
                const proceed = await confirm({
                  title: `Delete report page ${position + 1}?`,
                  message: `Its ${bandCount(page)} band(s) go with it. Undo brings them back.`,
                  confirmLabel: "Delete page",
                  iconVariant: "delete",
                });
                if (proceed) {
                  dispatch(reportPageRemoved(page));
                }
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className={styles.pageTab}
        disabled={atLimit}
        title={atLimit ? `A template holds at most ${MAX_REPORT_PAGES} report pages` : "New report page"}
        onClick={() => dispatch(reportPageAdded())}
      >
        + Page
      </button>
    </div>
  );
}

export default ReportPageTabs;
