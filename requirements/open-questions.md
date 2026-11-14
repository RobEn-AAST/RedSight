# Open Questions & Unverified Claims — NASA Space Apps 2026 / Martian Map / Cairo

**Updated:** 2026-11-13, after fetching the official 2026 Project Submission Guide and Judging & Awards Guide.
Companion to `competition-requirements.md`.

## Cross-check verdicts on the supplied Cairo file claims

| # | Cairo-file claim | Verdict against official 2026 guides |
|---|---|---|
| 1 | Demo = 7-slide presentation OR ≤30-second video | ✅ **VERIFIED** — Submission Guide: "Video (30 seconds or less) or slide deck (up to seven slides including title and intro slides)"; exceeding limits ⇒ ineligible for Global Judging. https://www.spaceappschallenge.org/resources/project-submission-guide/ |
| 2 | "Only the team leader submits" | ❓ **UNVERIFIED** — not stated anywhere in the global guide (its steps name no role). Possibly a platform or Cairo-local rule. Ask the Local Lead. |
| 3 | "Nothing can be changed after submission" | ❌ **CONTRADICTED** — Submission Guide: "You may edit and resubmit your project as many times as you'd like until the end of the hackathon. Only your last saved submission will be reviewed by the judges." If Cairo enforces a stricter local lock, get it in writing. |
| 4 | "Late submissions are not accepted" | ✅ **VERIFIED in substance** — anything saved/submitted after Sun Nov 15, 11:59 p.m. (Local Event timezone) "will not be eligible for judging." Note: an earlier **local** cutoff may still apply (see #5). |
| 5 | Five judging criteria (Impact, Creativity, Validity, Relevance, Presentation) | ✅ **VERIFIED** — Judging Guide: same five, scored 1–5 "at every level of judging." https://www.spaceappschallenge.org/resources/judging-awards-guide/ |
| 6 | Exact local cutoff | ⚠️ **PARTIAL** — Global platform window is firm: opens Sat Nov 14 9:00 a.m., closes Sun Nov 15 11:59 p.m. **Local Event timezone** (Cairo = Africa/Cairo). Guide: local judging/awards times "may differ from the global submission times — check with your Local Lead." Cairo page sets no explicit deadline; its Saturday schedule includes local judging. Only submitted projects can be Global Nominees ⇒ working assumption: **submit before Cairo's Saturday judging**. |

## Still-open questions

1. **Exact Cairo submission cutoff + local lock.** (Above, #6/#2/#3.) Ask the Cairo Local Lead (contact on https://www.spaceappschallenge.org/2026/local-events/cairo/). Also confirm the People's Choice Award format (Cairo page mentions its pitching on Saturday) and whether local demo pitches are in English.
2. **Cairo event's own guide is still not publicly located.** `/home/ali/Downloads/space-apps-cairo-2026-requirements.md` cites an "official Cairo 2026 Hackathon Guide and Judging Guidelines" with **no URL**; spaceappscairo.com is a JS app with no readable static guide; the original document (PDF?) was not found publicly. Treat the file as faithful organizer guidance but keep hunting for the original or ask the Lead. A Facebook video (facebook.com/spaceappscairo) reportedly mentions a **local team-registration deadline of Nov 7** (search-snippet only, unverified) — if our team did not complete local registration before Nov 7, escalate with the Lead **today**.
3. **Pre-work boundary.** "Teams are not allowed to begin working on the challenges prior to the hackathon" (FAQs). Reading the (public since Oct 28) statements and (Nov 13) resources is fine; unclear: dataset downloads, env setup, mockups, prototype code. Ask the Lead before any pre-event build. Team notes in `martian-map-resources.md` = planning only, keep it that way.
4. **Licensing for the data we want to use.** Verified rule: non-U.S. Government sources require complying "with any data use parameters of that specific website"; copyrighted material needs permission; everything used must be listed. Unknown specifics: JPL Mars Trek tile reuse terms; USGS Astrogeology terms; PDS data-use terms (HiRISE/CRISM/THEMIS/RAD/REMS); NASA media attribution expectations for the demo. Also note the new verified rule: **SI-generated content must not contain NASA branding/logos**.
5. **China funding-restriction review.** Judging Guide: teams undergo review for "prohibited bilateral activity with China, or a Chinese-owned entity" for Global Judging eligibility (determination at NASA's sole discretion; see https://www.spaceappschallenge.org/legal/). Relevant **only if** any teammate/entity affiliation is affected — confirm team composition is clear of it.

### Update — 2026-11-13 (planning session; source: official Cairo page, rank 2)

- **#3 Pre-work boundary — mostly answered:** the official Cairo page's schedule starts the hackathon on
  **Fri 2026-11-13 07:00 Africa/Cairo** ("The hackathon will kick off on Friday, November 13th…"), so work from
  that time is inside the event. **Residual:** the global FAQ still says Nov 14–15; if the Lead says the global
  start governs, follow the Lead's written answer.
- **#1 Cairo cutoff — still open:** the Cairo page's data has `submissionDeadline: null`; Saturday lists
  "the judging process alongside Connect & Reflect, the People's Choice Award pitching, and finally the
  closing ceremony". Ask the Lead for the **judging start time**: submission opens only at Sat 09:00.
- **Supplied source files not present on this Mac:** the `/home/ali/Downloads/…` files cited here and in
  `decision-log.md` / `quick-requirements.md` were authored on another machine and do not exist at
  `~/Downloads` on the current workstation (checked 2026-11-13). Their links are broken here. Share copies
  in the team drive if anyone needs them; their verified content already lives in `competition-requirements.md`.

### Update — 2026-11-14 (source: official Cairo 2026 Participant Guide PDFs, rank 2)

Notes and links: [`cairo-participant-guidance.md`](cairo-participant-guidance.md).

- **#1 judging format — partly answered in writing:** both Cairo PDFs say "Cairo judges receive the demo,
  this PDF and the actual project. They do not have a live presentation or conversation with your team."
  So there is no live pitch for judging; the submitted materials must explain themselves. **Still open:**
  the judging start time, the Cairo cutoff, who may submit, and whether People's Choice pitching is separate.
- **New Cairo local requirement:** a **project description PDF**, pasted as a public link into the Cairo
  submission's project-documentation field (delivery pool item 7a in `../docs/team-plan.md`). NASA's global
  guide does not ask for it.
- **Cairo local submission form** is separate from the NASA project page; organizers say it will be
  announced on Discord (Tips and Tricks video).
- **Submission opening time — conflict:** the Tips and Tricks video says global submission opens at midnight;
  the official global window here says Sat Nov 14 09:00 Africa/Cairo (#6). Keep the official time; ask the Lead.

## Resolved this session (2026-11-13)

- ✅ 2026 Project Submission Guide fetched and mined — https://www.spaceappschallenge.org/resources/project-submission-guide/
- ✅ 2026 Judging & Awards Guide fetched and mined — https://www.spaceappschallenge.org/resources/judging-awards-guide/
- ✅ Terms & Conditions URL located — https://www.spaceappschallenge.org/legal/ (full text not yet read — read before signing the T&C checkbox Saturday)
- ✅ Demo format, five criteria, public-links rule, late deadline, minors ban, SI-disclosure duty: all verified (verdicts above)
- ✅ New verified rules folded into `competition-requirements.md`: English-language requirement (with video-subtitle exception), ≥1 NASA data/resource for award eligibility, 8 project-page fields, all members confirmed-not-waitlisted + no member adds after close, SI watermark/branding rules, edit-and-resubmit allowed until deadline, judging phases (Nominees Dec 3 / Finalists Dec 17 / Winners Jan 2027), ten Global Awards, China review.
- ✅ Cairo official page (Nov 13–14 schedule, timezone, limits, livestream) — https://www.spaceappschallenge.org/2026/local-events/cairo/
