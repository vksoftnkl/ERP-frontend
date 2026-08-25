"use client";

/**
 * A band's label in the gutter beside the page.
 *
 * Every banded report designer puts the band name here rather than on the page,
 * and for a good reason: the page is where the design lives, and a caption bar
 * drawn across it takes millimetres away from the thing being designed. In the
 * gutter it costs nothing and stays aligned with the band it names.
 *
 * The flags are not decoration. `autoGrow`, `keepWithNext` and `printOn` change
 * pagination and are invisible in the output until they misbehave, so the band
 * states them where the user is already looking.
 */

import { useAppDispatch } from "@/store/hooks";
import type { Band } from "@/features/print-designer/types/template-definition";
import { BAND_LABELS } from "@/features/print-designer/lib/vocabulary";
import { selectBand } from "@/features/print-designer/store/designerSlice";
import styles from "@/features/print-designer/components/designer.module.scss";

export type BandCaptionProps = {
  bandIndex: number;
  band: Band;
  selected: boolean;
  collapsed: boolean;
  isGridMode: boolean;
  onToggleCollapsed: (bandIndex: number) => void;
};

export function BandCaption({
  bandIndex,
  band,
  selected,
  collapsed,
  isGridMode,
  onToggleCollapsed,
}: BandCaptionProps) {
  const dispatch = useAppDispatch();

  const flags: string[] = [];
  if (band.dataset) {
    flags.push(band.dataset);
  }
  if (band.autoGrow) {
    flags.push("autoGrow");
  }
  if (band.keepTogether) {
    flags.push("keepTogether");
  }
  if (band.keepWithNext) {
    flags.push("keepWithNext");
  }
  if (band.keepWithLastDetail) {
    flags.push("keepWithLast");
  }
  if (band.printOn !== "ALL_PAGES") {
    flags.push(band.printOn.toLowerCase().replace(/_/g, " "));
  }
  if (band.visible) {
    flags.push("conditional");
  }

  const size = isGridMode
    ? `${band.heightRows ?? 1}r`
    : `${band.heightMm}mm`;

  return (
    <div
      className={`${styles.bandCaption} ${selected ? styles.bandCaptionSelected : ""}`}
      onPointerDown={() => dispatch(selectBand(bandIndex))}
      role="presentation"
      title={`${BAND_LABELS[band.type]} — ${band.elements.length} element(s)`}
    >
      <div className={styles.bandCaptionInner}>
        <div className={styles.bandCaptionTop}>
          <button
            type="button"
            className={styles.bandCollapse}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapsed(bandIndex);
            }}
            aria-label={collapsed ? "Expand band" : "Collapse band"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <span className={styles.bandCaptionName}>{BAND_LABELS[band.type]}</span>
          <span className={styles.bandCaptionSize}>{size}</span>
        </div>
        {flags.length ? (
          <div className={styles.bandCaptionFlags}>
            {flags.map((flag) => (
              <span key={flag} className={styles.bandFlag}>
                {flag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default BandCaption;
