namespace NOIT.ClientTools.Core.Enums;

public enum ContractType
{
    Software,
    Hardware,
    Service,
    Lease,
    Subscription,
    Consulting,
    Other
}

public enum ContractStatus
{
    Draft,
    Active,
    UnderReview,
    Expired,
    Terminated,
    Renewed,
    // Schema v2 additions. Appended, never renumbered (values persist as strings).
    PendingRenewalDecision, // inside the renewal decision window
    Unknown                 // evidence only, terms not established
}

public enum ApprovalStatus
{
    Pending,
    Approved,
    Rejected
}

public enum AlertType
{
    ThirtyDay,
    SixtyDay,
    NinetyDay,
    Custom,
    // Schema v2 additions: anchored on the renewal decision dates.
    DecisionDeadline,    // anchored on LatestRenewalDecisionDate
    DecisionWindowOpens  // anchored on EarliestRenewalDecisionDate
}

public enum BillingFrequency
{
    Monthly,
    Quarterly,
    SemiAnnual,
    Annual,
    OneTime,
    // Schema v2 additions
    Usage,
    Unknown
}

/// <summary>Primary classifier (schema v2). ContractType is kept for compatibility.</summary>
public enum AgreementCategory
{
    VendorService,
    MasterServices,
    StatementOfWork,
    SoftwareLicense,
    SaaSSubscription,
    InsurancePolicy,
    CertificateOfInsurance,
    Lease,
    Maintenance,
    Warranty,
    ProfessionalServices,
    Membership,
    Certification,
    Telecom,
    Utility,
    Financing,
    FranchiseOrDealer,
    PayerContract,
    Confidentiality,
    Other
}

public enum RenewalType
{
    MonthToMonth,
    AutoRenew,
    ExpireUnlessRenewed,
    Evergreen,
    FixedTermNoRenewal,
    Unknown
}

public enum RiskClass
{
    Low,
    Medium,
    High,
    Critical
}

/// <summary>A = verified from the executed document, B = partly inferred, C = evidence only.</summary>
public enum ConfidenceTier
{
    A,
    B,
    C
}

public enum SourceSystem
{
    SharePoint,
    OneDrive,
    Mail,
    FileServer,
    Egnyte,
    AccountingExport,
    VendorPortal,
    Manual,
    M365Licensing,
    EntraApps
}

public enum ContactRole
{
    ExternalServicer,
    Support,
    Payable,
    InternalOwner,
    Broker,
    Other
}

public enum ObligationStatus
{
    Open,
    Done,
    Waived
}
