"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cx } from "@/components/design-system/cx";
import styles from "@/components/design-system/ui/color-picker.module.scss";

const DEFAULT_COLOR = "#000000";
const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const PRESET_COLORS = [
  "#0f172a",
  "#334155",
  "#64748b",
  "#dc2626",
  "#ea580c",
  "#f59e0b",
  "#16a34a",
  "#0d9488",
  "#0284c7",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Returns `#rrggbb` for any accepted shorthand/longhand hex, otherwise "". */
function normalizeHex(value: string): string {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) {
    return "";
  }
  const digits = match[1];
  const expanded =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => `${digit}${digit}`)
          .join("")
      : digits;
  return `#${expanded.toLowerCase()}`;
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }
  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const chroma = v * s;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const offset = v - chroma;
  const sector = Math.floor(h / 60) % 6;
  const [red, green, blue] = (
    [
      [chroma, secondary, 0],
      [secondary, chroma, 0],
      [0, chroma, secondary],
      [0, secondary, chroma],
      [secondary, 0, chroma],
      [chroma, 0, secondary],
    ] as const
  )[sector];
  return {
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255,
  };
}

export type ERPColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
  "aria-describedby"?: string;
};

/**
 * Color field backed by an in-page popover rather than the browser's native
 * `<input type="color">` dialog, which the page cannot dismiss on outside click.
 */
export function ERPColorPicker({
  value,
  onChange,
  id,
  disabled = false,
  invalid = false,
  label,
  className,
  style,
  "aria-describedby": ariaDescribedBy,
}: ERPColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);

  const color = normalizeHex(value) || DEFAULT_COLOR;
  const { h, s, v } = useMemo(() => rgbToHsv(hexToRgb(color)), [color]);

  // Pure black/white carry no hue, so keep the last meaningful one for the
  // saturation plane instead of snapping the slider back to red.
  const [hue, setHue] = useState(h);
  useEffect(() => {
    if (s > 0 && v > 0) {
      setHue(h);
    }
  }, [h, s, v]);

  const emit = useCallback(
    (nextColor: string) => {
      setHexDraft(null);
      onChange(nextColor);
    },
    [onChange],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleOutsidePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  const selectFromArea = useCallback(
    (clientX: number, clientY: number) => {
      const area = areaRef.current;
      if (!area) {
        return;
      }
      const rect = area.getBoundingClientRect();
      const nextS = clamp((clientX - rect.left) / rect.width, 0, 1);
      const nextV = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
      emit(rgbToHex(hsvToRgb({ h: hue, s: nextS, v: nextV })));
    },
    [emit, hue],
  );

  const handleAreaPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectFromArea(event.clientX, event.clientY);
  };

  const handleAreaPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    selectFromArea(event.clientX, event.clientY);
  };

  const handleAreaPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Escape must not bubble to the modal's document listener, or closing the
  // picker would close the whole form with it.
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !isOpen) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const hexInputValue = hexDraft ?? color.toUpperCase();

  return (
    <div
      ref={containerRef}
      className={cx(styles.root, className)}
      style={style}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        data-erp-modal-field-control="true"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={ariaDescribedBy}
        className={cx(
          styles.trigger,
          isOpen && styles.triggerOpen,
          invalid && styles.triggerInvalid,
          disabled && styles.triggerDisabled,
        )}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={styles.swatch} style={{ backgroundColor: color }} />
        <span className={styles.triggerValue}>{color.toUpperCase()}</span>
      </button>
      {isOpen ? (
        <div
          className={styles.panel}
          role="dialog"
          aria-label={label ? `Choose ${label}` : "Choose color"}
        >
          <div
            ref={areaRef}
            className={styles.area}
            style={{ backgroundColor: rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 })) }}
            onPointerDown={handleAreaPointerDown}
            onPointerMove={handleAreaPointerMove}
            onPointerUp={handleAreaPointerUp}
          >
            <div className={styles.areaSaturation} />
            <div className={styles.areaValue} />
            <span
              className={styles.areaThumb}
              style={{
                left: `${s * 100}%`,
                top: `${(1 - v) * 100}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={Math.round(hue)}
            aria-label="Hue"
            className={styles.hueSlider}
            onChange={(event) => {
              const nextHue = Number(event.target.value);
              setHue(nextHue);
              emit(rgbToHex(hsvToRgb({ h: nextHue, s: s || 1, v: v || 1 })));
            }}
          />
          <div className={styles.presets}>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={preset}
                aria-pressed={preset === color}
                className={cx(
                  styles.preset,
                  preset === color && styles.presetActive,
                )}
                style={{ backgroundColor: preset }}
                onClick={() => emit(preset)}
              />
            ))}
          </div>
          <input
            type="text"
            spellCheck={false}
            aria-label="Hex color"
            className={styles.hexInput}
            value={hexInputValue}
            placeholder="#RRGGBB"
            onChange={(event) => {
              const raw = event.target.value;
              setHexDraft(raw);
              const normalized = normalizeHex(raw);
              if (normalized) {
                onChange(normalized);
              }
            }}
            onBlur={() => setHexDraft(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

export default ERPColorPicker;
