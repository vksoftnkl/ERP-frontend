"use client";

/**
 * SIZE GRID (optional) — one design, one box per size → one line per size.
 *
 * The Qt card: Item (dropdown 42), Brand (dropdown 18), Colour, Fabric, Model,
 * Size set, Cost, then one small box per size of the set with a quantity, a
 * "→ n line(s), m pc(s)" summary and the Add button. Prices come from the
 * Markup rule per line, once the lines exist.
 */
import { useId, useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { toast } from "@/lib/notify";
import { sizeSets } from "../domain/textile-tag-entity";
import { sizeGridSummary, type SizeGridAdd } from "../domain/textile-tag-lines";
import { sizesOf, type TagLists } from "../domain/textile-tag-lists";
import styles from "../page.module.scss";
import { clampDecimal } from "./tag-cell";

export type SizeGridCardProps = {
  lists: TagLists;
  itemDropdownId: string;
  brandDropdownId: string;
  disabled?: boolean;
  onAdd: (add: Omit<SizeGridAdd, "keys">) => void;
};

export function SizeGridCard({ lists, itemDropdownId, brandDropdownId, disabled = false, onAdd }: SizeGridCardProps) {
  const ids = useId();
  const [item, setItem] = useState<DropdownSelection | null>(null);
  const [brand, setBrand] = useState<DropdownSelection | null>(null);
  const [colour, setColour] = useState("");
  const [fabric, setFabric] = useState("");
  const [model, setModel] = useState("");
  const [sizeSet, setSizeSet] = useState<string>(sizeSets()[0]);
  const [cost, setCost] = useState("");
  /** Typed quantities by size — kept when the list lands after the boxes were built. */
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const sizes = useMemo(() => sizesOf(lists, sizeSet), [lists, sizeSet]);
  const summary = useMemo(
    () => sizeGridSummary(sizes.map((size) => Number.parseInt(quantities[size] ?? "", 10) || 0)),
    [quantities, sizes],
  );

  const add = () => {
    if (!item?.id) {
      toast.info("Pick the item first.", { title: "Size grid" });
      return;
    }
    const chosen = sizes
      .map((size) => ({ size, qty: Number.parseInt(quantities[size] ?? "", 10) || 0 }))
      .filter(({ qty }) => qty > 0);
    if (chosen.length === 0) {
      toast.info("Type a quantity under at least one size.", { title: "Size grid" });
      return;
    }
    onAdd({
      itemId: item.id,
      itemName: item.text,
      brandId: brand?.id ?? "",
      brandName: brand?.text ?? "",
      sizeSet,
      sizes: chosen,
      colour,
      fabric,
      model,
      cost,
    });
    setQuantities({});
  };

  return (
    <section className={styles.card} aria-label="Size grid">
      <h2 className={styles.cardTitle}>SIZE GRID (optional) — one design, one box per size → one line per size</h2>
      <div className={styles.sizeGridFields}>
        <label className={quotationStyles.label} htmlFor={`${ids}-item`}>Item</label>
        <NexDropdownSingle
          id={`${ids}-item`}
          dropdownId={itemDropdownId}
          value={item}
          onChange={(selection) => setItem(selection)}
          placeholder="item"
          disabled={disabled}
          className={styles.sizeGridItem}
        />
        <label className={quotationStyles.label} htmlFor={`${ids}-brand`}>Brand</label>
        <NexDropdownSingle
          id={`${ids}-brand`}
          dropdownId={brandDropdownId}
          value={brand}
          onChange={(selection) => setBrand(selection)}
          placeholder="brand"
          disabled={disabled}
          className={styles.sizeGridBrand}
        />
        <label className={quotationStyles.label} htmlFor={`${ids}-colour`}>Colour</label>
        <input
          id={`${ids}-colour`}
          className={cx(quotationStyles.input, styles.sizeGridShort)}
          value={colour}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => setColour(event.target.value)}
        />
        <label className={quotationStyles.label} htmlFor={`${ids}-fabric`}>Fabric</label>
        <input
          id={`${ids}-fabric`}
          className={cx(quotationStyles.input, styles.sizeGridShort)}
          value={fabric}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => setFabric(event.target.value)}
        />
        <label className={quotationStyles.label} htmlFor={`${ids}-model`}>Model</label>
        <input
          id={`${ids}-model`}
          className={quotationStyles.input}
          value={model}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => setModel(event.target.value)}
        />
        <label className={quotationStyles.label} htmlFor={`${ids}-set`}>Size set</label>
        <select
          id={`${ids}-set`}
          className={cx(quotationStyles.select, styles.sizeGridSet)}
          value={sizeSet}
          disabled={disabled}
          onChange={(event) => setSizeSet(event.target.value)}
        >
          {sizeSets().map((set) => (
            <option key={set} value={set}>
              {set}
            </option>
          ))}
        </select>
        <label className={quotationStyles.label} htmlFor={`${ids}-cost`}>Cost</label>
        <input
          id={`${ids}-cost`}
          className={cx(quotationStyles.input, quotationStyles.alignRight, styles.sizeGridCost)}
          value={cost}
          inputMode="decimal"
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => setCost(clampDecimal(event.target.value, 2))}
        />
        <button
          type="button"
          className={quotationStyles.button}
          disabled={disabled}
          title="Writes one line per size with a quantity. Prices come from the Markup rules."
          onClick={add}
        >
          {summary.button}
        </button>
      </div>
      <div className={styles.sizeGridBoxes}>
        <span className={quotationStyles.label}>Qty per size:</span>
        {sizes.map((size) => (
          <label key={size} className={styles.sizeBox}>
            <span className={styles.sizeBoxLabel}>{size}</span>
            <input
              className={cx(quotationStyles.input, styles.sizeBoxInput)}
              value={quantities[size] ?? ""}
              inputMode="numeric"
              maxLength={4}
              disabled={disabled}
              aria-label={`Quantity for size ${size}`}
              autoComplete="off"
              onChange={(event) =>
                setQuantities((current) => ({ ...current, [size]: event.target.value.replace(/\D/g, "").slice(0, 4) }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.ctrlKey) {
                  event.preventDefault();
                  add();
                }
              }}
            />
          </label>
        ))}
        <span className={styles.sizeGridSummary}>{summary.summary}</span>
      </div>
    </section>
  );
}
