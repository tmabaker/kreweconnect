#!/usr/bin/env python3
"""Back up the NOIT GitHub estate to SharePoint.

For each repo: mirror-clone from GitHub, create a git bundle (all refs, full
history), verify it, then upload everything plus a manifest and SHA256 file to
the TABCC SharePoint site under "GitHub Backups/<date>/".

Credential sources (first match wins):
  1. Env vars MSGRAPH_CLIENT_ID / MSGRAPH_CLIENT_SECRET / MSGRAPH_TENANT_ID
  2. AWS Secrets Manager secret noit/0626_MSClaudeAgent (Taila Agent).
     Accepts proper {"clientId","clientSecret","tenantId"} shape or the
     legacy inverted shape where the JSON *key* is the secret value.

Graph permission required (Application): Sites.ReadWrite.All, or
Sites.Selected with a write grant on the tabcc site.

GitHub clone auth: BACKUP_GH_PAT or GH_TOKEN env var, or set
GH_CLONE_TEMPLATE to a full URL template containing {repo} (used verbatim,
e.g. the Claude session git proxy "http://local_proxy@127.0.0.1:PORT/git/tmabaker/{repo}").
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import date

REPOS = [
    "noit-techtools",
    "kreweconnect",
    "noit-client-tools",
    "cippms",
    "noit-techportal",
    "killer-tools-site",
    "skoolskills",
    "krewecatch",
    "krewesuite",
]

GITHUB_OWNER = "tmabaker"
SP_HOSTNAME = "noseitgroup.sharepoint.com"
SP_SITE_PATH = "/sites/tabcc"
SP_BACKUP_ROOT = "GitHub Backups"
NOIT_TENANT_ID = "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e"
CHUNK = 10 * 1024 * 1024  # Graph requires upload chunks in 320 KiB multiples

GRAPH = "https://graph.microsoft.com/v1.0"


def log(msg):
    print(f"[backup] {msg}", flush=True)


def die(msg, code=1):
    print(f"[backup] FATAL: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


# --- credentials -----------------------------------------------------------

def get_graph_credentials():
    cid = os.environ.get("MSGRAPH_CLIENT_ID")
    sec = os.environ.get("MSGRAPH_CLIENT_SECRET")
    tid = os.environ.get("MSGRAPH_TENANT_ID", NOIT_TENANT_ID)
    if cid and sec:
        log("using Graph credentials from MSGRAPH_* env vars")
        return cid, sec, tid

    try:
        import boto3  # optional dependency; only needed for the AWS path
        raw = boto3.client(
            "secretsmanager",
            region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        ).get_secret_value(SecretId="noit/0626_MSClaudeAgent")["SecretString"]
        payload = json.loads(raw)
        if "clientSecret" in payload:
            log("using Taila Agent credentials from AWS (standard shape)")
            return (
                payload["clientId"],
                payload["clientSecret"],
                payload.get("tenantId", NOIT_TENANT_ID),
            )
        # legacy inverted shape: {"<secret-value>": "<secret-id>"}
        log("using Taila Agent credentials from AWS (inverted shape)")
        return (
            "90f52d62-9133-47e0-a6a1-45c9bec69558",
            next(iter(payload.keys())),
            NOIT_TENANT_ID,
        )
    except Exception as e:  # noqa: BLE001 - report and fall through to die()
        die(
            "no Graph credentials: MSGRAPH_* env vars unset and AWS path "
            f"failed ({type(e).__name__}). Configure one of the two — see "
            "README.md in this directory."
        )


def mint_token(cid, sec, tid):
    body = urllib.parse.urlencode(
        {
            "client_id": cid,
            "client_secret": sec,
            "grant_type": "client_credentials",
            "scope": "https://graph.microsoft.com/.default",
        }
    ).encode()
    req = urllib.request.Request(
        f"https://login.microsoftonline.com/{tid}/oauth2/v2.0/token", data=body
    )
    with urllib.request.urlopen(req) as r:
        tok = json.load(r)["access_token"]
    # fail early with a useful message if the app lacks a Sites permission
    claims = json.loads(
        _b64pad(tok.split(".")[1])
    )
    roles = claims.get("roles", [])
    if not any(r.startswith(("Sites.", "Files.")) for r in roles):
        die(
            f"token minted but has no Sites/Files role (roles={roles}). "
            "Grant Application permission Sites.ReadWrite.All (or "
            "Sites.Selected + site grant) and admin-consent it."
        )
    log(f"token OK; roles include {[r for r in roles if r.startswith(('Sites.', 'Files.'))]}")
    return tok


def _b64pad(seg):
    import base64

    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


# --- Graph helpers ---------------------------------------------------------

def graph(token, method, url, body=None, headers=None, raw=False):
    h = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        data = body if raw else json.dumps(body).encode()
        h["Content-Type"] = "application/octet-stream" if raw else "application/json"
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(req) as r:
        txt = r.read()
        return json.loads(txt) if txt else {}


def resolve_drive(token):
    site = graph(token, "GET", f"{GRAPH}/sites/{SP_HOSTNAME}:{SP_SITE_PATH}")
    drive = graph(token, "GET", f"{GRAPH}/sites/{site['id']}/drive")
    log(f"target drive: {drive['webUrl']}")
    return drive["id"]


def ensure_folder(token, drive_id, path):
    """Create each segment of `path` under the drive root (idempotent)."""
    parent = "root"
    for seg in path.split("/"):
        try:
            item = graph(
                token,
                "POST",
                f"{GRAPH}/drives/{drive_id}/items/{parent}/children",
                {
                    "name": seg,
                    "folder": {},
                    "@microsoft.graph.conflictBehavior": "fail",
                },
            )
        except urllib.error.HTTPError as e:
            if e.code != 409:
                raise
            enc = urllib.parse.quote(seg)
            base = (
                f"{GRAPH}/drives/{drive_id}/root:/{urllib.parse.quote(path.split(seg)[0] + seg)}"
                if parent != "root"
                else f"{GRAPH}/drives/{drive_id}/root:/{enc}"
            )
            item = graph(token, "GET", base)
        parent = item["id"]
    return parent


def upload_file(token, drive_id, folder_id, local_path):
    name = os.path.basename(local_path)
    size = os.path.getsize(local_path)
    session = graph(
        token,
        "POST",
        f"{GRAPH}/drives/{drive_id}/items/{folder_id}:/{urllib.parse.quote(name)}:/createUploadSession",
        {"item": {"@microsoft.graph.conflictBehavior": "replace", "name": name}},
    )
    url = session["uploadUrl"]
    with open(local_path, "rb") as f:
        offset = 0
        while offset < size:
            chunk = f.read(CHUNK)
            end = offset + len(chunk) - 1
            req = urllib.request.Request(
                url,
                data=chunk,
                method="PUT",
                headers={
                    "Content-Length": str(len(chunk)),
                    "Content-Range": f"bytes {offset}-{end}/{size}",
                },
            )
            with urllib.request.urlopen(req):
                pass
            offset += len(chunk)
    log(f"uploaded {name} ({size / 1e6:.1f} MB)")


# --- git -------------------------------------------------------------------

def clone_url(repo):
    tpl = os.environ.get("GH_CLONE_TEMPLATE")
    if tpl:
        return tpl.format(repo=repo)
    tok = os.environ.get("BACKUP_GH_PAT") or os.environ.get("GH_TOKEN")
    if not tok:
        die("no GitHub credential: set BACKUP_GH_PAT, GH_TOKEN, or GH_CLONE_TEMPLATE")
    return f"https://x-access-token:{tok}@github.com/{GITHUB_OWNER}/{repo}.git"


def run(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def bundle_repos(workdir, stamp):
    bundles = []
    manifest_rows = []
    for repo in REPOS:
        mirror = os.path.join(workdir, f"{repo}.git")
        log(f"mirroring {repo}")
        run(["git", "clone", "--quiet", "--mirror", clone_url(repo), mirror])
        bundle = os.path.join(workdir, f"{repo}-{stamp}.bundle")
        run(["git", "-C", mirror, "bundle", "create", bundle, "--all"])
        run(["git", "-C", mirror, "bundle", "verify", bundle],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        refs = subprocess.run(
            ["git", "-C", mirror, "for-each-ref"],
            capture_output=True, text=True, check=True,
        ).stdout.count("\n")
        head = subprocess.run(
            ["git", "-C", mirror, "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()[:12]
        size = os.path.getsize(bundle)
        bundles.append(bundle)
        manifest_rows.append(f"| {repo} | {refs} | {head} | {size / 1e6:.1f} MB |")
        log(f"bundled {repo}: {refs} refs, HEAD {head}, {size / 1e6:.1f} MB")
    return bundles, manifest_rows


def write_sidecars(workdir, stamp, bundles, manifest_rows):
    sha_path = os.path.join(workdir, f"SHA256SUMS-{stamp}.txt")
    with open(sha_path, "w") as f:
        for b in bundles:
            h = hashlib.sha256()
            with open(b, "rb") as bf:
                for chunk in iter(lambda: bf.read(1 << 20), b""):
                    h.update(chunk)
            f.write(f"{h.hexdigest()}  {os.path.basename(b)}\n")
    man_path = os.path.join(workdir, f"MANIFEST-{stamp}.md")
    with open(man_path, "w") as f:
        f.write(f"# GitHub → SharePoint backup — {stamp}\n\n")
        f.write("Restore: `git clone <repo>.bundle` (bundles contain all refs).\n\n")
        f.write("| Repo | Refs | HEAD | Size |\n|---|---|---|---|\n")
        f.write("\n".join(manifest_rows) + "\n")
    return [sha_path, man_path]


def main():
    stamp = os.environ.get("BACKUP_STAMP") or date.today().isoformat()
    cid, sec, tid = get_graph_credentials()
    token = mint_token(cid, sec, tid)
    drive_id = resolve_drive(token)
    folder_id = ensure_folder(token, drive_id, f"{SP_BACKUP_ROOT}/{stamp}")

    with tempfile.TemporaryDirectory(prefix="ghbk-") as workdir:
        bundles, rows = bundle_repos(workdir, stamp)
        sidecars = write_sidecars(workdir, stamp, bundles, rows)
        for path in bundles + sidecars:
            upload_file(token, drive_id, folder_id, path)

    log(
        f"DONE: {len(bundles)} repos backed up to "
        f"https://{SP_HOSTNAME}{SP_SITE_PATH} → Shared Documents/{SP_BACKUP_ROOT}/{stamp}/"
    )


if __name__ == "__main__":
    main()
