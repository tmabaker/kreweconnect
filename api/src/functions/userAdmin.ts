/**
 * Graph-direct user administration routes (the techtools Users / OOO /
 * Vacation operations, minus the CIPP middleman). All writes are
 * MSP-staff-only and require a concrete target tenant.
 *
 *   POST  /api/tenants/{tenantId}/users                           — create user (+ licenses, manager)
 *   PATCH /api/tenants/{tenantId}/users/{userId}                  — update profile fields
 *   POST  /api/tenants/{tenantId}/users/{userId}/password         — reset password
 *   POST  /api/tenants/{tenantId}/users/{userId}/revokeSessions   — sign out everywhere
 *   POST  /api/tenants/{tenantId}/users/{userId}/licenses         — add/remove licenses
 *   GET   /api/tenants/{tenantId}/users/{userId}/mailboxSettings  — current OOO state
 *   PATCH /api/tenants/{tenantId}/users/{userId}/mailboxSettings  — set auto-reply (OOO)
 *   GET   /api/tenants/{tenantId}/licenses                        — subscribed SKUs
 *   GET   /api/tenants/{tenantId}/caPolicies                      — CA policies + exclusions
 *   POST  /api/tenants/{tenantId}/caPolicies/{policyId}/exclusions — add/remove excluded user
 */

import { app, type HttpRequest } from "@azure/functions";
import { withAuth, withMspWriteAuth, readJsonBody, BadRequestError } from "../lib/http";
import {
  createUser,
  updateUser,
  resetPassword,
  revokeSessions,
  listLicenses,
  setUserLicenses,
  getMailboxSettings,
  setAutoReply,
  listCaPolicies,
  setCaExclusion,
  createTemporaryAccessPass,
  type AutoReplyInput,
  type TapInput,
} from "../lib/userAdmin";
import { fetchUserById } from "../lib/graphClient";
import { savePasswordToItGlue, itGlueConfigured, ItGlueError } from "../lib/itglue";

function requireParam(request: HttpRequest, name: string): string {
  const value = request.params[name];
  if (!value) throw new BadRequestError(`Missing route parameter: ${name}`);
  return value;
}

app.http("userCreate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request);
    const result = await createUser(tenantId, body);
    return { status: 201, jsonBody: result };
  }),
});

app.http("userUpdate", {
  methods: ["PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request);
    const user = await updateUser(tenantId, requireParam(request, "userId"), body);
    return { status: 200, jsonBody: user };
  }),
});

app.http("userResetPassword", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/password",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request).catch(() => ({}) as Record<string, unknown>);
    const userId = requireParam(request, "userId");
    const result = await resetPassword(tenantId, userId, body);

    // Optionally vault the new password in IT Glue. A failure here must not
    // fail the reset (the password is already changed) — report it instead.
    let itGlue: { saved: boolean; id?: string; warning?: string } | undefined;
    if (body.saveToItGlue === true) {
      try {
        const user = await fetchUserById(tenantId, userId);
        const saved = await savePasswordToItGlue({
          tenantId,
          name: `M365 — ${user.displayName || user.userPrincipalName}`,
          username: user.userPrincipalName,
          password: result.password,
          notes: typeof body.itGlueNotes === "string" ? body.itGlueNotes : "Reset via NOIT Tech Portal",
        });
        itGlue = { saved: true, id: saved.id };
      } catch (err) {
        itGlue = {
          saved: false,
          warning: err instanceof ItGlueError || err instanceof Error ? err.message : "IT Glue save failed.",
        };
      }
    }
    return { status: 200, jsonBody: { ...result, itGlueConfigured: itGlueConfigured(), itGlue } };
  }),
});

app.http("userTemporaryAccessPass", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/temporaryAccessPass",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request).catch(() => ({}) as Record<string, unknown>);
    const tap = await createTemporaryAccessPass(
      tenantId,
      requireParam(request, "userId"),
      body as unknown as TapInput
    );
    return { status: 201, jsonBody: tap };
  }),
});

app.http("userRevokeSessions", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/revokeSessions",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    await revokeSessions(tenantId, requireParam(request, "userId"));
    return { status: 200, jsonBody: { revoked: true } };
  }),
});

app.http("userSetLicenses", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/licenses",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request);
    const add = Array.isArray(body.add)
      ? body.add.filter((s): s is string => typeof s === "string")
      : [];
    const remove = Array.isArray(body.remove)
      ? body.remove.filter((s): s is string => typeof s === "string")
      : [];
    if (add.length === 0 && remove.length === 0) {
      throw new BadRequestError("Provide 'add' and/or 'remove' arrays of license skuIds.");
    }
    await setUserLicenses(tenantId, requireParam(request, "userId"), add, remove);
    return { status: 200, jsonBody: { added: add, removed: remove } };
  }),
});

app.http("userMailboxSettings", {
  methods: ["GET", "PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/mailboxSettings",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const userId = requireParam(request, "userId");
    if (request.method === "GET") {
      const settings = await getMailboxSettings(tenantId, userId);
      return { status: 200, jsonBody: settings };
    }
    const body = await readJsonBody(request);
    if (typeof body.status !== "string") {
      throw new BadRequestError("status is required (disabled | alwaysEnabled | scheduled).");
    }
    const settings = await setAutoReply(tenantId, userId, body as unknown as AutoReplyInput);
    return { status: 200, jsonBody: settings };
  }),
});

app.http("tenantLicenses", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/licenses",
  handler: withAuth(async (_request, _caller, tenantId) => {
    if (tenantId === "all") {
      throw new BadRequestError("License listing requires a specific tenant, not 'all'.");
    }
    const skus = await listLicenses(tenantId);
    return { status: 200, jsonBody: { value: skus } };
  }),
});

app.http("tenantCaPolicies", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/caPolicies",
  handler: withMspWriteAuth(async (_request, _caller, tenantId) => {
    const policies = await listCaPolicies(tenantId);
    return { status: 200, jsonBody: { value: policies } };
  }),
});

app.http("caPolicyExclusions", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/caPolicies/{policyId}/exclusions",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request);
    const userId = typeof body.userId === "string" ? body.userId : "";
    const action = body.action === "remove" ? "remove" : body.action === "add" ? "add" : "";
    if (!userId || !action) {
      throw new BadRequestError("userId and action ('add' | 'remove') are required.");
    }
    const policy = await setCaExclusion(
      tenantId,
      requireParam(request, "policyId"),
      userId,
      action
    );
    return { status: 200, jsonBody: policy };
  }),
});
