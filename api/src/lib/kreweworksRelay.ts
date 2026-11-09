/**
 * Records Tech Tools work on the client's KreweWorks request, so the
 * offboarding request page shows each step as it is done.
 *
 * KreweWorks runs as its own Static Web App per client with its own sign in,
 * so the suite calls the portal's service route with a shared key
 * (KREWEWORKS_SERVICE_KEY here, PORTAL_SERVICE_KEY there) and names the tech
 * who did the work. The portal only appends to the timeline and ticks IT
 * checks; it never completes or closes a request on this route.
 */

import { config } from "./config";
import { BadRequestError, ServiceUnavailableError } from "./http";

export interface RelayItem { text: string; ok: boolean }

export interface RelayInput {
  requestId: unknown;
  items: unknown;
  itChecks?: unknown;
  note?: unknown;
}

export interface RelayResult {
  recorded: boolean;
  requestId: string;
  stage?: string;
  checksSet?: string[];
  detail: string;
}

const REQUEST_ID = /^[HCT]-[A-Za-z0-9-]{3,40}$/;
const CHECK_KEY = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

export function normalizeRelay(input: RelayInput): { requestId: string; items: RelayItem[]; itChecks: string[]; note: string } {
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  if (!REQUEST_ID.test(requestId)) throw new BadRequestError("A KreweWorks request reference (like T-ABC123) is required.");
  const items = (Array.isArray(input.items) ? input.items : [])
    .map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>) : {}))
    .filter((i) => typeof i.text === "string" && i.text.trim())
    .slice(0, 40)
    .map((i) => ({ text: String(i.text).replace(/[\r\n]+/g, " ").trim().slice(0, 400), ok: i.ok === true }));
  if (!items.length) throw new BadRequestError("Nothing to record: items is empty.");
  const itChecks = (Array.isArray(input.itChecks) ? input.itChecks : [])
    .filter((k): k is string => typeof k === "string" && CHECK_KEY.test(k))
    .slice(0, 20);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) : "";
  return { requestId, items, itChecks, note };
}

export async function relayToKreweWorks(
  tenantId: string,
  actor: { upn: string; name: string },
  input: RelayInput
): Promise<RelayResult> {
  const body = normalizeRelay(input);
  const portal = config.kreweworksPortals.find((p) => p.tenantId === tenantId.toLowerCase());
  if (!portal) throw new BadRequestError("This tenant has no KreweWorks portal.");
  if (!config.kreweworksServiceKey) {
    throw new ServiceUnavailableError("KREWEWORKS_SERVICE_KEY is not set on the API, so the request page cannot be updated.");
  }
  const response = await fetch(`${portal.url}/api/service/requests/${encodeURIComponent(body.requestId)}/techtools`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-KreweWorks-Service-Key": config.kreweworksServiceKey },
    body: JSON.stringify({ actor: { upn: actor.upn, name: actor.name }, items: body.items, itChecks: body.itChecks, note: body.note }),
    // The portal's sign-in rules turn some refusals into a redirect to a login page that answers 200.
    // Never follow one: only the portal's own JSON reply, naming the event it wrote, counts as recorded.
    redirect: "manual",
  });
  const reply = (await response.json().catch(() => ({}))) as { stage?: string; checksSet?: string[]; eventId?: string; error?: string; message?: string };
  if (response.ok && !reply.eventId) {
    return { recorded: false, requestId: body.requestId, detail: `KreweWorks answered HTTP ${response.status} without recording the update. Check PORTAL_SERVICE_KEY on the portal.` };
  }
  if (!response.ok) {
    return { recorded: false, requestId: body.requestId, detail: `KreweWorks refused the update with HTTP ${response.status}${reply.error || reply.message ? `: ${reply.error || reply.message}` : "."}` };
  }
  return { recorded: true, requestId: body.requestId, stage: reply.stage, checksSet: reply.checksSet || [], detail: `Request ${body.requestId} updated.` };
}
