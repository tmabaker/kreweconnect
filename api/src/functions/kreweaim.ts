/**
 * KreweAIM (AI Mastery) routes:
 *
 *   GET /api/tenants/{tenantId}/aim-members   — ids of users assigned KreweAIM
 *
 * Assignment is membership in the KreweAIM security group in the client
 * tenant, managed by client admins or NOIT IT. Read only. {tenantId} may be
 * "home" or, for MSP admins, "all".
 */

import { app } from "@azure/functions";
import { withAuth } from "../lib/http";
import { fetchAimMembers, fetchAimMembersAllTenants } from "../lib/graphClient";
import { config } from "../lib/config";

app.http("tenantAimMembers", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/aim-members",
  handler: withAuth(async (_request, _caller, tenantId) => {
    const result =
      tenantId === "all"
        ? await fetchAimMembersAllTenants(config.clientTenants, config.kreweAimGroup)
        : await fetchAimMembers(tenantId, config.kreweAimGroup);
    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=300" },
      jsonBody: { value: result.memberIds, groupFound: result.groupFound },
    };
  }),
});
