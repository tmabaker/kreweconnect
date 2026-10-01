import { BlobServiceClient } from "@azure/storage-blob";
import { QueueClient } from "@azure/storage-queue";
import { ServiceUnavailableError } from "./http";

const QUEUE = "vendor-lifecycle-jobs";
const STATUS = "vendorlifecyclestatus";

function connection(): string {
  const value = process.env.VENDOR_STORAGE_CONNECTION || process.env.CDK_STORAGE_CONNECTION;
  if (!value) throw new ServiceUnavailableError("Vendor lifecycle storage is unavailable. No vendor job was created.");
  return value;
}

export type VendorLifecycleJob = {
  id: string;
  operation: "add" | "modify" | "disable";
  tenantId: string;
  requestedBy: string;
  submittedAt: string;
  spec: {
    upn: string;
    firstName: string;
    lastName: string;
    company: string;
    department: string;
    jobTitle: string;
    mobilePhone?: string;
    employeeId?: string;
  };
};

function queue(): QueueClient {
  return new QueueClient(connection(), QUEUE);
}

function container() {
  return BlobServiceClient.fromConnectionString(connection()).getContainerClient(STATUS);
}

export async function initializeVendorStorage(): Promise<void> {
  await queue().createIfNotExists();
  await container().createIfNotExists();
}

export async function submitVendorJob(job: VendorLifecycleJob): Promise<void> {
  await initializeVendorStorage();
  const initial = JSON.stringify({
    id: job.id,
    operation: job.operation,
    state: "queued",
    components: { driveCentric: { state: "queued" }, routeOne: { state: "queued" } },
    submittedAt: job.submittedAt,
  });
  await container().getBlockBlobClient(job.id + ".json").upload(initial, Buffer.byteLength(initial), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
  await queue().sendMessage(Buffer.from(JSON.stringify(job)).toString("base64"));
}

export async function getVendorJobStatus(id: string): Promise<Record<string, unknown> | null> {
  await initializeVendorStorage();
  const blob = container().getBlobClient(id + ".json");
  if (!(await blob.exists())) return null;
  const response = await blob.download();
  const chunks: Buffer[] = [];
  if (response.readableStreamBody) {
    for await (const chunk of response.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}


export type LifecycleFailureAlertJob = {
  id: string;
  kind: "failure_alert";
  component: "callRail" | "managerEmail";
  operation: "credential_delivery";
  requestedBy: string;
  submittedAt: string;
  userName: string;
  userUpn: string;
  attempts: number;
  diagnostics: string[];
};

export async function submitLifecycleFailureAlert(job: LifecycleFailureAlertJob): Promise<void> {
  await initializeVendorStorage();
  const initial = JSON.stringify({
    id: job.id,
    kind: job.kind,
    component: job.component,
    operation: job.operation,
    state: "queued",
    attempt: 0,
    deliveryAttempts: job.attempts,
    submittedAt: job.submittedAt,
  });
  await container().getBlockBlobClient(job.id + ".json").upload(initial, Buffer.byteLength(initial), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
  await queue().sendMessage(Buffer.from(JSON.stringify(job)).toString("base64"));
}
