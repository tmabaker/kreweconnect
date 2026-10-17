/**
 * GET /api/health — anonymous deployment/config sanity check.
 * Reports only booleans (never values) so it's safe to expose.
 */

import { app } from "@azure/functions";
import { deploymentReady, deploymentSettings } from "../lib/readiness";
import { contractsConnection } from "../lib/contractStore";
import { extractionConfigured } from "../lib/contractExtraction";

const API_VERSION = "0.8.0"; // bump when API behavior changes

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => {
    const settings = deploymentSettings();
    return {
      status: 200,
      jsonBody: {
        ok: deploymentReady(settings),
        apiVersion: API_VERSION,
        settings,
        // Reported separately so they never block the CDK deploy gate.
        features: {
          contractsStorage: Boolean(contractsConnection()),
          contractExtraction: extractionConfigured(),
        },
      },
    };
  },
});
