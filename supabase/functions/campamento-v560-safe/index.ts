const UPSTREAM='https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-v560-fast';
const TZ='America/Santiago';
const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization,content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff'
};
const enc=new TextEncoder();
const CONCURRENCY_EXEMPT=new Set(['snapshot_today','close_day']);
function today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const m=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`}
async function upstream(req:Request,url:string,body?:ArrayBuffer){const h=new Headers();const auth=req.headers.get('authorization');if(auth)h.set('authorization',auth);const ct=req.headers.get('content-type');if(ct)h.set('content-type',ct);const init:any={method:req.method,headers:h};if(req.method!=='GET'&&req.method!=='HEAD'&&body!==undefined)init.body=body;return await fetch(url,init)}
function respond(body:ArrayBuffer,status:number,contentType:string|null,extra:Record<string,string>={}){const h=new Headers({...cors,...extra});h.set('content-type',contentType||'application/json; charset=utf-8');return new Response(body,{status,headers:h})}
function json(data:any,status=200,extra:Record<string,string>={}){const b=enc.encode(JSON.stringify(data));return respond(b.buffer,status,'application/json; charset=utf-8',extra)}
async function currentState(req:Request){const auth=req.headers.get('authorization')||'';const r=await fetch(`${UPSTREAM}?action=advanced_state`,{headers:{authorization:auth}});const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${r.status}`}}return {response:r,data}}
async function claimRevision(req:Request,expected:string){
  const auth=req.headers.get('authorization')||'';
  const q=new URLSearchParams({action:'claim_revision'});if(expected)q.set('expected',expected);
  const r=await fetch(`${UPSTREAM}?${q.toString()}`,{method:'POST',headers:{authorization:auth}});
  const text=await r.text();let data:any;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${r.status}`}}
  return {response:r,data};
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    const u=new URL(req.url),action=u.searchParams.get('action')||'';
    if(req.method==='GET'&&action==='health'){
      const r=await fetch(`${UPSTREAM}?action=health&cid=${encodeURIComponent(u.searchParams.get('cid')||'')}`);
      return respond(await r.arrayBuffer(),r.status,r.headers.get('content-type'));
    }
    const body=req.method!=='GET'&&req.method!=='HEAD'?await req.arrayBuffer():undefined;
    if(req.method==='POST'&&action==='close_day'){
      const s=await currentState(req);
      if(!s.response.ok)return json(s.data,s.response.status);
      const d=today();
      const snap=s.data?.data?.snapshots?.find((x:any)=>String(x?.snapshot_date||'')===d&&String(x?.closed_at||'').trim());
      if(snap)return json({ok:true,data:snap,message:`El día ${d} ya estaba cerrado. Se conserva el cierre histórico sin recalcular.`,state_version:s.data?.state_version||null});
    }
    if(req.method==='POST'&&!CONCURRENCY_EXEMPT.has(action)){
      const c=await claimRevision(req,u.searchParams.get('state_version')||'');
      if(!c.response.ok)return json(c.data,c.response.status,{'x-camp-state-version':String(c.data?.current_state_version||c.data?.state_version||'')});
    }
    const r=await upstream(req,UPSTREAM+u.search,body);
    return respond(await r.arrayBuffer(),r.status,r.headers.get('content-type'));
  }catch(e){console.error(e);return json({ok:false,error:'Error temporal del servidor'},500)}
});
