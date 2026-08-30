import { createClient } from "jsr:@supabase/supabase-js@2";

const RAW='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-v560-raw';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const enc=new TextEncoder();
const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization,content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff'
};

async function cfg(){const {data,error}=await db.from('settings').select('key,value').eq('key','session_secret').maybeSingle();if(error)throw error;return String(data?.value||'')}
async function sign(secret:string,msg:string){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const b=await crypto.subtle.sign('HMAC',k,enc.encode(msg));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function ub64(s:string){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return atob(s)}
async function isAdmin(req:Request){const h=req.headers.get('authorization')||'';if(!h.startsWith('Bearer '))return false;const [p,s]=h.slice(7).split('.');if(!p||!s)return false;try{if(Date.now()>JSON.parse(ub64(p)).exp)return false}catch{return false}const secret=await cfg();return !!secret&&(await sign(secret,p))===s}
function out(x:any,status=200,extra:Record<string,string>={}){return new Response(JSON.stringify(x),{status,headers:{...cors,'content-type':'application/json; charset=utf-8',...extra}})}
function stable(value:any):any{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){const o:any={};for(const k of Object.keys(value).sort())o[k]=stable(value[k]);return o}return value}
async function hashState(data:any){const raw=JSON.stringify(stable(data??null));const b=await crypto.subtle.digest('SHA-256',enc.encode(raw));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32)}
async function concurrencyExtension(){
  const [actions,plan,scenarios]=await Promise.all([
    db.from('operational_actions').select('*').order('id',{ascending:true}).limit(1000),
    db.from('master_plan_events').select('*').order('id',{ascending:true}).limit(1000),
    db.from('what_if_scenarios').select('*').order('id',{ascending:true}).limit(1000)
  ]);
  for(const q of [actions,plan,scenarios])if(q.error)throw q.error;
  return {operational_actions:actions.data??[],master_plan_events:plan.data??[],what_if_scenarios:scenarios.data??[]};
}
function concurrencyProjection(data:any,extra:any){
  return {
    workers:data?.workers??[],inventory:data?.inventory??[],blocks:data?.blocks??[],reservations:data?.reservations??[],movements:data?.movements??[],capacities:data?.capacities??[],settings:data?.settings??{},
    operational_actions:extra?.operational_actions??[],master_plan_events:extra?.master_plan_events??[],what_if_scenarios:extra?.what_if_scenarios??[]
  };
}
async function versionFor(data:any){return await hashState(concurrencyProjection(data,await concurrencyExtension()))}
async function proxy(req:Request,u:URL){
  const h=new Headers();const auth=req.headers.get('authorization');if(auth)h.set('authorization',auth);const ct=req.headers.get('content-type');if(ct)h.set('content-type',ct);
  const init:any={method:req.method,headers:h};if(req.method!=='GET'&&req.method!=='HEAD')init.body=await req.arrayBuffer();
  const r=await fetch(RAW+u.search,init),body=await r.arrayBuffer(),hh=new Headers(cors);hh.set('content-type',r.headers.get('content-type')||'application/json; charset=utf-8');return new Response(body,{status:r.status,headers:hh});
}
async function fallbackState(req:Request,u:URL){
  const h=new Headers();const auth=req.headers.get('authorization');if(auth)h.set('authorization',auth);
  const r=await fetch(RAW+u.search,{method:'GET',headers:h});
  const text=await r.text();let payload:any;try{payload=JSON.parse(text)}catch{payload={ok:false,error:text||`HTTP ${r.status}`}}
  if(r.ok&&payload?.ok&&payload?.data){payload.state_version=await versionFor(payload.data);payload.server_time=new Date().toISOString();payload.state_engine='raw-fallback'}
  return out(payload,r.status,{'x-camp-state-engine':'raw-fallback','x-camp-state-version':String(payload?.state_version||'')});
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    const u=new URL(req.url),action=u.searchParams.get('action')||'';
    if(req.method==='GET'&&action==='health'){
      const started=performance.now();
      const {error}=await db.from('settings').select('key').limit(1);
      if(error)return out({ok:false,status:'degraded',service:'campamento-v560-fast',database:false,server_time:new Date().toISOString()},503);
      return out({ok:true,status:'healthy',service:'campamento-v560-fast',database:true,server_time:new Date().toISOString(),database_ms:Math.round(performance.now()-started)});
    }
    if(req.method==='GET'&&action==='advanced_state'){
      if(!await isAdmin(req))return out({ok:false,error:'No autorizado'},401);
      const started=performance.now();
      const {data,error}=await db.rpc('campamento_state_v2');
      if(error){console.warn('campamento_state_v2 fallback',error.message);return await fallbackState(req,u)}
      const stateVersion=await versionFor(data);
      return out({ok:true,data,state_version:stateVersion,server_time:new Date().toISOString(),state_engine:'v2'},200,{'server-timing':`dbstate;dur=${(performance.now()-started).toFixed(1)}`,'x-camp-state-engine':'v2','x-camp-state-version':stateVersion});
    }
    return await proxy(req,u);
  }catch(e){console.error(e);return out({ok:false,error:'Error temporal del servidor'},500)}
});
