/**
 * Endpoint handover, phone vendor notices and KreweWorks updates for the
 * Remove User page. MSP staff only; one concrete tenant.
 *
 *   GET  /api/tenants/{tenantId}/endpoints/{name}            — Intune, Autopilot and VSA X state, and what can be done
 *   POST /api/tenants/{tenantId}/endpoints/{name}/wipe       — wipe in Intune (managed and Autopilot registered only)
 *   POST /api/tenants/{tenantId}/endpoints/{name}/register   — import the VSA X hash into Autopilot
 *   POST /api/tenants/{tenantId}/users/{userId}/phoneVendorNotice — preview or send the extension notice
 *   POST /api/tenants/{tenantId}/kreweworks/requests/{requestId}/updates — record work on the KreweWorks request
 */

import { app, type HttpRequest } from "@azure/functions";
import { withMspWriteAuth, readJsonBody, BadRequestError } from "../lib/http";
import { lookupEndpoint, wipeEndpoint, registerEndpoint } from "../lib/endpointHandover";
import { buildNotice, sendNotice, phoneVendorSupported } from "../lib/phoneVendor";
import { relayToKreweWorks } from "../lib/kreweworksRelay";
import { fetchUserById } from "../lib/graphClient";

function param(request: HttpRequest, name: string): string {
  const value = request.params[name];
  if (!value) throw new BadRequestError(`Missing route parameter: ${name}`);
  return value;
}

app.http("endpointLookup", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/endpoints/{name}",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => ({
    status: 200,
    jsonBody: await lookupEndpoint(tenantId, param(request, "name")),
  })),
});

app.http("endpointWipe", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/endpoints/{name}/wipe",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request);
    return { status: 202, jsonBody: await wipeEndpoint(tenantId, param(request, "name"), body.confirmDevice) };
  }),
});

app.http("endpointRegister", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/endpoints/{name}/register",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const body = await readJsonBody(request);
    return { status: 201, jsonBody: await registerEndpoint(tenantId, param(request, "name"), body.confirmDevice, body.groupTag) };
  }),
});

app.http("userPhoneVendorNotice", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/phoneVendorNotice",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    if (!phoneVendorSupported(tenantId)) throw new BadRequestError("Phone vendor notices are set up for Geaux Automotive only.");
    const body = await readJsonBody(request);
    const user = await fetchUserById(tenantId, param(request, "userId"));
    const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : user.companyName || "";
    const notice = buildNotice({
      personName: user.displayName,
      location,
      extension: body.extension ?? user.onPremisesExtensionAttributes?.extensionAttribute2 ?? "",
      status: body.status,
      effectiveDate: body.effectiveDate,
      newUserName: body.newUserName,
    });
    if (body.send !== true) return { status: 200, jsonBody: { preview: true, notice } };
    if (notice.confirmLocation && body.confirmLocation !== true) {
      throw new BadRequestError(`"${notice.location || "(blank)"}" is not a known Geaux location, so it routes to ${notice.vendor} by default. Confirm the vendor before sending.`);
    }
    const result = await sendNotice(tenantId, notice);
    return { status: result.sent ? 200 : 502, jsonBody: { preview: false, notice, ...result } };
  }),
});

app.http("kreweworksRequestUpdate", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/kreweworks/requests/{requestId}/updates",
  handler: withMspWriteAuth(async (request, caller, tenantId) => {
    const body = await readJsonBody(request);
    const result = await relayToKreweWorks(tenantId, { upn: caller.userPrincipalName, name: caller.userPrincipalName }, {
      requestId: param(request, "requestId"),
      items: body.items,
      itChecks: body.itChecks,
      note: body.note,
    });
    return { status: result.recorded ? 200 : 502, jsonBody: result };
  }),
});
