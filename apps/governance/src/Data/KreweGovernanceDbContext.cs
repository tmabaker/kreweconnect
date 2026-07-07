// KREWE Governance — recovered EF Core DbContext.
// Reconstructed 2026-07-06 to match the live `krewe-governance-db` schema exactly
// (see ../../SCHEMA.md). Column sizes/nullability and FK targets are from the live
// DB; ON DELETE behaviors are inferred (schema doesn't expose the originals).
//
// Connect with the AWS secret `noit/krewe-governance-sql`. This is a DATABASE-FIRST
// model: do not add migrations against the live DB unless you intend to alter it —
// `InitialCreate` is already applied.

using Microsoft.EntityFrameworkCore;
using NOIT.KreweGovernance.Domain;

namespace NOIT.KreweGovernance.Data;

public class KreweGovernanceDbContext : DbContext
{
    public KreweGovernanceDbContext(DbContextOptions<KreweGovernanceDbContext> options)
        : base(options) { }

    public DbSet<PolicyCategory> PolicyCategories => Set<PolicyCategory>();
    public DbSet<Policy> Policies => Set<Policy>();
    public DbSet<PolicyVariable> PolicyVariables => Set<PolicyVariable>();
    public DbSet<PolicyVersion> PolicyVersions => Set<PolicyVersion>();
    public DbSet<ClientCompany> ClientCompanies => Set<ClientCompany>();
    public DbSet<ClientVariable> ClientVariables => Set<ClientVariable>();
    public DbSet<AssembledPolicy> AssembledPolicies => Set<AssembledPolicy>();
    public DbSet<FindingPolicyMap> FindingPolicyMaps => Set<FindingPolicyMap>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<PolicyCategory>(e =>
        {
            e.ToTable("PolicyCategories");
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Description).HasMaxLength(1000);
        });

        b.Entity<Policy>(e =>
        {
            e.ToTable("Policies");
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(500).IsRequired();
            e.Property(x => x.Summary).HasMaxLength(2000);
            e.Property(x => x.Content).HasColumnType("nvarchar(max)");
            e.Property(x => x.AssignedClientIds).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.Status).HasMaxLength(50).IsRequired();
            e.HasOne(x => x.Category)
             .WithMany(c => c.Policies)
             .HasForeignKey(x => x.CategoryId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<PolicyVariable>(e =>
        {
            e.ToTable("PolicyVariables");
            e.HasKey(x => x.Id); // int identity
            e.Property(x => x.Key).HasMaxLength(100).IsRequired();
            e.Property(x => x.Label).HasMaxLength(300).IsRequired();
            e.Property(x => x.Question).HasMaxLength(1000).IsRequired();
            e.Property(x => x.InputType).HasMaxLength(50).IsRequired();
            e.Property(x => x.Options).HasColumnType("nvarchar(max)");
            e.HasOne(x => x.Policy)
             .WithMany(p => p.Variables)
             .HasForeignKey(x => x.PolicyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<PolicyVersion>(e =>
        {
            e.ToTable("PolicyVersions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Content).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.ChangeNotes).HasMaxLength(1000);
            e.HasOne(x => x.Policy)
             .WithMany(p => p.Versions)
             .HasForeignKey(x => x.PolicyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ClientCompany>(e =>
        {
            e.ToTable("ClientCompanies");
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(300).IsRequired();
            e.Property(x => x.PrimaryContactName).HasMaxLength(200);
            e.Property(x => x.PrimaryContactEmail).HasMaxLength(300);
            e.Property(x => x.Industry).HasMaxLength(100);
            e.Property(x => x.MitpClientId).HasMaxLength(100);
        });

        b.Entity<ClientVariable>(e =>
        {
            e.ToTable("ClientVariables");
            e.HasKey(x => x.Id); // int identity
            e.Property(x => x.Key).HasMaxLength(100).IsRequired();
            e.Property(x => x.Value).HasColumnType("nvarchar(max)").IsRequired();
            e.HasOne(x => x.ClientCompany)
             .WithMany(c => c.Variables)
             .HasForeignKey(x => x.ClientCompanyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<AssembledPolicy>(e =>
        {
            e.ToTable("AssembledPolicies");
            e.HasKey(x => x.Id); // int identity
            e.Property(x => x.AssembledContent).HasColumnType("nvarchar(max)").IsRequired();
            e.Property(x => x.AssembledBy).HasMaxLength(300).IsRequired();
            e.HasOne(x => x.Policy)
             .WithMany(p => p.AssembledPolicies)
             .HasForeignKey(x => x.PolicyId)
             .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ClientCompany)
             .WithMany(c => c.AssembledPolicies)
             .HasForeignKey(x => x.ClientCompanyId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<FindingPolicyMap>(e =>
        {
            e.ToTable("FindingPolicyMaps");
            e.HasKey(x => x.Id); // int identity
            e.Property(x => x.FindingLabel).HasMaxLength(500).IsRequired();
            e.Property(x => x.FindingKeyword).HasMaxLength(200);
            e.HasOne(x => x.Policy)
             .WithMany(p => p.FindingMaps)
             .HasForeignKey(x => x.PolicyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasKey(x => x.Id);
            e.Property(x => x.EntraObjectId).HasMaxLength(100).IsRequired();
            e.Property(x => x.DisplayName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Email).HasMaxLength(300).IsRequired();
            e.Property(x => x.Role).HasMaxLength(50).IsRequired();
            // ClientCompanyId is a nullable link; no enforced FK in the live schema.
        });
    }
}
