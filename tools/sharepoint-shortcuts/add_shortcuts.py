#!/usr/bin/env python3
"""Add KreweConnect Directory / Org Chart shortcuts to client SharePoint portals.

For each client tenant this adds (or updates) a "Quick links" web part titled
"Employee Directory & Org Chart" on the client's SharePoint portal page, with
two links into KreweConnect:

    Employee Directory  -> https://krewesuite.noitgroup.com/app/kreweconnect/directory
    Org Chart           -> https://krewesuite.noitgroup.com/app/kreweconnect/org-chart

Everything goes through Microsoft Graph v1.0 (sitePage / webPart APIs) as the
single-purpose multi-tenant app "NOIT KreweConnect Shortcuts"
(client id cf03866e-22d1-433f-84cb-bb08aee083c6), whose manifest holds ONLY
Graph application permission Sites.ReadWrite.All. A client tenant must
admin-consent that app once before the write works there (--consent-urls
prints the link for each tenant; --status shows who has consented).

Auth (in order of preference):
  1. SHORTCUTS_CLIENT_SECRET env var  - use it directly.
  2. AWS Secrets Manager (noit/0626_MSClaudeAgent, the Taila agent) - mint an
     EPHEMERAL secret on the shortcuts app via addPassword, use it for the
     run, then removePassword. No long-lived secret exists anywhere.

Roster:
  This repo is PUBLIC, so the client roster does NOT live here. The tenant
  list is read at runtime from the krewesuite SWA's CLIENT_TENANTS app
  setting (via ARM as the Taila agent — the same authoritative source the
  app itself uses). To override (subset, site/page targeting), drop a
  clients.local.json next to this script (gitignored):
    {"clients": [{"name": "...", "tenantId": "...",
                  "site": "/sites/intranet", "page": "Portal.aspx"}]}

Safety:
  - Idempotent: an existing web part with our title (or our link URLs) is
    updated in place, never duplicated.
  - Home-page edits append a new one-column section at the bottom; nothing
    existing is modified. SharePoint page versioning makes this revertible
    (Site Pages library > version history).
  - --dry-run shows what would happen; --status / --consent-urls are read-only.

Usage:
  python3 add_shortcuts.py --status
  python3 add_shortcuts.py --consent-urls
  python3 add_shortcuts.py --apply [--tenant "Geaux Automotive"] [--dry-run]
  python3 add_shortcuts.py --apply --new-page          # dedicated page instead of home page
  python3 add_shortcuts.py --self-test                 # NOIT-tenant end-to-end test (as Taila)
"""

import argparse
import base64
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SHORTCUTS_APP_ID = os.environ.get("SHORTCUTS_CLIENT_ID", "cf03866e-22d1-433f-84cb-bb08aee083c6")
TAILA_APP_ID = "90f52d62-9133-47e0-a6a1-45c9bec69558"
NOIT_TENANT = "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e"
TAILA_SECRET_NAME = "noit/0626_MSClaudeAgent"
CONSENT_REDIRECT = "https://krewesuite.noitgroup.com/app/kreweconnect/"

APP_BASE = "https://krewesuite.noitgroup.com/app/kreweconnect"
LINKS = [
    ("Employee Directory", f"{APP_BASE}/directory"),
    ("Org Chart", f"{APP_BASE}/org-chart"),
]
WEBPART_TITLE = "Employee Directory & Org Chart"
QUICKLINKS_TYPE = "c70391ea-0b10-4ee9-b2b4-006d3fcad0cd"
GRAPH = "https://graph.microsoft.com/v1.0"

# krewesuite SWA (holds CLIENT_TENANTS); subscription/RG are infrastructure
# identifiers, not secrets. Override if the SWA ever moves.
KREWESUITE_RESOURCE_ID = os.environ.get(
    "KREWESUITE_RESOURCE_ID",
    "/subscriptions/567260a7-531c-4353-a469-e2b1086d485b/resourceGroups/krewesuite_group"
    "/providers/Microsoft.Web/staticSites/krewesuite",
)

LOCAL_CLIENTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "clients.local.json")


# ---------------------------------------------------------------- HTTP / auth

