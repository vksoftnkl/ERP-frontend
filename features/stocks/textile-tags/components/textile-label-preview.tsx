"use client";

/**
 * What the current line's label will look like (mockup REV 3 panel 11) — the
 * SVG rendering of `TextileLabelPreview::paintEvent`. A preview only: the
 * printed label is the print module's TEXTILE_TAG_LABEL template over the
 * server's dataset (plan §8), so this draws the shipped design's fields in
 * its order and nothing more.
 *
 * The bars are real Code 128 (set B) for the barcode shown, so a phone
 * scanner reads the preview the same as the label. Before reserve there is
 * no barcode yet: the bars are greyed and the number reads "on reserve".
 */
import { useId, type ReactNode } from "react";
import { formatCurrency } from "@/domain/pricing";
import { code128B, code128Modules } from "../domain/code128";
import type { TagLabel } from "../domain/textile-tag-lines";
import styles from "../page.module.scss";

/** The label stock, in the Qt widget's size hint. */
const CARD_W = 300;
const CARD_H = 190;
const INSET = 1.5;
const PAD_X = 12;
const PAD_Y = 8;
const BAR_H = 34;

const INK = "#111827";
const GREY = "#6B7280";
const PRICE_RED = "#7F1D1D";
const BAR_IDLE = "#CBD5E1";

/** Qt points → CSS pixels. */
function pt(points: number): number {
  return points * (4 / 3);
}

function money(value: number): string {
  return formatCurrency(value, Number.isInteger(value) ? 0 : 2, true);
}

export type TextileLabelPreviewProps = {
  /** null = nothing to preview. */
  label: TagLabel | null;
  className?: string;
};

export function TextileLabelPreview({ label, className }: TextileLabelPreviewProps) {
  const clipId = useId();
  const bodyLeft = INSET + PAD_X;
  const bodyTop = INSET + PAD_Y;
  const bodyWidth = CARD_W - 2 * (INSET + PAD_X);
  const bodyHeight = CARD_H - 2 * (INSET + PAD_Y);
  const bodyRight = bodyLeft + bodyWidth;

  const rows: ReactNode[] = [];
  if (label) {
    let y = bodyTop;
    const line = (
      key: string,
      text: string,
      size: number,
      bold: boolean,
      colour: string,
      anchor: "start" | "end" = "start",
    ): number => {
      const height = size * 1.3;
      rows.push(
        <text
          key={key}
          x={anchor === "end" ? bodyRight : bodyLeft}
          y={y + height * 0.72}
          fontSize={size}
          fontWeight={bold ? 700 : 400}
          fill={colour}
          textAnchor={anchor}
        >
          {text}
        </text>,
      );
      return height;
    };

    // Brand left, cost code right (staff read it; customers cannot).
    {
      const size = pt(8.5);
      const height = size * 1.3;
      rows.push(
        <text key="brand" x={bodyLeft} y={y + height * 0.72} fontSize={size} fontWeight={700} fill={INK}>
          {(label.brand || label.itemName).toUpperCase()}
        </text>,
      );
      if (label.costCode) {
        rows.push(
          <text key="costCode" x={bodyRight} y={y + height * 0.72} fontSize={size} fontWeight={700} fill={INK} textAnchor="end">
            {label.costCode}
          </text>,
        );
      }
      y += height;
    }

    const first = [label.itemName, ...(label.model ? [label.model] : [])];
    y += line("first", first.join(" · "), pt(7), false, INK);

    const second = [label.size, label.colour, label.fabric].filter((part) => part !== "");
    if (second.length > 0) {
      y += line("second", second.join(" · "), pt(7), false, INK);
    }
    if (label.note) {
      y += line("note", label.note, pt(6.5), false, GREY);
    }

    // The bars.
    y += 4;
    const code = label.barcode;
    const widths = code128B(code || "T0000000");
    const modules = code128Modules(widths);
    if (modules > 0) {
      const unit = Math.min(1.6, bodyWidth / modules);
      let x = bodyLeft + (bodyWidth - unit * modules) / 2;
      const fill = code ? INK : BAR_IDLE;
      widths.forEach((width, index) => {
        if (index % 2 === 0) {
          rows.push(<rect key={`bar-${index}`} x={x} y={y} width={unit * width} height={BAR_H} fill={fill} />);
        }
        x += unit * width;
      });
    }
    y += BAR_H + 1;
    {
      const size = pt(8);
      const height = size * 1.3;
      rows.push(
        <text
          key="code"
          x={bodyLeft + bodyWidth / 2}
          y={y + height * 0.72}
          fontSize={size}
          fontFamily="ui-monospace, 'Courier New', monospace"
          fontWeight={code ? 700 : 400}
          fill={code ? INK : GREY}
          textAnchor="middle"
        >
          {code || "barcode on reserve"}
        </text>,
      );
      y += height + 2;
    }

    // MRP small, the price large, packed month bottom right.
    if (label.mrp > 0) {
      y += line("mrp", `MRP ₹${money(label.mrp)} incl. of all taxes`, pt(6.5), false, GREY);
    }
    {
      const size = pt(13);
      const height = size * 1.3;
      rows.push(
        <text key="price" x={bodyLeft} y={y + height * 0.72} fontSize={size} fontWeight={700} fill={PRICE_RED}>
          {`₹ ${money(label.price)}`}
        </text>,
      );
      rows.push(
        <text key="packed" x={bodyRight} y={y + height * 0.72} fontSize={pt(6.5)} fill={GREY} textAnchor="end">
          {`Packed ${label.packed}`}
        </text>,
      );
    }
  }

  return (
    <svg
      className={className ?? styles.previewCard}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      role="img"
      aria-label={label ? `Label preview for ${label.itemName}` : "Label preview"}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={bodyLeft} y={bodyTop} width={bodyWidth} height={bodyHeight} />
        </clipPath>
      </defs>
      <rect
        x={INSET}
        y={INSET}
        width={CARD_W - 2 * INSET}
        height={CARD_H - 2 * INSET}
        rx={6}
        ry={6}
        fill="#ffffff"
        stroke="#94A3B8"
        strokeWidth={1.2}
      />
      {label ? (
        <g clipPath={`url(#${clipId})`} fontFamily="inherit">
          {rows}
        </g>
      ) : (
        <g fontSize={pt(8)} fill={GREY} textAnchor="middle">
          <text x={CARD_W / 2} y={CARD_H / 2 - 4}>
            Pick an item on a line
          </text>
          <text x={CARD_W / 2} y={CARD_H / 2 + 12}>
            to see its label
          </text>
        </g>
      )}
    </svg>
  );
}
