#!/usr/bin/env python3
"""
Verify CIPP access end-to-end. Run in a session that has the environment config
applied (AWS_* keys + the CIPP host on the network allowlist):

    python3 scripts/verify_cipp.py

Steps, with clear pass/fail at each stage (never prints secrets):
  1. Read the `noit/cipp` secret from AWS Secrets Manager (us-east-1).
  2. Acquire an app-only token (client_credentials) against the NOIT tenant.
  3. Call {base_url}/api/ListTenants and report how many client tenants came back.

Requires boto3 (`pip install boto3`) and `requests`/urllib (stdlib used here).
"""
import json
import sys
import urllib.parse
import urllib.request
import urllib.error

REGION = "us-east-1"
SECRET_NAME = "noit/cipp"


def fail(stage, msg, hint=""):
    print(f"❌ {stage}: {msg}")
    if hint:
        print(f"   → {hint}")
    sys.exit(1)


def ok(stage, msg=""):
    print(f"✅ {stage}{': ' + msg if msg else ''}")


# ── 1. Fetch the secret ───────────────────────────────────────────────────────
try:
    import boto3  # type: ignore
except ImportError:
    fail("deps", "boto3 not installed", "pip install boto3, then re-run")

try:
    sm = boto3.client("secretsmanager", region_name=REGION)
    raw = sm.get_secret_value(SecretId=SECRET_NAME)["SecretString"]
    cfg = json.loads(raw)
except Exception as e:  # noqa: BLE001
    fail("secret", f"could not read {SECRET_NAME}: {type(e).__name__}: {e}",
         "Check AWS_* env vars are set and the IAM policy allows GetSecretValue on noit/*")

required = ("base_url", "client_id", "client_secret", "tenant_id", "scope")
missing = [k for k in required if not cfg.get(k)]
if missing:
    fail("secret", f"{SECRET_NAME} missing keys: {missing}",
         'Expected {"base_url","client_id","client_secret","tenant_id","scope"}')
base_url = cfg["base_url"].rstrip("/")
ok("secret", f"noit/cipp loaded (base_url={base_url})")  # no secret printed


# ── 2. Acquire token ──────────────────────────────────────────────────────────
token_url = f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/token"
body = urllib.parse.urlencode({
    "client_id": cfg["client_id"],
    "client_secret": cfg["client_secret"],
    "grant_type": "client_credentials",
    "scope": cfg["scope"],
}).encode()
try:
    req = urllib.request.Request(token_url, data=body,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        token = json.loads(resp.read())["access_token"]
    ok("token", "app-only token acquired")
except urllib.error.HTTPError as e:
    detail = e.read().decode("utf8", "replace")[:300]
    fail("token", f"HTTP {e.code}", detail)
except Exception as e:  # noqa: BLE001
    fail("token", f"{type(e).__name__}: {e}",
         "If 'Host not in allowlist': login.microsoftonline.com should already be allowed")


# ── 3. Call ListTenants ───────────────────────────────────────────────────────
list_url = f"{base_url}/api/ListTenants"
try:
    req = urllib.request.Request(list_url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
except urllib.error.HTTPError as e:
    detail = e.read().decode("utf8", "replace")[:300]
    fail("ListTenants", f"HTTP {e.code}", detail or
         "403 ⇒ the CIPP API client role lacks access to ListTenants")
except Exception as e:  # noqa: BLE001
    fail("ListTenants", f"{type(e).__name__}: {e}",
         f"If 'Host not in allowlist': add {urllib.parse.urlparse(base_url).hostname} to the network policy")

tenants = data if isinstance(data, list) else data.get("value", data)
count = len(tenants) if isinstance(tenants, list) else "?"
ok("ListTenants", f"{count} tenants returned")
if isinstance(tenants, list):
    for t in tenants[:5]:
        name = t.get("displayName") or t.get("Tenant") or "?"
        tid = t.get("customerId") or t.get("TenantId") or "?"
        print(f"   - {name}: {tid}")
    if len(tenants) > 5:
        print(f"   … and {len(tenants) - 5} more")
print("\n🎉 CIPP access verified end-to-end.")