def _http(url, method="GET", body=None, headers=None, form=None):
    """HTTP with retries. Returns (status, parsed-json-or-text)."""
    data = None
    headers = dict(headers or {})
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
    elif body is not None:
        data = json.dumps(body).encode()
        headers.setdefault("Content-Type", "application/json")
    elif method == "POST":
        data = b""
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                try:
                    return r.status, json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    return r.status, raw.decode(errors="replace")
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                return e.code, raw[:600]
        except (urllib.error.URLError, ConnectionError, OSError):
            if attempt == 4:
                raise
            time.sleep(2 ** attempt)


def get_token(tenant, client_id, client_secret, scope="https://graph.microsoft.com/.default"):
    """Client-credentials token. Returns (token, error-string)."""
    st, res = _http(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        method="POST",
        form={
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": scope,
            "grant_type": "client_credentials",
        },
    )
    if st == 200:
        return res["access_token"], None
    desc = res.get("error_description", str(res))[:200] if isinstance(res, dict) else str(res)[:200]
    return None, f"HTTP {st}: {desc}"


def token_roles(token):
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return sorted(json.loads(base64.urlsafe_b64decode(payload)).get("roles", []))


def graph(token, path, method="GET", body=None):
    return _http(
        GRAPH + path,
        method=method,
        body=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json;odata.metadata=none",
        },
    )


def taila_secret():
    """Taila's client secret: env var, else AWS Secrets Manager."""
    env = os.environ.get("TAILA_CLIENT_SECRET")
    if env:
        return env
    import boto3  # only needed for the AWS path

    raw = boto3.client("secretsmanager", region_name="us-east-1").get_secret_value(
        SecretId=TAILA_SECRET_NAME
    )["SecretString"]
    d = json.loads(raw)
    # Known storage quirk: the secret VALUE may be stored as the JSON key.
    return d.get("clientSecret") or next(iter(d.keys()))


class ShortcutsAppAuth:
    """Token source for the shortcuts app across tenants.

    Uses SHORTCUTS_CLIENT_SECRET if set; otherwise mints an ephemeral secret
    on the app (as Taila) and removes it again when close() runs.
    """

    def __init__(self):
        self.secret = os.environ.get("SHORTCUTS_CLIENT_SECRET")
        self._ephemeral_key_id = None
        self._app_object_id = None
        self._taila_token = None

    def ensure_secret(self):
        if self.secret:
            return
        print("  (minting ephemeral secret on the shortcuts app via Taila...)")
        tsec = taila_secret()
        self._taila_token, err = get_token(NOIT_TENANT, TAILA_APP_ID, tsec)
        if err:
            raise RuntimeError(f"Taila token failed: {err}")
        st, app = graph(self._taila_token, f"/applications(appId='{SHORTCUTS_APP_ID}')?$select=id")
        if st != 200:
            raise RuntimeError(f"cannot find shortcuts app object: {st} {app}")
        self._app_object_id = app["id"]
        end = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        st, cred = graph(
            self._taila_token,
            f"/applications/{self._app_object_id}/addPassword",
            "POST",
            {"passwordCredential": {"displayName": "ephemeral-shortcuts-run", "endDateTime": end}},
        )
        if st != 200:
            raise RuntimeError(f"addPassword failed: {st} {cred}")
        self.secret = cred["secretText"]
        self._ephemeral_key_id = cred["keyId"]
        # Wait for the new secret to propagate (usually < 60s).
        for i in range(24):
            tok, err = get_token(NOIT_TENANT, SHORTCUTS_APP_ID, self.secret)
            if tok:
                return
            time.sleep(5)
        raise RuntimeError(f"ephemeral secret never became usable: {err}")

    def token_for(self, tenant):
        self.ensure_secret()
        tok, err = get_token(tenant, SHORTCUTS_APP_ID, self.secret)
        # A freshly minted ephemeral secret can take longer to replicate to
        # some tenants' token endpoints than to NOIT's; AADSTS7000215 there
        # is transient, not a real credential problem.
        attempts = 0
        while not tok and self._ephemeral_key_id and "7000215" in (err or "") and attempts < 4:
            time.sleep(15)
            tok, err = get_token(tenant, SHORTCUTS_APP_ID, self.secret)
            attempts += 1
        return tok, err

    def close(self):
        if self._ephemeral_key_id and self._taila_token:
            st, res = graph(
                self._taila_token,
                f"/applications/{self._app_object_id}/removePassword",
                "POST",
                {"keyId": self._ephemeral_key_id},
            )
            label = "removed" if st in (200, 204) else f"REMOVAL FAILED ({st}) - remove manually in Entra"
            print(f"  (ephemeral secret {label})")
            self._ephemeral_key_id = None


