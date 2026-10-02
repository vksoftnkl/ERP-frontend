import { describe, expect, it } from "vitest";
import {
  looselyMatches,
  matchesSearchTokens,
  normalizeSearchText,
  searchTokens,
} from "./search-text";

describe("search-text", () => {
  it("normalises like the server: lower-case, no spaces or punctuation", () => {
    expect(normalizeSearchText("Chilli  Powder - 200 g, SM-SAUCE_00012")).toBe(
      "chillipowder200gsmsauce00012",
    );
    expect(normalizeSearchText("மிளகாய் தூள்")).toBe("மிளகாய்தூள்");
    expect(normalizeSearchText(undefined)).toBe("");
  });

  it("splits the query into distinct normalised words, dropping punctuation-only ones", () => {
    expect(searchTokens("  Chilli - powder CHILLI ")).toEqual(["chilli", "powder"]);
    expect(searchTokens(" - ")).toEqual([]);
    expect(searchTokens(undefined)).toEqual([]);
  });

  it("finds a spaced name typed without the space, in either word order", () => {
    expect(looselyMatches("chillipowder", "Chilli Powder")).toBe(true);
    expect(looselyMatches("powder chilli", "Chilli Powder")).toBe(true);
    expect(looselyMatches("sm-sauce", "SM SAUCE 00012")).toBe(true);
  });

  it("requires every typed word, across any of the candidates", () => {
    expect(looselyMatches("chilli sauce", "Chilli Powder")).toBe(false);
    expect(looselyMatches("chilli SMSAUCE", "Chilli Sauce", "SM-SAUCE-00012")).toBe(true);
  });

  it("matches everything when nothing is typed", () => {
    expect(matchesSearchTokens([], "anything")).toBe(true);
    expect(looselyMatches("   ", "anything")).toBe(true);
  });
});
