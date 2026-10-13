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
import {
  LINE_STYLES,
  LINE_STYLE_LABELS,
  PAPER_PRESETS,
} from "@/features/print-designer/lib/vocabulary";
import type { LineStyle } from "@/features/print-designer/types/template-definition";
import { gridMetrics } from "@/features/print-designer/lib/grid";
import {
  marginsPatched,
  pageBorderSet,
  paperPatched,
  paperPresetApplied,
  watermarkSet,
} from "@/features/print-designer/store/designerSlice";
import {
  selectLayoutMode,
  selectPageBorder,
  selectPaper,
  selectPrintableWidthMm,
  selectVocabulary,
  selectWatermark,
} from "@/features/print-designer/store/selectors";
import {
  CheckboxInput,
  ColorInput,
  FieldGrid,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export function PaperSection() {
  const dispatch = useAppDispatch();
  const paper = useAppSelector(selectPaper);
  const layoutMode = useAppSelector(selectLayoutMode);
  const vocabulary = useAppSelector(selectVocabulary);
  const printableWidthMm = useAppSelector(selectPrintableWidthMm);
  const pageBorder = useAppSelector(selectPageBorder);
  const watermark = useAppSelector(selectWatermark);

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

      <Section title="Page border">
        {isGridMode ? (
          <p className={styles.listRowMeta}>
            Character-grid stationery (thermal, dot matrix) cannot print a page border.
          </p>
        ) : (
          <>
            <CheckboxInput
              label="Border on every page"
              value={pageBorder !== undefined}
              onCommit={(on) => dispatch(pageBorderSet(on ? {} : null))}
            />
            {pageBorder ? (
              <>
                <SelectInput
                  label="Position"
                  wide
                  value={pageBorder.insetMm === null ? "MARGIN" : "EDGE"}
                  options={[
                    { value: "MARGIN", label: "On the margins" },
                    { value: "EDGE", label: "Fixed distance from the paper edge" },
                  ]}
                  onCommit={(value) =>
                    dispatch(
                      pageBorderSet({
                        // Start the fixed distance where the frame already is
                        // on its nearest side, so switching does not jump it.
                        insetMm:
                          value === "MARGIN"
                            ? null
                            : Math.min(
                                paper.margins.top,
                                paper.margins.right,
                                paper.margins.bottom,
                                paper.margins.left,
                              ),
                      }),
                    )
                  }
                />
                <FieldGrid>
                  {pageBorder.insetMm !== null ? (
                    <NumberInput
                      label="From edge"
                      suffix="mm"
                      min={0}
                      value={pageBorder.insetMm}
                      onCommit={(value) => dispatch(pageBorderSet({ insetMm: value }))}
                    />
                  ) : null}
                  <NumberInput
                    label="Line"
                    suffix="pt"
                    step={0.25}
                    min={0.1}
                    max={10}
                    value={pageBorder.widthPt}
                    onCommit={(value) => dispatch(pageBorderSet({ widthPt: value }))}
                  />
                  <NumberInput
                    label="Corners"
                    suffix="mm"
                    min={0}
                    max={50}
                    value={pageBorder.radiusMm}
                    onCommit={(value) => dispatch(pageBorderSet({ radiusMm: value }))}
                  />
                </FieldGrid>
                <FieldGrid>
                  <SelectInput
                    label="Style"
                    value={pageBorder.style ?? "SOLID"}
                    options={LINE_STYLES.map((style) => ({ value: style, label: LINE_STYLE_LABELS[style] }))}
                    onCommit={(value) => dispatch(pageBorderSet({ style: value as LineStyle }))}
                  />
                  <ColorInput
                    label="Colour"
                    value={pageBorder.color}
                    onCommit={(value) => dispatch(pageBorderSet({ color: value ?? "" }))}
                  />
                </FieldGrid>
                <p className={styles.listRowMeta}>
                  {paper.heightMm === null
                    ? "Continuous stationery has no page bottom, so the border is not printed."
                    : "Printed on every page, behind the design. The canvas shows its sides; Preview shows the whole page."}
                </p>
              </>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Watermark" defaultOpen={watermark !== undefined}>
        {isGridMode ? (
          <p className={styles.listRowMeta}>
            Character-grid stationery (thermal, dot matrix) cannot print a watermark.
          </p>
        ) : (
          <>
            <CheckboxInput
              label="Show watermark"
              value={watermark !== undefined}
              onCommit={(on) => dispatch(watermarkSet(on ? {} : null))}
            />
            {watermark ? (
              <>
                <TextInput
                  label="Text"
                  wide
                  value={watermark.text}
                  placeholder="DRAFT, COPY or {{ ctx.copyLabel }}"
                  onCommit={(value) => dispatch(watermarkSet({ text: value }))}
                />
                <TextInput
                  label="Image"
                  wide
                  mono
                  value={watermark.image ?? ""}
                  placeholder="https://… or {{ ctx.companyLogo }}"
                  onCommit={(value) => dispatch(watermarkSet({ image: value.trim() || undefined }))}
                />
                <FieldGrid>
                  <NumberInput
                    label="Opacity"
                    suffix="%"
                    step={5}
                    min={2}
                    max={100}
                    value={Math.round(watermark.opacity * 100)}
                    onCommit={(value) =>
                      dispatch(watermarkSet({ opacity: Math.min(1, Math.max(0.02, value / 100)) }))
                    }
                  />
                  <NumberInput
                    label="Angle"
                    suffix="°"
                    step={5}
                    min={-90}
                    max={90}
                    value={watermark.rotationDeg}
                    onCommit={(value) => dispatch(watermarkSet({ rotationDeg: value }))}
                  />
                  <NumberInput
                    label="Text size"
                    suffix="pt"
                    step={4}
                    min={6}
                    max={300}
                    value={watermark.fontSizePt}
                    onCommit={(value) => dispatch(watermarkSet({ fontSizePt: value }))}
                  />
                  <CheckboxInput
                    label="Bold"
                    value={watermark.bold}
                    onCommit={(value) => dispatch(watermarkSet({ bold: value }))}
                  />
                  <ColorInput
                    label="Colour"
                    value={watermark.color}
                    onCommit={(value) => dispatch(watermarkSet({ color: value ?? "" }))}
                  />
                  {watermark.image ? (
                    <NumberInput
                      label="Image size"
                      suffix="%"
                      step={5}
                      min={5}
                      max={100}
                      value={watermark.imageScalePct}
                      onCommit={(value) => dispatch(watermarkSet({ imageScalePct: value }))}
                    />
                  ) : null}
                </FieldGrid>
                <p className={styles.listRowMeta}>
                  {paper.heightMm === null
                    ? "Continuous stationery has no page to centre on, so the watermark is not printed."
                    : "Printed faintly behind every page, centred on the printable area."}
                </p>
              </>
            ) : null}
          </>
        )}
      </Section>
    </>
  );
}

export default PaperSection;
