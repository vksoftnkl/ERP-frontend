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

import type {
  AggregateFunction,
  ChartElement,
  ChartSeries,
  ChartType,
  CrosstabAxis,
  CrosstabMeasure,
  CrosstabOverflow,
  CrosstabSort,
  LegendPosition,
  LineStyle,
  ReportElement,
  Shape,
} from "@/features/print-designer/types/template-definition";
import { MARKUP_TAGS, wrapSelection } from "@/features/print-designer/lib/markup";
import { useAppSelector } from "@/store/hooks";
import { selectDatasetBindings } from "@/features/print-designer/store/selectors";
import {
  AGGREGATE_FUNCTIONS,
  BARCODE_LABELS,
  BARCODE_SYMBOLOGIES,
  CHART_PALETTE,
  CHART_TYPES,
  CHART_TYPE_LABELS,
  LEGEND_POSITIONS,
  LINE_STYLES,
  LINE_STYLE_LABELS,
  SHAPES,
  SHAPE_LABELS,
  TWO_D_SYMBOLOGIES,
  CROSSTAB_OVERFLOWS,
  CROSSTAB_OVERFLOW_LABELS,
  CROSSTAB_SORTS,
  CROSSTAB_SORT_LABELS,
} from "@/features/print-designer/lib/vocabulary";
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

const LINE_STYLE_OPTIONS = LINE_STYLES.map((style) => ({ value: style, label: LINE_STYLE_LABELS[style] }));

/**
 * The rich-text buttons over a markup value: each wraps the selected text in
 * its tag, or drops an empty pair at the caret. They act on the textarea in
 * their own row, read at click time, so the selection is the one the user made.
 */
function MarkupButtons({ onInsert }: { onInsert: (tag: string, textarea: HTMLTextAreaElement) => void }) {
  return (
    <div className={styles.toggleRow}>
      {MARKUP_TAGS.map((entry) => (
        <button
          key={entry.tag}
          type="button"
          className={styles.toolButton}
          title={`${entry.title}: wraps the selected text in <${entry.tag}>`}
          // mousedown, so the textarea keeps its selection while we read it.
          onMouseDown={(event) => {
            event.preventDefault();
            const textarea = event.currentTarget
              .closest("[data-value-row]")
              ?.querySelector("textarea");
            if (textarea) {
              onInsert(entry.tag, textarea);
            }
          }}
        >
          <span className={styles.toolIcon}>{entry.label}</span>
        </button>
      ))}
      <button
        type="button"
        className={styles.toolButton}
        title="Colour: wraps the selection in <font color>"
        onMouseDown={(event) => {
          event.preventDefault();
          const textarea = event.currentTarget.closest("[data-value-row]")?.querySelector("textarea");
          if (textarea) {
            onInsert('font color="#c00000"', textarea);
          }
        }}
      >
        <span className={styles.toolIcon} style={{ color: "#c00000" }}>A</span>
      </button>
      <button
        type="button"
        className={styles.toolButton}
        title="Line break"
        onMouseDown={(event) => {
          event.preventDefault();
          const textarea = event.currentTarget.closest("[data-value-row]")?.querySelector("textarea");
          if (textarea) {
            onInsert("br", textarea);
          }
        }}
      >
        <span className={styles.toolIcon}>↵</span>
      </button>
    </div>
  );
}

function ExpressionRow({
  label,
  value,
  placeholder,
  onChange,
  onOpen,
  above,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onOpen: () => void;
  /** Controls drawn over the textarea, e.g. the rich-text buttons. */
  above?: React.ReactNode;
}) {
  const row = (
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
  );
  return (
    <FieldRow label={label} wide>
      {above ? (
        <div className={styles.expressionStack}>
          {above}
          {row}
        </div>
      ) : (
        row
      )}
    </FieldRow>
  );
}

