# Competition Compliance — Remaining Items (2026-11-14)

Items from the NASA Space Apps 2026 global rules, Martian Map challenge rules, and Cairo 2026 local guidelines that are **not done**, **incomplete**, or **unverified** as of `2026-11-14`.

Sources: [`../../requirements/competition-requirements.md`](../../requirements/competition-requirements.md) · [`../../requirements/cairo-participant-guidance.md`](../../requirements/cairo-participant-guidance.md) · [`../../requirements/open-questions.md`](../../requirements/open-questions.md)

> **Status update (2026-11-14, integration owner session):** judged demo = the 7-slide PPTX
> ([`demo-production-plan.md`](demo-production-plan.md) §6), built; slide 6 waits on the copilot owner's
> real replies. PRs #13 and #15 merged; PRs #12/#14 conflict with `main` (owner asked to merge `main`).
> Still open: Cairo PDF, hosting + incognito link test, SI disclosure, credits.

---

## 1. Hard Submission Blockers

- [x] **Add an OSI-approved `LICENSE` file in the repo root.** *(Done 2026-11-14: Apache-2.0, adopted by the integration owner.)* Space Apps 2026 Terms require original content to be OSI-licensed (or restriction-free) with license documentation included. Currently no `LICENSE` file exists, and [`../../README.md`](../../README.md) still marks Apache-2.0 as pending team sign-off.
- [ ] **Create and host the Cairo Project Description PDF** (mandatory Cairo local requirement — judges receive no live pitch). Must be a real PDF (not `.docx`), written in English, and contain all 5 required sections from [`../../requirements/cairo-participant-guidance.md`](../../requirements/cairo-participant-guidance.md) §A:
  1. Project identity & summary (project name, team name, challenge, problem, solution, impact).
  2. Project details (step-by-step workflow, tools/languages/hardware, **explicit split of working features vs. limits/unfinished parts vs. future plans**).
  3. NASA data & resources (name, source URL, how used, and prep steps for each dataset actually shipped).
  4. Other resources & source credits (third-party data, libraries, fonts, textures, 3D models — see §2 below).
  5. AI / Super Intelligence (SI) disclosure (every tool, task, and affected artifact — see §2 below).
  - Host externally with a view-only public link (no login/permission request) and verify in an incognito browser; paste into the Cairo local submission's `project-documentation` field (delivery pool item `7a` in [`../team-plan.md`](../team-plan.md)).
- [ ] **Create and host the final judged Demo (≤ 30 s video OR ≤ 7 slides).** Exceeding 30 seconds or 7 slides makes the project **ineligible for Global Judging**.
  - [`demo-script.md`](demo-script.md) is still a draft written against mock routes, with screenshots unchecked and the video-vs-slides decision (`U2`) open. *(2026-11-14: decided — slides; see [`demo-production-plan.md`](demo-production-plan.md) §6.)*
  - If submitting **slides**: max 7 slides total (including title/intro), English, must include team name, all member names, and selected challenge, plus real screenshots/GIFs of the live app and honest prototype/future labels.
  - If submitting **video**: 30 seconds or less, English audio or English subtitles.
  - **Do not submit the 90-second video currently embedded in [`../../landing/src/main.js`](../../landing/src/main.js)** (`YOUTUBE_ID = '5RmfX-VD65E'`, labeled `PLAY PITCH — 90 SECONDS`) as the Space Apps demo link.
  - Host externally (YouTube/Drive/GitHub/OneDrive/Dropbox) with view-only public access (no login, no edit access), test in incognito, and use the **exact same URL** on both the Space Apps project page and the Cairo local form.

---

## 2. Incomplete Credits, Provenance & SI (AI) Disclosures

- [ ] **Fix stale/inaccurate layer provenance in [`../../app/src/provenance/ProvenancePanel.tsx`](../../app/src/provenance/ProvenancePanel.tsx) / [`../../app/src/lib/layersData.ts`](../../app/src/lib/layersData.ts):**
  - `ProvenancePanel` currently reads the static `layerCatalog` from `layersData.ts` instead of [`../../app/public/data/layers.json`](../../app/public/data/layers.json).
  - `Slope (from DEM)` still shows `status: 'planned'` (`planned product`) and `RedSight engine (offline preprocessing, pending)`, even though tiles are built and `layers.json` marks it `available: true`.
  - `CRISM-derived mineral indicators` still cites `NASA/JPL Mars Trek CRISM layers (e.g. MC18_PolySulfate indicator)`, whereas [`../../data/PROVENANCE.md`](../../data/PROVENANCE.md) and `layers.json` show Mars Trek CRISM layers did not cover Gale and `MRO CRISM MTRDR FRT000058A3` browse via PDS ODE was actually used.
