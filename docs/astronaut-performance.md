# Chat astronaut and hosting checks — 2026-11-14

User-approved local implementation. **Nothing deployed, published, pushed, or changed on roben.**

## Asset and interaction

The supplied `astronaut_animated.glb` is preserved in Downloads. The chat build uses
`app/src/copilot/assets/astronaut.glb`, imported through Vite so its URL is content-hashed.

| Metric | Original | Shipped local asset |
| --- | ---: | ---: |
| GLB bytes | 14,118,696 | 533,908 |
| Triangles | 18,583 | 9,437 |
| Bones | 23 | 23 |
| Meshes / materials | 1 / 1 | 1 / 1 |
| Animation clips | 5 | 4 |

Transfer size falls 96.2%. Retained clips: idle, greet_01, agree, look_around. Unused walking
is omitted. Textures are limited to 512 px and WebP; Meshopt compresses mesh and animation.
The smallest tested variant accepted by the visual review is shipped; this is not a claim of a
mathematically minimum file size. A 1024 px trial was approximately 863 KB.

Reproduce from the repository root (Node/npm + Python 3):

```sh
app/scripts/optimize-astronaut.sh /path/to/astronaut_animated.glb app/src/copilot/assets/astronaut.glb
```

The optimizer pins glTF Transform 4.5.1. Its first invocation may download build tooling.
That tooling is not included in the website. See [official CLI documentation](https://gltf-transform.dev/cli).

The viewer supports wave by tap or button, drag rotation, reset, pause, and chat-state gestures.
Rendering is outside React's state update loop, limited to 24 fps and pixel ratio 1.5, with one
skinned mesh, simple lights, and no shadows or postprocessing. Hidden/offscreen viewers suspend
scheduled rendering; reduced motion holds a pose. Closing chat aborts pending fetch and releases
geometry, textures, skeleton, mixer and WebGL context. Failed WebGL/model loading leaves chat usable.

Desktop and 390 × 844 mobile screenshots were reviewed: the full character faces forward, retains
recognizable suit materials, and the composer fits. This does not test a physical phone or its keyboard.

## Startup improvements

Map, chat, sources and panorama code load when requested. Three.js is shared between the avatar and
panorama, rather than loaded during mission setup. Font imports include the English UI's Latin subset.

| Vite main entry | Before | After |
| --- | ---: | ---: |
| JavaScript | 2.20 MB | 402 KB |
| Gzipped JavaScript | 618 KB | 129 KB |

The map, Three.js, local speech runtime and WASM assets remain large on-demand downloads. The main
entry is not the entire app transfer. The engine provider still loads contract JSON, including the
6.1 MB hazards file; use compressed static delivery in production. No engine data was altered.

Node production serving also now supplies GeoJSON, GLB, MJS, JPEG and WOFF content types. Previously
GeoJSON returned application/octet-stream, which the frontend JSON loader rejected.

## Verification

- `cd app && npm run build`: pass; expected warnings remain for large on-demand chunks.
- `cd app && npm run lint`: pass.
- Existing frontend/server Node suite: 59 passed.
- New `node --test server/static.test.mjs`: pass. Starts a temporary production server without keys;
  checks parsed GeoJSON, GLB MIME/size budget and unconfigured health. Requires a completed app build.
- `python3 -m pytest -p no:cacheprovider -q engine/tests engine/content/test_stops_and_cards.py`:
  47 passed.
- Browser WebGL draw counter: 24 draws in one second while active; zero draws while paused/offscreen.
  Closing chat: zero canvases remaining and context reports lost.
- Stalled-download cancellation: AbortError, zero WebGL context requests and zero appended canvases.
- Paused state regression: changing to speaking while paused plays idle only; resume starts agree.
- Reduced-motion check: only initial/observer-triggered still renders, no continuous animation.
- Independent source review: three lifecycle/state issues fixed; follow-up found no remaining P1/P2.
- Impeccable mechanical detector: no findings on changed UI files.

**Initial data check failed:** `cd app && npm run check:data` reported six errors: available layers hirise,
hillshade, slope, themis, crism and geology have no generated tile directories in this checkout.
It also warns about the 6.1 MB hazards file. Those errors were resolved by copying the existing 85 MB generated tile bundle from
`/home/ali/Nasa_Hackathon/app/public/tiles` into this worktree. The source and destination
`layers.json` files have identical SHA-256
`ca58fc8e2d76534c49d86dac4d3bef1d5592a78448ab095d97f4c32940296f25`.
Tiles remain git-ignored build inputs. No tiles were fabricated and no availability metadata changed. Both `npm run check:data` and
`npm run check:data -- --final` now pass with zero errors; the hazards-size warning remains.

## Read-only roben inspection

The SSH host reports four CPU cores, 7.7 GiB RAM, approximately 4.2 GiB available, 56 GB disk free.
A short vmstat sample showed 93–98% idle CPU and no swap I/O. This is a snapshot, not a load test.
Other RobEn applications share the host and were left untouched. The avatar runs in each browser;
the server serves its static bytes and handles the existing chat requests.

The active `mars.roben.club` Nginx configuration points to `/var/www/mars.roben.club`, whose files
are dated Nov 6. It already compresses common text types and caches assets. It has no `/api/` proxy:
`/api/copilot/health` returns HTML from the SPA fallback, not JSON. The normal SSH shell cannot find
`node`; passwordless sudo and Docker access are unavailable to this account.

Observed old-site TTFB: about 12 ms from the server over local HTTPS, and 392 ms from this workstation
(including network/TLS). Neither is a measurement of the new app or an AI reply.

Before a future deployment, include the git-ignored generated tiles in the build, confirm the Node runtime/service and
server-side provider configuration, route `/api/` to the backend with SSE buffering disabled, and
serve static files directly through Nginx. Include application/geo+json and application/wasm in
compression types and use the correct GeoJSON MIME type. Hash-named assets can be cached immutably;
HTML and changing contract files must remain refreshable. These are requirements to review later;
no server configuration or service was modified in this session.

Provider response time, speech synthesis, network round trips and client hardware still affect
latency. Zero latency and whole-site capacity are not established by these checks.
