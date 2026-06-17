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

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { authenticate, authorizeTenant, AuthError, type CallerContext } from "../lib/authMiddleware";
import { TenantNotAuthorizedError, checkTenantAuthorization } from "../lib/tokenService";
import {
  fetchUsers,
  fetchUsersAllTenants,
  fetchUserById,
  fetchDirectReports,
  fetchUserPhoto,
  GraphRequestError,
} from "../lib/graphClient";
import { config } from "../lib/config";

type Handler = (
  request: HttpRequest,
  caller: CallerContext,
  tenantId: string
) => Promise<HttpResponseInit>;

/** Wraps a handler with authentication, tenant authorization, and error mapping. */
function withAuth(handler: Handler) {
  return async (
    request: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> => {
    try {
      const caller = await authenticate(request);
      const tenantId = authorizeTenant(caller, request.params.tenantId || "home");
      return await handler(request, caller, tenantId);
    } catch (err) {
      if (err instanceof AuthError) {
        return { status: err.status, jsonBody: { code: "auth_error", message: err.message } };
      }
      if (err instanceof TenantNotAuthorizedError) {
        return {
          status: 401,
          jsonBody: {
            code: "consent_required",
            message: err.message,
            consentUrl: err.consentUrl,
          },
        };
      }
      if (err instanceof GraphRequestError) {
        return {
          status: err.status,
          jsonBody: { code: err.code, message: err.message },
        };
      }
      context.error("Unhandled error", err);
      return {
        status: 500,
        jsonBody: { code: "internal_error", message: "An unexpected error occurred." },
      };
    }
  };
}

// MSP-admin tenant list. Sourced from the CLIENT_TENANTS app setting (REAL
// tenant IDs, configured at runtime — never hardcoded in the repo). The
// frontend switcher uses this instead of static config so it can never offer a
// placeholder/fake tenant ID (which would generate a broken consent URL).
app.http("tenantList", {
  methods: ["GET"],
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
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/status",
  handler: withAuth(async (_request, _caller, tenantId) => {
    const status = await checkTenantAuthorization(tenantId);
    return { status: 200, jsonBody: { tenantId, ...status } };
  }),
});

app.http("tenantUsers", {
  methods: ["GET"],
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
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}",
  handler: withAuth(async (request, _caller, tenantId) => {
    const user = await fetchUserById(tenantId, request.params.userId || "");
    return { status: 200, jsonBody: user };
  }),
});

app.http("tenantUserDirectReports", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/directReports",
  handler: withAuth(async (request, _caller, tenantId) => {
    const reports = await fetchDirectReports(tenantId, request.params.userId || "");
    return { status: 200, jsonBody: { value: reports } };
  }),
});

app.http("tenantUserPhoto", {
  methods: ["GET"],
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
