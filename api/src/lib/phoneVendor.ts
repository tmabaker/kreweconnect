/**
 * Phone vendor notices for Geaux extension changes, sent from
 * support@geauxautomotive.com.
 *
 * Routing is by the user's companyName (the location of record in this
 * tenant). Four stores sit with one vendor and every other location with the
 * other (Tammy, 2026-09-21, restated 2026-11-09). An unrecognized location
 * goes to the default vendor flagged confirmLocation, so the routing is a
 * decision and never an accident.
 *
 * The message carries a name, a location, an extension and the change of
 * status, plus Tammy's standing request that the voicemail password be reset
 * to the extension number. It carries no account password, employee id or
 * tenant identifier: the vendor is outside NOIT and outside the client.
 */

import { config } from "./config";
import { BadRequestError, ServiceUnavailableError } from "./http";
import { getMailSendToken } from "./credentialDelivery";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GEAUX_TENANT_ID = "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa";

export interface VendorRoute {
  vendor: string;
  email: string;
  location: string;
  confirmLocation: boolean;
}

/**
 * Vendor contacts live in the GEAUX_PHONE_VENDORS app setting, not in this
 * public repository:
 *   {"default": {"vendor": "...", "email": "..."},
 *    "overrides": [{"vendor": "...", "email": "...", "locations": ["Volvo - Baton Rouge", ...]}]}
 * The source of truth for the values is the device connector's Geaux client
 * file in the private noit-techtools repo.
 */
interface VendorConfig { default: { vendor: string; email: string }; overrides: Array<{ vendor: string; email: string; locations: string[] }> }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function vendorConfig(): VendorConfig | null {
  try {
    const raw = JSON.parse(process.env.GEAUX_PHONE_VENDORS || "null");
    if (!raw || !raw.default || !EMAIL.test(String(raw.default.email || ""))) return null;
    const overrides = (Array.isArray(raw.overrides) ? raw.overrides : [])
      .filter((o: { email?: string; locations?: unknown }) => EMAIL.test(String(o.email || "")) && Array.isArray(o.locations))
      .map((o: { vendor?: string; email: string; locations: unknown[] }) => ({ vendor: String(o.vendor || o.email), email: o.email, locations: o.locations.map(String) }));
    return { default: { vendor: String(raw.default.vendor || raw.default.email), email: raw.default.email }, overrides };
  } catch {
    return null;
  }
}

const KNOWN_LOCATIONS = [
  "Geaux Automotive - Corporate",
  "Geaux Automotive IT",
  "Geaux CDJR - Denham Springs",
  "Geaux CDJR - Plaquemine",
  "Geaux Chevrolet - Laplace",
  "Geaux Chevrolet - West",
  "Geaux Ford - Denham Springs",
  "Geaux Ford - Waveland",
  "Geaux SuperCenter - Baton Rouge",
  "Gulf Auto Direct - Waveland",
  "Express Chevrolet - Brownsville",
  "Express Chevrolet - Dyersburg",
  "Express Chevrolet - Terry",
  "Volvo - Baton Rouge",
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function phoneVendorSupported(tenantId: string): boolean {
  return tenantId.toLowerCase() === GEAUX_TENANT_ID;
}

export function routeVendor(location: string): VendorRoute {
  const cfg = vendorConfig();
  if (!cfg) throw new ServiceUnavailableError("GEAUX_PHONE_VENDORS is not set on the API, so the phone vendor cannot be chosen.");
  const loc = (location || "").trim();
  const hit = cfg.overrides.find((o) => o.locations.some((l) => norm(l) === norm(loc)));
  const known = KNOWN_LOCATIONS.some((l) => norm(l) === norm(loc));
  const v = hit || cfg.default;
  return { vendor: v.vendor, email: v.email, location: loc, confirmLocation: !known };
}

export type PhoneStatus = "departure" | "reassign" | "new-hire";
const STATUSES: PhoneStatus[] = ["departure", "reassign", "new-hire"];

export interface NoticeInput {
  personName: string;
  location: string;
  extension: unknown;
  status: unknown;
  effectiveDate?: unknown;
  newUserName?: unknown;
}

export interface Notice {
  to: string;
  vendor: string;
  location: string;
  confirmLocation: boolean;
  from: string;
  subject: string;
  body: string;
  extension: string;
  status: PhoneStatus;
}

function plainName(v: unknown, field: string, required: boolean): string {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!s) {
    if (required) throw new BadRequestError(`${field} is required.`);
    return "";
  }
  if (s.length > 120 || /[<>\r\n]/.test(s)) throw new BadRequestError(`${field} is not a valid name.`);
  return s;
}

