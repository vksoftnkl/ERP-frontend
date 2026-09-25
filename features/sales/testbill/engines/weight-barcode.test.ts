/**
 * Sale Bill Entry — weight / price labels (§9.2). Pure.
 */
import { describe, expect, it } from "vitest";
import { decodeWeightBarcode, parseWeightBarcodeConfig } from "@/features/sales/testbill/engines/weight-barcode";

const SETTING = JSON.stringify({ prefix: "2", itemLen: 5, valueLen: 5, valueKind: "WEIGHT", divisor: 1000 });

describe("parseWeightBarcodeConfig", () => {
  it("reads the catalogue's JSON, numbers as strings included", () => {
    const config = parseWeightBarcodeConfig('{"prefix":"2","itemLen":"5","valueLen":"5","valueKind":"price","divisor":"100"}');
    expect(config).toEqual({ prefix: "2", itemLen: 5, valueLen: 5, valueKind: "PRICE", divisor: 100 });
  });

  it("is enabled only when prefix, itemLen and valueLen are all set; divisor ≤ 0 reads 1", () => {
    expect(parseWeightBarcodeConfig(null)).toBeNull();
    expect(parseWeightBarcodeConfig("")).toBeNull();
    expect(parseWeightBarcodeConfig("not json")).toBeNull();
    expect(parseWeightBarcodeConfig('{"prefix":"","itemLen":5,"valueLen":5}')).toBeNull();
    expect(parseWeightBarcodeConfig('{"prefix":"2","itemLen":5,"valueLen":5,"divisor":0}')?.divisor).toBe(1);
  });
});

describe("decodeWeightBarcode", () => {
  const config = parseWeightBarcodeConfig(SETTING);

  it("splits a 2+5+5 label into the item code and a waiting WEIGHT value", () => {
    // prefix 2 · item 00123 · value 01250 → 1.250 kg
    expect(decodeWeightBarcode("20012301250", config)).toEqual({
      itemCode: "00123",
      pending: { kind: "WEIGHT", value: 1.25 },
    });
  });

  it("accepts one extra digit (an EAN-13 check digit, not verified) and nothing else", () => {
    expect(decodeWeightBarcode("200123012507", config)?.itemCode).toBe("00123");
    expect(decodeWeightBarcode("2001230125", config)).toBeNull();
    expect(decodeWeightBarcode("2001230125078", config)).toBeNull();
  });

  it("leaves an ordinary barcode alone: wrong prefix, or not all digits", () => {
    expect(decodeWeightBarcode("89012345678", config)).toBeNull();
    expect(decodeWeightBarcode("2001230125A", config)).toBeNull();
    expect(decodeWeightBarcode("20012301250", null)).toBeNull();
  });

  it("a PRICE label lands in the rate", () => {
    const price = parseWeightBarcodeConfig('{"prefix":"21","itemLen":5,"valueLen":5,"valueKind":"PRICE","divisor":100}');
    expect(decodeWeightBarcode("210012312345", price)).toEqual({ itemCode: "00123", pending: { kind: "PRICE", value: 123.45 } });
  });
});
