"use client";
import { ERPDynamicModalForm } from "@/components/design-system/ui/dynamic-modal-form";
import type { MasterOption, InlineRelatedMasterDefinition } from "./types";
import type { ERPDynamicSearchShortcutPayload } from "@/components/design-system/ui/dynamic-modal-form";
export function resolveOptionFromShortcut(
  payload: ERPDynamicSearchShortcutPayload,
  options: MasterOption[],
): MasterOption | null {
  const selectedValue = payload.value.trim();
  if (selectedValue) {
    const exactMatch = options.find((option) => option.value.trim() === selectedValue);
    if (exactMatch) {
      return exactMatch;
    }
  }
  const query = payload.query.trim().toLowerCase();
  if (!query) {
    return null;
  }
  return (
    options.find((option) => option.label.trim().toLowerCase() === query) ??
    options.find((option) => option.label.trim().toLowerCase().includes(query)) ??
    null
  );
}
export default function InlineRelatedMasterModal({
  title,
  description,
  variants,
  submitError,
  panelStyle,
  formGridColumns,
  denseGrid,
  stackLabels,
  controllerRef,
  onSubmit,
  onCancel,
}: InlineRelatedMasterDefinition) {
  return (
    <ERPDynamicModalForm
      title={title}
      description={description}
      variants={variants}
      showDefaultCards={false}
      hideSectionHeader
      submitError={submitError}
      panelStyle={panelStyle}
      formGridColumns={formGridColumns}
      denseGrid={denseGrid}
      stackLabels={stackLabels}
      onControllerReady={(controller) => {
        if (controllerRef) {
          controllerRef.current = controller;
        }
      }}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}