# Lightweight chat astronaut implementation plan

> **For agentic workers:** Execute inline using superpowers:executing-plans.

**Goal:** Add the supplied astronaut to chat with compact assets, responsive gestures, and bounded rendering cost; assess RedSight hosting on roben.

**Architecture:** Existing Three.js runtime, dynamically imported with the chat avatar. Offline texture/mesh/animation compression; one renderer, capped frame rate, visibility and reduced-motion handling. Keep server AI and mission contracts unchanged.

**Tech Stack:** React, TypeScript, Three.js r170, glTF Transform.

**Spec:** User-approved design in this session: astronaut above messages, wave on tap, chat gestures, 24 fps maximum, hidden pause, compare quality and size.

## Global constraints
- Preserve source assets and unrelated services. No push, deployment or submission.
- No invented mission data or provider responses.
- Use existing theme tokens and a usable fallback when WebGL/model loading fails.

## Review focus
- Closed/offscreen/background chat stops rendering and releases resources on unmount.
- Reduced motion renders a still pose; keyboard controls work.
- Delayed loads after unmount release model resources.
- No-WebGL and asset failure preserve functional chat.
- Compression preserves the skeleton and chosen gesture clips.

### Task 1: Compact asset
- [x] Inspect original, create reproducible optimizer, compare compressed variants, retain smallest visually acceptable asset.
- [x] Verify counts, clips, texture dimensions, and file sizes.

### Task 2: Chat integration
- [x] Add lazy avatar component and renderer; cap resolution and frame frequency; pause hidden/offscreen; dispose resources.
- [x] Wire wave, listening/thinking/reply gestures with keyboard and reduced-motion support.
- [x] Build, lint, test lifecycle/visibility in browser, inspect desktop/mobile appearance.

### Task 3: Hosting and full repo checks
- [x] Inspect roben resources and RedSight service/proxy configuration without revealing secrets.
- [x] Run repository build/lint/data and existing tests; assess production payloads and health response timing.
- [x] Apply evidence-backed local performance fixes; report deployment boundary and remaining latency sources.

## Outcome

Local implementation complete. Build/lint, 60 Node tests and 47 Python tests pass.
Restored matching generated tiles from the main workspace; data checks rerun. See [verification and hosting report](../../astronaut-performance.md).
No remote writes, deployment, push or submission.
