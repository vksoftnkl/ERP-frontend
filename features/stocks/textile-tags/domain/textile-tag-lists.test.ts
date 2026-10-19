import { describe, expect, it } from "vitest";
import {
  emptyLists,
  idOf,
  ingestListRows,
  isLoaded,
  listRowId,
  namesOf,
  remember,
  seasonFor,
  seasonNamed,
  sizesOf,
} from "./textile-tag-lists";

describe("an unregistered list", () => {
  it("is not loaded, knows no name and seeds the sizes", () => {
    const lists = emptyLists();
    expect(isLoaded(lists, "colour")).toBe(false);
    expect(idOf(lists, "colour", "Maroon")).toBe("");
    expect(namesOf(lists, "size")).toContain("XL");
    expect(namesOf(lists, "size")).toContain("7-8Y");
    expect(sizesOf(lists, "alpha")).toEqual(["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]);
  });
});

describe("remember / idOf", () => {
  it("answers a remembered name whatever its case", () => {
    const lists = remember(emptyLists(), "colour", "c1", "Peacock blue");
    expect(idOf(lists, "colour", "PEACOCK BLUE")).toBe("c1");
    expect(namesOf(lists, "colour")).toEqual(["Peacock blue"]);
  });

  it("files a size under its set and answers a set-less size only when one set has it", () => {
    let lists = remember(emptyLists(), "size", "s-alpha-l", "L", "ALPHA");
    expect(idOf(lists, "size", "L", "ALPHA")).toBe("s-alpha-l");
    expect(idOf(lists, "size", "L")).toBe("s-alpha-l");
    lists = remember(lists, "size", "s-free-l", "L", "FREE");
    // Two sets have an "L": a typed size with no set is ambiguous.
    expect(idOf(lists, "size", "L")).toBe("");
    expect(sizesOf(lists, "ALPHA")).toEqual(["L"]);
  });
});

describe("ingestListRows", () => {
  it("reads snake_case dropdown rows and marks the kind loaded", () => {
    const lists = ingestListRows(emptyLists(), "fabric", [
      { ifb_id: "f1", ifb_name: "Pure silk" },
      { ifb_id: "", ifb_name: "no id" },
    ]);
    expect(isLoaded(lists, "fabric")).toBe(true);
    expect(idOf(lists, "fabric", "pure silk")).toBe("f1");
    expect(namesOf(lists, "fabric")).toEqual(["Pure silk"]);
  });

  it("keeps the seasons' dates for the default pick", () => {
    const lists = ingestListRows(emptyLists(), "season", [
      { isnId: "w26", isnName: "Winter 26", isnFromDate: "2026-10-01T00:00:00.000Z", isnToDate: "2027-01-31" },
      { isn_id: "d26", isn_name: "Diwali 26", isn_from_date: "2026-10-15", isn_to_date: "2026-11-05" },
    ]);
    expect(seasonFor(lists, "2026-10-19")?.id).toBe("w26");
    expect(seasonFor(lists, "2027-03-01")).toBeNull();
    expect(seasonNamed(lists, "diwali 26")?.id).toBe("d26");
  });
});

describe("listRowId", () => {
  it("takes the prefixed id under either spelling, else a bare id", () => {
    expect(listRowId({ isz_id: "a" }, "size")).toBe("a");
    expect(listRowId({ iszId: "b" }, "size")).toBe("b");
    expect(listRowId({ id: "c" }, "size")).toBe("c");
    expect(listRowId({}, "size")).toBe("");
  });
});
