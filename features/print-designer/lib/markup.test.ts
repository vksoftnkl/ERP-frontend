import { describe, expect, it } from "vitest";
import { decodeEntities, parseMarkup, wrapSelection } from "@/features/print-designer/lib/markup";

/**
 * The canvas styles text from this parser and the PDF from the server's; the
 * two must split a template into the same runs. These cases mirror the
 * server's qtrpt-parity spec.
 */
describe("parseMarkup", () => {
  it("splits on tags and keeps expressions whole", () => {
    expect(parseMarkup("Total <b>{{ row.name }}</b> &amp; tax")).toEqual([
      { template: "Total ", style: {} },
      { template: "{{ row.name }}", style: { bold: true } },
      { template: " & tax", style: {} },
    ]);
  });

  it("never reads a tag inside an expression", () => {
    expect(parseMarkup("{{ a < b ? '<b>' : '' }}")).toEqual([
      { template: "{{ a < b ? '<b>' : '' }}", style: {} },
    ]);
  });

  it("nests, closes back to the outer style, and reads font and span styles", () => {
    expect(
      parseMarkup('<font color="red" size="5">A<i>B</i></font><span style="font-weight:bold;text-decoration:line-through">C</span>x<sup>2</sup>'),
    ).toEqual([
      { template: "A", style: { color: "#ff0000", sizePt: 18 } },
      { template: "B", style: { color: "#ff0000", sizePt: 18, italic: true } },
      { template: "C", style: { bold: true, strikeout: true } },
      { template: "x", style: {} },
      { template: "2", style: { shift: "sup" } },
    ]);
  });

  it("turns <br> and a closing </p> into hard breaks and drops unknown tags", () => {
    expect(parseMarkup("<p>One</p>Two<br/>Three <blink>!</blink>")).toEqual([
      { template: "One\nTwo\nThree !", style: {} },
    ]);
  });

  it("leaves a lone < that is not a tag alone", () => {
    expect(parseMarkup("a < b")).toEqual([{ template: "a < b", style: {} }]);
  });
});

describe("decodeEntities and wrapSelection", () => {
  it("decodes named and numeric references", () => {
    expect(decodeEntities("&lt;b&gt; &#65;&#x42; &nbsp;&unknown;")).toBe("<b> AB  &unknown;");
  });

  it("wraps a selection, or drops a pair at the caret", () => {
    expect(wrapSelection("Hello world", 6, 11, "b")).toEqual({ value: "Hello <b>world</b>", caret: 18 });
    expect(wrapSelection("Hi", 2, 2, "i")).toEqual({ value: "Hi<i></i>", caret: 5 });
  });
});
