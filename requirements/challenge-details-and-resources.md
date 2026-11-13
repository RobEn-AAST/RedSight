# Official Martian Map challenge: Details and Resources

**Source:** [Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/) · [Resources tab](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources)  
**Checked:** 2026-11-13. The live page returned HTTP 200; its page data matched the same-day source capture used for the competition requirements.  
**Category:** Intermediate. **Page sections:** introduction, Background, Objectives, Potential Considerations, Resources.

This is a complete **section-by-section account of the challenge's substantive instructions and listed resources**, paraphrased for team use. Follow the linked official page if exact wording or later changes matter. The [competition requirements](competition-requirements.md) additionally cover participation, submission, and judging rules, which are outside this challenge page.

## Details

### Introduction: the problem

NASA has gathered many kinds of Mars data through decades of robotic exploration. A future astronaut needs a map that brings together route and destination details, current-condition context, and mission data at the scale of an individual surface excursion. The challenge asks for an integrated view of a Martian location or route, drawing on multiple NASA science missions to help plan and carry out a Marswalk with science along the way.

### Background: why another map

Human explorers can interpret observations and respond to new situations during field science in ways robotic missions cannot. Robotic missions have built knowledge that can support later human exploration, but their separate datasets are not yet combined for a particular human excursion. Mars Trek and USGS–NASA planetary maps support regional and global exploration; the challenge identifies the smaller area of one astronaut's walk as the gap to address.

### Objectives: what to create

1. Create **a map, tool, or interface** an astronaut could use on a Mars surface exploration mission, **using NASA data and tools**. It should help with a chosen location or route and its scientific purpose.
2. Choose a science goal and location. The page uses Curiosity's study of boxwork formations in the Mount Sharp region as an **example**, not a required site or goal.
3. A well-explored rover location may supply abundant imagery and data; a less-studied location is also allowed.
4. The page suggests combining **at least three kinds of data** for navigation context. Its examples are optical, thermal, spectral, topographic, geophysical, atmospheric, radiation, and chemical data. The wording is a suggestion, not a mandatory three-layer threshold.
5. Consider astronaut safety: Mars radiation and space weather, spacesuit mobility, carried scientific equipment and supplies. **If possible**, show a route that reaches the science objective while avoiding major obstacles such as large rock formations. A route map is encouraged, not mandatory.

### Potential Considerations: explicitly optional

The page introduces these with “You may (but are not required to) consider the following.” None is a submission requirement:

- A planner in a spacecraft or habitat, a carried tablet, a spacesuit helmet HUD, or another display form.
- A static map, an interactive product, or a system that generates maps for different places or datasets.
- Ideas from maps of Earth, the Moon, other planets, or exoplanets.
- Historical observations, predicted future conditions, or no specific time frame when using stable geology/topography.
- Point-of-view imagery from Mars surface missions to show what a destination might look like.
- Rovers or other robots to transport crew/equipment, or astronauts working in pairs.

The Details tab directs participants to the Resources tab and says more resources may be added before the hackathon. Recheck the page before final submission.

## Resources

The tab warns that NASA does not endorse non-U.S. Government entities and that participants must follow the data-use parameters of any non-U.S. Government website they use.

| Listed resource | What the challenge page offers | Direct link | RedSight interpretation |
|---|---|---|---|
| JPL Mars Trek | NASA's Mars exploration portal with data from landing sites. | [Mars Trek](https://trek.nasa.gov/mars/) | Candidate map and terrain source; verify exact Gale layers and reuse terms before shipping. |
| USGS–NASA Planetary Geologic Mapping Program | Standardized Mars geologic mapping. | [USGS interactive Mars maps](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Geological context; map scale may be coarser than a Marswalk. |
| Curiosity's proposed path up Mount Sharp | Route-map example: animation, an annotated map of scientist-interest regions, and a flyover. | [Curiosity route visual](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | Visual/reference example for the chosen Gale site, not a computed astronaut route or current rover path. |
| NASA Worldview | Earth satellite imagery and event exploration. | [Worldview](https://worldview.earthdata.nasa.gov/) | Inspiration for map interaction; it is **not** Mars imagery. |
| Perseverance Raw Images Gallery | More than one million images from Perseverance's Mars mission. | [Perseverance images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | Perseverance is at **Jezero**, not Gale. Use Curiosity imagery for Gale-specific stop context. |

The [general Space Apps resources page](https://www.spaceappschallenge.org/resources/) is separate from these five challenge-listed links. The five links are suggested starting points, not a complete dataset manifest or a mandate to use every item. Additional datasets and their actual coverage/terms are assessed in the [mapping research](../docs/research/mapping-options.md).

## Requirement versus our proposal

| Official challenge | RedSight team proposal |
|---|---|
| NASA-backed map/tool/interface for a Mars astronaut's surface exploration, combining mission data for a useful location or route. | Gale/Mount Sharp hyperlocal planner with science goals, reachability, route choices, turn-back reserve, and provenance. |
| Three data types, obstacle-aware route, and HUD/rover/buddy formats are suggested or optional. | We may implement these to strengthen the demo, subject to data coverage and time. |
| No mandated site, routing algorithm, tech stack, oxygen model, chatbot, or 3D scene. | Those are design choices to be decided from the research and team plan. |

**Claim boundary:** Curiosity RAD and REMS are rover-local measurements, not spatial radiation or weather safety maps for every path cell. Any oxygen, radiation, storm, communications, or “safe route” outputs must be labeled by what is observed, derived, scenario-based, or unavailable.
