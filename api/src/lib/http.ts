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

/**
 * Cross-origin support. The static techtools portal pages (served from a
 * different origin than this SWA) call these routes with the signed-in
 * tech's Entra token. Allowed origins come from CORS_ALLOWED_ORIGINS
 * (comma-separated); the tech-portal custom domain + its SWA host are the
 * defaults. Requests from the same origin as the API (the KreweConnect SPA)
 * don't need CORS and are unaffected.
 */
function allowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (raw) {
    return raw
      .split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }
  return [
    "https://techtools.noitgroup.com",
    "https://witty-coast-02d8d4d0f.2.azurestaticapps.net",
  ];
}

/** CORS headers to reflect back for an allowed Origin, or {} if not allowed. */
function corsHeaders(request: HttpRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin.replace(/\/$/, ""))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,X-KreweConnect-Auth,Content-Type",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

export type Handler = (
  request: HttpRequest,
  caller: CallerContext,
  tenantId: string
) => Promise<HttpResponseInit>;

/** Wraps a handler with CORS, authentication, tenant authorization, and error mapping. */
export function withAuth(handler: Handler) {
  return async (
    request: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> => {
    const cors = corsHeaders(request);
    // Preflight: answer before auth so the browser can send the real request.
    if (request.method === "OPTIONS") {
      return { status: 204, headers: cors };
    }
    const withCors = (resp: HttpResponseInit): HttpResponseInit => ({
      ...resp,
      headers: { ...(resp.headers as Record<string, string> | undefined), ...cors },
    });
    try {
      const caller = await authenticate(request);
      const tenantId = authorizeTenant(caller, request.params.tenantId || "home");
      return withCors(await handler(request, caller, tenantId));
    } catch (err) {
      return withCors(mapError(err, context));
    }
  };
}

/** Map a thrown error to an HTTP response (shared by withAuth). */
function mapError(err: unknown, context: InvocationContext): HttpResponseInit {
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