# ------------------------------------------------------------- page plumbing

def find_site(token, site_path=None):
    """Return the target site object. Default: the tenant root site."""
    if site_path:
        st, root = graph(token, "/sites/root?$select=siteCollection,webUrl")
        if st != 200:
            return None, f"root site lookup failed: {st} {root}"
        host = root["siteCollection"]["hostname"]
        st, site = graph(token, f"/sites/{host}:{site_path}")
    else:
        st, site = graph(token, "/sites/root")
    if st != 200:
        return None, f"site lookup failed: {st} {site}"
    return site, None


def list_pages(token, site_id):
    st, pages = graph(token, f"/sites/{site_id}/pages/microsoft.graph.sitePage?$select=id,name,title,webUrl")
    if st != 200:
        return None, f"page list failed: {st} {pages}"
    return pages.get("value", []), None


def pick_home_page(pages, page_name=None):
    if page_name:
        for p in pages:
            if p["name"].lower() == page_name.lower():
                return p, None
        return None, f"page '{page_name}' not found; pages: {[p['name'] for p in pages]}"
    for p in pages:
        if p["name"].lower() == "home.aspx":
            return p, None
    if len(pages) == 1:
        return pages[0], None
    return None, f"no Home.aspx; specify 'page' in clients.json. Pages: {[p['name'] for p in pages]}"


def quicklinks_webpart(site_id, links, base_url):
    """Quick Links web part payload, shaped exactly like a live instance
    read back through Graph (see README: schema captured from TABCC)."""
    _, site_guid, web_guid = (site_id.split(",") + ["", ""])[:3]
    items, texts, hrefs = [], [{"key": "title", "value": WEBPART_TITLE}], [{"key": "baseUrl", "value": base_url}]
    for i, (title, url) in enumerate(links):
        items.append(
            {
                "id": i + 1,
                "altText": "",
                "thumbnailType": 3,
                "sourceItem": {"@odata.type": "#graph.Json", "itemType": 2, "fileExtension": "", "progId": ""},
            }
        )
        texts.append({"key": f"items[{i}].title", "value": title})
        hrefs.append({"key": f"items[{i}].sourceItem.url", "value": url})
    return {
        "@odata.type": "#microsoft.graph.standardWebPart",
        "webPartType": QUICKLINKS_TYPE,
        "data": {
            "dataVersion": "2.2",
            "description": "Add links to important documents and pages.",
            "title": "Quick links",
            "properties": {
                "layoutId": "CompactCard",
                "imageWidth": 100,
                "shouldShowThumbnail": True,
                "isMigrated": True,
                "hideWebPartWhenEmpty": True,
                "dataProviderId": "QuickLinks",
                "webId": web_guid,
                "siteId": site_guid,
                "items@odata.type": "#Collection(graph.Json)",
                "items": items,
                "listLayoutOptions": {"@odata.type": "#graph.Json", "showDescription": False, "showIcon": True},
                "buttonLayoutOptions": {
                    "@odata.type": "#graph.Json",
                    "showDescription": False,
                    "buttonTreatment": 2,
                    "iconPositionType": 2,
                    "textAlignmentVertical": 2,
                    "textAlignmentHorizontal": 2,
                    "linesOfText": 2,
                },
                "waffleLayoutOptions": {"@odata.type": "#graph.Json", "iconSize": 1, "onlyShowThumbnail": False},
            },
            "serverProcessedContent": {
                "htmlStrings": [],
                "searchablePlainTexts": texts,
                "links": hrefs,
                "imageSources": [],
            },
        },
    }


