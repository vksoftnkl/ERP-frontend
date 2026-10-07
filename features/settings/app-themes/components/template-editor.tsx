"use client";

import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

import {
  cursorPosition,
  findNext as findNextOffset,
  highlightSegments,
  lineRange,
  type HighlightSegment,
} from "../lib/template";
import styles from "../page.module.scss";

export type TemplateEditorHandle = {
  focus: () => void;
  /** Types `snippet` at the cursor, as if the operator had (undo keeps it). */
  insertAtCursor: (snippet: string) => void;
  /** Selects the whole line and scrolls it to the middle. */
  goToLine: (line: number) => void;
  /** Marks the next match after the cursor, wrapping once; false = none. */
  findNext: (needle: string) => boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  onCursorChange: (position: { line: number; column: number }) => void;
  ref?: Ref<TemplateEditorHandle>;
};

const SEGMENT_CLASS: Record<HighlightSegment["kind"], string | undefined> = {
  plain: undefined,
  comment: styles.hlComment,
  known: styles.hlKnown,
  unknown: styles.hlUnknown,
};

function renderSegments(text: string, keyPrefix: string): ReactNode[] {
  return highlightSegments(text).map((segment, index) =>
    segment.kind === "plain" ? (
      segment.text
    ) : (
      <span key={`${keyPrefix}${index}`} className={SEGMENT_CLASS[segment.kind]}>
        {segment.text}
      </span>
    ),
  );
}

/**
 * The QSS editor: monospace, no wrap, line numbers, and `{{key}}`
 * placeholders tinted — a known key blue, an unknown one red and underlined,
 * comments muted. The text sits in a transparent `<textarea>` over a
 * highlighted copy, so editing, selection and undo stay the browser's own.
 *
 * `data-uppercase="off"`: the app-wide capitalization listener rewrites free
 * text as it is typed; QSS selectors and property names must reach the server
 * exactly as written.
 */
export default function TemplateEditor({ value, onChange, readOnly, onCursorChange, ref }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [currentLine, setCurrentLine] = useState(1);
  /** Find's match, painted in the highlight layer so focus can stay in the Find box. */
  const [match, setMatch] = useState<{ start: number; end: number } | null>(null);

  const lineCount = useMemo(() => {
    let count = 1;
    for (let index = value.indexOf("\n"); index >= 0; index = value.indexOf("\n", index + 1)) count += 1;
    return count;
  }, [value]);
  const gutterDigits = Math.max(3, String(lineCount).length);

  const highlighted = useMemo<ReactNode[]>(() => {
    if (!match || match.end > value.length) return renderSegments(value, "s");
    return [
      ...renderSegments(value.slice(0, match.start), "a"),
      <mark key="match" className={styles.hlMatch}>
        {value.slice(match.start, match.end)}
      </mark>,
      ...renderSegments(value.slice(match.end), "b"),
    ];
  }, [value, match]);

  const gutter = useMemo(
    () =>
      Array.from({ length: lineCount }, (_, index) => (
        <div key={index} className={index + 1 === currentLine ? styles.gutterCurrent : undefined}>
          {index + 1}
        </div>
      )),
    [lineCount, currentLine],
  );

  const syncScroll = useCallback(() => {
    const area = textareaRef.current;
    if (!area) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = area.scrollTop;
      highlightRef.current.scrollLeft = area.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = area.scrollTop;
  }, []);

  const reportCursor = useCallback(() => {
    const area = textareaRef.current;
    if (!area) return;
    const position = cursorPosition(area.value, area.selectionStart);
    setCurrentLine(position.line);
    onCursorChange(position);
  }, [onCursorChange]);

  const scrollToOffset = useCallback((offset: number) => {
    const area = textareaRef.current;
    if (!area) return;
    const { line } = cursorPosition(area.value, offset);
    const lineHeight = Number.parseFloat(getComputedStyle(area).lineHeight) || 18;
    area.scrollTop = Math.max(0, (line - 1) * lineHeight - area.clientHeight / 2);
    syncScroll();
  }, [syncScroll]);

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const area = textareaRef.current;
      if (!area || readOnly) return;
      area.focus();
      // execCommand keeps the edit on the browser's undo stack; the fallback
      // (a browser without it) loses only that.
      const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, snippet);
      if (!inserted) {
        const { selectionStart, selectionEnd } = area;
        const next = area.value.slice(0, selectionStart) + snippet + area.value.slice(selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
          area.setSelectionRange(selectionStart + snippet.length, selectionStart + snippet.length);
        });
      }
    },
    [onChange, readOnly],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      insertAtCursor,
      goToLine: (line: number) => {
        const area = textareaRef.current;
        const range = area ? lineRange(area.value, line) : null;
        if (!area || !range) return;
        setMatch(null);
        area.focus();
        area.setSelectionRange(range.start, range.end);
        scrollToOffset(range.start);
        reportCursor();
      },
      findNext: (needle: string) => {
        const area = textareaRef.current;
        if (!area || !needle) return false;
        const from = match ? match.end : area.selectionEnd;
        const at = findNextOffset(area.value, needle, from);
        if (at < 0) {
          setMatch(null);
          return false;
        }
        setMatch({ start: at, end: at + needle.length });
        area.setSelectionRange(at, at + needle.length);
        scrollToOffset(at);
        const position = cursorPosition(area.value, at);
        setCurrentLine(position.line);
        onCursorChange(position);
        return true;
      },
    }),
    [insertAtCursor, scrollToOffset, reportCursor, match, onCursorChange],
  );

  return (
    <div className={styles.editorFrame} data-uppercase="off">
      <div
        ref={gutterRef}
        className={styles.editorGutter}
        style={{ width: `calc(${gutterDigits}ch + 14px)` }}
        aria-hidden="true"
      >
        {gutter}
        {/* Room for the textarea's horizontal scrollbar. */}
        <div className={styles.gutterTail} />
      </div>
      <div className={styles.editorBody}>
        <pre ref={highlightRef} className={styles.editorHighlight} aria-hidden="true">
          {highlighted}
          {"\n"}
        </pre>
        <textarea
          ref={textareaRef}
          className={styles.editorText}
          value={value}
          readOnly={readOnly}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="Template"
          onChange={(event) => {
            setMatch(null);
            onChange(event.target.value);
          }}
          onScroll={syncScroll}
          onSelect={reportCursor}
          onFocus={() => setMatch(null)}
          onKeyDown={(event) => {
            if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
            if (readOnly) return;
            event.preventDefault();
            insertAtCursor("\t");
          }}
        />
      </div>
    </div>
  );
}
