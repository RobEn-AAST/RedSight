"""Synthetic-friendly directed 8-neighbor graph builder for a projected Mars grid."""

from dataclasses import dataclass
import math

import numpy as np
from scipy.sparse import csr_matrix

from .metabolism import SegmentCost, segment_cost


@dataclass(frozen=True)
class EdgeCost:
    t_s: float
    o2_l: float
    grade_deg: float
    distance_m: float
    hazard: float
    terrain_factor: float
    power_w: float


@dataclass
class DirectedGraph:
    elevation_m: np.ndarray
    valid: np.ndarray
    slope_mean_deg: np.ndarray
    slope_max_deg: np.ndarray
    terrain_factor: np.ndarray
    resolution_m: float
    time_csr: csr_matrix
    hazard_csr: csr_matrix
    edges: dict[tuple[int, int], EdgeCost]
    o2_edges: np.ndarray
    hazard_slope_weight: float = 1.0
    hazard_sand_weight: float = 1.0

    @property
    def shape(self):
        return self.elevation_m.shape

    @property
    def edge_count(self):
        return len(self.edges)

    def node(self, cell):
        if isinstance(cell, tuple):
            row, col = cell
            if not (0 <= row < self.shape[0] and 0 <= col < self.shape[1]):
                raise ValueError("cell is outside the planning grid")
            return row * self.shape[1] + col
        node = int(cell)
        if node < 0 or node >= self.elevation_m.size:
            raise ValueError("node is outside the planning grid")
        return node

    def cell(self, node):
        return divmod(int(node), self.shape[1])

    def edge_cost(self, source, destination):
        return self.edges.get((self.node(source), self.node(destination)))


def _slopes(elevation, valid, resolution):
    rows, cols = elevation.shape
    mean = np.zeros(elevation.shape, dtype=float)
    maximum = np.zeros(elevation.shape, dtype=float)
    offsets = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))
    for row in range(rows):
        for col in range(cols):
            if not valid[row, col]:
                mean[row, col] = maximum[row, col] = np.nan
                continue
            grades = []
            for dr, dc in offsets:
                nr, nc = row + dr, col + dc
                if 0 <= nr < rows and 0 <= nc < cols and valid[nr, nc]:
                    distance = resolution * math.hypot(dr, dc)
                    grades.append(abs(math.degrees(math.atan2(elevation[nr, nc] - elevation[row, col], distance))))
            if grades:
                mean[row, col] = float(np.mean(grades))
                maximum[row, col] = float(np.max(grades))
    return mean, maximum


def build_graph(
    elevation_m,
    *,
    resolution_m,
    terrain_factor=None,
    nodata=None,
    hard_slope_deg=None,
    max_slope_deg=15.0,
    body_mass_kg=82.0,
    load_kg=15.0,
    kappa=1.3,
    watts_to_o2_ml_per_min=2.9,
    max_speed_mps=1.6 / 3.6,
    hazard_slope_weight=1.0,
    hazard_sand_weight=1.0,
):
    """Build legal directional edges; nodata and over-limit terrain stay hard-blocked."""
    elevation = np.asarray(elevation_m, dtype=float)
    if elevation.ndim != 2 or min(elevation.shape) < 1:
        raise ValueError("elevation must be a non-empty 2D array")
    if not math.isfinite(resolution_m) or resolution_m <= 0:
        raise ValueError("resolution_m must be positive and finite")
    valid = np.isfinite(elevation)
    if nodata is not None:
        valid &= elevation != nodata
    eta = np.ones(elevation.shape, dtype=float) if terrain_factor is None else np.asarray(terrain_factor, dtype=float)
    if eta.shape != elevation.shape or np.any(~np.isfinite(eta)) or np.any((eta < 1.0) | (eta > 2.1)):
        raise ValueError("terrain factor must match the DEM and lie in [1.0, 2.1]")
    mean_slope, planning_max_slope = _slopes(elevation, valid, resolution_m)
    if hard_slope_deg is None:
        max_slope = planning_max_slope
    else:
        max_slope = np.asarray(hard_slope_deg, dtype=float)
        if max_slope.shape != elevation.shape:
            raise ValueError("hard-slope grid must match the planning DEM shape")
        # Missing hazard support is a hard block, never interpolated or replaced by coarse slopes.
        max_slope = max_slope.copy()
        max_slope[~valid] = np.nan
    # Allow only floating-point roundoff at an exact configured boundary.
    slope_tolerance_deg = max(1e-10, abs(max_slope_deg) * 1e-12)
    walkable = valid & np.isfinite(max_slope) & (max_slope <= max_slope_deg + slope_tolerance_deg)

    rows, cols = elevation.shape
    edges = {}
    directions = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))
    for row in range(rows):
        for col in range(cols):
            if not walkable[row, col]:
                continue
            source = row * cols + col
            for dr, dc in directions:
                nr, nc = row + dr, col + dc
                if not (0 <= nr < rows and 0 <= nc < cols and walkable[nr, nc]):
                    continue
                if dr and dc and (not walkable[row, nc] or not walkable[nr, col]):
                    continue
                distance = resolution_m * math.hypot(dr, dc)
                grade = math.degrees(math.atan2(elevation[nr, nc] - elevation[row, col], distance))
                if abs(grade) > max_slope_deg + slope_tolerance_deg:
                    continue
                eta_edge = (eta[row, col] + eta[nr, nc]) / 2
                modeled: SegmentCost = segment_cost(
                    distance_m=distance,
                    grade_deg=grade,
                    body_mass_kg=body_mass_kg,
                    load_kg=load_kg,
                    terrain_factor=eta_edge,
                    kappa=kappa,
                    watts_to_o2_ml_per_min=watts_to_o2_ml_per_min,
                    max_speed_mps=max_speed_mps,
                )
                slope_term = hazard_slope_weight * (abs(grade) / max_slope_deg) ** 2
                sand_term = hazard_sand_weight * max(0.0, eta_edge - 1.0)
                hazard = distance * (1.0 + slope_term + sand_term)
                destination = nr * cols + nc
                edges[(source, destination)] = EdgeCost(
                    modeled.t_s, modeled.o2_l, grade, distance, hazard,
                    eta_edge, modeled.power_w,
                )

    shape = (elevation.size, elevation.size)
    src = np.fromiter((edge[0] for edge in edges), dtype=np.int64)
    dst = np.fromiter((edge[1] for edge in edges), dtype=np.int64)
    time_data = np.fromiter((cost.t_s for cost in edges.values()), dtype=float)
    hazard_data = np.fromiter((cost.hazard for cost in edges.values()), dtype=float)
    time_csr = csr_matrix((time_data, (src, dst)), shape=shape)
    hazard_csr = csr_matrix((hazard_data, (src, dst)), shape=shape)
    return DirectedGraph(
        elevation, walkable, mean_slope, max_slope, eta, float(resolution_m),
        time_csr, hazard_csr, edges,
        np.fromiter((cost.o2_l for cost in edges.values()), dtype=float),
        hazard_slope_weight, hazard_sand_weight,
    )
