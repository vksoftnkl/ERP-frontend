import type { CSSProperties, MutableRefObject } from "react";
import type {
  ERPDynamicModalController,
  ERPDynamicModalSubmitPayload,
  ERPDynamicModalVariant,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import type { CrudMasterPageProps } from "@/components/master/crud-master-page";
export type MasterOption = ERPDynamicSelectOption;
export type MasterModuleBaseValues = {
  masterName: string;
  searchCode: string;
  masterAlias: string;
  masterShortName: string;
  masterDescription: string;
  position: string;
};
export type LookupDefinition = {
  query?: Record<string, string>;
  defaultOption: MasterOption;
  arrayKeys?: readonly string[];
  idKeys?: readonly string[];
  labelKeys?: readonly string[];
};
export type NormalizedListResponse<TRecord> = {
  rows: TRecord[];
  totalEntries: number;
  currentPage: number | null;
  pageSize: number | null;
};
export type InlineRelatedMasterDefinition = {
  title: string;
  description: string;
  variants: ERPDynamicModalVariant[];
  submitError?: string | null;
  panelStyle?: CSSProperties;
  formGridColumns?: number;
  denseGrid?: boolean;
  stackLabels?: boolean;
  controllerRef?: MutableRefObject<ERPDynamicModalController | null>;
  onSubmit: (payload: ERPDynamicModalSubmitPayload) => void | Promise<void>;
  onCancel: () => void;
};
type CrudMasterPropsWithoutMapping = Omit<
  CrudMasterPageProps,
  "createInitialValues" | "mapFormValues" | "buildRequestPayload"
>;
export type MasterModuleDefinition<
  TRecord extends Record<string, unknown> = Record<string, unknown>,
  TFormValues extends Record<string, string> = MasterModuleBaseValues &
    Record<string, string>,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = CrudMasterPropsWithoutMapping & {
  createInitialValues?: TFormValues;
  mapFormValues?: (params: {
    source: TRecord | null;
    defaults: MasterModuleBaseValues;
  }) => TFormValues;
  buildRequestPayload?: (params: {
    values: TFormValues;
    shouldUpdate: boolean;
    editingItemId: string | number | null;
    files: Record<string, File | null>;
    sectionExpandedState: Record<string, boolean>;
  }) => TPayload | Promise<TPayload>;
};
