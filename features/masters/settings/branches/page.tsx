"use client";
import { useCallback, useState } from "react";
import MasterModulePage from "@/features/masters/shared/module-page";
import { useSoftDeleteActions } from "@/features/masters/shared/use-soft-delete-actions";
import styles from "@/app/master/state-master/page.module.scss";
import { buildGridDeletedParam } from "@/lib/configured-grids";
import { BRANCH_LIST_GRID_KEY, BRANCH_SOFT_DELETE, useBranchesModule } from "./module";
export default function BranchesMasterPage() {
  const branchesModule = useBranchesModule();
  // Toggles the `wantdelete` grid param; ticking it re-runs the list so the user
  // can see soft-deleted branches. Lives beside the list search input.
  const [wantDelete, setWantDelete] = useState(false);
  // Live view: Delete. Deleted view: the same button is Restore, and Edit / View
  // are refused (`/branch-masters/get` serves live rows only).
  const softDeleteProps = useSoftDeleteActions({
    ...BRANCH_SOFT_DELETE,
    showingDeleted: wantDelete,
  });
  // Adds the `grid_param` payload to the default page/limit/search list query.
  // The server JSON-parses it and binds each key into the matching named token in
  // grid 56's stored SQL (`br_is_deleted = ibr_is_deleted`); keys with no matching
  // token are ignored. The flag is driven by the "Show deleted records" checkbox
  // beside the list search input.
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
      grid_param: JSON.stringify(buildGridDeletedParam(BRANCH_LIST_GRID_KEY, wantDelete)),
    }),
    [wantDelete],
  );
  return (
    <MasterModulePage
      definition={{
        ...branchesModule,
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
