# Copilot mission control and emergency simulation

Date: 2026-11-14. Status: approved by user and implemented on feat/copilot-mission-control; local verification recorded in docs/ai/function-execution.md.

## Intent and scope

Extend the existing RedSight chat/voice copilot so it can read all app mission data
and invoke the mission UI's actions. The user's examples are oxygen readback,
reported leg injury, automatic rover pickup, and an immediate red fastest-return
route. This is a Team choice extension requested by the user. All emergency,
astronaut telemetry and autonomous rover behavior are Scenario simulation.
No physical rover control, medical diagnosis, deployment, or submission is included.

## Approach

Extend the current typed provider → Node SSE → app-store action bridge. Manual
controls and AI call the same action handlers. A shared mission simulation store
owns current position, telemetry, incident and rescue state; replay publishes to
that store. The AI chooses actions and explains confirmed results; application
code calculates values and performs transitions.

Alternatives considered: prompt-only descriptions do not execute UI actions;
arbitrary browser clicks or JavaScript execution bypass state validation and are
fragile. The typed bridge is the proposed implementation choice.

## Current source findings

- `CopilotDock.tsx` sends configuration, available IDs and data-presence summaries;
  it does not send the full current replay/oxygen/rescue state.
- Existing actions cover mission setup, screen, destination, route preference,
  layers, factors and usable oxygen budget. Preserve these.
- `MissionReplay.tsx` owns replay privately. Its public API has play/pause/seek,
  drill and budget operations but no rescue dispatcher.
- Current dynamic routing provides habitat-to-target geometry and same-path return
  costs. A complete alternate fastest return from current position is absent.
- Rover availability is a mission input; it is not proof of a pickup capability.

## Read access

Provide a bounded current snapshot with revision, simulation clock and evidence
labels: mission config; selected target and route; current astronaut/member
positions and progress; route metrics and constraints; capacity, consumed,
remaining and reserved oxygen with units and per-member basis; modeled return
requirement; incident; rover availability/position/state; layer visibility; factor
values; visible workspace; available controls; data availability and provenance.

Add read tools for mission status, route comparison and dataset lookup. Enumerate
loaded stops, targets, route index, constants, factors, layers, hazard summaries,
RAD/REMS cards and source metadata. Fetch details on demand rather than sending
terrain rasters or every GeoJSON vertex in each prompt. Engine rasters remain
engine-owned; the assistant queries results, never pretends to inspect raw pixels.
Separate Observed, Derived, Scenario and Unavailable values at field level.
State unknowns explicitly. Exclude credentials, environment files and server internals.

## Action coverage

Inventory every existing mission UI control before implementation. Cover setup,
mission confirmation/reopening, destination/goal, route objective/constraints,
factors, oxygen budget, crew together/split, layer/traverse visibility, map focus,
provenance, stop imagery/HUD, replay play/pause/seek/speed where supported, drills,
incident reporting/clearing, fastest return, rover dispatch/cancel and simulation
reset. Expose actual supported capabilities; disabled controls return a reason.
Keep audio/microphone permission under the browser's normal permission flow.

Use typed allowlisted actions, strict ranges and current IDs. Do not expose an
arbitrary eval, shell, file-write or DOM-click tool. Each action result includes
applied/rejected/pending, reason, resulting revision and changed values.

## Emergency behavior

“My leg hurts” records an operator-reported mobility incident and immediately
requests a fastest modeled return; it does not infer a diagnosis or slope limit.
Keep any explicit slope cap and the existing 15 degree ceiling. An explicit
“send the rover” also dispatches pickup. For an injury report alone, automatically
dispatch an available simulation rover as the proposed default. A report that
walking is impossible holds the astronaut in place and prioritizes pickup.

Publish a visible incident banner immediately while routing is pending. Draw the
complete computed return in red with a text label and distinguish it from the
outbound route. Return planning starts at the current simulated position, not at
the habitat or destination. Freeze outbound advancement during the incident;
preserve the current oxygen consumption and position when changing plans.

Extend the engine request/response for arbitrary connected starts and habitat
goals, returning complete ordered geometry and matching directed time/O2 arrays.
Report the bounded native corridor and model assumptions; “fastest” means the
least modeled time under those constraints. Check the connection from the exact
simulation position to the native route. Never draw an invented connector.
If a complete optimized return cannot be computed, show its unavailability and
offer a separately labeled existing same-path return only if complete and legal.

