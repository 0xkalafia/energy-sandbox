import { describe, it, expect } from "vitest";
import { fmtNum, fmtEnergy, fmtPower, fmtBaht, fmtPct } from "./utils";

/**
 * Every one of these picks a unit by crossing a threshold, so the only places
 * they can be wrong are the thresholds themselves — 999 vs 1000, 999_999 vs
 * 1_000_000. Testing 5_000 proves nothing: a `>=` flipped to `>`, a boundary
 * moved by one, or a unit swapped all still look right in the middle of a
 * band. So the cases below sit on the edges, one either side.
 */

describe("fmtNum", () => {
  it.each([
    [0, "0.0"],
    [999, "999.0"],
    [1_000, "1.0k"],
    [999_999, "1000.0k"],
    [1_000_000, "1.0M"],
    [999_999_999, "1000.0M"],
    [1_000_000_000, "1.0B"],
  ])("%s → %s", (input, expected) => {
    expect(fmtNum(input)).toBe(expected);
  });

  it("picks the unit off the magnitude, so negatives scale too", () => {
    expect(fmtNum(-1500)).toBe("-1.5k");
    expect(fmtNum(-2.5e9)).toBe("-2.5B");
  });

  it("honours the digits argument", () => {
    expect(fmtNum(1234, 0)).toBe("1k");
    expect(fmtNum(1234, 3)).toBe("1.234k");
    expect(fmtNum(7, 2)).toBe("7.00");
  });

  it("returns a dash rather than 'NaN' or 'Infinity'", () => {
    expect(fmtNum(NaN)).toBe("—");
    expect(fmtNum(Infinity)).toBe("—");
    expect(fmtNum(-Infinity)).toBe("—");
  });
});

describe("fmtEnergy — kWh in, largest sensible unit out", () => {
  it.each([
    [0, "0 kWh"],
    [999, "999 kWh"],
    [1_000, "1.0 MWh"],
    [999_999, "1000.0 MWh"],
    [1_000_000, "1.00 GWh"],
    [999_999_999, "1000.00 GWh"],
    [1_000_000_000, "1.00 TWh"],
  ])("%s → %s", (input, expected) => {
    expect(fmtEnergy(input)).toBe(expected);
  });

  it("keeps the sign while scaling by magnitude", () => {
    expect(fmtEnergy(-2_500_000)).toBe("-2.50 GWh");
  });

  it("rounds kWh to whole units — sub-kWh precision is noise here", () => {
    expect(fmtEnergy(4.6)).toBe("5 kWh");
  });
});

describe("fmtPower — MW in, GW when it gets big", () => {
  it.each([
    [0, "0 MW"],
    [999, "999 MW"],
    [1_000, "1.00 GW"],
    [8_200, "8.20 GW"],
  ])("%s → %s", (input, expected) => {
    expect(fmtPower(input)).toBe(expected);
  });

  it("switches on magnitude for negatives too", () => {
    expect(fmtPower(-1200)).toBe("-1.20 GW");
    expect(fmtPower(-999)).toBe("-999 MW");
  });
});

describe("fmtBaht", () => {
  it.each([
    [0, "฿0"],
    [999, "฿999"],
    [1_000, "฿1.0k"],
    [1_000_000, "฿1.00M"],
    [1_000_000_000, "฿1.00B"],
    [519_680_000_000, "฿519.68B"],
  ])("%s → %s", (input, expected) => {
    expect(fmtBaht(input)).toBe(expected);
  });

  it("puts the minus inside, after the symbol", () => {
    // OPEX is displayed as a negative; the sign has to stay legible.
    expect(fmtBaht(-12_990_000_000)).toBe("฿-12.99B");
  });
});

describe("fmtPct — takes a fraction, not a percentage", () => {
  it.each([
    [0, "0.0%"],
    [0.5, "50.0%"],
    [1, "100.0%"],
    [0.137, "13.7%"],
  ])("%s → %s", (input, expected) => {
    expect(fmtPct(input)).toBe(expected);
  });

  it("honours the digits argument", () => {
    expect(fmtPct(0.12345, 0)).toBe("12%");
    expect(fmtPct(0.12345, 2)).toBe("12.35%");
  });

  it("does not clamp — a ratio above 1 is a real result worth seeing", () => {
    expect(fmtPct(1.25)).toBe("125.0%");
  });
});
