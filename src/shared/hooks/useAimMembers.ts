/**
 * useAimMembers: the set of user ids assigned KreweAIM (AI Mastery) in the
 * selected tenant, for the AIM mark on directory cards. Empty in demo mode,
 * in direct-Graph mode, or until the tenant's KreweAIM group exists.
 */

import { useEffect, useState } from "react";
import { isDemoMode } from "../auth/demoMode";
import { fetchAimMembers } from "../../services/graphService";
import { useTenantContext } from "./useTenantContext";

export function useAimMembers(): Set<string> {
  const { selectedTenant } = useTenantContext();
  const [members, setMembers] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    fetchAimMembers(selectedTenant.tenantId).then((ids) => {
      if (!cancelled) setMembers(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTenant.tenantId]);

  return members;
}
