import { randomUUID } from "node:crypto";
import { config } from "./config";
import { submitLifecycleFailureAlert } from "./vendorQueue";
import { graphRequest } from "./graphClient";

const CALLRAIL_BASE = "https://api.callrail.com/v3";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_SCOPE = "https://graph.microsoft.com/.default";
let mailToken: { value: string; expiresAt: number } | null = null;

export type DeliveryStatus = "sent" | "failed" | "not_attempted";

export interface DeliveryStep {
  status: DeliveryStatus;
  attempts?: number;
  accepted?: boolean;
  destinationLast4?: string;
  messageId?: string;
  sender?: string;
  recipient?: string;
  encryptionVerified?: boolean;
  error?: string;
}

export interface CredentialDeliveryResult {
  complete: boolean;
  employeeText: DeliveryStep;
  managerEmail: DeliveryStep;
  escalation?: {
    jobId: string;
    state: "queued";
    component: "callRail" | "managerEmail";
  };
}

function safeMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message.replace(/Token token=[^\s]+/gi, "Token token=[redacted]") : fallback;
}

function callRailSettingsError(): string | null {
  const missing = [
    ["CALLRAIL_API_KEY", config.callRailApiKey],
    ["CALLRAIL_ACCOUNT_ID", config.callRailAccountId],
    ["CALLRAIL_TRACKING_NUMBER", config.callRailTrackingNumber],
  ].filter(([, value]) => !value).map(([name]) => name);
  return missing.length
    ? `Required CallRail settings are missing: ${missing.join(", ")}.`
    : null;
}

function mailSettingsError(): string | null {
  const missing = [
    ["GEAUX_MAIL_CLIENT_ID", config.geauxMailClientId],
    ["GEAUX_MAIL_CLIENT_SECRET", config.geauxMailClientSecret],
    ["GEAUX_MANAGER_MAIL_SUBJECT", config.geauxManagerMailSubject],
    ["GEAUX_MANAGER_MAIL_TRIGGER_HEADER", config.geauxManagerMailTriggerHeader],
    ["GEAUX_MANAGER_MAIL_TRIGGER_VALUE", config.geauxManagerMailTriggerValue],
    ["GEAUX_MANAGER_MAIL_APPLIED_HEADER", config.geauxManagerMailAppliedHeader],
    ["GEAUX_MANAGER_MAIL_APPLIED_VALUE", config.geauxManagerMailAppliedValue],
  ].filter(([, value]) => !value).map(([name]) => name);
  return missing.length
    ? `Required manager mail settings are missing: ${missing.join(", ")}.`
    : null;
}

async function getMailSendToken(tenantId: string): Promise<string> {
  if (mailToken && Date.now() < mailToken.expiresAt - 120_000) return mailToken.value;
  const body = new URLSearchParams({
    client_id: config.geauxMailClientId,
    client_secret: config.geauxMailClientSecret,
    grant_type: "client_credentials",
    scope: TOKEN_SCOPE,
  });
  const response = await fetch(
    "https://login.microsoftonline.com/" + encodeURIComponent(tenantId) + "/oauth2/v2.0/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
  );
  if (!response.ok) throw new Error("Manager mail authentication failed with HTTP " + response.status + ".");
  const token = await response.json() as { access_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error("Manager mail authentication returned no access token.");
  mailToken = { value: token.access_token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000 };
  return mailToken.value;
}

const DELIVERY_ATTEMPTS = 10;
const DELIVERY_RETRY_MS = Math.max(0, Number(process.env.CREDENTIAL_DELIVERY_RETRY_MS || "2000"));

async function retryDelivery(action: () => Promise<DeliveryStep>, stopOnAccepted = true): Promise<DeliveryStep> {
  let last: DeliveryStep = { status: "failed", error: "Credential delivery did not run." };
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt += 1) {
    last = await action();
    last.attempts = attempt;
    if (last.status === "sent" || (stopOnAccepted && last.accepted === true)) return last;
    if (attempt < DELIVERY_ATTEMPTS && DELIVERY_RETRY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELIVERY_RETRY_MS));
    }
  }
  return last;
}

async function queueDeliveryEscalation(input: {
  component: "callRail" | "managerEmail";
  userName: string;
  userUpn: string;
  attempts: number;
  error: string;
}): Promise<{ jobId: string; state: "queued"; component: "callRail" | "managerEmail" }> {
  const jobId = randomUUID();
  await submitLifecycleFailureAlert({
    id: jobId,
    kind: "failure_alert",
    component: input.component,
    operation: "credential_delivery",
    requestedBy: "KreweConnect credential delivery",
    submittedAt: new Date().toISOString(),
    userName: input.userName,
    userUpn: input.userUpn,
    attempts: input.attempts,
    diagnostics: [input.error.slice(0, 800)],
  });
  return { jobId, state: "queued", component: input.component };
}

function approvedSms(password: string): string {
  return `Welcome to Geaux Automotive! Your temporary password is ${password}. You'll need this to access your email and information. Please check your welcome email for information about your dealership groups and support contacts. For IT help, email support@geauxautomotive.com.`;
}

