import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { detectUserTenantContext } from "../../services/tenantService";

/**
 * Route guard for MSP-admin-only pages (Dashboard, KreweReview/contracts,
 * Settings). Client-tenant users must only ever reach the Directory and Org
 * Chart, so anyone who is not an NOIT MSP admin is redirected to /directory —
 * even if they type the URL directly. This is defense in depth; the API also
 * enforces tenant isolation from the verified token `tid`.
 */
export function MspAdminRoute({ children }: { children: ReactNode }) {
  const { isMspAdmin } = detectUserTenantContext();
  if (!isMspAdmin) {
    return <Navigate to="/directory" replace />;
  }
  return <>{children}</>;
}
