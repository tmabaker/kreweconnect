/**
 * Endpoint handover for the Remove User page: find a departing user's
 * computer in Intune, Autopilot and VSA X, then either wipe it (managed in
 * Intune and registered in Autopilot) or register its VSA X captured hash
 * with Autopilot so it enrolls on its next reset.
 *
 * Rules carried over from the governed noit-device connector
 * (noit-techtools/connectors/docs/device/governance.md):
 *   - A failed read is not an absent record. Every source reports
 *     `readable` separately from `found`, and nothing is imported or wiped
 *     on a source that could not be read.
 *   - A wipe needs an Autopilot record, so the machine returns enrolled
 *     instead of to a bare OOBE, and the caller must type the device name.
 *   - The hash is reassembled from six VSA X fields and checked against the
 *     fingerprint the endpoint recorded. It never leaves this module: no
 *     response, log or error carries it.
 *
 * Identity: NOIT Autopilot (Geaux), app-only. It holds
 * DeviceManagementManagedDevices.PrivilegedOperations.All, which Graph
 * requires for an app-only wipe.
 */

import { createHash } from "node:crypto";
import { config } from "./config";
import { BadRequestError, ConflictError, ServiceUnavailableError } from "./http";
import { normalizeEndpointName } from "./userAdmin";

const GRAPH = "https://graph.microsoft.com";
const GEAUX_TENANT_ID = "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa";
const VSAX_USER_AGENT = "NOIT-KreweConnect-Endpoint/1.0 (+https://github.com/tmabaker/kreweconnect)";
const HASH_FIELD_PREFIX = "CFAutopilotHash";
const HASH_FIELD_COUNT = 6;
const META_FIELD = "CFAutopilotMeta";
// Static Web App functions stop at about 45 seconds, so every poll budget below stays well under that.
const POLL_MS = Math.max(0, Number(process.env.ENDPOINT_POLL_MS || "2500"));

export class EndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EndpointError";
  }
}

/* ── tenant support ─────────────────────────────────────────────── */

export function endpointHandoverSupported(tenantId: string): boolean {
  return tenantId.toLowerCase() === GEAUX_TENANT_ID;
}

function requireSupported(tenantId: string): void {
  if (!endpointHandoverSupported(tenantId)) {
    throw new BadRequestError("Endpoint handover is set up for Geaux Automotive only.");
  }
}

function intuneSettingsError(): string | null {
  const missing = [
    ["GEAUX_INTUNE_CLIENT_ID", config.geauxIntuneClientId],
    ["GEAUX_INTUNE_CLIENT_SECRET", config.geauxIntuneClientSecret],
  ].filter(([, v]) => !v).map(([n]) => n);
  return missing.length ? `Intune settings are missing on the API: ${missing.join(", ")}.` : null;
}

function vsaxSettingsError(): string | null {
  const missing = [
    ["VSAX_API_KEY", config.vsaxApiKey],
    ["VSAX_API_SECRET", config.vsaxApiSecret],
  ].filter(([, v]) => !v).map(([n]) => n);
  return missing.length ? `VSA X settings are missing on the API: ${missing.join(", ")}.` : null;
}

/* ── Graph as NOIT Autopilot (Geaux) ────────────────────────────── */

let intuneToken: { value: string; expiresAt: number } | null = null;

async function getIntuneToken(tenantId: string): Promise<string> {
  if (intuneToken && Date.now() < intuneToken.expiresAt - 120_000) return intuneToken.value;
  const settings = intuneSettingsError();
  if (settings) throw new ServiceUnavailableError(settings);
  const body = new URLSearchParams({
    client_id: config.geauxIntuneClientId,
    client_secret: config.geauxIntuneClientSecret,
    grant_type: "client_credentials",
    scope: `${GRAPH}/.default`,
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
  );
  if (!response.ok) throw new EndpointError(`Intune sign in failed with HTTP ${response.status}.`);
  const token = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!token.access_token) throw new EndpointError("Intune sign in returned no access token.");
  intuneToken = { value: token.access_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000 };
  return intuneToken.value;
}

