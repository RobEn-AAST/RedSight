"""Translate a synthetic/metric path into the stable app route-array shape."""

import numpy as np

from engine.model.grid import DirectedGraph


def route_arrays(graph: DirectedGraph, nodes, *, coordinates=None):
    nodes = tuple(graph.node(n) for n in nodes)
    if len(nodes) < 2:
        raise ValueError("route needs at least two cells")
    if any((a, b) not in graph.edges for a, b in zip(nodes, nodes[1:])):
        raise ValueError("route contains a blocked or missing edge")
    if coordinates is None:
        # Synthetic Gate A coordinates only. Real builds supply projected-grid -> lon/lat values.
        coordinates = lambda node: [graph.cell(node)[1] * graph.resolution_m,
                                    graph.cell(node)[0] * graph.resolution_m]
    coords = [list(coordinates(node)) for node in nodes]
    forward = [graph.edges[(a, b)] for a, b in zip(nodes, nodes[1:])]
    reverse = [graph.edges[(nodes[i], nodes[i - 1])] for i in range(1, len(nodes))]
    segments = [
        {
            "t_s": edge.t_s,
            "o2_l": edge.o2_l,
            "slope_deg": edge.grade_deg,
            "cost_terms": {
                "distance_m": edge.distance_m,
                "hazard_score": edge.hazard,
                "terrain_factor": edge.terrain_factor,
                "power_w": edge.power_w,
            },
        }
        for edge in forward
    ]
    cum_t = np.concatenate(([0.0], np.cumsum([edge.t_s for edge in forward]))).tolist()
    cum_o = np.concatenate(([0.0], np.cumsum([edge.o2_l for edge in forward]))).tolist()
    back_t = np.zeros(len(nodes), dtype=float)
    back_o = np.zeros(len(nodes), dtype=float)
    for i, edge in enumerate(reverse, start=1):
        back_t[i] = back_t[i - 1] + edge.t_s
        back_o[i] = back_o[i - 1] + edge.o2_l
    back_t = back_t.tolist()
    back_o = back_o.tolist()
    return {
        "coords": coords,
        "seg": segments,
        "cum": {"t_s": cum_t, "o2_l": cum_o},
        "back": {"t_s": back_t, "o2_l": back_o},
        "total_s": cum_t[-1] + back_t[-1],
    }
