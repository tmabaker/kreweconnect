import { randomUUID } from "node:crypto";
import { app } from "@azure/functions";
import { withAuth, withUserManageAuth, readJsonBody, BadRequestError } from "../lib/http";
import { GEAUX_TENANT_ID } from "../lib/cdkMatrix";
import { getVendorJobStatus, submitVendorJob, type VendorLifecycleJob } from "../lib/vendorQueue";

function value(body: Record<string, unknown>, key: string, required = true): string {
  const result = typeof body[key] === "string" ? String(body[key]).trim() : "";
  if (required && !result) throw new BadRequestError(key + " is required.");
  return result;
}

function geauxOnly(tenantId: string): void {
  if (tenantId.toLowerCase() !== GEAUX_TENANT_ID) {
    throw new BadRequestError("Vendor lifecycle automation is currently available only for Geaux Automotive.");
  }
}

app.http("vendorLifecycleSubmit", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/vendor-lifecycle/jobs",
  handler: withUserManageAuth(async (request, caller, tenantId) => {
    geauxOnly(tenantId);
    const body = await readJsonBody(request);
    const operation = value(body, "operation") as VendorLifecycleJob["operation"];
    if (!["add", "modify", "disable"].includes(operation)) {
      throw new BadRequestError("operation must be add, modify, or disable.");
    }
    if (operation === "disable" && !caller.isMspAdmin) {
      return { status: 403, jsonBody: { code: "auth_error", message: "Vendor disable requires a NOIT technician." } };
    }
    const job: VendorLifecycleJob = {
      id: randomUUID(),
      operation,
      tenantId,
      requestedBy: caller.userPrincipalName || caller.userObjectId,
      submittedAt: new Date().toISOString(),
      spec: {
        upn: value(body, "upn").toLowerCase(),
        firstName: value(body, "firstName"),
        lastName: value(body, "lastName"),
        company: value(body, "company"),
        department: value(body, "department", false),
        jobTitle: value(body, "jobTitle"),
        mobilePhone: value(body, "mobilePhone", false),
        employeeId: value(body, "employeeId", false),
      },
    };
    await submitVendorJob(job);
    return {
      status: 202,
      jsonBody: { jobId: job.id, state: "queued", operation, components: ["driveCentric", "routeOne"] },
    };
  }),
});

app.http("vendorLifecycleStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/vendor-lifecycle/jobs/{jobId}",
  handler: withAuth(async (request, _caller, tenantId) => {
    geauxOnly(tenantId);
    const jobId = String(request.params.jobId || "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new BadRequestError("Invalid vendor lifecycle job id.");
    const status = await getVendorJobStatus(jobId);
    if (!status) return { status: 404, jsonBody: { code: "not_found", message: "Vendor lifecycle job not found." } };
    return { status: 200, jsonBody: status };
  }),
});
