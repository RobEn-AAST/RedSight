"""Bounded native-resolution walking graph for route feasibility and costs."""

from dataclasses import dataclass
import math

import numpy as np
from rasterio.transform import rowcol
from scipy.sparse import csr_matrix

from engine.model.metabolism import pandolf_standing_power_w


@dataclass
class NativeRoutingGraph:
    elevation_m: np.ndarray
    slope_deg: np.ndarray
    walkable: np.ndarray
    transform: object
    crs: object
    source_row0: int
    source_col0: int
    resolution_m: float
    return_load_kg: float
    time_csr: csr_matrix
    hazard_csr: csr_matrix

    @property
    def shape(self):
        return self.elevation_m.shape

    def node(self, cell):
        row, col = map(int, cell)
        if not (0 <= row < self.shape[0] and 0 <= col < self.shape[1]):
            raise ValueError("native row/column is outside the bounded routing grid")
        return row * self.shape[1] + col

    def cell(self, node):
        row, col = divmod(int(node), self.shape[1])
        return row, col

    def global_cell(self, node):
        row, col = self.cell(node)
        return row + self.source_row0, col + self.source_col0


def _movement_arrays(
    distance_m,
    grade_deg,
    *,
    body_mass_kg,
    load_kg,
    kappa,
    watts_to_o2_ml_per_min,
    max_speed_mps,
):
    grade = np.asarray(grade_deg, dtype=np.float64)
    distance = np.asarray(distance_m, dtype=np.float64)
    speed_factor = np.empty_like(grade)
    steep_down = grade <= -12.0
    mild_down = (grade > -12.0) & (grade < 0.0)
    uphill = grade >= 0.0
    speed_factor[steep_down] = np.maximum(
        0.3, 1.1 - (np.abs(grade[steep_down]) - 12.0) * (0.8 / 3.0)
    )
    speed_factor[mild_down] = 1.1
    speed_factor[uphill] = np.maximum(0.3, np.cos(np.radians(2.0 * grade[uphill])))
    speed = max_speed_mps * speed_factor
    time_s = distance / speed
    grade_percent = 100.0 * np.tan(np.radians(grade))
    standing = pandolf_standing_power_w(body_mass_kg, load_kg)
    power = standing + (body_mass_kg + load_kg) * (1.5 * speed**2 + 0.35 * speed * grade_percent)
    # Downhill floor: the Pandolf (1977) standing-with-load terms (see engine.model.metabolism).
    power = np.maximum(standing, power)
    o2_l = power * kappa * time_s * watts_to_o2_ml_per_min / 60_000.0
    return time_s, o2_l


