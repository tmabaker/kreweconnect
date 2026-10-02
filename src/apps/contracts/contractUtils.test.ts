import { describe, expect, it } from "vitest";
import { annualizeValue, computeDecisionDates } from "./contractUtils";

describe("computeDecisionDates", () => {
  it("subtracts the notice period from the end date for auto renew", () => {
    expect(computeDecisionDates("2027-06-30", 60, "AutoRenew")).toEqual({
      latest: "2027-05-01",
      earliest: "2027-01-31",
    });
  });

  it("uses the end date itself for ExpireUnlessRenewed, ignoring notice", () => {
    expect(computeDecisionDates("2027-06-30", 60, "ExpireUnlessRenewed")).toEqual({
      latest: "2027-06-30",
      earliest: "2027-04-01",
    });
  });

  it("treats a missing notice period as zero days", () => {
    expect(computeDecisionDates("2027-01-15", null, "AutoRenew").latest).toBe("2027-01-15");
  });

  it("returns nulls without a usable end date", () => {
    expect(computeDecisionDates(null, 30, "AutoRenew")).toEqual({ earliest: null, latest: null });
    expect(computeDecisionDates("", 30, "MonthToMonth")).toEqual({ earliest: null, latest: null });
    expect(computeDecisionDates("not-a-date", 30, "AutoRenew")).toEqual({ earliest: null, latest: null });
  });

  it("crosses year and leap-day boundaries correctly", () => {
    expect(computeDecisionDates("2028-03-01", 1, "AutoRenew").latest).toBe("2028-02-29");
    expect(computeDecisionDates("2027-01-10", 30, "AutoRenew").latest).toBe("2026-12-11");
  });
});

describe("annualizeValue", () => {
  it("multiplies the recurring amount by periods per year", () => {
    expect(annualizeValue(100, "Monthly", null, null, null)).toBe(1200);
    expect(annualizeValue(300, "Quarterly", null, null, null)).toBe(1200);
    expect(annualizeValue(600, "SemiAnnual", null, null, null)).toBe(1200);
    expect(annualizeValue(1200, "Annual", null, null, null)).toBe(1200);
  });

  it("prefers the recurring amount over total value", () => {
    expect(annualizeValue(100, "Monthly", 99999, "2026-01-01", "2027-01-01")).toBe(1200);
  });

  it("falls back to total value divided by term years", () => {
    expect(annualizeValue(null, null, 3000, "2026-01-01", "2029-01-01")).toBeCloseTo(1000, -1);
  });

  it("cannot annualize OneTime, Usage or Unknown from a recurring amount", () => {
    expect(annualizeValue(500, "OneTime", null, null, null)).toBeNull();
    expect(annualizeValue(500, "Usage", null, null, null)).toBeNull();
    expect(annualizeValue(500, "Unknown", 2400, "2026-01-01", "2028-01-01")).toBeCloseTo(1200, -1);
  });

  it("returns null with no usable inputs or a non-positive term", () => {
    expect(annualizeValue(null, null, null, null, null)).toBeNull();
    expect(annualizeValue(null, null, 1000, "2026-01-01", null)).toBeNull();
    expect(annualizeValue(null, null, 1000, "2027-01-01", "2026-01-01")).toBeNull();
  });
});
