"use client";
import { useMemo, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import { selectUserInfo } from "@/store/slices/authSlice";
import { canEditTemplates } from "@/lib/auth/session";
import {
  buildFormDefaults,
  type FormDefaultsFieldSpec,
} from "@/features/masters/shared/build-form-defaults";
import TemplateScopeModal, { type TemplateScopeChoice } from "./template-scope-modal";
import { useSaveFormDefaultsTemplate } from "./use-save-template";
import styles from "./save-as-template-button.module.scss";

export type SaveAsTemplateButtonProps = {
  /** `masters.customer_form_defaults`, `masters.item_form_defaults`, … */
  settingKey: string;
  /** Names the thing in the toast: "Customer template". */
  templateLabel: string;
  /** Names the records in the prompt: "customers", "items". */
  entityLabelPlural: string;
  specs: readonly FormDefaultsFieldSpec[];
  excluded: readonly string[];
  /** Field-name prefixes to drop wholesale (a master's linked-row draft fields). */
  excludedPrefixes?: readonly string[];
  /** The form as it stands, straight out of the modal. */
  values: Record<string, string>;
  /** Display text for the id fields, keyed by field name — the host page has the
   *  dropdown options and lookup maps, this component does not. */
  labels: Record<string, string>;
  /** Document keys worth showing before the operator agrees, as [key, label]. */
  summaryFields?: ReadonlyArray<readonly [string, string]>;
  /** Named when the form is on a saved record, so the prompt can say where the
   *  values are coming from (the button works in edit mode too). */
  sourceRecordName?: string | null;
};

function summarize(
  json: string,
  summaryFields: ReadonlyArray<readonly [string, string]>,
): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return "";
  }
  const keys = Object.keys(parsed).length;
  const picks = summaryFields
    .filter(([key]) => typeof parsed[key] === "string" && parsed[key])
    .map(([key, label]) => `${label}: ${String(parsed[key])}`)
    .join(" · ");
  const count = `${keys} value${keys === 1 ? "" : "s"} will be stored`;
  return picks ? `${count} — ${picks}` : count;
}

/**
 * "Save as Default Template" — the authoring UI for a master's
 * `masters.*_form_defaults` setting, and the only usable one: the alternative is
 * hand-typing a 700-character JSON object into a text box on the settings
 * screen. A superuser fills the entry form the way a typical new record should
 * start and presses one button.
 *
 * A visible, labelled button in the footer rather than a context-menu item: in
 * Qt the right-click action was invisible in practice (a click on any line edit
 * showed the field's own cut/copy/paste instead), and an overflow menu the
 * operator never opens is the same as no feature.
 *
 * The SUPER ADMIN gate below is UI convenience only —
 * `POST /app-setting-values/create` is not authorized server-side.
 */
export default function SaveAsTemplateButton({
  settingKey,
  templateLabel,
  entityLabelPlural,
  specs,
  excluded,
  excludedPrefixes,
  values,
  labels,
  summaryFields = [],
  sourceRecordName,
}: SaveAsTemplateButtonProps) {
  const userInfo = useAppSelector(selectUserInfo);
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  // Ticked by default: the button says "All Branches", and leaving this branch's
  // own row on top of the company one is what "the template did not save" looks
  // like. Visible and untickable, because the row being dropped is a template
  // somebody wrote.
  const [clearBranchTemplate, setClearBranchTemplate] = useState(true);
  const { save, isSaving, canSaveToBranch, hasBranchTemplate } = useSaveFormDefaultsTemplate(
    settingKey,
    templateLabel,
  );
  const isAllowed = canEditTemplates(userInfo);
  const summary = useMemo(
    () => (pendingJson ? summarize(pendingJson, summaryFields) : ""),
    [pendingJson, summaryFields],
  );

  if (!isAllowed) {
    return null;
  }

  const handleChoose = async (scope: TemplateScopeChoice) => {
    if (!pendingJson) {
      return;
    }
    const saved = await save(scope, pendingJson, { clearBranchTemplate });
    if (saved) {
      setPendingJson(null);
    }
  };

  return (
    <>
      <button
        // Never `submit`: this button writes a SETTING, and the footer's Save
        // writes a RECORD. Neither may trigger the other, and this one does not
        // run the form's validation — a template is allowed to be an incomplete
        // record.
        type="button"
        className={styles.templateButton}
        disabled={isSaving}
        title={`New ${entityLabelPlural} at this branch will start with what is on this form. Existing ${entityLabelPlural} are not touched.`}
        onClick={() => {
          setClearBranchTemplate(true);
          setPendingJson(buildFormDefaults(values, { specs, excluded, excludedPrefixes, labels }));
        }}
      >
        Save as Default Template
      </button>
      <TemplateScopeModal
        isOpen={pendingJson !== null}
        entityLabelPlural={entityLabelPlural}
        sourceRecordName={sourceRecordName}
        summary={summary}
        canSaveToBranch={canSaveToBranch}
        hasBranchTemplate={hasBranchTemplate}
        clearBranchTemplate={clearBranchTemplate}
        onClearBranchTemplateChange={setClearBranchTemplate}
        saving={isSaving}
        onChoose={(scope) => void handleChoose(scope)}
        onCancel={() => setPendingJson(null)}
      />
    </>
  );
}
