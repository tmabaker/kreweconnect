export type DeploymentSettings = {
  AZURE_CLIENT_ID: boolean;
  AZURE_CLIENT_SECRET: boolean;
  MSP_TENANT_ID: boolean;
  CONSENT_REDIRECT_URI: boolean;
  CDK_STORAGE_CONNECTION: boolean;
  VENDOR_STORAGE_CONNECTION: boolean;
  CALLRAIL_API_KEY: boolean;
  CALLRAIL_ACCOUNT_ID: boolean;
  CALLRAIL_TRACKING_NUMBER: boolean;
  GEAUX_MAIL_CLIENT_ID: boolean;
  GEAUX_MAIL_CLIENT_SECRET: boolean;
};

export function deploymentSettings(env: NodeJS.ProcessEnv = process.env): DeploymentSettings {
  return {
    AZURE_CLIENT_ID: Boolean(env.AZURE_CLIENT_ID || env.Azure_Client_ID),
    AZURE_CLIENT_SECRET: Boolean(env.AZURE_CLIENT_SECRET),
    MSP_TENANT_ID: Boolean(env.MSP_TENANT_ID || env.MSP_Tenant_ID),
    CONSENT_REDIRECT_URI: Boolean(env.CONSENT_REDIRECT_URI),
    CDK_STORAGE_CONNECTION: Boolean(env.CDK_STORAGE_CONNECTION),
    VENDOR_STORAGE_CONNECTION: Boolean(env.VENDOR_STORAGE_CONNECTION || env.CDK_STORAGE_CONNECTION),
    CALLRAIL_API_KEY: Boolean(env.CALLRAIL_API_KEY),
    CALLRAIL_ACCOUNT_ID: Boolean(env.CALLRAIL_ACCOUNT_ID),
    CALLRAIL_TRACKING_NUMBER: Boolean(env.CALLRAIL_TRACKING_NUMBER),
    GEAUX_MAIL_CLIENT_ID: Boolean(env.GEAUX_MAIL_CLIENT_ID),
    GEAUX_MAIL_CLIENT_SECRET: Boolean(env.GEAUX_MAIL_CLIENT_SECRET),
  };
}

export function deploymentReady(settings: DeploymentSettings): boolean {
  return Object.values(settings).every(Boolean);
}
