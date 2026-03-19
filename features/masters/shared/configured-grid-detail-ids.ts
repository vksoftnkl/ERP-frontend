const CONFIGURED_GRID_DETAIL_IDS_BY_TABLE = {
  item_master: 1,
  state_master: 2,
  area_master: 3,
  units: 4,
  item_tax_master: 5,
  item_group_master: 6,
  item_brand_master: 7,
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
