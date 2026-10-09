"use client";
/**
 * The six tiles (plan §7), straight from `/parties.tiles`: they cover all
 * filtered rows, not the page. Overdue and Above-N are filter shortcuts; the
 * rest are read-only.
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { Tile, TileId } from "../view/tiles";
import { toneClass } from "./tone";

const SHORTCUT_TIP: Partial<Record<TileId, string>> = {
  overdue: "Show only parties with something overdue",
  above: "Sort by the oldest buckets",
};

type Props = { tiles: readonly Tile[] | null; onShortcut: (id: TileId) => void };

export function StatTiles({ tiles, onShortcut }: Props) {
  if (!tiles) {
    return (
      <div className={styles.tiles} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cx(styles.tile, styles.tileNeutral)}>
            <span className={styles.skeleton} style={{ width: "50%" }} />
            <span className={styles.skeleton} style={{ width: "80%", height: 14 }} />
            <span className={styles.skeleton} style={{ width: "60%" }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.tiles}>
      {tiles.map((tile) => {
        const body = (
          <>
            <span className={styles.tileHeading}>{tile.heading}</span>
            <span className={styles.tileValue}>{tile.value}</span>
            <span className={styles.tileCaption}>{tile.caption}</span>
          </>
        );
        const className = cx(styles.tile, toneClass(tile.tone));
        return tile.shortcut ? (
          <button
            key={tile.id}
            type="button"
            className={className}
            title={SHORTCUT_TIP[tile.id]}
            onClick={() => onShortcut(tile.id)}
          >
            {body}
          </button>
        ) : (
          <div key={tile.id} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