export function KindSection({ bandIndex, elements, onEditExpression }: KindSectionProps) {
  const patch = useElementPatch(
    bandIndex,
    elements.map((element) => element.id),
  );
  const patchEach = useElementPatchEach(bandIndex, elements);
  // Read before the mixed-kind bail below, so the hook order never varies.
  const datasets = useAppSelector(selectDatasetBindings);

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
      const markup = sharedValue(elements, (element) =>
        element.kind === "TEXT" || element.kind === "FIELD" ? element.markup === true : false,
      );
      const insertTag = (tag: string, textarea: HTMLTextAreaElement) => {
        const name = tag.split(" ")[0];
        if (name === "br") {
          const at = textarea.selectionStart;
          patch({ value: `${value.slice(0, at)}<br>${value.slice(at)}` }, "Insert line break");
          return;
        }
        const wrapped = wrapSelection(value, textarea.selectionStart, textarea.selectionEnd, tag);
        // The closing tag is the bare name, whatever attributes the opening one had.
        const fixed = tag === name ? wrapped.value : wrapped.value.replace(`</${tag}>`, `</${name}>`);
        patch({ value: fixed }, `Insert <${name}>`);
      };
      return (
        <Section title={kind === "TEXT" ? "Text" : "Field"}>
          <div data-value-row="" style={{ display: "contents" }}>
            <ExpressionRow
              label="Value"
              value={value}
              placeholder="Text or {{ row.field }}"
              above={markup === true ? <MarkupButtons onInsert={insertTag} /> : undefined}
              onChange={(next) => patch({ value: next }, "Edit value", `value-${bandIndex}`)}
              onOpen={() =>
                onEditExpression({
                  title: "Value expression",
                  value,
                  onCommit: (next) => patch({ value: next }, "Edit value"),
                })
              }
            />
          </div>
          <CheckboxInput
            label="Rich text (HTML)"
            value={markup}
            onCommit={(next) => patch({ markup: next }, next ? "Rich text on" : "Rich text off")}
          />
          {markup === true ? (
            <p className={styles.listRowMeta}>
              {"<b> <i> <u> <s> <sup> <sub> <br> and <font color=\"#c00000\" size=\"3\"> work in the typed text. Tags inside {{ }} and in the data print as typed."}
            </p>
          ) : null}

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
            <SelectInput
              label="Style"
              value={sharedValue(elements, (element) => element.style?.lineStyle ?? "SOLID")}
              options={LINE_STYLE_OPTIONS}
              onCommit={(value) =>
                patchEach(
                  (element) => ({
                    style: { ...(element.style ?? {}), lineStyle: value === "SOLID" ? undefined : (value as LineStyle) },
                  }),
                  "Set line style",
                )
              }
            />
          </FieldGrid>
          <CheckboxInput
            label="Arrow at the start"
            value={sharedValue(elements, (element) =>
              element.kind === "LINE" ? element.arrowStart === true : false,
            )}
            onCommit={(value) => patch({ arrowStart: value }, value ? "Add start arrow" : "Remove start arrow")}
          />
          <CheckboxInput
            label="Arrow at the end"
            value={sharedValue(elements, (element) =>
              element.kind === "LINE" ? element.arrowEnd === true : false,
            )}
            onCommit={(value) => patch({ arrowEnd: value }, value ? "Add end arrow" : "Remove end arrow")}
          />
          <NumberInput
            label="Arrow length"
            suffix="mm"
            step={0.5}
            min={0.5}
            max={20}
            value={sharedValue(elements, (element) =>
              element.kind === "LINE" ? (element.arrowSizeMm ?? 2.5) : 2.5,
            )}
            onCommit={(value) => patch({ arrowSizeMm: value }, "Set arrow length")}
          />
        </Section>
      );

    case "RECT":
      return (
        <Section title="Shape">
          <FieldGrid>
            <SelectInput
              label="Shape"
              value={sharedValue(elements, (element) =>
                element.kind === "RECT" ? (element.shape ?? "RECT") : "RECT",
              )}
              options={SHAPES.map((shape) => ({ value: shape, label: SHAPE_LABELS[shape] }))}
              onCommit={(value) =>
                patch({ shape: value === "RECT" ? undefined : (value as Shape) }, `Shape ${SHAPE_LABELS[value as Shape]}`)
              }
            />
            <SelectInput
              label="Line style"
              value={sharedValue(elements, (element) => element.style?.lineStyle ?? "SOLID")}
              options={LINE_STYLE_OPTIONS}
              onCommit={(value) =>
                patchEach(
                  (element) => ({
                    style: { ...(element.style ?? {}), lineStyle: value === "SOLID" ? undefined : (value as LineStyle) },
                  }),
                  "Set line style",
                )
              }
            />
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
              label: BARCODE_LABELS[symbology],
            }))}
            onCommit={(value) => patch({ symbology: value }, "Set symbology")}
          />
          {elements.some((element) => element.kind === "BARCODE" && TWO_D_SYMBOLOGIES.has(element.symbology)) ? (
            <p className={styles.listRowMeta}>
              A 2D code sizes itself from its data and has no digits under it; it is fitted into the box.
            </p>
          ) : null}
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

    case "CROSSTAB": {
      // A crosstab has more properties than every other element put together,
      // so they are grouped by the question they answer: what to pivot, how the
      // columns behave, and how it looks. The alternative — one flat list of
      // twenty rows — is where a user goes to lose the one setting they wanted.
      const read = <T,>(pick: (element: Extract<ReportElement, { kind: "CROSSTAB" }>) => T) =>
        sharedValue(elements, (element) =>
          element.kind === "CROSSTAB" ? pick(element) : (undefined as T),
        );

      const expressionRow = (
        label: string,
        key: "rowBy" | "columnBy" | "measure" | "corner",
        placeholder: string,
      ) => {
        const shared = read((element) => element[key]);
        const value = isMixed(shared) ? "" : (shared ?? "");
        return (
          <ExpressionRow
            label={label}
            value={value}
            placeholder={placeholder}
            onChange={(next) => patch({ [key]: next }, `Edit ${label}`, `${key}-${bandIndex}`)}
            onOpen={() =>
              onEditExpression({
                title: `${label} expression`,
                value,
                onCommit: (next) => patch({ [key]: next }, `Edit ${label}`),
              })
            }
          />
        );
      };

      // The three axis LISTS are edited one element at a time. Level 1 of each
      // is `rowBy`/`columnBy`/`measure` and stays multi-selectable like every
      // other property; the extra levels are per-element arrays, and writing
      // one list over a selection whose crosstabs have different levels would
      // silently discard the others' work.
      const single =
        elements.length === 1 && elements[0].kind === "CROSSTAB" ? elements[0] : null;

      /** One removable extra level of the row or column axis. */
      const axisLevelRows = (
        key: "extraRowBys" | "extraColumnBys",
        levels: readonly CrosstabAxis[],
        /** Rows print their level in a column of its own, so it needs a caption. */
        captioned: boolean,
      ) =>
        levels.map((axis, index) => {
          const write = (next: Partial<CrosstabAxis>, label: string, coalesce?: string) =>
            patch(
              {
                [key]: levels.map((entry, at) => (at === index ? { ...entry, ...next } : entry)),
              },
              label,
              coalesce,
            );
          return (
            <div key={`${key}-${index}`} className={styles.axisLevel}>
              <div className={styles.axisLevelHead}>
                <span className={styles.listRowMeta}>Level {index + 2}</span>
                <button
                  type="button"
                  className={styles.toolButton}
                  title="Remove this level"
                  onClick={() =>
                    patch(
                      { [key]: levels.filter((_, at) => at !== index) },
                      "Remove crosstab level",
                    )
                  }
                >
                  ✕
                </button>
              </div>
              <ExpressionRow
                label="Expression"
                value={axis.expression}
                placeholder="{{ row.itemName }}"
                onChange={(next) =>
                  write({ expression: next }, "Edit crosstab level", `${key}-${index}-${bandIndex}`)
                }
                onOpen={() =>
                  onEditExpression({
                    title: `Level ${index + 2} expression`,
                    value: axis.expression,
                    onCommit: (next) => write({ expression: next }, "Edit crosstab level"),
                  })
                }
              />
              {captioned ? (
                <FieldGrid>
                  <TextInput
                    label="Heading"
                    value={axis.label}
                    onCommit={(value) => write({ label: value }, "Set level heading")}
                  />
                  <NumberInput
                    label="Width"
                    suffix="mm"
                    min={0}
                    value={axis.widthMm}
                    onCommit={(value) => write({ widthMm: value }, "Set level width")}
                  />
                </FieldGrid>
              ) : null}
            </div>
          );
        });

      /** The settings every measure has, whether it is the first or an extra. */
      const measureSettings = (
        measure: { label: string; fn: AggregateFunction; format: string; blankWhenZero: boolean },
        write: (next: Partial<CrosstabMeasure>, label: string) => void,
      ) => (
        <>
          <FieldGrid>
            <TextInput
              label="Caption"
              value={measure.label}
              placeholder="Amount"
              onCommit={(value) => write({ label: value }, "Set measure caption")}
            />
            <SelectInput
              label="Aggregate"
              value={measure.fn}
              options={AGGREGATE_FUNCTIONS.map((fn) => ({
                value: fn,
                label: fn === "avg" ? "Average" : fn[0].toUpperCase() + fn.slice(1),
              }))}
              onCommit={(value) => write({ fn: value }, "Set measure aggregate")}
            />
          </FieldGrid>
          <FieldGrid>
            <TextInput
              label="Format"
              mono
              value={measure.format}
              placeholder="#,##0.00"
              onCommit={(value) => write({ format: value }, "Set measure format")}
            />
            <CheckboxInput
              label="Blank a zero"
              value={measure.blankWhenZero}
              onCommit={(value) => write({ blankWhenZero: value }, "Set blank when zero")}
            />
          </FieldGrid>
        </>
      );

      const addButton = (label: string, onClick: () => void) => (
        <button type="button" className={styles.axisAdd} onClick={onClick}>
          + {label}
        </button>
      );

      return (
        <>
          <Section title="Crosstab">
            <SelectInput
              label="Dataset"
              wide
              value={read((element) => element.dataset)}
              options={[
                { value: "", label: datasets.length ? "Choose a dataset…" : "No datasets defined" },
                ...datasets
                  .filter((dataset) => dataset.cardinality === "many")
                  .map((dataset) => ({ value: dataset.name, label: dataset.name })),
              ]}
              onCommit={(value) => patch({ dataset: value }, "Set crosstab dataset")}
            />
            {expressionRow("Rows", "rowBy", "{{ row.itemName }}")}
            {single ? (
              <>
                {axisLevelRows("extraRowBys", single.extraRowBys ?? [], true)}
                {addButton("Add a row level", () =>
                  patch(
                    {
                      extraRowBys: [
                        ...(single.extraRowBys ?? []),
                        { expression: "", label: "", widthMm: 0 },
                      ],
                    },
                    "Add crosstab row level",
                  ),
                )}
              </>
            ) : null}

            {expressionRow("Columns", "columnBy", "{{ date(row.billDate, 'MMM') }}")}
            {single ? (
              <>
                {axisLevelRows("extraColumnBys", single.extraColumnBys ?? [], false)}
                {addButton("Add a column level", () =>
                  patch(
                    {
                      extraColumnBys: [
                        ...(single.extraColumnBys ?? []),
                        { expression: "", label: "", widthMm: 0 },
                      ],
                    },
                    "Add crosstab column level",
                  ),
                )}
              </>
            ) : null}

            {expressionRow("Measure", "measure", "{{ row.netAmount }}")}
            {single
              ? measureSettings(
                  {
                    label: single.measureLabel ?? "",
                    fn: single.fn,
                    format: single.format,
                    blankWhenZero: single.blankWhenZero,
                  },
                  // The first measure's settings live on the element itself, so
                  // that a template written before multiple measures existed
                  // still parses. The list editor hides that seam.
                  (next, label) =>
                    patch(
                      {
                        ...(next.label === undefined ? {} : { measureLabel: next.label }),
                        ...(next.fn === undefined ? {} : { fn: next.fn }),
                        ...(next.format === undefined ? {} : { format: next.format }),
                        ...(next.blankWhenZero === undefined
                          ? {}
                          : { blankWhenZero: next.blankWhenZero }),
                      },
                      label,
                    ),
                )
              : (
                  <SelectInput
                    label="Aggregate"
                    value={read((element) => element.fn)}
                    options={AGGREGATE_FUNCTIONS.map((fn) => ({
                      value: fn,
                      label: fn === "avg" ? "Average" : fn[0].toUpperCase() + fn.slice(1),
                    }))}
                    onCommit={(value) => patch({ fn: value }, "Set crosstab aggregate")}
                  />
                )}
            {single
              ? (single.extraMeasures ?? []).map((measure, index) => {
                  const write = (next: Partial<CrosstabMeasure>, label: string, coalesce?: string) =>
                    patch(
                      {
                        extraMeasures: (single.extraMeasures ?? []).map((entry, at) =>
                          at === index ? { ...entry, ...next } : entry,
                        ),
                      },
                      label,
                      coalesce,
                    );
                  return (
                    <div key={`measure-${index}`} className={styles.axisLevel}>
                      <div className={styles.axisLevelHead}>
                        <span className={styles.listRowMeta}>Measure {index + 2}</span>
                        <button
                          type="button"
                          className={styles.toolButton}
                          title="Remove this measure"
                          onClick={() =>
                            patch(
                              {
                                extraMeasures: (single.extraMeasures ?? []).filter(
                                  (_, at) => at !== index,
                                ),
                              },
                              "Remove crosstab measure",
                            )
                          }
                        >
                          ✕
                        </button>
                      </div>
                      <ExpressionRow
                        label="Expression"
                        value={measure.expression}
                        placeholder="{{ row.qty }}"
                        onChange={(next) =>
                          write(
                            { expression: next },
                            "Edit crosstab measure",
                            `measure-${index}-${bandIndex}`,
                          )
                        }
                        onOpen={() =>
                          onEditExpression({
                            title: `Measure ${index + 2} expression`,
                            value: measure.expression,
                            onCommit: (next) => write({ expression: next }, "Edit crosstab measure"),
                          })
                        }
                      />
                      {measureSettings(measure, (next, label) => write(next, label))}
                    </div>
                  );
                })
              : null}
            {single
              ? addButton("Add a measure", () =>
                  patch(
                    {
                      extraMeasures: [
                        ...(single.extraMeasures ?? []),
                        {
                          expression: "",
                          label: "",
                          fn: "sum" as AggregateFunction,
                          format: single.format,
                          blankWhenZero: single.blankWhenZero,
                        },
                      ],
                    },
                    "Add crosstab measure",
                  ),
                )
              : null}
            <p className={styles.listRowMeta}>
              Every row of the dataset is read once: <code>Rows</code> and <code>Columns</code>{" "}
              give the labels, <code>Measure</code> the number the cell accumulates. Extra row
              levels print as further label columns, extra column levels as further header rows,
              and every measure repeats under each column group.
            </p>
          </Section>

          <Section title="Columns and rows">
            <FieldGrid>
              <SelectInput
                label="Column order"
                value={read((element) => element.columnSort)}
                options={CROSSTAB_SORTS.map((sort) => ({
                  value: sort as CrosstabSort,
                  label: CROSSTAB_SORT_LABELS[sort],
                }))}
                onCommit={(value) => patch({ columnSort: value }, "Set column order")}
              />
              <SelectInput
                label="Row order"
                value={read((element) => element.rowSort)}
                options={CROSSTAB_SORTS.map((sort) => ({
                  value: sort as CrosstabSort,
                  label: CROSSTAB_SORT_LABELS[sort],
                }))}
                onCommit={(value) => patch({ rowSort: value }, "Set row order")}
              />
              <NumberInput
                label="Max columns"
                min={1}
                step={1}
                value={read((element) => element.maxColumns)}
                onCommit={(value) => patch({ maxColumns: Math.round(value) }, "Set max columns")}
              />
              <SelectInput
                label="Columns past that"
                value={read((element) => element.overflow)}
                options={CROSSTAB_OVERFLOWS.map((overflow) => ({
                  value: overflow as CrosstabOverflow,
                  label: CROSSTAB_OVERFLOW_LABELS[overflow],
                }))}
                onCommit={(value) => patch({ overflow: value }, "Set column overflow")}
              />
            </FieldGrid>
            <TextInput
              label="Folded label"
              value={read((element) => element.overflowLabel)}
              placeholder="Other"
              disabled={read((element) => element.overflow) === "CLIP"}
              onCommit={(value) => patch({ overflowLabel: value }, "Set folded label")}
            />
            <FieldGrid>
              <NumberInput
                label="Row labels"
                suffix="mm"
                min={0}
                value={read((element) => element.rowHeaderWidthMm)}
                onCommit={(value) => patch({ rowHeaderWidthMm: value }, "Set row label width")}
              />
              <NumberInput
                label="Column width"
                suffix="mm"
                min={0}
                value={read((element) => element.columnWidthMm)}
                onCommit={(value) => patch({ columnWidthMm: value }, "Set column width")}
              />
              <NumberInput
                label="Header height"
                suffix="mm"
                min={0}
                value={read((element) => element.headerHeightMm)}
                onCommit={(value) => patch({ headerHeightMm: value }, "Set header height")}
              />
              <NumberInput
                label="Row height"
                suffix="mm"
                min={1}
                value={read((element) => element.rowHeightMm)}
                onCommit={(value) => patch({ rowHeightMm: value }, "Set row height")}
              />
            </FieldGrid>
            <p className={styles.listRowMeta}>
              Column width 0 shares the element’s width between the columns, so they always
              fit. A fixed width drops the columns that would run past it.
            </p>
          </Section>

          <Section title="Totals and appearance">
            <CheckboxInput
              label="Total each row"
              value={read((element) => element.showRowTotals)}
              onCommit={(value) => patch({ showRowTotals: value }, "Set row totals")}
            />
            <CheckboxInput
              label="Total each column"
              value={read((element) => element.showColumnTotals)}
              onCommit={(value) => patch({ showColumnTotals: value }, "Set column totals")}
            />
            <FieldGrid>
              <TextInput
                label="Totals label"
                value={read((element) => element.totalsLabel)}
                placeholder="Total"
                onCommit={(value) => patch({ totalsLabel: value }, "Set totals label")}
              />
            </FieldGrid>
            {expressionRow("Corner caption", "corner", "Branch")}
            <CheckboxInput
              label="Draw grid lines"
              value={read((element) => element.gridLines)}
              onCommit={(value) => patch({ gridLines: value }, "Set grid lines")}
            />
            <CheckboxInput
              label="Repeat the header on each page"
              value={read((element) => element.repeatHeader)}
              onCommit={(value) => patch({ repeatHeader: value }, "Set repeat header")}
            />
            <ColorInput
              label="Header fill"
              value={read((element) => element.headerFill)}
              onCommit={(value) => patch({ headerFill: value || undefined }, "Set header fill")}
            />
            <ColorInput
              label="Totals fill"
              value={read((element) => element.totalsFill)}
              onCommit={(value) => patch({ totalsFill: value || undefined }, "Set totals fill")}
            />
            <CheckboxInput
              label="Subtotal each group"
              value={read((element) => element.showSubtotals === true)}
              onCommit={(value) => patch({ showSubtotals: value }, value ? "Show subtotals" : "Hide subtotals")}
            />
            {read((element) => element.showSubtotals === true) === true ? (
              <TextInput
                label="Subtotal label"
                value={read((element) => element.subtotalLabel ?? "Subtotal")}
                placeholder="Subtotal"
                onCommit={(value) => patch({ subtotalLabel: value || "Subtotal" }, "Set subtotal label")}
              />
            ) : null}
            {read((element) => element.showSubtotals === true) === true &&
            (single?.extraRowBys ?? []).length === 0 ? (
              <p className={styles.listRowMeta}>
                Subtotals need a second row level — add one above; with a single level every row is
                already its own total.
              </p>
            ) : null}
            <FieldGrid>
              <NumberInput
                label="Font size"
                suffix="pt"
                min={4}
                step={0.5}
                value={read((element) => element.font?.size ?? 9)}
                onCommit={(value) =>
                  patchEach(
                    (element) =>
                      element.kind === "CROSSTAB"
                        ? { font: { ...element.font, size: value } }
                        : {},
                    "Set crosstab font size",
                  )
                }
              />
              <CheckboxInput
                label="Bold header"
                value={read((element) => element.headerFont?.bold ?? true)}
                onCommit={(value) =>
                  patchEach(
                    (element) =>
                      element.kind === "CROSSTAB"
                        ? { headerFont: { ...element.headerFont, bold: value } }
                        : {},
                    "Set crosstab header weight",
                  )
                }
              />
            </FieldGrid>
            <p className={styles.listRowMeta}>
              The height on the Position tab is a minimum — the band grows to whatever the
              row count needs, and a table taller than the page continues on the next one.
            </p>
          </Section>
        </>
      );
    }

    case "CHART": {
      const read = <T,>(pick: (element: ChartElement) => T) =>
        sharedValue(elements, (element) => (element.kind === "CHART" ? pick(element) : (undefined as T)));
      const single = elements.length === 1 && elements[0].kind === "CHART" ? elements[0] : null;
      const isPie = read((element) => element.chartType) === "PIE";
      const textOf = (shared: ReturnType<typeof read<string>>) => (isMixed(shared) ? "" : (shared ?? ""));
      const category = textOf(read((element) => element.category));
      const setSeries = (series: ChartSeries[], label: string) => patch({ series }, label);
      const fontSize = (key: "font" | "titleFont" | "legendFont", fallback: number) =>
        read((element) => element[key]?.size ?? fallback);
      const setFontSize = (key: "font" | "titleFont" | "legendFont", value: number, label: string) =>
        patchEach(
          (element) => (element.kind === "CHART" ? { [key]: { ...element[key], size: value } } : {}),
          label,
        );

      return (
        <Section title="Chart">
          <SelectInput
            label="Dataset"
            wide
            value={read((element) => element.dataset)}
            options={[
              { value: "", label: datasets.length ? "Choose a dataset…" : "No datasets defined" },
              ...datasets
                .filter((dataset) => dataset.cardinality === "many")
                .map((dataset) => ({ value: dataset.name, label: dataset.name })),
            ]}
            onCommit={(value) => patch({ dataset: value }, "Set chart dataset")}
          />
          <FieldGrid>
            <SelectInput
              label="Type"
              value={read((element) => element.chartType)}
              options={CHART_TYPES.map((type) => ({ value: type, label: CHART_TYPE_LABELS[type] }))}
              onCommit={(value) => patch({ chartType: value as ChartType }, "Set chart type")}
            />
            <SelectInput
              label="Combine rows by"
              value={read((element) => element.fn)}
              options={AGGREGATE_FUNCTIONS.map((fn) => ({ value: fn, label: fn }))}
              onCommit={(value) => patch({ fn: value as AggregateFunction }, "Set chart aggregate")}
            />
          </FieldGrid>
          <ExpressionRow
            label={isPie ? "Slice label" : "Category (x axis)"}
            value={category}
            placeholder="{{ row.month }}"
            onChange={(next) => patch({ category: next }, "Edit chart category", `chart-category-${bandIndex}`)}
            onOpen={() =>
              onEditExpression({
                title: "Chart category expression",
                value: category,
                onCommit: (next) => patch({ category: next }, "Edit chart category"),
              })
            }
          />

          {single ? (
            <>
              {single.series.map((series, index) => (
                <div key={`series-${index}`} className={styles.axisLevel}>
                  <div className={styles.axisLevelHead}>
                    <span className={styles.listRowMeta}>
                      {isPie && index > 0 ? `Series ${index + 1} (a pie plots only the first)` : `Series ${index + 1}`}
                    </span>
                    {single.series.length > 1 ? (
                      <button
                        type="button"
                        className={styles.toolButton}
                        title="Remove this series"
                        onClick={() =>
                          setSeries(single.series.filter((_s, position) => position !== index), "Remove series")
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <FieldGrid>
                    <TextInput
                      label="Name"
                      value={series.name}
                      placeholder={`Series ${index + 1}`}
                      onCommit={(name) =>
                        setSeries(
                          single.series.map((entry, position) => (position === index ? { ...entry, name } : entry)),
                          "Rename series",
                        )
                      }
                    />
                    <ColorInput
                      label="Colour"
                      value={series.color ?? CHART_PALETTE[index % CHART_PALETTE.length]}
                      onCommit={(color) =>
                        setSeries(
                          single.series.map((entry, position) =>
                            position === index ? { ...entry, color: color || undefined } : entry,
                          ),
                          "Set series colour",
                        )
                      }
                    />
                  </FieldGrid>
                  <ExpressionRow
                    label="Value"
                    value={series.value}
                    placeholder="{{ row.amount }}"
                    onChange={(value) =>
                      patch(
                        {
                          series: single.series.map((entry, position) =>
                            position === index ? { ...entry, value } : entry,
                          ),
                        },
                        "Edit series value",
                        `chart-series-${bandIndex}-${index}`,
                      )
                    }
                    onOpen={() =>
                      onEditExpression({
                        title: `Series ${index + 1} value`,
                        value: series.value,
                        onCommit: (value) =>
                          setSeries(
                            single.series.map((entry, position) =>
                              position === index ? { ...entry, value } : entry,
                            ),
                            "Edit series value",
                          ),
                      })
                    }
                  />
                </div>
              ))}
              {single.series.length < 8 ? (
                <button
                  type="button"
                  className={styles.axisAdd}
                  onClick={() =>
                    setSeries([...single.series, { name: "", value: "{{ row.amount }}" }], "Add series")
                  }
                >
                  + Add a series
                </button>
              ) : null}
            </>
          ) : (
            <p className={styles.listRowMeta}>Select one chart to edit its series.</p>
          )}

          <TextInput
            label="Title"
            wide
            value={read((element) => element.title)}
            placeholder="Sales by month"
            onCommit={(value) => patch({ title: value }, "Set chart title")}
          />
          <FieldGrid>
            <CheckboxInput
              label="Legend"
              value={read((element) => element.showLegend)}
              onCommit={(value) => patch({ showLegend: value }, "Set legend")}
            />
            <SelectInput
              label="Legend at"
              value={read((element) => element.legendPosition)}
              options={LEGEND_POSITIONS.map((position) => ({
                value: position,
                label: position.charAt(0) + position.slice(1).toLowerCase(),
              }))}
              onCommit={(value) => patch({ legendPosition: value as LegendPosition }, "Set legend position")}
            />
            <CheckboxInput
              label="Show values"
              value={read((element) => element.showValues)}
              onCommit={(value) => patch({ showValues: value }, "Set value labels")}
            />
            {isPie ? (
              <>
                <CheckboxInput
                  label="Show percentages"
                  value={read((element) => element.showPercent)}
                  onCommit={(value) => patch({ showPercent: value }, "Set percentages")}
                />
                <NumberInput
                  label="Hole size"
                  suffix="%"
                  step={5}
                  min={0}
                  max={90}
                  value={read((element) => element.holeSizePct)}
                  onCommit={(value) => patch({ holeSizePct: value }, "Set hole size")}
                />
              </>
            ) : (
              <CheckboxInput
                label="Grid lines"
                value={read((element) => element.showGrid)}
                onCommit={(value) => patch({ showGrid: value }, "Set chart grid")}
              />
            )}
            <NumberInput
              label="Max categories"
              step={1}
              min={1}
              max={100}
              value={read((element) => element.maxCategories)}
              onCommit={(value) => patch({ maxCategories: Math.round(value) }, "Set max categories")}
            />
            <TextInput
              label="Number format"
              mono
              value={read((element) => element.format)}
              placeholder="#,##0"
              onCommit={(value) => patch({ format: value || "#,##0" }, "Set chart number format")}
            />
            <NumberInput
              label="Label size"
              suffix="pt"
              step={0.5}
              min={4}
              value={fontSize("font", 7)}
              onCommit={(value) => setFontSize("font", value, "Set chart label size")}
            />
            <NumberInput
              label="Title size"
              suffix="pt"
              step={0.5}
              min={4}
              value={fontSize("titleFont", 10)}
              onCommit={(value) => setFontSize("titleFont", value, "Set chart title size")}
            />
            <NumberInput
              label="Legend size"
              suffix="pt"
              step={0.5}
              min={4}
              value={fontSize("legendFont", 7)}
              onCommit={(value) => setFontSize("legendFont", value, "Set chart legend size")}
            />
            <ColorInput
              label="Background"
              value={read((element) => element.background)}
              onCommit={(value) => patch({ background: value || undefined }, "Set chart background")}
            />
            <ColorInput
              label="Title colour"
              value={read((element) => element.titleColor)}
              onCommit={(value) => patch({ titleColor: value || undefined }, "Set chart title colour")}
            />
            <ColorInput
              label="Legend colour"
              value={read((element) => element.legendColor)}
              onCommit={(value) => patch({ legendColor: value || undefined }, "Set chart legend colour")}
            />
          </FieldGrid>
          <p className={styles.listRowMeta}>
            The canvas sketches the chart with sample values. Rows sharing a category are combined;
            Preview draws it from the real data.
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
