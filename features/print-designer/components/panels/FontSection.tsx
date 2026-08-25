"use client";

/**
 * Typography for text-bearing elements.
 *
 * The family list is the server's font registry, not free text: a face the
 * registry does not know falls back at render time, so a template approved on
 * screen would print in a different face at the customer's counter.
 */

import type { TextLikeElement } from "@/features/print-designer/types/template-definition";
import { FONT_FAMILIES, FONT_SIZE_PRESETS } from "@/features/print-designer/lib/vocabulary";
import {
  useElementPatch,
  useElementPatchEach,
} from "@/features/print-designer/components/panels/usePatch";
import {
  CheckboxInput,
  ColorInput,
  FieldGrid,
  NumberInput,
  Section,
  SelectInput,
  ToggleGroup,
  sharedValue,
} from "@/features/print-designer/components/panels/controls";

export type FontSectionProps = {
  bandIndex: number;
  elements: TextLikeElement[];
};

export function FontSection({ bandIndex, elements }: FontSectionProps) {
  const patch = useElementPatch(
    bandIndex,
    elements.map((element) => element.id),
  );
  const patchEach = useElementPatchEach(bandIndex, elements);

  const setFont = (key: "family" | "size" | "bold" | "italic" | "underline", value: unknown) => {
    patchEach(
      (element) => ({
        font: { ...("font" in element ? (element.font ?? {}) : {}), [key]: value },
      }),
      "Set font",
    );
  };

  return (
    <Section title="Font">
      <FieldGrid>
        <SelectInput
          label="Family"
          value={sharedValue(elements, (element) => element.font?.family ?? "NotoSans")}
          options={FONT_FAMILIES.map((family) => ({ value: family, label: family }))}
          onCommit={(value) => setFont("family", value)}
        />
        <SelectInput
          label="Size (pt)"
          value={sharedValue(elements, (element) => String(element.font?.size ?? 9))}
          options={FONT_SIZE_PRESETS.map((size) => ({ value: String(size), label: String(size) }))}
          onCommit={(value) => setFont("size", Number(value))}
        />
      </FieldGrid>

      <ToggleGroup
        label="Style"
        value={undefined}
        options={[
          { value: "bold", label: "B", title: "Bold" },
          { value: "italic", label: "I", title: "Italic" },
          { value: "underline", label: "U", title: "Underline" },
        ]}
        onCommit={(value) => {
          const key = value as "bold" | "italic" | "underline";
          // Toggle from the first element so the group flips as one, which is
          // what a user expects from a bold button on a multi-selection.
          const current = elements[0]?.font?.[key] ?? false;
          setFont(key, !current);
        }}
      />

      <ToggleGroup
        label="Align"
        value={sharedValue(elements, (element) => element.align)}
        options={[
          { value: "left", label: "⇤", title: "Left" },
          { value: "center", label: "↔", title: "Centre" },
          { value: "right", label: "⇥", title: "Right" },
        ]}
        onCommit={(value) => patch({ align: value }, "Set alignment")}
      />

      <ToggleGroup
        label="Vertical"
        value={sharedValue(elements, (element) => element.vAlign)}
        options={[
          { value: "top", label: "⤒", title: "Top" },
          { value: "middle", label: "≡", title: "Middle" },
          { value: "bottom", label: "⤓", title: "Bottom" },
        ]}
        onCommit={(value) => patch({ vAlign: value }, "Set vertical alignment")}
      />

      <FieldGrid>
        <ColorInput
          label="Colour"
          value={sharedValue(elements, (element) => element.style?.color)}
          onCommit={(value) =>
            patchEach((element) => ({ style: { ...(element.style ?? {}), color: value } }), "Set colour")
          }
        />
        <ColorInput
          label="Fill"
          value={sharedValue(elements, (element) => element.style?.fill)}
          onCommit={(value) =>
            patchEach((element) => ({ style: { ...(element.style ?? {}), fill: value } }), "Set fill")
          }
        />
      </FieldGrid>

      <CheckboxInput
        label="Wrap to multiple lines"
        value={sharedValue(elements, (element) => element.wrap)}
        onCommit={(value) => patch({ wrap: value }, "Set wrap")}
      />
      <CheckboxInput
        label="Truncate with an ellipsis"
        value={sharedValue(elements, (element) => element.ellipsis)}
        onCommit={(value) => patch({ ellipsis: value }, "Set ellipsis")}
      />
      <CheckboxInput
        label="Blank when zero"
        value={sharedValue(elements, (element) => element.blankWhenZero)}
        onCommit={(value) => patch({ blankWhenZero: value }, "Set blank when zero")}
      />

      <NumberInput
        label="Stroke width"
        suffix="pt"
        step={0.25}
        min={0}
        value={sharedValue(elements, (element) => element.style?.strokeWidthPt ?? 0)}
        onCommit={(value) =>
          patchEach(
            (element) => ({ style: { ...(element.style ?? {}), strokeWidthPt: value } }),
            "Set stroke width",
          )
        }
      />
    </Section>
  );
}

export default FontSection;
