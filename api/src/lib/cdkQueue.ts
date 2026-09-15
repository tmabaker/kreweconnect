import { BlobServiceClient } from "@azure/storage-blob";
import { QueueClient } from "@azure/storage-queue";

const QUEUE = "cdk-jobs";
const STATUS = "cdkjobstatus";
const SECRETS = "cdkjobsecrets";

function connection(): string {
  const value = process.env.CDK_STORAGE_CONNECTION;
  if (!value) throw new Error("CDK job storage is not configured.");
  return value;
}

export type CDKJob = {
  id: string;
  operation: "add" | "modify" | "password" | "disable";
  tenantId: string;
  requestedBy: string;
  submittedAt: string;
  matrixVersion: string;
  spec: {
    upn: string;
    firstName: string;
    lastName: string;
    dmsUserId: string;
    storeId: string;
    dmsCompany: string;
    profile: string;
    accounts: string[];
    roles: string[];
    employeeId?: string;
    jobTitle?: string;
  };
  temporaryPassword?: string;
};

function queue(): QueueClient {
  return new QueueClient(connection(), QUEUE);
}

function container(name: string) {
  return BlobServiceClient.fromConnectionString(connection()).getContainerClient(name);
}

export async function initializeCDKStorage(): Promise<void> {
  await queue().createIfNotExists();
  await container(STATUS).createIfNotExists();
  await container(SECRETS).createIfNotExists();
}

export async function submitCDKJob(job: CDKJob): Promise<void> {
  await initializeCDKStorage();
  await container(STATUS).getBlockBlobClient(job.id + ".json").upload(
    JSON.stringify({ id: job.id, operation: job.operation, state: "queued", submittedAt: job.submittedAt }),
    Buffer.byteLength(JSON.stringify({ id: job.id, operation: job.operation, state: "queued", submittedAt: job.submittedAt })),
    { blobHTTPHeaders: { blobContentType: "application/json" } }
  );
  await queue().sendMessage(Buffer.from(JSON.stringify(job)).toString("base64"));
}

export async function getCDKJobStatus(id: string): Promise<Record<string, unknown> | null> {
  await initializeCDKStorage();
  const blob = container(STATUS).getBlobClient(id + ".json");
  if (!(await blob.exists())) return null;
  const response = await blob.download();
  const text = await streamToString(response.readableStreamBody);
  const result = JSON.parse(text) as Record<string, unknown>;
  if (result.secretReady === true) {
    const secretBlob = container(SECRETS).getBlockBlobClient(id + ".json");
    if (await secretBlob.exists()) {
      const secretResponse = await secretBlob.download();
      const secretText = await streamToString(secretResponse.readableStreamBody);
      const secret = JSON.parse(secretText) as Record<string, unknown>;
      await secretBlob.delete();
      result.temporaryPassword = secret.temporaryPassword;
      result.secretReady = false;
      result.secretDelivered = true;
    }
  }
  return result;
}

async function streamToString(stream: NodeJS.ReadableStream | undefined): Promise<string> {
  if (!stream) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
