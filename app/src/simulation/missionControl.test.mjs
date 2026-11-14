import test from 'node:test'
import assert from 'node:assert/strict'
import * as control from './missionControl.ts'
const route = {coords:[[0,0],[1,0],[2,0]], cum:{t_s:[0,10,20],o2_l:[0,2,4]}, back:{t_s:[0,12,24],o2_l:[0,3,6]}}
function setup(options={}) {
  const sim = new control.MissionControl()
  let paused=0
  sim.connect({pause:()=>paused++, play:()=>{}, seek:()=>{}, reset:()=>{}, returnRoute:async()=>({coords:[[1,0],[0,0]],cum:{t_s:[0,10],o2_l:[0,3]},seg:[{t_s:10,o2_l:3,slope_deg:0,cost_terms:{distance_m:1}}],time_s:10,oxygen_l:3,distance_m:1,badge:'Scenario',slope_cap_deg:15}), ...options})
  sim.configure({key:'mission1',roverAvailable:true,habitat:[0,0],slopeCapDeg:15,members:['A','B']})
  sim.observe({member:'A',position:[1,0],remainingL:90,capacityL:100,reserveL:20,returnRequiredL:3,timeS:10,phase:'out',route})
  sim.observe({member:'B',position:[1,0],remainingL:85,capacityL:100,reserveL:20,returnRequiredL:3,timeS:10,phase:'out',route})
  return {sim, paused:()=>paused}
}
test('simulation controller is available',()=>assert.equal(typeof control.MissionControl,'function'))
test('injury atomically holds crew, requests return and dispatches one illustrative pickup',async()=>{
 const {sim,paused}=setup(); const r=await sim.execute({op:'report_incident',kind:'injury',member:'A'},'one')
 assert.equal(r.applied,true); assert.equal(paused(),1)
 assert.equal(sim.getSnapshot().members.A.incident,'injury')
 assert.equal(sim.getSnapshot().members.A.remainingL,90)
 assert.equal(sim.getSnapshot().rover.status,'en_route')
 assert.equal(sim.getSnapshot().members.A.returnStatus,'ready')
 await sim.execute({op:'report_incident',kind:'injury',member:'A'},'one')
 assert.equal(paused(),1)
})
test('oxygen percent is converted using known capacity without altering planning budget',async()=>{
 const {sim}=setup(); await sim.execute({op:'set_telemetry',member:'B',oxygenPercent:25})
 assert.equal(sim.getSnapshot().members.B.remainingL,25)
 assert.equal(sim.getSnapshot().members.A.remainingL,90)
 assert.equal((await sim.execute({op:'set_telemetry',oxygenL:-1})).applied,false)
})
test('reset prevents late return calculations and clears rescue',async()=>{
 let resolve; const {sim}=setup({returnRoute:()=>new Promise(r=>resolve=r)})
 const work=sim.execute({op:'report_incident',kind:'injury'})
 await sim.execute({op:'reset_simulation'})
 resolve({coords:[[1,0],[0,0]],cum:{t_s:[0,10],o2_l:[0,3]},time_s:10,oxygen_l:3})
 await work
 assert.equal(sim.getSnapshot().members.A.incident,null)
 assert.equal(sim.getSnapshot().members.A.returnRoute,null)
 assert.equal(sim.getSnapshot().rover.status,'idle')
})
test('no walking for immobilized crew and no fictional route on routing error',async()=>{
 const {sim}=setup({returnRoute:async()=>{throw Error('Terrain unavailable')}})
 await sim.execute({op:'report_incident',kind:'cannot_walk'})
 assert.equal(sim.getSnapshot().members.A.returnStatus,'unavailable')
 assert.equal((await sim.execute({op:'start_return'})).applied,false)
 assert.equal(sim.getSnapshot().members.A.returnRoute,null)
})
test('cancel pickup preserves incident and position, repeated ticks cannot move it',async()=>{
 const {sim}=setup(); await sim.execute({op:'dispatch_rover'}); sim.tick(3000)
 const at=sim.getSnapshot().rover.position
 await sim.execute({op:'cancel_rover'});sim.tick(90000)
 assert.deepEqual(sim.getSnapshot().rover.position,at)
 assert.deepEqual(sim.getSnapshot().members.A.position,[1,0])
})
test('unknown operations, fields and nonexistent members are rejected',async()=>{
 const {sim}=setup()
 for(const args of [{op:'eval'},{op:'dispatch_rover',member:'C'},{op:'set_telemetry',oxygenL:10,shell:'x'},{op:'set_telemetry',oxygenL:10,oxygenPercent:20}]) assert.equal((await sim.execute(args)).applied,false)
})
test('walking return preserves previously consumed oxygen',async()=>{
 const {sim}=setup();await sim.execute({op:'return_home'});await sim.execute({op:'start_return'});sim.tick(15000)
 assert.equal(sim.getSnapshot().members.A.remainingL,88.5)
 assert.deepEqual(sim.getSnapshot().members.A.position,[.5,0])
})
test('rover unavailable leaves return available with an honest pickup result',async()=>{
 const {sim}=setup(); await sim.execute({op:'set_rover_status',available:false});const r=await sim.execute({op:'report_incident',kind:'injury'})
 assert.equal(r.applied,true);assert.equal(sim.getSnapshot().rover.status,'unavailable');assert.equal(sim.getSnapshot().members.A.returnStatus,'ready')
})