def find_existing_shortcut(token, site_id, page_id):
    """Return the id of a web part we previously placed on this page, if any."""
    st, wps = graph(token, f"/sites/{site_id}/pages/{page_id}/microsoft.graph.sitePage/webParts")
    if st != 200:
        return None
    for wp in wps.get("value", []):
        data = wp.get("data") or {}
        spc = data.get("serverProcessedContent") or {}
        texts = {t.get("key"): t.get("value") for t in spc.get("searchablePlainTexts") or []}
        hrefs = [l.get("value") for l in spc.get("links") or []]
        if texts.get("title") == WEBPART_TITLE or LINKS[0][1] in hrefs:
            return wp["id"]
    return None


def append_section_with_webpart(token, site_id, page_id, webpart):
    """Append a one-column section at the bottom of the page and put the web part in it."""
    base = f"/sites/{site_id}/pages/{page_id}/microsoft.graph.sitePage"
    st, layout = graph(token, f"{base}/canvasLayout?$expand=horizontalSections")
    existing = (layout.get("horizontalSections") or []) if st == 200 else []
    next_id = str(int(max([float(s.get("id", 0)) for s in existing] or [0])) + 1)
    st, sec = graph(
        token,
        f"{base}/canvasLayout/horizontalSections",
        "POST",
        {"layout": "oneColumn", "id": next_id, "emphasis": "none"},
    )
    if st not in (200, 201):
        return f"section create failed: {st} {sec}"
    sec_id = sec.get("id", next_id)
    st, cols = graph(token, f"{base}/canvasLayout/horizontalSections/{sec_id}/columns")
    if st != 200 or not cols.get("value"):
        return f"column lookup failed: {st} {cols}"
    col_id = cols["value"][0]["id"]
    st, wp = graph(
        token,
        f"{base}/canvasLayout/horizontalSections/{sec_id}/columns/{col_id}/webparts",
        "POST",
        webpart,
    )
    if st not in (200, 201):
        return f"webpart create failed: {st} {wp}"
    return None


def publish(token, site_id, page_id):
    st, res = graph(token, f"/sites/{site_id}/pages/{page_id}/microsoft.graph.sitePage/publish", "POST")
    return None if st in (200, 204) else f"publish failed: {st} {res}"


def create_shortcut_page(token, site_id, webpart, name="KreweConnect.aspx", title="Employee Directory & Org Chart"):
    body = {
        "@odata.type": "#microsoft.graph.sitePage",
        "name": name,
        "title": title,
        "pageLayout": "article",
        "titleArea": {
            "enableGradientEffect": True,
            "imageWebUrl": "",
            "layout": "plain",
            "showAuthor": False,
            "showPublishedDate": False,
            "showTextBlockAboveTitle": False,
            "textAboveTitle": "",
            "textAlignment": "left",
            "title": title,
        },
        "canvasLayout": {
            "horizontalSections": [
                {
                    "layout": "oneColumn",
                    "id": "1",
                    "emphasis": "none",
                    "columns": [{"id": "1", "width": 12, "webparts": [webpart]}],
                }
            ]
        },
    }
    st, page = graph(token, f"/sites/{site_id}/pages", "POST", body)
    if st != 201:
        return None, f"page create failed: {st} {page}"
    return page, None


# ------------------------------------------------------------------ commands

def load_clients():
    if os.path.exists(LOCAL_CLIENTS_FILE):
        with open(LOCAL_CLIENTS_FILE) as f:
            return json.load(f)["clients"]
    # Roster is kept OUT of this public repo: read CLIENT_TENANTS from the
    # krewesuite SWA at runtime (same source the deployed app uses).
    tok, err = get_token(
        NOIT_TENANT, TAILA_APP_ID, taila_secret(), scope="https://management.azure.com/.default"
    )
    if err:
        raise RuntimeError(f"ARM token for roster lookup failed: {err}")
    st, res = _http(
        f"https://management.azure.com{KREWESUITE_RESOURCE_ID}/listAppSettings?api-version=2023-01-01",
        method="POST",
        headers={"Authorization": f"Bearer {tok}"},
    )
    if st != 200:
        raise RuntimeError(f"listAppSettings failed: {st} {str(res)[:200]}")
    entries = json.loads(res["properties"]["CLIENT_TENANTS"])
    return [{"name": e["name"], "tenantId": e["id"]} for e in entries]


