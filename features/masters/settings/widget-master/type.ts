export type WidgetPlatform = "Mobile" | "Desktop" | "Web";
export type WidgetTypeFilter = WidgetPlatform | "all";

/** One field row under a section (server: fixed.form_field). */
export type WidgetFieldPayload = {
  fieldId: number;
  fieldSectionId: number;
  fieldName: string;
  fieldGuiName: string | null;
  fieldSecondaryText: string | null;
  fieldPosition: number;
  fieldVisibility: boolean;
  // Server-managed audit/sync metadata (read-only; ISO timestamps).
  fieldSyncDate: string;
  fieldCreatedOn: string;
  fieldCreatedBy: string | null;
  fieldUpdatedOn: string;
  fieldUpdatedBy: string | null;
};

/** A section heading row with its nested fields (server: fixed.form_section). */
export type WidgetMasterPayload = {
  sectionId: number;
  sectionMenuId: number;
  sectionName: string;
  sectionGuiName: string;
  sectionPosition: number;
  sectionVisibility: boolean;
  sectionPlatform: WidgetPlatform;
  // Server-managed audit/sync metadata (read-only; ISO timestamps).
  sectionSyncDate: string;
  sectionCreatedOn: string;
  sectionCreatedBy: string | null;
  sectionUpdatedOn: string;
  sectionUpdatedBy: string | null;
  fields: WidgetFieldPayload[];
};

export type WidgetMasterTableRow = WidgetMasterPayload & {
  __rowId: number;
  serialNo: number;
};

/** Draft shape used by the in-form fields editor (all-string for form values). */
export type WidgetFieldDraft = {
  fieldId?: number;
  fieldName: string;
  fieldGuiName: string;
  fieldSecondaryText: string;
  fieldPosition: string;
  fieldVisibility: boolean;
};

/** A single field as sent to POST /widget-masters/create. */
export type SaveWidgetFieldRequest = {
  fieldId?: number;
  fieldName: string;
  fieldGuiName: string | null;
  fieldSecondaryText: string | null;
  fieldPosition: number;
  fieldVisibility: boolean;
};

/** Body for POST /widget-masters/create (omit sectionId to create). */
export type SaveWidgetRequest = {
  sectionId?: number;
  sectionMenuId: number;
  sectionName: string;
  sectionGuiName: string;
  sectionPosition: number;
  sectionVisibility: boolean;
  sectionPlatform: WidgetPlatform;
  fields: SaveWidgetFieldRequest[];
};

/** Query params for GET /widget-masters/get. */
export type ListWidgetQuery = {
  sectionMenuId?: string;
  sectionPlatform?: WidgetPlatform;
  search?: string;
};