- [ ] **Document origin, license, and AI status of `astronaut.glb` and all third-party assets:**
  - Identify where the source `astronaut_animated.glb` (referenced in [`../astronaut-performance.md`](../astronaut-performance.md), shipped as [`../../app/src/copilot/assets/astronaut.glb`](../../app/src/copilot/assets/astronaut.glb)) came from, its license/permission, and whether it was AI-generated.
  - Add `Solar System Scope (CC BY 4.0)` (`mars-color-2k.jpg`), font licenses (`OFL`), `astronaut.glb`, and software/model dependencies (`MapLibre`, `Three.js`, `Kokoro`, `Whisper` / `@huggingface/transformers`, `Groq` / `Gemini` copilot providers, etc.) to the submission credits in [`project-page.md`](project-page.md), [`../../README.md`](../../README.md), and the Project Description PDF.
  - Check [`../../landing/public/assets/og-image.jpg`](../../landing/public/assets/og-image.jpg) for origin/license and whether it was AI-generated.
- [ ] **Finalize and team-confirm the SI (AI) disclosure:**
  - [`project-page.md`](project-page.md) §"Use of Super Intelligence (SI)" is an unconfirmed draft mentioning only `Claude Code` (git commits also list `Claude Opus 5.5` and `Claude Sonnet 5.5`), omits runtime AI/SI components (Groq/Gemini LLM copilot, Whisper/Kokoro STT/TTS), and states no AI-generated media is used. *(Add: the deck's slide-6 astronaut voice clips are AI-generated — Kokoro TTS.)*
  - If any shipped image, video, or 3D/audio asset was AI-generated, add a **visible watermark** on AI-generated images/video and acknowledge AI-generated audio/code/data in the descriptive text and metadata.
- [ ] **Re-run UI & data checks on the final build and live URL:**
  - Update [`ui-audit.md`](ui-audit.md) against the deployed app on `https://mars.roben.club/demo/` with real routes and tiles.
  - Confirm `cd app && npm run check:data -- --final` exits `0` in Linux/CI (or on the VPS where git-ignored `tiles/` live and LF line endings match [`../../app/public/data/engine-build-manifest.json`](../../app/public/data/engine-build-manifest.json)).

---

## 3. Drafts & Placeholders to Finish

- [ ] **Complete [`project-page.md`](project-page.md)** so all 8 required Space Apps fields are ready to paste in English:
  - Replace `[≤ 30 s video or ≤ 7 slides link]` and `[public app URL]` (`https://mars.roben.club/demo/` or `https://mars.roben.club`).
  - Resolve inline `[Ali: confirm…]` and `[check:…]` notes (stop cards now show real photos).
  - Update the **NASA Data** table statuses (`⏳` items for HiRISE tiles, DEM, THEMIS, CRISM, SIM 3292 are now built; fix CRISM row from Mars Trek to PDS ODE `FRT000058A3`).
- [ ] **Update [`../../README.md`](../../README.md):**
  - Remove outdated status banner claiming routes are mock and tiles are a single preview image.
  - Replace `<public-URL>`, `<link>`, `<name>`, and license-pending placeholders.
- [ ] **Wire or clean up landing-page asset links in [`../../landing/src/main.js`](../../landing/src/main.js):**
  - Populate `PDF_URL` and `PPTX_URL` once the Project Description PDF and slide deck are hosted, or remove/disable dead document buttons if unused.
  - Ensure landing page copy (e.g., rover mode, 360 HUD, voice copilot) matches only what is working and publicly accessible on `https://mars.roben.club/demo/`, and clearly distinguishes prototype/optional features from core route planning.

---

## 4. Platform, Organizer & Team Verification (Outside Repo)

- [ ] **Verify team & eligibility on `spaceappschallenge.org`:**
  - Confirm all 1–6 members are **confirmed (not waitlisted)** in the Cairo Local Event and appear on the team's **Members** tab before submission closes (no member additions after close).
  - Confirm team eligibility under NASA's **China funding-restriction review** (Terms & Conditions).
  - Confirm **zero images, video, audio, likeness, or names of anyone under 18** appear in the demo, PDF, or project.
- [ ] **Resolve open Cairo organizer questions** ([`../../requirements/open-questions.md`](../../requirements/open-questions.md)):
  - Confirm exact Cairo local submission cutoff and Saturday judging start time.
  - Confirm whether Cairo enforces a local post-submission edit lock or follows the global edit-and-resubmit rule until Sun Nov 15 11:59 p.m. `Africa/Cairo`.
  - Confirm whether only the team leader may click **Submit for Judging**.
  - Locate and fill out the separate **Cairo local submission form** (announced on Cairo Discord), pasting the **same** public no-login links for demo, Project Description PDF, and live project.
  - Confirm People's Choice pitching format/language if separate from judged submission.
- [ ] **Test all public links logged-out** (incognito, desktop + mobile) and **submit on `spaceappschallenge.org`**:
  - Fill all 8 fields, check **Terms & Conditions** + **"Confirm All Work is Original"**, click **"Submit for Judging"**, verify the success banner, and download participation certificates.
