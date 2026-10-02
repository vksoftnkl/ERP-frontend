"use client";
import { useCallback, useState } from "react";
import MasterModulePage from "@/features/masters/shared/module-page";
import { useSoftDeleteActions } from "@/features/masters/shared/use-soft-delete-actions";
import styles from "@/app/master/state-master/page.module.scss";
import { COMPANY_SOFT_DELETE, useCompaniesModule } from "./module";
import { buildGridDeletedParam } from "@/lib/configured-grids";
export default function CompaniesFeaturePage() {
  const companiesModule = useCompaniesModule();
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted companies. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Live view: Delete. Deleted view: the same button is Restore, and Edit / View
  // are refused (`/company-masters/get` serves live rows only).
  const softDeleteProps = useSoftDeleteActions({
    ...COMPANY_SOFT_DELETE,
    showingDeleted: wantDelete,
  });
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 52's stored SQL (`comp_is_deleted = icomp_is_deleted`); keys with no
  // matching token are ignored. The flag is driven by the "Show deleted records"
  // checkbox beside the list search input.
  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify(buildGridDeletedParam("companyList", wantDelete)),
    }),
    [wantDelete],
  );
  return (
    <MasterModulePage
      definition={{
        ...companiesModule,
        ...softDeleteProps,
        buildListQuery,
        toolbarContent: (
          <div className={styles.filterCheckGroup}>
            <label className={styles.filterCheckLabel}>
              <input
                type="checkbox"
                checked={wantDelete}
                onChange={(event) => setWantDelete(event.target.checked)}
              />
              Show deleted records
            </label>
          </div>
        ),
      }}
    />
  );
}
