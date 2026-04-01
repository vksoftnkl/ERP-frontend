import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  SEARCH_SELECT_OFFSET,
  SEARCH_SELECT_VIEWPORT_PADDING,
  type LinkedRecordCellElement,
  type LinkedRecordOption,
  type SearchSelectOverlayPosition,
} from "./item-linked-records-editor.shared";
type UseItemLinkedRecordsSearchSelectParams = {
  cellRefs: MutableRefObject<Map<string, LinkedRecordCellElement>>;
};
function removeStateEntry<TValue>(
  current: Record<string, TValue>,
  cellKey: string,
): Record<string, TValue> {
  if (!(cellKey in current)) {
    return current;
  }
  const nextState = { ...current };
  delete nextState[cellKey];
  return nextState;
}
function resolveOverlayPosition(trigger: HTMLElement): SearchSelectOverlayPosition {
  const triggerRect = trigger.getBoundingClientRect();
  const maxWidth = Math.max(
    0,
    window.innerWidth - SEARCH_SELECT_VIEWPORT_PADDING * 2,
  );
  const width = Math.min(triggerRect.width, maxWidth);
  const left = Math.min(
    Math.max(SEARCH_SELECT_VIEWPORT_PADDING, triggerRect.left),
    window.innerWidth - SEARCH_SELECT_VIEWPORT_PADDING - width,
  );
  const availableSpaceBelow =
    window.innerHeight -
    triggerRect.bottom -
    SEARCH_SELECT_VIEWPORT_PADDING -
    SEARCH_SELECT_OFFSET;
  const availableSpaceAbove =
    triggerRect.top - SEARCH_SELECT_VIEWPORT_PADDING - SEARCH_SELECT_OFFSET;
  const shouldOpenUpward =
    availableSpaceBelow < 220 && availableSpaceAbove > availableSpaceBelow;
  const overlayMaxHeight = Math.max(
    96,
    Math.floor(shouldOpenUpward ? availableSpaceAbove : availableSpaceBelow),
  );
  return {
    left,
    width,
    maxHeight: overlayMaxHeight,
    "--search-select-options-max-height": `${Math.max(
      48,
      overlayMaxHeight - 52,
    )}px`,
    ...(shouldOpenUpward
      ? {
          bottom: window.innerHeight - triggerRect.top + SEARCH_SELECT_OFFSET,
        }
      : {
          top: triggerRect.bottom + SEARCH_SELECT_OFFSET,
        }),
  };
}
function resolveInitialHighlightedIndex(
  options: LinkedRecordOption[],
  currentValue: string,
  preferredIndex?: number,
): number {
  if (preferredIndex !== undefined) {
    return preferredIndex;
  }
  const selectedIndex = options.findIndex(
    (option) => option.value === currentValue,
  );
  if (selectedIndex >= 0) {
    return selectedIndex;
  }
  return options.length > 0 ? 0 : -1;
}
export function useItemLinkedRecordsSearchSelect({
  cellRefs,
}: UseItemLinkedRecordsSearchSelectParams) {
  const searchInputRefs = useRef(new Map<string, HTMLInputElement>());
  const searchSelectListRef = useRef<HTMLDivElement | null>(null);
  const searchSelectRefs = useRef(new Map<string, HTMLDivElement>());
  const [openSearchCell, setOpenSearchCell] = useState<string | null>(null);
  const [searchSelectOverlayPosition, setSearchSelectOverlayPosition] =
    useState<SearchSelectOverlayPosition | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchActiveOptionIndex, setSearchActiveOptionIndex] = useState<
    Record<string, number>
  >({});

  const registerSearchInputRef =
    (cellKey: string) => (element: HTMLInputElement | null) => {
      if (element) {
        searchInputRefs.current.set(cellKey, element);
        return;
      }

      searchInputRefs.current.delete(cellKey);
    };

  const registerSearchSelectRef =
    (cellKey: string) => (element: HTMLDivElement | null) => {
      if (element) {
        searchSelectRefs.current.set(cellKey, element);
        return;
      }

      searchSelectRefs.current.delete(cellKey);
    };

  const clearSearchableSelectState = (cellKey: string) => {
    setSearchQueries((current) => removeStateEntry(current, cellKey));
    setSearchActiveOptionIndex((current) => removeStateEntry(current, cellKey));
  };

  const closeSearchableSelect = (cellKey: string) => {
    setOpenSearchCell((current) => (current === cellKey ? null : current));
    clearSearchableSelectState(cellKey);
  };

  const openSearchableSelect = (
    cellKey: string,
    options: LinkedRecordOption[],
    currentValue: string,
    preferredIndex?: number,
  ) => {
    setOpenSearchCell(cellKey);
    setSearchActiveOptionIndex((current) => ({
      ...current,
      [cellKey]: resolveInitialHighlightedIndex(
        options,
        currentValue,
        preferredIndex,
      ),
    }));
  };

  const handleSearchableSelectInput = (cellKey: string, query: string) => {
    setOpenSearchCell(cellKey);
    setSearchQueries((current) => ({
      ...current,
      [cellKey]: query,
    }));
    setSearchActiveOptionIndex((current) => ({
      ...current,
      [cellKey]: 0,
    }));
  };

  const setActiveOptionIndex = (cellKey: string, optionIndex: number) => {
    setSearchActiveOptionIndex((current) => ({
      ...current,
      [cellKey]: optionIndex,
    }));
  };

  useEffect(() => {
    if (!openSearchCell) {
      return;
    }

    const searchInput = searchInputRefs.current.get(openSearchCell);
    if (!searchInput) {
      return;
    }

    searchInput.focus();
    searchInput.select();
  }, [openSearchCell]);

  useEffect(() => {
    if (!openSearchCell) {
      setSearchSelectOverlayPosition(null);
      return;
    }

    const updateOverlayPosition = () => {
      const trigger = cellRefs.current.get(openSearchCell);

      if (!(trigger instanceof HTMLElement)) {
        setSearchSelectOverlayPosition(null);
        return;
      }

      setSearchSelectOverlayPosition(resolveOverlayPosition(trigger));
    };

    updateOverlayPosition();
    window.addEventListener("resize", updateOverlayPosition);
    window.addEventListener("scroll", updateOverlayPosition, true);

    return () => {
      window.removeEventListener("resize", updateOverlayPosition);
      window.removeEventListener("scroll", updateOverlayPosition, true);
    };
  }, [cellRefs, openSearchCell]);

  useEffect(() => {
    if (!openSearchCell) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const container = searchSelectRefs.current.get(openSearchCell);
      const overlay = searchSelectListRef.current;

      if (
        event.target instanceof Node &&
        ((container && container.contains(event.target)) ||
          (overlay && overlay.contains(event.target)))
      ) {
        return;
      }

      closeSearchableSelect(openSearchCell);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [openSearchCell]);

  return {
    closeSearchableSelect,
    handleSearchableSelectInput,
    openSearchCell,
    openSearchableSelect,
    registerSearchInputRef,
    registerSearchSelectRef,
    searchActiveOptionIndex,
    searchQueries,
    searchSelectListRef,
    searchSelectOverlayPosition,
    setActiveOptionIndex,
  };
}