function friendlyDate(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestError("effectiveDate must be YYYY-MM-DD.");
  return new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function buildNotice(input: NoticeInput): Notice {
  const extension = typeof input.extension === "string" || typeof input.extension === "number" ? String(input.extension).trim() : "";
  if (!/^[0-9]{2,6}$/.test(extension)) throw new BadRequestError("The extension must be 2 to 6 digits.");
  const status = (STATUSES as string[]).includes(String(input.status)) ? (input.status as PhoneStatus) : null;
  if (!status) throw new BadRequestError("status must be departure, reassign or new-hire.");
  const person = plainName(input.personName, "The employee name", true);
  const newUser = plainName(input.newUserName, "The new user name", status !== "departure");
  const when = friendlyDate(input.effectiveDate);
  const route = routeVendor(input.location);
  const at = route.location || "our location";

  const statusLine = {
    departure: `${person} is no longer with Geaux Automotive${when ? ` as of ${when}` : ""}. Please remove ${person}'s name from extension ${extension} at ${at}.`,
    reassign: `Extension ${extension} at ${at} is moving from ${person} to ${newUser}${when ? `, effective ${when}` : ""}. Please update the name on the extension and the phone display.`,
    "new-hire": `Please assign extension ${extension} at ${at} to ${newUser}${when ? `, effective ${when}` : ""}.`,
  }[status];
  const subjectStatus = { departure: "employee departure", reassign: "extension reassignment", "new-hire": "new employee" }[status];

  const body = [
    "Hello,",
    "",
    statusLine,
    "",
    `Please also reset the voicemail password on extension ${extension} to the extension number.`,
    "",
    "Reply to this message when it is done and we will close our ticket.",
    "",
    "Thank you,",
    "Geaux Automotive IT Support",
    config.geauxSupportMailbox,
  ].join("\n");

  return {
    to: route.email,
    vendor: route.vendor,
    location: route.location,
    confirmLocation: route.confirmLocation,
    from: config.geauxSupportMailbox,
    subject: `Geaux Automotive extension ${extension}: ${status === "departure" ? person : newUser || person}, ${subjectStatus}`,
    body,
    extension,
    status,
  };
}

export interface SendResult {
  sent: boolean;
  /** True once the message is found in the sender's Sent Items. */
  verified: boolean;
  messageId?: string;
  detail: string;
}

export async function sendNotice(tenantId: string, notice: Notice): Promise<SendResult> {
  if (!config.geauxMailClientId || !config.geauxMailClientSecret) {
    return { sent: false, verified: false, detail: "Mail settings are missing on the API: GEAUX_MAIL_CLIENT_ID, GEAUX_MAIL_CLIENT_SECRET." };
  }
  const token = await getMailSendToken(tenantId);
  const sender = encodeURIComponent(notice.from);
  const response = await fetch(`${GRAPH_BASE}/users/${sender}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: notice.subject,
        body: { contentType: "Text", content: notice.body },
        toRecipients: [{ emailAddress: { address: notice.to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    return { sent: false, verified: false, detail: `Graph refused the message with HTTP ${response.status}. Nothing was sent.` };
  }
  // 202 means accepted, not sent. Confirm it reached Sent Items before calling it done.
  const filter = encodeURIComponent(`subject eq '${notice.subject.replace(/'/g, "''")}'`);
  const delay = Math.max(0, Number(process.env.PHONE_NOTICE_VERIFY_MS || "2000"));
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (delay) await new Promise((r) => setTimeout(r, delay * attempt));
    try {
      const check = await fetch(
        `${GRAPH_BASE}/users/${sender}/mailFolders/sentitems/messages?$filter=${filter}&$select=id,subject,sentDateTime,toRecipients&$orderby=sentDateTime desc&$top=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (check.ok) {
        const rows = ((await check.json()) as { value?: Array<{ id: string; toRecipients?: Array<{ emailAddress?: { address?: string } }> }> }).value || [];
        const hit = rows.find((m) => (m.toRecipients || []).some((r) => (r.emailAddress?.address || "").toLowerCase() === notice.to.toLowerCase()));
        if (hit) return { sent: true, verified: true, messageId: hit.id, detail: `Sent to ${notice.vendor} (${notice.to}) from ${notice.from}.` };
      }
    } catch {
      // fall through to the unverified result
    }
  }
  return { sent: true, verified: false, detail: `Graph accepted the message to ${notice.to}, but it was not found in Sent Items yet. Check ${notice.from} before you resend.` };
}
