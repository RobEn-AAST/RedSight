# Deploy — https://mars.roben.club

Two sites on one domain: the **landing page** ([`landing/`](../landing/)) at `/`, whose big
**Demo the website** button opens the **RedSight app** ([`app/`](../app/), built with base `/demo/`) at `/demo/`.

Every push to `main` runs [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): lint →
build → data check → backend tests on GitHub, then it SSHes into the `roben` VPS and runs
[`remote-deploy.sh`](remote-deploy.sh). The **VPS pulls `main` and builds itself**; nothing large is uploaded.
Manual redeploy: `ssh roben 'bash ~/apps/redsight/deploy/remote-deploy.sh'` (or "Run workflow" in Actions).

## Layout on the VPS (user `roben`, no sudo needed after the one-time setup)

| Path | What | Updated by |
|---|---|---|
| `~/apps/redsight` | git clone of this repo, reset to `origin/main` | every deploy |
| `/var/www/mars.roben.club` | built `landing/dist` (nginx web root) | every deploy (`demo/` kept) |
| `/var/www/mars.roben.club/demo` | built `app/dist` (base `/demo/`) | every deploy (`tiles/` kept) |
| `/var/www/mars.roben.club/demo/tiles` | map XYZ tiles (git-ignored) | [`upload-assets.sh`](upload-assets.sh) |
| `~/apps/redsight-data/engine-pilot` | hash-checked terrain bundle (git-ignored) | [`upload-assets.sh`](upload-assets.sh) |
| `~/apps/redsight/data/processed/themis_ti_10m.npy` | THEMIS sand grid for the live router's sand weight (git-ignored) | [`upload-assets.sh`](upload-assets.sh) |
| `~/apps/redsight.env` | provider keys (`GROQ_API_KEY` / `GEMINI_API_KEY`), mode 600 | by hand, never in git |
| `~/apps/redsight-venv`, `~/.local/opt/node` | Python venv (engine), Node 24 LTS | bootstrap / deploy |

Services (systemd **user** units in [`systemd/`](systemd/)): `redsight-copilot` (Node, `127.0.0.1:8788`,
chat + STT + TTS) and `redsight-engine` (FastAPI routing, `127.0.0.1:8790`). nginx
([`nginx/mars.roben.club.conf`](nginx/mars.roben.club.conf)) serves both static sites and proxies `/api/` to the copilot.

```bash
ssh roben 'systemctl --user status redsight-copilot redsight-engine'
ssh roben 'journalctl --user -u redsight-copilot -n 50'
```

## Voice (STT / TTS)

Set the key in `~/apps/redsight.env`, then `systemctl --user restart redsight-copilot`:
`GROQ_API_KEY=gsk_…` gives chat, cloud STT (Whisper) and cloud TTS (Orpheus; accept its terms once in
the Groq console). Gemini only gives chat, so dictation falls back to in-browser Whisper and replies
are spoken with the browser voice. Check: `curl https://mars.roben.club/api/copilot/health`.

## One-time bootstrap (already done on 2026-11-14)

1. Node 24 LTS in `~/.local/opt/node`, venv in `~/apps/redsight-venv`, repo cloned to `~/apps/redsight`.
2. `bash deploy/upload-assets.sh` from a machine that has the tiles and terrain bundle.
3. `ssh -t roben 'sudo bash ~/apps/redsight/deploy/setup-root.sh'`: installs the nginx site (with `/api`
   proxy) and enables linger so the user services start at boot. This is the only step that needs sudo.
4. CI secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (a dedicated `restrict`ed key in roben's
   `authorized_keys`, comment `redsight-ci-deploy`), `VPS_KNOWN_HOSTS`.

The landing page source came from the team's Nov 6 site (same build that was live). A copy of that site was archived to `~/backups/mars-old-site-20261114-074155.tar.gz` before removal.
