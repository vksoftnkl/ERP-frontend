export type ItemPriceTaxContext = {
  cessPerc: number;
  cessQty: number;
  gstPerc: number;
};
export type ItemFormDefaults = {
  masterAlias: string;
  masterDescription: string;
  masterName: string;
  masterShortName: string;
  position: string;
  searchCode: string;
};
export type BuildItemRequestPayloadArgs = {
  editingItemId: string | number | null;
  files: Record<string, File | null>;
  shouldUpdate: boolean;
  values: Record<string, string>;
};
