/**
 * GET /api/me — who am I and what may I do?
 *
 * Lets the tech-tools pages adapt their UI to the signed-in caller without
 * guessing: MSP techs get the full multi-tenant experience, invited client
 * users get "client mode" (their own tenant, add/modify/reset only), and
 * everyone else learns they have no user-management rights here.
 */

import { app } from "@azure/functions";
import { withAuth } from "../lib/http";
import { config } from "../lib/config";

app.http("me", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "me",
  handler: withAuth(async (_request, caller) => {
    // Resolve a friendly tenant name when we know one (client tenants list).
    const known = config.clientTenants.find(
      (t) => t.id.toLowerCase() === caller.tenantId.toLowerCase()
    );
    return {
      status: 200,
      jsonBody: {
        tenantId: caller.tenantId,
        tenantName: caller.isMspAdmin ? "NOIT Group" : (known ? known.name : null),
        userPrincipalName: caller.userPrincipalName,
        isMspAdmin: caller.isMspAdmin,
        canManageUsers: caller.canManageUsers,
      },
    };
  }),
});
