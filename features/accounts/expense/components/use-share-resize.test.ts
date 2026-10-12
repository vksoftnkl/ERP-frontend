import { describe, expect, it } from "vitest";
import { MIN_RESIZED_COLUMN_PX } from "@/features/sales/quotation/quotation.utils";
import { dragShare } from "./use-share-resize";

describe("dragShare — the last column gives up what the dragged one takes (Qt's stretched last section)", () => {
  it("moves the edge by exactly the delta, keeping the sum", () => {
    expect(dragShare(143, 110, 40)).toEqual({ width: 183, last: 70 });
    expect(dragShare(143, 110, -60)).toEqual({ width: 83, last: 170 });
  });

  it("stops when either column reaches the floor", () => {
    expect(dragShare(143, 110, 500)).toEqual({ width: 143 + 110 - MIN_RESIZED_COLUMN_PX, last: MIN_RESIZED_COLUMN_PX });
    expect(dragShare(143, 110, -500)).toEqual({ width: MIN_RESIZED_COLUMN_PX, last: 110 + 143 - MIN_RESIZED_COLUMN_PX });
  });
});
