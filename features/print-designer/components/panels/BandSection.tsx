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
} from "@/features/print-designer/store/designerSlice";
import {
  selectBands,
  selectDatasetBindings,
  selectLayoutMode,
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
        <FieldRow label={`Order — band ${bandIndex + 1} of ${bands.length}`} wide>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={styles.toolButton}
              disabled={bandIndex === 0}
              onClick={() => dispatch(bandMoved({ from: bandIndex, to: bandIndex - 1 }))}
            >
              ↑ Move up
            </button>
            <button
              type="button"
              className={styles.toolButton}
              disabled={bandIndex >= bands.length - 1}
              onClick={() => dispatch(bandMoved({ from: bandIndex, to: bandIndex + 1 }))}
            >
              ↓ Move down
            </button>
          </div>
        </FieldRow>

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
        <CheckboxInput
          label="Never split across pages"
          value={band.keepTogether}
          onCommit={(value) => patch({ keepTogether: value })}
        />
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
