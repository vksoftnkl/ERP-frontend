"use client";

/**
 * Warms the three configuration directories the whole app resolves ids through —
 * Grid Master (`lib/configured-grids`), UI Table Master (`lib/ui-tables`) and
 * Dropdown Master (`lib/configured-dropdowns`).
 *
 * Screens name the grid or table they read, never its id, and a React screen
 * would fetch the directory itself the moment it mounts. What cannot is
 * everything off React: the RTK Query endpoints that build a `grid_id` param,
 * and the grid payload builders that stamp a table id onto a save. Those read
 * the registry's synchronous accessor, which only knows what a fetch has primed.
 *
 * Mounted once, above the routes, so the answer is already in the cache by the
 * time any of them asks — and refreshed with everything else on the app's
 * revalidation signals, since both are ordinary cached queries.
 */

import {
  useGetDropdownDirectoryQuery,
  useGetGridDirectoryQuery,
  useGetUiTableDirectoryQuery,
} from "@/store/api/metadataApi";

export default function ConfiguredDirectories() {
  useGetGridDirectoryQuery();
  useGetUiTableDirectoryQuery();
  // Named last on purpose: its own list is a configured grid, so it reads best
  // once the grid directory above has resolved "MAIN LIST - DROPDOWN". The
  // fallback id covers the first render either way.
  useGetDropdownDirectoryQuery();
  return null;
}
