"use client";

/**
 * Number and date masks.
 *
 * There is no `format` property on an element — the mask lives inside the value
 * expression as `fmt(row.qty, '#,##0.00')`, which is what the engine evaluates.
 * So this section reads that call back out and rewrites it, and it refuses to
 * act (rather than guessing) on an expression it cannot rewrite safely: mixed
 * literal text, or several spans in one value.
 */

import { useMemo } from "react";
import type { TextLikeElement } from "@/features/print-designer/types/template-definition";
import {
  applyFormatMask,
  clearFormatMask,
  readFormatMask,
} from "@/features/print-designer/lib/expression";
import {
  DATE_FORMAT_PRESETS,
  NUMBER_FORMAT_PRESETS,
} from "@/features/print-designer/lib/vocabulary";
import { useElementPatchEach } from "@/features/print-designer/components/panels/usePatch";
import {
  FieldRow,
  Section,
  TextInput,
  sharedValue,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export type FormatSectionProps = {
  bandIndex: number;
  elements: TextLikeElement[];
};

export function FormatSection({ bandIndex, elements }: FormatSectionProps) {
  const patchEach = useElementPatchEach(bandIndex, elements);

  const masks = useMemo(
    () => elements.map((element) => readFormatMask(element.value)),
    [elements],
  );

  const applyMask = (fn: "fmt" | "date", mask: string) => {
    patchEach((element) => {
      if (element.kind !== "TEXT" && element.kind !== "FIELD") {
        return {};
      }
      const next = applyFormatMask(element.value, fn, mask);
      return next ? { value: next } : {};
    }, `Format ${mask}`);
  };

  const clearMask = () => {
    patchEach((element) => {
      if (element.kind !== "TEXT" && element.kind !== "FIELD") {
        return {};
      }
      const next = clearFormatMask(element.value);
      return next ? { value: next } : {};
    }, "Clear format");
  };

  const currentMask = sharedValue(masks, (mask) => mask?.mask ?? "");
  const unrewritable = elements.some(
    (element) => !readFormatMask(element.value) && !element.value.includes("{{"),
  );

  return (
    <Section title="Format" defaultOpen={false}>
      <FieldRow label="Number" wide>
        <div className={styles.toggleRow}>
          {NUMBER_FORMAT_PRESETS.map((preset) => (
            <button
              key={preset.pattern}
              type="button"
              className={styles.toolButton}
              title={preset.pattern}
              onClick={() => applyMask("fmt", preset.pattern)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </FieldRow>

      <FieldRow label="Date" wide>
        <div className={styles.toggleRow}>
          {DATE_FORMAT_PRESETS.map((preset) => (
            <button
              key={preset.pattern}
              type="button"
              className={styles.toolButton}
              title={preset.pattern}
              onClick={() => applyMask("date", preset.pattern)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </FieldRow>

      <TextInput
        label="Custom mask"
        wide
        mono
        placeholder="#,##0.00"
        value={currentMask}
        onCommit={(value) => {
          if (!value.trim()) {
            clearMask();
            return;
          }
          // Reuse whichever call the value already had, so a date does not
          // silently become a number format.
          const fn = masks[0]?.fn === "date" ? "date" : "fmt";
          applyMask(fn, value.trim());
        }}
      />

      {unrewritable ? (
        <p className={styles.listRowMeta}>
          Plain text has nothing to format. Add an expression first.
        </p>
      ) : null}
    </Section>
  );
}

export default FormatSection;
