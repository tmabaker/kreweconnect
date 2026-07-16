/**
 * CAP Config — travel Conditional Access plans (the OOO & Vacation "CAP
 * Config" tool).
 *
 * Clients run CA policies that block sign-ins from outside the country.
 * When a user travels, the tech stages a travel plan:
 *
 *   - a per-user countryNamedLocation with the home country + destinations
 *   - a per-user CA policy named "<User Name> - <start> - <end>" (ISO dates)
 *     that BLOCKS sign-ins from everywhere except that named location —
 *     created disabled, enabled on the start date
 *   - on the start date the user is excluded from the tech-selected existing
 *     CA policies; on the day after the end date everything is undone
 *     (exclusions removed, policy + named location deleted)
 *
 * Plan metadata (which policies to exclude from, ids of the created objects,
 * status) lives in a Graph open extension on the user object — no external
 * storage. The scheduler is a daily GitHub Actions run that calls the sweep
 * endpoint per tenant; sweeps find plans by the parseable policy name.
 *
 * Requires Policy.Read.All + Policy.ReadWrite.ConditionalAccess (declared on
 * the app; granted per tenant via admin consent) and User.ReadWrite.All for
 * the open extension.
 */

import { graphRequest, fetchUserById } from "./graphClient";
import { setCaExclusion } from "./userAdmin";
import { BadRequestError } from "./http";

const EXTENSION_NAME = "com.noitgroup.caTravelPlan";
// "<anything> - YYYY-MM-DD - YYYY-MM-DD"
const TRAVEL_NAME_RE = /^(.+) - (\d{4}-\d{2}-\d{2}) - (\d{4}-\d{2}-\d{2})$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── shapes ─────────────────────────────────────────────────────────── */

