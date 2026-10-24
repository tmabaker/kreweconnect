import { describe, expect, it, vi } from "vitest";

// contractService imports the MSAL-backed API client; stub it so the pure
// record conversion can be tested without a browser session.
vi.mock("./graphService", () => ({ apiSend: vi.fn() }));

import { toDetail, type ContractRecord } from "./contractService";

const record: ContractRecord = {
  id: "c1", tenantId: "t1", tenantDisplayName: "Fishman Haygood",
  title: "Copier lease", vendorName: "Acme", counterpartyName: null,
  agreementCategory: "Lease", location: "FH New Orleans", department: null, status: "Active",
  startDate: "2026-01-01", endDate: "2028-12-31", renewalDate: null, renewalType: "AutoRenew",
  noticePeriodDays: 60, renewalTermMonths: 12,
  earliestRenewalDecisionDate: null, latestRenewalDecisionDate: null,
  totalValue: 36000, recurringAmount: 1000, billingFrequency: "Monthly", currency: "USD",
  description: null, slaTerms: null, notes: null, terminationTerms: null, clientInternalOwner: null,
  riskClass: null, policyOrAccountNumber: null, coverageOrScopeSummary: null, reviewQuestions: [],
  tags: [], confidenceTier: "A", needsReview: false,
  contacts: [{ id: "p1", role: "Support", name: "Pat", company: null, title: null, email: null, phone: null, portalUrl: null, notes: null, sourceRef: null }],
  obligations: [], documents: [], versions: [], extractedAt: null, extractionModel: null,
  isArchived: false, archivedAt: null, createdById: null, createdAt: "2026-10-01T00:00:00Z",
  updatedById: null, updatedAt: "2026-10-01T00:00:00Z",
};

describe("toDetail", () => {
  it("derives the decision window, auto renew, value, and annualized value", () => {
    const d = toDetail(record);
    expect(d.latestRenewalDecisionDate).toBe("2028-11-01");
    expect(d.earliestRenewalDecisionDate).toBe("2028-08-03");
    expect(d.autoRenew).toBe(true);
    expect(d.value).toBe(36000);
    expect(d.annualizedValue).toBe(12000);
    expect(d.contacts[0].contractId).toBe("c1");
    expect(d.location).toBe("FH New Orleans");
  });

  it("keeps decision dates the document stated", () => {
    const d = toDetail({ ...record, latestRenewalDecisionDate: "2028-06-30", earliestRenewalDecisionDate: "2028-03-01" });
    expect(d.latestRenewalDecisionDate).toBe("2028-06-30");
    expect(d.earliestRenewalDecisionDate).toBe("2028-03-01");
  });

  it("keeps the source link of an imported agreement", () => {
    expect(toDetail(record).sourceWebUrl).toBeNull();
    const url = "https://fishmanhaygood.sharepoint.com/sites/clm/Shared%20Documents/Contracts/a.pdf";
    const d = toDetail({ ...record, sourceWebUrl: url, sourceItemId: "item1" });
    expect(d.sourceWebUrl).toBe(url);
    expect(d.sourceItemId).toBe("item1");
  });

  it("handles an agreement with no end date", () => {
    const d = toDetail({ ...record, endDate: null, renewalType: "Evergreen" });
    expect(d.daysUntilExpiry).toBeNull();
    expect(d.latestRenewalDecisionDate).toBeNull();
    expect(d.endDate).toBe("");
  });
});
