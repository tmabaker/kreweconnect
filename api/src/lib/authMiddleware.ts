/**
 * Caller authentication and tenant authorization.
 *
 * The SPA sends its MSAL access token (audience api://{clientId}) as a
 * Bearer token. We validate the signature against the issuing tenant's
 * JWKS, then enforce the isolation rule:
 *
 *   - Callers from the MSP tenant (NOIT) may query any tenant.
 *   - All other callers may only query their own home tenant.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { HttpRequest } from "@azure/functions";
import { config } from "./config";

export interface CallerContext {
  /** Caller's home tenant (tid claim) */
  tenantId: string;
  /** Whether the caller is from the MSP (NOIT) tenant */
  isMspAdmin: boolean;
  userObjectId: string;
  userPrincipalName: string;
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

// JWKS sets cached per issuing tenant
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(tenantId: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(tenantId);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
    jwksCache.set(tenantId, jwks);
  }
  return jwks;
}

function decodePayloadUnverified(token: string): JWTPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("Malformed bearer token.");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new AuthError("Malformed bearer token payload.");
  }
}

export async function authenticate(request: HttpRequest): Promise<CallerContext> {
  // Static Web Apps overwrites the Authorization header with its own
  // platform token before the request reaches managed functions, so the
  // SPA sends the user's token in X-KreweConnect-Auth instead. Plain
  // Authorization is still honored for direct/local calls.
  const authHeader =
    request.headers.get("x-kreweconnect-auth") ||
    request.headers.get("authorization") ||
    "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    throw new AuthError("Missing bearer token.");
  }
  const token = authHeader.slice(7).trim();

  // Peek at the tid claim to know which tenant's keys verify this token
  // (multi-tenant app: tokens are issued by each caller's home tenant).
  const unverified = decodePayloadUnverified(token);
  const tid = typeof unverified.tid === "string" ? unverified.tid : "";
  if (!tid) throw new AuthError("Token missing tid claim.");

  const expectedIssuers = [
    `https://sts.windows.net/${tid}/`, // v1.0 access tokens
    `https://login.microsoftonline.com/${tid}/v2.0`, // v2.0 access tokens
  ];
  // Only accept access tokens minted for our API's App ID URI. The bare
  // clientId is intentionally NOT accepted: ID tokens carry aud == clientId,
  // and an ID token is not authorization to call the API. The SPA requests
  // `api://{clientId}/access_as_user`, so a valid access token has
  // aud == `api://{clientId}`.
  const expectedAudiences = [`api://${config.clientId}`];

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, getJwks(tid), {
      issuer: expectedIssuers,
      audience: expectedAudiences,
    });
    payload = result.payload;
  } catch (err) {
    throw new AuthError(
      `Token validation failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  // Beyond a valid signature/issuer/audience, require that the token actually
  // authorizes this API. Delegated user tokens (the SPA flow) carry a space-
  // delimited `scp` claim that must include `access_as_user`. App-only
  // (client-credentials) tokens carry `roles` instead of `scp`; accept those
  // only when they present at least one app role. A token with neither — most
  // importantly an ID token that slipped through — is rejected.
  const scopes =
    typeof payload.scp === "string"
      ? payload.scp.split(" ")
      : Array.isArray(payload.scp)
        ? (payload.scp as string[])
        : [];
  const appRoles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
  const hasDelegatedScope = scopes.includes("access_as_user");
  const hasAppRole = appRoles.length > 0;
  if (!hasDelegatedScope && !hasAppRole) {
    throw new AuthError(
      "Token is not authorized for this API (missing access_as_user scope).",
      403
    );
  }

  return {
    tenantId: tid,
    isMspAdmin: tid.toLowerCase() === config.mspTenantId.toLowerCase(),
    userObjectId: typeof payload.oid === "string" ? payload.oid : "",
    userPrincipalName:
      typeof payload.upn === "string"
        ? payload.upn
        : typeof payload.preferred_username === "string"
          ? payload.preferred_username
          : "",
  };
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve and authorize the target tenant for a request.
 * "home" (or the caller's own tid) is always allowed; anything else
 * requires the caller to be an MSP admin.
 */
export function authorizeTenant(caller: CallerContext, requestedTenantId: string): string {
  // "all" — MSP-admin-only aggregate across configured client tenants.
  if (requestedTenantId === "all") {
    if (!caller.isMspAdmin) {
      throw new AuthError("Not authorized to view all tenants.", 403);
    }
    return "all";
  }

  const target =
    !requestedTenantId || requestedTenantId === "home"
      ? caller.tenantId
      : requestedTenantId;

  if (!GUID_RE.test(target)) {
    throw new AuthError(`Invalid tenant ID: ${target}`, 400);
  }
  if (target.toLowerCase() !== caller.tenantId.toLowerCase() && !caller.isMspAdmin) {
    throw new AuthError("Not authorized to access this tenant.", 403);
  }
  return target;
}