def build_native_routing_graph(
    elevation_m,
    horn_slope_deg,
    *,
    transform,
    crs=None,
    resolution_m,
    slope_limit_deg,
    body_mass_kg,
    load_kg,
    kappa,
    watts_to_o2_ml_per_min,
    max_speed_mps,
    return_load_kg=None,
    source_row0=0,
    source_col0=0,
):
    """Build bounded sparse route objectives with the engine's existing edge rules."""
    elevation = np.asarray(elevation_m, dtype=np.float32)
    slope = np.asarray(horn_slope_deg, dtype=np.float32)
    if elevation.ndim != 2 or min(elevation.shape) < 1 or slope.shape != elevation.shape:
        raise ValueError("native elevation and slope must be matching non-empty 2D arrays")
    if not math.isfinite(resolution_m) or resolution_m <= 0:
        raise ValueError("native resolution must be positive and finite")
    if not math.isfinite(slope_limit_deg) or slope_limit_deg < 0:
        raise ValueError("slope limit must be non-negative and finite")
    if not np.all(np.isfinite(elevation)):
        raise ValueError("native routing elevation must be finite; source nodata stays blocked before graph creation")
    rows, cols = elevation.shape
    return_load = float(load_kg if return_load_kg is None else return_load_kg)
    if not math.isfinite(return_load) or return_load < 0:
        raise ValueError("return load must be finite and non-negative")
    tolerance = max(1e-10, abs(slope_limit_deg) * 1e-12)
    walkable = np.isfinite(slope) & (slope <= slope_limit_deg + tolerance)
    pair_sources, pair_destinations, pair_times, pair_hazards = [], [], [], []
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
        r0, r1 = max(0, -dr), min(rows, rows - dr)
        c0, c1 = max(0, -dc), min(cols, cols - dc)
        source_walkable = walkable[r0:r1, c0:c1]
        destination_walkable = walkable[r0 + dr:r1 + dr, c0 + dc:c1 + dc]
        legal = source_walkable & destination_walkable
        if dr and dc:
            legal &= walkable[r0:r1, c0 + dc:c1 + dc] & walkable[r0 + dr:r1 + dr, c0:c1]
        distance = resolution_m * math.hypot(dr, dc)
        difference = np.subtract(
            elevation[r0 + dr:r1 + dr, c0 + dc:c1 + dc].astype(np.float64),
            elevation[r0:r1, c0:c1].astype(np.float64),
        )
        grade = np.degrees(np.arctan2(difference, distance))
        legal &= np.abs(grade) <= slope_limit_deg + tolerance
        indices = np.flatnonzero(legal)
        if not indices.size:
            continue
        rr = indices // legal.shape[1] + r0
        cc = indices % legal.shape[1] + c0
        source = (rr * cols + cc).astype(np.int32, copy=False)
        destination = ((rr + dr) * cols + cc + dc).astype(np.int32, copy=False)
        forward_time, _ = _movement_arrays(
            distance, grade.flat[indices], body_mass_kg=body_mass_kg, load_kg=load_kg,
            kappa=kappa, watts_to_o2_ml_per_min=watts_to_o2_ml_per_min,
            max_speed_mps=max_speed_mps,
        )
        reverse_time, _ = _movement_arrays(
            distance, -grade.flat[indices], body_mass_kg=body_mass_kg, load_kg=return_load,
            kappa=kappa, watts_to_o2_ml_per_min=watts_to_o2_ml_per_min,
            max_speed_mps=max_speed_mps,
        )
        slope_fraction = np.zeros_like(grade.flat[indices]) if slope_limit_deg == 0 else np.abs(grade.flat[indices]) / slope_limit_deg
        hazard = distance * (1.0 + slope_fraction ** 2)
        pair_sources.append(source)
        pair_destinations.append(destination)
        pair_times.append((forward_time.astype(np.float32), reverse_time.astype(np.float32)))
        pair_hazards.append(hazard.astype(np.float32))

    if pair_sources:
        source = np.concatenate(pair_sources)
        destination = np.concatenate(pair_destinations)
        forward = np.concatenate([pair[0] for pair in pair_times])
        reverse = np.concatenate([pair[1] for pair in pair_times])
        hazard = np.concatenate(pair_hazards)
        row = np.concatenate((source, destination))
        col = np.concatenate((destination, source))
        times = np.concatenate((forward, reverse))
        hazards = np.concatenate((hazard, hazard))
        shape = (rows * cols, rows * cols)
        time_csr = csr_matrix((times, (row, col)), shape=shape, dtype=np.float32)
        hazard_csr = csr_matrix((hazards, (row, col)), shape=shape, dtype=np.float32)
    else:
        shape = (rows * cols, rows * cols)
        time_csr = csr_matrix(shape, dtype=np.float32)
        hazard_csr = csr_matrix(shape, dtype=np.float32)

    return NativeRoutingGraph(
        elevation, slope, walkable, transform, crs, int(source_row0), int(source_col0),
        float(resolution_m), return_load, time_csr, hazard_csr,
    )


def select_access_goal(walkable, component_labels, *, component_id, target_xy, transform, max_offset_m):
    """Select the closest source-pixel center in the habitat component within a fixed bound."""
    walkable = np.asarray(walkable, dtype=bool)
    labels = np.asarray(component_labels)
    if walkable.ndim != 2 or labels.shape != walkable.shape:
        raise ValueError("walkability and component labels must have the same 2D shape")
    if not math.isfinite(max_offset_m) or max_offset_m < 0:
        raise ValueError("access bound must be finite and non-negative")
    target_x, target_y = map(float, target_xy)
    target_row, target_col = rowcol(transform, target_x, target_y)
    radius_rows = int(math.ceil(max_offset_m / abs(transform.e))) + 1
    radius_cols = int(math.ceil(max_offset_m / abs(transform.a))) + 1
    r0, r1 = max(0, target_row - radius_rows), min(walkable.shape[0], target_row + radius_rows + 1)
    c0, c1 = max(0, target_col - radius_cols), min(walkable.shape[1], target_col + radius_cols + 1)
    rr, cc = np.nonzero(walkable[r0:r1, c0:c1] & (labels[r0:r1, c0:c1] == component_id))
    rr += r0
    cc += c0
    if not len(rr):
        return None
    center_x = transform.c + (cc + 0.5) * transform.a
    center_y = transform.f + (rr + 0.5) * transform.e
    offsets = np.hypot(center_x - target_x, center_y - target_y)
    eligible = np.flatnonzero(offsets <= max_offset_m + 1e-10)
    if not len(eligible):
        return None
    order = np.lexsort((cc[eligible], rr[eligible], offsets[eligible]))
    index = int(eligible[order[0]])
    return {
        "row_col": [int(rr[index]), int(cc[index])],
        "offset_m": float(offsets[index]),
        "center_xy": [float(center_x[index]), float(center_y[index])],
    }
