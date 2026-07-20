/**
 * CAP Config routes — travel Conditional Access plans (techtools page).
 * All MSP-staff-only.
 *
 *   GET    /api/tenants/{tenantId}/users/{userId}/applicableCaPolicies
 *   POST   /api/tenants/{tenantId}/users/{userId}/travelPlan
 *   DELETE /api/tenants/{tenantId}/users/{userId}/travelPlan   — end now
 *   GET    /api/tenants/{tenantId}/travelPlans
 *   POST   /api/tenants/{tenantId}/travelPlans/sweep           — daily runner
 *
 * NOTE: each route template is registered exactly once (methods merged and
 * dispatched in the handler) — duplicate templates get shadowed behind SWA.
 */

import { app, type HttpRequest } from "@azure/functions";
import { withMspWriteAuth, readJsonBody, BadRequestError } from "../lib/http";
import {
  listApplicableCaPolicies,
  createTravelPlan,
  cancelTravelPlan,
  listTravelPlans,
  sweepTravelPlans,
  type TravelPlanInput,
} from "../lib/caTravel";

function requireParam(request: HttpRequest, name: string): string {
  const value = request.params[name];
  if (!value) throw new BadRequestError(`Missing route parameter: ${name}`);
  return value;
}

app.http("caTravelApplicablePolicies", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/applicableCaPolicies",
  handler: withMspWriteAuth(async (request, _caller, tenantId) => {
    const policies = await listApplicableCaPolicies(tenantId, requireParam(request, "userId"));
    return { status: 200, jsonBody: { value: policies } };
  }),
});

const createPlanHandler = withMspWriteAuth(async (request, _caller, tenantId) => {
  const body = await readJsonBody(request);
  const plan = await createTravelPlan(
    tenantId,
    requireParam(request, "userId"),
    body as unknown as TravelPlanInput
  );
  return { status: 201, jsonBody: plan };
});

const cancelPlanHandler = withMspWriteAuth(async (request, _caller, tenantId) => {
  const { plan, warnings } = await cancelTravelPlan(tenantId, requireParam(request, "userId"));
  return { status: 200, jsonBody: { ended: warnings.length === 0, warnings, plan } };
});

app.http("caTravelPlan", {
  methods: ["POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/users/{userId}/travelPlan",
  handler: (request, context) =>
    request.method === "DELETE"
      ? cancelPlanHandler(request, context)
      : createPlanHandler(request, context),
});

app.http("caTravelPlanList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/travelPlans",
  handler: withMspWriteAuth(async (_request, _caller, tenantId) => {
    const plans = await listTravelPlans(tenantId);
    return { status: 200, jsonBody: { value: plans } };
  }),
});

app.http("caTravelSweep", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/travelPlans/sweep",
  handler: withMspWriteAuth(async (_request, _caller, tenantId) => {
    const actions = await sweepTravelPlans(tenantId);
    return { status: 200, jsonBody: { tenantId, actions } };
  }),
});
