/**
 * GET /api/health — anonymous deployment/config sanity check.
 * Reports only booleans (never values) so it's safe to expose.
 */

import { app } from "@azure/functions";

const API_VERSION = "0.3.0"; // bump when API behavior changes

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => ({
    status: 200,
    jsonBody: {
      ok: true,
      apiVersion: API_VERSION,
      settings: {
        AZURE_CLIENT_ID: Boolean(process.env.AZURE_CLIENT_ID),
        AZURE_CLIENT_SECRET: Boolean(process.env.AZURE_CLIENT_SECRET),
        MSP_TENANT_ID: Boolean(process.env.MSP_TENANT_ID),
        CONSENT_REDIRECT_URI: Boolean(process.env.CONSENT_REDIRECT_URI),
      },
    },
  }),
});
