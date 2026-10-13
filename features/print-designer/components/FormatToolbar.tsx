"use client";

/**
 * The format strip -- QtRPT's second toolbar.
 *
 * Font, size, bold/italic/underline/strikeout, horizontal alignment including
 * justify, vertical alignment, the six frame buttons (top, bottom, left, right,
 * all, none), frame width and style, and the three colour buttons (font,
 * background, border). Everything here also lives in the property panel; this
 * is the one-click route a QtRPT user reaches for, and it acts on the whole
 * selection at once.
 */

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  canHaveBorder,
  isTextLike,
  type FontSpec,
  type HorizontalAlign,
  type LineStyle,
  type ReportElement,
  type TextLikeElement,
  type VerticalAlign,
} from "@/features/print-designer/types/template-definition";
import {
  selectionBorderSet,
  selectionBorderToggled,
  type FrameSide,
} from "@/features/print-designer/store/designerSlice";
import {
  selectLayoutMode,
  selectSelectedBand,
  selectSelectedElements,
} from "@/features/print-designer/store/selectors";
import {
  useElementPatch,
  useElementPatchEach,
} from "@/features/print-designer/components/panels/usePatch";
import {
  FONT_FAMILIES,
  FONT_SIZE_PRESETS,
  LINE_STYLES,
  LINE_STYLE_LABELS,
} from "@/features/print-designer/lib/vocabulary";
import styles from "@/features/print-designer/components/designer.module.scss";

const FRAME_WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3] as const;

const FRAME_BUTTONS: ReadonlyArray<{ side: FrameSide; icon: string; title: string }> = [
  { side: "top", icon: "▔", title: "Top line" },
  { side: "bottom", icon: "▁", title: "Bottom line" },
  { side: "left", icon: "▏", title: "Left line" },
  { side: "right", icon: "▕", title: "Right line" },
];

