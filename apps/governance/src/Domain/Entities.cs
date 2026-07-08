// KREWE Governance — recovered domain entities.
// Reconstructed 2026-07-06 from the live Azure SQL database `krewe-governance-db`
// (server noit-krwgov-0628). Column names/types/nullability match the live schema
// exactly; see ../../SCHEMA.md. Treat as a database-first model.

using System;
using System.Collections.Generic;

namespace NOIT.KreweGovernance.Domain;

/// <summary>Grouping for policies (e.g. Access Control, Awareness, Inventory).</summary>
public class PolicyCategory
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<Policy> Policies { get; set; } = new List<Policy>();
}

/// <summary>A policy template. Body carries {{variable_key}} placeholders.</summary>
public class Policy
{
    public Guid Id { get; set; }
    public string Title { get; set; } = null!;
    public string? Summary { get; set; }
    public string? Content { get; set; }
    public Guid CategoryId { get; set; }
    public PolicyCategory Category { get; set; } = null!;
    /// <summary>JSON array of ClientCompany GUIDs this policy is assigned to.</summary>
    public string AssignedClientIds { get; set; } = "[]";
    public string Status { get; set; } = null!;
    public int CurrentVersion { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime? NextReviewDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<PolicyVariable> Variables { get; set; } = new List<PolicyVariable>();
    public ICollection<PolicyVersion> Versions { get; set; } = new List<PolicyVersion>();
    public ICollection<AssembledPolicy> AssembledPolicies { get; set; } = new List<AssembledPolicy>();
    public ICollection<FindingPolicyMap> FindingMaps { get; set; } = new List<FindingPolicyMap>();
}

/// <summary>A question the variable-collection wizard asks to fill a {{key}}.</summary>
public class PolicyVariable
{
    public int Id { get; set; }
    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;
    public string Key { get; set; } = null!;
    public string Label { get; set; } = null!;
    public string Question { get; set; } = null!;
    /// <summary>e.g. text | textarea | select | date | bool.</summary>
    public string InputType { get; set; } = null!;
    /// <summary>JSON option list for select-type inputs.</summary>
    public string? Options { get; set; }
    /// <summary>True = asked once per client (universal); false = policy-specific.</summary>
    public bool IsUniversal { get; set; }
    public bool Required { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>Immutable version history of a policy's content.</summary>
public class PolicyVersion
{
    public Guid Id { get; set; }
    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;
    public int VersionNumber { get; set; }
    public string Content { get; set; } = null!;
    public string? ChangeNotes { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>A client organization (tenant).</summary>
public class ClientCompany
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public string? PrimaryContactName { get; set; }
    public string? PrimaryContactEmail { get; set; }
    public string? Industry { get; set; }
    public bool IsActive { get; set; }
    /// <summary>MyITProcess client id — links findings to this company.</summary>
    public string? MitpClientId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<ClientVariable> Variables { get; set; } = new List<ClientVariable>();
    public ICollection<AssembledPolicy> AssembledPolicies { get; set; } = new List<AssembledPolicy>();
}

/// <summary>A client's answer to a variable, keyed by name (the wizard output).</summary>
public class ClientVariable
{
    public int Id { get; set; }
    public Guid ClientCompanyId { get; set; }
    public ClientCompany ClientCompany { get; set; } = null!;
    public string Key { get; set; } = null!;
    public string Value { get; set; } = null!;
    public DateTime CollectedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>A policy merged for a specific client — the assembly-engine output.</summary>
public class AssembledPolicy
{
    public int Id { get; set; }
    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;
    public Guid ClientCompanyId { get; set; }
    public ClientCompany ClientCompany { get; set; } = null!;
    public string AssembledContent { get; set; } = null!;
    public DateTime AssembledAt { get; set; }
    public string AssembledBy { get; set; } = null!;
    public bool AcknowledgedByClient { get; set; }
    public DateTime? AcknowledgedAt { get; set; }
}

/// <summary>Maps a MyITProcess finding (by label/keyword) to a recommended policy.</summary>
public class FindingPolicyMap
{
    public int Id { get; set; }
    public string FindingLabel { get; set; } = null!;
    public string? FindingKeyword { get; set; }
    public Guid PolicyId { get; set; }
    public Policy Policy { get; set; } = null!;
}

/// <summary>An application user (NOIT staff, or a client-scoped user).</summary>
public class User
{
    public Guid Id { get; set; }
    public string EntraObjectId { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string Role { get; set; } = null!;
    /// <summary>Null for NOIT staff; set for client-scoped users.</summary>
    public Guid? ClientCompanyId { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
