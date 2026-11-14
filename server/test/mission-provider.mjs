/** Deterministic protocol fixture; never loaded by the production server. */
if(process.env.REDSIGHT_TEST_PROVIDER!=='1')throw Error('Explicit test-provider opt-in required.')
const upstream=globalThis.fetch
const endpoint='https://api.groq.com/openai/v1/chat/completions'
globalThis.fetch=async(input,options)=>{
 const url=typeof input==='string'?input:input?.url
 if(url!==endpoint)return upstream(input,options)
 const request=JSON.parse(options.body)
 const lastUser=request.messages.findLastIndex(m=>m.role==='user')
 const turn=request.messages.slice(lastUser)
 const result=turn.findLast(m=>m.role==='tool')
 let chunk
 if(result){
   const value=JSON.parse(result.content)
   chunk={choices:[{delta:{content:`Test provider app acknowledgement: ${JSON.stringify(value)}`},finish_reason:'stop'}]}
 }else{
   const text=String(turn[0]?.content??'').toLowerCase()
   let name='mission_control',args={op:'status'}
   if(text.includes('oxygen')){name='read_app_data';args={section:'oxygen'}}
   if(text.includes('leg'))args={op:'report_incident',kind:'injury',member:'A'}
   if(text.includes('reset'))args={op:'reset_simulation'}
   if(text.includes('send rover'))args={op:'dispatch_rover',member:'A'}
   if(text.includes('return home'))args={op:'return_home',member:'A'}
   chunk={choices:[{delta:{tool_calls:[{index:0,id:'mission-test-call',type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}]}
 }
 return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,{status:200,headers:{'content-type':'text/event-stream'}})
}
