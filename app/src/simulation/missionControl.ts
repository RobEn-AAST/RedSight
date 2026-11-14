/** Scenario runtime shared by replay, manual controls and the copilot. No device commands. */
export type Point = [number, number]
export interface ReturnRoute {
  coords: Point[]
  cum: { t_s: number[]; o2_l: number[] }
  seg?: { t_s: number; o2_l: number; slope_deg: number; cost_terms: { distance_m: number } }[]
  time_s: number
  oxygen_l: number
  distance_m?: number
  badge: string
  slope_cap_deg: number
}
export interface MemberState {
  position: Point | null
  rawRemainingL: number | null
  remainingL: number | null
  capacityL: number | null
  reserveL: number | null
  returnRequiredL: number | null
  timeS: number
  phase: string
  incident: string | null
  incidents: string[]
  cannotWalk: boolean
  hold: boolean
  consumption: 'modeled' | 'hold consumption unavailable' | 'rover consumption unavailable'
  returnStatus: 'idle' | 'pending' | 'ready' | 'unavailable'
  returnRoute: ReturnRoute | null
  error: string | null
  telemetryOverride: { value: number; baseline: number } | null
  route: { coords: Point[]; cum: { t_s: number[]; o2_l: number[] }; back: { t_s: number[]; o2_l: number[] } } | null
  walking: boolean
  walkElapsedMs: number
  walkStartL: number | null
}
export interface SimulationState {
  revision: number
  paused: boolean
  mode: 'Demo simulation'
  members: Record<string, MemberState>
  rover: { status: 'idle' | 'en_route' | 'arrived' | 'boarding' | 'returning' | 'complete' | 'cancelled' | 'unavailable' | 'failed'; member: string | null; position: Point | null; elapsedMs: number; from: Point | null; target: Point | null; note: string }
  selectedMember: string
  message: string
}
export interface Observation {
  member: string; position: Point; remainingL: number; capacityL: number; reserveL: number; returnRequiredL: number; timeS: number; phase: string; route: MemberState['route']
}
interface Adapter {
  pause: () => void
  play: () => void
  seek: (seconds: number) => void
  reset: () => void
  returnRoute: (member: MemberState, signal: AbortSignal) => Promise<ReturnRoute>
  ui?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  read?: (section: string, id?: string) => unknown
}
const freshMember = (): MemberState => ({position:null,rawRemainingL:null,remainingL:null,capacityL:null,reserveL:null,returnRequiredL:null,timeS:0,phase:'unknown',incident:null,incidents:[],cannotWalk:false,hold:false,consumption:'modeled',returnStatus:'idle',returnRoute:null,error:null,telemetryOverride:null,route:null,walking:false,walkElapsedMs:0,walkStartL:null})
const freshRover = (): SimulationState['rover'] => ({status:'idle',member:null,position:null,elapsedMs:0,from:null,target:null,note:'Illustrative rover motion; terrain accessibility and rescue ETA unavailable.'})
const freshState = (): SimulationState => ({revision:0,paused:false,mode:'Demo simulation',members:{},rover:freshRover(),selectedMember:'A',message:'Scenario controls; no connected astronaut or rover.'})
const schemas: Record<string,string[]> = {
  status:[],report_incident:['kind','member'],return_home:['member'],dispatch_rover:['member'],cancel_rover:[],
  start_return:['member'],clear_incident:['member'],set_telemetry:['member','oxygenL','oxygenPercent'],
  reset_simulation:[],set_rover_status:['available'],play:[],pause:[],seek:['seconds'],drill:['factor'],clear_drill:[],
  set_crew_mode:['mode'],set_traverse:['visible'],focus_map:['target','member'],open_sources:[],open_hud:[],close_hud:[],
  set_imagery:['visible'],set_callouts:['enabled'],set_status_interval:['percent'],set_replay_speed:['seconds'],select_member:['member'],
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function interpolate(points: Point[], values: number[], at: number): { point: Point; index: number; ratio: number } {
  let i=0
  while(i < values.length-2 && values[i+1] < at) i++
  const j=Math.min(i+1,values.length-1), ratio=values[j]===values[i]?0:Math.max(0,Math.min(1,(at-values[i])/(values[j]-values[i])))
  return {point:[points[i][0]+(points[j][0]-points[i][0])*ratio,points[i][1]+(points[j][1]-points[i][1])*ratio],index:i,ratio}
}
export function validReturn(route: ReturnRoute, start: Point, cap: number): boolean {
  const n=route?.coords?.length
  if (!n || route.badge!=='Scenario' || route.slope_cap_deg!==cap || !finite(route.time_s) || route.time_s<0 || !finite(route.oxygen_l) || route.oxygen_l<0) return false
  if (!route.coords.every(p=>Array.isArray(p)&&p.length===2&&p.every(finite))) return false
  if (route.coords[0].some((v,i)=>Math.abs(v-start[i])>1e-8)) return false
  for (const key of ['t_s','o2_l'] as const) {
    const a=route.cum?.[key]
    if (!a || a.length!==n || a[0]!==0 || a.some((v,i)=>!finite(v)||v<0||(i>0&&v<a[i-1]))) return false
  }
  if (Math.abs(route.cum.t_s[n-1]-route.time_s)>1e-6 || Math.abs(route.cum.o2_l[n-1]-route.oxygen_l)>1e-6) return false
  if(!Array.isArray(route.seg)||route.seg.length!==n-1)return false
  for(let i=0;i<n-1;i++){
    const seg=route.seg[i]
    if(!finite(seg.slope_deg)||Math.abs(seg.slope_deg)>cap+1e-8||!finite(seg.t_s)||seg.t_s<0||!finite(seg.o2_l)||seg.o2_l<0||!finite(seg.cost_terms?.distance_m)||seg.cost_terms.distance_m<=0)return false
    if(Math.abs(route.cum.t_s[i+1]-route.cum.t_s[i]-seg.t_s)>1e-5||Math.abs(route.cum.o2_l[i+1]-route.cum.o2_l[i]-seg.o2_l)>1e-5)return false
  }
  return true
}
export class MissionControl {
  private state = freshState()
  private listeners = new Set<() => void>()
  private adapter: Adapter | null = null
  private config = {key:'',roverAvailable:false,habitat:null as Point|null,slopeCapDeg:15,members:['A']}
  private epoch=0
  private jobs = new Map<string,AbortController>()
  private dedup = new Map<string,Promise<Record<string, unknown>>>()
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getSnapshot = () => this.state
  private emit() { this.state={...this.state,revision:this.state.revision+1,members:{...this.state.members},rover:{...this.state.rover}};this.listeners.forEach(f=>f()) }
  connect(adapter: Adapter) { this.adapter=adapter;return ()=>{ if(this.adapter===adapter){this.invalidate();this.adapter=null} } }
  configure(config: typeof this.config) {
    if(config.key!==this.config.key){
      this.invalidate()
      if(Object.values(this.state.members).some(m=>m.hold||m.incident||m.walking)){
        for(const m of Object.values(this.state.members)){
          m.hold=true;m.walking=false;m.returnStatus='unavailable';m.returnRoute=null
          m.error='Mission inputs changed. Request a new return under these constraints or reset the simulation.'
        }
        this.state.message='Mission inputs changed; position, incidents and oxygen retained. Reset explicitly to start a new replay.'
      }else{this.state=freshState()}
      for(const id of config.members)if(!this.state.members[id])this.state.members[id]=freshMember()
    }
    this.config=config; this.emit()
  }
  private invalidate() { this.epoch++;this.jobs.forEach(c=>c.abort());this.jobs.clear();this.dedup.clear() }
  observe(o: Observation) {
    const current=this.state.members[o.member]
    if(!current || current.hold || current.walking || current.incident) return
    const remaining=current.telemetryOverride ? Math.max(0,current.telemetryOverride.value-(current.telemetryOverride.baseline-o.remainingL)) : o.remainingL
    this.state.members[o.member]={...current,...o,rawRemainingL:o.remainingL,remainingL:remaining};this.emit()
  }
  read(section='status', id?: string): unknown {
    if(section==='status') return this.summary()
    return this.adapter?.read?.(section,id) ?? {error:'Data section unavailable.'}
  }
  summary() {
    return {...this.state, members:Object.fromEntries(Object.entries(this.state.members).map(([id,m])=>[id,{...m,route:undefined,returnRoute:m.returnRoute?{...m.returnRoute,coords:undefined,cum:undefined,seg:undefined}:null}])),
      badge:'Scenario', oxygenBasis:'litres per astronaut; modeled or operator-entered Scenario values',holdConsumption:'Unavailable: held/rover consumption is not included in the last known value',
      capabilities:Object.keys(schemas),roverAvailable:this.config.roverAvailable}
  }
  execute(args: Record<string, unknown>, id?: string): Promise<Record<string, unknown>> {
    if(id && this.dedup.has(id))return this.dedup.get(id)!
    const result=this.perform(args).catch(e=>({applied:false,error:e instanceof Error?e.message:'Simulation command failed.'}))
    if(id){this.dedup.set(id,result);if(this.dedup.size>128)this.dedup.delete(this.dedup.keys().next().value!)}
    return result
  }
  private async perform(args: Record<string, unknown>): Promise<Record<string,unknown>> {
    const op=String(args.op), allowed=schemas[op]
    if(!allowed || Object.keys(args).some(k=>k!=='op'&&!allowed.includes(k))) throw Error('Unsupported simulation operation or argument.')
    const member=String(args.member??this.state.selectedMember)
    let m=this.state.members[member]
    if(allowed.includes('member') && !m)throw Error('Member unavailable; choose a member from current mission status.')
    if(op==='status')return {applied:true,state:this.summary()}
    if(op==='select_member'){this.state.selectedMember=member;this.emit();return {applied:true,member}}
    if(op==='reset_simulation'){
      this.invalidate();this.state=freshState();for(const id of this.config.members)this.state.members[id]=freshMember()
      this.adapter?.reset();this.emit();return {applied:true,state:this.summary()}
    }
    if(op==='set_rover_status'){
      if(typeof args.available!=='boolean')throw Error('available must be boolean.')
      this.config={...this.config,roverAvailable:args.available}
      if(!args.available)this.state.rover={...this.state.rover,status:'unavailable'}
      else this.state.rover=freshRover()
      this.emit();return {applied:true,state:this.summary()}
    }
    if(op==='set_telemetry'){
      if((args.oxygenL!==undefined)===(args.oxygenPercent!==undefined))throw Error('Provide oxygenL or oxygenPercent, not both.')
      if(m.capacityL===null || m.remainingL===null)throw Error('Load a replay before setting Scenario oxygen telemetry.')
      const value=args.oxygenL??args.oxygenPercent
      const limit=args.oxygenL!==undefined?m.capacityL:100
      if(!finite(value)||value<0||value>limit)throw Error(`Oxygen must be within 0–${limit}.`)
      const litres=args.oxygenL!==undefined?value:value*m.capacityL/100
      if(m.walking && m.returnRoute){
        const route=m.returnRoute, at=route.time_s*Math.min(1,m.walkElapsedMs/30000)
        const p=interpolate(route.coords,route.cum.t_s,at),j=Math.min(p.index+1,route.cum.o2_l.length-1)
        const used=route.cum.o2_l[p.index]+(route.cum.o2_l[j]-route.cum.o2_l[p.index])*p.ratio
        m.walkStartL=litres+used
      }
      m.telemetryOverride={value:litres,baseline:m.rawRemainingL??m.remainingL};m.remainingL=litres
      this.emit()
      if(litres<(m.reserveL??0)+(m.returnRequiredL??0))await this.perform({op:'report_incident',kind:'low_oxygen',member})
      return {applied:true,state:this.summary()}
    }
    if(op==='cancel_rover'){
      this.state.rover.status='cancelled';this.state.message='Pickup cancelled; crew remains held. Choose a return action.'
      this.emit();return {applied:true,state:this.summary()}
    }
    if(op==='clear_incident'){
      if(this.state.rover.member===member && ['en_route','arrived','boarding','returning'].includes(this.state.rover.status))this.state.rover.status='cancelled'
      this.jobs.get(member)?.abort();this.jobs.delete(member)
      m.incident=null;m.incidents=[];m.cannotWalk=false;m.hold=true;m.walking=false;m.returnStatus='idle';m.returnRoute=null;m.error=null
      this.state.message='Incident cleared; held at current position. Reset the simulation to resume the original science replay.'
      this.emit();return {applied:true,state:this.summary()}
    }
    if(op==='play' && this.state.paused){this.state.paused=false;if(!Object.values(this.state.members).some(m=>m.hold||m.incident||m.walking))this.adapter?.play();this.emit();return {applied:true,state:this.summary()}}
    if(op==='play'||op==='seek'){
      if(Object.values(this.state.members).some(v=>v.hold||v.incident))throw Error('Crew is held by an incident/return. Use Start return or reset the simulation.')
      if(!this.adapter)throw Error('Replay is unavailable; open the routes screen.')
      if(op==='seek') {if(!finite(args.seconds)||args.seconds<0)throw Error('seconds must be a nonnegative finite number.');this.adapter.seek(args.seconds)}
      else this.adapter.play()
      return {applied:true,state:this.summary()}
    }
    if(op==='pause'){this.adapter?.pause();this.state.paused=true;this.emit();return {applied:true,state:this.summary()}}
    if(op==='start_return'){
      if(m.cannotWalk)throw Error('This astronaut reported being unable to walk; walking return is disabled.')
      if(['en_route','arrived','boarding','returning'].includes(this.state.rover.status))throw Error('Pickup is active; cancel it before choosing walking return.')
      if(m.phase==='home')throw Error('Astronaut is already at the modeled habitat.')
      if(!m.returnRoute || m.returnStatus!=='ready')throw Error('No complete return route is ready. Request Return home first.')
      this.state.paused=false;m.walking=true;if(m.walkElapsedMs===0)m.walkStartL=m.remainingL;m.consumption='modeled';this.emit();return {applied:true,state:this.summary()}
    }
    if(['report_incident','return_home','dispatch_rover'].includes(op)){
      if(!this.adapter || !m.position || !m.route)throw Error('Current modeled position unavailable. Open routes and load a replay first.')
      if(op==='report_incident' && !['injury','cannot_walk','low_oxygen','oxygen_leak','rover_failure','radiation','cold','daylight'].includes(String(args.kind)))throw Error('Unknown incident kind.')
      this.adapter.pause()
      m=this.state.members[member]
      m.hold=true;m.walking=false;m.consumption='hold consumption unavailable'
      if(op==='report_incident'){const kind=String(args.kind);if(!m.incidents.includes(kind))m.incidents.push(kind);m.cannotWalk=m.cannotWalk||kind==='cannot_walk';m.incident=m.cannotWalk?'cannot_walk':kind}
      this.state.message='Scenario incident: crew held at the current modeled position; current oxygen is the last known value.'
      const needsPickup=op==='dispatch_rover'||(op==='report_incident'&&['injury','cannot_walk'].includes(String(args.kind)))
      if(op==='report_incident'&&args.kind==='rover_failure'){this.config={...this.config,roverAvailable:false};this.state.rover.status='failed'}
      if(needsPickup){const issue=this.dispatch(member);if(issue)this.state.message+=' '+issue}
      this.emit()
      if(op!=='dispatch_rover')await this.requestReturn(member)
      return {applied:true,state:this.summary()}
    }
    if(['drill','clear_drill','set_status_interval'].includes(op)&&Object.values(this.state.members).some(m=>m.hold||m.incident))throw Error('Original replay controls are held. Reset the simulation before changing replay drill/callout intervals.')
    if(!this.adapter?.ui)throw Error('This UI control is unavailable on the current screen.')
    return this.adapter.ui(args)
  }
  private dispatch(member: string) {
    if(['en_route','arrived','boarding','returning'].includes(this.state.rover.status)){
      if(this.state.rover.member!==member)return 'Rover is assigned to another astronaut; return planning continues independently.'
      return
    }
    this.state.paused=false
    const m=this.state.members[member]
    if(!this.config.roverAvailable || !this.config.habitat){this.state.rover={...freshRover(),status:'unavailable',member};return}
    this.state.rover={...freshRover(),status:'en_route',member,position:this.config.habitat,from:this.config.habitat,target:m.position}
  }
  private async requestReturn(member: string) {
    this.jobs.get(member)?.abort()
    const job=new AbortController(), epoch=this.epoch
    this.jobs.set(member,job)
    const m=this.state.members[member], start=m.position!
    m.returnStatus='pending';m.returnRoute=null;m.walkElapsedMs=0;m.walkStartL=null;m.error=null;this.emit()
    try {
      const route=await this.adapter!.returnRoute({...m,position:start},job.signal)
      if(epoch!==this.epoch||job.signal.aborted||this.jobs.get(member)!==job)return
      if(!m.position || m.position.some((v,i)=>v!==start[i]))throw Error('Astronaut position changed during pickup; discard the stale return and request a new one.')
      if(!validReturn(route,start,this.config.slopeCapDeg))throw Error('Incomplete or mismatched native return; no route substituted.')
      m.returnRoute=route;m.returnStatus='ready';m.returnRequiredL=route.oxygen_l
      m.error=m.remainingL!==null && m.remainingL<(m.reserveL??0)+route.oxygen_l?'Modeled return exceeds oxygen above reserve. Pickup does not establish oxygen feasibility.':null
    } catch(e) {
      if(epoch!==this.epoch||job.signal.aborted)return
      m.returnStatus='unavailable';m.returnRoute=null;m.error=e instanceof Error?e.message:'Native return unavailable.'
    }
    if(this.jobs.get(member)===job)this.jobs.delete(member)
    this.emit()
  }
  tick(deltaMs: number) {
    if(this.state.paused||!finite(deltaMs)||deltaMs<=0)return
    let changed=false
    for(const m of Object.values(this.state.members)){
      if(!m.walking||!m.returnRoute)continue
      const route=m.returnRoute;m.walkElapsedMs+=deltaMs
      const f=Math.min(1,m.walkElapsedMs/30000), at=route.time_s*f
      const p=interpolate(route.coords,route.cum.t_s,at)
      const j=Math.min(p.index+1,route.cum.o2_l.length-1), used=route.cum.o2_l[p.index]+(route.cum.o2_l[j]-route.cum.o2_l[p.index])*p.ratio
      m.position=p.point;m.remainingL=m.walkStartL===null?null:Math.max(0,m.walkStartL-used);m.returnRequiredL=Math.max(0,route.oxygen_l-used)
      if(f===1){m.walking=false;m.phase='home'}changed=true
    }
    const r=this.state.rover
    if(['en_route','arrived','boarding','returning'].includes(r.status)&&r.from&&r.target&&r.member){
      r.elapsedMs+=deltaMs
      const m=this.state.members[r.member], t=r.elapsedMs
      if(t<12000){r.status='en_route';r.position=[r.from[0]+(r.target[0]-r.from[0])*t/12000,r.from[1]+(r.target[1]-r.from[1])*t/12000]}
      else if(t<14000){r.status='arrived';r.position=r.target}
      else if(t<16000){r.status='boarding';r.position=r.target}
      else{r.status=t>=28000?'complete':'returning';const f=Math.min(1,(t-16000)/12000);r.position=[r.target[0]+(r.from[0]-r.target[0])*f,r.target[1]+(r.from[1]-r.target[1])*f];if(m){m.position=r.position;m.consumption='rover consumption unavailable';m.returnRoute=null;m.returnStatus='idle';if(f===1){m.phase='home';m.returnRequiredL=0}}}
      changed=true
    }
    if(changed)this.emit()
  }
}
export const missionControl = new MissionControl()
