import type { Replay } from '@/replay/replay.js'
let current: Replay | null = null
export function attachReplay(replay: Replay) { current=replay;return ()=>{if(current===replay)current=null} }
export function getReplay() { if(!current)throw Error('Replay unavailable; open Routes and load a route.');return current }
