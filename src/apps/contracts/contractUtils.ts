import type { ContractStatus } from "../../shared/types";

export function getStatusColor(status: ContractStatus): "success" | "brand" | "warning" | "danger" | "informative" | "important" | "subtle" {
  switch (status) {
    case "Active": return "success";
    case "Draft": return "brand";
    case "UnderReview": return "warning";
    case "Expired": return "danger";
    case "Terminated": return "subtle";
    case "Renewed": return "important";
    default: return "informative";
  }
}

export function getStatusLabel(status: ContractStatus): string {
  switch (status) {
    case "UnderReview": return "Under Review";
    default: return status;
  }
}

export function getUrgencyColor(daysRemaining: number): "danger" | "warning" | "success" | "informative" {
  if (daysRemaining <= 30) return "danger";
  if (daysRemaining <= 60) return "warning";
  if (daysRemaining <= 90) return "success";
  return "informative";
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return "No expiry";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Expires today";
  return `${days}d left`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CONTRACT_TYPES = ["Software", "Hardware", "Service", "Lease", "Subscription", "Consulting", "Other"] as const;
export const CONTRACT_STATUSES = ["Draft", "Active", "UnderReview", "Expired", "Terminated", "Renewed"] as const;
