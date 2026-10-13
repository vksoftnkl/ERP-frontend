"use client";

/**
 * The frame around a field -- QtRPT's frame lines, width, colour and style.
 *
 * Sides are switched one by one, like QtRPT's Top/Bottom/Left/Right line
 * buttons; "All" and "None" set them together. The frame prints over the
 * element, on its box edges, after its fill. "Grow with band" stretches the
 * frame and the background when the band grows past its design height, which
 * is what keeps every cell of an invoice row the same height when one
 * description wraps.
 */

import { useAppDispatch } from "@/store/hooks";
import {
  canHaveBorder,
  type ElementBorder,
  type LineStyle,
  type ReportElement,
} from "@/features/print-designer/types/template-definition";
import {
  selectionBorderSet,
  selectionBorderToggled,
  type FrameSide,
} from "@/features/print-designer/store/designerSlice";
import { useElementPatch } from "@/features/print-designer/components/panels/usePatch";
import {
  CheckboxInput,
  ColorInput,
  FieldGrid,
  FieldRow,
  NumberInput,
  Section,
  SelectInput,
  sharedValue,
} from "@/features/print-designer/components/panels/controls";
import { LINE_STYLES, LINE_STYLE_LABELS } from "@/features/print-designer/lib/vocabulary";
import styles from "@/features/print-designer/components/designer.module.scss";

export type BorderSectionProps = {
  bandIndex: number;
  elements: ReportElement[];
};

const SIDES: ReadonlyArray<{ side: FrameSide; label: string; title: string }> = [
  { side: "top", label: "▔", title: "Top line" },
  { side: "bottom", label: "▁", title: "Bottom line" },
  { side: "left", label: "▏", title: "Left line" },
  { side: "right", label: "▕", title: "Right line" },
];

export function BorderSection({ bandIndex, elements }: BorderSectionProps) {
  const dispatch = useAppDispatch();
  const framable = elements.filter(canHaveBorder);
  const patch = useElementPatch(
    bandIndex,
    framable.map((element) => element.id),
  );

  if (!framable.length) {
    return null;
  }

  const read = <K extends keyof ElementBorder>(key: K, fallback: ElementBorder[K]) =>
    sharedValue(framable, (element) => element.border?.[key] ?? fallback);

  const set = (change: Partial<ElementBorder>, label: string, coalesceKey?: string) =>
    dispatch(selectionBorderSet({ patch: change, label, coalesceKey }));

  const hasAny = framable.some(
    (element) =>
      element.border &&
      (element.border.top || element.border.right || element.border.bottom || element.border.left),
  );

  return (
    <Section title="Border">
      <FieldRow label="Lines">
        <div className={styles.toggleRow}>
          {SIDES.map((entry) => {
            const on = read(entry.side, false);
            return (
              <button
                key={entry.side}
                type="button"
                title={entry.title}
                className={`${styles.toolButton} ${on === true ? styles.toolButtonActive : ""}`}
                onClick={() => dispatch(selectionBorderToggled(entry.side))}
              >
                <span className={styles.toolIcon}>{entry.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            title="All frame lines"
            className={styles.toolButton}
            onClick={() => set({ top: true, right: true, bottom: true, left: true }, "All frame lines")}
          >
            <span className={styles.toolIcon}>▢</span>
          </button>
          <button
            type="button"
            title="No frame"
            className={styles.toolButton}
            onClick={() => dispatch(selectionBorderSet({ patch: null }))}
          >
            <span className={styles.toolIcon} style={{ opacity: 0.45 }}>⬚</span>
          </button>
        </div>
      </FieldRow>

      {hasAny ? (
        <FieldGrid>
          <NumberInput
            label="Width"
            suffix="pt"
            step={0.25}
            min={0.1}
            max={10}
            value={read("widthPt", 0.5)}
            onCommit={(value) => set({ widthPt: value }, "Frame width", "frame-width")}
          />
          <SelectInput
            label="Style"
            value={read("style", "SOLID")}
            options={LINE_STYLES.map((style) => ({ value: style, label: LINE_STYLE_LABELS[style] }))}
            onCommit={(value) => set({ style: value as LineStyle }, "Frame style")}
          />
          <ColorInput
            label="Colour"
            value={read("color", "#000000")}
            onCommit={(value) => set({ color: value ?? "" }, "Frame colour", "frame-colour")}
          />
        </FieldGrid>
      ) : null}

      <CheckboxInput
        label="Grow with band"
        value={sharedValue(framable, (element) => element.stretchWithBand === true)}
        onCommit={(value) =>
          patch({ stretchWithBand: value || undefined }, value ? "Grow with band" : "Fixed height")
        }
      />
      <p className={styles.listRowMeta}>
        Grow with band stretches the frame and background (and a shape) by however much its band
        grew — so a row whose description wraps keeps every cell the same height.
      </p>
    </Section>
  );
}

export default BorderSection;
