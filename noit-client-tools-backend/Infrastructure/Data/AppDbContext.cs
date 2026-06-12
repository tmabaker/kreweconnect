using Microsoft.EntityFrameworkCore;
using NOIT.ClientTools.Core.Models;

namespace NOIT.ClientTools.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<ClientTenant> ClientTenants => Set<ClientTenant>();
    public DbSet<AppUser> AppUsers => Set<AppUser>();
    public DbSet<UserTenantAccess> UserTenantAccess => Set<UserTenantAccess>();
    public DbSet<AuditLogEntry> AuditLog => Set<AuditLogEntry>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<EmployeeCustomField> EmployeeCustomFields => Set<EmployeeCustomField>();
    public DbSet<CustomFieldDefinition> CustomFieldDefinitions => Set<CustomFieldDefinition>();

    // Contract Lifecycle Manager
    public DbSet<Contract> Contracts => Set<Contract>();
    public DbSet<ContractVersion> ContractVersions => Set<ContractVersion>();
    public DbSet<ContractDocument> ContractDocuments => Set<ContractDocument>();
    public DbSet<ContractApproval> ContractApprovals => Set<ContractApproval>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<ContractTag> ContractTags => Set<ContractTag>();
    public DbSet<RenewalAlert> RenewalAlerts => Set<RenewalAlert>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ClientTenant
        modelBuilder.Entity<ClientTenant>(e =>
        {
            e.HasIndex(t => t.TenantId).IsUnique();
            e.Property(t => t.DisplayName).HasMaxLength(200).IsRequired();
            e.Property(t => t.GdapRelationshipId).HasMaxLength(500);
            e.Property(t => t.PrimaryDomain).HasMaxLength(200);
            e.Property(t => t.Status).HasConversion<string>().HasMaxLength(50);
            e.Property(t => t.Notes).HasMaxLength(2000);
        });

        // AppUser
        modelBuilder.Entity<AppUser>(e =>
        {
            e.HasIndex(u => u.EntraObjectId).IsUnique();
            e.Property(u => u.Email).HasMaxLength(320).IsRequired();
            e.Property(u => u.DisplayName).HasMaxLength(200).IsRequired();
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(50);
        });

        // UserTenantAccess
        modelBuilder.Entity<UserTenantAccess>(e =>
        {
            e.HasIndex(a => new { a.AppUserId, a.ClientTenantId }).IsUnique();
            e.Property(a => a.AccessLevel).HasConversion<string>().HasMaxLength(50);

            e.HasOne(a => a.AppUser)
                .WithMany(u => u.TenantAccess)
                .HasForeignKey(a => a.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(a => a.ClientTenant)
                .WithMany(t => t.UserAccess)
                .HasForeignKey(a => a.ClientTenantId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(a => a.GrantedBy)
                .WithMany()
                .HasForeignKey(a => a.GrantedById)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // AuditLogEntry
        modelBuilder.Entity<AuditLogEntry>(e =>
        {
            e.ToTable("AuditLog");
            e.Property(a => a.Action).HasMaxLength(100).IsRequired();
            e.Property(a => a.EntityType).HasMaxLength(100).IsRequired();
            e.Property(a => a.EntityId).HasMaxLength(100);
            e.Property(a => a.UserEmail).HasMaxLength(320);
            e.Property(a => a.IpAddress).HasMaxLength(45);
            e.Property(a => a.UserAgent).HasMaxLength(500);

            e.HasIndex(a => a.Timestamp).IsDescending();
            e.HasIndex(a => new { a.EntityType, a.EntityId });
            e.HasIndex(a => new { a.UserId, a.Timestamp }).IsDescending();

            e.HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.SetNull);

            e.HasOne(a => a.ClientTenant)
                .WithMany()
                .HasForeignKey(a => a.ClientTenantId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Employee
        modelBuilder.Entity<Employee>(e =>
        {
            e.HasIndex(emp => new { emp.ClientTenantId, emp.EntraObjectId }).IsUnique();
            e.HasIndex(emp => emp.DisplayName);
            e.HasIndex(emp => emp.Email);
            e.HasIndex(emp => emp.Department);

            e.Property(emp => emp.DisplayName).HasMaxLength(200).IsRequired();
            e.Property(emp => emp.EntraObjectId).HasMaxLength(100).IsRequired();
            e.Property(emp => emp.Email).HasMaxLength(320);
            e.Property(emp => emp.GivenName).HasMaxLength(100);
            e.Property(emp => emp.Surname).HasMaxLength(100);
            e.Property(emp => emp.JobTitle).HasMaxLength(200);
            e.Property(emp => emp.Department).HasMaxLength(200);
            e.Property(emp => emp.OfficeLocation).HasMaxLength(200);
            e.Property(emp => emp.MobilePhone).HasMaxLength(50);
            e.Property(emp => emp.BusinessPhone).HasMaxLength(50);
            e.Property(emp => emp.EmployeeId).HasMaxLength(100);
            e.Property(emp => emp.ManagerEntraObjectId).HasMaxLength(100);

            e.HasOne(emp => emp.ClientTenant)
                .WithMany()
                .HasForeignKey(emp => emp.ClientTenantId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(emp => emp.Manager)
                .WithMany(emp => emp.DirectReports)
                .HasForeignKey(emp => emp.ManagerId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // EmployeeCustomField
        modelBuilder.Entity<EmployeeCustomField>(e =>
        {
            e.HasIndex(f => new { f.EmployeeId, f.FieldName }).IsUnique();
            e.Property(f => f.FieldName).HasMaxLength(100).IsRequired();
            e.Property(f => f.FieldType).HasMaxLength(50);

            e.HasOne(f => f.Employee)
                .WithMany(emp => emp.CustomFields)
                .HasForeignKey(f => f.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // CustomFieldDefinition
        modelBuilder.Entity<CustomFieldDefinition>(e =>
        {
            e.Property(d => d.FieldName).HasMaxLength(100).IsRequired();
            e.Property(d => d.FieldType).HasMaxLength(50);
            e.Property(d => d.SelectOptions).HasMaxLength(2000);

            e.HasOne(d => d.Tenant)
                .WithMany()
                .HasForeignKey(d => d.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Contract
        modelBuilder.Entity<Contract>(e =>
        {
            e.HasIndex(c => new { c.TenantId, c.VendorName });
            e.HasIndex(c => c.Status);
            e.HasIndex(c => c.EndDate);
            e.Property(c => c.Title).HasMaxLength(500).IsRequired();
            e.Property(c => c.VendorName).HasMaxLength(300).IsRequired();
            e.Property(c => c.Currency).HasMaxLength(3);
            e.Property(c => c.ContractType).HasConversion<string>().HasMaxLength(50);
            e.Property(c => c.Status).HasConversion<string>().HasMaxLength(50);
            e.Property(c => c.Value).HasColumnType("decimal(18,2)");

            e.HasOne(c => c.Tenant)
                .WithMany()
                .HasForeignKey(c => c.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ContractVersion
        modelBuilder.Entity<ContractVersion>(e =>
        {
            e.HasIndex(v => new { v.ContractId, v.VersionNumber }).IsUnique();
            e.Property(v => v.Summary).HasMaxLength(1000);
            e.Property(v => v.ChangeNotes).HasMaxLength(2000);

            e.HasOne(v => v.Contract)
                .WithMany(c => c.Versions)
                .HasForeignKey(v => v.ContractId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ContractDocument
        modelBuilder.Entity<ContractDocument>(e =>
        {
            e.Property(d => d.FileName).HasMaxLength(500).IsRequired();
            e.Property(d => d.ContentType).HasMaxLength(200);
            e.Property(d => d.StoragePath).HasMaxLength(1000);

            e.HasOne(d => d.Contract)
                .WithMany(c => c.Documents)
                .HasForeignKey(d => d.ContractId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ContractApproval
        modelBuilder.Entity<ContractApproval>(e =>
        {
            e.Property(a => a.Status).HasConversion<string>().HasMaxLength(50);
            e.Property(a => a.Comments).HasMaxLength(2000);

            e.HasOne(a => a.Contract)
                .WithMany(c => c.Approvals)
                .HasForeignKey(a => a.ContractId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Tag
        modelBuilder.Entity<Tag>(e =>
        {
            e.HasIndex(t => t.Name).IsUnique();
            e.Property(t => t.Name).HasMaxLength(100).IsRequired();
            e.Property(t => t.Color).HasMaxLength(7);
        });

        // ContractTag
        modelBuilder.Entity<ContractTag>(e =>
        {
            e.HasIndex(ct2 => new { ct2.ContractId, ct2.TagId }).IsUnique();

            e.HasOne(ct2 => ct2.Contract)
                .WithMany(c => c.ContractTags)
                .HasForeignKey(ct2 => ct2.ContractId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(ct2 => ct2.Tag)
                .WithMany(t => t.ContractTags)
                .HasForeignKey(ct2 => ct2.TagId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // RenewalAlert
        modelBuilder.Entity<RenewalAlert>(e =>
        {
            e.Property(r => r.AlertType).HasConversion<string>().HasMaxLength(50);

            e.HasOne(r => r.Contract)
                .WithMany(c => c.RenewalAlerts)
                .HasForeignKey(r => r.ContractId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
