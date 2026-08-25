"use client";

/**
 * Paper and page setup — what the panel shows when nothing is selected.
 *
 * Changing the paper preset also changes the LAYOUT MODE, because the two are
 * not independent: A4 is a graphic page and T80 is a 48-column character grid.
 * Letting a user pick "T80" while the template stayed in GRAPHIC mode would
 * produce a definition the ESC/POS renderer cannot execute.
 */

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { PAPER_PRESETS } from "@/features/print-designer/lib/vocabulary";
import { gridMetrics } from "@/features/print-designer/lib/grid";
import {
  marginsPatched,
  paperPatched,
  paperPresetApplied,
} from "@/features/print-designer/store/designerSlice";
import {
  selectLayoutMode,
  selectPaper,
  selectPrintableWidthMm,
  selectVocabulary,
} from "@/features/print-designer/store/selectors";
import {
  FieldGrid,
  NumberInput,
  Section,
  SelectInput,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export function PaperSection() {
  const dispatch = useAppDispatch();
  const paper = useAppSelector(selectPaper);
  const layoutMode = useAppSelector(selectLayoutMode);
  const vocabulary = useAppSelector(selectVocabulary);
  const printableWidthMm = useAppSelector(selectPrintableWidthMm);

  const presets = vocabulary?.papers ?? PAPER_PRESETS;
  const isGridMode = layoutMode === "GRID";
  const metrics = gridMetrics(paper, presets);

  return (
    <>
      <Section title="Paper">
        <SelectInput
          label="Size"
          wide
          value={paper.code}
          options={presets.map((preset) => ({ value: preset.code, label: preset.label }))}
          onCommit={(value) => dispatch(paperPresetApplied(value))}
        />

        <FieldGrid>
          <NumberInput
            label="Width"
            suffix="mm"
            min={1}
            value={paper.widthMm}
            onCommit={(value) => dispatch(paperPatched({ widthMm: value }))}
          />
          <NumberInput
            label="Height"
            suffix="mm"
            min={0}
            value={paper.heightMm ?? 0}
            onCommit={(value) =>
              // Zero means continuous stationery, which the schema stores as null.
              dispatch(paperPatched({ heightMm: value > 0 ? value : null }))
            }
          />
        </FieldGrid>

        <SelectInput
          label="Orientation"
          wide
          value={paper.orientation}
          options={[
            { value: "PORTRAIT", label: "Portrait" },
            { value: "LANDSCAPE", label: "Landscape" },
          ]}
          onCommit={(value) => dispatch(paperPatched({ orientation: value }))}
        />

        {isGridMode ? (
          <FieldGrid>
            <NumberInput
              label="Columns"
              step={1}
              min={1}
              value={paper.columns ?? metrics.columns}
              onCommit={(value) => dispatch(paperPatched({ columns: Math.round(value) }))}
            />
            <NumberInput
              label="Form length"
              suffix="rows"
              step={1}
              min={1}
              value={paper.rows ?? 0}
              onCommit={(value) =>
                dispatch(paperPatched({ rows: value > 0 ? Math.round(value) : undefined }))
              }
            />
          </FieldGrid>
        ) : null}

        {paper.heightMm === null ? (
          <p className={styles.listRowMeta}>
            Continuous stationery: the engine paginates on explicit page breaks only.
          </p>
        ) : null}
      </Section>

      <Section title="Margins">
        <FieldGrid>
          <NumberInput
            label="Top"
            suffix="mm"
            min={0}
            value={paper.margins.top}
            onCommit={(value) => dispatch(marginsPatched({ top: value }))}
          />
          <NumberInput
            label="Bottom"
            suffix="mm"
            min={0}
            value={paper.margins.bottom}
            onCommit={(value) => dispatch(marginsPatched({ bottom: value }))}
          />
          <NumberInput
            label="Left"
            suffix="mm"
            min={0}
            value={paper.margins.left}
            onCommit={(value) => dispatch(marginsPatched({ left: value }))}
          />
          <NumberInput
            label="Right"
            suffix="mm"
            min={0}
            value={paper.margins.right}
            onCommit={(value) => dispatch(marginsPatched({ right: value }))}
          />
        </FieldGrid>
        <p className={styles.listRowMeta}>
          {isGridMode
            ? `${metrics.columns} columns at ${metrics.cellWidthMm.toFixed(2)}mm per character.`
            : `Printable width ${printableWidthMm.toFixed(1)}mm. Element X is measured from the sheet edge, not from the margin.`}
        </p>
      </Section>
    </>
  );
}

export default PaperSection;
