/**
 * Inline markup for text elements with `markup` on (QtRPT's "HTML rendering").
 *
 * A port of the server's `engine/layout/markup.ts` parser, kept line-for-line
 * equivalent so the canvas styles exactly the runs the PDF will. Tags come from
 * the TEMPLATE only: `{{ ... }}` spans are copied through untouched, so data is
 * never read as markup. Parse first, then substitute sample values per segment.
 */

export type MarkupStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
  color?: string;
  sizePt?: number;
  shift?: "sup" | "sub";
};

/** A run of template text in one style. `\n` inside it is a hard break. */
export type MarkupSegment = {
  template: string;
  style: MarkupStyle;
};

/** Super/subscript size relative to the surrounding text, as the server's. */
export const SHIFT_SCALE = 0.7;

/** The tags the toolbar's rich-text buttons insert, and what they mean. */
export const MARKUP_TAGS = [
  { tag: "b", label: "B", title: "Bold" },
  { tag: "i", label: "I", title: "Italic" },
  { tag: "u", label: "U", title: "Underline" },
  { tag: "s", label: "S", title: "Strikeout" },
  { tag: "sup", label: "x²", title: "Superscript" },
  { tag: "sub", label: "x₂", title: "Subscript" },
] as const;

const NAMED_COLOURS: Readonly<Record<string, string>> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  maroon: "#800000",
  navy: "#000080",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  teal: "#008080",
  olive: "#808000",
  brown: "#a52a2a",
};

const FONT_SIZE_STEPS = [8, 10, 12, 14, 18, 24, 36];

function parseColour(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return NAMED_COLOURS[value];
}

function parseSize(raw: string | undefined, htmlSteps: boolean): number | undefined {
  if (!raw) {
    return undefined;
  }
  const match = /^(\d+(?:\.\d+)?)\s*(pt|px)?$/.exec(raw.trim().toLowerCase());
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  if (htmlSteps && !match[2]) {
    return FONT_SIZE_STEPS[Math.min(7, Math.max(1, Math.round(amount))) - 1];
  }
  const points = match[2] === "px" ? amount * 0.75 : amount;
  return Math.min(200, Math.max(1, points));
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(
    attributes,
  );
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function styleFromCss(css: string): MarkupStyle {
  const style: MarkupStyle = {};
  for (const declaration of css.split(";")) {
    const [property, ...rest] = declaration.split(":");
    const value = rest.join(":").trim().toLowerCase();
    switch (property?.trim().toLowerCase()) {
      case "color":
        style.color = parseColour(value);
        break;
      case "font-size":
        style.sizePt = parseSize(value, false);
        break;
      case "font-weight":
        style.bold = value === "bold" || value === "bolder" || Number(value) >= 600;
        break;
      case "font-style":
        style.italic = value === "italic" || value === "oblique";
        break;
      case "text-decoration":
      case "text-decoration-line":
        if (value.includes("underline")) {
          style.underline = true;
        }
        if (value.includes("line-through")) {
          style.strikeout = true;
        }
        break;
      default:
        break;
    }
  }
  return style;
}

const ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const TAG = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*?)(\/?)\s*>/;

const sameStyle = (left: MarkupStyle, right: MarkupStyle): boolean =>
  left.bold === right.bold &&
  left.italic === right.italic &&
  left.underline === right.underline &&
  left.strikeout === right.strikeout &&
  left.color === right.color &&
  left.sizePt === right.sizePt &&
  left.shift === right.shift;

export function parseMarkup(template: string): MarkupSegment[] {
  const segments: MarkupSegment[] = [];
  const stack: { tag: string; style: MarkupStyle }[] = [];
  let current: MarkupStyle = {};
  let buffer = "";
  let literal = "";

  const flushLiteral = () => {
    if (literal) {
      buffer += decodeEntities(literal);
      literal = "";
    }
  };
  const flush = () => {
    flushLiteral();
    if (!buffer) {
      return;
    }
    const last = segments[segments.length - 1];
    if (last && sameStyle(last.style, current)) {
      last.template += buffer;
    } else {
      segments.push({ template: buffer, style: current });
    }
    buffer = "";
  };
  const lineBreak = () => {
    flushLiteral();
    buffer += "\n";
  };
  const push = (tag: string, change: MarkupStyle) => {
    flush();
    stack.push({ tag, style: current });
    current = {
      ...current,
      ...Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)),
    };
  };
  const pop = (tag: string) => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index].tag === tag) {
        flush();
        current = stack[index].style;
        stack.length = index;
        return;
      }
    }
  };

  let index = 0;
  while (index < template.length) {
    if (template.startsWith("{{", index)) {
      const close = template.indexOf("}}", index + 2);
      const end = close === -1 ? template.length : close + 2;
      flushLiteral();
      buffer += template.slice(index, end);
      index = end;
      continue;
    }

    if (template[index] === "<") {
      const match = TAG.exec(template.slice(index));
      if (match) {
        const closing = match[1] === "/";
        const name = match[2].toLowerCase();
        const attributes = match[3] ?? "";
        const selfClosing = match[4] === "/";
        index += match[0].length;

        const toggle = (tag: string, change: () => MarkupStyle): void => {
          if (closing) {
            pop(tag);
          } else if (!selfClosing) {
            push(tag, change());
          }
        };

        switch (name) {
          case "br":
            lineBreak();
            break;
          case "p":
          case "div":
            if (closing) {
              lineBreak();
            }
            break;
          case "b":
          case "strong":
            toggle("b", () => ({ bold: true }));
            break;
          case "i":
          case "em":
            toggle("i", () => ({ italic: true }));
            break;
          case "u":
            toggle("u", () => ({ underline: true }));
            break;
          case "s":
          case "strike":
          case "del":
            toggle("s", () => ({ strikeout: true }));
            break;
          case "sup":
          case "sub":
            toggle(name, () => ({ shift: name }));
            break;
          case "font":
            toggle("font", () => ({
              color: parseColour(attribute(attributes, "color")),
              sizePt: parseSize(attribute(attributes, "size"), true),
            }));
            break;
          case "span":
            toggle("span", () => styleFromCss(attribute(attributes, "style") ?? ""));
            break;
          default:
            break;
        }
        continue;
      }
    }

    literal += template[index];
    index += 1;
  }

  flush();
  return segments;
}

/**
 * Wrap the selected part of `value` in a tag, or insert an empty pair at the
 * caret. What the rich-text buttons do to the value box.
 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  tag: string,
): { value: string; caret: number } {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const next = value.slice(0, start) + open + value.slice(start, end) + close + value.slice(end);
  return { value: next, caret: end + open.length + (start === end ? 0 : close.length) };
}
