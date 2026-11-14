# RedSight — mars.roben.club

Cinematic mission-briefing site for **RedSight**, RobEn's entry in NASA Space Apps 2026
("Interplanetary Survival Guide: Martian Map"). Dark space, scroll-choreographed 3D Mars,
HUD telemetry, Syne/Switzer/IBM Plex Mono. Static export — hosts anywhere; configured for
the RobEn Contabo VPS.

## Crew quick-start

```bash
npm install        # once
npm run dev        # local preview → http://localhost:5199
npm run build      # production bundle → dist/
node scripts/shoot.mjs http://localhost:5199/?lite   # screenshot QA (needs system Chrome)
./deploy/deploy.sh deploy@CONTABO_IP                # build + rsync to the VPS
```

## The three switches you'll actually use — `src/main.js`

```js
const YOUTUBE_ID = '';  // pitch video — set when uploaded, e.g. 'aBcD123xYz'
const PDF_URL    = '';  // set to '/assets/RedSight-Proposal.pdf' and drop the file in public/assets/
const PPTX_URL   = '';  // set to '/assets/RedSight-Deck.pptx'
```
Locked document buttons unlock automatically when a URL is set. The video facade becomes
a click-to-load YouTube embed when `YOUTUBE_ID` is set.

## Where things live

| Path | What |
|---|---|
| `index.html` | All copy: hero, problem inventory, 3 modes, science, briefs, crew, RobEn, footer |
| `src/mars/scene.js` | Three.js scene + per-section camera keyframes (`CAM` — tune planet positions there) |
| `src/main.js` | Boot sequence, Lenis smooth scroll, reveals, tabs, video facade, choreography |
| `src/styles/` | tokens (Rust & Void palette) · base · sections · fonts |
| `public/textures/` | Mars globe texture — **Solar System Scope, CC BY 4.0** (keep the footer credit) |
| `deploy/` | nginx site config + rsync deploy script for the Contabo VPS |
| `DESIGN.md` | The design system — read before changing styles |

## VPS setup (first time)

1. DNS: `mars.roben.club` A-record → Contabo VPS IP.
2. `sudo mkdir -p /var/www/mars.roben.club && sudo chown $USER /var/www/mars.roben.club`
3. Install nginx config: see header of `deploy/redsight.conf`.
4. TLS: `sudo certbot --nginx -d mars.roben.club` (redirects HTTP→HTTPS automatically).

## Compliance (do not remove)

- Footer disclaimer: independent project, not NASA-affiliated/endorsed. **Never** add NASA
  meatball/worm logos; textual credit "NASA / JPL / USGS / ASU / PSI" is correct and required.
- No copyrighted audio/images. NASA material is public domain where marked; the globe texture
  is CC BY 4.0 (attributed in footer).
- License: site code MIT. Fonts OFL (Syne, Switzer, IBM Plex Mono — self-hosted in `public/fonts/`).
