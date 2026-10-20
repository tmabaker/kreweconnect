#!/usr/bin/env python3
"""Provision one KreweWorks client through Azure Resource Manager and Microsoft Graph (no az CLI).

Same result as provision.sh, for environments without the Azure CLI (cloud sessions):
  * storage account (tables and private blobs are created by the app on first use)
  * Static Web App, Standard plan
  * app settings, merged with whatever the site already has (PORTAL_PII_KEY is never replaced)
  * sign-in redirect URIs on the app registration (NOIT tenant)

Runs as the Taila Agent by default (client secret from AWS Secrets Manager, stored inverted), which
needs Contributor on the client's resource group and Application.ReadWrite.All in the NOIT tenant.
The resource group must already exist; Taila holds only Reader at subscription scope.

Dry run by default. Pass --apply to make changes. Secret values are never printed.

    python3 provision.py --profile ../../../noit-client-tools/kreweworks/clients/<slug>/profile.json \\
        --subscription <id> --resource-group kreweworks-<slug>-rg --admins a@x.com,b@x.com [--apply]
"""
import argparse, base64, json, os, re, secrets, sys, time, urllib.error, urllib.parse, urllib.request

NOIT_TENANT = os.environ.get("NOIT_TENANT_ID", "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e")
ARM = "https://management.azure.com"
GRAPH = "https://graph.microsoft.com/v1.0"


def taila_secret():
    import boto3
    raw = boto3.client("secretsmanager", "us-east-1").get_secret_value(SecretId=os.environ.get("TAILA_SECRET_ID", "noit/0626_MSClaudeAgent"))["SecretString"]
    return next(iter(json.loads(raw).keys()))  # stored inverted: the key is the secret value


def token(client_id, secret, scope):
    body = urllib.parse.urlencode({"client_id": client_id, "client_secret": secret, "scope": scope, "grant_type": "client_credentials"}).encode()
    return json.load(urllib.request.urlopen(f"https://login.microsoftonline.com/{NOIT_TENANT}/oauth2/v2.0/token", body))["access_token"]