/** Test hook: forget the cached Intune token. */
export function resetEndpointTokenCache(): void {
  intuneToken = null;
}

async function intune<T>(tenantId: string, method: string, path: string, body?: unknown): Promise<T | null> {
  const token = await getIntuneToken(tenantId);
  const response = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    // Never echo a request body back: an import body carries the hash.
    throw new EndpointError(`Graph ${method} ${path.split("?")[0]} returned HTTP ${response.status}` +
      (err.error?.code ? ` (${err.error.code})` : "") + (err.error?.message ? `: ${err.error.message.slice(0, 200)}` : "."));
  }
  if (response.status === 202 || response.status === 204) return null;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : null;
}

const odataString = (s: string) => s.replace(/'/g, "''");

/* ── VSA X ──────────────────────────────────────────────────────── */

async function vsax<T>(path: string): Promise<T> {
  const settings = vsaxSettingsError();
  if (settings) throw new ServiceUnavailableError(settings);
  const auth = Buffer.from(`${config.vsaxApiKey}:${config.vsaxApiSecret}`).toString("base64");
  const response = await fetch(`${config.vsaxBaseUrl}/api/${config.vsaxApiVersion}/${path}`, {
    // VSA X sits behind Cloudflare, which refuses a request with no User-Agent (error 1010).
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json", "User-Agent": VSAX_USER_AGENT },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 403 && text.includes("1010")) {
      throw new EndpointError("VSA X refused the request on browser signature (Cloudflare 1010). This is not an auth failure.");
    }
    throw new EndpointError(`VSA X GET ${path.split("/")[0]} returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

interface VsaxDevice { Identifier?: string; Name?: string; OrganizationId?: number; LastSeenOnline?: string }
interface VsaxField { Name?: string; Value?: string }

export interface VerifiedHash {
  serialNumber: string;
  windowsProductId: string;
  hardwareHash: string;
  fingerprint: string;
  capturedAt: string;
}

/**
 * Rebuild the Autopilot hash from the capture script's six fields plus its
 * metadata field (v1|serial|productId|chunkCount|fingerprint|captured).
 * Out of order, truncated and stale chunks all fail the fingerprint or the
 * tail check instead of producing a hash Intune would reject later.
 */
export function reassembleHash(fields: VsaxField[]): VerifiedHash {
  const byName = new Map(fields.map((f) => [f.Name || "", f.Value || ""]));
  if (!byName.has(META_FIELD)) {
    throw new EndpointError("The Autopilot capture task has never run on this device. Run Get-AutopilotHash in VSA X first.");
  }
  const meta = (byName.get(META_FIELD) || "").split("|");
  if (!byName.get(META_FIELD)) {
    throw new EndpointError("The Autopilot capture is deployed but has not finished a run on this device yet.");
  }
  if (meta.length < 5 || meta[0] !== "v1") {
    throw new EndpointError("The Autopilot metadata field is not in the v1 shape. Re-run the capture task.");
  }
  const chunkCount = parseInt(meta[3], 10);
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > HASH_FIELD_COUNT) {
    throw new EndpointError("The Autopilot metadata field has an invalid chunk count. Re-run the capture task.");
  }
  const chunks: string[] = [];
  for (let i = 1; i <= chunkCount; i += 1) {
    const value = byName.get(`${HASH_FIELD_PREFIX}${i}`);
    if (!value) throw new EndpointError(`${HASH_FIELD_PREFIX}${i} is empty, so the hash is truncated. Re-run the capture task.`);
    chunks.push(value);
  }
  const stale: string[] = [];
  for (let i = chunkCount + 1; i <= HASH_FIELD_COUNT; i += 1) {
    if (byName.get(`${HASH_FIELD_PREFIX}${i}`)) stale.push(`${HASH_FIELD_PREFIX}${i}`);
  }
  if (stale.length) {
    throw new EndpointError(`${stale.join(", ")} still hold an earlier capture. Clear them or re-run the capture task.`);
  }
  const hardwareHash = chunks.join("");
  // The capture script records the first 16 hex characters of the SHA-256. Anything shorter would weaken
  // the check to a prefix match, so a fingerprint of any other shape is refused outright.
  const fingerprint = (meta[4] || "").toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) {
    throw new EndpointError("The Autopilot metadata field has no valid 16 character fingerprint. Re-run the capture task.");
  }
  const actual = createHash("sha256").update(hardwareHash).digest("hex").slice(0, 16);
  if (actual !== fingerprint) {
    throw new EndpointError("The reassembled hash does not match its recorded fingerprint. Re-run the capture task.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(hardwareHash) || hardwareHash.length % 4 !== 0) {
    throw new EndpointError("The reassembled hash is not valid base64. Re-run the capture task.");
  }
  return { serialNumber: meta[1], windowsProductId: meta[2], hardwareHash, fingerprint, capturedAt: meta[5] || "" };
}

async function findVsaxDevice(name: string): Promise<VsaxDevice | null> {
  // /devices ignores paging and organization filters and returns the whole fleet. Narrow here.
  const all = (await vsax<{ Data?: VsaxDevice[] }>("devices")).Data || [];
  const org = config.geauxVsaxOrganizationId;
  const matches = all.filter((d) => d.OrganizationId === org && (d.Name || "").trim().toUpperCase() === name);
  if (matches.length > 1) {
    throw new EndpointError(`${matches.length} VSA X devices are named ${name}. Resolve the duplicate in VSA X first.`);
  }
  return matches[0] || null;
}

async function readVsaxHash(device: VsaxDevice): Promise<VerifiedHash> {
  const fields = (await vsax<{ Data?: VsaxField[] }>(`devices/${encodeURIComponent(device.Identifier || "")}/customFields`)).Data || [];
  return reassembleHash(fields);
}

/* ── lookup ─────────────────────────────────────────────────────── */

interface ManagedDevice {
  id: string; deviceName?: string; serialNumber?: string; userPrincipalName?: string;
  lastSyncDateTime?: string; managedDeviceOwnerType?: string; operatingSystem?: string;
  deviceActionResults?: Array<{ actionName?: string; actionState?: string; startDateTime?: string }>;
}
interface AutopilotDevice { id: string; serialNumber?: string; groupTag?: string; enrollmentState?: string; deploymentProfileAssignmentStatus?: string }

export interface SourceState { readable: boolean; found: boolean; error?: string }

export interface EndpointState {
  endpointName: string;
  intune: SourceState & { id?: string; serialNumber?: string; userPrincipalName?: string; lastSyncDateTime?: string; ownerType?: string; operatingSystem?: string; pendingWipe?: boolean };
  autopilot: SourceState & { id?: string; groupTag?: string; enrollmentState?: string; profileStatus?: string };
  vsax: SourceState & { lastSeenOnline?: string; hashVerified?: boolean; hashCapturedAt?: string; hashSerial?: string; hashError?: string };
  /** wipe: managed and registered. register: hash ready to import. reset_to_enroll: registered but not managed. blocked: read the reasons. */
  recommended: "wipe" | "register_then_wipe" | "register" | "reset_to_enroll" | "blocked";
  canWipe: boolean;
  canRegister: boolean;
  reasons: string[];
  defaultGroupTag: string;
}

const WIPE_ACTIONS = new Set(["wipe", "factoryReset", "autopilotReset"]);
const OPEN_ACTION_STATES = new Set(["pending", "active"]);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readIntune(tenantId: string, name: string): Promise<{ state: EndpointState["intune"]; device?: ManagedDevice }> {
  try {
    const select = "id,deviceName,serialNumber,userPrincipalName,lastSyncDateTime,managedDeviceOwnerType,operatingSystem";
    const list = await intune<{ value: ManagedDevice[] }>(tenantId, "GET",
      `/v1.0/deviceManagement/managedDevices?$filter=${encodeURIComponent(`deviceName eq '${odataString(name)}'`)}&$select=${select}`);
    const matches = (list?.value || []).filter((d) => (d.deviceName || "").toUpperCase() === name);
    if (matches.length > 1) {
      return { state: { readable: true, found: true, error: `${matches.length} Intune records are named ${name}. Remove the stale one in Intune before acting.` } };
    }
    if (!matches.length) return { state: { readable: true, found: false } };
    const d = matches[0];
    // deviceActionResults is only returned on a single-device read.
    const detail = await intune<ManagedDevice>(tenantId, "GET",
      `/v1.0/deviceManagement/managedDevices/${encodeURIComponent(d.id)}?$select=id,deviceActionResults`);
    const pendingWipe = (detail?.deviceActionResults || []).some((a) => WIPE_ACTIONS.has(a.actionName || "") && OPEN_ACTION_STATES.has(a.actionState || ""));
    return {
      device: d,
      state: { readable: true, found: true, id: d.id, serialNumber: d.serialNumber, userPrincipalName: d.userPrincipalName, lastSyncDateTime: d.lastSyncDateTime, ownerType: d.managedDeviceOwnerType, operatingSystem: d.operatingSystem, pendingWipe },
    };
  } catch (err) {
    return { state: { readable: false, found: false, error: errMessage(err) } };
  }
}

async function readAutopilot(tenantId: string, serial: string): Promise<{ state: EndpointState["autopilot"]; device?: AutopilotDevice }> {
  if (!serial) return { state: { readable: false, found: false, error: "No serial number from Intune or VSA X to look the device up by." } };
  try {
    const list = await intune<{ value: AutopilotDevice[] }>(tenantId, "GET",
      `/v1.0/deviceManagement/windowsAutopilotDeviceIdentities?$filter=${encodeURIComponent(`contains(serialNumber,'${odataString(serial)}')`)}`);
    const matches = (list?.value || []).filter((d) => (d.serialNumber || "").toUpperCase() === serial.toUpperCase());
    if (matches.length > 1) {
      return { state: { readable: true, found: true, error: `${matches.length} Autopilot records share serial ${serial}. Remove the duplicate first.` } };
    }
    if (!matches.length) return { state: { readable: true, found: false } };
    const d = matches[0];
    return { device: d, state: { readable: true, found: true, id: d.id, groupTag: d.groupTag, enrollmentState: d.enrollmentState, profileStatus: d.deploymentProfileAssignmentStatus } };
  } catch (err) {
    return { state: { readable: false, found: false, error: errMessage(err) } };
  }
}

async function readVsax(name: string): Promise<{ state: EndpointState["vsax"]; hash?: VerifiedHash }> {
  let device: VsaxDevice | null;
  try {
    device = await findVsaxDevice(name);
  } catch (err) {
    return { state: { readable: false, found: false, error: errMessage(err) } };
  }
  if (!device) return { state: { readable: true, found: false } };
  try {
    const hash = await readVsaxHash(device);
    return { hash, state: { readable: true, found: true, lastSeenOnline: device.LastSeenOnline, hashVerified: true, hashCapturedAt: hash.capturedAt, hashSerial: hash.serialNumber } };
  } catch (err) {
    return { state: { readable: true, found: true, lastSeenOnline: device.LastSeenOnline, hashVerified: false, hashError: errMessage(err) } };
  }
}

interface Resolved { state: EndpointState; managed?: ManagedDevice; registered?: AutopilotDevice; hash?: VerifiedHash }

async function resolve(tenantId: string, rawName: unknown): Promise<Resolved> {
  requireSupported(tenantId);
  const name = normalizeEndpointName(rawName, true);
  const [intuneRead, vsaxRead] = await Promise.all([readIntune(tenantId, name), readVsax(name)]);
  const serial = intuneRead.state.serialNumber || vsaxRead.state.hashSerial || "";
  const autopilotRead = await readAutopilot(tenantId, serial);
  const i = intuneRead.state, a = autopilotRead.state, v = vsaxRead.state;
  const reasons: string[] = [];

  for (const [label, s] of [["Intune", i], ["Autopilot", a], ["VSA X", v]] as const) {
    if (s.error) reasons.push(`${label}: ${s.error}`);
  }
  if (v.found && v.hashVerified === false && v.hashError) reasons.push(`VSA X hash: ${v.hashError}`);
  if (i.found && v.hashSerial && i.serialNumber && i.serialNumber.toUpperCase() !== v.hashSerial.toUpperCase()) {
    reasons.push(`Serial mismatch: Intune has ${i.serialNumber}, the VSA X capture has ${v.hashSerial}. These may be two different machines.`);
  }
  const mismatch = reasons.some((r) => r.startsWith("Serial mismatch"));
  const ambiguous = !!(i.error && i.readable) || !!(a.error && a.readable);

  const canWipe = i.readable && i.found && !i.error && a.readable && a.found && !a.error && !i.pendingWipe && !mismatch;
  const canRegister = a.readable && !a.found && !a.error && v.found && v.hashVerified === true && !mismatch;

  if (i.pendingWipe) reasons.push("A wipe is already pending on this device in Intune. It will not be sent twice.");
  if (i.found && a.readable && !a.found && !a.error) reasons.push("Managed in Intune but not registered in Autopilot. Register the hash first so the wipe returns it enrolled.");
  if (!i.found && i.readable && !a.found && a.readable && !v.found && v.readable) reasons.push(`${name} was not found in Intune, Autopilot or VSA X.`);

  let recommended: EndpointState["recommended"] = "blocked";
  if (canWipe) recommended = "wipe";
  else if (canRegister && i.found) recommended = "register_then_wipe";
  else if (canRegister) recommended = "register";
  else if (!ambiguous && i.readable && !i.found && a.found && !a.error) recommended = "reset_to_enroll";
  if (recommended === "reset_to_enroll") {
    reasons.push("Registered in Autopilot but not managed in Intune, so it cannot be wiped remotely. Reset it on site (or from VSA X) and it enrolls at the next setup screen.");
  }

  return {
    managed: intuneRead.device,
    registered: autopilotRead.device,
    hash: vsaxRead.hash,
    state: { endpointName: name, intune: i, autopilot: a, vsax: v, recommended, canWipe, canRegister, reasons, defaultGroupTag: config.geauxAutopilotGroupTag },
  };
}

export async function lookupEndpoint(tenantId: string, name: unknown): Promise<EndpointState> {
  return (await resolve(tenantId, name)).state;
}

function requireConfirmation(state: EndpointState, confirmDevice: unknown): void {
  const typed = typeof confirmDevice === "string" ? confirmDevice.trim().toUpperCase() : "";
  if (typed !== state.endpointName) {
    throw new BadRequestError(`Type the device name exactly (${state.endpointName}) to confirm.`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── wipe ───────────────────────────────────────────────────────── */

export interface WipeResult {
  endpointName: string;
  managedDeviceId: string;
  serialNumber: string;
  accepted: boolean;
  /** Intune's own record of the action, read back after the request. */
  actionState: string;
  verified: boolean;
  detail: string;
}

export async function wipeEndpoint(tenantId: string, name: unknown, confirmDevice: unknown): Promise<WipeResult> {
  const { state, managed } = await resolve(tenantId, name);
  requireConfirmation(state, confirmDevice);
  if (state.intune.pendingWipe) throw new ConflictError("A wipe is already pending on this device. It was not sent again.");
  if (!state.canWipe || !managed) {
    throw new ConflictError(`Wipe refused for ${state.endpointName}. ${state.reasons.join(" ") || "The device must be managed in Intune and registered in Autopilot."}`);
  }
  // A full wipe: the user's data goes, and the Autopilot record brings the machine back enrolled for the next user.
  // Only an action Intune started after this request counts as the wipe we sent; an older wipe or reset
  // in the device's history must never read as confirmation. A minute of slack covers clock skew.
  const submittedAt = Date.now() - 60_000;
  await intune(tenantId, "POST", `/v1.0/deviceManagement/managedDevices/${encodeURIComponent(managed.id)}/wipe`,
    { keepEnrollmentData: false, keepUserData: false });

  let actionState = "";
  for (let attempt = 1; attempt <= 3 && !actionState; attempt += 1) {
    if (POLL_MS) await sleep(POLL_MS);
    try {
      const detail = await intune<ManagedDevice>(tenantId, "GET",
        `/v1.0/deviceManagement/managedDevices/${encodeURIComponent(managed.id)}?$select=id,deviceActionResults`);
      const action = (detail?.deviceActionResults || [])
        .filter((a) => WIPE_ACTIONS.has(a.actionName || "") && Date.parse(a.startDateTime || "") >= submittedAt)
        .sort((x, y) => String(y.startDateTime || "").localeCompare(String(x.startDateTime || "")))[0];
      if (action && action.actionState) actionState = action.actionState;
    } catch {
      // The wipe was accepted; a failed read back is reported as unverified, never as a failure to wipe.
    }
  }
  const verified = ["pending", "active", "done"].includes(actionState);
  return {
    endpointName: state.endpointName,
    managedDeviceId: managed.id,
    serialNumber: managed.serialNumber || "",
    accepted: true,
    actionState: actionState || "unknown",
    verified,
    detail: verified
      ? `Intune shows the wipe as ${actionState}. The device erases at its next check in and returns to setup enrolled through Autopilot.`
      : "Intune accepted the wipe, but its action record did not show it yet. Check the device in Intune before you report it done.",
  };
}

/* ── register the VSA X hash with Autopilot ─────────────────────── */

export interface RegisterResult {
  endpointName: string;
  serialNumber: string;
  importId: string;
  importStatus: string;
  verified: boolean;
  groupTag: string;
  fingerprint: string;
  detail: string;
}

export async function registerEndpoint(tenantId: string, name: unknown, confirmDevice: unknown, groupTag?: unknown): Promise<RegisterResult> {
  const { state, hash } = await resolve(tenantId, name);
  requireConfirmation(state, confirmDevice);
  if (!state.canRegister || !hash) {
    throw new ConflictError(`Autopilot registration refused for ${state.endpointName}. ${state.reasons.join(" ") || "A verified VSA X hash and a readable Autopilot list with no existing record are required."}`);
  }
  const tag = typeof groupTag === "string" && groupTag.trim() ? groupTag.trim().slice(0, 100) : config.geauxAutopilotGroupTag;
  const created = await intune<{ id: string; state?: { deviceImportStatus?: string } }>(tenantId, "POST",
    "/v1.0/deviceManagement/importedWindowsAutopilotDeviceIdentities", {
      "@odata.type": "#microsoft.graph.importedWindowsAutopilotDeviceIdentity",
      serialNumber: hash.serialNumber,
      productKey: hash.windowsProductId || "",
      hardwareIdentifier: hash.hardwareHash,
      groupTag: tag,
    });
  const importId = created?.id || "";
  let importStatus = created?.state?.deviceImportStatus || "pending";
  let errorName = "";
  for (let attempt = 1; attempt <= 6 && importId && !["complete", "error"].includes(importStatus); attempt += 1) {
    if (POLL_MS) await sleep(POLL_MS);
    try {
      const row = await intune<{ state?: { deviceImportStatus?: string; deviceErrorName?: string } }>(tenantId, "GET",
        `/v1.0/deviceManagement/importedWindowsAutopilotDeviceIdentities/${encodeURIComponent(importId)}`);
      importStatus = row?.state?.deviceImportStatus || importStatus;
      errorName = row?.state?.deviceErrorName || "";
    } catch {
      break;
    }
  }
  if (importStatus === "complete") {
    // Ask Autopilot to pick the new record up now rather than on its own schedule. A refusal here
    // (Intune rate limits the sync) does not undo the import.
    await intune(tenantId, "POST", "/v1.0/deviceManagement/windowsAutopilotSettings/sync").catch(() => null);
  }
  const verified = importStatus === "complete";
  return {
    endpointName: state.endpointName,
    serialNumber: hash.serialNumber,
    importId,
    importStatus,
    verified,
    groupTag: tag,
    fingerprint: hash.fingerprint.slice(0, 12),
    detail: verified
      ? `Registered with Autopilot (group tag ${tag}). The device enrolls the next time it reaches the setup screen: reset it on site or from VSA X to finish.`
      : importStatus === "error"
        ? `Autopilot rejected the import${errorName ? ` (${errorName})` : ""}. Nothing else was changed.`
        : `Intune accepted the import and is still processing it (${importStatus}). Look the device up again in a few minutes before you reset it.`,
  };
}