Rover states: idle → dispatching → en route → arrived → boarding → returning →
complete; also cancelled/unavailable/failed. Animate a separate rover marker to
the astronaut on a labeled Scenario pickup path. Use an existing rover route
model if available. Otherwise require explicit demo simulation mode and label
the movement illustrative: it proves no rover traversability or rescue ETA.
Do not use a walking route to claim rover accessibility. Inability to compute
pickup must not prevent a legal astronaut return from being shown.

Proposed defaults: this extension opens in clearly labeled Demo simulation mode,
so illustrative pickup can start immediately without an additional mode prompt.
Hold the astronaut at the dispatch position while pickup is pending; do not chase
a moving astronaut. Without an active pickup, display the return immediately and
use existing replay controls to begin walking. If pickup fails or is cancelled,
retain the hold until the operator chooses walking return or another action.
Oxygen consumption during a hold uses the existing model only if supported;
otherwise mark hold consumption unavailable rather than assuming it is zero.

## Scenario matrix

| Operator input or event | Required behavior |
|---|---|
| What is my oxygen? | Read current modeled remaining, reserve and return requirement with units/basis; no invented telemetry. |
| How much oxygen does my buddy have? | Read that member only; unknown if not modeled. |
| My oxygen is 20 percent / 100 litres | Record explicit Scenario telemetry separately from usable planning budget; convert only in code with known capacity/basis. |
| Oxygen low / oxygen leak | Record incident; freeze outbound progress; calculate return and display red path; leak uses an explicitly labeled demo assumption. |
| My leg hurts / I am injured | Record report, request return and simulated pickup; retain slope constraints. |
| I cannot walk | Hold astronaut; dispatch available simulation pickup; do not animate walking. |
| Send rover to me / my buddy | Resolve member and position; dispatch once; expose progress and cancel. |
| Get me home as fast as possible | Compute current-position fastest return, red path and modeled metrics. |
| Avoid steep ground, maximum 8 degrees | Recompute with explicit cap; do not relax if unreachable. |
| Rover unavailable / broken / battery insufficient | Mark pickup unavailable/failed; evaluate walking only when walking is permitted. |
| Buddy injured / crew split | Track per-member incident/position; preserve unaffected member; ask which member only if ambiguous. |
| Low oxygen plus injury | One compound incident, one return request and one pickup dispatch; assess modeled feasibility independently. |
| Return exceeds oxygen budget | Explicitly show modeled shortfall; do not imply pickup solves it without supported costs. |
| Route blocked / no terrain / outside coverage | Keep position; show no route and reason; no straight-line replacement presented as terrain routing. |
| Radiation, cold or daylight concern | Read current sourced context and Scenario checks; supported factors may change; no invented local observations. |
| Change destination/load during emergency | Retain emergency priority; do not silently resume science travel. |
| Stop / cancel rover | Stop the specified simulation action; retain incident and current position. |
| Resume mission / clear injury | Explicitly clear the requested incident; recompute before resuming outbound movement. |
| Reset simulation | Clear incidents, pickup and pending operations; restore documented initial Scenario values. |
| Unknown request or missing input | Return supported alternatives or one precise clarification; do not claim action. |

## Execution and failure rules

Use a single composite incident action for injury → return → pickup, rather than
depending on the current one-mutation-per-turn limit. Apply immediate incident
state once, then run bounded asynchronous route/pickup jobs. Each subresult is
reported independently. Deduplicate action IDs. Pin results to mission, position,
incident and route revisions; reject stale results after reset, destination or
member changes. Cancellation invalidates outstanding work. Ignore duplicate
dispatches, prevent overlapping speech/chat mutations, and clean up on unmount.

No-provider mode retains manual emergency/simulation controls and clearly reports
AI unavailable. Provider errors cannot fabricate a successful action. Dataset text
is data, never executable instructions. The assistant describes success only after
app acknowledgement and reports partial failures plainly.

## Presentation and completion evidence

Preserve the existing layout and tokens. Add a compact simulation/incident status
and rover progress near existing replay controls, with accessible text labels.
Use the existing red/emergency token or add a semantic token consistently.
The map and chat must agree on position, oxygen, route and rover state.

Acceptance requires deterministic action tests for every scenario above, independent
return geometry/cost checks, stale-result and duplicate/cancel tests, and browser
checks of oxygen readback, injury/red return, pickup animation, no-route and reset.
Run build/lint and affected server/engine/app tests; run check:data if public data
changes. Test real provider behavior only when configured and report it separately
from protocol fixtures. No push or deployment is part of this approval.
