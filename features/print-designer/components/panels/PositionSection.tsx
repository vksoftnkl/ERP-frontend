"use client";

/**
 * Geometry for the selection.
 *
 * GRAPHIC templates edit millimetres; GRID templates edit column/row/span,
 * because those are the coordinates the printer can actually reach. Showing a
 * millimetre box for a dot-matrix field would invite a value the renderer has
 * to round away.
 */

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { ReportElement } from "@/features/print-designer/types/template-definition";
import { elementRect } from "@/features/print-designer/lib/geometry";
import { cellOf, columnOverflow, gridMetrics } from "@/features/print-designer/lib/grid";
import {
  elementRectSet,
  elementRenamed,
} from "@/features/print-designer/store/designerSlice";
import {
  selectLayoutMode,
  selectPaper,
  selectUnit,
} from "@/features/print-designer/store/selectors";
import { roundMm } from "@/features/print-designer/lib/units";
import {
  useElementPatch,
  useElementPatchEach,
} from "@/features/print-designer/components/panels/usePatch";
import {
  FieldGrid,
  NumberInput,
  Section,
  TextInput,
  isMixed,
  sharedValue,
  type MaybeMixed,
} from "@/features/print-designer/components/panels/controls";

const MM_PER_INCH = 25.4;
import styles from "@/features/print-designer/components/designer.module.scss";

export type PositionSectionProps = {
  bandIndex: number;
  elements: ReportElement[];
};

export function PositionSection({ bandIndex, elements }: PositionSectionProps) {
  const dispatch = useAppDispatch();
  const layoutMode = useAppSelector(selectLayoutMode);
  const paper = useAppSelector(selectPaper);
  // QtRPT's measurement setting: inches are a DISPLAY unit. The definition
  // stays in millimetres, so a template means the same thing to everyone.
  const inches = useAppSelector(selectUnit) === "in";
  const unitSuffix = inches ? "in" : "mm";
  const shown = (value: MaybeMixed<number> | undefined): MaybeMixed<number> | undefined =>
    inches && value !== undefined && !isMixed(value)
      ? Math.round((value / MM_PER_INCH) * 1000) / 1000
      : value;
  const stored = (value: number): number => (inches ? roundMm(value * MM_PER_INCH) : value);
  const unitStep = inches ? 0.05 : 0.5;
  const patch = useElementPatch(
    bandIndex,
    elements.map((element) => element.id),
  );
  const patchEach = useElementPatchEach(bandIndex, elements);

  const isGridMode = layoutMode === "GRID";
  const metrics = gridMetrics(paper);
  const single = elements.length === 1 ? elements[0] : null;

  if (isGridMode) {
    const cells = elements.map((element) => cellOf(element));
    const overflow = cells.reduce(
      (worst, cell) => Math.max(worst, columnOverflow(cell, metrics)),
      0,
    );

    return (
      <Section title="Position">
        <FieldGrid>
          <NumberInput
            label="Column"
            step={1}
            min={0}
            value={sharedValue(cells, (cell) => cell.col)}
            onCommit={(value) => patch({ col: Math.max(0, Math.round(value)) }, "Set column")}
          />
          <NumberInput
            label="Row"
            step={1}
            min={0}
            value={sharedValue(cells, (cell) => cell.row)}
            onCommit={(value) => patch({ row: Math.max(0, Math.round(value)) }, "Set row")}
          />
          <NumberInput
            label="Span"
            suffix="cols"
            step={1}
            min={1}
            value={sharedValue(cells, (cell) => cell.cols)}
            onCommit={(value) => patch({ cols: Math.max(1, Math.round(value)) }, "Set span")}
          />
        </FieldGrid>
        {overflow > 0 ? (
          <p className={styles.issueLine}>
            {`Runs ${overflow} column${overflow === 1 ? "" : "s"} past the ${metrics.columns}-column paper; the printer will truncate it.`}
          </p>
        ) : null}
        {single ? (
          <TextInput
            label="Element id"
            wide
            mono
            value={single.id}
            onCommit={(value) =>
              dispatch(elementRenamed({ bandIndex, elementId: single.id, nextId: value }))
            }
          />
        ) : null}
      </Section>
    );
  }

  const rects = elements.map(elementRect);

  const setRect = (key: "x" | "y" | "w" | "h", value: number) => {
    for (const element of elements) {
      dispatch(elementRectSet({ bandIndex, elementId: element.id, rect: { [key]: value } }));
    }
  };

  return (
    <Section title="Position">
      <FieldGrid>
        <NumberInput
          label="X"
          suffix={unitSuffix}
          step={unitStep}
          value={shown(sharedValue(rects, (rect) => rect.x))}
          onCommit={(value) => setRect("x", stored(value))}
        />
        <NumberInput
          label="Y"
          suffix={unitSuffix}
          step={unitStep}
          value={shown(sharedValue(rects, (rect) => rect.y))}
          onCommit={(value) => setRect("y", stored(value))}
        />
        <NumberInput
          label="Width"
          suffix={unitSuffix}
          step={unitStep}
          min={0}
          value={shown(sharedValue(rects, (rect) => rect.w))}
          onCommit={(value) => setRect("w", stored(value))}
        />
        <NumberInput
          label="Height"
          suffix={unitSuffix}
          step={unitStep}
          min={0}
          value={shown(sharedValue(rects, (rect) => rect.h))}
          onCommit={(value) => setRect("h", stored(value))}
        />
        <NumberInput
          label="Layer"
          step={1}
          min={0}
          max={1000}
          value={sharedValue(elements, (element) => element.z)}
          onCommit={(value) => patch({ z: Math.round(value) }, "Set layer")}
        />
        <NumberInput
          label="Padding"
          suffix="mm"
          min={0}
          value={sharedValue(elements, (element) => element.style?.padding ?? 0)}
          onCommit={(value) =>
            patchEach(
              (element) => ({ style: { ...(element.style ?? {}), padding: value } }),
              "Set padding",
            )
          }
        />
      </FieldGrid>
      {single ? (
        <TextInput
          label="Element id"
          wide
          mono
          value={single.id}
          onCommit={(value) =>
            dispatch(elementRenamed({ bandIndex, elementId: single.id, nextId: value }))
          }
        />
      ) : null}
      <p className={styles.listRowMeta}>
        X is measured from the sheet&apos;s left edge; Y from the top of this band.
      </p>
    </Section>
  );
}

export default PositionSection;
