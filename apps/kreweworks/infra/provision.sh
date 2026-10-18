#!/usr/bin/env bash
# Provision one KreweWorks client deployment in NOIT's Azure subscription.
# Idempotent. One Static Web App and one storage account per client: hiring records never share storage.
#
# Needs: az CLI signed in to the NOIT tenant with rights on the subscription; the client profile
# (private, from noit-client-tools/kreweworks/clients/<slug>/profile.json); and the sign-in/Graph
# app secret in GRAPH_CLIENT_SECRET (pull it from AWS Secrets Manager; never echo it).
# Nothing here touches the client tenant, DNS, or any client system. See ../docs/RUNBOOK.md.
set -euo pipefail

PROFILE="${PROFILE:?Set PROFILE to the private client profile JSON}"
SUBSCRIPTION="${SUBSCRIPTION:-}"
LOCATION="${LOCATION:-eastus2}"
BOOTSTRAP_ADMINS="${BOOTSTRAP_ADMINS:?Set BOOTSTRAP_ADMINS (comma-separated NOIT admins)}"
: "${GRAPH_CLIENT_SECRET:?Set GRAPH_CLIENT_SECRET (never echo it)}"

read_profile() { python3 -c "import json,sys; d=json.load(open('$PROFILE')); v=d
for k in sys.argv[1].split('.'):
    v=v.get(k,'') if isinstance(v,dict) else ''
print(','.join(v) if isinstance(v,list) else v)" "$1"; }

SLUG=$(read_profile client.slug)
TENANT=$(read_profile client.tenantId)
ALLOWED=$(read_profile tenants.allowed)
CLIENT_ID="${CLIENT_ID:-$(read_profile deploy.graphClientId)}"
MAIL_FROM=$(read_profile mail.from); MAIL_HR=$(read_profile mail.hr); MAIL_IT=$(read_profile mail.it); MAIL_ITCC=$(read_profile mail.itCc)
BASE_URL=$(read_profile deploy.baseUrl)
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-${BASE_URL#https://}}"
RG="${RG:-kreweworks-$SLUG-rg}"
SWA_NAME="${SWA_NAME:-kreweworks-$SLUG}"
STORAGE_NAME="${STORAGE_NAME:-kw$(echo "$SLUG" | tr -cd 'a-z0-9' | cut -c1-14)data}"   # 3-24 lowercase letters and digits

[ -n "$SUBSCRIPTION" ] && az account set --subscription "$SUBSCRIPTION"

echo "== $SLUG: resource group"
az group create -n "$RG" -l "$LOCATION" -o none

echo "== storage account (tables + private blobs)"
az storage account create -n "$STORAGE_NAME" -g "$RG" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false -o none
STORAGE_CONN=$(az storage account show-connection-string -n "$STORAGE_NAME" -g "$RG" -o tsv)

echo "== static web app (Standard plan: required for custom authentication and the roles function)"
az staticwebapp create -n "$SWA_NAME" -g "$RG" -l "$LOCATION" --sku Standard -o none 2>/dev/null || true
HOST=$(az staticwebapp show -n "$SWA_NAME" -g "$RG" --query defaultHostname -o tsv)
echo "   default host: https://$HOST"

# The packet encryption key is created once and never replaced: rotating it makes stored identifiers unreadable.
PII_KEY=$(az staticwebapp appsettings list -n "$SWA_NAME" -g "$RG" --query "properties.PORTAL_PII_KEY" -o tsv 2>/dev/null || true)
[ -z "$PII_KEY" ] && PII_KEY=$(openssl rand -base64 32) && echo "   new PORTAL_PII_KEY generated (first run)"

echo "== app settings (secret values are passed through, never printed)"
az staticwebapp appsettings set -n "$SWA_NAME" -g "$RG" --setting-names \
  "AZURE_CLIENT_ID=$CLIENT_ID" \
  "AZURE_CLIENT_SECRET=$GRAPH_CLIENT_SECRET" \
  "PORTAL_GRAPH_TENANT_ID=$TENANT" \
  "PORTAL_GRAPH_CLIENT_ID=$CLIENT_ID" \
  "PORTAL_GRAPH_CLIENT_SECRET=$GRAPH_CLIENT_SECRET" \
  "PORTAL_TENANT_ID=$TENANT" \
  "PORTAL_ALLOWED_TENANTS=$ALLOWED" \
  "PORTAL_BOOTSTRAP_ADMINS=$BOOTSTRAP_ADMINS" \
  "PORTAL_STORAGE_CONNECTION=$STORAGE_CONN" \
  "PORTAL_MAIL_ENABLED=${MAIL_ENABLED:-false}" \
  "PORTAL_MAIL_FROM=$MAIL_FROM" \
  "PORTAL_HR_EMAIL=$MAIL_HR" \
  "PORTAL_IT_EMAIL=$MAIL_IT" \
  "PORTAL_IT_CC=$MAIL_ITCC" \
  "PORTAL_BASE_URL=$BASE_URL" \
  "PORTAL_PII_KEY=$PII_KEY" \
  "TECHTOOLS_BASE_URL=https://techtools.noitgroup.com" \
  -o none
echo "   mail starts DISABLED. Set MAIL_ENABLED=true (or flip PORTAL_MAIL_ENABLED) once the pilot is approved."

echo "== sign-in redirect URIs on the app registration (NOIT tenant)"
APP_OBJ=$(az ad app show --id "$CLIENT_ID" --query id -o tsv)
EXISTING=$(az ad app show --id "$CLIENT_ID" --query "web.redirectUris" -o json)
NEW=$(python3 - "$EXISTING" "https://$HOST/.auth/login/aad/callback" "https://$CUSTOM_DOMAIN/.auth/login/aad/callback" <<'PY'
import json,sys
uris=set(json.loads(sys.argv[1])); uris.update(u for u in sys.argv[2:] if not u.startswith('https:///')); print(json.dumps(sorted(uris)))
PY
)
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$APP_OBJ" --headers 'Content-Type=application/json' --body "{\"web\":{\"redirectUris\":$NEW,\"implicitGrantSettings\":{\"enableIdTokenIssuance\":true}}}"

if [ -n "$CUSTOM_DOMAIN" ]; then
  echo "== custom domain (needs the client's CNAME first: $CUSTOM_DOMAIN -> $HOST)"
  az staticwebapp hostname set -n "$SWA_NAME" -g "$RG" --hostname "$CUSTOM_DOMAIN" -o none 2>/dev/null && echo "   requested; the certificate issues once DNS resolves" || echo "   skipped (DNS not ready). Re-run after the CNAME exists."
fi

echo
echo "Next: Azure portal > $SWA_NAME > Manage deployment token > save it as the GitHub secret"
echo "      KREWEWORKS_SWA_TOKEN_$(echo "$SLUG" | tr 'a-z-' 'A-Z_') in tmabaker/noit-client-tools, then run the KreweWorks deploy workflow for '$SLUG'."
