"use client";

/**
 * The properties only one element kind has.
 *
 * Kept in one component rather than seven files because they share every input
 * and differ only in which three or four appear — and because the panel must
 * decide between them from `elements[0].kind` in one place, not seven.
 *
 * A mixed-kind selection shows nothing here: there is no meaningful "symbology"
 * for a barcode and a rectangle together.
 */

import type { ReportElement } from "@/features/print-designer/types/template-definition";
import { BARCODE_SYMBOLOGIES } from "@/features/print-designer/lib/vocabulary";
import {
  useElementPatch,
  useElementPatchEach,
} from "@/features/print-designer/components/panels/usePatch";
import {
  CheckboxInput,
  ColorInput,
  FieldGrid,
  FieldRow,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
  sharedValue,
  isMixed,
} from "@/features/print-designer/components/panels/controls";
import styles from "@/features/print-designer/components/designer.module.scss";

export type KindSectionProps = {
  bandIndex: number;
  elements: ReportElement[];
  onEditExpression: (request: {
    title: string;
    value: string;
    onCommit: (value: string) => void;
  }) => void;
};

function ExpressionRow({
  label,
  value,
  placeholder,
  onChange,
  onOpen,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onOpen: () => void;
}) {
  return (
    <FieldRow label={label} wide>
      <div className={styles.expressionRow}>
        <textarea
          className={styles.textarea}
          style={{ minHeight: 40 }}
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <button
          type="button"
          className={styles.fxButton}
          title="Open the expression editor"
          onClick={onOpen}
        >
          fx
        </button>
      </div>
    </FieldRow>
  );
}