def call(tok, method, url, body=None, ok404=False, ok403=False):
    data = json.dumps(body).encode() if body is not None else (b"" if method in ("POST",) else None)
    for attempt in range(5):
        req = urllib.request.Request(url, method=method, data=data, headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                txt = r.read().decode()
                return r.status, (json.loads(txt) if txt else {})
        except urllib.error.HTTPError as e:
            if e.code == 404 and ok404:
                return 404, {}
            if e.code == 403 and ok403:
                return 403, {}
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 ** attempt); continue
            raise SystemExit(f"{method} {url.split('?')[0]} -> {e.code}: {e.read().decode()[:300]}")
        except urllib.error.URLError:
            if attempt < 4:
                time.sleep(2 ** attempt); continue
            raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True)
    ap.add_argument("--subscription", required=True)
    ap.add_argument("--resource-group", required=True)
    ap.add_argument("--location", default="centralus")
    ap.add_argument("--admins", required=True, help="comma-separated bootstrap admin UPNs")
    ap.add_argument("--swa-name")
    ap.add_argument("--storage-name")
    ap.add_argument("--mail", choices=["on", "off"], help="turn portal email on or off (otherwise left as it is)")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    p = json.load(open(a.profile))
    slug = p["client"]["slug"]
    tenant = p["client"]["tenantId"].lower()
    client_id = p.get("deploy", {}).get("graphClientId") or os.environ.get("GRAPH_CLIENT_ID")
    swa = a.swa_name or f"kreweworks-{slug}"
    st = a.storage_name or ("kw" + re.sub(r"[^a-z0-9]", "", slug.lower())[:14] + "data")
    rg = f"{ARM}/subscriptions/{a.subscription}/resourceGroups/{a.resource_group}"
    mail = p.get("mail", {})
    allowed = ",".join(p.get("tenants", {}).get("allowed") or [tenant])
    mode = "APPLY" if a.apply else "DRY RUN"
    print(f"[{mode}] {p['client']['name']} ({slug}) -> {a.resource_group}: SWA {swa}, storage {st}")

    secret = taila_secret()
    arm = token(client_id, secret, "https://management.azure.com/.default")

    code, _ = call(arm, "GET", f"{rg}?api-version=2021-04-01", ok404=True, ok403=True)
    if code in (403, 404):
        raise SystemExit(f"Resource group {a.resource_group} does not exist or Taila has no role on it. "
                         "Tammy creates it and gives Taila Agent the Contributor role on it.")

    # storage
    code, sa = call(arm, "GET", f"{rg}/providers/Microsoft.Storage/storageAccounts/{st}?api-version=2023-01-01", ok404=True)
    if code == 404:
        print(f"  storage {st}: create (Standard_LRS, TLS1_2, no public blob access)")
        if a.apply:
            call(arm, "PUT", f"{rg}/providers/Microsoft.Storage/storageAccounts/{st}?api-version=2023-01-01",
                 {"location": a.location, "sku": {"name": "Standard_LRS"}, "kind": "StorageV2",
                  "properties": {"minimumTlsVersion": "TLS1_2", "allowBlobPublicAccess": False, "supportsHttpsTrafficOnly": True}})
            for _ in range(30):
                code, sa = call(arm, "GET", f"{rg}/providers/Microsoft.Storage/storageAccounts/{st}?api-version=2023-01-01", ok404=True)
                if code == 200 and sa.get("properties", {}).get("provisioningState") == "Succeeded":
                    break
                time.sleep(5)
    else:
        print(f"  storage {st}: exists")
    conn = ""
    if a.apply or code == 200:
        _, keys = call(arm, "POST", f"{rg}/providers/Microsoft.Storage/storageAccounts/{st}/listKeys?api-version=2023-01-01") if (a.apply or code == 200) else (0, {})
        if keys.get("keys"):
            conn = f"DefaultEndpointsProtocol=https;AccountName={st};AccountKey={keys['keys'][0]['value']};EndpointSuffix=core.windows.net"

    # static web app
    code, site = call(arm, "GET", f"{rg}/providers/Microsoft.Web/staticSites/{swa}?api-version=2022-09-01", ok404=True)
    if code == 404:
        print(f"  static web app {swa}: create (Standard)")
        if a.apply:
            call(arm, "PUT", f"{rg}/providers/Microsoft.Web/staticSites/{swa}?api-version=2022-09-01",
                 {"location": a.location, "sku": {"name": "Standard", "tier": "Standard"}, "properties": {}})
            for _ in range(30):
                code, site = call(arm, "GET", f"{rg}/providers/Microsoft.Web/staticSites/{swa}?api-version=2022-09-01", ok404=True)
                if code == 200 and site.get("properties", {}).get("defaultHostname"):
                    break
                time.sleep(5)
    else:
        print(f"  static web app {swa}: exists")
    host = site.get("properties", {}).get("defaultHostname", "<new host>")
    wanted = (p.get("deploy", {}).get("baseUrl") or "").rstrip("/")
    bound = [d.lower() for d in site.get("properties", {}).get("customDomains") or []]
    # Use the custom domain only once it is bound to the site; until then links use the default host.
    base_url = wanted if wanted and urllib.parse.urlparse(wanted).hostname in bound else f"https://{host}"
    print(f"  host https://{host}  base URL {base_url}")

    # app settings, merged; the packet key is created once and never replaced
    existing = {}
    if code == 200:
        _, cur = call(arm, "POST", f"{rg}/providers/Microsoft.Web/staticSites/{swa}/listAppSettings?api-version=2022-09-01")
        existing = cur.get("properties", {}) or {}
    if a.mail == "on" and not (mail.get("from") and mail.get("hr") and mail.get("it")):
        raise SystemExit("Refusing to turn mail on: the profile's mail.from, mail.hr and mail.it must all be set.")
    want = {
        "AZURE_CLIENT_ID": client_id, "AZURE_CLIENT_SECRET": secret,
        "PORTAL_GRAPH_TENANT_ID": tenant, "PORTAL_GRAPH_CLIENT_ID": client_id, "PORTAL_GRAPH_CLIENT_SECRET": secret,
        "PORTAL_TENANT_ID": tenant, "PORTAL_ALLOWED_TENANTS": allowed, "PORTAL_BOOTSTRAP_ADMINS": a.admins.lower(),
        "PORTAL_MAIL_ENABLED": {"on": "true", "off": "false"}.get(a.mail) or existing.get("PORTAL_MAIL_ENABLED", "false"),
        "PORTAL_MAIL_FROM": mail.get("from", ""), "PORTAL_HR_EMAIL": mail.get("hr", ""), "PORTAL_IT_EMAIL": mail.get("it", ""),
        "PORTAL_IT_CC": ",".join(mail.get("itCc") or []), "PORTAL_BASE_URL": base_url,
        "TECHTOOLS_BASE_URL": "https://techtools.noitgroup.com",
        "PORTAL_PII_KEY": existing.get("PORTAL_PII_KEY") or base64.b64encode(secrets.token_bytes(32)).decode(),
    }
    if conn:
        want["PORTAL_STORAGE_CONNECTION"] = conn
    merged = dict(existing); merged.update({k: v for k, v in want.items() if v != ""})
    changed = sorted(k for k in merged if existing.get(k) != merged[k])
    print(f"  app settings to set: {', '.join(changed) or 'none'} (values not shown; mail stays {merged['PORTAL_MAIL_ENABLED']})")
    if a.apply and changed:
        call(arm, "PUT", f"{rg}/providers/Microsoft.Web/staticSites/{swa}/config/appsettings?api-version=2022-09-01", {"properties": merged})

    # redirect URIs on the sign-in app (NOIT tenant)
    graph = token(client_id, secret, "https://graph.microsoft.com/.default")
    _, app = call(graph, "GET", f"{GRAPH}/applications(appId='{client_id}')?$select=id,web")
    uris = set((app.get("web") or {}).get("redirectUris") or [])
    need = {f"https://{host}/.auth/login/aad/callback"}
    if p.get("deploy", {}).get("baseUrl"):
        need.add(f"{base_url}/.auth/login/aad/callback")
    add = sorted(u for u in need - uris if "<new host>" not in u)
    print(f"  redirect URIs to add: {add or 'none'}")
    if a.apply and add:
        call(graph, "PATCH", f"{GRAPH}/applications/{app['id']}", {"web": {"redirectUris": sorted(uris | set(add)), "implicitGrantSettings": {"enableIdTokenIssuance": True}}})

    print("Done." if a.apply else "Dry run complete. Re-run with --apply to make these changes.")


if __name__ == "__main__":
    main()
