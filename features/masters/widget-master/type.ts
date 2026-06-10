export type WidgetPlatform = "mobile" | "desktop" | "web";
export type WidgetTypeFilter = WidgetPlatform | "all";
export type VisibilityFilter = "all" | "visible" | "hidden";
export type WidgetMasterPayload = {
  widgetNo: number;
  widgetGroupId: number;
  widgetName: string;
  widgetPosition: number;
  widgetVisibility: boolean;
  widgetGuiName: string | null;
  widgetType: WidgetPlatform;
  widgetSecondaryText: string | null;
};
export type WidgetMasterFormValues = {
  widgetGroupId: string;
  widgetGuiName: string;
  widgetName: string;
  widgetPosition: string;
  widgetSecondaryText: string;
  widgetType: WidgetPlatform;
  widgetVisibility: string;
};
export type WidgetMasterTableRow = WidgetMasterPayload & {
  __rowId: number;
  serialNo: number;
};
export type SaveWidgetRequest = {
  widgetGroupId: number;
  widgetGuiName: string | null;
  widgetName: string;
  widgetPosition: number;
  widgetSecondaryText: string | null;
  widgetType: WidgetPlatform;
  widgetVisibility: boolean;
  widgetNo?: number;
};