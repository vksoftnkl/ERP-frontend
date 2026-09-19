/**
 * The grid a master's columns come from when the screen names neither a
 * `gridKey` nor a `gridDetailId` — matched on the table the master edits.
 *
 * Kept as a last resort only: a screen that names its grid (`gridKey`, see
 * lib/configured-grids) resolves the id from Grid Master instead, which is the
 * one place an admin can actually configure it. The ids here are the Desktop
 * rows for the same reason — Grid Master lists nothing else, so a `web` id here
 * was a grid nobody could edit.
 */
const CONFIGURED_GRID_DETAIL_IDS_BY_TABLE = {
  item_master: 67,
  state_master: 57,
  area_master: 59,
  units: 45,
  item_group_master: 48,
  item_brand_master: 49,
  item_section_master: 50,
  category_master: 51,
  employee_designations: 75,
  employee_departments: 73,
  branch_master: 56,
  cust_groups: 66,
  // No Desktop grid defines this master; the web grid stays until one does.
  gsp_company_service: 27,
  device_master: 31,
  account_groups: 53,
  supplier_groups: 61,
  city_master: 58,
  emp_master: 77,
  godown_locations: 55,
  user_master: 62,
} as const;
export function getConfiguredModuleGridId(tableName?: string | null): number | undefined {
  const normalizedTableName = tableName?.trim().toLowerCase();
  if (!normalizedTableName) {
    return undefined;
  }
  return CONFIGURED_GRID_DETAIL_IDS_BY_TABLE[
    normalizedTableName as keyof typeof CONFIGURED_GRID_DETAIL_IDS_BY_TABLE
  ];
}