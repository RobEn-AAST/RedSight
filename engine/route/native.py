"""Shortest-path recovery and route arrays for the bounded native DEM graph."""

from dataclasses import dataclass
import math

import numpy as np
from rasterio.transform import xy
from rasterio.warp import transform
from scipy.sparse.csgraph import dijkstra

from engine.model.metabolism import segment_cost


MARS_GEOGRAPHIC_CRS = "+proj=longlat +R=3396190 +no_defs"


@dataclass(frozen=True)
class NativePathResult:
    nodes: tuple[int, ...]
    objective: str
    objective_cost: float
    time_s: float
    arrays: dict


def dijkstra_field(graph, *, start, objective):
    if objective not in {"time", "hazard"}:
        raise ValueError("objective must be 'time' or 'hazard'")
    source = graph.node(start)
    if not graph.walkable.flat[source]:
        raise ValueError("start is hard-blocked in the native route grid")
    matrix = graph.time_csr if objective == "time" else graph.hazard_csr
    return dijkstra(matrix, directed=True, indices=source, return_predecessors=True)


def path_from_field(graph, *, start, goal, objective, distances, predecessors, constants):
    source, target = graph.node(start), graph.node(goal)
    if not graph.walkable.flat[target] or not np.isfinite(distances[target]):
        raise ValueError("native route goal is unreachable inside the bounded corridor")
    chain = [target]
    while chain[-1] != source:
        previous = int(predecessors[chain[-1]])
        if previous < 0 or previous == chain[-1]:
            raise ValueError("native route goal is unreachable inside the bounded corridor")
        chain.append(previous)
    chain.reverse()
    nodes = tuple(chain)
    arrays = native_route_arrays(graph, nodes, constants=constants)
    return NativePathResult(nodes, objective, float(distances[target]), arrays["cum"]["t_s"][-1], arrays)


def _edge(graph, source_node, destination_node, constants):
    source_row, source_col = graph.cell(source_node)
    destination_row, destination_col = graph.cell(destination_node)
    dr, dc = destination_row - source_row, destination_col - source_col
    if max(abs(dr), abs(dc)) != 1 or min(abs(dr), abs(dc)) > 1:
        raise ValueError("native route contains a non-neighbor transition")
    if dr and dc and not (graph.walkable[source_row, destination_col] and graph.walkable[destination_row, source_col]):
        raise ValueError("native route contains a diagonal corner cut")
    distance = graph.resolution_m * math.hypot(dr, dc)
    grade = math.degrees(math.atan2(
        float(graph.elevation_m[destination_row, destination_col]) - float(graph.elevation_m[source_row, source_col]),
        distance,
    ))
    limit = float(constants["slope_limit_foot_deg"])
    if abs(grade) > limit + max(1e-10, limit * 1e-12):
        raise ValueError("native route contains an over-limit edge grade")
    return segment_cost(
        distance_m=distance,
        grade_deg=grade,
        body_mass_kg=constants["body_mass_kg"],
        load_kg=constants["carried_load_kg"],
        terrain_factor=1.0,
        kappa=constants["suit_factor_kappa"],
        watts_to_o2_ml_per_min=constants["watts_to_o2_ml_per_min"],
        max_speed_mps=constants["walk_speed_kmh"] / 3.6,
    ), grade


def native_route_arrays(graph, nodes, *, constants=None):
    nodes = tuple(map(int, nodes))
    if len(nodes) < 2:
        raise ValueError("native route needs at least two cells")
    if constants is None:
        raise ValueError("native route arrays require the model constants")
    if any(not graph.walkable.flat[node] for node in nodes):
        raise ValueError("native route contains a hard-blocked pixel")
    if any((b // graph.shape[1] - a // graph.shape[1]) not in {-1, 0, 1}
           or (b % graph.shape[1] - a % graph.shape[1]) not in {-1, 0, 1}
           for a, b in zip(nodes, nodes[1:])):
        raise ValueError("native route contains a non-neighbor transition")

    coords = []
    for node in nodes:
        row, col = graph.cell(node)
        x, y = xy(graph.transform, row, col, offset="center")
        lon, lat = transform(graph_crs(graph), MARS_GEOGRAPHIC_CRS, [x], [y])
        coords.append([float(lon[0]), float(lat[0])])

    forward = [_edge(graph, a, b, constants) for a, b in zip(nodes, nodes[1:])]
    reverse = [_edge(graph, b, a, constants) for a, b in zip(nodes, nodes[1:])]
    segments = []
    for cost, grade in forward:
        distance = cost.distance_m
        hazard = distance * (1.0 + (abs(grade) / constants["slope_limit_foot_deg"]) ** 2)
        segments.append({
            "t_s": cost.t_s,
            "o2_l": cost.o2_l,
            "slope_deg": grade,
            "cost_terms": {
                "distance_m": distance,
                "hazard_score": hazard,
                "terrain_factor": 1.0,
                "power_w": cost.power_w,
            },
        })
    cum_t = np.concatenate(([0.0], np.cumsum([cost.t_s for cost, _ in forward]))).tolist()
    cum_o = np.concatenate(([0.0], np.cumsum([cost.o2_l for cost, _ in forward]))).tolist()
    back_t = np.zeros(len(nodes), dtype=np.float64)
    back_o = np.zeros(len(nodes), dtype=np.float64)
    for index, (cost, _) in enumerate(reverse, start=1):
        back_t[index] = back_t[index - 1] + cost.t_s
        back_o[index] = back_o[index - 1] + cost.o2_l
    return {
        "coords": coords,
        "seg": segments,
        "cum": {"t_s": cum_t, "o2_l": cum_o},
        "back": {"t_s": back_t.tolist(), "o2_l": back_o.tolist()},
        "total_s": cum_t[-1] + back_t[-1],
    }


def graph_crs(graph):
    """Return the raster CRS attached when the graph was built."""
    crs = getattr(graph, "crs", None)
    if crs is None:
        raise ValueError("native routing graph has no analysis CRS")
    return crs
