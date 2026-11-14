import { useState, useSyncExternalStore } from 'react'
import { AlertTriangle, RotateCcw, Truck, CornerDownLeft } from 'lucide-react'
import { missionControl } from './missionControl'
import { Button } from '@/ui/Button'

export function SimulationPanel({compact=false}:{compact?:boolean}) {
  const state=useSyncExternalStore(missionControl.subscribe,missionControl.getSnapshot)
  const [error,setError]=useState(''),[oxygen,setOxygen]=useState('')
  const member=state.selectedMember,m=state.members[member]
  const run=async(args:Record<string,unknown>)=>{setError('');const r=await missionControl.execute(args);if(!r.applied)setError(String(r.error))}
  const known=m?.remainingL!=null, held=m?.hold||!!m?.incident
  const pickup=['en_route','arrived','boarding','returning'].includes(state.rover.status)
  return <section className="space-y-3 p-3 text-xs text-ink" aria-label="Mission emergency simulation">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-display text-sm font-semibold">Mission control · Scenario</h3>
      <label className="flex items-center gap-2">Astronaut<select aria-label="Simulation astronaut" value={member} onChange={e=>void run({op:'select_member',member:e.target.value})} className="border border-seam-lit bg-panel px-2 py-1 text-ink">
        {Object.keys(state.members).map(id=><option key={id} value={id}>{id}</option>)}</select></label>
    </div>
    <p className="text-ink-dim">Demo simulation · no connected suit or rover.</p>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
      <dt>Oxygen {held?'(last known)':''}</dt><dd>{known?`${m.remainingL!.toFixed(1)} L`:'Unavailable'}</dd>
      <dt>Reserved oxygen</dt><dd>{m?.reserveL!=null?`${m.reserveL.toFixed(1)} L`:'Unavailable'}</dd>
      <dt>Modeled return O₂</dt><dd>{m?.returnRequiredL!=null?`${m.returnRequiredL.toFixed(1)} L`:'Unavailable'}</dd>
      <dt>Return route</dt><dd>{m?.returnStatus??'idle'}</dd>
      <dt>Rover pickup</dt><dd>{state.rover.status.replaceAll('_',' ')}{state.rover.member?` · ${state.rover.member}`:''}</dd>
    </dl>
    {held && <div role="status" className="space-y-1 border border-caution bg-caution-soft p-2 text-caution">
      <p className="font-semibold">{m.incident?m.incident.replaceAll('_',' '):'Return requested'} · astronaut {member}</p><p>{state.message}</p>
      {m.returnRoute && <p>Red line: fastest modeled return within the native corridor · {(m.returnRoute.time_s/60).toFixed(1)} min · Scenario.</p>}
      {m.consumption!=='modeled' && <p>{m.consumption}. Oxygen shown excludes this interval.</p>}
      {m.error && <p>{m.error}</p>}
    </div>}
    <div className="flex flex-wrap gap-2">
      {!compact && <><Button size="sm" variant="ghost" disabled={!known} onClick={()=>void run({op:'report_incident',kind:'injury',member})}><AlertTriangle size={13} aria-hidden />Leg injury</Button>
      <Button size="sm" variant="ghost" disabled={!known} onClick={()=>void run({op:'return_home',member})}><CornerDownLeft size={13} aria-hidden />Return home</Button>
      <Button size="sm" variant="ghost" disabled={!known} onClick={()=>void run({op:'dispatch_rover',member})}><Truck size={13} aria-hidden />Send rover</Button></>}
      <Button size="sm" variant="ghost" disabled={m?.returnStatus!=='ready'||m.cannotWalk||pickup||m.walking} onClick={()=>void run({op:'start_return',member})}>Start return</Button>
      {pickup && <Button size="sm" variant="ghost" onClick={()=>void run({op:'cancel_rover'})}>Cancel pickup</Button>}
      <Button size="sm" variant="ghost" onClick={()=>void run({op:'reset_simulation'})}><RotateCcw size={13} aria-hidden />Reset simulation</Button>
    </div>
    {!compact && <>
      <label className="flex flex-wrap items-center gap-2">Scenario oxygen (L)<input type="number" min="0" max={m?.capacityL??undefined} value={oxygen} onChange={e=>setOxygen(e.target.value)} className="w-20 border border-seam-lit bg-panel px-2 py-1 text-ink" />
        <Button size="sm" variant="ghost" disabled={!known||oxygen===''} onClick={()=>void run({op:'set_telemetry',member,oxygenL:Number(oxygen)})}>Set oxygen</Button></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={missionControl.summary().roverAvailable} onChange={e=>void run({op:'set_rover_status',available:e.target.checked})} />Simulation rover available</label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={!known} onClick={()=>void run({op:'report_incident',kind:'cannot_walk',member})}>Cannot walk</Button>
        <Button size="sm" variant="ghost" disabled={!known} onClick={()=>void run({op:'report_incident',kind:'low_oxygen',member})}>Low oxygen</Button>
        <Button size="sm" variant="ghost" disabled={!known} onClick={()=>void run({op:'report_incident',kind:'oxygen_leak',member})}>Oxygen leak</Button>
        {m?.incident && <Button size="sm" variant="ghost" onClick={()=>void run({op:'clear_incident',member})}>Clear incident</Button>}
      </div>
    </>}
    {state.rover.status!=='idle' && <p className="text-ink-dim">Dashed amber line: illustrative rover movement. No traversability or rescue ETA is inferred. Animation runs at demo speed.</p>}
    {error && <p role="alert" className="text-caution">{error}</p>}
  </section>
}
