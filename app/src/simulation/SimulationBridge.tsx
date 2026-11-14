import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection, Feature, LineString, Point as GeoPoint } from 'geojson'
import { useMission } from '@/lib/useMission'
import { useEngineData } from '@/lib/useEngineData'
import { usePlan } from '@/map/usePlan'
import { perAstronautLoadKg } from '@/types/mission'
import { missionControl, type ReturnRoute, type Point } from './missionControl'
import { getReplay } from './replayBridge'
import { PANORAMAS } from '@/hud/panoramas'
import { SimulationPanel } from './SimulationPanel'

export const OPEN_SOURCES_EVENT='redsight:open-sources'
const SOURCE='mission-emergency'
const LINES=[SOURCE+'-return',SOURCE+'-pickup']
const POINTS=SOURCE+'-crew'

/** Long-lived adapter, independent of whether the chat drawer is open. */
export function SimulationBridge() {
  const mission=useMission(),plan=usePlan(),engine=useEngineData()
  const latest=useRef({mission,plan,engine});useEffect(()=>{latest.current={mission,plan,engine}},[mission,plan,engine])
  const snapshot=useSyncExternalStore(missionControl.subscribe,missionControl.getSnapshot)
  const [planTab,setPlanTab]=useState('stop')
  useEffect(()=>{const listen=(event:Event)=>setPlanTab((event as CustomEvent<string>).detail);window.addEventListener('redsight:plan-tab',listen);return ()=>window.removeEventListener('redsight:plan-tab',listen)},[])
  const config=mission.state.config
  const configKey=JSON.stringify([mission.state.status,config,plan.activeRoute?.id,plan.crewMode,plan.o2BudgetL])
  useEffect(()=>{
    missionControl.configure({key:configKey,roverAvailable:config.roverAvailable,
      habitat:(engine.meta?.habitat?.lonlat as Point)??null,slopeCapDeg:config.routeSlopeCapDeg,
      members:Array.from({length:config.crewCount},(_,i)=>String.fromCharCode(65+i))})
  },[configKey,engine.meta,config.roverAvailable,config.crewCount,config.routeSlopeCapDeg]) // configKey covers every model input.
  useEffect(()=>missionControl.connect({
    pause:()=>getReplay().pause(), play:()=>getReplay().play(), seek:(s)=>getReplay().seek(s),
    reset:()=>{try{const r=getReplay();r.setHeld(false);r.pause();r.clearDrill();r.seek(0)}catch{/* No route yet. */}},
    returnRoute:async(member,signal)=>{
      const c=latest.current.mission.state.config
      let edge:Point[]|undefined
      const p=member.position,coords=member.route?.coords??[]
      if(p)for(let i=0;i<coords.length-1;i++){
        const a=coords[i],b=coords[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy
        if(!len)continue
        const f=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len
        if(f>=0&&f<=1&&Math.hypot(p[0]-a[0]-f*dx,p[1]-a[1]-f*dy)<1e-9){edge=[a,b];break}
      }
      const response=await fetch('/api/routing/return',{method:'POST',headers:{'Content-Type':'application/json'},
        signal:AbortSignal.any([signal,AbortSignal.timeout(95000)]),body:JSON.stringify({start_lonlat:member.position,...(edge?{start_edge_lonlat:edge}:{}),
          slope_cap_deg:c.routeSlopeCapDeg,crew_count:c.crewCount,body_mass_kg:c.bodyMassKg,
          load_kg:perAstronautLoadKg(c),sample_kg_per_stop:c.sampleKgPerStop})})
      const payload=await response.json()
      if(!response.ok || payload.status!=='ok')throw Error(payload.message??payload.detail?.message??'Native return unavailable; no route was substituted.')
      const route=payload.return_route as ReturnRoute
      const home=latest.current.plan.activeRoute?.coords[0]
      const end=route?.coords?.at(-1)
      if(!home||!end||end.some((v,i)=>Math.abs(v-home[i])>1e-8))throw Error('Return endpoint does not match the modeled habitat terrain cell.')
      return route
    },
    read:(section,id)=>{
      const {mission,plan,engine}=latest.current
      const member=missionControl.getSnapshot().members[id??'A']
      switch(section){
        case 'mission':return {config:mission.state.config,status:mission.state.status,simulation:missionControl.summary()}
        case 'oxygen':return id?{member:id,...member,route:undefined,returnRoute:undefined}:missionControl.summary()
        case 'stops':return id?engine.stops?.find(s=>s.id===id):engine.stops
        case 'targets':return id?engine.targets?.find(s=>s.id===id):engine.targets
        case 'constants':return engine.constants
        case 'layers':return {layers:engine.layers,visibility:plan.layerVisibility,imagery:plan.showImagery,traverse:plan.showCuriosityPath}
        case 'cards':return id?engine.cards[id as 'rad'|'rems']:engine.cards
        case 'routes':return {selected:plan.selectedTargetId,preset:plan.preset,crewMode:plan.crewMode,index:engine.routeIndex,
          candidates:Object.fromEntries(Object.entries(plan.plans).map(([mode,p])=>[mode,p?{id:p.id,crew:p.crew,loadKg:p.load_kg,rover:p.rover,budgetL:p.budget_l,
            members:p.together.map(m=>({member:m.member,timeOutS:m.cum.t_s.at(-1),returnS:m.back.t_s.at(-1),oxygenOutL:m.cum.o2_l.at(-1),returnL:m.back.o2_l.at(-1)}))}:null]))}
        case 'hazards':return {type:engine.hazards?.type,count:engine.hazards?.features.length,reasons:[...new Set(engine.hazards?.features.map(f=>f.properties.reason))],note:'Mapped hazard polygons; route legality comes from native terrain, not this summary.'}
        case 'provenance':return {meta:engine.meta,cards:engine.cards,layers:engine.layers,constants:engine.constants}
        case 'capabilities':return {operations:missionControl.summary().capabilities,providerActions:['set_mission','set_mission_factors','set_mission_screen','set_layer','select_destination','set_route_preference','reset_route_constraints','set_oxygen_budget'],datasets:['mission','oxygen','stops','targets','constants','layers','cards','routes','hazards','provenance','factors']}
        case 'factors':return {radiationBudgetMsv:mission.state.config.radiationBudgetMsv,sepEvent:mission.state.config.sepEvent,startLocalHour:mission.state.config.startLocalHour,daylightRequired:mission.state.config.daylightRequired,coldLimitK:mission.state.config.coldLimitK,stopMinutes:mission.state.config.stopMinutes,sandWeight:mission.state.config.sandWeight,hazardWeight:mission.state.config.hazardWeight}
        default:return {error:'Unknown dataset section. Query capabilities for available sections.'}
      }
    },
    ui:async(args)=>{
      const {plan,engine}=latest.current
      switch(args.op){
        case 'set_crew_mode':
          if(args.mode!=='together'&&args.mode!=='split')throw Error('mode must be together or split.')
          if(args.mode==='split'&&!plan.activePlan?.split)throw Error('Split-crew plan unavailable for this destination.')
          plan.setCrewMode(args.mode);break
        case 'set_traverse':
        case 'set_imagery':
          if(typeof args.visible!=='boolean')throw Error('visible must be boolean.')
          if(args.op==='set_traverse')plan.setShowCuriosityPath(args.visible);else plan.setShowImagery(args.visible);break
        case 'focus_map':{
          const member=missionControl.getSnapshot().members[String(args.member??'A')]
          const stop=engine.stops?.find(t=>t.id===plan.selectedTargetId)
          const center=args.target==='habitat'?engine.meta?.habitat?.lonlat:args.target==='destination'?(stop?[stop.lon,stop.lat]:null):args.target==='astronaut'?member?.position:null
          if(!center||!plan.map)throw Error('Map focus target unavailable. Choose habitat, destination or astronaut.')
          plan.map.flyTo({center:center as Point,zoom:17,essential:false});break
        }
        case 'open_sources':window.dispatchEvent(new Event(OPEN_SOURCES_EVENT));break
        case 'open_hud':
          if(!plan.activeRoute || !PANORAMAS[plan.activeRoute.stop])throw Error('A panorama is unavailable for this destination; choose a stop with a 360 view.')
          window.dispatchEvent(new Event('redsight:open-360'));break
        case 'close_hud':window.dispatchEvent(new Event('redsight:close-360'));break
        case 'drill':
          if(typeof args.factor!=='number'||!Number.isFinite(args.factor)||args.factor<1||args.factor>4)throw Error('Scenario drill factor must be 1–4.')
          getReplay().drill(args.factor,'Operator Scenario drill');break
        case 'clear_drill':getReplay().clearDrill();break
        case 'set_callouts':
          if(typeof args.enabled!=='boolean')throw Error('enabled must be boolean.')
          getReplay().setCallouts(args.enabled);break
        case 'set_status_interval':
          if(args.percent!==5&&args.percent!==10)throw Error('Oxygen callout interval must be 5 or 10 percent.')
          getReplay().setStatusInterval(args.percent);break
        case 'set_replay_speed':
          if(typeof args.seconds!=='number'||![30,60,120].includes(args.seconds))throw Error('Replay duration must be 30, 60 or 120 seconds.')
          getReplay().setDuration(args.seconds);break
        default:throw Error('UI operation unavailable.')
      }
      return {applied:true,operation:args.op,badge:'Scenario'}
    },
  }),[])
  useEffect(()=>{
    const timer=window.setInterval(()=>missionControl.tick(100),100)
    return ()=>window.clearInterval(timer)
  },[])
  useEffect(()=>{
    const map=plan.map
    if(!map)return
    const caution=getComputedStyle(document.documentElement).getPropertyValue('--color-caution').trim()
    const signal=getComputedStyle(document.documentElement).getPropertyValue('--color-signal').trim()
    const draw=()=>{
      if(!map.isStyleLoaded())return
      if(!map.getSource(SOURCE))map.addSource(SOURCE,{type:'geojson',data:{type:'FeatureCollection',features:[]}})
      if(!map.getLayer(LINES[0]))map.addLayer({id:LINES[0],type:'line',source:SOURCE,filter:['==',['get','kind'],'return'],paint:{'line-color':caution,'line-width':5}})
      if(!map.getLayer(LINES[1]))map.addLayer({id:LINES[1],type:'line',source:SOURCE,filter:['==',['get','kind'],'pickup'],paint:{'line-color':signal,'line-width':2,'line-dasharray':[2,3]}})
      if(!map.getLayer(POINTS))map.addLayer({id:POINTS,type:'circle',source:SOURCE,filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':['case',['==',['get','label'],'Rover'],9,6],'circle-color':['case',['==',['get','label'],'Rover'],signal,caution],'circle-stroke-width':2,'circle-stroke-color':signal}})
      const features: Feature<LineString|GeoPoint>[]=[]
      const line=(coords:Point[],kind:string)=>{if(coords.length>1)features.push({type:'Feature',properties:{kind},geometry:{type:'LineString',coordinates:coords}})}
      const point=(coord:Point,label:string)=>features.push({type:'Feature',properties:{label},geometry:{type:'Point',coordinates:coord}})
      const state=missionControl.getSnapshot()
      const held=Object.values(state.members).some(m=>m.hold||!!m.incident)
      for(const [id,m] of Object.entries(state.members)){
        if(held && m.position)point(m.position,id)
        if(m.returnRoute)line(m.returnRoute.coords,'return')
      }
      const r=state.rover
      if(r.position && !['idle','unavailable'].includes(r.status)){point(r.position,'Rover');if(r.from&&r.target)line([r.from,r.target],'pickup')}
      ;(map.getSource(SOURCE) as GeoJSONSource)?.setData({type:'FeatureCollection',features} as FeatureCollection)
      for(const id of [...LINES,POINTS])if(map.getLayer(id))map.moveLayer(id)
    }
    draw();if(!map.isStyleLoaded())map.once('load',draw)
    return ()=>{map.off('load',draw)}
  },[plan.map,snapshot.revision])
  // Keep incident status/actions visible even with the replay tab hidden.
  return mission.state.status==='active' && planTab!=='replay' && Object.values(snapshot.members).some(m=>m.incident||m.hold)
    ? <div className="pointer-events-auto fixed bottom-4 right-3 z-30 max-h-[45vh] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto border border-caution bg-hull"><SimulationPanel compact /></div> : null
}
