import { app } from "@azure/functions";
import { withAuth, withUserManageAuth, readJsonBody, BadRequestError } from "../lib/http";
import { GEAUX_TENANT_ID, deriveDmsUserId, newJobId, publicMatrix, resolveCDK, temporaryPassword } from "../lib/cdkMatrix";
import { getCDKJobStatus, submitCDKJob, type CDKJob } from "../lib/cdkQueue";

function text(body: Record<string, unknown>, key: string, required = true): string {
  const value = typeof body[key] === "string" ? String(body[key]).trim() : "";
  if (required && !value) throw new BadRequestError(key + " is required.");
  return value;
}

function geauxOnly(tenantId: string): void {
  if (tenantId.toLowerCase() !== GEAUX_TENANT_ID) {
    throw new BadRequestError("CDK provisioning is currently available only for Geaux Automotive.");
  }
}

app.http("cdkMatrix", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/cdk/matrix",
  handler: withAuth(async (_request, _caller, tenantId) => {
    geauxOnly(tenantId);
    return { status: 200, jsonBody: publicMatrix() };
  }),
});

app.http("cdkJobSubmit", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/cdk/jobs",
  handler: withUserManageAuth(async (request, caller, tenantId) => {
    geauxOnly(tenantId);
    const body = await readJsonBody(request);
    const operation = text(body, "operation") as CDKJob["operation"];
    if (!["add", "modify", "password", "disable"].includes(operation)) {
      throw new BadRequestError("operation must be add, modify, password, or disable.");
    }
    if (operation === "disable" && !caller.isMspAdmin) {
      return { status: 403, jsonBody: { code: "auth_error", message: "CDK disable requires a NOIT technician." } };
    }

    const upn = text(body, "upn").toLowerCase();
    const firstName = text(body, "firstName");
    const lastName = text(body, "lastName");
    const company = text(body, "company");
    const department = text(body, "department", false);
    const jobTitle = text(body, "jobTitle");
    const assignment = resolveCDK(company, department, jobTitle);

    if (!assignment.cdkRequired && operation !== "password" && operation !== "disable") {
      return {
        status: 409,
        jsonBody: {
          code: "cdk_not_authorized",
          message: assignment.note || "The CDK matrix does not authorize provisioning for this employee.",
          assignment,
        },
      };
    }
    if (assignment.reviewRequired && body.confirmReview !== true) {
      return {
        status: 409,
        jsonBody: {
          code: "cdk_review_required",
          message: assignment.note || "A NOIT technician must review this CDK assignment.",
          assignment,
        },
      };
    }
    if (assignment.reviewRequired && !caller.isMspAdmin) {
      return {
        status: 403,
        jsonBody: { code: "auth_error", message: "A review-gated CDK assignment requires a NOIT technician." },
      };
    }
    if (!assignment.store || !assignment.profile || !assignment.store.dmsCompany) {
      throw new BadRequestError("The selected CDK assignment is incomplete.");
    }

    const jobId = newJobId();
    const password = operation === "add" ? temporaryPassword() : undefined;
    const job: CDKJob = {
      id: jobId,
      operation,
      tenantId,
      requestedBy: caller.userPrincipalName || caller.userObjectId,
      submittedAt: new Date().toISOString(),
      matrixVersion: assignment.version,
      spec: {
        upn,
        firstName,
        lastName,
        dmsUserId: text(body, "dmsUserId", false) || deriveDmsUserId(firstName, lastName),
        storeId: assignment.store.storeId,
        dmsCompany: assignment.store.dmsCompany,
        profile: assignment.profile,
        accounts: assignment.accounts || [],
        roles: assignment.roles || [],
        employeeId: text(body, "employeeId", false),
        jobTitle,
      },
      ...(password ? { temporaryPassword: password } : {}),
    };

    await submitCDKJob(job);
    return {
      status: 202,
      jsonBody: {
        jobId,
        state: "queued",
        operation,
        assignment,
      },
    };
  }),
});

app.http("cdkJobStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "tenants/{tenantId}/cdk/jobs/{jobId}",
  handler: withUserManageAuth(async (request, _caller, tenantId) => {
    geauxOnly(tenantId);
    const jobId = String(request.params.jobId || "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new BadRequestError("Invalid CDK job id.");
    const status = await getCDKJobStatus(jobId);
    if (!status) return { status: 404, jsonBody: { code: "not_found", message: "CDK job not found." } };
    return { status: 200, jsonBody: status };
  }),
});