export function KindSection({ bandIndex, elements, onEditExpression }: KindSectionProps) {
  const patch = useElementPatch(
    bandIndex,
    elements.map((element) => element.id),
  );
  const patchEach = useElementPatchEach(bandIndex, elements);

  const kinds = new Set(elements.map((element) => element.kind));
  if (kinds.size !== 1) {
    return null;
  }
  const kind = elements[0].kind;

  const readValue = (): string => {
    const shared = sharedValue(elements, (element) =>
      "value" in element ? element.value : "",
    );
    return isMixed(shared) ? "" : (shared ?? "");
  };

  switch (kind) {
    case "TEXT":
    case "FIELD": {
      const value = readValue();
      const aggregates = elements.map((element) =>
        element.kind === "FIELD" ? element.aggregate : undefined,
      );
      return (
        <Section title={kind === "TEXT" ? "Text" : "Field"}>
          <ExpressionRow
            label="Value"
            value={value}
            placeholder="Text or {{ row.field }}"
            onChange={(next) => patch({ value: next }, "Edit value", `value-${bandIndex}`)}
            onOpen={() =>
              onEditExpression({
                title: "Value expression",
                value,
                onCommit: (next) => patch({ value: next }, "Edit value"),
              })
            }
          />

          {kind === "FIELD" ? (
            <>
              <FieldGrid>
                <SelectInput
                  label="Aggregate"
                  value={sharedValue(aggregates, (aggregate) => aggregate?.fn ?? "")}
                  options={[
                    { value: "", label: "None" },
                    { value: "sum", label: "Sum" },
                    { value: "count", label: "Count" },
                    { value: "avg", label: "Average" },
                    { value: "min", label: "Minimum" },
                    { value: "max", label: "Maximum" },
                  ]}
                  onCommit={(fn) =>
                    patchEach((element) => {
                      if (element.kind !== "FIELD") {
                        return {};
                      }
                      if (!fn) {
                        return { aggregate: undefined };
                      }
                      return {
                        aggregate: {
                          fn: fn as "sum" | "count" | "avg" | "min" | "max",
                          scope: element.aggregate?.scope ?? "REPORT",
                          over: element.aggregate?.over,
                          dataset: element.aggregate?.dataset,
                        },
                      };
                    }, "Set aggregate")
                  }
                />
                <SelectInput
                  label="Scope"
                  value={sharedValue(aggregates, (aggregate) => aggregate?.scope ?? "REPORT")}
                  options={[
                    { value: "REPORT", label: "Report" },
                    { value: "PAGE", label: "Page" },
                    { value: "GROUP", label: "Group" },
                  ]}
                  onCommit={(scope) =>
                    patchEach((element) => {
                      if (element.kind !== "FIELD" || !element.aggregate) {
                        return {};
                      }
                      return {
                        aggregate: {
                          ...element.aggregate,
                          scope: scope as "REPORT" | "PAGE" | "GROUP",
                        },
                      };
                    }, "Set aggregate scope")
                  }
                />
              </FieldGrid>

              {aggregates.some(Boolean) ? (
                <TextInput
                  label="Accumulate (raw expression)"
                  wide
                  mono
                  placeholder="defaults to the value above"
                  value={sharedValue(aggregates, (aggregate) => aggregate?.over ?? "")}
                  onCommit={(over) =>
                    patchEach((element) => {
                      if (element.kind !== "FIELD" || !element.aggregate) {
                        return {};
                      }
                      return {
                        aggregate: { ...element.aggregate, over: over.trim() || undefined },
                      };
                    }, "Set aggregate source")
                  }
                />
              ) : null}
              {aggregates.some(Boolean) ? (
                <p className={styles.listRowMeta}>
                  Set this whenever the value applies a format the number cannot survive — an
                  accounting bracket, a currency symbol, numToWords.
                </p>
              ) : null}
            </>
          ) : null}
        </Section>
      );
    }

    case "LINE":
      return (
        <Section title="Line">
          <FieldGrid>
            <NumberInput
              label="Thickness"
              suffix="pt"
              step={0.25}
              min={0}
              value={sharedValue(elements, (element) =>
                element.kind === "LINE" ? element.widthPt : 0,
              )}
              onCommit={(value) => patch({ widthPt: value }, "Set line width")}
            />
            <TextInput
              label="Grid character"
              mono
              value={sharedValue(elements, (element) =>
                element.kind === "LINE" ? element.gridChar : "-",
              )}
              onCommit={(value) => patch({ gridChar: value.slice(0, 1) || "-" }, "Set grid char")}
            />
            <ColorInput
              label="Colour"
              value={sharedValue(elements, (element) => element.style?.stroke)}
              onCommit={(value) =>
                patchEach(
                  (element) => ({ style: { ...(element.style ?? {}), stroke: value } }),
                  "Set line colour",
                )
              }
            />
          </FieldGrid>
        </Section>
      );

    case "RECT":
      return (
        <Section title="Rectangle">
          <FieldGrid>
            <NumberInput
              label="Corner radius"
              suffix="mm"
              min={0}
              value={sharedValue(elements, (element) =>
                element.kind === "RECT" ? element.radiusMm : 0,
              )}
              onCommit={(value) => patch({ radiusMm: value }, "Set corner radius")}
            />
            <NumberInput
              label="Stroke"
              suffix="pt"
              step={0.25}
              min={0}
              value={sharedValue(elements, (element) => element.style?.strokeWidthPt ?? 0.5)}
              onCommit={(value) =>
                patchEach(
                  (element) => ({ style: { ...(element.style ?? {}), strokeWidthPt: value } }),
                  "Set stroke",
                )
              }
            />
            <ColorInput
              label="Stroke colour"
              value={sharedValue(elements, (element) => element.style?.stroke)}
              onCommit={(value) =>
                patchEach(
                  (element) => ({ style: { ...(element.style ?? {}), stroke: value } }),
                  "Set stroke colour",
                )
              }
            />
            <ColorInput
              label="Fill"
              value={sharedValue(elements, (element) => element.style?.fill)}
              onCommit={(value) =>
                patchEach(
                  (element) => ({ style: { ...(element.style ?? {}), fill: value } }),
                  "Set fill",
                )
              }
            />
          </FieldGrid>
        </Section>
      );

    case "IMAGE": {
      const source = (() => {
        const shared = sharedValue(elements, (element) =>
          element.kind === "IMAGE" ? element.source : "",
        );
        return isMixed(shared) ? "" : (shared ?? "");
      })();
      return (
        <Section title="Image">
          <ExpressionRow
            label="Source"
            value={source}
            placeholder="{{ ctx.companyLogo }}"
            onChange={(next) => patch({ source: next }, "Set image source", `source-${bandIndex}`)}
            onOpen={() =>
              onEditExpression({
                title: "Image source expression",
                value: source,
                onCommit: (next) => patch({ source: next }, "Set image source"),
              })
            }
          />
          <SelectInput
            label="Fit"
            value={sharedValue(elements, (element) =>
              element.kind === "IMAGE" ? element.fit : "CONTAIN",
            )}
            options={[
              { value: "CONTAIN", label: "Contain" },
              { value: "COVER", label: "Cover" },
              { value: "STRETCH", label: "Stretch" },
            ]}
            onCommit={(value) => patch({ fit: value }, "Set image fit")}
          />
        </Section>
      );
    }

    case "BARCODE": {
      const value = readValue();
      return (
        <Section title="Barcode">
          <ExpressionRow
            label="Value"
            value={value}
            placeholder="{{ row.barcode }}"
            onChange={(next) => patch({ value: next }, "Edit barcode value", `value-${bandIndex}`)}
            onOpen={() =>
              onEditExpression({
                title: "Barcode value expression",
                value,
                onCommit: (next) => patch({ value: next }, "Edit barcode value"),
              })
            }
          />
          <SelectInput
            label="Symbology"
            value={sharedValue(elements, (element) =>
              element.kind === "BARCODE" ? element.symbology : "code128",
            )}
            options={BARCODE_SYMBOLOGIES.map((symbology) => ({
              value: symbology,
              label: symbology.toUpperCase(),
            }))}
            onCommit={(value) => patch({ symbology: value }, "Set symbology")}
          />
          <CheckboxInput
            label="Print the digits under the bars"
            value={sharedValue(elements, (element) =>
              element.kind === "BARCODE" ? element.showText : false,
            )}
            onCommit={(value) => patch({ showText: value }, "Set barcode text")}
          />
        </Section>
      );
    }

    case "QRCODE": {
      const value = readValue();
      return (
        <Section title="QR code">
          <ExpressionRow
            label="Value"
            value={value}
            placeholder="{{ row.qrPayload }}"
            onChange={(next) => patch({ value: next }, "Edit QR value", `value-${bandIndex}`)}
            onOpen={() =>
              onEditExpression({
                title: "QR value expression",
                value,
                onCommit: (next) => patch({ value: next }, "Edit QR value"),
              })
            }
          />
          <FieldGrid>
            <NumberInput
              label="Size"
              suffix="mm"
              min={2}
              value={sharedValue(elements, (element) =>
                element.kind === "QRCODE" ? element.size : 0,
              )}
              onCommit={(value) => patch({ size: value }, "Set QR size")}
            />
            <SelectInput
              label="Error correction"
              value={sharedValue(elements, (element) =>
                element.kind === "QRCODE" ? element.errorCorrection : "M",
              )}
              options={[
                { value: "L", label: "L — 7%" },
                { value: "M", label: "M — 15%" },
                { value: "Q", label: "Q — 25%" },
                { value: "H", label: "H — 30%" },
              ]}
              onCommit={(value) => patch({ errorCorrection: value }, "Set error correction")}
            />
          </FieldGrid>
          <p className={styles.listRowMeta}>
            The signed e-invoice QR payload is large; keep M unless the printer smudges.
          </p>
        </Section>
      );
    }

    case "PAGEBREAK": {
      const when = (() => {
        const shared = sharedValue(elements, (element) =>
          element.kind === "PAGEBREAK" ? (element.when ?? "") : "",
        );
        return isMixed(shared) ? "" : (shared ?? "");
      })();
      return (
        <Section title="Page break">
          <ExpressionRow
            label="Break when"
            value={when}
            placeholder="always"
            onChange={(next) =>
              patch({ when: next || undefined }, "Set break condition", `when-${bandIndex}`)
            }
            onOpen={() =>
              onEditExpression({
                title: "Page break condition",
                value: when,
                onCommit: (next) => patch({ when: next || undefined }, "Set break condition"),
              })
            }
          />
        </Section>
      );
    }
  }
}

export default KindSection;
