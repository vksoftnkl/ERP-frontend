"use client";

/**
 * Conditional printing.
 *
 * `visible` is an expression, not a boolean: the ERP cases are all data-driven
 * ("print the e-way bill block only when there is a transporter", "hide the
 * discount column when nothing is discounted"), and a checkbox could not
 * express any of them.
 */

import type { ReportElement } from "@/features/print-designer/types/template-definition";
import { useElementPatch } from "@/features/print-designer/components/panels/usePatch";
import {
  FieldRow,
  Section,
  sharedValue,
  isMixed,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export type VisibilitySectionProps = {
  bandIndex: number;
  elements: ReportElement[];
  onEditExpression: (request: {
    title: string;
    value: string;
    onCommit: (value: string) => void;
  }) => void;
};

export function VisibilitySection({
  bandIndex,
  elements,
  onEditExpression,
}: VisibilitySectionProps) {
  const patch = useElementPatch(
    bandIndex,
    elements.map((element) => element.id),
  );

  const shared = sharedValue(elements, (element) => element.visible ?? "");
  const value = isMixed(shared) ? "" : (shared ?? "");

  return (
    <Section title="Visibility" defaultOpen={false}>
      <FieldRow label="Print when" wide>
        <div className={styles.expressionRow}>
          <textarea
            className={styles.textarea}
            style={{ minHeight: 40 }}
            spellCheck={false}
            placeholder={isMixed(shared) ? "Mixed" : "always"}
            value={value}
            onChange={(event) =>
              patch(
                { visible: event.target.value || undefined },
                "Set visibility",
                `visible-${bandIndex}`,
              )
            }
            onKeyDown={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className={styles.fxButton}
            title="Open the expression editor"
            onClick={() =>
              onEditExpression({
                title: "Visibility expression",
                value,
                onCommit: (next) => patch({ visible: next || undefined }, "Set visibility"),
              })
            }
          >
            fx
          </button>
        </div>
      </FieldRow>
      <p className={styles.listRowMeta}>
        Empty prints always. Otherwise the element is skipped when the expression is falsy.
      </p>
    </Section>
  );
}

export default VisibilitySection;
