/**
 * HTTP routes:
 *
 *   GET /api/tenants/{tenantId}/status                      — consent check
 *   GET /api/tenants/{tenantId}/users                       — directory list
 *   GET /api/tenants/{tenantId}/users/{userId}              — single user
 *   GET /api/tenants/{tenantId}/users/{userId}/directReports
 *   GET /api/tenants/{tenantId}/users/{userId}/photo        — image passthrough
 *
 * {tenantId} may be "home" for the caller's own tenant.
 */

import { app } from "@azure/functions";
import { withAuth } from "../lib/http";
import { checkTenantAuthorization } from "../lib/tokenService";
import {
  fetchUsers,
  fetchUsersAllTenants,
  fetchUserById,
  fetchDirectReports,
  fetchUserPhoto,
} from "../lib/graphClient";
import { config } from "../lib/config";

// MSP-admin tenant list. Sourced from the CLIENT_TENANTS app setting (REAL
// tenant IDs, configured at runtime — never hardcoded in the repo). The
// frontend switcher uses this instead of static config so it can never offer a
// placeholder/fake tenant ID (which would generate a broken consent URL).
app.http("tenantList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants",
  handler: withAuth(async (_request, caller) => {
    if (!caller.isMspAdmin) {
      return { status: 403, jsonBody: { code: "forbidden", message: "MSP admin only." } };
    }
    return { status: 200, jsonBody: { value: config.clientTenants } };
  }),
});

app.http("tenantStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/status",
  handler: withAuth(async (_request, _caller, tenantId) => {
    const status = await checkTenantAuthorization(tenantId);
    return { status: 200, jsonBody: { tenantId, ...status } };
  }),
});

app.http("tenantUsers", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users",
  handler: withAuth(async (_request, _caller, tenantId) => {
    const users =
      tenantId === "all"
        ? await fetchUsersAllTenants(config.clientTenants)
        : await fetchUsers(tenantId);
    return { status: 200, jsonBody: { value: users } };
  }),
});

app.http("tenantUserById", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}",
  handler: withAuth(async (request, _caller, tenantId) => {
    const user = await fetchUserById(tenantId, request.params.userId || "");
    return { status: 200, jsonBody: user };
  }),
});

app.http("tenantUserDirectReports", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/directReports",
  handler: withAuth(async (request, _caller, tenantId) => {
    const reports = await fetchDirectReports(tenantId, request.params.userId || "");
    return { status: 200, jsonBody: { value: reports } };
  }),
});

app.http("tenantUserPhoto", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/photo",
  handler: withAuth(async (request, _caller, tenantId) => {
    const photo = await fetchUserPhoto(tenantId, request.params.userId || "");
    if (!photo) {
      return { status: 404, jsonBody: { code: "no_photo", message: "User has no photo." } };
    }
    return {
      status: 200,
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "private, max-age=3600",
      },
      body: Buffer.from(photo.bytes),
    };
  }),
});
