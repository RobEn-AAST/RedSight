"""Bounded FastAPI façade for real native-grid route calculation.

Run from the repository root with `uvicorn engine.api:app --host 127.0.0.1 --port 8790`.
The single process worker caches the verified raster/graph inputs and keeps scipy Dijkstra
off the async request loop. Only one expensive request is admitted at a time.
"""

import asyncio
from concurrent.futures import ProcessPoolExecutor
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from engine.routing_api import route_request, return_request

app = FastAPI(title="RedSight terrain routing", docs_url=None, redoc_url=None)
executor: ProcessPoolExecutor | None = None
busy = False


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    destination_id: str = Field(min_length=2, max_length=8)
    mode: Literal["fastest", "safest", "balanced"]
    slope_cap_deg: float = Field(ge=0, le=15)
    crew_count: int = Field(ge=1, le=2)
    body_mass_kg: float = Field(ge=43, le=110)
    load_kg: float = Field(ge=0, le=40)
    sample_kg_per_stop: float = Field(ge=0, le=10)
    sand_weight: float = Field(default=0.0, ge=0, le=3)
    hazard_weight: float = Field(default=0.5, ge=0, le=1)


class ReturnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    start_lonlat: tuple[float, float]
    start_edge_lonlat: tuple[tuple[float,float],tuple[float,float]] | None = None
    slope_cap_deg: float = Field(ge=0, le=15)
    crew_count: int = Field(ge=1, le=2)
    body_mass_kg: float = Field(ge=43, le=110)
    load_kg: float = Field(ge=0, le=40)
    sample_kg_per_stop: float = Field(ge=0, le=10)


@app.post("/return")
async def return_route(request: ReturnRequest):
    return await calculate(return_request, request.model_dump())


@app.get("/health")
async def health():
    import os
    from pathlib import Path
    path = Path(os.environ.get("REDSIGHT_ENGINE_MANIFEST", "data/raw/engine-pilot/input-manifest.json"))
    return {"ok": True, "terrainConfigured": path.is_file(), "engine": "native-primary-DTM"}


@app.post("/route")
async def route(request: RouteRequest):
    return await calculate(route_request, request.model_dump())


async def calculate(calculate_request, payload):
    global executor, busy
    if busy:
        raise HTTPException(status_code=429, detail="Routing worker is busy; retry this request once the active calculation finishes.")
    busy = True
    loop = asyncio.get_running_loop()
    if executor is None:
        executor = ProcessPoolExecutor(max_workers=1)
    future = loop.run_in_executor(executor, calculate_request, payload)
    def release(_):
        global busy
        busy = False
    future.add_done_callback(release)
    try:
        result = await asyncio.wait_for(asyncio.shield(future), timeout=90)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Native terrain route calculation exceeded 90 seconds; the slope constraint was not relaxed.")
    except asyncio.CancelledError:
        # The worker may finish after the browser disconnects; its callback releases the slot.
        raise
    if result["status"] == "unavailable":
        raise HTTPException(status_code=503, detail=result)
    return result
