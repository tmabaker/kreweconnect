/**
 * HTTP routes:
 *
 *   GET /api/kreweworks/portals — each client's KreweWorks employee portal.
 *
 * KreweWorks runs as its own site per client (hiring records never share a
 * datastore), so the suite only links to it. Staff see every client's portal;
 * a client user sees only their own tenant's.
 */

import { app } from "@azure/functions";
import { withAuth } from "../lib/http";
import { config } from "../lib/config";

app.http("kreweworksPortals", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "kreweworks/portals",
  handler: withAuth(async (_request, caller) => {
    const names = new Map(config.clientTenants.map((t) => [t.id.toLowerCase(), t.name]));
    const portals = config.kreweworksPortals
      .filter((p) => caller.isMspAdmin || p.tenantId === caller.tenantId.toLowerCase())
      .map((p) => ({ ...p, name: names.get(p.tenantId) || "" }));
    return { status: 200, jsonBody: { value: portals } };
  }),
});
