"""Round-trip O₂ field and no-return rings (demo-focus-plan §9 "don't go beyond" line).

For every cell the crew can reach, the field holds the O₂ needed to walk out from the habitat on the
fastest path and come home the same way, scored with the same turn rule as ``engine.route.pnr``:
``factor * (out + return_margin * back)``. A ring at budget ``B`` is the outer edge of the cells whose
round trip fits in ``B``. Everything is Scenario: the same native graph, Pandolf edge model and constants
as the shipped routes; nothing is measured.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import ndimage
from scipy.sparse.csgraph import dijkstra

from engine.model.native_grid import _movement_arrays


def _accumulate_along_tree(parent, edge_value):
    """Sum ``edge_value`` from every node up its shortest-path tree to the root (pointer jumping).

    ``parent[i]`` is the node one step nearer the root (``-1`` at the root and for unreached nodes);
    ``edge_value[i]`` is the cost of the step parent[i] -> i. Runs in about log2(tree depth) passes.
    """
    total = np.where(parent >= 0, edge_value, 0.0).astype(np.float64)
    up = parent.copy()
    while True:
        live = np.flatnonzero(up >= 0)
        if live.size == 0:
            return total
        ancestor = up[live]
        total[live] = total[live] + total[ancestor]
        up[live] = up[ancestor]


def round_trip_o2_field(graph, *, home_node, constants, member_factor=1.0):
    """Per-member O₂ (L) for out on the fastest path and back the same way, with the return margin.

    Returns a float64 array shaped like the grid; cells with no modeled way out are ``inf``.
    """
    distances, predecessors = dijkstra(graph.time_csr, directed=True, indices=home_node, return_predecessors=True)
    parent = np.where(np.isfinite(distances), predecessors, -1).astype(np.int64)
    parent[home_node] = -1
    child = np.flatnonzero(parent >= 0)
    up = parent[child]
    cols = graph.shape[1]
    dr = child // cols - up // cols
    dc = child % cols - up % cols
    step_m = graph.resolution_m * np.hypot(dr, dc)
    rise = graph.elevation_m.flat[child].astype(np.float64) - graph.elevation_m.flat[up].astype(np.float64)
    grade = np.degrees(np.arctan2(rise, step_m))
    model = dict(
        kappa=constants["suit_factor_kappa"],
        watts_to_o2_ml_per_min=constants["watts_to_o2_ml_per_min"],
        max_speed_mps=constants["walk_speed_kmh"] / 3.6,
        body_mass_kg=constants["body_mass_kg"],
    )
    _, out_o2 = _movement_arrays(step_m, grade, load_kg=constants["carried_load_kg"], **model)
    # The way back carries what the routes carry home (engine.route.native: return_load_kg, else the load).
    return_load = constants.get("return_load_kg", constants["carried_load_kg"])
    _, back_o2 = _movement_arrays(step_m, -grade, load_kg=return_load, **model)
    edge_out = np.zeros(parent.size)
    edge_back = np.zeros(parent.size)
    edge_out[child] = out_o2
    edge_back[child] = back_o2
    out = _accumulate_along_tree(parent, edge_out)
    back = _accumulate_along_tree(parent, edge_back)
    need = float(member_factor) * (out + float(constants["return_cost_margin"]) * back)
    need[~np.isfinite(distances)] = np.inf
    return need.reshape(graph.shape)


def usable_budget_l(constants):
    """Capacity minus the unplanned reserve, as in ``engine.route.pnr`` (the app slider's maximum)."""
    capacity = float(constants["o2_usable_primary_l"])
    reserve = max(float(constants["reserve_fraction"]) * capacity,
                  float(constants["reserve_minutes"]) * float(constants["walkback_o2_lpm"]))
    return capacity - reserve


def reach_mask(field, home_rc, budget_l):
    """Cells whose round trip fits ``budget_l``, joined to the habitat, with enclosed gaps filled.

    Small blocked patches inside the reachable area are hazards, drawn by their own layer; filling them
    keeps the line to the one outer edge the crew must not walk past.
    """
    fits = field <= budget_l
    labels, _ = ndimage.label(fits, structure=np.ones((3, 3), dtype=bool))
    home_label = labels[home_rc]
    if home_label == 0:
        return np.zeros_like(fits)
    return ndimage.binary_fill_holes(labels == home_label)


def ring_lines(mask, *, block=10):
    """Outer edge of ``mask`` as lines of (row, col) cell coordinates, smoothed to ``block`` cells.

    The mask is block-averaged first (a block counts as inside when at least half of it is), so the line
    is a display outline at about ``block`` × resolution metres, not a cell-exact boundary.
    """
    from skimage.measure import find_contours

    rows, cols = mask.shape
    pad_r, pad_c = (-rows) % block, (-cols) % block
    padded = np.pad(mask.astype(np.float32), ((0, pad_r), (0, pad_c)))
    coarse = padded.reshape(padded.shape[0] // block, block, padded.shape[1] // block, block).mean(axis=(1, 3))
    # A zero border closes rings that meet the edge of the terrain model.
    framed = np.pad(coarse, 1)
    lines = []
    for contour in find_contours(framed, 0.5):
        rc = (contour - 1.0 + 0.5) * block - 0.5
        rc[:, 0] = np.clip(rc[:, 0], 0, rows - 1)
        rc[:, 1] = np.clip(rc[:, 1], 0, cols - 1)
        lines.append(rc)
    return lines


def touches_edge(mask, margin=2):
    """True when the reachable area runs into the edge of the terrain model (the ring there is a model limit)."""
    return bool(mask[:margin].any() or mask[-margin:].any() or mask[:, :margin].any() or mask[:, -margin:].any())


def budget_levels(full_budget_l, step_l=25.0):
    """Ring budgets: every ``step_l`` litres up to the full usable budget, plus the full budget itself."""
    levels = [step_l * k for k in range(1, int(math.floor(full_budget_l / step_l)) + 1)]
    if not levels or abs(levels[-1] - full_budget_l) > 1e-6:
        levels.append(round(float(full_budget_l), 2))
    return levels