test('repeated telemetry inputs continue subtracting modeled consumption from the raw replay baseline',async()=>{
 const {sim}=setup();await sim.execute({op:'set_telemetry',member:'A',oxygenL:50})
 sim.observe({member:'A',position:[1,0],remainingL:85,capacityL:100,reserveL:20,returnRequiredL:3,timeS:12,phase:'out',route})
 await sim.execute({op:'set_telemetry',member:'A',oxygenL:40})
 sim.observe({member:'A',position:[1,0],remainingL:80,capacityL:100,reserveL:20,returnRequiredL:3,timeS:15,phase:'out',route})
 assert.equal(sim.getSnapshot().members.A.remainingL,35)
})
test('pausing and resuming a return cannot teleport back or charge oxygen twice',async()=>{
 const {sim}=setup();await sim.execute({op:'return_home'});await sim.execute({op:'start_return'});sim.tick(15000)
 await sim.execute({op:'pause'});await sim.execute({op:'start_return'});sim.tick(15000)
 assert.equal(sim.getSnapshot().members.A.remainingL,87)
 assert.deepEqual(sim.getSnapshot().members.A.position,[0,0])
})
test('reset observes replay at the start instead of dropping the fresh sample',async()=>{
 const {sim}=setup({reset:()=>sim.observe({member:'A',position:[0,0],remainingL:100,capacityL:100,reserveL:20,returnRequiredL:0,timeS:0,phase:'out',route})})
 await sim.execute({op:'reset_simulation'})
 assert.equal(sim.getSnapshot().members.A.remainingL,100)
})

test('synchronous replay observations during pause cannot discard the incident',async()=>{
 const {sim}=setup({pause:()=>sim.observe({member:'A',position:[1.1,0],remainingL:89,capacityL:100,reserveL:20,returnRequiredL:3,timeS:11,phase:'out',route})})
 await sim.execute({op:'report_incident',kind:'injury'})
 assert.equal(sim.getSnapshot().members.A.incident,'injury')
 assert.equal(sim.getSnapshot().members.A.hold,true)
 assert.deepEqual(sim.getSnapshot().members.A.position,[1.1,0])
})

