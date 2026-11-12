import { describe, expect, it } from "vitest";
import { contractPath, formatSites, sitesOf } from "./contractUtils";

describe("sites", () => {
  it("lists every site, falling back to the single location on older rows", () => {
    expect(sitesOf({ locations: ["Geaux Ford - Waveland", "Express Chevrolet Covington"], location: "Geaux Ford - Waveland" }))
      .toEqual(["Geaux Ford - Waveland", "Express Chevrolet Covington"]);
    expect(sitesOf({ location: "Volvo - Baton Rouge" })).toEqual(["Volvo - Baton Rouge"]);
    expect(sitesOf({ locations: [], location: null })).toEqual([]);
  });

  it("formats sites for tables and leaves blanks blank", () => {
    expect(formatSites({ locations: ["A", "B"] })).toBe("A, B");
    expect(formatSites({ locations: [] })).toBeNull();
  });

  it("routes to the amendment form", () => {
    expect(contractPath("t1", "c1", "amend")).toBe("/krewereview/t1/c1/amend");
  });
});
