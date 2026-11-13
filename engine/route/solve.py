"""Indexed SciPy Dijkstra fields and predecessor-based path recovery."""

from dataclasses import dataclass

import numpy as np
from scipy.sparse.csgraph import dijkstra

from engine.model.grid import DirectedGraph


@dataclass(frozen=True)
class PathResult:
    nodes: tuple[int, ...]
    objective: str
    objective_cost: float
    time_s: float


def shortest_path(graph: DirectedGraph, *, start, goal, objective="time") -> PathResult:
    if objective not in {"time", "hazard"}:
        raise ValueError("objective must be 'time' or 'hazard'")
    source, target = graph.node(start), graph.node(goal)
    if not graph.valid.flat[source] or not graph.valid.flat[target]:
        raise ValueError("start or goal is hard-blocked")
    csr = graph.time_csr if objective == "time" else graph.hazard_csr
    distances, predecessors = dijkstra(csr, directed=True, indices=source, return_predecessors=True)
    if not np.isfinite(distances[target]):
        raise ValueError("goal is unreachable")
    chain = [target]
    while chain[-1] != source:
        previous = int(predecessors[chain[-1]])
        if previous < 0 or previous == chain[-1]:
            raise ValueError("goal is unreachable")
        chain.append(previous)
    chain.reverse()
    time_s = sum(graph.edges[(a, b)].t_s for a, b in zip(chain, chain[1:]))
    return PathResult(tuple(chain), objective, float(distances[target]), float(time_s))


def dijkstra_field(graph: DirectedGraph, *, start, objective="time"):
    """Return the indexed cost field and predecessor array for reuse across goals."""
    if objective not in {"time", "hazard"}:
        raise ValueError("objective must be 'time' or 'hazard'")
    source = graph.node(start)
    if not graph.valid.flat[source]:
        raise ValueError("start is hard-blocked")
    csr = graph.time_csr if objective == "time" else graph.hazard_csr
    return dijkstra(csr, directed=True, indices=source, return_predecessors=True)
