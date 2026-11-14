import math
import numpy as np
import pytest
from affine import Affine
from rasterio.warp import transform
import engine.routing_api as api

CRS = '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +R=3396190 +units=m +no_defs'

@pytest.fixture
def base(monkeypatch):
    constants = dict(slope_limit_foot_deg=15, body_mass_kg=82, carried_load_kg=15,
                     suit_factor_kappa=1, watts_to_o2_ml_per_min=.003, walk_speed_kmh=3.6)
    native = dict(elevation_m=np.array([[0, .1, .2]], dtype=np.float32), slope_deg=np.zeros((1,3)),
                  transform=Affine(1,0,0,0,-1,1), crs=CRS, resolution_m=1,
                  source_row0=0, source_col0=0, habitat_cell=(0,0))
    value = dict(constants=constants, native=native, constants_hash='fixture')
    monkeypatch.setattr(api, '_load_base', lambda: value)
    return value

def coord(x):
    lon, lat = transform(CRS, api.MARS_GEOGRAPHIC_CRS, [x], [.5])
    return [lon[0], lat[0]]

def request(**kw):
    return dict(start_lonlat=coord(2.5), slope_cap_deg=15, crew_count=2,
                body_mass_kg=82, load_kg=15, sample_kg_per_stop=2, **kw)

def test_return_uses_current_vertex_to_home_with_directional_costs(base):
    result = api.return_request(request())
    assert result['status'] == 'ok'
    route = result['return_route']
    assert np.allclose(route['coords'][0], coord(2.5))
    assert np.allclose(route['coords'][-1], coord(.5))
    assert len(route['coords']) == 3
    # Independent scalar edge oracle: returning downhill carrying both equipment and samples.
    from engine.model.metabolism import segment_cost
    expected = segment_cost(distance_m=1, grade_deg=math.degrees(math.atan2(-.1,1)),
                            body_mass_kg=82, load_kg=17, terrain_factor=1, kappa=1,
                            watts_to_o2_ml_per_min=.003, max_speed_mps=1)
    assert route['time_s'] == pytest.approx(2*expected.t_s, rel=1e-6)
    assert route['oxygen_l'] == pytest.approx(2*expected.o2_l, rel=1e-6)
    assert route['cum']['o2_l'][-1] == route['oxygen_l']
    assert route['slope_cap_deg'] == 15

@pytest.mark.parametrize('point', [coord(2.6), coord(99), [float('nan'),0]])
def test_no_unmodeled_start_connector(base, point):
    assert api.return_request({**request(), 'start_lonlat':point})['status'] != 'ok'

def test_blocked_cap_is_never_relaxed(base):
    result = api.return_request({**request(), 'slope_cap_deg':0})
    assert result['status'] == 'no_route'

def test_already_home_is_zero_cost(base):
    route = api.return_request({**request(), 'start_lonlat':coord(.5)})['return_route']
    assert route['time_s'] == route['oxygen_l'] == 0
    assert len(route['coords']) == 1

@pytest.mark.parametrize('patch', [{'slope_cap_deg':16}, {'load_kg':-1}, {'crew_count':3}, {'sample_kg_per_stop':float('inf')}])
def test_invalid_return_inputs_rejected_before_terrain(base, patch):
    assert api.return_request({**request(), **patch})['status'] == 'error'

def test_exact_mid_edge_start_gets_a_modeled_partial_edge_not_a_snap(base):
    p={**request(),'start_lonlat':coord(2.2),'start_edge_lonlat':[coord(1.5),coord(2.5)]}
    result=api.return_request(p)
    assert result['status']=='ok'
    r=result['return_route']
    assert np.allclose(r['coords'][0],coord(2.2))
    assert r['distance_m']==pytest.approx(1.7)
    assert r['connector_modeled'] is True
    assert r['seg'][0]['cost_terms']['distance_m']==pytest.approx(.7)
    assert sum(s['t_s'] for s in r['seg'])==pytest.approx(r['time_s'])

def test_partial_start_cannot_invent_an_edge_through_blocked_terrain(base):
    base['native']['slope_deg'][0,1]=16
    result=api.return_request({**request(),'start_lonlat':coord(2.2),'start_edge_lonlat':[coord(1.5),coord(2.5)]})
    assert result['status']=='no_route'

def test_partial_start_must_lie_on_the_claimed_adjacent_edge(base):
    result=api.return_request({**request(),'start_lonlat':coord(2.2),'start_edge_lonlat':[coord(.5),coord(1.5)]})
    assert result['status']!='ok'
