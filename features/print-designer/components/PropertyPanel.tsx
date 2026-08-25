"use client";

/**
 * The right-hand panel.
 *
 * What it shows follows the selection, in the order the user narrows it:
 * elements, then the band, then the paper. There is no "nothing selected" dead
 * end — with an empty selection the paper is the thing being edited, which is
 * also where a new template starts.
 *
 * One expression editor instance lives here and is opened by every `fx` button
 * beneath it. Giving each section its own would mean several mounted modals
 * competing for the same keyboard.
 */

import { useCallback, useMemo, useState } from "react";
import { useAppSelector } from "@/store/hooks";
import { isTextLike, type FieldMeta, type TextLikeElement } from "@/features/print-designer/types/template-definition";
import {
  selectBoundDatasets,
  selectDatasetBindings,
  selectSelectedBand,
  selectSelectedElements,
} from "@/features/print-designer/store/selectors";
import ExpressionEditor from "@/features/print-designer/components/ExpressionEditor";
import PositionSection from "@/features/print-designer/components/panels/PositionSection";
import FontSection from "@/features/print-designer/components/panels/FontSection";
import FormatSection from "@/features/print-designer/components/panels/FormatSection";
import VisibilitySection from "@/features/print-designer/components/panels/VisibilitySection";
import KindSection from "@/features/print-designer/components/panels/KindSection";
import BandSection from "@/features/print-designer/components/panels/BandSection";
import PaperSection from "@/features/print-designer/components/panels/PaperSection";
import { EmptyPanel } from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

type ExpressionRequest = {
  title: string;
  value: string;
  onCommit: (value: string) => void;
};

export function PropertyPanel() {
  const elements = useAppSelector(selectSelectedElements);
  const selectedBand = useAppSelector(selectSelectedBand);
  const bindings = useAppSelector(selectDatasetBindings);
  const bound = useAppSelector(selectBoundDatasets);

  const [request, setRequest] = useState<ExpressionRequest | null>(null);

  const openExpression = useCallback((next: ExpressionRequest) => setRequest(next), []);

  const datasetNames = useMemo(() => bindings.map((binding) => binding.name), [bindings]);

  const fieldsByDataset = useMemo(() => {
    const map: Record<string, readonly FieldMeta[]> = {};
    for (const entry of bound) {
      map[entry.binding.name] = entry.provider?.fields ?? [];
    }
    return map;
  }, [bound]);

  const rowFields = useMemo(() => {
    const dataset = selectedBand?.band.dataset;
    return dataset ? (fieldsByDataset[dataset] ?? []) : [];
  }, [fieldsByDataset, selectedBand?.band.dataset]);

  const editor = (
    <ExpressionEditor
      open={request !== null}
      title={request?.title ?? ""}
      value={request?.value ?? ""}
      datasetNames={datasetNames}
      rowFields={rowFields}
      fieldsByDataset={fieldsByDataset}
      onClose={() => setRequest(null)}
      onCommit={(value) => {
        request?.onCommit(value);
        setRequest(null);
      }}
    />
  );

  if (elements.length && selectedBand) {
    const textElements = elements.filter(isTextLike) as TextLikeElement[];
    const allText = textElements.length === elements.length && textElements.length > 0;

    return (
      <>
        <header className={styles.panelHead}>
          <span>
            {elements.length === 1
              ? `${elements[0].kind} · ${elements[0].id}`
              : `${elements.length} elements`}
          </span>
        </header>
        <div className={styles.panelScroll}>
          <PositionSection bandIndex={selectedBand.index} elements={elements} />
          <KindSection
            bandIndex={selectedBand.index}
            elements={elements}
            onEditExpression={openExpression}
          />
          {allText ? (
            <>
              <FontSection bandIndex={selectedBand.index} elements={textElements} />
              <FormatSection bandIndex={selectedBand.index} elements={textElements} />
            </>
          ) : null}
          <VisibilitySection
            bandIndex={selectedBand.index}
            elements={elements}
            onEditExpression={openExpression}
          />
        </div>
        {editor}
      </>
    );
  }

  if (selectedBand) {
    return (
      <>
        <header className={styles.panelHead}>
          <span>{`Band · ${selectedBand.band.type}`}</span>
        </header>
        <div className={styles.panelScroll}>
          <BandSection
            bandIndex={selectedBand.index}
            band={selectedBand.band}
            onEditExpression={openExpression}
          />
        </div>
        {editor}
      </>
    );
  }

  return (
    <>
      <header className={styles.panelHead}>
        <span>Page setup</span>
      </header>
      <div className={styles.panelScroll}>
        <PaperSection />
        <EmptyPanel>
          Select an element to edit it, or a band strip to change how it repeats and paginates.
        </EmptyPanel>
      </div>
      {editor}
    </>
  );
}

export default PropertyPanel;