export async function sendCallRailPassword(
  mobilePhone: string,
  password: string
): Promise<DeliveryStep> {
  const settingError = callRailSettingsError();
  if (settingError) return { status: "failed", destinationLast4: mobilePhone.slice(-4), error: settingError };
  try {
    const response = await fetch(
      `${CALLRAIL_BASE}/a/${encodeURIComponent(config.callRailAccountId)}/text-messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Token token=${config.callRailApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tracking_number: config.callRailTrackingNumber,
          customer_phone_number: mobilePhone,
          content: approvedSms(password),
        }),
      }
    );
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      // Never include a provider body because it can contain message content.
    }
    if (!response.ok) {
      return {
        status: "failed",
        destinationLast4: mobilePhone.slice(-4),
        error: `CallRail rejected credential delivery with HTTP ${response.status}.`,
      };
    }
    const messageId = String(body.id || body.message_id || body.messageId || "");
    if (!messageId) {
      return {
        status: "failed",
        destinationLast4: mobilePhone.slice(-4),
        accepted: true,
        error: "CallRail accepted the request without a message id.",
      };
    }
    return { status: "sent", accepted: true, destinationLast4: mobilePhone.slice(-4), messageId };
  } catch (err) {
    return {
      status: "failed",
      destinationLast4: mobilePhone.slice(-4),
      error: safeMessage(err, "CallRail credential delivery failed."),
    };
  }
}

export async function sendManagerCredentialEmail(
  tenantId: string,
  managerEmail: string,
  employeeDisplayName: string,
  employeeUpn: string,
  password: string,
  submit = true
): Promise<DeliveryStep> {
  const sender = config.geauxSupportMailbox;
  const settingError = mailSettingsError();
  if (settingError) return { status: "failed", sender, recipient: managerEmail, error: settingError };
  const subject = `${config.geauxManagerMailSubject}: ${employeeDisplayName}`;
  try {
    if (submit) {
      const token = await getMailSendToken(tenantId);
      const response = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(sender)}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject,
            body: {
              contentType: "Text",
              content: [
                `The Microsoft 365 account for ${employeeDisplayName} is ready.`,
                `Username: ${employeeUpn}`,
                `Temporary password: ${password}`,
                "The user must change this password at first sign in.",
              ].join("\n"),
            },
            toRecipients: [{ emailAddress: { address: managerEmail } }],
            internetMessageHeaders: [{
              name: config.geauxManagerMailTriggerHeader,
              value: config.geauxManagerMailTriggerValue,
            }],
          },
          saveToSentItems: true,
        }),
      });
      if (!response.ok) throw new Error(`Graph rejected manager mail with HTTP ${response.status}.`);
    }

    // A 202 only means accepted. Report success only after the message reaches
    // the direct manager's inbox.
    const filter = encodeURIComponent(`subject eq '${subject.replace(/'/g, "''")}'`);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      const inbox = await graphRequest<{ value: Array<{
        id: string;
        subject: string;
        internetMessageHeaders?: Array<{ name: string; value: string }>;
      }> }>(
        tenantId,
        "GET",
        `/users/${encodeURIComponent(managerEmail)}/mailFolders/inbox/messages?$filter=${filter}&$select=id,subject,internetMessageHeaders&$top=5`
      );
      const delivered = inbox?.value?.find((message) => message.subject === subject);
      if (delivered) {
        const applied = (delivered.internetMessageHeaders || []).some((header) =>
          header.name.toLowerCase() === config.geauxManagerMailAppliedHeader.toLowerCase()
          && header.value === config.geauxManagerMailAppliedValue
        );
        if (!applied) {
          return {
            status: "failed",
            sender,
            recipient: managerEmail,
            error: "Manager mail arrived without the verified Outlook encryption marker.",
          };
        }
        return {
          status: "sent",
          accepted: true,
          sender,
          recipient: managerEmail,
          messageId: delivered.id,
          encryptionVerified: true,
        };
      }
    }
    return {
      status: "failed",
      accepted: true,
      sender,
      recipient: managerEmail,
      error: "Manager mail was accepted by Graph but was not verified in the manager inbox.",
    };
  } catch (err) {
    return {
      status: "failed",
      sender,
      recipient: managerEmail,
      error: safeMessage(err, "Manager credential email failed."),
    };
  }
}

export async function deliverGeauxCredentials(input: {
  tenantId: string;
  mobilePhone: string;
  managerEmail: string;
  employeeDisplayName: string;
  employeeUpn: string;
  password: string;
}): Promise<CredentialDeliveryResult> {
  const employeeText = await retryDelivery(() =>
    sendCallRailPassword(input.mobilePhone, input.password)
  );
  if (employeeText.status !== "sent") {
    const escalation = await queueDeliveryEscalation({
      component: "callRail",
      userName: input.employeeDisplayName,
      userUpn: input.employeeUpn,
      attempts: employeeText.attempts || DELIVERY_ATTEMPTS,
      error: employeeText.error || "CallRail credential delivery failed.",
    });
    return {
      complete: false,
      employeeText,
      managerEmail: { status: "not_attempted", attempts: 0, error: "Employee delivery must succeed first." },
      escalation,
    };
  }
  let managerMailAccepted = false;
  const managerEmail = await retryDelivery(async () => {
    const result = await sendManagerCredentialEmail(
      input.tenantId,
      input.managerEmail,
      input.employeeDisplayName,
      input.employeeUpn,
      input.password,
      !managerMailAccepted
    );
    managerMailAccepted = managerMailAccepted || result.accepted === true;
    return result;
  }, false);
  const escalation = managerEmail.status === "sent"
    ? undefined
    : await queueDeliveryEscalation({
        component: "managerEmail",
        userName: input.employeeDisplayName,
        userUpn: input.employeeUpn,
        attempts: managerEmail.attempts || DELIVERY_ATTEMPTS,
        error: managerEmail.error || "Manager credential email failed.",
      });
  return {
    complete: managerEmail.status === "sent",
    employeeText,
    managerEmail,
    escalation,
  };
}
