const CONFIGURED_GRID_DETAIL_IDS_BY_TABLE = {
  item_master: 1,
  state_master: 2,
  area_master: 3,
  units: 4,
  item_tax_master: 5,
  item_group_master: 6,
  item_brand_master: 7,
  item_section_master: 10,
  category_master: 21,
  employee_designations: 24,
  employee_departments: 23,
  branch_master: 13,
  cust_groups: 19,
  gsp_company_service: 27,
  device_master: 28,
  account_groups: 25,
  supplier_groups: 18,
  city_master: 20,
  emp_master: 14,
  godown_locations: 15,
  user_master: 29,
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