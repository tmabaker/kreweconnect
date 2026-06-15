# scripts/

Operational helpers. Zero-dependency Node (built-in `fetch`, Node 18+).

## onboard-client.mjs

Onboard a client tenant into the KreweConnect "All Tenants" view in one command.
It resolves the client's domain to a tenant ID, prints the ready-to-send
admin-consent URL, and prints the merged `CLIENT_TENANTS` JSON to paste into the
SWA app setting. Optionally verifies whether consent is already in place.

```bash
# By domain (resolves the tenant ID for you), merging into the current setting:
node scripts/onboard-client.mjs --domain acme.com --name "Acme Corp" \
  --current '[{"id":"4ceb1a80-7fd3-4760-a827-aedf07b8d4fa","name":"Geaux Automotive"}]'

# By tenant ID, and verify consent (needs AZURE_CLIENT_SECRET in the environment):
node scripts/onboard-client.mjs --tenant 4ceb1a80-... --name "Geaux Automotive" --check
```

Then: send the consent URL to the client's Global Admin (one click), and set the
printed JSON as the SWA app setting `CLIENT_TENANTS`. See
`docs/app-registration-setup.md` (Part B) for the full flow.

- Only talks to `login.microsoftonline.com` (allowed by the env network policy).
- Never prints or stores secrets. `--check` reads `AZURE_CLIENT_SECRET` from the
  environment; if it's absent the check is skipped, not failed.
