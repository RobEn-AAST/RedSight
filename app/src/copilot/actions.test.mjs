import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDynamicRoute, validateMissionPatch } from './actions.ts'

test('mission function validates supported ranges and available IDs', () => {
  assert.equal(validateMissionPatch({crewCount:2,bodyMassKg:82,loadKg:10,sampleKgPerStop:2,scienceGoalId:'boxwork'}),null)
  assert.match(validateMissionPatch({crewCount:3}),/crewCount/)
  assert.match(validateMissionPatch({bodyMassKg:42}),/bodyMassKg/)
  assert.match(validateMissionPatch({loadKg:41}),/loadKg/)
  assert.match(validateMissionPatch({sampleKgPerStop:11}),/sampleKgPerStop/)
  assert.match(validateMissionPatch({scienceGoalId:'fabricated-target'}),/Unknown scienceGoalId/)
  assert.match(validateMissionPatch({shellCommand:'rm -rf'}),/Unsupported mission field/)
})

const validRoute = () => ({
  id:'D1_fastest_dynamic', stop:'D1', mode:'fastest', preference:'fastest', crew:2, load_kg:15,
  badge:'Scenario', budget_l:280, constants_hash:'source-hash', pnr_index:1,
  coords:[[137.4,-4.8],[137.401,-4.801]],
  seg:[{t_s:3,o2_l:1,slope_deg:5,cost_terms:{distance_m:1}}],
  cum:{t_s:[0,3],o2_l:[0,1]}, back:{t_s:[0,4],o2_l:[0,1.2]},
  total_s:7,distance_m:1,
  goal_access:{observed_stop_lonlat:[137.401,-4.801],route_goal_lonlat:[137.401,-4.801],badge:'Derived',status:'approach_only',offset_m:2,access_bound_m:10,last_leg_modeled:false},
  routing:{slope_cap_deg:10,hard_max_deg:15,native_resolution_m:1,objective:'time',objective_cost:3,data_class:'Scenario',return_model:'same_path_only',sample_mass_applied_to_return:true},
})

test('complete same-path directed return route may become active', () => {
  assert.equal(validateDynamicRoute(validRoute(),'fastest',['D1','S1']),true)
})

test('partial return, alternate-return claim, wrong slope, or fabricated destination cannot activate a route', () => {
  const partial = validRoute(); partial.back.o2_l = [0]
  assert.equal(validateDynamicRoute(partial,'fastest',['D1']),false)
  const alternate = validRoute(); alternate.back_fast = {t_s:[0,2],o2_l:[0,1],path:[]}
  assert.equal(validateDynamicRoute(alternate,'fastest',['D1']),false)
  const overCap = validRoute(); overCap.seg[0].slope_deg = 10.1
  assert.equal(validateDynamicRoute(overCap,'fastest',['D1']),false)
  assert.equal(validateDynamicRoute(validRoute(),'fastest',['S1']),false)
})

test('nonfinite mission values and inconsistent cost arrays are rejected', () => {
  assert.ok(validateMissionPatch({bodyMassKg:NaN}))
  assert.ok(validateMissionPatch({loadKg:Infinity}))
  const r=validRoute(); r.total_s=8
  assert.equal(validateDynamicRoute(r,'fastest',['D1']),false)
  r.total_s=7; r.cum.o2_l[1]=2
  assert.equal(validateDynamicRoute(r,'fastest',['D1']),false)
})

test('custom science goal text is bounded and accepted as a mission UI input',()=>{
 assert.equal(validateMissionPatch({scienceGoalNote:'Look for veins'}),null)
 assert.match(validateMissionPatch({scienceGoalNote:'x'.repeat(501)}),/500/)
})