/** The first element's value, or a fallback: a strip shows one state. */
function first<T>(elements: readonly ReportElement[], read: (element: ReportElement) => T | undefined, fallback: T): T {
  for (const element of elements) {
    const value = read(element);
    if (value !== undefined) {
      return value;
    }
  }
  return fallback;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function FormatToolbar() {
  const dispatch = useAppDispatch();
  const elements = useAppSelector(selectSelectedElements);
  const selectedBand = useAppSelector(selectSelectedBand);
  const layoutMode = useAppSelector(selectLayoutMode);
  const bandIndex = selectedBand?.index ?? null;

  const textElements = elements.filter(isTextLike) as TextLikeElement[];
  const framable = elements.filter(canHaveBorder);
  const hasText = textElements.length > 0;
  const hasFrame = framable.length > 0 && layoutMode !== "GRID";

  const patchText = useElementPatch(
    bandIndex,
    textElements.map((element) => element.id),
  );
  const patchTextEach = useElementPatchEach(bandIndex, textElements);
  const patchEach = useElementPatchEach(bandIndex, elements);

  const font = (key: keyof FontSpec) =>
    first(textElements, (element) => (isTextLike(element) ? element.font?.[key] : undefined), undefined);

  const setFont = (key: keyof FontSpec, value: unknown, label: string) =>
    patchTextEach(
      (element) => ({ font: { ...("font" in element ? (element.font ?? {}) : {}), [key]: value } }),
      label,
    );

  const toggleFont = (key: "bold" | "italic" | "underline" | "strikeout", label: string) =>
    setFont(key, !(font(key) ?? false), label);

  const align = first(textElements, (element) => (isTextLike(element) ? element.align : undefined), "left" as HorizontalAlign);
  const vAlign = first(textElements, (element) => (isTextLike(element) ? element.vAlign : undefined), "top" as VerticalAlign);
  const border = first(framable, (element) => element.border, undefined);
  const textColour = first(textElements, (element) => element.style?.color, "#000000");
  const fillColour = first(elements, (element) => element.style?.fill, "#ffffff");

  const toolButton = (active: boolean) => `${styles.toolButton} ${active ? styles.toolButtonActive : ""}`;

  return (
    <div className={`${styles.toolbar} ${styles.toolbarLast} ${styles.toolStrip}`} aria-label="Format">
      <span className={styles.toolLabel}>Font</span>
      <select
        className={styles.toolSelect}
        disabled={!hasText}
        value={String(font("family") ?? "NotoSans")}
        onChange={(event) => setFont("family", event.target.value, "Set font")}
        aria-label="Font name"
        title="Font name"
      >
        {FONT_FAMILIES.map((family) => (
          <option key={family} value={family}>
            {family}
          </option>
        ))}
      </select>
      <select
        className={styles.toolSelect}
        disabled={!hasText}
        style={{ minWidth: 44 }}
        value={String(font("size") ?? 9)}
        onChange={(event) => setFont("size", Number(event.target.value), "Set font size")}
        aria-label="Font size"
        title="Font size (pt)"
      >
        {[...new Set([...FONT_SIZE_PRESETS, Number(font("size") ?? 9)])]
          .sort((left, right) => left - right)
          .map((size) => (
            <option key={size} value={String(size)}>
              {size}
            </option>
          ))}
      </select>

      <div className={styles.toolGroup}>
        <button type="button" className={toolButton(font("bold") === true)} disabled={!hasText} title="Bold" onClick={() => toggleFont("bold", "Bold")}>
          <span className={styles.toolIcon} style={{ fontWeight: 700 }}>B</span>
        </button>
        <button type="button" className={toolButton(font("italic") === true)} disabled={!hasText} title="Italic" onClick={() => toggleFont("italic", "Italic")}>
          <span className={styles.toolIcon} style={{ fontStyle: "italic" }}>I</span>
        </button>
        <button type="button" className={toolButton(font("underline") === true)} disabled={!hasText} title="Underline" onClick={() => toggleFont("underline", "Underline")}>
          <span className={styles.toolIcon} style={{ textDecoration: "underline" }}>U</span>
        </button>
        <button type="button" className={toolButton(font("strikeout") === true)} disabled={!hasText} title="Strikeout" onClick={() => toggleFont("strikeout", "Strikeout")}>
          <span className={styles.toolIcon} style={{ textDecoration: "line-through" }}>S</span>
        </button>
      </div>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        {(
          [
            ["left", "⇤", "Align left"],
            ["center", "↔", "Align centre"],
            ["right", "⇥", "Align right"],
            ["justify", "☰", "Justify"],
          ] as const
        ).map(([value, icon, title]) => (
          <button
            key={value}
            type="button"
            className={toolButton(hasText && align === value)}
            disabled={!hasText}
            title={title}
            onClick={() => patchText({ align: value }, title)}
          >
            <span className={styles.toolIcon}>{icon}</span>
          </button>
        ))}
        {(
          [
            ["top", "⤒", "Align top"],
            ["middle", "≡", "Align vertical centre"],
            ["bottom", "⤓", "Align bottom"],
          ] as const
        ).map(([value, icon, title]) => (
          <button
            key={value}
            type="button"
            className={toolButton(hasText && vAlign === value)}
            disabled={!hasText}
            title={title}
            onClick={() => patchText({ vAlign: value }, title)}
          >
            <span className={styles.toolIcon}>{icon}</span>
          </button>
        ))}
      </div>

      <div className={styles.toolDivider} />
      <span className={styles.toolLabel}>Frame</span>

      <div className={styles.toolGroup}>
        {FRAME_BUTTONS.map((button) => (
          <button
            key={button.side}
            type="button"
            className={toolButton(hasFrame && border?.[button.side] === true)}
            disabled={!hasFrame}
            title={button.title}
            onClick={() => dispatch(selectionBorderToggled(button.side))}
          >
            <span className={styles.toolIcon}>{button.icon}</span>
          </button>
        ))}
        <button
          type="button"
          className={styles.toolButton}
          disabled={!hasFrame}
          title="All frame lines"
          onClick={() =>
            dispatch(
              selectionBorderSet({
                patch: { top: true, right: true, bottom: true, left: true },
                label: "All frame lines",
              }),
            )
          }
        >
          <span className={styles.toolIcon}>▢</span>
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled={!hasFrame}
          title="No frame"
          onClick={() => dispatch(selectionBorderSet({ patch: null }))}
        >
          <span className={styles.toolIcon} style={{ opacity: 0.45 }}>⬚</span>
        </button>
      </div>

      <select
        className={styles.toolSelect}
        disabled={!hasFrame}
        style={{ minWidth: 52 }}
        value={String(border?.widthPt ?? 0.5)}
        onChange={(event) =>
          dispatch(
            selectionBorderSet({
              patch: { widthPt: Number(event.target.value) },
              label: "Frame width",
            }),
          )
        }
        aria-label="Frame width"
        title="Frame width (pt)"
      >
        {[...new Set([...FRAME_WIDTHS, border?.widthPt ?? 0.5])]
          .sort((left, right) => left - right)
          .map((width) => (
            <option key={width} value={String(width)}>
              {`${width}pt`}
            </option>
          ))}
      </select>
      <select
        className={styles.toolSelect}
        disabled={!hasFrame}
        value={border?.style ?? "SOLID"}
        onChange={(event) =>
          dispatch(
            selectionBorderSet({
              patch: { style: event.target.value as LineStyle },
              label: "Frame style",
            }),
          )
        }
        aria-label="Frame style"
        title="Frame style"
      >
        {LINE_STYLES.map((style) => (
          <option key={style} value={style}>
            {LINE_STYLE_LABELS[style]}
          </option>
        ))}
      </select>

      <div className={styles.toolDivider} />

      <div className={styles.toolGroup}>
        <label className={styles.toolColor} title="Font colour">
          <span className={styles.toolIcon}>A</span>
          <input
            type="color"
            disabled={!hasText}
            value={HEX.test(textColour) ? textColour : "#000000"}
            onChange={(event) =>
              patchTextEach(
                (element) => ({ style: { ...(element.style ?? {}), color: event.target.value } }),
                "Font colour",
                "toolbar-font-colour",
              )
            }
            aria-label="Font colour"
          />
        </label>
        <label className={styles.toolColor} title="Background colour">
          <span className={styles.toolIcon}>▒</span>
          <input
            type="color"
            disabled={!elements.length}
            value={HEX.test(fillColour) ? fillColour : "#ffffff"}
            onChange={(event) =>
              patchEach(
                (element) => ({ style: { ...(element.style ?? {}), fill: event.target.value } }),
                "Background colour",
                "toolbar-fill-colour",
              )
            }
            aria-label="Background colour"
          />
        </label>
        <label className={styles.toolColor} title="Border colour">
          <span className={styles.toolIcon}>▣</span>
          <input
            type="color"
            disabled={!hasFrame}
            value={border?.color && HEX.test(border.color) ? border.color : "#000000"}
            onChange={(event) =>
              dispatch(
                selectionBorderSet({
                  patch: { color: event.target.value },
                  label: "Border colour",
                  coalesceKey: "toolbar-border-colour",
                }),
              )
            }
            aria-label="Border colour"
          />
        </label>
      </div>
    </div>
  );
}

export default FormatToolbar;
