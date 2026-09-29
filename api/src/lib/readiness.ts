export type DeploymentSettings = {
  AZURE_CLIENT_ID: boolean;
  AZURE_CLIENT_SECRET: boolean;
  MSP_TENANT_ID: boolean;
  CONSENT_REDIRECT_URI: boolean;
  CDK_STORAGE_CONNECTION: boolean;
};

export function deploymentSettings(env: NodeJS.ProcessEnv = process.env): DeploymentSettings {
  return {
    AZURE_CLIENT_ID: Boolean(env.AZURE_CLIENT_ID || env.Azure_Client_ID),
    AZURE_CLIENT_SECRET: Boolean(env.AZURE_CLIENT_SECRET),
    MSP_TENANT_ID: Boolean(env.MSP_TENANT_ID || env.MSP_Tenant_ID),
    CONSENT_REDIRECT_URI: Boolean(env.CONSENT_REDIRECT_URI),
    CDK_STORAGE_CONNECTION: Boolean(env.CDK_STORAGE_CONNECTION),
  };
}

export function deploymentReady(settings: DeploymentSettings): boolean {
  return Object.values(settings).every(Boolean);
}
