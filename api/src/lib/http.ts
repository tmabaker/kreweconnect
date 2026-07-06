/**
 * Shared HTTP plumbing for function routes: authentication, tenant
 * authorization, request-body parsing, and error → response mapping.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { authenticate, authorizeTenant, AuthError, type CallerContext } from "./authMiddleware";
import { TenantNotAuthorizedError } from "./tokenService";
import { GraphRequestError } from "./graphClient";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export type Handler = (
  request: HttpRequest,
  caller: CallerContext,
  tenantId: string
) => Promise<HttpResponseInit>;

/** Wraps a handler with authentication, tenant authorization, and error mapping. */
export function withAuth(handler: Handler) {
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
      if (err instanceof BadRequestError) {
        return { status: 400, jsonBody: { code: "bad_request", message: err.message } };
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

/**
 * Wraps a handler that changes directory state. On top of withAuth:
 * only MSP (NOIT) staff may call, and the target must be one concrete
 * tenant — never the "all" aggregate.
 */
export function withMspWriteAuth(handler: Handler) {
  return withAuth(async (request, caller, tenantId) => {
    if (!caller.isMspAdmin) {
      throw new AuthError("Write operations require an MSP admin.", 403);
    }
    if (tenantId === "all") {
      throw new BadRequestError("Write operations require a specific tenant, not 'all'.");
    }
    return handler(request, caller, tenantId);
  });
}

/** Parse and return the JSON request body as an object, or throw 400. */
export async function readJsonBody(request: HttpRequest): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}