def consent_url(tenant_id):
    q = urllib.parse.urlencode({"client_id": SHORTCUTS_APP_ID, "redirect_uri": CONSENT_REDIRECT})
    return f"https://login.microsoftonline.com/{tenant_id}/adminconsent?{q}"


def cmd_consent_urls(clients):
    print(f"Admin-consent URLs for the shortcuts app ({SHORTCUTS_APP_ID}).")
    print("Grant with a Global Admin of the client tenant, or via GDAP:")
    print("admin.microsoft.com > customer > Entra admin center > Enterprise apps.\n")
    for c in clients:
        print(f"{c['name']}:\n  {consent_url(c['tenantId'])}\n")


def cmd_status(clients, auth):
    print(f"{'Tenant':<20} {'Token':<8} {'Sites.RW':<9} Site / page / existing shortcut")
    for c in clients:
        tok, err = auth.token_for(c["tenantId"])
        if not tok:
            consent_codes = ("700016", "7000229", "500011", "65001")
            reason = "consent needed" if any(c in (err or "") for c in consent_codes) else err
            print(f"{c['name']:<20} {'no':<8} {'-':<9} {reason}")
            continue
        roles = token_roles(tok)
        rw = "yes" if "Sites.ReadWrite.All" in roles else "NO"
        if rw == "NO":
            print(f"{c['name']:<20} {'yes':<8} {rw:<9} consent needed (roles={roles})")
            continue
        site, err = find_site(tok, c.get("site"))
        if err:
            print(f"{c['name']:<20} {'yes':<8} {rw:<9} {err}")
            continue
        pages, err = list_pages(tok, site["id"])
        if err:
            print(f"{c['name']:<20} {'yes':<8} {rw:<9} {site['webUrl']} | {err}")
            continue
        page, perr = pick_home_page(pages, c.get("page"))
        if perr:
            print(f"{c['name']:<20} {'yes':<8} {rw:<9} {site['webUrl']} | {perr}")
            continue
        existing = find_existing_shortcut(tok, site["id"], page["id"])
        state = "shortcut PRESENT" if existing else "shortcut absent"
        print(f"{c['name']:<20} {'yes':<8} {rw:<9} {site['webUrl']} | {page['name']} | {state}")


def apply_to_tenant(name, token, site_override, page_override, dry_run, new_page):
    site, err = find_site(token, site_override)
    if err:
        return f"{name}: {err}"
    site_rel = urllib.parse.urlparse(site["webUrl"]).path or "/"
    wp = quicklinks_webpart(site["id"], LINKS, site_rel)

    if new_page:
        if dry_run:
            print(f"{name}: DRY RUN - would create page KreweConnect.aspx on {site['webUrl']}")
            return None
        page, err = create_shortcut_page(token, site["id"], wp)
        if err:
            return f"{name}: {err}"
        err = publish(token, site["id"], page["id"])
        if err:
            return f"{name}: {err}"
        print(f"{name}: created + published {page.get('webUrl', page['id'])}")
        return None

    pages, err = list_pages(token, site["id"])
    if err:
        return f"{name}: {err}"
    page, err = pick_home_page(pages, page_override)
    if err:
        return f"{name}: {err}"
    existing = find_existing_shortcut(token, site["id"], page["id"])
    if dry_run:
        action = "update existing web part" if existing else "append new section + web part"
        print(f"{name}: DRY RUN - would {action} on {page.get('webUrl', page['name'])} and publish")
        return None
    if existing:
        st, res = graph(
            token,
            f"/sites/{site['id']}/pages/{page['id']}/microsoft.graph.sitePage/webParts/{existing}",
            "PATCH",
            {"@odata.type": "#microsoft.graph.standardWebPart", "data": wp["data"]},
        )
        if st != 200:
            return f"{name}: webpart update failed: {st} {res}"
        verb = "updated existing shortcut on"
    else:
        err = append_section_with_webpart(token, site["id"], page["id"], wp)
        if err:
            return f"{name}: {err}"
        verb = "added shortcut section to"
    err = publish(token, site["id"], page["id"])
    if err:
        return f"{name}: {err}"
    print(f"{name}: {verb} {page.get('webUrl', page['name'])} and published")
    return None


