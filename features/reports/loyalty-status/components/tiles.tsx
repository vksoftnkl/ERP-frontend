"use client";
/** A tab's tiles (Qt `setTile`): caption, figure, the line under it — from the route's `summary`. */
import type { CSSProperties } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { Tile } from "../view/members";
import { toneClass } from "./tone";

export function Tiles({ tiles, label }: { tiles: readonly Tile[]; label: string }) {
  return (
    <div className={styles.tiles} style={{ "--ls-tiles": tiles.length } as CSSProperties} role="group" aria-label={label}>
      {tiles.map((tile) => (
        <div key={tile.id} className={styles.tile} data-tile={tile.id}>
          <span className={styles.tileCaption}>{tile.caption}</span>
          <span className={cx(styles.tileValue, toneClass(tile.tone))}>{tile.value}</span>
          <span className={styles.tileSub}>{tile.sub || " "}</span>
        </div>
      ))}
    </div>
  );
}
