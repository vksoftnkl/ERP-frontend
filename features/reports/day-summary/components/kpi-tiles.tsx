/**
 * The six tiles (plan §7.1), in the server's order. A click opens the
 * Vouchers tab on that tile's nature (the cash tile: on cash).
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { TileView } from "../view/tiles";

export function KpiTiles({ tiles, onPick }: { tiles: readonly TileView[]; onPick: (code: string) => void }) {
  if (tiles.length === 0) return null;
  return (
    <div className={styles.tiles}>
      {tiles.map((tile) => (
        <button
          key={tile.code}
          type="button"
          className={cx(styles.tile, styles[`tone-${tile.tone}`])}
          onClick={() => onPick(tile.code)}
          title={tile.code === "CASH_IN_HAND" ? "Vouchers touching cash" : `${tile.heading} vouchers`}
        >
          <span className={styles.tileHeading}>{tile.heading}</span>
          <span className={styles.tileValue}>{tile.value || "—"}</span>
          <span className={styles.tileSub}>{tile.sub || " "}</span>
        </button>
      ))}
    </div>
  );
}
