import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { detectUserTenantContext } from "../../services/tenantService";
import { NoAccessNotice } from "../components/NoAccessNotice";

/**
 * Route guard for MSP-admin-only pages (Dashboard, KreweReview, Governance
 * library, Settings). A client-tenant user who reaches one (a pasted link, a
 * bookmark) is told who to email for access. The sign-in landing passes
 * `redirect` instead, so clients arrive on the Directory rather than a notice.
 * Defense in depth only; the API also refuses them from the verified token `tid`.
 */
export function MspAdminRoute({
  children,
  area,
  redirect = false,
}: {
  children: ReactNode;
  area?: string;
  redirect?: boolean;
}) {
  const { isMspAdmin } = detectUserTenantContext();
  if (!isMspAdmin) {
    if (redirect) return <Navigate to="/kreweconnect/directory" replace />;
    return <NoAccessNotice area={area ?? "this area"} />;
  }
  return <>{children}</>;
}
