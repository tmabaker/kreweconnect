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
    Renewed
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
    Custom
}

public enum BillingFrequency
{
    Monthly,
    Quarterly,
    SemiAnnual,
    Annual,
    OneTime
}