def cmd_apply(clients, auth, only, dry_run, new_page):
    failures = []
    for c in clients:
        if only and c["name"].lower() != only.lower():
            continue
        tok, err = auth.token_for(c["tenantId"])
        if not tok:
            failures.append(f"{c['name']}: no token ({err}) - run --consent-urls and consent first")
            continue
        if "Sites.ReadWrite.All" not in token_roles(tok):
            failures.append(f"{c['name']}: consented but Sites.ReadWrite.All not granted - re-consent")
            continue
        err = apply_to_tenant(c["name"], tok, c.get("site"), c.get("page"), dry_run, new_page)
        if err:
            failures.append(err)
    for f in failures:
        print("FAIL:", f, file=sys.stderr)
    return 1 if failures else 0


def cmd_self_test(dry_run):
    """End-to-end test in the NOIT tenant: writes a standalone test page on the
    TABCC site as Taila (which already has Sites.ReadWrite.All there), and
    exercises the ephemeral-secret machinery on the shortcuts app."""
    print("[1/2] ephemeral-secret round trip on the shortcuts app...")
    auth = ShortcutsAppAuth()
    try:
        tok, err = auth.token_for(NOIT_TENANT)
        print("  token minted OK" if tok else f"  FAILED: {err}")
    finally:
        auth.close()

    print("[2/2] Quick Links write path (as Taila, NOIT TABCC site)...")
    tok, err = get_token(NOIT_TENANT, TAILA_APP_ID, taila_secret())
    if err:
        print("  Taila token failed:", err)
        return 1
    site, err = find_site(tok, "/sites/tabcc")
    if err:
        print(" ", err)
        return 1
    site_rel = urllib.parse.urlparse(site["webUrl"]).path or "/"
    wp = quicklinks_webpart(site["id"], LINKS, site_rel)
    if dry_run:
        print(f"  DRY RUN - would create kreweconnect-shortcuts-test.aspx on {site['webUrl']}")
        return 0
    pages, _ = list_pages(tok, site["id"])
    existing = next((p for p in pages or [] if p["name"] == "kreweconnect-shortcuts-test.aspx"), None)
    if existing:
        page_id = existing["id"]
        found = find_existing_shortcut(tok, site["id"], page_id)
        print(f"  test page already exists ({existing.get('webUrl')}); shortcut {'present' if found else 'ABSENT'}")
        return 0
    page, err = create_shortcut_page(
        tok, site["id"], wp, name="kreweconnect-shortcuts-test.aspx", title="KreweConnect Shortcuts (test)"
    )
    if err:
        print(" ", err)
        return 1
    err = publish(tok, site["id"], page["id"])
    if err:
        print(" ", err)
        return 1
    found = find_existing_shortcut(tok, site["id"], page["id"])
    print(f"  created + published {page.get('webUrl', page['id'])}")
    print(f"  read-back verification: shortcut web part {'FOUND' if found else 'MISSING'}")
    return 0 if found else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--status", action="store_true", help="per-tenant consent + target readiness")
    g.add_argument("--consent-urls", action="store_true", help="print admin-consent URLs")
    g.add_argument("--apply", action="store_true", help="add/update the shortcut web part + publish")
    g.add_argument("--self-test", action="store_true", help="end-to-end test against NOIT TABCC site")
    ap.add_argument("--tenant", help="limit --apply/--status to one client name")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--new-page", action="store_true", help="create a dedicated KreweConnect.aspx instead of editing the home page")
    args = ap.parse_args()

    clients = load_clients()
    if args.tenant:
        clients = [c for c in clients if c["name"].lower() == args.tenant.lower()] or sys.exit(
            f"unknown tenant '{args.tenant}'"
        )

    if args.consent_urls:
        return cmd_consent_urls(clients)
    if args.self_test:
        return sys.exit(cmd_self_test(args.dry_run))

    auth = ShortcutsAppAuth()
    try:
        if args.status:
            return cmd_status(clients, auth)
        return sys.exit(cmd_apply(clients, auth, args.tenant, args.dry_run, args.new_page))
    finally:
        auth.close()


if __name__ == "__main__":
    main()
