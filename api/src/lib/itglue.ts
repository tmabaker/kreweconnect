/**
 * Optional IT Glue integration for saving credentials. Config-gated: does
 * nothing unless ITGLUE_API_KEY and a tenant→organization mapping are set,
 * so the rest of the API works whether or not IT Glue is wired up.
 *
 * App settings:
 *   ITGLUE_API_KEY   — IT Glue API key (x-api-key header)
 *   ITGLUE_BASE_URL  — defaults to https://api.itglue.com (use the EU host if applicable)
 *   ITGLUE_ORG_MAP   — JSON object mapping tenantId → IT Glue organization id,
 *                      e.g. {"6444fec1-...":"1234567"}
 */

import { config } from "./config";

export class ItGlueError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ItGlueError";
    this.status = status;
  }
}

export function itGlueConfigured(): boolean {
  return Boolean(config.itGlueApiKey);
}

export interface ItGlueSaveInput {
  tenantId: string;
  name: string;
  username: string;
  password: string;
  notes?: string;
}

/** Create a Password record in IT Glue under the tenant's mapped organization. */
export async function savePasswordToItGlue(
  input: ItGlueSaveInput
): Promise<{ id: string }> {
  const apiKey = config.itGlueApiKey;
  if (!apiKey) {
    throw new ItGlueError("IT Glue is not configured (ITGLUE_API_KEY app setting is missing).");
  }
  const orgId = config.itGlueOrgFor(input.tenantId);
  if (!orgId) {
    throw new ItGlueError(
      `No IT Glue organization is mapped for tenant ${input.tenantId} (set ITGLUE_ORG_MAP).`
    );
  }

  const payload = {
    data: {
      type: "passwords",
      attributes: {
        "organization-id": Number(orgId),
        name: input.name,
        username: input.username,
        password: input.password,
        notes: input.notes || "",
      },
    },
  };

  const response = await fetch(`${config.itGlueBaseUrl}/passwords`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ItGlueError(`IT Glue save failed: ${response.status} ${text.slice(0, 300)}`, response.status);
  }
  const body = (await response.json().catch(() => ({}))) as { data?: { id?: string } };
  return { id: body.data?.id || "" };
}
