/**
 * HTTP routes:
 *
 *   GET   /api/tenants/{tenantId}/status                    — consent check
 *   GET   /api/tenants/{tenantId}/users                     — directory list
 *   POST  /api/tenants/{tenantId}/users                     — create user (MSP write)
 *   GET   /api/tenants/{tenantId}/users/{userId}            — single user
 *   PATCH /api/tenants/{tenantId}/users/{userId}            — update profile (MSP write)
 *   GET   /api/tenants/{tenantId}/users/{userId}/directReports
 *   GET   /api/tenants/{tenantId}/users/{userId}/photo      — image passthrough
 *
 * {tenantId} may be "home" for the caller's own tenant.
 */

import { app } from "@azure/functions";
import { withAuth, withMspWriteAuth, readJsonBody } from "../lib/http";
import { checkTenantAuthorization } from "../lib/tokenService";
import {
  fetchUsers,
  fetchUsersAdmin,
  fetchUsersAllTenants,
  fetchUserById,
  fetchDirectReports,
  fetchUserPhoto,
} from "../lib/graphClient";
import { createUser, updateUser } from "../lib/userAdmin";
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

// NOTE: each route template below must be registered exactly ONCE. Behind
// Static Web Apps, two functions sharing a route template (even with disjoint
// methods) resolve to whichever registered first — the other's methods 404.
// That silently killed POST (create user) and PATCH (update user) when they
// lived in userAdmin.ts, so those handlers are dispatched by method here.

const listUsersHandler = withAuth(async (request, caller, tenantId) => {
  // ?view=admin — unfiltered list (disabled/unlicensed/guest accounts too)
  // for the techtools admin pages. MSP staff only; not for the directory.
  if (request.query.get("view") === "admin") {
    if (!caller.isMspAdmin) {
      return { status: 403, jsonBody: { code: "forbidden", message: "MSP admin only." } };
    }
    if (tenantId === "all") {
      return {
        status: 400,
        jsonBody: { code: "bad_request", message: "Admin view requires a specific tenant." },
      };
    }
    const users = await fetchUsersAdmin(tenantId);
    return { status: 200, jsonBody: { value: users } };
  }
  const users =
    tenantId === "all"
      ? await fetchUsersAllTenants(config.clientTenants)
      : await fetchUsers(tenantId);
  return { status: 200, jsonBody: { value: users } };
});

const createUserHandler = withMspWriteAuth(async (request, _caller, tenantId) => {
  const body = await readJsonBody(request);
  const result = await createUser(tenantId, body);
  return { status: 201, jsonBody: result };
});

app.http("tenantUsers", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users",
  handler: (request, context) =>
    request.method === "POST"
      ? createUserHandler(request, context)
      : listUsersHandler(request, context),
});

const getUserHandler = withAuth(async (request, _caller, tenantId) => {
  const user = await fetchUserById(tenantId, request.params.userId || "");
  return { status: 200, jsonBody: user };
});

const updateUserHandler = withMspWriteAuth(async (request, _caller, tenantId) => {
  const body = await readJsonBody(request);
  const user = await updateUser(tenantId, request.params.userId || "", body);
  return { status: 200, jsonBody: user };
});

app.http("tenantUserById", {
  methods: ["GET", "PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}",
  handler: (request, context) =>
    request.method === "PATCH"
      ? updateUserHandler(request, context)
      : getUserHandler(request, context),
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