test('immobility persists when a second oxygen incident is reported',async()=>{
 const {sim}=setup();await sim.execute({op:'report_incident',kind:'cannot_walk'});await sim.execute({op:'report_incident',kind:'low_oxygen'})
 await sim.execute({op:'cancel_rover'})
 assert.equal((await sim.execute({op:'start_return'})).applied,false)
 assert.deepEqual(sim.getSnapshot().members.A.incidents,['cannot_walk','low_oxygen'])
})
test('a late return cannot apply after illustrative pickup moves the astronaut',async()=>{
 let finish;const {sim}=setup({returnRoute:()=>new Promise(r=>finish=r)})
 const p=sim.execute({op:'report_incident',kind:'injury'})
 sim.tick(20000)
 finish({coords:[[1,0],[0,0]],cum:{t_s:[0,10],o2_l:[0,3]},seg:[{t_s:10,o2_l:3,slope_deg:0,cost_terms:{distance_m:1}}],time_s:10,oxygen_l:3,badge:'Scenario',slope_cap_deg:15})
 await p;assert.equal(sim.getSnapshot().members.A.returnRoute,null)
})

test('configuration changes retain emergency, position and entered oxygen',async()=>{
 const {sim}=setup();await sim.execute({op:'set_telemetry',oxygenL:60});await sim.execute({op:'report_incident',kind:'injury'})
 sim.configure({key:'new-load',roverAvailable:true,habitat:[0,0],slopeCapDeg:10,members:['A','B']})
 assert.equal(sim.getSnapshot().members.A.incident,'injury');assert.equal(sim.getSnapshot().members.A.remainingL,60)
 assert.equal(sim.getSnapshot().members.A.hold,true)
})
test('another astronaut incident still calculates return when the rover is busy',async()=>{
 const {sim}=setup();await sim.execute({op:'dispatch_rover',member:'A'});const r=await sim.execute({op:'report_incident',kind:'injury',member:'B'})
 assert.equal(r.applied,true);assert.equal(sim.getSnapshot().members.B.returnStatus,'ready')
 assert.equal(sim.getSnapshot().rover.member,'A')
})
test('rover failure stops active pickup',async()=>{
 const {sim}=setup();await sim.execute({op:'dispatch_rover'});await sim.execute({op:'report_incident',kind:'rover_failure'});sim.tick(28000)
 assert.equal(sim.getSnapshot().rover.status,'failed');assert.deepEqual(sim.getSnapshot().members.A.position,[1,0])
})
test('completed rescue cannot restart an obsolete walking route',async()=>{
 const {sim}=setup();await sim.execute({op:'report_incident',kind:'injury'});sim.tick(28000)
 assert.equal((await sim.execute({op:'start_return'})).applied,false)
 assert.equal(sim.getSnapshot().members.A.returnRequiredL,0)
})
test('new oxygen input while walking is retained as consumption continues',async()=>{
 const {sim}=setup();await sim.execute({op:'return_home'});await sim.execute({op:'start_return'});sim.tick(15000)
 await sim.execute({op:'set_telemetry',oxygenL:70});sim.tick(1000)
 assert.equal(sim.getSnapshot().members.A.remainingL,69.9)
})

test('pause stops rover motion and play resumes the same rescue',async()=>{
 const {sim}=setup();await sim.execute({op:'dispatch_rover'});sim.tick(3000)
 const pos=sim.getSnapshot().rover.position
 await sim.execute({op:'pause'});sim.tick(3000)
 assert.deepEqual(sim.getSnapshot().rover.position,pos)
 await sim.execute({op:'play'});sim.tick(3000)
 assert.notDeepEqual(sim.getSnapshot().rover.position,pos)
})

test('ordinary replay pause/play resumes its adapter',async()=>{
 let plays=0;const {sim}=setup({play:()=>plays++})
 await sim.execute({op:'pause'});await sim.execute({op:'play'});assert.equal(plays,1)
})
test('ordinary destination changes without an incident do not lock replay',async()=>{
 const {sim}=setup();sim.configure({key:'new-destination',roverAvailable:true,habitat:[0,0],slopeCapDeg:15,members:['A','B']})
 assert.equal(sim.getSnapshot().members.A.hold,false)
})
