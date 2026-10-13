"use client";

/**
 * How the selected elements behave in a flow band.
 *
 * Only mounted inside a band with `flowLayout` on: anywhere else the engine
 * places every element at its design `y`, and two checkboxes that do nothing
 * would be worse than none.
 */

import type { ReportElement } from "@/features/print-designer/types/template-definition";
import { useElementPatch } from "@/features/print-designer/components/panels/usePatch";
import {
  CheckboxInput,
  Section,
  sharedValue,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export type FlowSectionProps = {
  bandIndex: number;
  elements: ReportElement[];
};

export function FlowSection({ bandIndex, elements }: FlowSectionProps) {
  const patch = useElementPatch(
    bandIndex,
    elements.map((element) => element.id),
  );

  const float = sharedValue(elements, (element) => element.positionType === "FLOAT");
  const removeLine = sharedValue(elements, (element) => element.removeLineWhenBlank === true);

  return (
    <Section title="Flow">
      <CheckboxInput
        label="Float"
        value={float}
        onCommit={(value) =>
          patch({ positionType: value ? "FLOAT" : "FIX" }, value ? "Float" : "Fix in place")
        }
      />
      <CheckboxInput
        label="Remove line when blank"
        value={removeLine}
        onCommit={(value) => patch({ removeLineWhenBlank: value }, "Remove line when blank")}
      />
      <p className={styles.listRowMeta}>
        Float moves the element by whatever grows or closes up above it. Remove line when blank
        closes up the element&apos;s line when its visibility hides it — unless something visible
        shares that line.
      </p>
    </Section>
  );
}

export default FlowSection;