interface CaPolicyFull {
  id: string;
  displayName: string;
  state: string;
  conditions: {
    users?: {
      includeUsers?: string[];
      excludeUsers?: string[];
      includeGroups?: string[];
      excludeGroups?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface ApplicablePolicy {
  id: string;
  displayName: string;
  state: string;
  alreadyExcluded: boolean;
}

export interface TravelPlanInput {
  startDate: string;
  endDate: string;
  /** ISO 3166-1 alpha-2 codes the user is visiting. */
  countries: string[];
  /** Home country kept allowed in the travel policy; defaults to US. */
  homeCountry?: string;
  /** Existing CA policy ids to exclude the user from for the trip. */
  excludePolicyIds: string[];
}

export interface TravelPlan {
  userId: string;
  userName: string;
  policyName: string;
  travelPolicyId: string;
  namedLocationId: string;
  startDate: string;
  endDate: string;
  countries: string[];
  excludePolicyIds: string[];
  status: "pending" | "active";
}

interface PlanExtension {
  id?: string;
  startDate: string;
  endDate: string;
  countries: string;
  travelPolicyId: string;
  namedLocationId: string;
  excludePolicyIds: string;
  status: "pending" | "active";
}

/* ── applicability (the checkbox list) ──────────────────────────────── */

/**
 * CA policies this user is currently subject to — i.e. would need an
 * exclusion for travel. Travel policies created by this tool are filtered
 * out of the list.
 */
export async function listApplicableCaPolicies(
  tenantId: string,
  userId: string
): Promise<ApplicablePolicy[]> {
  const [policies, groupsResp] = await Promise.all([
    graphRequest<{ value: CaPolicyFull[] }>(
      tenantId,
      "GET",
      "/identity/conditionalAccess/policies"
    ),
    graphRequest<{ value: Array<{ id: string }> }>(
      tenantId,
      "GET",
      `/users/${encodeURIComponent(userId)}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`
    ),
  ]);
  const groupIds = new Set((groupsResp?.value ?? []).map((g) => g.id.toLowerCase()));
  const uid = userId.toLowerCase();

  const result: ApplicablePolicy[] = [];
  for (const p of policies?.value ?? []) {
    if (TRAVEL_NAME_RE.test(p.displayName)) continue; // this tool's own policies
    const users = p.conditions?.users ?? {};
    const includeUsers = (users.includeUsers ?? []).map((u) => u.toLowerCase());
    const includeGroups = (users.includeGroups ?? []).map((g) => g.toLowerCase());
    const excludeUsers = (users.excludeUsers ?? []).map((u) => u.toLowerCase());
    const excludeGroups = (users.excludeGroups ?? []).map((g) => g.toLowerCase());

    const included =
      includeUsers.includes("all") ||
      includeUsers.includes(uid) ||
      includeGroups.some((g) => groupIds.has(g));
    if (!included) continue;
    const excludedByGroup = excludeGroups.some((g) => groupIds.has(g));
    if (excludedByGroup) continue; // already out of scope via group; nothing to manage
    result.push({
      id: p.id,
      displayName: p.displayName,
      state: p.state,
      alreadyExcluded: excludeUsers.includes(uid),
    });
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/* ── plan storage (open extension on the user) ──────────────────────── */

async function readPlanExtension(tenantId: string, userId: string): Promise<PlanExtension | null> {
  try {
    const ext = await graphRequest<PlanExtension>(
      tenantId,
      "GET",
      `/users/${encodeURIComponent(userId)}/extensions/${EXTENSION_NAME}`
    );
    return ext ?? null;
  } catch {
    return null;
  }
}

async function deletePlanExtension(tenantId: string, userId: string): Promise<void> {
  await graphRequest(
    tenantId,
    "DELETE",
    `/users/${encodeURIComponent(userId)}/extensions/${EXTENSION_NAME}`
  ).catch(() => undefined);
}

/* ── create ─────────────────────────────────────────────────────────── */

export async function createTravelPlan(
  tenantId: string,
  userId: string,
  input: TravelPlanInput
): Promise<TravelPlan> {
  if (!ISO_DATE_RE.test(input.startDate) || !ISO_DATE_RE.test(input.endDate)) {
    throw new BadRequestError("startDate and endDate must be YYYY-MM-DD.");
  }
  if (input.endDate < input.startDate) {
    throw new BadRequestError("endDate must be on or after startDate.");
  }
  if (input.endDate < todayUtc()) {
    throw new BadRequestError("endDate is in the past.");
  }
  const countries = (input.countries ?? []).map((c) => c.toUpperCase().trim());
  if (countries.length === 0 || countries.some((c) => !COUNTRY_RE.test(c))) {
    throw new BadRequestError("countries must be a non-empty list of ISO 3166-1 alpha-2 codes.");
  }
  const homeCountry = (input.homeCountry || "US").toUpperCase().trim();
  if (!COUNTRY_RE.test(homeCountry)) {
    throw new BadRequestError("homeCountry must be an ISO 3166-1 alpha-2 code.");
  }
  const excludePolicyIds = input.excludePolicyIds ?? [];

  const existing = await readPlanExtension(tenantId, userId);
  if (existing) {
    throw new BadRequestError(
      `This user already has a travel plan (${existing.startDate} – ${existing.endDate}). End it first, then create the new one.`
    );
  }

  const user = await fetchUserById(tenantId, userId);
  const userName = user.displayName || user.userPrincipalName;
  const policyName = `${userName} - ${input.startDate} - ${input.endDate}`;

  const allowedCountries = Array.from(new Set([homeCountry, ...countries]));
  const location = await graphRequest<{ id: string }>(
    tenantId,
    "POST",
    "/identity/conditionalAccess/namedLocations",
    {
      "@odata.type": "#microsoft.graph.countryNamedLocation",
      displayName: `Travel - ${policyName}`,
      countriesAndRegions: allowedCountries,
      includeUnknownCountriesAndRegions: false,
    }
  );
  if (!location?.id) throw new BadRequestError("Could not create the travel named location.");

  let policy: { id: string } | null = null;
  try {
    // A freshly created named location can take a few seconds to replicate
    // before CA policies may reference it (Graph error 1040) — retry briefly.
    for (let attempt = 0; attempt < 7; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 4000));
      try {
        policy = await graphRequest<{ id: string }>(
          tenantId,
          "POST",
          "/identity/conditionalAccess/policies",
          {
            displayName: policyName,
            state: "disabled",
            conditions: {
              users: { includeUsers: [userId] },
              applications: { includeApplications: ["All"] },
              locations: { includeLocations: ["All"], excludeLocations: [location.id] },
              clientAppTypes: ["all"],
            },
            grantControls: { operator: "OR", builtInControls: ["block"] },
          }
        );
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/NamedLocation with id .* does not exist/i.test(msg) || attempt === 6) throw err;
      }
    }
  } finally {
    if (!policy?.id) {
      // Roll the location back so a failed create leaves nothing behind.
      await graphRequest(
        tenantId,
        "DELETE",
        `/identity/conditionalAccess/namedLocations/${location.id}`
      ).catch(() => undefined);
    }
  }
  if (!policy?.id) throw new BadRequestError("Could not create the travel CA policy.");

  const plan: TravelPlan = {
    userId,
    userName,
    policyName,
    travelPolicyId: policy.id,
    namedLocationId: location.id,
    startDate: input.startDate,
    endDate: input.endDate,
    countries,
    excludePolicyIds,
    status: "pending",
  };
  await graphRequest(tenantId, "POST", `/users/${encodeURIComponent(userId)}/extensions`, {
    "@odata.type": "#microsoft.graph.openTypeExtension",
    extensionName: EXTENSION_NAME,
    startDate: plan.startDate,
    endDate: plan.endDate,
    countries: countries.join(","),
    travelPolicyId: plan.travelPolicyId,
    namedLocationId: plan.namedLocationId,
    excludePolicyIds: excludePolicyIds.join(","),
    status: "pending",
  });

  // Travel starting today (or already started): activate right away instead
  // of waiting for the overnight sweep.
  if (input.startDate <= todayUtc()) {
    await activatePlan(tenantId, plan);
    plan.status = "active";
  }
  return plan;
}

/* ── activate / teardown ────────────────────────────────────────────── */

async function activatePlan(
  tenantId: string,
  plan: Pick<TravelPlan, "userId" | "travelPolicyId" | "excludePolicyIds">
): Promise<void> {
  for (const policyId of plan.excludePolicyIds) {
    await setCaExclusion(tenantId, policyId, plan.userId, "add");
  }
  await graphRequest(
    tenantId,
    "PATCH",
    `/identity/conditionalAccess/policies/${plan.travelPolicyId}`,
    { state: "enabled" }
  );
  await graphRequest(
    tenantId,
    "PATCH",
    `/users/${encodeURIComponent(plan.userId)}/extensions/${EXTENSION_NAME}`,
    { status: "active" }
  ).catch(() => undefined);
}

async function teardownPlan(
  tenantId: string,
  plan: Pick<TravelPlan, "userId" | "travelPolicyId" | "namedLocationId" | "excludePolicyIds">
): Promise<void> {
  for (const policyId of plan.excludePolicyIds) {
    await setCaExclusion(tenantId, policyId, plan.userId, "remove").catch(() => undefined);
  }
  await graphRequest(
    tenantId,
    "DELETE",
    `/identity/conditionalAccess/policies/${plan.travelPolicyId}`
  ).catch(() => undefined);
  await graphRequest(
    tenantId,
    "DELETE",
    `/identity/conditionalAccess/namedLocations/${plan.namedLocationId}`
  ).catch(() => undefined);
  await deletePlanExtension(tenantId, plan.userId);
}

/* ── list / cancel / sweep ──────────────────────────────────────────── */

function planFromExtension(userId: string, userName: string, ext: PlanExtension): TravelPlan {
  return {
    userId,
    userName,
    policyName: `${userName} - ${ext.startDate} - ${ext.endDate}`,
    travelPolicyId: ext.travelPolicyId,
    namedLocationId: ext.namedLocationId,
    startDate: ext.startDate,
    endDate: ext.endDate,
    countries: (ext.countries || "").split(",").filter(Boolean),
    excludePolicyIds: (ext.excludePolicyIds || "").split(",").filter(Boolean),
    status: ext.status === "active" ? "active" : "pending",
  };
}

/** Travel plans in a tenant, discovered from the parseable policy names. */
export async function listTravelPlans(tenantId: string): Promise<TravelPlan[]> {
  const policies = await graphRequest<{ value: CaPolicyFull[] }>(
    tenantId,
    "GET",
    "/identity/conditionalAccess/policies"
  );
  const plans: TravelPlan[] = [];
  for (const p of policies?.value ?? []) {
    const m = TRAVEL_NAME_RE.exec(p.displayName);
    if (!m) continue;
    const userId = p.conditions?.users?.includeUsers?.[0];
    if (!userId || userId.toLowerCase() === "all") continue;
    const ext = await readPlanExtension(tenantId, userId);
    if (ext && ext.travelPolicyId === p.id) {
      plans.push(planFromExtension(userId, m[1], ext));
    } else {
      // Orphaned travel policy (extension missing) — still show it so a tech
      // can end it; teardown will clean what it can.
      plans.push({
        userId,
        userName: m[1],
        policyName: p.displayName,
        travelPolicyId: p.id,
        namedLocationId: "",
        startDate: m[2],
        endDate: m[3],
        countries: [],
        excludePolicyIds: [],
        status: p.state === "enabled" ? "active" : "pending",
      });
    }
  }
  return plans.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** End a user's travel plan now (remove exclusions, delete policy + location). */
export async function cancelTravelPlan(tenantId: string, userId: string): Promise<TravelPlan> {
  const ext = await readPlanExtension(tenantId, userId);
  if (!ext) {
    // Fall back to policy discovery so orphans can still be cleaned up.
    const plans = await listTravelPlans(tenantId);
    const plan = plans.find((p) => p.userId.toLowerCase() === userId.toLowerCase());
    if (!plan) throw new BadRequestError("This user has no travel plan.");
    await teardownPlan(tenantId, plan);
    return plan;
  }
  const user = await fetchUserById(tenantId, userId);
  const plan = planFromExtension(userId, user.displayName || user.userPrincipalName, ext);
  await teardownPlan(tenantId, plan);
  return plan;
}

export interface SweepAction {
  policyName: string;
  action: "activated" | "removed" | "none";
  detail?: string;
}

/**
 * Date-driven pass over a tenant's travel plans: activate plans whose start
 * date has arrived, tear down plans past their end date. Called by the daily
 * GitHub Actions runner (and harmless to call any number of times).
 */
export async function sweepTravelPlans(tenantId: string): Promise<SweepAction[]> {
  const today = todayUtc();
  const actions: SweepAction[] = [];
  for (const plan of await listTravelPlans(tenantId)) {
    try {
      if (plan.endDate < today) {
        await teardownPlan(tenantId, plan);
        actions.push({ policyName: plan.policyName, action: "removed" });
      } else if (plan.status === "pending" && plan.startDate <= today) {
        await activatePlan(tenantId, plan);
        actions.push({ policyName: plan.policyName, action: "activated" });
      } else {
        actions.push({ policyName: plan.policyName, action: "none" });
      }
    } catch (err) {
      actions.push({
        policyName: plan.policyName,
        action: "none",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return actions;
}
