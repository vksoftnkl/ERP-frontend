"use client";

/**
 * Band properties: what the band repeats over, and how it paginates.
 *
 * The dataset picker only offers datasets the template has BOUND, because the
 * schema rejects a band pointing at an unknown one. Cardinality is enforced
 * here too — a `one` dataset cannot drive a repeating band — so the invalid
 * choice is never offered rather than reported after a failed save.
 */

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { Band } from "@/features/print-designer/types/template-definition";
import {
  BAND_LABELS,
  BAND_TYPES,
  GROUPED_BANDS,
  PRINT_ON_VALUES,
  ROW_BANDS,
} from "@/features/print-designer/lib/vocabulary";
import {
  bandMoved,
  bandPatched,
  bandRemoved,
  reportPageSelected,
  selectBand,
} from "@/features/print-designer/store/designerSlice";
import {
  selectBands,
  selectDatasetBindings,
  selectLayoutMode,
  selectReportPages,
} from "@/features/print-designer/store/selectors";
import {
  CheckboxInput,
  FieldGrid,
  FieldRow,
  NumberInput,
  Section,
  SelectInput,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export type BandSectionProps = {
  bandIndex: number;
  band: Band;
  onEditExpression: (request: {
    title: string;
    value: string;
    onCommit: (value: string) => void;
  }) => void;
};

export function BandSection({ bandIndex, band, onEditExpression }: BandSectionProps) {
  const dispatch = useAppDispatch();
  const bindings = useAppSelector(selectDatasetBindings);
  const bands = useAppSelector(selectBands);
  const layoutMode = useAppSelector(selectLayoutMode);
  const isGridMode = layoutMode === "GRID";

  const patch = (patchBody: Parameters<typeof bandPatched>[0]["patch"], coalesceKey?: string) => {
    dispatch(bandPatched({ bandIndex, patch: patchBody, coalesceKey }));
  };

  const repeats = ROW_BANDS.includes(band.type);
  const grouped = GROUPED_BANDS.includes(band.type);
  const reportPages = useAppSelector(selectReportPages);
  const reportPage = band.reportPage ?? 0;
  const pageFurniture = band.type === "PAGE_HEADER" || band.type === "PAGE_FOOTER";

  // Moving is within the report page: the bands of other pages are hidden from
  // this one, and swapping with an invisible band would look like nothing
  // happened.
  const samePage = bands
    .map((candidate, index) => ({ candidate, index }))
    .filter((entry) => (entry.candidate.reportPage ?? 0) === reportPage)
    .map((entry) => entry.index);
  const position = samePage.indexOf(bandIndex);
  const previous = position > 0 ? samePage[position - 1] : null;
  const next = position >= 0 && position < samePage.length - 1 ? samePage[position + 1] : null;

  // A band that repeats needs a collection; a `one` dataset has nothing to
  // iterate and the server rejects the combination.
  const datasetOptions = bindings
    .filter((binding) => !repeats || binding.cardinality === "many")
    .map((binding) => ({ value: binding.name, label: `${binding.name} (${binding.cardinality})` }));

  return (
    <>
      <Section title="Band">
        {/* Band order is not cosmetic: the engine emits bands in DECLARATION
            order, which is how a GST invoice prints its item lines and then a
            second repeating section for the HSN/rate summary. */}
        <FieldRow label={`Order — band ${position + 1} of ${samePage.length}`} wide>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={styles.toolButton}
              disabled={previous === null}
              onClick={() => previous !== null && dispatch(bandMoved({ from: bandIndex, to: previous }))}
            >
              ↑ Move up
            </button>
            <button
              type="button"
              className={styles.toolButton}
              disabled={next === null}
              onClick={() => next !== null && dispatch(bandMoved({ from: bandIndex, to: next }))}
            >
              ↓ Move down
            </button>
          </div>
        </FieldRow>

        {reportPages.length > 1 ? (
          <SelectInput
            label="Report page"
            value={String(reportPage)}
            options={reportPages.map((page, index) => ({ value: String(page), label: `Page ${index + 1}` }))}
            onCommit={(value) => {
              const target = Number(value);
              patch({ reportPage: target === 0 ? undefined : target });
              // Follow the band to the page it went to.
              dispatch(reportPageSelected(target));
              dispatch(selectBand(bandIndex));
            }}
          />
        ) : null}

        <SelectInput
          label="Type"
          wide
          value={band.type}
          options={BAND_TYPES.map((type) => ({ value: type, label: BAND_LABELS[type] }))}
          onCommit={(value) => patch({ type: value })}
        />

        <FieldGrid>
          {isGridMode ? (
            <NumberInput
              label="Height"
              suffix="rows"
              step={1}
              min={0}
              value={band.heightRows ?? 1}
              onCommit={(value) => patch({ heightRows: Math.max(0, Math.round(value)) })}
            />
          ) : (
            <NumberInput
              label="Height"
              suffix="mm"
              min={0}
              value={band.heightMm}
              onCommit={(value) => patch({ heightMm: value })}
            />
          )}
          <NumberInput
            label="Spacing after"
            suffix="rows"
            step={1}
            min={0}
            max={20}
            value={band.spacingRows}
            onCommit={(value) => patch({ spacingRows: Math.max(0, Math.round(value)) })}
          />
        </FieldGrid>

        <SelectInput
          label="Dataset"
          wide
          value={band.dataset ?? ""}
          options={[{ value: "", label: repeats ? "— required —" : "None" }, ...datasetOptions]}
          onCommit={(value) => patch({ dataset: value || undefined })}
        />

        {grouped ? (
          <>
            <FieldRow label="Group by" wide>
              <div className={styles.expressionRow}>
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: 40 }}
                  spellCheck={false}
                  placeholder="{{ row.itemGroup }}"
                  value={band.groupBy ?? ""}
                  onChange={(event) =>
                    patch({ groupBy: event.target.value || undefined }, `groupby-${bandIndex}`)
                  }
                  onKeyDown={(event) => event.stopPropagation()}
                />
                <button
                  type="button"
                  className={styles.fxButton}
                  onClick={() =>
                    onEditExpression({
                      title: "Group by expression",
                      value: band.groupBy ?? "",
                      onCommit: (next) => patch({ groupBy: next || undefined }),
                    })
                  }
                >
                  fx
                </button>
              </div>
            </FieldRow>
            <NumberInput
              label="Group level"
              step={1}
              min={0}
              max={1}
              value={band.groupLevel}
              onCommit={(value) =>
                patch({ groupLevel: Math.min(1, Math.max(0, Math.round(value))) })
              }
            />
          </>
        ) : null}

        <SelectInput
          label="Print on"
          wide
          value={band.printOn}
          options={PRINT_ON_VALUES.map((value) => ({
            value,
            label: value.toLowerCase().replace(/_/g, " "),
          }))}
          onCommit={(value) => patch({ printOn: value })}
        />

        <CheckboxInput
          label="Grow to fit wrapped text"
          value={band.autoGrow}
          onCommit={(value) => patch({ autoGrow: value })}
        />
        {/* GRID stationery has no crosstab to stretch and its rows are not
            millimetres to close up; the engine ignores the flag there. */}
        {!isGridMode ? (
          <CheckboxInput
            label="Flow layout"
            value={band.flowLayout === true}
            onCommit={(value) => patch({ flowLayout: value })}
          />
        ) : null}
        {!isGridMode && band.flowLayout ? (
          <p className={styles.listRowMeta}>
            A crosstab takes only the rows it prints and the band shrinks or grows with it.
            Select an element to make it Float with what is above it, or to Remove its line
            when it is hidden.
          </p>
        ) : null}
        <CheckboxInput
          label="Never split across pages"
          value={band.keepTogether}
          onCommit={(value) => patch({ keepTogether: value })}
        />
        {!pageFurniture ? (
          <CheckboxInput
            label={band.type === "DETAIL" ? "Start each row on a new page" : "Start on a new page"}
            value={band.startNewPage === true}
            onCommit={(value) => patch({ startNewPage: value || undefined })}
          />
        ) : null}
        {band.type === "GROUP_HEADER" ? (
          <CheckboxInput
            label="Restart page numbers per group"
            value={band.startNewNumeration === true}
            onCommit={(value) => patch({ startNewNumeration: value || undefined })}
          />
        ) : null}
        {band.type === "GROUP_HEADER" && band.startNewNumeration ? (
          <p className={styles.listRowMeta}>
            Each group starts on a new page, and page.number and page.total count that group&apos;s
            pages only — one numbered statement per customer.
          </p>
        ) : null}
        <CheckboxInput
          label="Keep with the next band"
          value={band.keepWithNext}
          onCommit={(value) => patch({ keepWithNext: value })}
        />
        {band.type === "SUMMARY" ? (
          <CheckboxInput
            label="Keep with the last detail row"
            value={band.keepWithLastDetail}
            onCommit={(value) => patch({ keepWithLastDetail: value })}
          />
        ) : null}
      </Section>

      <Section title="Band visibility" defaultOpen={false}>
        <FieldRow label="Print when" wide>
          <div className={styles.expressionRow}>
            <textarea
              className={styles.textarea}
              style={{ minHeight: 40 }}
              spellCheck={false}
              placeholder="always"
              value={band.visible ?? ""}
              onChange={(event) =>
                patch({ visible: event.target.value || undefined }, `bandvisible-${bandIndex}`)
              }
              onKeyDown={(event) => event.stopPropagation()}
            />
            <button
              type="button"
              className={styles.fxButton}
              onClick={() =>
                onEditExpression({
                  title: "Band visibility expression",
                  value: band.visible ?? "",
                  onCommit: (next) => patch({ visible: next || undefined }),
                })
              }
            >
              fx
            </button>
          </div>
        </FieldRow>

        <button
          type="button"
          className={`${styles.button} ${styles.buttonDanger}`}
          onClick={() => dispatch(bandRemoved(bandIndex))}
        >
          Remove this band
        </button>
      </Section>
    </>
  );
}

export default BandSection;
